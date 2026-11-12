import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { makeApp, OWNER, TEST_NOW, type TestApp } from './helpers';
import { initRunner, startPlanRun } from '../src/plans/runner';
import type { PlanService } from '../src/plans/service';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp({}, undefined, TEST_NOW);
  initRunner(t.config);
});
afterAll(async () => {
  await t.db.execute(
    sql`delete from plans where user_id = ${OWNER.id} and request_text = 'SECRET-REQUEST-TEXT'`,
  );
  await t.close();
});

describe('a failed run says why (homelab b7d52c9d)', () => {
  it('logs message, code, status, body, stack, provider, model and turns, with keys redacted and no request text', async () => {
    const planId = randomUUID();
    await t.db
      .execute(sql`insert into plans (id, user_id, source, provider, request_text, status, base_revision,
      provider_mode, version) values (${planId}, ${OWNER.id}, 'in_app', 'fixture', 'SECRET-REQUEST-TEXT',
      'drafting', 0, 'server', 1)`);
    const logs: Record<string, unknown>[] = [];
    const exploding = {
      storeResult: async () => {
        throw Object.assign(new Error('boom with sk-ant-abcdefghijklmnop'), {
          code: 'E_BOOM',
          status: 418,
          body: '{"error":"x-api-key sk-ant-zzzzzzzzzzzzzz rejected"}',
        });
      },
    } as unknown as PlanService;

    await startPlanRun({
      db: t.db,
      config: t.config,
      planService: exploding,
      planId,
      userId: OWNER.id,
      requestText: 'SECRET-REQUEST-TEXT',
      timeZone: 'America/Toronto',
      now: TEST_NOW,
      providerMode: 'server',
      log: (o) => logs.push(o),
    });

    const line = logs.find((l) => l.status === 'failed')!;
    expect(line).toMatchObject({
      kind: 'plan.run',
      provider: 'fixture',
      errorCode: 'server_error',
    });
    expect(line.turns).toBeGreaterThanOrEqual(1);
    expect(line.contextTokens).toBeGreaterThan(0);
    const error = line.error as Record<string, string | number>;
    expect(error.message).toContain('boom');
    expect(error).toMatchObject({ code: 'E_BOOM', status: 418 });
    expect(String(error.body)).toContain('rejected');
    expect(String(error.stack)).toContain('runner.failure.test');
    const text = JSON.stringify(line);
    expect(text).not.toContain('abcdefghijklmnop');
    expect(text).not.toContain('zzzzzzzzzzzzzz');
    expect(text).not.toContain('SECRET-REQUEST-TEXT');

    const {
      rows: [plan],
    } = await t.db.execute<Record<string, unknown>>(
      sql`select status, error_code from plans where id = ${planId}`,
    );
    expect(plan).toMatchObject({ status: 'failed', error_code: 'server_error' });
  });
});
