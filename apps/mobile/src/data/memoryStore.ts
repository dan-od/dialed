import type { Mutation, SyncChange, SyncEntity } from '@dialed/contracts';
import { rowId, toLocalData } from './shape';
import { MIRRORED, type LocalData, type LocalStore, type OutboxItem } from './types';

/** Same contract as SQLiteStore, in memory (tests). */
export class MemoryStore implements LocalStore {
  tables = new Map<SyncEntity, Map<string, Record<string, unknown>>>(
    MIRRORED.map((e) => [e, new Map()]),
  );
  meta = new Map<string, string>();
  box: OutboxItem[] = [];
  private seq = 0;

  async init() {}
  private write(changes: SyncChange[]) {
    for (const ch of changes) {
      const t = this.tables.get(ch.entity)!;
      if (ch.op === 'delete') t.delete(rowId(ch));
      else t.set(rowId(ch), structuredClone(ch.row));
    }
  }
  async replaceAll(changes: SyncChange[], revision: number) {
    for (const t of this.tables.values()) t.clear();
    this.write(changes);
    this.meta.set('cursor', String(revision));
  }
  async applyChanges(changes: SyncChange[], revision: number) {
    this.write(changes);
    this.meta.set('cursor', String(revision));
  }
  async upsertRows(changes: SyncChange[]) {
    this.write(changes);
  }
  async load(): Promise<LocalData> {
    const rows = Object.fromEntries(
      MIRRORED.map((e) => [e, [...this.tables.get(e)!.values()]]),
    ) as Record<SyncEntity, Record<string, unknown>[]>;
    return toLocalData(rows);
  }
  async rows(entity: SyncEntity) {
    return [...this.tables.get(entity)!.values()];
  }
  async getRow(entity: SyncEntity, id: string) {
    return this.tables.get(entity)!.get(id) ?? null;
  }
  async cursor() {
    return Number(this.meta.get('cursor') ?? 0);
  }
  async enqueue(m: Mutation) {
    this.box.push({
      seq: ++this.seq,
      mutation: structuredClone(m),
      created_at: new Date().toISOString(),
      attempts: 0,
    });
  }
  async outbox() {
    return [...this.box];
  }
  async removeOutbox(seqs: number[]) {
    this.box = this.box.filter((b) => !seqs.includes(b.seq));
  }
  async getMeta(key: string) {
    return this.meta.get(`pref:${key}`) ?? null;
  }
  async setMeta(key: string, value: string) {
    this.meta.set(`pref:${key}`, value);
  }
  async wipe() {
    for (const t of this.tables.values()) t.clear();
    this.meta.clear();
    this.box = [];
  }
}
