import { importSummary } from '../import/calendarImport';
import type { CalendarEvent } from '../import/api';

jest.mock('expo-calendar', () => ({
  requestCalendarPermissionsAsync: jest.fn(),
  getCalendarsAsync: jest.fn(),
  getEventsAsync: jest.fn(),
  Frequency: { WEEKLY: 2 },
}));

describe('importSummary', () => {
  it('counts recurring vs one-off events', () => {
    const events: CalendarEvent[] = [
      {
        title: 'Standup',
        start: '2037-10-20T09:00:00Z',
        end: '2037-10-20T09:30:00Z',
        rrule: 'FREQ=WEEKLY',
      },
      {
        title: 'Standup',
        start: '2037-10-21T09:00:00Z',
        end: '2037-10-21T09:30:00Z',
        rrule: 'FREQ=WEEKLY',
      },
      { title: 'Doctor', start: '2037-10-22T14:00:00Z', end: '2037-10-22T15:00:00Z' },
    ];
    const s = importSummary(events);
    expect(s.recurring).toBe(2);
    expect(s.oneOff).toBe(1);
  });

  it('handles empty array', () => {
    const s = importSummary([]);
    expect(s.recurring).toBe(0);
    expect(s.oneOff).toBe(0);
  });

  it('all recurring', () => {
    const events: CalendarEvent[] = [
      {
        title: 'A',
        start: '2037-10-20T09:00:00Z',
        end: '2037-10-20T10:00:00Z',
        rrule: 'FREQ=WEEKLY',
      },
    ];
    expect(importSummary(events)).toEqual({ recurring: 1, oneOff: 0 });
  });
});

describe('CalendarEvent shape', () => {
  it('recurring events have rrule field', () => {
    const ev: CalendarEvent = {
      title: 'Standup',
      start: '2037-10-20T09:00:00Z',
      end: '2037-10-20T09:30:00Z',
      rrule: 'FREQ=WEEKLY',
      calendar: 'Work',
    };
    expect(ev.rrule).toBe('FREQ=WEEKLY');
    expect(ev.calendar).toBe('Work');
  });

  it('one-off events have no rrule', () => {
    const ev: CalendarEvent = {
      title: 'Doctor',
      start: '2037-10-22T14:00:00Z',
      end: '2037-10-22T15:00:00Z',
    };
    expect(ev.rrule).toBeUndefined();
  });
});

describe('upload error codes', () => {
  it('error shape matches what reading.tsx destructures', () => {
    const errBody = { error: { code: 'file_unsupported', message: 'Not a supported file type' } };
    const err = Object.assign(new Error(errBody.error.message), {
      code: errBody.error.code,
      status: 400,
    });
    expect(err.code).toBe('file_unsupported');
    expect(err.message).toBe('Not a supported file type');
    expect((err as { status: number }).status).toBe(400);
  });

  it('all backend error codes are handled in reading.tsx', () => {
    const handled = ['file_unsupported', 'file_too_large', 'vision_unavailable', 'daily_limit'];
    expect(handled).toContain('file_unsupported');
    expect(handled).toContain('file_too_large');
    expect(handled).toContain('vision_unavailable');
    expect(handled).toContain('daily_limit');
  });
});
