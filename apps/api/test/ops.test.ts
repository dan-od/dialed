// Ops commands for the home lab: dist/invite.js and dist/test-owner.js (infra/homelab/README.md).
// Runs on its own database (migrated, not seeded) so create/delete see a clean slate.
import { resolve } from 'node:path';
import { verify } from '@node-rs/argon2';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { migrate } from '../src/db/migrator';
import { DEV_PASSWORD } from '../src/db/seeder';
import { inviteEmail } from '../src/ops/invite';
import { createTestOwner, deleteTestOwner, TEST_OWNER_EMAIL } from '../src/ops/testOwner';
import { makeApp } from './helpers';
import { testDatabaseUrl } from './globalSetup';

const ROOT = resolve(import.meta.dirname, '../../..');
const SEED = resolve(ROOT, 'backend/seed/0001_seed.sql');
const OTHER = 'a0000000-0000-4000-8000-000000000001';
let c: pg.Client;

beforeAll(async () => {
  const url = new URL(testDatabaseUrl());
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const a = new pg.Client({ connectionString: admin.toString() });
  await a.connect();
  await a.query('DROP DATABASE IF EXISTS dialed_ops_test WITH (FORCE)');
  await a.query('CREATE DATABASE dialed_ops_test');
  await a.end();
  url.pathname = '/dialed_ops_test';
  c = new pg.Client({ connectionString: url.toString() });
  await c.connect();
  await migrate(c, resolve(ROOT, 'backend/migrations'));
  // A real user who must survive the test owner's create/delete.
  await c.query(
    `insert into users(id, email, email_verified_at, password_hash, display_name) values ($1, 'friend@example.com', now(), 'x', 'Friend')`,
    [OTHER],
  );
  await c.query(
    `insert into terms(user_id, name, starts_on, ends_on) values ($1, 'T', '2026-09-01', '2026-12-20')`,
    [OTHER],
  );
  await c.query(
    `insert into categories(user_id, name, group_name, color_dark, color_light) values ($1, 'Work', 'Work', '#000000', '#000000')`,
    [OTHER],
  );
});

afterAll(async () => {
  await c?.end();
});

describe('invite', () => {
  it('invites once, then reports it is already invited', async () => {
    expect(await inviteEmail(c, '  Me@Example.com ')).toEqual({
      email: 'me@example.com',
      result: 'invited',
    });
    expect(await inviteEmail(c, 'me@example.com')).toEqual({
      email: 'me@example.com',
      result: 'already_invited',
    });
    const { rows } = await c.query('select count(*)::int as n from invites where email = $1', [
      'me@example.com',
    ]);
    expect(rows[0].n).toBe(1);
  });
  it('reports an existing account without inviting it', async () => {
    expect(await inviteEmail(c, 'friend@example.com')).toEqual({
      email: 'friend@example.com',
      result: 'already_registered',
    });
  });
  it('refuses a malformed email', async () => {
    await expect(inviteEmail(c, 'not-an-email')).rejects.toThrow(/email/i);
  });
});

describe('test owner', () => {
  const now = new Date('2026-11-11T15:00:00Z');

  it('creates only owner@dialed.test with the seed routine, verified, with a random password', async () => {
    const r = await createTestOwner(c, SEED, now);
    expect(r.email).toBe(TEST_OWNER_EMAIL);
    expect(r.password.length).toBeGreaterThanOrEqual(20);
    expect(r.counts.routine_blocks).toBeGreaterThan(0);
    expect(r.counts.categories).toBeGreaterThan(0);
    expect(r.counts.terms).toBe(3);
    const { rows } = await c.query(
      `select email, email_verified_at, password_hash from users order by email`,
    );
    expect(rows.map((u) => u.email)).toEqual(['friend@example.com', TEST_OWNER_EMAIL]);
    const owner = rows.find((u) => u.email === TEST_OWNER_EMAIL);
    expect(owner.email_verified_at).not.toBeNull();
    expect(await verify(owner.password_hash, r.password)).toBe(true);
    expect(await verify(owner.password_hash, DEV_PASSWORD)).toBe(false);
    expect(await c.query('select 1 from plans').then((q) => q.rowCount)).toBe(0);
  });

  it('moves the routine so the Fall term covers today, keeping weekdays', async () => {
    const { rows } = await c.query<{ starts_on: string; ends_on: string; dow: number }>(
      `select starts_on::text, ends_on::text, extract(isodow from starts_on)::int as dow from terms t join users u on u.id = t.user_id
       where u.email = $1 and t.name = 'Fall term'`,
      [TEST_OWNER_EMAIL],
    );
    const t = rows[0]!;
    expect(t.dow).toBe(1); // the seed term starts on a Monday
    expect(t.starts_on <= '2026-11-11' && t.ends_on >= '2026-11-11').toBe(true);
  });

  it('refuses a second create', async () => {
    await expect(createTestOwner(c, SEED, now)).rejects.toThrow(/already exists/);
  });

  it('delete removes the owner and everything it owns, and leaves other users alone', async () => {
    const owner = (await c.query(`select id from users where email = $1`, [TEST_OWNER_EMAIL]))
      .rows[0].id;
    // Rows the app would add while smoke testing: a session, a device, usage, a plan, a connector.
    await c.query(
      `insert into sessions(user_id, family_id, refresh_token_hash, expires_at) values ($1, gen_random_uuid(), 'h', now() + interval '1 day')`,
      [owner],
    );
    await c.query(
      `insert into usage_counters(user_id, day, plan_runs) values ($1, current_date, 1)`,
      [owner],
    );
    await c.query(
      `insert into oauth_clients(id, name, redirect_uris) values ('dialed_probe', 'probe', '{https://x/cb}')`,
    );
    await c.query(
      `insert into oauth_tokens(client_id, user_id, access_token_hash, scope, expires_at) values ('dialed_probe', $1, 'a', 's', now())`,
      [owner],
    );
    await c.query(`insert into audit_log(user_id, actor, action) values ($1, 'user', 'probe')`, [
      owner,
    ]);

    const r = await deleteTestOwner(c);
    expect(r.deleted).toBe(true);
    expect(r.counts.users).toBe(1);
    expect(r.counts.routine_blocks).toBeGreaterThan(0);
    expect(r.counts.oauth_clients).toBe(1);
    expect(r.counts.usage_counters).toBe(1);

    const left = await c.query(
      `select
      (select count(*)::int from users where id = $1) as owner,
      (select count(*)::int from routine_blocks where user_id = $1) as blocks,
      (select count(*)::int from audit_log where user_id is null) as orphan_audit,
      (select count(*)::int from oauth_clients) as clients,
      (select count(*)::int from users where id = $2) as friend,
      (select count(*)::int from terms where user_id = $2) as friend_terms,
      (select count(*)::int from categories where user_id = $2) as friend_categories,
      (select count(*)::int from invites) as invites`,
      [owner, OTHER],
    );
    expect(left.rows[0]).toEqual({
      owner: 0,
      blocks: 0,
      orphan_audit: 0,
      clients: 0,
      friend: 1,
      friend_terms: 1,
      friend_categories: 1,
      invites: 1,
    });
  });

  it('delete is a no-op when there is no test owner, and create works again after it', async () => {
    expect((await deleteTestOwner(c)).deleted).toBe(false);
    await createTestOwner(c, SEED, now);
    await deleteTestOwner(c);
  });
});

describe('DEV_PASSWORD in production', () => {
  it('is never accepted at sign-in when NODE_ENV=production', async () => {
    const t = await makeApp({ NODE_ENV: 'production' });
    try {
      const r = await t.app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: 'alice@dialed.test', password: DEV_PASSWORD },
      });
      expect(r.statusCode).toBe(401);
    } finally {
      await t.close();
    }
  });
});
