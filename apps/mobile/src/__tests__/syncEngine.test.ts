import type { Mutation, MutationResult, PullResponse, SyncChange } from '@dialed/contracts';
import { resolveDay } from '@dialed/schedule';
import { ApiError } from '../api/errors';
import { MemoryStore } from '../data/memoryStore';
import { SyncEngine, type SyncApi, type SyncEvents } from '../sync/engine';

const CAT = {
  id: 'c1',
  name: 'Sermon Sync',
  group_name: 'Projects',
  color_dark: '#FF5A1F',
  color_light: '#E8480F',
  weight: 1,
  quiet: false,
  protected: false,
  sort: 0,
  version: 1,
  deleted_at: null,
};
const TERM = {
  id: 't1',
  name: 'Fall term',
  starts_on: '2026-09-14',
  ends_on: '2026-12-11',
  is_draft: false,
  version: 1,
  deleted_at: null,
};
const ROUTINE = { id: 'r1', term_id: 't1', name: 'Fall term', version: 1 };
const BLOCK = {
  id: 'b1',
  routine_id: 'r1',
  weekday: 0,
  start_min: 760,
  end_min: 870,
  title: 'Sermon Sync',
  category_id: 'c1',
  effective_from: '2026-09-14',
  effective_to: null,
  version: 1,
  deleted_at: null,
};
const PROFILE = {
  display_name: 'Owner',
  time_zone: 'America/Toronto',
  day_start_min: 450,
  day_end_min: 1440,
  quiet_start_min: 0,
  quiet_end_min: 450,
  week_start: 0,
  theme: 'system',
  version: 1,
};

/** Fake server that follows the sync protocol closely enough to drive the engine. */
class FakeServer implements SyncApi {
  online = true;
  revision = 5;
  rows: SyncChange[] = [
    { entity: 'profile', op: 'upsert', row: PROFILE },
    { entity: 'category', op: 'upsert', row: CAT },
    { entity: 'term', op: 'upsert', row: TERM },
    { entity: 'routine', op: 'upsert', row: ROUTINE },
    { entity: 'routine_block', op: 'upsert', row: BLOCK },
  ];
  log: SyncChange[][] = [];
  receipts = new Map<string, MutationResult>();
  pushes = 0;
  async pull(since: number, cursor?: string): Promise<PullResponse> {
    if (!this.online) throw new ApiError('offline', 'offline');
    if (since === 0) {
      const start = cursor ? Number(cursor) : 0;
      const page = this.rows.slice(start, start + 2);
      const more = start + 2 < this.rows.length;
      return {
        revision: this.revision,
        changes: page,
        more,
        snapshot: true,
        ...(more ? { cursor: String(start + 2) } : {}),
      };
    }
    if (since > this.revision) throw new ApiError('resync_required', 'resync');
    const changes = this.log.slice(since - 5).flat();
    return { revision: this.revision, changes, more: false, snapshot: false };
  }
  async push(mutations: Mutation[]) {
    if (!this.online) throw new ApiError('offline', 'offline');
    this.pushes++;
    const results = mutations.map((m): MutationResult => {
      const seen = this.receipts.get(m.client_mutation_id);
      if (seen) return seen;
      let r: MutationResult;
      if (m.entity === 'profile') {
        const cur = this.rows[0]!.row as typeof PROFILE;
        if (m.base_version !== cur.version)
          r = {
            client_mutation_id: m.client_mutation_id,
            status: 'conflict',
            entity: 'profile',
            row: cur,
          };
        else {
          const next = { ...cur, ...m.fields, version: cur.version + 1 };
          this.rows[0] = { entity: 'profile', op: 'upsert', row: next };
          this.revision++;
          this.log.push([{ entity: 'profile', op: 'upsert', row: next }]);
          r = {
            client_mutation_id: m.client_mutation_id,
            status: 'applied',
            entity: 'profile',
            row: next,
            revision: this.revision,
          };
        }
      } else
        r = {
          client_mutation_id: m.client_mutation_id,
          status: 'rejected',
          error_code: 'not_found',
          message: 'That isn’t available.',
        };
      this.receipts.set(m.client_mutation_id, r);
      return r;
    });
    return { revision: this.revision, results };
  }
}

function events() {
  const e = {
    changed: jest.fn(),
    status: jest.fn(),
    synced: jest.fn(),
    conflict: jest.fn(),
    rejected: jest.fn(),
  } satisfies SyncEvents;
  return e;
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const theme = (n: number, base: number, value: 'light' | 'dark'): Mutation => ({
  client_mutation_id: uuid(n),
  entity: 'profile',
  op: 'upsert',
  base_version: base,
  fields: { theme: value },
});

describe('SyncEngine', () => {
  afterEach(() => jest.useRealTimers());

  it('first sync pulls the paged since=0 snapshot into the store and Day resolves offline from it', async () => {
    const store = new MemoryStore();
    const server = new FakeServer();
    const ev = events();
    const engine = new SyncEngine(store, server, ev);
    await engine.start();
    expect(engine.status.hasData).toBe(false);
    await engine.sync();
    expect(await store.cursor()).toBe(5);
    expect(engine.status.hasData).toBe(true);
    server.online = false; // offline from here on
    const data = await store.load();
    expect(resolveDay('2026-10-19', data.schedule).blocks.map((b) => b.title)).toEqual([
      'Sermon Sync',
    ]);
    expect(data.profile?.day_start_min).toBe(450);
    engine.stop();
  });

  it('offline edit is visible at once, queued, and sent in order when back online', async () => {
    jest.useFakeTimers();
    const store = new MemoryStore();
    const server = new FakeServer();
    const ev = events();
    const engine = new SyncEngine(store, server, ev, () => 0.5);
    await engine.sync();
    server.online = false;
    await engine.enqueue(theme(1, 1, 'light'));
    await engine.sync();
    expect((await store.load()).profile?.theme).toBe('light');
    expect(engine.status).toMatchObject({ pending: 1, problem: 'offline' });
    server.online = true;
    await engine.sync();
    expect(engine.status).toMatchObject({ pending: 0, problem: null });
    expect(ev.synced).toHaveBeenCalledWith(1);
    expect((await store.load()).profile).toMatchObject({ theme: 'light', version: 2 });
    engine.stop();
  });

  it('pending edits survive a pull (rebased on top) until the server answers', async () => {
    const store = new MemoryStore();
    const server = new FakeServer();
    const engine = new SyncEngine(store, server, events());
    await engine.sync();
    // another device changes the name; the server hasn't processed our queued theme edit yet
    server.rows[0] = {
      entity: 'profile',
      op: 'upsert',
      row: { ...PROFILE, display_name: 'Renamed', version: 2 },
    };
    server.log.push([server.rows[0]]);
    server.revision++;
    jest.spyOn(server, 'push').mockResolvedValue({ revision: server.revision, results: [] });
    await engine.enqueue(theme(2, 2, 'dark'));
    await engine.sync();
    expect((await store.load()).profile).toMatchObject({ display_name: 'Renamed', theme: 'dark' });
    expect(engine.status.pending).toBe(1);
    engine.stop();
  });

  it('server errors pause sync and keep the edit queued', async () => {
    const store = new MemoryStore();
    const server = new FakeServer();
    const engine = new SyncEngine(store, server, events());
    await engine.sync();
    jest.spyOn(server, 'push').mockRejectedValue(new ApiError('server_error', 'down', 500));
    await engine.enqueue(theme(6, 1, 'dark'));
    await engine.sync();
    expect(engine.status).toMatchObject({ problem: 'paused', pending: 1 });
    expect((await store.load()).profile?.theme).toBe('dark');
    engine.stop();
  });

  it('stale edit → conflict event with the server row applied; Reapply re-queues against the new version', async () => {
    const store = new MemoryStore();
    const server = new FakeServer();
    const ev = events();
    const engine = new SyncEngine(store, server, ev);
    await engine.sync();
    // another device changes the profile first
    await server.push([theme(3, 1, 'dark')]);
    await engine.enqueue(theme(4, 1, 'light'));
    await engine.sync();
    expect(ev.conflict).toHaveBeenCalledTimes(1);
    expect((await store.load()).profile?.theme).toBe('dark');
    await ev.conflict.mock.calls[0]![0].reapply();
    await engine.sync();
    expect((await store.load()).profile).toMatchObject({ theme: 'light', version: 3 });
    engine.stop();
  });

  it('duplicate sends are idempotent (same client_mutation_id → same receipt)', async () => {
    const server = new FakeServer();
    const m = theme(5, 1, 'light');
    const a = await server.push([m]);
    const b = await server.push([m]);
    expect(b.results[0]).toEqual(a.results[0]);
  });

  it('resync_required falls back to a full snapshot', async () => {
    const store = new MemoryStore();
    const server = new FakeServer();
    const engine = new SyncEngine(store, server, events());
    store.meta.set('cursor', '999');
    await engine.sync();
    expect(await store.cursor()).toBe(5);
    expect((await store.load()).schedule.routineBlocks).toHaveLength(1);
    engine.stop();
  });
});
