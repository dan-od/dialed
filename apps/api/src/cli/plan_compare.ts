// Owner-run model comparison (D-123, plans/planning-context.md §9): the same requests against the same
// schedule context, once per model, through the real in-app loop. Prints one row per run and writes the
// drafts to /tmp/dialed-plan-compare/. Stores nothing in the database; calls the Anthropic API (costs money).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { localNow } from '@dialed/schedule';
import {
  buildContext,
  createAnthropicProvider,
  PLAN_TOOL_SCHEMAS,
  READ_TOOL_SCHEMAS,
  runPlan,
  type ToolContext,
} from '@dialed/planning';
import { createDb } from '../db/pool';
import { assetRoot } from '../lib/assets';
import { loadScheduleData } from '../plans/runner';
import { renderGuide } from '../mcp/guide';

const DEFAULT_REQUESTS = [
  'Free up tomorrow afternoon.',
  'Add gym three mornings a week.',
  'Move my Friday Speedwatch work to Saturday evening.',
  'I have an exam on Thursday. Give me two extra study blocks before it.',
  'Skip prayers this Sunday.',
];
const OUT_DIR = '/tmp/dialed-plan-compare';

type Row = Record<string, unknown>;

async function main() {
  const args = process.argv.slice(2);
  const models = args.filter((a) => !a.startsWith('--'));
  const flag = (name: string) =>
    args
      .find((a) => a.startsWith(`--${name}=`))
      ?.split('=')
      .slice(1)
      .join('=');
  const email = flag('email') ?? 'owner@dialed.test';
  const requestsFile = flag('requests');
  const requests = requestsFile
    ? readFileSync(requestsFile, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    : DEFAULT_REQUESTS;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!models.length || !apiKey || !process.env.DATABASE_URL) {
    throw new Error('Needs at least one model, ANTHROPIC_API_KEY and DATABASE_URL.');
  }

  const { pool, db } = createDb(process.env.DATABASE_URL);
  try {
    const {
      rows: [user],
    } =
      await db.execute<Row>(sql`select id, display_name, profile_json, time_zone, day_start_min, day_end_min,
      quiet_start_min, quiet_end_min from users where email = ${email}`);
    if (!user) throw new Error(`No user ${email}.`);
    const userId = String(user.id);
    const {
      rows: [rev],
    } = await db.execute<Row>(sql`select revision from revisions where user_id = ${userId}`);
    const timeZone = String(user.time_zone);
    const ctx: ToolContext = {
      data: await loadScheduleData(db, userId),
      today: localNow(new Date(), timeZone).date,
      source: 'in_app',
      revision: rev ? Number(rev.revision) : 0,
      timeZone,
      profile: {
        day_start_min: Number(user.day_start_min),
        day_end_min: Number(user.day_end_min),
        quiet_start_min: Number(user.quiet_start_min),
        quiet_end_min: Number(user.quiet_end_min),
      },
    };
    const context = buildContext(ctx);
    const guide = renderGuide(
      readFileSync(join(assetRoot(), 'mcp', 'planning-guide.md'), 'utf8'),
      user,
    );
    console.log(
      `${email} · ${ctx.today} · context ~${context.tokens} tokens · ${requests.length} requests\n`,
    );

    mkdirSync(OUT_DIR, { recursive: true });
    const header = ['model', 'request', 'status', 'turns', 'invalid', 'changes', 'in', 'out', 'ms'];
    const rows: string[][] = [];
    for (const model of models) {
      const drafts: unknown[] = [];
      for (const request of requests) {
        let turns = 0;
        let invalid = 0;
        const started = Date.now();
        const result = await runPlan({
          provider: createAnthropicProvider({ apiKey, model }),
          guide,
          request,
          history: [],
          toolSchemas: [...PLAN_TOOL_SCHEMAS, ...READ_TOOL_SCHEMAS],
          ctx,
          context,
          limits: { maxTokens: Number(process.env.PLAN_MAX_TOKENS ?? 8192) },
          onStep: (s) => {
            if (s.kind === 'call') turns++;
            if (s.kind === 'validate_error') invalid++;
          },
        });
        const ms = Date.now() - started;
        drafts.push({ request, ms, turns, invalid, ...result });
        rows.push([
          model,
          request.length > 32 ? `${request.slice(0, 31)}…` : request,
          result.status,
          String(turns),
          String(invalid),
          String(result.status === 'ready' ? result.changes.length : 0),
          String(result.tokensIn),
          String(result.tokensOut),
          String(ms),
        ]);
      }
      writeFileSync(join(OUT_DIR, `${model}.json`), JSON.stringify(drafts, null, 2));
    }

    const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
    const line = (r: string[]) => r.map((c, i) => c.padEnd(widths[i]!)).join('  ');
    console.log(line(header));
    for (const r of rows) console.log(line(r));
    console.log(`\nDrafts: ${OUT_DIR}/<model>.json`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
