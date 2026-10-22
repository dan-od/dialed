import type { Mutation, MutationResult, PullResponse, SyncChange } from '@dialed/contracts';
import { randomUUID } from 'expo-crypto';
import { ApiError } from '../api/errors';
import { localEffects, mutationTarget } from '../data/shape';
import type { LocalStore } from '../data/types';

export interface SyncApi {
  pull(since: number, cursor?: string): Promise<PullResponse>;
  push(mutations: Mutation[]): Promise<{ revision: number; results: MutationResult[] }>;
}

export interface SyncStatus {
  pending: number;
  syncing: boolean;
  /** `offline` = no network; `paused` = server unreachable or erroring (pill "Sync paused"). */
  problem: 'offline' | 'paused' | null;
  /** Has a full copy ever been pulled on this device? */
  hasData: boolean;
}

export interface SyncEvents {
  changed(): void;
  status(s: SyncStatus): void;
  synced(appliedCount: number): void;
  conflict(info: { title: string; reapply: () => Promise<void> }): void;
  rejected(info: { message: string }): void;
}

const MAX_BACKOFF = 60_000;

/**
 * Offline-first sync (BACKEND_SETUP §4): optimistic local writes into an outbox, FIFO push with
 * idempotency keys, then pull (snapshot when the cursor is 0 or the server asks for resync).
 */
export class SyncEngine {
  private running: Promise<void> | null = null;
  private again = false;
  private backoff = 1000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private st: SyncStatus = { pending: 0, syncing: false, problem: null, hasData: false };

  constructor(
    private readonly store: LocalStore,
    private readonly api: SyncApi,
    private readonly events: SyncEvents,
    private readonly random: () => number = Math.random,
  ) {}

  get status() {
    return this.st;
  }

  private setStatus(p: Partial<SyncStatus>) {
    this.st = { ...this.st, ...p };
    this.events.status(this.st);
  }

  async start() {
    const [cursor, box] = await Promise.all([this.store.cursor(), this.store.outbox()]);
    this.setStatus({ hasData: cursor > 0, pending: box.length });
  }

  /** Queue an edit: visible at once on this phone, sent when online. */
  async enqueue(m: Mutation) {
    const effects = await localEffects(m, (e, id) => this.store.getRow(e, id));
    if (effects.length) await this.store.upsertRows(effects);
    await this.store.enqueue(m);
    this.setStatus({ pending: (await this.store.outbox()).length });
    this.events.changed();
    void this.sync();
  }

  /** Single-flight: a call during a run schedules one more run. */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.runOnce();
      } while (this.again);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runOnce() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    // "Synced N changes." is for catching up after being offline or paused, not for every quiet push.
    const catchingUp = this.st.problem !== null;
    this.setStatus({ syncing: true });
    try {
      const applied = await this.flush();
      await this.pull();
      this.backoff = 1000;
      this.setStatus({
        syncing: false,
        problem: null,
        pending: (await this.store.outbox()).length,
      });
      if (applied > 0 && catchingUp) this.events.synced(applied);
    } catch (e) {
      const offline = e instanceof ApiError && e.code === 'offline';
      if (e instanceof ApiError && e.code === 'unauthorized') {
        this.setStatus({ syncing: false });
        return; // session ended; nothing to retry
      }
      this.setStatus({ syncing: false, problem: offline ? 'offline' : 'paused' });
      const wait = Math.min(MAX_BACKOFF, this.backoff) * (0.8 + this.random() * 0.4);
      this.backoff = Math.min(MAX_BACKOFF, this.backoff * 2);
      this.retryTimer = setTimeout(() => void this.sync(), wait);
    }
  }

  /** Push the outbox in order (≤100 per request). Returns how many mutations were applied. */
  private async flush(): Promise<number> {
    let applied = 0;
    for (;;) {
      const box = (await this.store.outbox()).slice(0, 100);
      if (!box.length) return applied;
      const { results } = await this.api.push(box.map((b) => b.mutation));
      const done: number[] = [];
      const serverRows: SyncChange[] = [];
      for (const item of box) {
        const r = results.find((x) => x.client_mutation_id === item.mutation.client_mutation_id);
        if (!r) continue;
        done.push(item.seq);
        if (r.status === 'applied') {
          applied++;
          if (r.row && r.entity)
            serverRows.push({ entity: r.entity as SyncChange['entity'], op: 'upsert', row: r.row });
        } else if (r.status === 'conflict') {
          if (r.row && r.entity)
            serverRows.push({ entity: r.entity as SyncChange['entity'], op: 'upsert', row: r.row });
          this.events.conflict({
            title: titleOf(item.mutation, r.row),
            reapply: () => this.reapply(item.mutation),
          });
        } else {
          this.events.rejected({ message: r.message ?? 'That change couldn’t be saved.' });
        }
      }
      if (serverRows.length) await this.store.upsertRows(serverRows);
      await this.store.removeOutbox(done);
      this.setStatus({ pending: (await this.store.outbox()).length });
      if (done.length < box.length) return applied; // server skipped some: retry later via pull/flush
    }
  }

  /** Reapply after a conflict: same edit against the row's current version, new idempotency key. */
  private async reapply(m: Mutation) {
    const target = mutationTarget(m);
    const row = target ? await this.store.getRow(target.entity, target.id) : null;
    const base = Number(row?.version ?? 0);
    await this.enqueue({ ...m, client_mutation_id: randomUUID(), base_version: base } as Mutation);
  }

  private async pull() {
    let since = await this.store.cursor();
    let snapshot: SyncChange[] = [];
    let cursor: string | undefined;
    for (;;) {
      let page: PullResponse;
      try {
        page = await this.api.pull(since, cursor);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'resync_required') {
          since = 0;
          snapshot = [];
          cursor = undefined;
          continue;
        }
        throw e;
      }
      if (page.snapshot) {
        snapshot.push(...page.changes);
        if (page.more) {
          cursor = page.cursor;
          continue;
        }
        await this.store.replaceAll(snapshot, page.revision);
        await this.rebasePending();
        this.setStatus({ hasData: true });
        this.events.changed();
        return;
      }
      if (page.changes.length) {
        await this.store.applyChanges(page.changes, page.revision);
        await this.rebasePending();
        this.events.changed();
      } else if (page.revision !== since) {
        await this.store.applyChanges([], page.revision);
      }
      if (!page.more) return;
      since = page.revision;
    }
  }

  /** Pending edits stay on top of pulled rows until the server answers. */
  private async rebasePending() {
    for (const item of await this.store.outbox()) {
      const effects = await localEffects(item.mutation, (e, id) => this.store.getRow(e, id));
      if (effects.length) await this.store.upsertRows(effects);
    }
  }

  stop() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }
}

function titleOf(m: Mutation, row: Record<string, unknown> | null | undefined): string {
  if (row && typeof row.title === 'string') return row.title;
  if (row && typeof row.name === 'string') return row.name;
  if (m.entity === 'profile') return 'Your settings';
  return 'That block';
}
