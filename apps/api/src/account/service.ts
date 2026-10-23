import { sql } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';
import {
  DEFAULT_DEVICE_PREFS,
  EXPORT_SCHEMA,
  EXPORTS_PER_DAY,
  type DevicePrefs,
} from '@dialed/contracts';
import { addDays, localNow, resolveDay, type ScheduleData } from '@dialed/schedule';
import type { Db } from '../db/pool';
import { appError } from '../lib/errors';

type Row = Record<string, unknown>;
const ICS_DAYS = 120;

/** Flow 09: this phone's prefs and Export my data. Every query is scoped to the signed-in user. */
export class AccountService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The session's device row (created at sign-in); a session without one gets one. */
  private async deviceId(userId: string, sid: string): Promise<string> {
    const { rows } = await this.db.execute<{ device_id: string | null }>(
      sql`select device_id from sessions where id = ${sid} and user_id = ${userId}`,
    );
    const id = rows[0]?.device_id;
    if (id) return id;
    const made = await this.db.execute<{ id: string }>(
      sql`insert into devices (user_id) values (${userId}) returning id`,
    );
    await this.db.execute(
      sql`update sessions set device_id = ${made.rows[0]!.id} where id = ${sid} and user_id = ${userId}`,
    );
    return made.rows[0]!.id;
  }

  async getPrefs(userId: string, sid: string): Promise<DevicePrefs> {
    const id = await this.deviceId(userId, sid);
    const { rows } = await this.db.execute<{ prefs_json: Partial<DevicePrefs> }>(
      sql`select prefs_json from devices where id = ${id} and user_id = ${userId}`,
    );
    return { ...DEFAULT_DEVICE_PREFS, ...(rows[0]?.prefs_json ?? {}) };
  }

  async putPrefs(
    userId: string,
    sid: string,
    body: { prefs?: Partial<DevicePrefs>; app_version?: string },
  ): Promise<DevicePrefs> {
    const id = await this.deviceId(userId, sid);
    const merged = { ...(await this.getPrefs(userId, sid)), ...(body.prefs ?? {}) };
    // Line only keeps the line on (D-07).
    if (merged.lock_mode === 'line') merged.line_on = true;
    await this.db.execute(sql`update devices set prefs_json = ${JSON.stringify(merged)}::jsonb,
      app_version = coalesce(${body.app_version ?? null}, app_version), last_seen_at = now()
      where id = ${id} and user_id = ${userId}`);
    return merged;
  }

  /** `dialed-export.zip`: dialed-export.json (own rows, no secrets) + dialed.ics (next 120 days). 3 a day. */
  async exportZip(userId: string): Promise<Uint8Array> {
    const now = this.now();
    const used = await this.db.execute<{ n: number }>(sql`select count(*)::int as n from audit_log
      where user_id = ${userId} and action = 'export' and created_at > ${new Date(now.getTime() - 86_400_000).toISOString()}`);
    if (Number(used.rows[0]?.n ?? 0) >= EXPORTS_PER_DAY)
      throw appError('daily_limit', 'You can export 3 times a day. Try again tomorrow.');

    const q = async (query: ReturnType<typeof sql>) => (await this.db.execute<Row>(query)).rows;
    const user = (
      await q(sql`select display_name, email, time_zone from users where id = ${userId}`)
    )[0]!;
    const tz = String(user.time_zone);
    const cols = (list: string) => sql.raw(list);
    const categories =
      await q(sql`select ${cols('id, name, group_name, color_dark, color_light, weight, quiet, protected, sort, deleted_at')}
      from categories where user_id = ${userId} order by sort, name`);
    const terms = await q(sql`select ${cols('id, name, starts_on, ends_on, is_draft')}
      from terms where user_id = ${userId} and deleted_at is null order by starts_on`);
    const routines = await q(sql`select ${cols('id, term_id, name')}
      from routines where user_id = ${userId}`);
    const routine_blocks =
      await q(sql`select ${cols('id, routine_id, weekday, start_min, end_min, title, category_id, effective_from, effective_to')}
      from routine_blocks where user_id = ${userId} and deleted_at is null order by weekday, start_min`);
    const overrides =
      await q(sql`select ${cols('id, on_date, kind, routine_block_id, title, start_min, end_min, category_id, moved_to_date, note')}
      from overrides where user_id = ${userId} and deleted_at is null order by on_date`);
    const plans = await q(sql`select p.request_text, p.status, coalesce(
        (select json_agg(json_build_object('kind', c.kind, 'title', c.title, 'note', c.note, 'enabled', c.enabled) order by c.ord)
         from plan_changes c where c.plan_id = p.id), '[]'::json) as changes
      from plans p where p.user_id = ${userId} order by p.created_at`);

    const json = {
      schema: EXPORT_SCHEMA,
      exported_at: now.toISOString(),
      user: { name: user.display_name, email: user.email, time_zone: tz },
      categories,
      terms,
      routines,
      routine_blocks,
      overrides,
      plans,
    };
    const data = {
      categories: categories.map((c) => ({ ...c, weight: Number(c.weight) })),
      terms: (await q(sql`select * from terms where user_id = ${userId}`)) as never,
      routines: (await q(sql`select * from routines where user_id = ${userId}`)) as never,
      routineBlocks: (await q(
        sql`select * from routine_blocks where user_id = ${userId}`,
      )) as never,
      overrides: (await q(sql`select * from overrides where user_id = ${userId}`)) as never,
    } as unknown as ScheduleData;
    const ics = calendar(data, localNow(now, tz).date, tz, now);

    const zip = zipSync({
      'dialed-export.json': strToU8(JSON.stringify(json, null, 2)),
      'dialed.ics': strToU8(ics),
    });
    await this.db.execute(sql`insert into audit_log (user_id, actor, action, created_at)
      values (${userId}, 'user', 'export', ${now.toISOString()})`);
    return zip;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
/** Local wall time on a date; minute 1440 is midnight of the next day. */
const local = (date: string, min: number) => {
  const d = min >= 1440 ? addDays(date, 1) : date;
  const m = min % 1440;
  return `${d.replaceAll('-', '')}T${pad(Math.floor(m / 60))}${pad(m % 60)}00`;
};
const text = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** RFC 5545 calendar of the resolved schedule from `from` for 120 days; UID = block id + date. */
export function calendar(data: ScheduleData, from: string, tz: string, now: Date): string {
  const cat = new Map(data.categories.map((c) => [c.id, c.name]));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dialed//Export//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-TIMEZONE:${tz}`,
  ];
  for (let i = 0; i < ICS_DAYS; i++) {
    const date = addDays(from, i);
    for (const b of resolveDay(date, data).blocks) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${b.routine_block_id ?? b.override_id}-${date.replaceAll('-', '')}@dialed`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART;TZID=${tz}:${local(date, b.start_min)}`,
        `DTEND;TZID=${tz}:${local(date, b.end_min)}`,
        `SUMMARY:${text(b.title)}`,
        `CATEGORIES:${text(cat.get(b.category_id) ?? 'Block')}`,
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
