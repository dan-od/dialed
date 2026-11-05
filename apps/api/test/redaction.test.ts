import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { login, makeApp, OWNER, type TestApp, TEST_NOW } from './helpers';

const SENTINEL_KEY = 'sk-sentinel-DEADBEEF-do-not-leak-1234567890ab';
const logLines: string[] = [];

let t: TestApp;
let owner: Awaited<ReturnType<typeof login>>;

beforeAll(async () => {
  t = await makeApp(
    {},
    {
      write: (line: string) => {
        logLines.push(line);
      },
    },
    TEST_NOW,
  );
  owner = await login(t, OWNER.email);
});
afterAll(async () => {
  await t.db.execute(
    sql`delete from plan_changes where plan_id in (select id from plans where user_id = ${OWNER.id})`,
  );
  await t.db.execute(
    sql`delete from plan_messages where plan_id in (select id from plans where user_id = ${OWNER.id})`,
  );
  await t.db.execute(sql`delete from plans where user_id = ${OWNER.id}`);
  await t.db.execute(sql`delete from usage_counters where user_id = ${OWNER.id}`);
  await t.close();
});

describe('redaction', () => {
  it('x-provider-key header is redacted from logs', async () => {
    logLines.length = 0;

    await t.app.inject({
      method: 'POST',
      url: '/v1/plans',
      headers: {
        authorization: `Bearer ${owner.access_token}`,
        'x-provider-key': SENTINEL_KEY,
      },
      payload: {
        source: 'in_app',
        request_text:
          'Bible study with Chichi every Wednesday at 7, for the rest of the year. And move Friday Speedwatch to Saturday evening.',
        provider_mode: 'server',
      },
    });

    await new Promise((r) => setTimeout(r, 200));

    const allLogs = logLines.join('\n');
    expect(allLogs).not.toContain(SENTINEL_KEY);
  });

  it('request_text is not stored verbatim in logs', async () => {
    logLines.length = 0;
    const uniqueText = 'UNIQUE_SENTINEL_REQUEST_TEXT_xyz987';

    await t.app.inject({
      method: 'POST',
      url: '/v1/plans',
      headers: { authorization: `Bearer ${owner.access_token}` },
      payload: {
        source: 'in_app',
        request_text: uniqueText,
        provider_mode: 'server',
      },
    });

    await new Promise((r) => setTimeout(r, 200));

    const allLogs = logLines.join('\n');
    expect(allLogs).not.toContain(uniqueText);
  });
});
