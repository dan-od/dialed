// Golden input: parse backend/seed/0001_seed.sql (the source of truth) into ScheduleData for one user.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ScheduleData } from '../src/types';

export const OWNER_ID = 'c5610ac2-5ae9-57cd-9cd6-a9e11adb97a6';
const SEED = fileURLToPath(new URL('../../../backend/seed/0001_seed.sql', import.meta.url));

type Row = Record<string, string | number | boolean | null>;

function splitValues(src: string): (string | number | boolean | null)[] {
  const out: (string | number | boolean | null)[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === ',' || ch === ' ') {
      i++;
      continue;
    }
    if (ch === "'") {
      let s = '';
      i++;
      for (;;) {
        if (src[i] === "'" && src[i + 1] === "'") {
          s += "'";
          i += 2;
        } else if (src[i] === "'") {
          i++;
          break;
        } else s += src[i++];
      }
      out.push(s);
      continue;
    }
    let tok = '';
    let depth = 0;
    while (i < src.length && (depth > 0 || src[i] !== ',')) {
      if (src[i] === '(') depth++;
      if (src[i] === ')') depth--;
      tok += src[i++];
    }
    tok = tok.trim();
    if (tok === 'true' || tok === 'false') out.push(tok === 'true');
    else if (/^-?\d+(\.\d+)?$/.test(tok)) out.push(Number(tok));
    else if (tok.toUpperCase() === 'NULL') out.push(null);
    else out.push(tok); // e.g. now()
  }
  return out;
}

export function seedRows(table: string): Row[] {
  const sql = readFileSync(SEED, 'utf8');
  const re = new RegExp(`^INSERT INTO ${table}\\(([^)]*)\\) VALUES \\((.*)\\) ON CONFLICT`, 'gm');
  const rows: Row[] = [];
  for (const m of sql.matchAll(re)) {
    const cols = m[1]!.split(',');
    const vals = splitValues(m[2]!);
    rows.push(Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? null])));
  }
  return rows;
}

export function seedData(userId = OWNER_ID): ScheduleData {
  const mine = (t: string) => seedRows(t).filter((r) => r.user_id === userId);
  return {
    categories: mine('categories').map((r) => ({
      id: String(r.id),
      name: String(r.name),
      group_name: String(r.group_name),
      color_dark: String(r.color_dark),
      color_light: String(r.color_light),
      weight: Number(r.weight),
      quiet: Boolean(r.quiet),
      protected: Boolean(r.protected),
      sort: Number(r.sort),
    })),
    terms: mine('terms').map((r) => ({
      id: String(r.id),
      name: String(r.name),
      starts_on: String(r.starts_on),
      ends_on: String(r.ends_on),
      is_draft: Boolean(r.is_draft),
    })),
    routines: mine('routines').map((r) => ({
      id: String(r.id),
      term_id: String(r.term_id),
      name: String(r.name),
    })),
    routineBlocks: mine('routine_blocks').map((r) => ({
      id: String(r.id),
      routine_id: String(r.routine_id),
      weekday: Number(r.weekday),
      start_min: Number(r.start_min),
      end_min: Number(r.end_min),
      title: String(r.title),
      category_id: String(r.category_id),
      effective_from: String(r.effective_from),
      effective_to: (r.effective_to as string | null) ?? null,
    })),
    overrides: mine('overrides').map((r) => ({
      id: String(r.id),
      on_date: String(r.on_date),
      kind: r.kind as 'skip' | 'modify' | 'add' | 'move',
      routine_block_id: (r.routine_block_id as string | null) ?? null,
      title: (r.title as string | null) ?? null,
      start_min: (r.start_min as number | null) ?? null,
      end_min: (r.end_min as number | null) ?? null,
      category_id: (r.category_id as string | null) ?? null,
      moved_to_date: (r.moved_to_date as string | null) ?? null,
      note: (r.note as string | null) ?? null,
    })),
  };
}
