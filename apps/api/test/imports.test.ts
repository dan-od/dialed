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
    const classes = plan.changes.filter((c: { kind: string }) => c.kind === 'new');
    expect(classes.length).toBe(6);
    expect(classes[0].title).toContain('Advanced Networking I');
    // Existing term: an update_term change carries the dates Found classes can edit.
    expect(plan.changes.filter((c: { kind: string }) => c.kind === 'update_term').length).toBe(1);

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

async function uploadPng(fileName: string, key: string) {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const boundary = '----dialed-test-boundary-v';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    pngHeader,
    Buffer.alloc(100),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return t.app.inject({
    method: 'POST',
    url: '/v1/imports/timetable',
    headers: {
      ...auth(owner),
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'idempotency-key': key,
    },
    payload: body,
  });
}

type ChangeDTO = { id: string; ord: number; kind: string; payload: Record<string, unknown> };

describe('timetable read limit is its own counter', () => {
  const day = TEST_NOW().toISOString().slice(0, 10);
  const counters = async () =>
    (
      await t.db.execute<{ plan_runs: number; imports: number }>(
        sql`select plan_runs, imports from usage_counters where user_id = ${OWNER.id}`,
      )
    ).rows[0];

  it('a read counts as an import, not a plan run', async () => {
    await cleanup();
    expect((await uploadPng('timetable.png', 'test-count-1')).statusCode).toBe(201);
    expect((await uploadPng('empty-timetable.png', 'test-count-2')).statusCode).toBe(200);
    expect(await counters()).toMatchObject({ plan_runs: 0, imports: 2 });
    await cleanup();
  });

  it('AI plan runs do not block timetable reads; 6 imports do', async () => {
    await cleanup();
    await t.db.execute(sql`insert into usage_counters (user_id, day, plan_runs, imports)
      values (${OWNER.id}, ${day}, 20, 0)`);
    expect((await uploadPng('timetable.png', 'test-limit-runs')).statusCode).toBe(201);
    await t.db.execute(sql`update usage_counters set imports = 6 where user_id = ${OWNER.id}`);
    const r = await uploadPng('timetable.png', 'test-limit-imports');
    expect(r.statusCode).toBe(429);
    expect(r.json().error.message).toContain("today's 6 timetable reads");
    await cleanup();
  });
});

describe('timetable read results (Flow 02 Found classes)', () => {
  it('a read with no classes returns a failed plan marked nothing_found', async () => {
    await cleanup();
    const r = await uploadPng('empty-timetable.png', 'test-empty');
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe('failed');
    expect(r.json().error_code).toBe('nothing_found');
    await cleanup();
  });

  it('low-confidence checks name the exact change by position', async () => {
    await cleanup();
    const r = await uploadPng('partial-timetable.png', 'test-partial');
    expect(r.statusCode).toBe(201);
    const plan = r.json();
    const low = plan.checks.filter((c: { id: string }) => c.id.startsWith('low_confidence:'));
    expect(low.length).toBe(2);
    const marked = low.map((c: { id: string }) => {
      const ord = Number(c.id.split(':')[1]);
      return plan.changes.find((ch: ChangeDTO) => ch.ord === ord);
    });
    expect(marked.map((ch: { title: string }) => ch.title)).toEqual([
      expect.stringContaining('Cryptography'),
      expect.stringContaining('(tutorial)'),
    ]);
    expect(marked.every((ch: ChangeDTO) => ch.kind === 'new')).toBe(true);
    await cleanup();
  });

  it("editing the term dates moves the classes' repeat dates with them", async () => {
    await cleanup();
    const r = await uploadPng('timetable.png', 'test-dates');
    const plan = r.json();
    const term = plan.changes.find((c: ChangeDTO) => c.kind === 'update_term') as ChangeDTO;
    const p = await t.app.inject({
      method: 'PATCH',
      url: `/v1/plans/${plan.id}/changes/${term.id}`,
      headers: auth(owner),
      payload: { payload: { starts_on: '2037-09-07', ends_on: '2037-12-18' } },
    });
    expect(p.statusCode).toBeLessThan(300);
    const g = await t.app.inject({
      method: 'GET',
      url: `/v1/plans/${plan.id}`,
      headers: auth(owner),
    });
    const classes = g.json().changes.filter((c: ChangeDTO) => c.kind === 'new') as ChangeDTO[];
    expect(classes.length).toBe(6);
    for (const c of classes) {
      expect(c.payload.repeat).toMatchObject({ from: '2037-09-07', until: '2037-12-18' });
    }
    const bad = await t.app.inject({
      method: 'PATCH',
      url: `/v1/plans/${plan.id}/changes/${term.id}`,
      headers: auth(owner),
      payload: { payload: { starts_on: '2037-12-20', ends_on: '2037-12-18' } },
    });
    expect(bad.statusCode).toBe(400);
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
