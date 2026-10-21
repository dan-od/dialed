import { resolve } from 'node:path';
import pg from 'pg';
import { seed } from '../db/seeder';

const file = resolve(import.meta.dirname, '../../../../backend/seed/0001_seed.sql');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  console.log(
    JSON.stringify({
      ok: true,
      counts: await seed(client, file, process.env.NODE_ENV ?? 'development'),
    }),
  );
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: (e as Error).message }));
  process.exitCode = 1;
} finally {
  await client.end();
}
