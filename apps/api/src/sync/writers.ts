import { sql } from 'drizzle-orm';
import type { Tx } from '../db/pool';
import type { ChangeRecorder } from './record';

type Row = Record<string, unknown>;
export type WriteSource = 'user' | 'plan';

export async function insertRoutineBlock(
  tx: Tx,
  rec: ChangeRecorder,
  userId: string,
  block: {
    id: string;
    routine_id: string;
    weekday: number;
    start_min: number;
    end_min: number;
    title: string;
    category_id: string;
    effective_from: string;
    effective_to: string | null;
  },
  source: WriteSource,
): Promise<Row> {
  const { rows } = await tx.execute<Row>(sql`insert into routine_blocks
    (id, routine_id, user_id, weekday, start_min, end_min, title, category_id, effective_from, effective_to, source)
    values (${block.id}, ${block.routine_id}, ${userId}, ${block.weekday}, ${block.start_min}, ${block.end_min},
            ${block.title}, ${block.category_id}, ${block.effective_from}, ${block.effective_to}, ${source}) returning *`);
  await rec.record('routine_block', block.id, 'upsert', rows[0]!);
  return rows[0]!;
}

export async function closeRoutineBlock(
  tx: Tx,
  rec: ChangeRecorder,
  blockId: string,
  mode: { effective_to: string } | { delete: true },
): Promise<Row> {
  const set =
    'effective_to' in mode ? sql`effective_to = ${mode.effective_to}` : sql`deleted_at = now()`;
  const { rows } = await tx.execute<Row>(
    sql`update routine_blocks set ${set}, version = version + 1 where id = ${blockId} returning *`,
  );
  await rec.record('routine_block', blockId, 'upsert', rows[0]!);
  return rows[0]!;
}

export async function insertOverride(
  tx: Tx,
  rec: ChangeRecorder,
  userId: string,
  ov: {
    id: string;
    on_date: string;
    kind: string;
    routine_block_id: string | null;
    title: string | null;
    start_min: number | null;
    end_min: number | null;
    category_id: string | null;
    moved_to_date: string | null;
    note: string | null;
  },
  source: WriteSource,
  planId?: string,
): Promise<Row> {
  const { rows } = await tx.execute<Row>(sql`insert into overrides
    (id, user_id, on_date, kind, routine_block_id, title, start_min, end_min, category_id, moved_to_date, note, source, plan_id)
    values (${ov.id}, ${userId}, ${ov.on_date}, ${ov.kind}, ${ov.routine_block_id}, ${ov.title},
            ${ov.start_min}, ${ov.end_min}, ${ov.category_id}, ${ov.moved_to_date}, ${ov.note},
            ${source}, ${planId ?? null}) returning *`);
  await rec.record('override', ov.id, 'upsert', rows[0]!);
  return rows[0]!;
}
