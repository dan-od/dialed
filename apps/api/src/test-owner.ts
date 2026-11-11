// Usage (home lab): docker compose run --rm api node dist/test-owner.js create|delete
// create: owner@dialed.test with the seed routine and a random password printed once. delete: removes it all.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { createTestOwner, deleteTestOwner } from './ops/testOwner';

const cmd = process.argv[2];
if (cmd !== 'create' && cmd !== 'delete') {
  console.error('Usage: node dist/test-owner.js create|delete');
  process.exit(2);
}
// Image layout: /app/dist/test-owner.js and /app/backend/seed; repo layout: apps/api/{src,dist}.
const seedFile =
  process.env.SEED_FILE ??
  [
    resolve(import.meta.dirname, '../backend/seed/0001_seed.sql'),
    resolve(import.meta.dirname, '../../../backend/seed/0001_seed.sql'),
  ].find((p) => existsSync(p));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  if (cmd === 'create') {
    if (!seedFile) throw new Error('Seed file not found (set SEED_FILE)');
    const r = await createTestOwner(client, seedFile);
    console.log(`Created ${r.email}. Password (shown once, store it now): ${r.password}`);
    console.log(JSON.stringify({ ok: true, counts: r.counts }));
  } else {
    const r = await deleteTestOwner(client);
    console.log(
      r.deleted ? 'Deleted the test owner and everything it owned.' : 'No test owner to delete.',
    );
    console.log(JSON.stringify({ ok: true, counts: r.counts }));
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await client.end();
}
