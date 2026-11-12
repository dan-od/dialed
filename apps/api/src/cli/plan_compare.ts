// Owner-run model comparison (D-123, plans/planning-context.md §9): the same requests against the same
// schedule context, once per model, through the real in-app loop. Prints one row per run and writes the
// drafts to /tmp/dialed-plan-compare/. Stores nothing in the database; calls the Anthropic API (costs money).
import { createHash } from 'node:crypto';
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
  type RunPlanResult,
  type ToolContext,
} from '@dialed/planning';
import { createDb } from '../db/pool';
import { assetRoot } from '../lib/assets';
import { loadScheduleData } from '../plans/runner';
import { renderGuide } from '../mcp/guide';

const DEFAULT_REQUESTS = [
  'Free up tomorrow',
  'Free up tomorrow morning => everything before 12',
  'Add gym three mornings a week.',
  'Move my Friday Speedwatch work to Saturday evening.',
  'Skip prayers this Sunday.',
];
const OUT_DIR = '/tmp/dialed-plan-compare';

type Row = Record<string, unknown>;

/** What a run decided, ignoring wording (titles, notes): equal signatures mean the same plan. */
function signature(result: RunPlanResult): string {
  if (result.status === 'ready') {
    const keyed = result.changes
      .map((c) => {
        const rest = { ...(c as Record<string, unknown>) };
        delete rest.title;
        delete rest.note;
        return JSON.stringify(rest, Object.keys(rest).sort());
      })
      .sort();
    return createHash('sha256').update(keyed.join('|')).digest('hex').slice(0, 8);
  }
  return result.status === 'failed' ? `failed:${result.code}` : result.status;
}

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
  const repeat = Number(flag('repeat') ?? 1);
  // Unset, empty or "default": no temperature sent (the model's default).
  const temperatureFlag = (flag('temperature') ?? process.env.PLAN_TEMPERATURE ?? '').trim();
  const temperature =
    temperatureFlag === '' || temperatureFlag === 'default' ? undefined : Number(temperatureFlag);
  const requestsFile = flag('requests');
  // One request per line; "request => answer => answer" replays answers to the model's questions.
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
      today: flag('today') ?? localNow(new Date(), timeZone).date,
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
      `${email} · today ${ctx.today} · context ~${context.tokens} tokens · temperature ${temperature ?? 'default'} · ${requests.length} requests × ${repeat}\n`,
    );

    mkdirSync(OUT_DIR, { recursive: true });
    const header = [
      'model',
      'request',
      '#',
      'status',
      'runs',
      'turns',
      'invalid',
      'rules',
      'changes',
      'in',
      'ms',
      'plan',
    ];
    const rows: string[][] = [];
    const summary: string[] = [];
    for (const model of models) {
      const drafts: unknown[] = [];
      for (const line of requests) {
        const [request, ...answers] = line.split('=>').map((x) => x.trim());
        const sigs: string[] = [];
        for (let n = 1; n <= repeat; n++) {
          const history: { role: 'user' | 'assistant'; content: string }[] = [];
          let turns = 0;
          let invalid = 0;
          let tokensIn = 0;
          let runs = 0;
          const rules = new Set<string>();
          const started = Date.now();
          let result: RunPlanResult;
          for (;;) {
            runs++;
            result = await runPlan({
              provider: createAnthropicProvider({ apiKey, model }),
              guide,
              request: request!,
              history,
              toolSchemas: [...PLAN_TOOL_SCHEMAS, ...READ_TOOL_SCHEMAS],
              ctx,
              context,
              temperature,
              limits: { maxTokens: Number(process.env.PLAN_MAX_TOKENS ?? 8192) },
              onStep: (s) => {
                if (s.kind === 'call') turns++;
                if (s.kind === 'validate_error') {
                  invalid++;
                  for (const e of s.errors ?? []) rules.add(e.code);
                }
              },
            });
            tokensIn += result.tokensIn;
            if (result.status === 'question' && answers[runs - 1]) {
              history.push({ role: 'assistant', content: result.question });
              history.push({ role: 'user', content: answers[runs - 1]! });
              continue;
            }
            break;
          }
          const ms = Date.now() - started;
          const sig = signature(result);
          sigs.push(sig);
          drafts.push({
            request: line,
            n,
            ms,
            runs,
            turns,
            invalid,
            rules: [...rules],
            history,
            ...result,
          });
          rows.push([
            model,
            line.length > 34 ? `${line.slice(0, 33)}…` : line,
            String(n),
            result.status === 'failed' ? `failed:${result.code}` : result.status,
            String(runs),
            String(turns),
            String(invalid),
            [...rules].join(',') || '-',
            String(result.status === 'ready' ? result.changes.length : 0),
            String(tokensIn),
            String(ms),
            sig,
          ]);
        }
        if (repeat > 1) {
          const same = sigs.every((x) => x === sigs[0]);
          summary.push(
            `${model} · ${line}: ${same ? 'same plan every run' : `differs (${sigs.join(' ')})`}`,
          );
        }
      }
      writeFileSync(join(OUT_DIR, `${model}.json`), JSON.stringify(drafts, null, 2));
    }

    const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
    const fmt = (r: string[]) => r.map((c, i) => c.padEnd(widths[i]!)).join('  ');
    console.log(fmt(header));
    for (const r of rows) console.log(fmt(r));
    if (summary.length) console.log(`\n${summary.join('\n')}`);
    console.log(`\nruns = plan runs (a question + answer is 2); turns = model calls in total.`);
    console.log(`Drafts: ${OUT_DIR}/<model>.json`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
