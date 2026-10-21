// `scripts/migrate` entry: applies backend/migrations/*.sql in order, records SHA-256, refuses changed checksums.
import { resolve } from 'node:path';
import pg from 'pg';
import { migrate } from '../db/migrator';

const dir =
  process.env.MIGRATIONS_DIR ?? resolve(import.meta.dirname, '../../../../backend/migrations');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const r = await migrate(client, dir);
  console.log(JSON.stringify({ ok: true, ...r }));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: (e as Error).message }));
  process.exitCode = 1;
} finally {
  await client.end();
}
