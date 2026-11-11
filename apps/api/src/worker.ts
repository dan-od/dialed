// Worker process (BACKEND_SETUP §8): Postgres job table with FOR UPDATE SKIP LOCKED leases.
import { writeFileSync } from 'node:fs';
import { loadConfig } from './config';
import { createDb } from './db/pool';
import { enqueueNightly } from './glance/activities';
import { createHandlers } from './jobs/handlers';

const config = loadConfig();
const { pool, db } = createDb(config.DATABASE_URL);
let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});

const logger = (obj: Record<string, unknown>) => console.log(JSON.stringify(obj));
const handlers = createHandlers({ db, config, now: () => new Date(), log: logger });
const HANDLERS: Record<string, (payload: unknown) => Promise<void>> = { ...handlers };

let lastNightlyCheck = 0;
while (!stopping) {
  // Liveness for the compose healthcheck (infra/docker-compose.yml).
  try {
    writeFileSync('/tmp/dialed-worker.alive', String(Date.now()));
  } catch {
    // not fatal: only the healthcheck reads it
  }
  // Flow 08: nightly la.schedule at 03:00 local, checked once a minute (deduped per user per night).
  if (Date.now() - lastNightlyCheck >= 60_000) {
    lastNightlyCheck = Date.now();
    await enqueueNightly(db, new Date()).catch((e: Error) =>
      logger({ kind: 'la.nightly', msg: 'failed', error: e.message.slice(0, 200) }),
    );
  }
  const { rows } = await pool.query<{
    id: number;
    kind: string;
    payload_json: unknown;
    attempts: number;
  }>(`
    update jobs set status = 'running', lease_until = now() + interval '60 seconds', attempts = attempts + 1
    where id = (select id from jobs where status in ('queued','failed') and run_at <= now()
                order by run_at for update skip locked limit 1)
    returning id, kind, payload_json, attempts`);
  const job = rows[0];
  if (!job) {
    await new Promise((r) => setTimeout(r, 2000));
    continue;
  }
  const handler = HANDLERS[job.kind];
  try {
    if (!handler) throw new Error(`no handler for ${job.kind}`);
    await handler(job.payload_json);
    await pool.query(`update jobs set status = 'done', lease_until = null where id = $1`, [job.id]);
  } catch (e) {
    const dead = job.attempts >= 5;
    await pool.query(
      `update jobs set status = $2, lease_until = null, last_error = $3,
       run_at = now() + (least(power(2, attempts), 60) || ' seconds')::interval where id = $1`,
      [job.id, dead ? 'dead' : 'failed', (e as Error).message.slice(0, 500)],
    );
  }
}
await pool.end();
