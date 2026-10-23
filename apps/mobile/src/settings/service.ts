import type { Mutation } from '@dialed/contracts';
import { randomUUID } from 'expo-crypto';
import type { LocalStore } from '../data/types';
import { cleanName, PALETTE, sameName } from './model';

type Row = Record<string, unknown>;
type Draft = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, 'client_mutation_id'>
    : never
  : never;

/**
 * Flow 09 category changes (device side): one idempotent sync mutation each, shown at once through the outbox
 * (data/shape categoryEffects); the server re-checks ownership, versions and names (apps/api sync push).
 */
export class Categories {
  constructor(
    private readonly store: LocalStore,
    private readonly enqueue: (m: Mutation) => Promise<void>,
    private readonly uuid: () => string = randomUUID,
  ) {}

  private async send(m: Draft): Promise<string> {
    const id = this.uuid();
    await this.enqueue({ ...m, client_mutation_id: id } as Mutation);
    return id;
  }

  private async cat(id: string): Promise<Row> {
    const r = await this.store.getRow('category', id);
    if (!r) throw new Error(`category ${id} is not on this phone`);
    return r;
  }

  private async live() {
    return (await this.store.load()).schedule.categories.filter((c) => !c.deleted_at);
  }

  /** Rename, recolour (palette index; −1 keeps the colours), regroup; `quiet` only when the D-35 row is shown. */
  async save(
    id: string,
    f: { name: string; group: string; colour: number; quiet?: boolean },
  ): Promise<
    { ok: true } | { ok: false; reason: 'empty' } | { ok: false; reason: 'taken'; message: string }
  > {
    const name = cleanName(f.name);
    if (!name) return { ok: false, reason: 'empty' };
    const same = sameName(await this.live(), name, id);
    if (same)
      return {
        ok: false,
        reason: 'taken',
        message: `You already have a category called ${same.name}.`,
      };
    const cur = await this.cat(id);
    const pal = f.colour >= 0 ? PALETTE[f.colour] : undefined;
    await this.send({
      entity: 'category',
      op: 'upsert',
      id,
      base_version: Number(cur.version ?? 0),
      fields: {
        name,
        group_name: f.group,
        color_dark: pal?.dark ?? String(cur.color_dark),
        color_light: pal?.light ?? String(cur.color_light),
        ...(f.quiet === undefined ? {} : { quiet: f.quiet }),
      },
    });
    return { ok: true };
  }

  /** Merge: every block moves to `to`, then `from` goes away. Returns how many blocks a week moved. */
  async merge(from: string, to: string): Promise<{ ok: true; moved: number; mutationId: string }> {
    const [a, b] = [await this.cat(from), await this.cat(to)];
    const moved = (await this.store.rows('routine_block')).filter(
      (r) => r.category_id === from && !r.deleted_at,
    ).length;
    const mutationId = await this.send({
      entity: 'category_merge',
      from,
      to,
      from_version: Number(a.version ?? 0),
      to_version: Number(b.version ?? 0),
    });
    return { ok: true, moved, mutationId };
  }

  /** Undo a merge: needs the server's merge id, so a merge made offline can't be undone until it syncs. */
  async unmerge(mergeMutationId: string): Promise<'sent' | 'not_synced'> {
    const mergeId = await this.store.getMeta(`merge:${mergeMutationId}`);
    if (!mergeId) return 'not_synced';
    await this.send({ entity: 'category_unmerge', merge_id: mergeId });
    return 'sent';
  }

  /** Delete: blocks move to `reassignTo`, or end from today (`deleteBlocks`); nothing needed when unused. */
  async remove(id: string, how: { reassignTo?: string; deleteBlocks?: boolean }) {
    const cur = await this.cat(id);
    await this.send({
      entity: 'category_delete',
      id,
      base_version: Number(cur.version ?? 0),
      ...(how.reassignTo ? { reassign_to: how.reassignTo } : {}),
      ...(how.deleteBlocks ? { delete_blocks: true as const } : {}),
    });
  }
}
