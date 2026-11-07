// Flow 07 proof: OAuth edge cases, audience binding, cross-user isolation, propose_changes
// (invalid → errors only, valid → ready plan + push.chat_draft, revise, plan_not_ready) and
// disconnect revoking live MCP tokens.
import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import {
  makeApp,
  login,
  ALICE,
  BOB,
  BOB_PROBE_BLOCK,
  DEV_PASSWORD,
  TEST_NOW,
  type TestApp,
} from './helpers';

const REDIRECT = 'https://proof.example.com/callback';
const ALICE_STUDY = '64251711-ded6-5b6f-ad18-bc84900fc568';

let t: TestApp;

beforeAll(async () => {
  t = await makeApp({ MCP_ENABLED: true }, undefined, TEST_NOW);
});

afterAll(async () => {
  await t?.close();
});

const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

// The DB-backed registration limit (10/h per IP) persists across runs: each test client gets its own IP.
const freshIp = () => `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 250) + 1).join('.')}`;

async function register(name = 'Proof Client') {
  const r = await t.app.inject({
    method: 'POST',
    url: '/oauth/register',
    remoteAddress: freshIp(),
    payload: { client_name: name, redirect_uris: [REDIRECT] },
  });
  expect(r.statusCode).toBe(201);
  return r.json().client_id as string;
}

/** Sign in + allow; returns the authorization code and the PKCE verifier. */
async function authorize(clientId: string, email: string) {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = form({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 's1',
  });
  const get = await t.app.inject({ method: 'GET', url: `/oauth/authorize?${q}` });
  const csrf = get.body.match(/name="csrf_token" value="([^"]+)"/)![1]!;
  const signin = await t.app.inject({
    method: 'POST',
    url: '/oauth/authorize',
    headers: FORM,
    payload: form({ csrf_token: csrf, email, password: DEV_PASSWORD, action: 'signin' }),
  });
  const csrf2 = signin.body.match(/name="csrf_token" value="([^"]+)"/)![1]!;
  const allow = await t.app.inject({
    method: 'POST',
    url: '/oauth/authorize',
    headers: FORM,
    payload: form({ csrf_token: csrf2, action: 'allow' }),
  });
  expect(allow.statusCode).toBe(302);
  const code = new URL(allow.headers.location as string).searchParams.get('code')!;
  return { code, verifier };
}

async function exchange(clientId: string, code: string, verifier: string, redirect = REDIRECT) {
  return t.app.inject({
    method: 'POST',
    url: '/oauth/token',
    headers: FORM,
    payload: form({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirect,
      code_verifier: verifier,
    }),
  });
}

async function connect(email: string, name?: string) {
  const clientId = await register(name);
  const { code, verifier } = await authorize(clientId, email);
  const r = await exchange(clientId, code, verifier);
  expect(r.statusCode).toBe(200);
  return { clientId, access: r.json().access_token as string };
}

async function mcp(token: string, method: string, params: Record<string, unknown> = {}) {
  const res = await t.app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    payload: { jsonrpc: '2.0', id: 1, method, params },
  });
  if (res.statusCode !== 200) return { status: res.statusCode, body: res.body };
  const data = res.body
    .split('\n')
    .find((l) => l.startsWith('data: '))
    ?.slice(6);
  return { status: 200, json: JSON.parse(data ?? res.body) };
}

async function tool(token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await mcp(token, 'tools/call', { name, arguments: args });
  expect(r.status).toBe(200);
  const result = r.json.result as { content: { text: string }[]; isError?: boolean };
  return { ...JSON.parse(result.content[0]!.text), isError: !!result.isError } as Record<
    string,
    unknown
  > & { isError: boolean };
}

const validChange = (title: string) => ({
  kind: 'new',
  title,
  category_id: ALICE_STUDY,
  on_date: '2037-10-24',
  start: '06:00',
  end: '06:30',
  note: 'Proof block.',
});

describe('OAuth edge cases', () => {
  it('limits registration to 10 per hour per IP', async () => {
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await t.app.inject({
        method: 'POST',
        url: '/oauth/register',
        remoteAddress: ip,
        payload: { client_name: `Spam ${i}`, redirect_uris: [REDIRECT] },
      });
      codes.push(r.statusCode);
    }
    expect(codes.slice(0, 10).every((c) => c === 201)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('refuses an unknown client_id at /oauth/authorize', async () => {
    const q = form({
      response_type: 'code',
      client_id: 'dialed_nope',
      redirect_uri: REDIRECT,
      code_challenge: 'x'.repeat(43),
      code_challenge_method: 'S256',
    });
    const r = await t.app.inject({ method: 'GET', url: `/oauth/authorize?${q}` });
    expect(r.statusCode).toBe(400);
  });

  it('consent shows the client name and the redirect host', async () => {
    const clientId = await register('Claude');
    const q = form({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: 'x'.repeat(43),
      code_challenge_method: 'S256',
    });
    const get = await t.app.inject({ method: 'GET', url: `/oauth/authorize?${q}` });
    const csrf = get.body.match(/name="csrf_token" value="([^"]+)"/)![1]!;
    const signin = await t.app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: FORM,
      payload: form({
        csrf_token: csrf,
        email: ALICE.email,
        password: DEV_PASSWORD,
        action: 'signin',
      }),
    });
    expect(signin.body).toContain('>Claude</span> wants to use');
    expect(signin.body).toContain('proof.example.com');
    expect(signin.body).not.toContain(clientId);
  });

  it('refuses a wrong PKCE verifier', async () => {
    const clientId = await register();
    const { code } = await authorize(clientId, ALICE.email);
    const r = await exchange(clientId, code, randomBytes(32).toString('base64url'));
    expect(r.statusCode).toBe(400);
  });

  it('refuses a redirect_uri that does not match exactly at the token endpoint', async () => {
    const clientId = await register();
    const { code, verifier } = await authorize(clientId, ALICE.email);
    const r = await exchange(clientId, code, verifier, `${REDIRECT}/extra`);
    expect(r.statusCode).toBe(400);
  });

  it('refuses an unregistered redirect_uri at /oauth/authorize (no open redirect)', async () => {
    const clientId = await register();
    const q = form({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'https://evil.example.com/callback',
      code_challenge: 'x'.repeat(43),
      code_challenge_method: 'S256',
    });
    const r = await t.app.inject({ method: 'GET', url: `/oauth/authorize?${q}` });
    expect(r.statusCode).toBe(400);
    expect(r.headers.location).toBeUndefined();
  });

  it('refuses plain PKCE', async () => {
    const clientId = await register();
    const q = form({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: 'x'.repeat(43),
      code_challenge_method: 'plain',
    });
    const r = await t.app.inject({ method: 'GET', url: `/oauth/authorize?${q}` });
    expect(r.statusCode).toBe(400);
  });

  it('a code works once (replay refused)', async () => {
    const clientId = await register();
    const { code, verifier } = await authorize(clientId, ALICE.email);
    expect((await exchange(clientId, code, verifier)).statusCode).toBe(200);
    expect((await exchange(clientId, code, verifier)).statusCode).toBe(400);
  });

  it('refuses a consent POST without the CSRF token', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: FORM,
      payload: form({ action: 'allow' }),
    });
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(r.headers.location).toBeUndefined();
  });

  it('cancel on consent redirects with access_denied and stores no code', async () => {
    const clientId = await register();
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const q = form({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const get = await t.app.inject({ method: 'GET', url: `/oauth/authorize?${q}` });
    const csrf = get.body.match(/name="csrf_token" value="([^"]+)"/)![1]!;
    const signin = await t.app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: FORM,
      payload: form({
        csrf_token: csrf,
        email: ALICE.email,
        password: DEV_PASSWORD,
        action: 'signin',
      }),
    });
    const csrf2 = signin.body.match(/name="csrf_token" value="([^"]+)"/)![1]!;
    const cancel = await t.app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: FORM,
      payload: form({ csrf_token: csrf2, action: 'cancel' }),
    });
    expect(cancel.statusCode).toBe(302);
    const loc = new URL(cancel.headers.location as string);
    expect(loc.searchParams.get('error')).toBe('access_denied');
    expect(loc.searchParams.get('code')).toBeNull();
    const { rows } = await t.pool.query(
      'select count(*)::int n from oauth_codes where client_id = $1',
      [clientId],
    );
    expect(rows[0].n).toBe(0);
  });

  it('stores only token hashes', async () => {
    const { clientId, access } = await connect(ALICE.email);
    const { rows } = await t.pool.query('select * from oauth_tokens where client_id = $1', [
      clientId,
    ]);
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(access);
  });
});

describe('Audit', () => {
  it('every read tool call is audited as ai:<client>', async () => {
    const { access, clientId } = await connect(ALICE.email, 'Audit Reader');
    for (const name of ['list_terms', 'list_categories', 'get_recent_plans']) {
      expect((await tool(access, name)).isError).toBe(false);
    }
    await tool(access, 'get_schedule', { from: '2037-10-19', to: '2037-10-25' });
    const { rows } = await t.pool.query(
      "select target from audit_log where actor = $1 and action = 'mcp_read' order by target",
      [`ai:${clientId}`],
    );
    expect(rows.map((r) => r.target)).toEqual([
      'get_recent_plans',
      'get_schedule',
      'list_categories',
      'list_terms',
    ]);
  });
});

describe('list_categories', () => {
  it("returns the caller's live categories in the tools.md shape", async () => {
    const { access } = await connect(ALICE.email);
    const r = await tool(access, 'list_categories');
    expect(r.isError).toBe(false);
    const cats = r.categories as Record<string, unknown>[];
    const study = cats.find((c) => c.id === ALICE_STUDY)!;
    expect(study).toMatchObject({ name: 'Study', group: 'School' });
    expect(Number.isInteger(study.usual_minutes)).toBe(true);
    expect(Object.keys(study).sort()).toEqual(
      ['color', 'group', 'id', 'name', 'protected', 'quiet', 'usual_minutes'].sort(),
    );
  });
});

describe('Audience binding', () => {
  it('an MCP token is refused by /v1', async () => {
    const { access } = await connect(ALICE.email);
    const r = await t.app.inject({
      method: 'GET',
      url: '/v1/connector',
      headers: { authorization: `Bearer ${access}` },
    });
    expect(r.statusCode).toBe(401);
  });
});

describe('Cross-user isolation', () => {
  it("Alice's connector never sees Bob's rows", async () => {
    const { access } = await connect(ALICE.email);
    const r = await tool(access, 'get_schedule', { from: '2037-10-19', to: '2037-10-25' });
    expect(r.isError).toBe(false);
    const text = JSON.stringify(r);
    expect(text).not.toContain(BOB_PROBE_BLOCK);
    expect(text).not.toContain(BOB.id);
    expect((r.days as unknown[]).length).toBe(7);
  });

  it("Bob's connector cannot draft against Alice's category", async () => {
    const { access } = await connect(BOB.email);
    const r = await tool(access, 'propose_changes', {
      request_text: 'cross-user probe',
      changes: [validChange('Probe')],
    });
    expect(r.status).not.toBe('ready');
  });
});

describe('propose_changes', () => {
  it('invalid → errors to the AI only; the Planner sees no plan and no push', async () => {
    const { access, clientId } = await connect(ALICE.email, 'Invalid Client');
    const r = await tool(access, 'propose_changes', {
      request_text: 'end before start',
      changes: [{ ...validChange('Broken'), start: '10:00', end: '09:00' }],
    });
    expect(r.status).toBe('invalid');
    expect((r.errors as unknown[]).length).toBeGreaterThan(0);
    const { rows } = await t.pool.query(
      'select count(*)::int n from plans where user_id = $1 and provider = $2',
      [ALICE.id, clientId],
    );
    expect(rows[0].n).toBe(0);
  });

  it('valid → ready plan (source=mcp, client_name) + push.chat_draft; revise; plan_not_ready after decision', async () => {
    const { access } = await connect(ALICE.email, 'Proof Chat');
    const app = (await login(t, ALICE.email)).access_token;

    const first = await tool(access, 'propose_changes', {
      request_text: 'add an early study block on Saturday',
      changes: [validChange('Early study')],
    });
    expect(first.status).toBe('ready');
    const proposalId = first.proposal_id as string;

    const {
      rows: [plan],
    } = await t.pool.query(
      'select id, source, client_name, status, version from plans where proposal_id = $1',
      [proposalId],
    );
    expect(plan).toMatchObject({
      source: 'mcp',
      client_name: 'Proof Chat',
      status: 'ready',
      version: 1,
    });

    const { rows: jobs } = await t.pool.query(
      "select payload_json from jobs where kind = 'push.chat_draft' and payload_json->>'plan_id' = $1",
      [plan.id],
    );
    expect(jobs.length).toBe(1);
    expect(jobs[0].payload_json.client_name).toBe('Proof Chat');

    const audit = await t.pool.query(
      "select actor from audit_log where target = $1 and action = 'mcp_propose'",
      [plan.id],
    );
    expect(audit.rows[0].actor).toMatch(/^ai:/);

    // The app sees it with the chat label
    const got = await t.app.inject({
      method: 'GET',
      url: `/v1/plans/${plan.id}`,
      headers: { authorization: `Bearer ${app}` },
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().plan?.client_name ?? got.json().client_name).toBe('Proof Chat');

    // Same proposal_id revises the plan
    const revised = await tool(access, 'propose_changes', {
      proposal_id: proposalId,
      request_text: 'make it two blocks',
      changes: [
        validChange('Early study'),
        { ...validChange('Early review'), start: '06:30', end: '07:00' },
      ],
    });
    expect(revised.status).toBe('ready');
    const {
      rows: [after],
    } = await t.pool.query('select version from plans where id = $1', [plan.id]);
    expect(after.version).toBe(2);
    const changes = await t.pool.query(
      'select count(*)::int n from plan_changes where plan_id = $1',
      [plan.id],
    );
    expect(changes.rows[0].n).toBe(2);

    // Planner discards in the app → the AI gets plan_not_ready
    const disc = await t.app.inject({
      method: 'POST',
      url: `/v1/plans/${plan.id}/discard`,
      headers: { authorization: `Bearer ${app}` },
    });
    expect(disc.statusCode).toBeLessThan(300);
    const late = await tool(access, 'propose_changes', {
      proposal_id: proposalId,
      request_text: 'one more change',
      changes: [validChange('Early study')],
    });
    expect(late.isError).toBe(true);
    expect((late.errors as { code: string }[])[0]!.code).toBe('plan_not_ready');
  });

  it('ask_user is not exposed over MCP', async () => {
    const { access } = await connect(ALICE.email);
    const r = await mcp(access, 'tools/list');
    const names = (r.json.result.tools as { name: string }[]).map((x) => x.name);
    expect(names).not.toContain('ask_user');
    expect(names.sort()).toEqual(
      [
        'get_recent_plans',
        'get_schedule',
        'list_categories',
        'list_terms',
        'propose_changes',
      ].sort(),
    );
  });
});

describe('Disconnect', () => {
  it('DELETE /v1/connector/:clientId revokes live MCP tokens', async () => {
    const { access, clientId } = await connect(ALICE.email, 'Disconnect Me');
    expect((await mcp(access, 'tools/list')).status).toBe(200);
    const app = (await login(t, ALICE.email)).access_token;
    const d = await t.app.inject({
      method: 'DELETE',
      url: `/v1/connector/${clientId}`,
      headers: { authorization: `Bearer ${app}` },
    });
    expect(d.statusCode).toBe(204);
    expect((await mcp(access, 'tools/list')).status).toBe(401);
  });

  it("Bob cannot disconnect Alice's client", async () => {
    const { access, clientId } = await connect(ALICE.email, 'Alice Only');
    const bob = (await login(t, BOB.email)).access_token;
    await t.app.inject({
      method: 'DELETE',
      url: `/v1/connector/${clientId}`,
      headers: { authorization: `Bearer ${bob}` },
    });
    expect((await mcp(access, 'tools/list')).status).toBe(200);
  });

  it('DELETE /v1/connector revokes every client of the caller only', async () => {
    const a1 = await connect(ALICE.email, 'All 1');
    const b1 = await connect(BOB.email, 'Bob keeps');
    const app = (await login(t, ALICE.email)).access_token;
    const d = await t.app.inject({
      method: 'DELETE',
      url: '/v1/connector',
      headers: { authorization: `Bearer ${app}` },
    });
    expect(d.statusCode).toBe(204);
    expect((await mcp(a1.access, 'tools/list')).status).toBe(401);
    expect((await mcp(b1.access, 'tools/list')).status).toBe(200);
  });
});

describe('Route rate limits', () => {
  it('a tripped route limit answers 429 rate_limited with retry-after, not 500', async () => {
    const t2 = await makeApp({ MCP_ENABLED: true, RATE_LIMIT_MULTIPLIER: 1 }, undefined, TEST_NOW);
    try {
      const app = (await login(t2, ALICE.email)).access_token;
      const ip = freshIp();
      const codes: number[] = [];
      let last;
      for (let i = 0; i < 4; i++) {
        last = await t2.app.inject({
          method: 'POST',
          url: '/v1/connector/test-draft',
          remoteAddress: ip,
          headers: { authorization: `Bearer ${app}` },
        });
        codes.push(last.statusCode);
      }
      expect(codes.slice(0, 3)).toEqual([201, 201, 201]);
      expect(last!.statusCode).toBe(429);
      expect(last!.json().error.code).toBe('rate_limited');
      expect(last!.headers['retry-after']).toBeTruthy();
    } finally {
      await t2.close();
    }
  });
});
