// Worker process (BACKEND_SETUP §8): Postgres job table with FOR UPDATE SKIP LOCKED leases.
// Job kinds (la.*, push.*, account.purge, uploads.sweep) land with their flows; this loop only leases and logs today.
import { loadConfig } from './config';
import { createDb } from './db/pool';

const config = loadConfig();
const { pool } = createDb(config.DATABASE_URL);
let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});

const HANDLERS: Record<string, (payload: unknown) => Promise<void>> = {};

while (!stopping) {
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
