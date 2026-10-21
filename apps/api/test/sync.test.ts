import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALICE, BOB_PROBE_BLOCK, login, makeApp, OWNER, type TestApp } from './helpers';

let t: TestApp;
let owner: Awaited<ReturnType<typeof login>>;
let alice: Awaited<ReturnType<typeof login>>;
beforeAll(async () => {
  t = await makeApp();
  owner = await login(t, OWNER.email);
  alice = await login(t, ALICE.email);
});
afterAll(async () => {
  await t.close();
});

const auth = (s: { access_token: string }) => ({ authorization: `Bearer ${s.access_token}` });
const pull = (s: { access_token: string }, q = 'since=0') =>
  t.app.inject({ method: 'GET', url: `/v1/sync/pull?${q}`, headers: auth(s) });
const push = (s: { access_token: string }, mutations: object[]) =>
  t.app.inject({ method: 'POST', url: '/v1/sync/push', headers: auth(s), payload: { mutations } });

async function fullSnapshot(s: { access_token: string }) {
  const changes: { entity: string; row: Record<string, unknown> }[] = [];
  let cursor: string | undefined;
  let revision: number;
  for (;;) {
    const r = await pull(
      s,
      `since=0&limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.snapshot).toBe(true);
    changes.push(...b.changes);
    revision = b.revision;
    if (!b.more) break;
    cursor = b.cursor;
  }
  return { changes, revision };
}

describe('GET /v1/sync/pull', () => {
  it('401 without a token', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/v1/sync/pull?since=0' });
    expect(r.statusCode).toBe(401);
    expect(r.json().error.code).toBe('unauthorized');
  });

  it("since=0 returns the full owner snapshot, paged, only the owner's rows", async () => {
    const { changes } = await fullSnapshot(owner);
    const count = (e: string) => changes.filter((c) => c.entity === e).length;
    expect(count('routine_block')).toBe(59);
    expect(count('override')).toBe(12);
    expect(count('category')).toBe(9);
    expect(count('term')).toBe(3);
    expect(count('routine')).toBe(3);
    expect(count('profile')).toBe(1);
    const prof = changes.find((c) => c.entity === 'profile')!.row;
    expect(prof).toMatchObject({ display_name: 'Owner', day_start_min: 450 });
    expect(prof).not.toHaveProperty('password_hash');
    expect(JSON.stringify(changes)).not.toContain('Bob probe');
    expect(changes.every((c) => !('user_id' in c.row))).toBe(true);
  });

  it('incremental pull returns only newer change_log rows; future cursor → resync_required', async () => {
    const { revision } = await fullSnapshot(alice);
    const empty = (await pull(alice, `since=${revision}`)).json();
    expect(empty).toMatchObject({ changes: [], more: false, snapshot: false, revision });
    const r = await pull(alice, `since=${revision + 1000}`);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('resync_required');
  });
});

describe('POST /v1/sync/push', () => {
  it('applies a profile change, bumps revision, and pull returns it; duplicate id returns the stored receipt', async () => {
    const before = (await pull(alice)).json().revision;
    const snap = await fullSnapshot(alice);
    const version = Number(snap.changes.find((c) => c.entity === 'profile')!.row.version);
    const m = {
      client_mutation_id: randomUUID(),
      entity: 'profile',
      op: 'upsert',
      base_version: version,
      fields: { theme: 'light' },
    };
    const r = await push(alice, [m]);
    expect(r.statusCode).toBe(200);
    const res = r.json().results[0];
    expect(res.status).toBe('applied');
    expect(r.json().revision).toBeGreaterThan(before);
    const inc = (await pull(alice, `since=${before}`)).json();
    expect(inc.changes).toEqual([
      expect.objectContaining({
        entity: 'profile',
        op: 'upsert',
        row: expect.objectContaining({ theme: 'light' }),
      }),
    ]);
    const again = await push(alice, [m]);
    expect(again.json().results[0]).toEqual(res);
  });

  it('stale base_version → conflict with the current row, nothing applied', async () => {
    const m = {
      client_mutation_id: randomUUID(),
      entity: 'profile',
      op: 'upsert',
      base_version: 1,
      fields: { theme: 'dark' },
    };
    const r = (await push(alice, [m])).json().results[0];
    expect(r.status).toBe('conflict');
    expect(r.row.theme).toBe('light');
  });

  it("cross-object: alice editing bob's routine block → rejected not_found, bob's row unchanged", async () => {
    const m = {
      client_mutation_id: randomUUID(),
      entity: 'routine_block_edit',
      block_id: BOB_PROBE_BLOCK,
      base_version: 1,
      effective_from: '2099-01-05',
      fields: { title: 'pwned' },
    };
    const r = (await push(alice, [m])).json().results[0];
    expect(r).toMatchObject({ status: 'rejected', error_code: 'not_found' });
    const row = await t.pool.query('select title from routine_blocks where id = $1', [
      BOB_PROBE_BLOCK,
    ]);
    expect(row.rows[0].title).toBe('Bob probe block');
  });

  it("cross-object: alice adding an override on bob's block → rejected not_found", async () => {
    const id = randomUUID();
    const m = {
      client_mutation_id: randomUUID(),
      entity: 'override',
      op: 'upsert',
      id,
      base_version: 0,
      fields: { on_date: '2026-10-19', kind: 'skip', routine_block_id: BOB_PROBE_BLOCK },
    };
    const r = (await push(alice, [m])).json().results[0];
    expect(r).toMatchObject({ status: 'rejected', error_code: 'not_found' });
    expect(
      (await t.pool.query('select count(*)::int as n from overrides where id = $1', [id])).rows[0]
        .n,
    ).toBe(0);
  });

  it('owner adds a one-off block, then deletes it (soft)', async () => {
    const id = randomUUID();
    const cat = '82972f34-0c7e-5bbf-986d-3373a76f187f';
    const add = (
      await push(owner, [
        {
          client_mutation_id: randomUUID(),
          entity: 'override',
          op: 'upsert',
          id,
          base_version: 0,
          fields: {
            on_date: '2026-10-24',
            kind: 'add',
            title: 'Pitch prep',
            start_min: 600,
            end_min: 660,
            category_id: cat,
          },
        },
      ])
    ).json().results[0];
    expect(add.status).toBe('applied');
    expect(add.row.version).toBe(1);
    const del = (
      await push(owner, [
        { client_mutation_id: randomUUID(), entity: 'override', op: 'delete', id, base_version: 1 },
      ])
    ).json().results[0];
    expect(del.status).toBe('applied');
    expect(del.row.deleted_at).not.toBeNull();
  });

  it('routine_block_edit closes the old row and inserts a new one from the effective date (past days unchanged)', async () => {
    const block = 'a08ddb9c-fbbf-5a84-ab41-2ff8258693d7'; // Mon Sermon Sync
    const r = (
      await push(owner, [
        {
          client_mutation_id: randomUUID(),
          entity: 'routine_block_edit',
          block_id: block,
          base_version: 1,
          effective_from: '2026-11-02',
          fields: { start_min: 780 },
        },
      ])
    ).json().results[0];
    expect(r.status).toBe('applied');
    const rows = await t.pool.query(
      'select id, start_min, effective_from, effective_to from routine_blocks where id = $1 or (title = $2 and weekday = 0 and effective_from = $3)',
      [block, 'Sermon Sync', '2026-11-02'],
    );
    const old = rows.rows.find((x) => x.id === block)!;
    expect(old).toMatchObject({ start_min: 760, effective_to: '2026-11-02' });
    expect(rows.rows.find((x) => x.id !== block)).toMatchObject({
      start_min: 780,
      effective_from: '2026-11-02',
      effective_to: null,
    });
  });

  it('rejects past effective dates and invalid times', async () => {
    const block = '44c8dab0-989c-50c9-9d88-352bf96bf71a';
    const past = (
      await push(owner, [
        {
          client_mutation_id: randomUUID(),
          entity: 'routine_block_edit',
          block_id: block,
          base_version: 1,
          effective_from: '2020-01-06',
          fields: { title: 'x' },
        },
      ])
    ).json().results[0];
    expect(past).toMatchObject({ status: 'rejected', error_code: 'bad_request' });
    const bad = await push(owner, [
      {
        client_mutation_id: randomUUID(),
        entity: 'override',
        op: 'upsert',
        id: randomUUID(),
        base_version: 0,
        fields: {
          on_date: '2026-10-24',
          kind: 'add',
          title: 'x',
          start_min: 601,
          end_min: 660,
          category_id: randomUUID(),
        },
      },
    ]);
    expect(bad.statusCode).toBe(400);
  });
});
