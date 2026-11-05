import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { login, makeApp, OWNER, type TestApp, TEST_NOW } from './helpers';

let t: TestApp;
let owner: Awaited<ReturnType<typeof login>>;
beforeAll(async () => {
  t = await makeApp({}, undefined, TEST_NOW);
  owner = await login(t, OWNER.email);
});
afterAll(async () => {
  await cleanup();
  await t.close();
});

const auth = (s: { access_token: string }) => ({ authorization: `Bearer ${s.access_token}` });

async function cleanup() {
  await t.db.execute(
    sql`delete from plan_changes where plan_id in (select id from plans where user_id = ${OWNER.id})`,
  );
  await t.db.execute(
    sql`delete from plan_messages where plan_id in (select id from plans where user_id = ${OWNER.id})`,
  );
  await t.db.execute(sql`delete from plans where user_id = ${OWNER.id}`);
  await t.db.execute(sql`delete from usage_counters where user_id = ${OWNER.id}`);
}

describe('POST /v1/imports/timetable', () => {
  it('reads a PNG timetable and creates a ready plan with 6 classes', async () => {
    await cleanup();
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fakeImage = Buffer.concat([pngHeader, Buffer.alloc(100)]);

    const boundary = '----dialed-test-boundary';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="timetable.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      fakeImage,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const r = await t.app.inject({
      method: 'POST',
      url: '/v1/imports/timetable',
      headers: {
        ...auth(owner),
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'idempotency-key': 'test-timetable-1',
      },
      payload: body,
    });

    expect(r.statusCode).toBe(201);
    const plan = r.json();
    expect(plan.source).toBe('timetable');
    expect(plan.status).toBe('ready');
    expect(plan.changes.length).toBe(6);
    expect(plan.changes[0].title).toContain('Advanced Networking I');

    await cleanup();
  });

  it('rejects a .exe renamed to .pdf (bad magic bytes)', async () => {
    const exeHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ PE header
    const fakeExe = Buffer.concat([exeHeader, Buffer.alloc(100)]);

    const boundary = '----dialed-test-boundary';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="timetable.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      fakeExe,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const r = await t.app.inject({
      method: 'POST',
      url: '/v1/imports/timetable',
      headers: {
        ...auth(owner),
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'idempotency-key': 'test-timetable-exe',
      },
      payload: body,
    });

    expect(r.statusCode).toBe(400);
    const err = r.json();
    expect(err.error.code).toBe('file_unsupported');
  });

  it('rejects a file over 15 MB', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const bigFile = Buffer.concat([pngHeader, Buffer.alloc(16 * 1024 * 1024)]);

    const boundary = '----dialed-test-boundary';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="huge.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      bigFile,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const r = await t.app.inject({
      method: 'POST',
      url: '/v1/imports/timetable',
      headers: {
        ...auth(owner),
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'idempotency-key': 'test-timetable-big',
      },
      payload: body,
    });

    expect([400, 413]).toContain(r.statusCode);
  });

  it('enforces daily import limit', async () => {
    await cleanup();
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fakeImage = Buffer.concat([pngHeader, Buffer.alloc(100)]);

    for (let i = 0; i < 6; i++) {
      const boundary = `----dialed-test-boundary-${i}`;
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="timetable.png"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        fakeImage,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      await t.app.inject({
        method: 'POST',
        url: '/v1/imports/timetable',
        headers: {
          ...auth(owner),
          'content-type': `multipart/form-data; boundary=${boundary}`,
          'idempotency-key': `test-limit-${i}`,
        },
        payload: body,
      });
    }

    const boundary = '----dialed-test-boundary-over';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="timetable.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      fakeImage,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const r = await t.app.inject({
      method: 'POST',
      url: '/v1/imports/timetable',
      headers: {
        ...auth(owner),
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'idempotency-key': 'test-limit-over',
      },
      payload: body,
    });

    expect(r.statusCode).toBe(429);
    await cleanup();
  });
});

describe('POST /v1/imports/calendar', () => {
  it('imports weekly recurring events as routine blocks', async () => {
    await cleanup();
    const events = [
      {
        title: 'Team standup',
        start: '2037-10-20T09:00:00.000Z',
        end: '2037-10-20T09:30:00.000Z',
        rrule: 'FREQ=WEEKLY',
        calendar: 'Work',
      },
      {
        title: 'Yoga',
        start: '2037-10-21T18:00:00.000Z',
        end: '2037-10-21T19:00:00.000Z',
        rrule: 'FREQ=WEEKLY',
        calendar: 'Personal',
      },
    ];

    const r = await t.app.inject({
      method: 'POST',
      url: '/v1/imports/calendar',
      headers: { ...auth(owner), 'idempotency-key': 'test-cal-1' },
      payload: { events },
    });

    expect(r.statusCode).toBe(201);
    const plan = r.json();
    expect(plan.source).toBe('calendar');
    expect(plan.status).toBe('ready');
    expect(plan.changes.length).toBeGreaterThanOrEqual(2);

    const standup = plan.changes.find((c: Record<string, unknown>) => c.title === 'Team standup');
    expect(standup).toBeDefined();
    expect(standup.payload.repeat).toBeDefined();

    await cleanup();
  });

  it('imports one-off events', async () => {
    await cleanup();
    const events = [
      {
        title: 'Doctor appointment',
        start: '2037-10-22T14:00:00.000Z',
        end: '2037-10-22T15:00:00.000Z',
      },
    ];

    const r = await t.app.inject({
      method: 'POST',
      url: '/v1/imports/calendar',
      headers: { ...auth(owner), 'idempotency-key': 'test-cal-oneoff' },
      payload: { events },
    });

    expect(r.statusCode).toBe(201);
    const plan = r.json();
    const appt = plan.changes.find(
      (c: Record<string, unknown>) => c.title === 'Doctor appointment',
    );
    expect(appt).toBeDefined();
    expect(appt.payload.on_date).toBe('2037-10-22');

    await cleanup();
  });

  it('rejects empty events array', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/v1/imports/calendar',
      headers: { ...auth(owner), 'idempotency-key': 'test-cal-empty' },
      payload: { events: [] },
    });

    expect(r.statusCode).toBe(400);
  });
});
