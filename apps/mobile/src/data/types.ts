import type { Mutation, SyncChange, SyncEntity } from '@dialed/contracts';
import type { ScheduleData } from '@dialed/schedule';

export interface Profile {
  display_name: string;
  time_zone: string;
  day_start_min: number;
  day_end_min: number;
  quiet_start_min: number;
  quiet_end_min: number;
  week_start: number;
  theme: 'system' | 'light' | 'dark';
  version: number;
}

export interface OutboxItem {
  seq: number;
  mutation: Mutation;
  created_at: string;
  attempts: number;
}

export interface LocalData {
  schedule: ScheduleData;
  profile: Profile | null;
  /** Ids of rows with a queued, unsent change ("· waiting to sync"). */
  pending: string[];
}

/** On-device read model + outbox (D-03). SQLite in the app, memory in tests — same contract. */
export interface LocalStore {
  init(): Promise<void>;
  /** since=0 snapshot: replace every mirrored row in one transaction, then store the cursor. */
  replaceAll(changes: SyncChange[], revision: number): Promise<void>;
  /** Incremental page: upsert/delete rows and advance the cursor in one transaction. */
  applyChanges(changes: SyncChange[], revision: number): Promise<void>;
  upsertRows(changes: SyncChange[]): Promise<void>;
  load(): Promise<LocalData>;
  getRow(entity: SyncEntity, id: string): Promise<Record<string, unknown> | null>;
  cursor(): Promise<number>;
  enqueue(m: Mutation): Promise<void>;
  outbox(): Promise<OutboxItem[]>;
  removeOutbox(seqs: number[]): Promise<void>;
  /** Small per-account device prefs (recent categories). Wiped with the session. */
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  wipe(): Promise<void>;
}

export const MIRRORED: SyncEntity[] = [
  'category',
  'term',
  'routine',
  'routine_block',
  'override',
  'plan',
  'profile',
];
