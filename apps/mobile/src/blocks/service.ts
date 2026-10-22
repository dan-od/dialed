import type { Mutation } from '@dialed/contracts';
import type { IsoDate, ResolvedBlock } from '@dialed/schedule';
import { randomUUID } from 'expo-crypto';
import type { LocalStore } from '../data/types';

export interface BlockFields {
  title: string;
  start_min: number;
  end_min: number;
  category_id: string;
}
/** `key` is the resolved key of the changed block on the day it lands (for the "New" highlight). */
export interface Done {
  key: string | null;
}
export interface Undoable extends Done {
  undo(): Promise<void>;
}
export type AlertChoice = 0 | 10 | 30 | null;

type Draft = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, 'client_mutation_id'>
    : never
  : never;
type Row = Record<string, unknown>;

const RECENT = 'recent_categories';

/**
 * Flow 04 block changes (device side). Every change is one idempotent sync mutation, written locally at
 * once through the engine's outbox; the server re-validates the same rules (apps/api sync push).
 */
export class Blocks {
  constructor(
    private readonly store: LocalStore,
    private readonly enqueue: (m: Mutation) => Promise<void>,
    private readonly uuid: () => string = randomUUID,
  ) {}

  private send(m: Draft) {
    return this.enqueue({ ...m, client_mutation_id: this.uuid() } as Mutation);
  }

  private async row(entity: 'override' | 'routine_block', id: string): Promise<Row> {
    const r = await this.store.getRow(entity, id);
    if (!r) throw new Error(`${entity} ${id} is not on this phone`);
    return r;
  }

  private version = (r: Row) => Number(r.version ?? 0);

  async addOneOff(date: IsoDate, f: BlockFields): Promise<Done> {
    const id = this.uuid();
    await this.send({
      entity: 'override',
      op: 'upsert',
      id,
      base_version: 0,
      fields: { on_date: date, kind: 'add', ...f },
    });
    await this.remember(f.category_id);
    return { key: `${id}:${date}` };
  }

  /** "Repeat every <weekday>": a new routine block, effective from `effectiveFrom` (today) forward. */
  async addRoutine(
    routineId: string,
    weekday: number,
    f: BlockFields,
    effectiveFrom: IsoDate,
    shownDate: IsoDate,
  ): Promise<Done> {
    const id = this.uuid();
    await this.send({
      entity: 'routine_block',
      op: 'upsert',
      id,
      base_version: 0,
      fields: { routine_id: routineId, weekday, effective_from: effectiveFrom, ...f },
    });
    await this.remember(f.category_id);
    return { key: `${id}:${shownDate}` };
  }

  /** "This <weekday> only". Updates the block's own override when it has one (one-off, moved, modified). */
  async modifyOnce(block: ResolvedBlock, f: Partial<BlockFields>): Promise<Done> {
    if (block.override_id) {
      const o = await this.row('override', block.override_id);
      await this.send({
        entity: 'override',
        op: 'upsert',
        id: block.override_id,
        base_version: this.version(o),
        fields: { on_date: String(o.on_date), kind: o.kind as 'add' | 'modify' | 'move', ...f },
      });
    } else {
      await this.send({
        entity: 'override',
        op: 'upsert',
        id: this.uuid(),
        base_version: 0,
        fields: {
          on_date: block.date,
          kind: 'modify',
          routine_block_id: block.routine_block_id,
          ...f,
        },
      });
    }
    if (f.category_id) await this.remember(f.category_id);
    return { key: block.key };
  }

  /** "Every <weekday>": one routine_block_edit from `effectiveFrom`; past days keep the old version. */
  async modifyEvery(
    block: ResolvedBlock,
    f: Partial<BlockFields> & { weekday?: number },
    effectiveFrom: IsoDate,
  ): Promise<Done> {
    if (!block.routine_block_id) throw new Error('not a routine block');
    const rb = await this.row('routine_block', block.routine_block_id);
    // A "this day only" change on the same date would hide the new version; it goes.
    if (block.source === 'routine' && block.override_id) {
      const o = await this.row('override', block.override_id);
      await this.send({
        entity: 'override',
        op: 'delete',
        id: block.override_id,
        base_version: this.version(o),
      });
    }
    const newId = this.uuid();
    await this.send({
      entity: 'routine_block_edit',
      block_id: block.routine_block_id,
      base_version: this.version(rb),
      effective_from: effectiveFrom,
      fields: f,
      new_block_id: newId,
    });
    if (f.category_id) await this.remember(f.category_id);
    if (f.weekday !== undefined && f.weekday !== Number(rb.weekday)) return { key: null };
    const inPlace = effectiveFrom <= String(rb.effective_from);
    return { key: `${inPlace ? block.routine_block_id : newId}:${block.date}` };
  }

  /** Move to another day this week only (server checks: same week, target inside a term). */
  async moveOnce(
    block: ResolvedBlock,
    toDate: IsoDate,
    f: Partial<BlockFields> = {},
  ): Promise<Done> {
    if (block.source === 'routine') {
      const id = this.uuid();
      // Keep any "this day only" changes: the move carries the block as it stands.
      const carried = block.override_id
        ? {
            title: block.title,
            start_min: block.start_min,
            end_min: block.end_min,
            category_id: block.category_id,
          }
        : {};
      await this.send({
        entity: 'override',
        op: 'upsert',
        id,
        base_version: 0,
        fields: {
          on_date: block.date,
          kind: 'move',
          routine_block_id: block.routine_block_id,
          moved_to_date: toDate,
          ...carried,
          ...f,
        },
      });
      return { key: `${id}:${toDate}` };
    }
    const id = block.override_id!;
    const o = await this.row('override', id);
    const fields =
      o.kind === 'move'
        ? { on_date: String(o.on_date), kind: 'move' as const, moved_to_date: toDate, ...f }
        : { on_date: toDate, kind: 'add' as const, ...f };
    await this.send({
      entity: 'override',
      op: 'upsert',
      id,
      base_version: this.version(o),
      fields,
    });
    return { key: `${id}:${toDate}` };
  }

  /** Move every week: the weekday changes from `effectiveFrom` on. */
  moveEvery(
    block: ResolvedBlock,
    toWeekday: number,
    f: Partial<BlockFields>,
    effectiveFrom: IsoDate,
  ): Promise<Done> {
    return this.modifyEvery(block, { ...f, weekday: toWeekday }, effectiveFrom);
  }

  /** "Skip it this <weekday>". A one-off has nothing to skip: it is deleted. */
  async skipOnce(block: ResolvedBlock): Promise<Undoable> {
    if (block.source !== 'routine') return this.deleteBlock(block, block.date);
    const id = this.uuid();
    await this.send({
      entity: 'override',
      op: 'upsert',
      id,
      base_version: 0,
      fields: { on_date: block.date, kind: 'skip', routine_block_id: block.routine_block_id },
    });
    return {
      key: null,
      undo: async () => {
        const o = await this.row('override', id);
        await this.send({ entity: 'override', op: 'delete', id, base_version: this.version(o) });
      },
    };
  }

  /**
   * "Delete block". Routine block: closed from `date` (past days keep it). One-off: soft-deleted.
   * A moved occurrence becomes a skip of its original day.
   */
  async deleteBlock(block: ResolvedBlock, date: IsoDate): Promise<Undoable> {
    if (block.source === 'routine') {
      const id = block.routine_block_id!;
      const rb = await this.row('routine_block', id);
      const edit = { entity: 'routine_block_edit' as const, block_id: id, effective_from: date };
      await this.send({ ...edit, base_version: this.version(rb), close: true });
      return {
        key: null,
        undo: async () => {
          const now = await this.row('routine_block', id);
          await this.send({ ...edit, base_version: this.version(now), reopen: true });
        },
      };
    }
    const id = block.override_id!;
    const o = await this.row('override', id);
    if (o.kind === 'move') {
      const on_date = String(o.on_date);
      await this.send({
        entity: 'override',
        op: 'upsert',
        id,
        base_version: this.version(o),
        fields: { on_date, kind: 'skip', moved_to_date: null },
      });
      return {
        key: null,
        undo: async () => {
          const now = await this.row('override', id);
          await this.send({
            entity: 'override',
            op: 'upsert',
            id,
            base_version: this.version(now),
            fields: { on_date, kind: 'move', moved_to_date: String(o.moved_to_date) },
          });
        },
      };
    }
    await this.send({ entity: 'override', op: 'delete', id, base_version: this.version(o) });
    return {
      key: null,
      undo: async () => {
        const now = await this.row('override', id);
        await this.send({ entity: 'override', op: 'restore', id, base_version: this.version(now) });
      },
    };
  }

  /** Create a category from the picker (Flow 09 service): unique name per account, ignoring case. */
  async createCategory(
    name: string,
    group: string,
    [dark, light]: [string, string],
  ): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
    const clean = name.trim().replace(/\s+/g, ' ');
    const { schedule } = await this.store.load();
    const live = schedule.categories.filter((c) => !c.deleted_at);
    const same = live.find((c) => c.name.toLowerCase() === clean.toLowerCase());
    if (same) return { ok: false, message: `You already have ${same.name}.` };
    const id = this.uuid();
    await this.send({
      entity: 'category',
      op: 'upsert',
      id,
      base_version: 0,
      fields: {
        name: clean,
        group_name: group,
        color_dark: dark,
        color_light: light,
        sort: Math.max(0, ...live.map((c) => c.sort)) + 1,
      },
    });
    return { ok: true, id };
  }

  /** Per-block push alert (D-32), stored in profile_json.block_alerts and scheduled on this phone. */
  async setAlert(blockId: string, minutes: AlertChoice) {
    const p = await this.store.getRow('profile', 'me');
    if (!p) return;
    await this.send({
      entity: 'profile',
      op: 'upsert',
      base_version: this.version(p),
      fields: { block_alerts: { [blockId]: minutes } },
    });
  }

  /** Recent chips: the last 3 categories used on this phone, topped up with work categories. */
  async recentCategories(): Promise<string[]> {
    const { schedule } = await this.store.load();
    const live = schedule.categories.filter((c) => !c.deleted_at);
    const ids = new Set(live.map((c) => c.id));
    let used: string[] = [];
    try {
      used = JSON.parse((await this.store.getMeta(RECENT)) ?? '[]');
    } catch {
      used = [];
    }
    const fill = live
      .filter((c) => !c.quiet)
      .sort((a, b) => a.sort - b.sort)
      .map((c) => c.id);
    return [...new Set([...used.filter((id) => ids.has(id)), ...fill])].slice(0, 3);
  }

  private async remember(categoryId: string) {
    let used: string[] = [];
    try {
      used = JSON.parse((await this.store.getMeta(RECENT)) ?? '[]');
    } catch {
      used = [];
    }
    const next = [categoryId, ...used.filter((id) => id !== categoryId)].slice(0, 3);
    await this.store.setMeta(RECENT, JSON.stringify(next));
  }
}
