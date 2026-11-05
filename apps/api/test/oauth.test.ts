import { createHash } from 'node:crypto';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { makeApp, login, ALICE, DEV_PASSWORD, type TestApp } from './helpers';

let t: TestApp;
let aliceToken: string;

beforeAll(async () => {
  t = await makeApp({ MCP_ENABLED: true });
  const r = await login(t, ALICE.email, DEV_PASSWORD);
  aliceToken = r.access_token;
});

afterAll(async () => {
  await t?.close();
});

describe('OAuth discovery', () => {
  it('GET /.well-known/oauth-protected-resource', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource' });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.scopes_supported).toContain('schedule:read');
    expect(body.bearer_methods_supported).toContain('header');
  });

  it('GET /.well-known/oauth-authorization-server', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.code_challenge_methods_supported).toEqual(['S256']);
    expect(body.grant_types_supported).toContain('authorization_code');
  });
});

describe('Dynamic Client Registration', () => {
  it('registers a client', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/oauth/register',
      payload: {
        client_name: 'Test Client',
        redirect_uris: ['https://example.com/callback'],
      },
    });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    expect(body.client_id).toMatch(/^dialed_/);
    expect(body.client_name).toBe('Test Client');
  });

  it('rejects missing redirect_uris', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/oauth/register',
      payload: { client_name: 'No URIs', redirect_uris: [] },
    });
    expect(r.statusCode).toBe(400);
  });

  it('rejects http non-loopback redirect', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/oauth/register',
      payload: { client_name: 'Bad', redirect_uris: ['http://evil.com/callback'] },
    });
    expect(r.statusCode).toBe(400);
  });

  it('allows loopback redirect', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/oauth/register',
      payload: { client_name: 'Local', redirect_uris: ['http://localhost:9999/callback'] },
    });
    expect(r.statusCode).toBe(201);
  });
});

describe('Authorization flow', () => {
  it('GET /oauth/authorize requires response_type=code', async () => {
    const r = await t.app.inject({
      method: 'GET',
      url: '/oauth/authorize?response_type=token&client_id=x&redirect_uri=https://x.com&code_challenge=abc&code_challenge_method=S256',
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('response_type=code');
  });

  it('renders sign-in page with valid params', async () => {
    const r = await t.app.inject({
      method: 'GET',
      url: '/oauth/authorize?response_type=code&client_id=x&redirect_uri=https://x.com/cb&code_challenge=abc&code_challenge_method=S256',
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
    expect(r.body).toContain('csrf_token');
  });
});

describe('Full OAuth code flow', () => {
  it('register → authorize → token → verify', async () => {
    // 1. Register client
    const reg = await t.app.inject({
      method: 'POST',
      url: '/oauth/register',
      payload: {
        client_name: 'Flow Test',
        redirect_uris: ['https://test.example.com/callback'],
      },
    });
    const clientId = reg.json().client_id as string;

    // 2. Generate PKCE
    const codeVerifier = 'test_verifier_string_with_enough_entropy_for_s256';
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

    // 3. GET authorize to get CSRF
    const authGet = await t.app.inject({
      method: 'GET',
      url: `/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent('https://test.example.com/callback')}&code_challenge=${codeChallenge}&code_challenge_method=S256&state=xyz`,
    });
    const csrfMatch = authGet.body.match(/name="csrf_token" value="([^"]+)"/);
    expect(csrfMatch).toBeTruthy();
    const csrf = csrfMatch![1];

    // 4. POST signin
    const signin = await t.app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `csrf_token=${csrf}&email=${ALICE.email}&password=${DEV_PASSWORD}&action=signin`,
    });
    expect(signin.statusCode).toBe(200);
    expect(signin.body).toContain('consent');
    const consentCsrf = signin.body.match(/name="csrf_token" value="([^"]+)"/)?.[1];
    expect(consentCsrf).toBeTruthy();

    // 5. POST allow (consent)
    const allow = await t.app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `csrf_token=${consentCsrf}&action=allow`,
    });
    expect(allow.statusCode).toBe(302);
    const location = allow.headers.location as string;
    expect(location).toContain('test.example.com/callback');
    const callbackUrl = new URL(location);
    expect(callbackUrl.searchParams.get('state')).toBe('xyz');
    const code = callbackUrl.searchParams.get('code');
    expect(code).toBeTruthy();

    // 6. Exchange code for tokens
    const tokenRes = await t.app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `grant_type=authorization_code&client_id=${clientId}&code=${code}&redirect_uri=${encodeURIComponent('https://test.example.com/callback')}&code_verifier=${codeVerifier}`,
    });
    expect(tokenRes.statusCode).toBe(200);
    const tokens = tokenRes.json();
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.token_type).toBe('bearer');
    expect(tokens.expires_in).toBe(3600);

    // 7. Refresh token
    const refreshRes = await t.app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `grant_type=refresh_token&client_id=${clientId}&refresh_token=${tokens.refresh_token}`,
    });
    expect(refreshRes.statusCode).toBe(200);
    const newTokens = refreshRes.json();
    expect(newTokens.access_token).not.toBe(tokens.access_token);

    // 8. Reuse old refresh token → family revoked
    const reuseRes = await t.app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `grant_type=refresh_token&client_id=${clientId}&refresh_token=${tokens.refresh_token}`,
    });
    expect(reuseRes.statusCode).toBe(400);

    // 9. Connector list shows the client
    const connList = await t.app.inject({
      method: 'GET',
      url: '/v1/connector',
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(connList.statusCode).toBe(200);
    const connectors = connList.json().connectors as { client_id: string }[];
    expect(connectors.some((c) => c.client_id === clientId)).toBe(true);

    // 10. Disconnect
    const disc = await t.app.inject({
      method: 'DELETE',
      url: `/v1/connector/${clientId}`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(disc.statusCode).toBe(204);
  });
});

describe('MCP endpoint', () => {
  it('rejects unauthenticated requests', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(r.statusCode).toBe(401);
  });

  it('rejects app JWT at /mcp', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(r.statusCode).toBe(401);
  });

  it('returns 404 when MCP_ENABLED=false', async () => {
    const t2 = await makeApp({ MCP_ENABLED: false });
    try {
      const r = await t2.app.inject({
        method: 'POST',
        url: '/mcp',
        payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      });
      expect(r.statusCode).toBe(404);
    } finally {
      await t2.close();
    }
  });
});

describe('Connector test-draft', () => {
  it('creates a sample plan', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/v1/connector/test-draft',
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().plan_id).toBeTruthy();
  });
});
