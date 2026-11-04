import type { PlanChangeRow, PlanCheck, PlanDTO } from '@dialed/contracts';
import { formatClock } from '@dialed/schedule';

export type ChangeTag = 'New' | 'Moved' | 'Changed' | 'Removed' | 'Skip' | 'New category';

export interface ChangeCard {
  id: string;
  ord: number;
  tag: ChangeTag;
  title: string;
  fromTo: string | null;
  note: string;
  enabled: boolean;
  checks: PlanCheck[];
}

const TAG_MAP: Record<string, ChangeTag> = {
  new: 'New',
  moved: 'Moved',
  changed: 'Changed',
  removed: 'Removed',
  skip: 'Skip',
  create_category: 'New category',
  create_term: 'New',
  update_term: 'Changed',
};

function formatFromTo(kind: string, payload: Record<string, unknown>): string | null {
  const fmtTime = (k: string) => {
    const v = payload[k];
    return typeof v === 'string' ? formatClock(timeToMin(v)) : null;
  };
  const fmtDay = (k: string) => {
    const v = payload[k];
    return typeof v === 'string' ? dayLabel(v) : null;
  };

  if (kind === 'moved') {
    const parts: string[] = [];
    const toDay = fmtDay('to_weekday') ?? fmtDay('to_date');
    const start = fmtTime('start');
    const end = fmtTime('end');
    if (toDay) parts.push(toDay);
    if (start && end) parts.push(`${start}–${end}`);
    else if (start) parts.push(start);
    return parts.length ? `→ ${parts.join(' ')}` : null;
  }

  if (kind === 'new') {
    const day = fmtDay('on_date') ?? repeatLabel(payload);
    const start = fmtTime('start');
    const end = fmtTime('end');
    const time = start && end ? `${start}–${end}` : start;
    return [day, time].filter(Boolean).join(' ') || null;
  }

  if (kind === 'changed') {
    const fields = payload.fields as Record<string, unknown> | undefined;
    if (!fields) return null;
    const parts: string[] = [];
    if (fields.start || fields.end) {
      const s = fields.start ? formatClock(timeToMin(fields.start as string)) : null;
      const e = fields.end ? formatClock(timeToMin(fields.end as string)) : null;
      if (s && e) parts.push(`→ ${s}–${e}`);
      else if (s) parts.push(`→ ${s}`);
    }
    if (fields.title) parts.push(`→ ${fields.title}`);
    return parts.join(', ') || null;
  }

  if (kind === 'skip') {
    const d = fmtDay('on_date');
    return d ? `Skip ${d}` : null;
  }

  if (kind === 'removed') {
    const from = payload.from as string | undefined;
    return from ? `From ${dayLabel(from)}` : null;
  }

  return null;
}

function repeatLabel(payload: Record<string, unknown>): string | null {
  const r = payload.repeat as { weekday?: string; from?: string; until?: string } | undefined;
  if (!r?.weekday) return null;
  return `Every ${capitalize(r.weekday)}`;
}

function dayLabel(dateOrDay: string): string {
  if (dateOrDay.length === 3) return capitalize(dateOrDay);
  try {
    const d = new Date(dateOrDay + 'T12:00:00');
    return d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateOrDay;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function timeToMin(hhmm: string): number {
  const parts = hhmm.split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

export function toChangeCards(plan: PlanDTO): ChangeCard[] {
  return plan.changes
    .slice()
    .sort((a, b) => a.ord - b.ord)
    .map((ch) => toCard(ch, plan.checks));
}

function toCard(row: PlanChangeRow, allChecks: PlanCheck[]): ChangeCard {
  const changeChecks = allChecks.filter((ck) => ck.id.startsWith(row.id.slice(0, 8)));
  return {
    id: row.id,
    ord: row.ord,
    tag: TAG_MAP[row.kind] ?? 'Changed',
    title: row.title,
    fromTo: formatFromTo(row.kind, row.payload),
    note: row.note,
    enabled: row.enabled,
    checks: changeChecks,
  };
}

export function enabledCount(cards: ChangeCard[]): number {
  return cards.filter((c) => c.enabled).length;
}
