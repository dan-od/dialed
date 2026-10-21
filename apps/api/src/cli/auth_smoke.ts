// Gate 2 authorization smoke. Every check uses real tokens against the running API.
// A sub-check that needs a flow not built yet is `null` (UNVERIFIED) — never counted as a pass.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JwtService } from '../auth/jwt';

const API = process.env.API_URL!;
const ROOT = resolve(import.meta.dirname, '../../../..');
const OUT_DIR = resolve(ROOT, process.env.FLOW_BY_FLOW_REPORT_DIR!);
const PW = 'dialed-dev-password';
const ALICE = 'alice@dialed.test';
const BOB = 'bob@dialed.test';
const BOB_PROBE_BLOCK = '96f203c4-23c4-5601-a29d-e5a23c342087';
const BOB_PLAN = '3f64b5e1-eed2-5e8e-9db2-a6499a142fc6';

type Sub = { id: string; passed: boolean | null; observed?: unknown; reason?: string };

async function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'x-request-id': randomUUID(),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- smoke report reads arbitrary response shapes
  return { status: res.status, json: json as Record<string, any> | null };
}

async function login(email: string) {
  const r = await call('POST', '/v1/auth/login', { body: { email, password: PW } });
  if (r.status !== 200)
    throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json!.access_token as string;
}

const combine = (subs: Sub[]): boolean | null =>
  subs.some((s) => s.passed === false) ? false : subs.every((s) => s.passed === true) ? true : null;

const alice = await login(ALICE);
await login(BOB); // proves bob exists and can sign in

// 1. unauthenticated_denied
const noToken = await call('GET', '/v1/sync/pull?since=0');
const jwt = new JwtService(
  readFileSync(process.env.JWT_PRIVATE_KEY_FILE!, 'utf8'),
  process.env.JWT_KEY_ID ?? 'dev-1',
  process.env.PUBLIC_BASE_URL!,
);
const aliceSub = JSON.parse(Buffer.from(alice.split('.')[1]!, 'base64url').toString()) as {
  sub: string;
  sid: string;
};
const expired = await jwt.sign(
  { sub: aliceSub.sub, sid: aliceSub.sid, scope: 'app' },
  Math.floor(Date.now() / 1000) - 3600,
);
const expiredRes = await call('GET', '/v1/sync/pull?since=0', { token: expired });
const garbage = await call('GET', '/v1/sync/pull?since=0', { token: 'not.a.token' });
const unauth: Sub[] = [
  {
    id: 'no_token_401',
    passed: noToken.status === 401 && noToken.json?.error?.code === 'unauthorized',
    observed: [noToken.status, noToken.json?.error?.code],
  },
  {
    id: 'expired_token_401_token_expired',
    passed: expiredRes.status === 401 && expiredRes.json?.error?.code === 'token_expired',
    observed: [expiredRes.status, expiredRes.json?.error?.code],
  },
  {
    id: 'forged_token_401',
    passed: garbage.status === 401,
    observed: [garbage.status, garbage.json?.error?.code],
  },
];

// 2. wrong_role_denied
const appAtMcp = await call('POST', '/mcp', {
  token: alice,
  body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
});
const wrongRole: Sub[] = [
  { id: 'app_token_at_mcp_401', passed: appAtMcp.status === 401, observed: appAtMcp.status },
  { id: 'mcp_token_at_sync_push_denied', passed: null, reason: 'needs MCP OAuth tokens (flow-07)' },
  {
    id: 'mcp_token_at_plan_approve_denied',
    passed: null,
    reason: 'needs MCP OAuth tokens (flow-07) and plans API (flow-06)',
  },
];

// 3. cross_object_denied
const edit = await call('POST', '/v1/sync/push', {
  token: alice,
  body: {
    mutations: [
      {
        client_mutation_id: randomUUID(),
        entity: 'routine_block_edit',
        block_id: BOB_PROBE_BLOCK,
        base_version: 1,
        effective_from: '2099-01-05',
        fields: { title: 'smoke' },
      },
    ],
  },
});
const ovId = randomUUID();
const ov = await call('POST', '/v1/sync/push', {
  token: alice,
  body: {
    mutations: [
      {
        client_mutation_id: randomUUID(),
        entity: 'override',
        op: 'upsert',
        id: ovId,
        base_version: 0,
        fields: { on_date: '2026-10-19', kind: 'skip', routine_block_id: BOB_PROBE_BLOCK },
      },
    ],
  },
});
const pull = await call('GET', '/v1/sync/pull?since=0&limit=500', { token: alice });
const leaks = JSON.stringify(pull.json ?? {}).includes(BOB_PROBE_BLOCK);
const r0 = edit.json?.results?.[0];
const r1 = ov.json?.results?.[0];
const cross: Sub[] = [
  {
    id: 'sync_push_bob_routine_block_rejected_not_found',
    passed: r0?.status === 'rejected' && r0?.error_code === 'not_found',
    observed: r0,
  },
  {
    id: 'sync_push_override_on_bob_block_rejected_not_found',
    passed: r1?.status === 'rejected' && r1?.error_code === 'not_found',
    observed: r1,
  },
  {
    id: 'sync_pull_never_returns_bob_rows',
    passed: pull.status === 200 && !leaks,
    observed: { status: pull.status, contains_bob_block: leaks },
  },
  {
    id: 'get_bob_plan_404',
    passed: null,
    reason: `GET /v1/plans/${BOB_PLAN} lands with flow-06; an unbuilt route would 404 for the wrong reason`,
  },
  { id: 'mcp_get_schedule_never_returns_bob', passed: null, reason: 'needs /mcp tools (flow-07)' },
];

const report = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  api: API,
  checks: [
    {
      id: 'unauthenticated_denied',
      passed: combine(unauth),
      available_from: 'flow-01',
      sub_checks: unauth,
    },
    {
      id: 'wrong_role_denied',
      passed: combine(wrongRole),
      available_from: 'flow-01 (partial); full from flow-07',
      sub_checks: wrongRole,
    },
    {
      id: 'cross_object_denied',
      passed: combine(cross),
      available_from: 'flow-03 (sync) and flow-06 (plans)',
      sub_checks: cross,
    },
  ],
};
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'authorization.json'), JSON.stringify(report, null, 2) + '\n');
for (const c of report.checks) {
  const label = c.passed === true ? 'PASS' : c.passed === false ? 'FAIL' : 'UNVERIFIED';
  const parts = c.sub_checks
    .map((s) => `${s.id}=${s.passed === null ? 'null' : s.passed}`)
    .join(' ');
  console.log(`${label.padEnd(10)} ${c.id}  [${parts}]`);
}
console.log(`report: ${resolve(OUT_DIR, 'authorization.json')}`);
if (report.checks.some((c) => c.passed === false)) process.exitCode = 1;
