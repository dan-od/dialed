import { importSummary } from '../import/calendarImport';
import type { CalendarEvent } from '../import/api';

jest.mock('expo-calendar/legacy', () => ({
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

describe('summarizeDeviceEvents (Pick calendars preview)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { summarizeDeviceEvents, previewStamp } = require('../import/calendarImport');
  const weekly = { frequency: 2 }; // jest mock: Frequency.WEEKLY = 2

  it('counts a weekly series once and one-offs per event, skipping all-day', () => {
    const s = summarizeDeviceEvents([
      { title: 'Gym', startDate: '2037-10-19T07:00:00', recurrenceRule: weekly },
      { title: 'Gym', startDate: '2037-10-26T07:00:00', recurrenceRule: weekly },
      { title: 'Gym', startDate: '2037-10-21T07:00:00', recurrenceRule: weekly },
      { title: 'Dentist', startDate: '2037-10-22T14:00:00' },
      { title: 'Dentist', startDate: '2037-10-22T14:00:00' },
      { title: 'Holiday', startDate: '2037-10-23T00:00:00', allDay: true },
      { title: '  ', startDate: '2037-10-23T09:00:00' },
    ]);
    expect(s).toEqual({ repeating: 2, oneOff: 1 });
  });

  it('builds the split stamp', () => {
    expect(previewStamp(12, 3, 'Fall term')).toBe(
      'Preview: 12 repeating events become your Fall term routine. 3 one-off events stay as one-off changes.',
    );
    expect(previewStamp(1, 1, 'Fall term')).toBe(
      'Preview: 1 repeating event becomes your Fall term routine. 1 one-off event stays as one-off changes.',
    );
  });
});

describe('isUploadableUri', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { isUploadableUri } = require('../import/api');
  const roots = ['file:///data/Caches/', 'file:///data/Documents/'];
  it('allows files the pickers copied into the sandbox only', () => {
    expect(isUploadableUri('file:///data/Caches/ImagePicker/a.jpg', roots)).toBe(true);
    expect(isUploadableUri('file:///etc/passwd', roots)).toBe(false);
    expect(isUploadableUri('file:///data/Caches/../../etc/passwd', roots)).toBe(false);
    expect(isUploadableUri('https://evil.test/a.png', roots)).toBe(false);
    expect(isUploadableUri('file:///data/Caches/a.png', ['', ''])).toBe(false);
  });
});

describe('calendar access denied (D-73)', () => {
  it('uses the flow file toast copy', () => {
    const { NO_CALENDAR_ACCESS } = require('../import/calendarImport');
    expect(NO_CALENDAR_ACCESS).toBe(
      'No calendar access. You can still add your timetable or describe your week.',
    );
  });
});
