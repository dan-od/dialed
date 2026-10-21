import { readFileSync } from 'node:fs';
import { hash } from '@node-rs/argon2';
import type pg from 'pg';
import { ARGON2_OPTIONS } from '../auth/passwords';

export const DEV_PASSWORD = 'dialed-dev-password';
const PLACEHOLDER = 'DEV_ONLY_SET_BY_SEED_SCRIPT';

/** Dev-only invite so the email sign-up path can be exercised with SIGNUP_MODE=invite. */
export const DEV_INVITE_EMAIL = 'newplanner@dialed.test';

/** Runs backend/seed/0001_seed.sql with a fresh argon2id hash of the dev password (idempotent: fixed UUIDs + ON CONFLICT). */
export async function seed(client: pg.ClientBase, seedFile: string, nodeEnv: string) {
  if (nodeEnv === 'production') throw new Error('Refusing to seed dev users in production');
  const devHash = await hash(DEV_PASSWORD, ARGON2_OPTIONS);
  const sql = readFileSync(seedFile, 'utf8').replaceAll(`'${PLACEHOLDER}'`, `'${devHash}'`);
  await client.query(sql);
  await client.query('INSERT INTO invites(email) VALUES ($1) ON CONFLICT DO NOTHING', [
    DEV_INVITE_EMAIL,
  ]);
  const counts = await client.query<Record<string, number>>(`select
    (select count(*)::int from routine_blocks) as routine_blocks, (select count(*)::int from overrides) as overrides,
    (select count(*)::int from categories) as categories, (select count(*)::int from users) as users,
    (select count(*)::int from plans) as plans`);
  return counts.rows[0]!;
}
