import type { Mutation, SyncChange, SyncEntity } from '@dialed/contracts';
import * as SQLite from 'expo-sqlite';
import { rowId, toLocalData } from './shape';
import { MIRRORED, type LocalData, type LocalStore, type OutboxItem } from './types';

// Device mirror tables (Flow 03 "Data and integrations"). Rows are stored as JSON: the server shape is
// the contract; SQL here is storage, not a second schema.
const TABLE: Record<SyncEntity, string> = {
  category: 'categories',
  term: 'terms',
  routine: 'routines',
  routine_block: 'routine_blocks',
  override: 'overrides',
  plan: 'plans',
  profile: 'profile',
};

export class SQLiteStore implements LocalStore {
  private db: SQLite.SQLiteDatabase | null = null;
  constructor(private readonly name = 'dialed.db') {}

  private get conn(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('store not initialised');
    return this.db;
  }

  async init() {
    this.db = await SQLite.openDatabaseAsync(this.name);
    await this.db.execAsync(`
      PRAGMA journal_mode = WAL;
      ${MIRRORED.map((e) => `CREATE TABLE IF NOT EXISTS ${TABLE[e]} (id TEXT PRIMARY KEY NOT NULL, row TEXT NOT NULL);`).join('\n')}
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, mutation TEXT NOT NULL, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
    `);
  }

  private async write(txn: SQLite.SQLiteDatabase, changes: SyncChange[]) {
    for (const ch of changes) {
      const t = TABLE[ch.entity];
      if (ch.op === 'delete') await txn.runAsync(`DELETE FROM ${t} WHERE id = ?`, rowId(ch));
      else
        await txn.runAsync(
          `INSERT OR REPLACE INTO ${t} (id, row) VALUES (?, ?)`,
          rowId(ch),
          JSON.stringify(ch.row),
        );
    }
  }

  async replaceAll(changes: SyncChange[], revision: number) {
    await this.conn.withExclusiveTransactionAsync(async (txn) => {
      for (const e of MIRRORED) await txn.runAsync(`DELETE FROM ${TABLE[e]}`);
      await this.write(txn, changes);
      await txn.runAsync(
        `INSERT OR REPLACE INTO meta (key, value) VALUES ('cursor', ?)`,
        String(revision),
      );
    });
  }

  async applyChanges(changes: SyncChange[], revision: number) {
    await this.conn.withExclusiveTransactionAsync(async (txn) => {
      await this.write(txn, changes);
      await txn.runAsync(
        `INSERT OR REPLACE INTO meta (key, value) VALUES ('cursor', ?)`,
        String(revision),
      );
    });
  }

  async upsertRows(changes: SyncChange[]) {
    await this.conn.withExclusiveTransactionAsync((txn) => this.write(txn, changes));
  }

  async load(): Promise<LocalData> {
    const rows = {} as Record<SyncEntity, Record<string, unknown>[]>;
    for (const e of MIRRORED) {
      const r = await this.conn.getAllAsync<{ row: string }>(`SELECT row FROM ${TABLE[e]}`);
      rows[e] = r.map((x) => JSON.parse(x.row));
    }
    return toLocalData(rows);
  }

  async getRow(entity: SyncEntity, id: string) {
    const r = await this.conn.getFirstAsync<{ row: string }>(
      `SELECT row FROM ${TABLE[entity]} WHERE id = ?`,
      id,
    );
    return r ? JSON.parse(r.row) : null;
  }

  async cursor() {
    const r = await this.conn.getFirstAsync<{ value: string }>(
      `SELECT value FROM meta WHERE key = 'cursor'`,
    );
    return r ? Number(r.value) : 0;
  }

  async enqueue(m: Mutation) {
    await this.conn.runAsync(
      `INSERT INTO outbox (mutation, created_at) VALUES (?, ?)`,
      JSON.stringify(m),
      new Date().toISOString(),
    );
  }

  async outbox(): Promise<OutboxItem[]> {
    const r = await this.conn.getAllAsync<{
      seq: number;
      mutation: string;
      created_at: string;
      attempts: number;
    }>(`SELECT * FROM outbox ORDER BY seq`);
    return r.map((x) => ({ ...x, mutation: JSON.parse(x.mutation) as Mutation }));
  }

  async removeOutbox(seqs: number[]) {
    if (!seqs.length) return;
    await this.conn.runAsync(
      `DELETE FROM outbox WHERE seq IN (${seqs.map(() => '?').join(',')})`,
      ...seqs,
    );
  }

  /** Session end: nothing of the Planner's stays on the device (C-01x). */
  async wipe() {
    await this.conn.withExclusiveTransactionAsync(async (txn) => {
      for (const e of MIRRORED) await txn.runAsync(`DELETE FROM ${TABLE[e]}`);
      await txn.runAsync(`DELETE FROM meta`);
      await txn.runAsync(`DELETE FROM outbox`);
    });
  }
}
