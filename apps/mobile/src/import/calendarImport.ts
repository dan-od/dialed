import {
  requestCalendarPermissionsAsync,
  getCalendarsAsync,
  getEventsAsync,
  Frequency,
} from 'expo-calendar';
import type { CalendarEvent } from './api';

export interface DeviceCalendar {
  id: string;
  title: string;
  color: string;
  source: string;
  eventCount: number;
  /** Distinct weekly series in the term range (each becomes one routine block). */
  repeating: number;
  /** Non-repeating timed events (each stays a one-off change). */
  oneOff: number;
  checked: boolean;
}

/** The fields of a device event the summary needs (expo-calendar `Event` fits). */
export interface DeviceEventLike {
  title?: string | null;
  startDate: string | Date;
  allDay?: boolean;
  recurrenceRule?: { frequency?: string | null } | null;
}

const WEEKLY = String(Frequency.WEEKLY);

/**
 * Preview counts for the Pick calendars stamp. iOS expands a series into one instance per
 * week, so repeating events are counted once per series (title + weekday + start time).
 * All-day events are skipped (they never become blocks).
 */
export function summarizeDeviceEvents(events: DeviceEventLike[]): {
  repeating: number;
  oneOff: number;
} {
  const series = new Set<string>();
  const singles = new Set<string>();
  for (const ev of events) {
    const title = ev.title?.trim();
    if (!title || ev.allDay) continue;
    const d = new Date(ev.startDate);
    const weekly = String(ev.recurrenceRule?.frequency ?? '') === WEEKLY;
    if (weekly) series.add(`${title}|${d.getDay()}|${d.getHours()}:${d.getMinutes()}`);
    else singles.add(`${title}|${d.toISOString()}`);
  }
  return { repeating: series.size, oneOff: singles.size };
}

const SKIP_SOURCES = ['Birthdays', 'Holidays', 'Other'];
const SKIP_TITLES = ['Birthdays', 'Holidays', 'US Holidays', 'Holidays in'];

function shouldDefault(title: string, sourceName: string): boolean {
  if (SKIP_SOURCES.some((s) => sourceName.includes(s))) return false;
  if (SKIP_TITLES.some((t) => title.includes(t))) return false;
  return true;
}

export async function requestCalendarAccess(): Promise<'granted' | 'denied'> {
  const { status } = await requestCalendarPermissionsAsync();
  return status === 'granted' ? 'granted' : 'denied';
}

export async function loadCalendars(termStart: string, termEnd: string): Promise<DeviceCalendar[]> {
  const cals = await getCalendarsAsync('event');
  const start = new Date(termStart + 'T00:00:00');
  const end = new Date(termEnd + 'T23:59:59');

  const result: DeviceCalendar[] = [];
  for (const cal of cals) {
    const events = await getEventsAsync([cal.id], start, end);
    const { repeating, oneOff } = summarizeDeviceEvents(events);
    result.push({
      id: cal.id,
      title: cal.title,
      color: cal.color ?? '#888',
      source: cal.source?.name ?? '',
      eventCount: repeating + oneOff,
      repeating,
      oneOff,
      checked: shouldDefault(cal.title, cal.source?.name ?? ''),
    });
  }
  return result.sort((a, b) => b.eventCount - a.eventCount);
}

export async function readEvents(
  calendarIds: string[],
  termStart: string,
  termEnd: string,
): Promise<CalendarEvent[]> {
  const start = new Date(termStart + 'T00:00:00');
  const end = new Date(termEnd + 'T23:59:59');
  const events = await getEventsAsync(calendarIds, start, end);

  const seen = new Set<string>();
  const result: CalendarEvent[] = [];

  for (const ev of events) {
    if (!ev.title?.trim() || ev.allDay) continue;
    const key = `${ev.title}|${ev.startDate}|${ev.endDate}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const entry: CalendarEvent = {
      title: ev.title.trim(),
      start: new Date(ev.startDate).toISOString(),
      end: new Date(ev.endDate).toISOString(),
    };

    if (ev.recurrenceRule && ev.recurrenceRule.frequency === Frequency.WEEKLY) {
      entry.rrule = 'FREQ=WEEKLY';
    }

    result.push(entry);
    if (result.length >= 500) break;
  }
  return result;
}

/** Pick calendars stamp (Flow 02). */
export function previewStamp(repeating: number, oneOff: number, termName: string): string {
  return `Preview: ${repeating} repeating event${repeating === 1 ? '' : 's'} become${repeating === 1 ? 's' : ''} your ${termName} routine. ${oneOff} one-off event${oneOff === 1 ? '' : 's'} stay${oneOff === 1 ? 's' : ''} as one-off changes.`;
}

export function importSummary(events: CalendarEvent[]): { recurring: number; oneOff: number } {
  const recurring = events.filter((e) => e.rrule).length;
  return { recurring, oneOff: events.length - recurring };
}
