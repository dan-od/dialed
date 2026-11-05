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
  checked: boolean;
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
    result.push({
      id: cal.id,
      title: cal.title,
      color: cal.color ?? '#888',
      source: cal.source?.name ?? '',
      eventCount: events.length,
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
    if (!ev.title?.trim()) continue;
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

export function importSummary(events: CalendarEvent[]): { recurring: number; oneOff: number } {
  const recurring = events.filter((e) => e.rrule).length;
  return { recurring, oneOff: events.length - recurring };
}
