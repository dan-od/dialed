// The prod smoke-test account (infra/homelab/README.md "Go-live"): owner@dialed.test with the seed's routine,
// terms, categories and overrides only — no alice/bob, no plans — and a random password printed once.
// It is the one seed user allowed in production, because its password is never the public DEV_PASSWORD.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import { hashPassword } from '../auth/passwords';

export const TEST_OWNER_EMAIL = 'owner@dialed.test';
const OWNER_ID = 'c5610ac2-5ae9-57cd-9cd6-a9e11adb97a6';
const PLACEHOLDER = "'DEV_ONLY_SET_BY_SEED_SCRIPT'";
const TABLES = [
  'users',
  'revisions',
  'categories',
  'terms',
  'routines',
  'routine_blocks',
  'overrides',
];
/** Monday the seed's Fall term starts. */
const SEED_TERM_START = Date.UTC(2037, 8, 14);
const DAY = 86_400_000;

/** Whole weeks to move the seed so today falls in week 5 of its Fall term (weekdays stay put). */
export function seedShiftDays(now: Date): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return (Math.floor((today - SEED_TERM_START) / (7 * DAY)) - 4) * 7;
}

const shiftDate = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

export async function createTestOwner(client: pg.ClientBase, seedFile: string, now = new Date()) {
  const password = randomBytes(18).toString('base64url'); // 24 chars
  const passwordHash = await hashPassword(password);
  const days = seedShiftDays(now);
  const statements = readFileSync(seedFile, 'utf8')
    .split('\n')
    .filter((l) => {
      const table = /^INSERT INTO ([a-z_]+)\(/.exec(l)?.[1];
      return table !== undefined && TABLES.includes(table) && l.includes(`'${OWNER_ID}'`);
    })
    .map((l) =>
      l
        .replaceAll(PLACEHOLDER, `'${passwordHash}'`)
        .replace(/'(\d{4}-\d{2}-\d{2})'/g, (_m, d: string) => `'${shiftDate(d, days)}'`),
    );
  if (!statements.some((s) => s.startsWith('INSERT INTO users('))) {
    throw new Error('Seed file has no test owner row');
  }

  await client.query('BEGIN');
  try {
    const exists = await client.query('select 1 from users where id = $1 or email = $2', [
      OWNER_ID,
      TEST_OWNER_EMAIL,
    ]);
    if (exists.rowCount) throw new Error(`${TEST_OWNER_EMAIL} already exists; delete it first`);
    for (const s of statements) await client.query(s);
    const counts = await countOwned(client, OWNER_ID);
    await client.query('COMMIT');
    return { email: TEST_OWNER_EMAIL, password, counts };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function countOwned(client: pg.ClientBase, id: string): Promise<Record<string, number>> {
  const owned = [
    'sessions',
    'email_codes',
    'devices',
    'revisions',
    'categories',
    'terms',
    'routines',
    'routine_blocks',
    'overrides',
    'plans',
    'change_log',
    'mutation_receipts',
    'live_activities',
    'category_merges',
    'usage_counters',
    'audit_log',
    'oauth_codes',
    'oauth_tokens',
    'apple_identities',
  ];
  const sql = `select ${owned
    .map((t) => `(select count(*)::int from ${t} where user_id = $1) as ${t}`)
    .join(', ')}, (select count(*)::int from plan_changes pc join plans p on p.id = pc.plan_id
      where p.user_id = $1) as plan_changes, (select count(*)::int from plan_messages pm join plans p on
      p.id = pm.plan_id where p.user_id = $1) as plan_messages`;
  return (await client.query<Record<string, number>>(sql, [id])).rows[0]!;
}

/** Deletes the test owner and everything it owns in one transaction; other users are untouched. */
export async function deleteTestOwner(client: pg.ClientBase) {
  await client.query('BEGIN');
  try {
    const u = await client.query<{ id: string }>(
      'select id from users where email = $1 or id = $2 for update',
      [TEST_OWNER_EMAIL, OWNER_ID],
    );
    if (!u.rowCount) {
      await client.query('ROLLBACK');
      return { deleted: false, counts: {} as Record<string, number> };
    }
    const ids = u.rows.map((r) => r.id);
    const counts: Record<string, number> = {};
    for (const id of ids) {
      for (const [k, v] of Object.entries(await countOwned(client, id)))
        counts[k] = (counts[k] ?? 0) + v;
    }
    // Connector clients only this account used (dynamic registration has no owner column).
    const clients = await client.query(
      `delete from oauth_clients c where exists (
         select 1 from oauth_tokens t where t.client_id = c.id and t.user_id = any($1)
         union all select 1 from oauth_codes o where o.client_id = c.id and o.user_id = any($1))
       and not exists (
         select 1 from oauth_tokens t where t.client_id = c.id and t.user_id <> all($1)
         union all select 1 from oauth_codes o where o.client_id = c.id and o.user_id <> all($1))`,
      [ids],
    );
    counts.oauth_clients = clients.rowCount ?? 0;
    // audit_log is ON DELETE SET NULL and jobs carry user_id in the payload: remove both explicitly.
    await client.query('delete from audit_log where user_id = any($1)', [ids]);
    const jobs = await client.query(`delete from jobs where payload_json->>'user_id' = any($1)`, [
      ids.map(String),
    ]);
    counts.jobs = jobs.rowCount ?? 0;
    const inv = await client.query('delete from invites where email = $1', [TEST_OWNER_EMAIL]);
    counts.invites = inv.rowCount ?? 0;
    const users = await client.query('delete from users where id = any($1)', [ids]);
    counts.users = users.rowCount ?? 0;
    await client.query('COMMIT');
    return { deleted: true, counts };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}
