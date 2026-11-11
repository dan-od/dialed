import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assetRoot } from '../lib/assets';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { localNow, type IsoDate, type ScheduleData } from '@dialed/schedule';
import {
  getSchedule,
  listCategories,
  listTerms,
  scheduleRangeError,
  validate,
  type PlanningContext,
  type ToolContext,
  type ValidateProfile,
} from '@dialed/planning';
import type { PlanChange, PlanCheck } from '@dialed/contracts';
import type { Db } from '../db/pool';
import type { Config } from '../config';
import type { OAuthService } from '../oauth/service';
import { enqueue } from '../jobs/enqueue';
import { renderGuide } from './guide';
import { contextFor } from '../plans/context-cache';

type Row = Record<string, unknown>;

const MCP_CALL_LIMIT = 60;
const MCP_DRAFT_DAILY_LIMIT = 20;

// Per-token rate counter (in-process)
const tokenCalls = new Map<string, number[]>();

function checkTokenRate(tokenHash: string): boolean {
  const now = Date.now();
  const hits = (tokenCalls.get(tokenHash) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  tokenCalls.set(tokenHash, hits);
  return hits.length <= MCP_CALL_LIMIT;
}

export function mountMcp(
  app: FastifyInstance,
  db: Db,
  config: Config,
  oauth: OAuthService,
  now: () => Date,
) {
  const guideTemplate = loadGuideTemplate();

  // Helper to load schedule data for a user
  async function loadScheduleData(userId: string): Promise<ScheduleData> {
    const q = async (query: ReturnType<typeof sql>) => (await db.execute<Row>(query)).rows;
    return {
      categories: (await q(sql`select * from categories where user_id = ${userId}`)).map((c) => ({
        ...c,
        weight: Number(c.weight),
      })),
      terms: await q(sql`select * from terms where user_id = ${userId}`),
      routines: await q(sql`select * from routines where user_id = ${userId}`),
      routineBlocks: await q(sql`select * from routine_blocks where user_id = ${userId}`),
      overrides: await q(sql`select * from overrides where user_id = ${userId}`),
    } as unknown as ScheduleData;
  }

  async function getUserProfile(userId: string) {
    const {
      rows: [u],
    } = await db.execute<Row>(
      sql`select time_zone, day_start_min, day_end_min, quiet_start_min, quiet_end_min, display_name, profile_json from users where id = ${userId}`,
    );
    return u;
  }

  async function getRevision(userId: string): Promise<number> {
    const {
      rows: [r],
    } = await db.execute<Row>(sql`select revision from revisions where user_id = ${userId}`);
    return r ? Number(r.revision) : 0;
  }

  async function planningCtx(userId: string): Promise<{ ctx: ToolContext }> {
    const [data, user, revision] = await Promise.all([
      loadScheduleData(userId),
      getUserProfile(userId),
      getRevision(userId),
    ]);
    const timeZone = user ? String(user.time_zone) : 'America/Toronto';
    const profile: ValidateProfile | undefined = user
      ? {
          day_start_min: Number(user.day_start_min),
          day_end_min: Number(user.day_end_min),
          quiet_start_min: Number(user.quiet_start_min),
          quiet_end_min: Number(user.quiet_end_min),
        }
      : undefined;
    return {
      ctx: { data, today: localNow(now(), timeZone).date, source: 'mcp', revision, timeZone, profile },
    };
  }

  // One MCP server per request, bound to the verified caller. A shared server reconnected per request
  // is the SDK's cross-client leak pattern (GHSA advisory fixed in 1.26) and throws on reconnect since 1.2x.
  type McpCaller = { userId: string; clientId: string; clientName: string };
  const createMcpServer = (caller: McpCaller) => {
    // Every read is audited as ai:<client> (Flow 07 actions table; SECURITY.md audit log).
    const auditRead = (toolName: string) =>
      db.execute(sql`insert into audit_log (user_id, actor, action, target)
        values (${caller.userId}, ${'ai:' + caller.clientId}, 'mcp_read', ${toolName})`);
    const mcpServer = new McpServer(
      { name: 'dialed', version: '0.1.0' },
      {
        instructions:
          "Dialed manages one person's weekly schedule. Read the resource dialed://planning-guide before planning. " +
          'Tools only read the schedule or create drafts. Nothing changes until the person taps Approve in the Dialed app ' +
          '— tell them their plan is ready to review there.',
      },
    );

    // Resource: planning guide
    mcpServer.resource(
      'planning-guide',
      'dialed://planning-guide',
      {
        description: 'How to turn a request into proposed schedule changes for this user.',
        mimeType: 'text/markdown',
      },
      async (uri) => {
        const userId = caller.userId;
        if (!userId) return { contents: [{ uri: uri.href, text: guideTemplate }] };
        const user = await getUserProfile(userId);
        const text = user ? renderGuide(guideTemplate, user) : guideTemplate;
        return { contents: [{ uri: uri.href, text }] };
      },
    );

    // Prompt: plan_schedule
    // Prompt args use `as any` to bridge the MCP SDK's bundled Zod with the project's Zod.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mcpServer.prompt as any)(
      'plan_schedule',
      'Turn a plain-language request into proposed changes.',
      { request: z.string() },
      async (args: { request: string }) => {
        const userId = caller.userId;
        let guide = guideTemplate;
        if (userId) {
          const user = await getUserProfile(userId);
          if (user) guide = renderGuide(guideTemplate, user);
        }
        return {
          messages: [
            {
              role: 'user' as const,
              content: { type: 'text' as const, text: `${guide}\n\n---\nRequest: ${args.request}` },
            },
          ],
        };
      },
    );

    // Tool: get_context — the same planning context the in-app engine preloads (D-123)
    mcpServer.registerTool(
      'get_context',
      {
        description:
          'Your schedule for today and the next 14 days, one line per block, plus terms, categories and ' +
          'limits. Use its short refs (b1, c2, t1) in propose_changes and pass its context_id. Call this first.',
        inputSchema: {},
      },
      async () => {
        await auditRead('get_context');
        const { ctx } = await planningCtx(caller.userId);
        const context = contextFor(caller.userId, ctx);
        return {
          content: [{ type: 'text' as const, text: `${context.text}\n\ncontext_id ${contextId(context)}` }],
        };
      },
    );

    // Tool: list_terms
    mcpServer.registerTool(
      'list_terms',
      { description: 'All terms with dates and status.', inputSchema: {} },
      async () => {
        await auditRead('list_terms');
        const { ctx } = await planningCtx(caller.userId);
        return jsonText(listTerms(ctx.data, ctx.today));
      },
    );

    // Tool: get_schedule
    mcpServer.registerTool(
      'get_schedule',
      {
        description:
          "Resolved days (routine + one-off changes) for an inclusive date range, in the user's time zone. " +
          'get_context already covers today and the next 14 days.',
        inputSchema: { from: z.string(), to: z.string() },
      },
      async (args) => {
        await auditRead('get_schedule');
        const bad = scheduleRangeError(String(args.from), String(args.to));
        if (bad) return { ...jsonText(bad), isError: true };
        const { ctx } = await planningCtx(caller.userId);
        return jsonText(getSchedule(ctx.data, String(args.from), String(args.to), ctx));
      },
    );

    // Tool: list_categories
    mcpServer.registerTool(
      'list_categories',
      {
        description: 'Every category with its group, colour and usual block length.',
        inputSchema: {},
      },
      async () => {
        await auditRead('list_categories');
        const { ctx } = await planningCtx(caller.userId);
        return jsonText(listCategories(ctx.data));
      },
    );

    // Tool: get_recent_plans
    mcpServer.registerTool(
      'get_recent_plans',
      { description: 'The last 10 planning requests.', inputSchema: {} },
      async () => {
        const userId = caller.userId;
        await auditRead('get_recent_plans');
        const { rows: plans } = await db.execute<Row>(sql`
        select p.id, p.created_at, p.source, p.client_name, p.request_text, p.status
        from plans p where p.user_id = ${userId}
        order by p.created_at desc limit 10`);

        const result = [];
        for (const p of plans) {
          const { rows: changes } = await db.execute<Row>(sql`
          select kind, title, note from plan_changes where plan_id = ${String(p.id)} order by ord`);
          result.push({
            id: String(p.id),
            created_at: String(p.created_at),
            source: String(p.source),
            client_name: p.client_name ? String(p.client_name) : null,
            request_text: String(p.request_text),
            status: String(p.status),
            changes: changes.map((c) => ({
              kind: String(c.kind),
              title: String(c.title),
              summary: String(c.note),
            })),
          });
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify({ plans: result }) }] };
      },
    );

    // Tool: propose_changes
    mcpServer.registerTool(
      'propose_changes',
      {
        description:
          'Send a proposal for the user to review in the app. Does NOT change the schedule. ' +
          'Returns validation errors if a change breaks a rule. Use the same proposal_id to revise.',
        inputSchema: {
          proposal_id: z.string().uuid().optional(),
          request_text: z.string().min(1).max(4000),
          context_id: z.string().max(64).optional(),
          changes: z.array(z.record(z.string(), z.unknown())).min(1).max(25),
          checks: z
            .array(z.object({ id: z.string(), passed: z.boolean(), detail: z.string() }))
            .optional(),
        },
      },
      async (args) => {
        const userId = caller.userId;
        const clientId = caller.clientId;
        const clientName = caller.clientName || clientId;

        // Daily draft limit
        const today = localNow(now(), 'UTC').date;
        const {
          rows: [usage],
        } = await db.execute<Row>(sql`
        select mcp_drafts from usage_counters
        where user_id = ${userId} and day = ${today}`);
        if (usage && Number(usage.mcp_drafts) >= MCP_DRAFT_DAILY_LIMIT) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  status: 'error',
                  errors: [
                    {
                      change_index: -1,
                      code: 'daily_limit',
                      message: `Maximum ${MCP_DRAFT_DAILY_LIMIT} drafts per day per client.`,
                    },
                  ],
                }),
              },
            ],
            isError: true,
          };
        }

        const { ctx: pctx } = await planningCtx(userId);
        const { data, revision, profile } = pctx;
        const context = contextFor(userId, pctx);

        const rawChanges = args.changes as PlanChange[];
        const checks = (args.checks ?? []) as PlanCheck[];

        // Refs are only meaningful against the context they came from.
        if (args.context_id && args.context_id !== contextId(context) && usesShortRefs(rawChanges)) {
          return jsonText({
            proposal_id: args.proposal_id ?? null,
            status: 'invalid',
            errors: [
              {
                change_index: -1,
                code: 'context_stale',
                message: 'The schedule changed since get_context. Call it again and use the new refs.',
              },
            ],
            review_hint: null,
          });
        }

        const result = validate(
          { request_text: args.request_text as string, changes: rawChanges },
          { data, today: today as IsoDate, source: 'mcp', profile, refs: context.refs },
        );
        const changes = result.changes;

        if (result.errors.length > 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  proposal_id: args.proposal_id ?? null,
                  status: 'invalid',
                  errors: result.errors,
                  review_hint: null,
                }),
              },
            ],
          };
        }

        // Store the plan
        const { randomUUID } = await import('node:crypto');
        const proposalId = args.proposal_id ?? randomUUID();

        // Check for existing plan with this proposal_id
        if (args.proposal_id) {
          const {
            rows: [existing],
          } = await db.execute<Row>(sql`
          select id, status from plans
          where user_id = ${userId} and proposal_id = ${args.proposal_id}::uuid`);

          if (existing) {
            if (String(existing.status) === 'approved' || String(existing.status) === 'discarded') {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify({
                      status: 'error',
                      errors: [
                        {
                          change_index: -1,
                          code: 'plan_not_ready',
                          message:
                            'That plan was already decided. Start a new one without proposal_id.',
                        },
                      ],
                    }),
                  },
                ],
                isError: true,
              };
            }

            // Revise existing plan
            await db.execute(sql`delete from plan_changes where plan_id = ${String(existing.id)}`);
            for (let i = 0; i < changes.length; i++) {
              const c = changes[i]!;
              const { kind, title, note, ...rest } = c as PlanChange & { note: string };
              await db.execute(sql`insert into plan_changes
              (id, plan_id, ord, kind, title, payload_json, note, enabled)
              values (${randomUUID()}, ${String(existing.id)}, ${i}, ${kind}, ${title},
                ${JSON.stringify(rest)}::jsonb, ${note ?? ''}, true)`);
            }
            await db.execute(sql`update plans set
            status = 'ready', version = version + 1, checks_json = ${JSON.stringify(result.checks.length > 0 ? result.checks : checks)}::jsonb,
            ready_at = now(), request_text = ${args.request_text}
            where id = ${String(existing.id)}`);

            // Push notification
            await enqueueChatDraft(
              db,
              String(existing.id),
              userId,
              clientName,
              changes.length,
              data,
            );

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    proposal_id: proposalId,
                    status: 'ready',
                    errors: [],
                    review_hint: 'Ready to review in Dialed.',
                  }),
                },
              ],
            };
          }
        }

        // Create new plan
        const planId = randomUUID();
        const baseRevision = revision;

        await db.execute(sql`insert into plans
        (id, user_id, source, provider, client_name, request_text, status, base_revision,
         provider_mode, proposal_id, version, checks_json, ready_at)
        values (${planId}, ${userId}, 'mcp', ${clientId},
          ${clientName}, ${args.request_text}, 'ready', ${baseRevision},
          'server', ${proposalId}::uuid, 1, ${JSON.stringify(result.checks.length > 0 ? result.checks : checks)}::jsonb, now())`);

        for (let i = 0; i < changes.length; i++) {
          const c = changes[i]!;
          const { kind, title, note, ...rest } = c as PlanChange & { note: string };
          await db.execute(sql`insert into plan_changes
          (id, plan_id, ord, kind, title, payload_json, note, enabled)
          values (${randomUUID()}, ${planId}, ${i}, ${kind}, ${title},
            ${JSON.stringify(rest)}::jsonb, ${note ?? ''}, true)`);
        }

        await db.execute(sql`insert into audit_log (user_id, actor, action, target)
        values (${userId}, ${'ai:' + clientId}, 'mcp_propose', ${planId})`);

        // Increment draft counter
        await db.execute(sql`
        insert into usage_counters (user_id, day, mcp_drafts)
        values (${userId}, ${today}, 1)
        on conflict (user_id, day) do update set mcp_drafts = usage_counters.mcp_drafts + 1`);

        // Push notification
        await enqueueChatDraft(db, planId, userId, clientName, changes.length, data);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                proposal_id: proposalId,
                status: 'ready',
                errors: [],
                review_hint: 'Ready to review in Dialed.',
              }),
            },
          ],
        };
      },
    );

    return mcpServer;
  };

  // RFC 9728 / MCP authorization: every 401 points the client at the protected-resource metadata.
  const unauthorized = (reply: FastifyReply, message: string) =>
    reply
      .code(401)
      .header(
        'www-authenticate',
        `Bearer resource_metadata="${config.PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`,
      )
      .send({ error: { code: 'unauthorized', message, retryable: false } });

  // Mount the Streamable HTTP transport on /mcp
  app.all('/mcp', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!config.MCP_ENABLED) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'MCP is not enabled.' } });
    }

    // Authenticate the MCP token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return unauthorized(reply, 'Bearer token required.');
    }
    const token = authHeader.slice(7);

    let claims: { userId: string; clientId: string; scope: string; clientName: string };
    try {
      claims = await oauth.verifyAccessToken(token);
    } catch {
      return unauthorized(reply, 'Invalid or expired token.');
    }

    // Rate limit per token
    const tokenHash = (await import('node:crypto'))
      .createHash('sha256')
      .update(token)
      .digest('hex');
    if (!checkTokenRate(tokenHash)) {
      return reply
        .code(429)
        .send({ error: { code: 'rate_limited', message: 'Too many calls. Wait a minute.' } });
    }

    // Create a transport for this request
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    const nodeReq = req.raw;
    const nodeRes = reply.raw;

    const mcpServer = createMcpServer({
      userId: claims.userId,
      clientId: claims.clientId,
      clientName: claims.clientName,
    });
    nodeRes.on('close', () => {
      void transport.close();
      void mcpServer.close();
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(nodeReq, nodeRes, req.body as Record<string, unknown>);
    } catch {
      if (!reply.sent) {
        return reply
          .code(500)
          .send({ error: { code: 'server_error', message: 'MCP transport error.' } });
      }
    }

    // Prevent Fastify from sending a second response
    return reply;
  });
}

async function enqueueChatDraft(
  db: Db,
  planId: string,
  userId: string,
  clientName: string,
  changeCount: number,
  data: ScheduleData,
) {
  // Find the term name for the notification copy
  const terms = (data as unknown as { terms: Row[] }).terms;
  const termName = terms.length > 0 ? String(terms[0]!.name) : 'your schedule';

  await enqueue(
    db,
    'push.chat_draft',
    {
      plan_id: planId,
      user_id: userId,
      client_name: clientName,
      change_count: changeCount,
      term_name: termName,
    },
    { dedupeKey: `chat_draft:${planId}` },
  );
}

function loadGuideTemplate(): string {
  return readFileSync(join(assetRoot(), 'mcp', 'planning-guide.md'), 'utf8');
}

const jsonText = (obj: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(obj) }] });

/** Identifies the exact context a client planned from: refs shift when the revision or the day changes. */
const contextId = (c: PlanningContext) => `${c.revision}.${c.from}`;

function usesShortRefs(changes: PlanChange[]): boolean {
  return /"(block_ref|category_id|term_id)":"[bct]\d+"/.test(JSON.stringify(changes));
}
