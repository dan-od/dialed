import { ApiClient, type TokenSource, type Tokens } from '../api/client';

// Rotating refresh tokens must never be sent twice: the server treats reuse as theft and ends the session.
function setup() {
  let tokens: Tokens = { access_token: 'old', refresh_token: 'r1' };
  const ended = jest.fn();
  const source: TokenSource = {
    current: () => tokens,
    save: async (t) => {
      tokens = t;
    },
    ended: async () => ended(),
  };
  let refreshes = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string>).authorization;
    const reply = (status: number, body: unknown) =>
      ({ status, text: async () => JSON.stringify(body) }) as Response;
    if (url.endsWith('/v1/auth/refresh')) {
      refreshes++;
      await new Promise((r) => setTimeout(r, 5));
      return reply(200, { access_token: 'new', refresh_token: 'r2' });
    }
    return auth === 'Bearer new'
      ? reply(200, { ok: true })
      : reply(401, { error: { code: 'token_expired', message: 'expired' } });
  }) as unknown as typeof fetch;
  return { source, fetchImpl, ended, refreshes: () => refreshes };
}

describe('ApiClient refresh', () => {
  it('concurrent 401s share one refresh', async () => {
    const s = setup();
    const api = new ApiClient('http://x', s.source, s.fetchImpl);
    await Promise.all([api.request('GET', '/a'), api.request('GET', '/b')]);
    expect(s.refreshes()).toBe(1);
  });
  it('two client instances (e.g. after a dev hot reload) still share one refresh of the same token', async () => {
    const s = setup();
    const a = new ApiClient('http://x', s.source, s.fetchImpl);
    const b = new ApiClient('http://x', s.source, s.fetchImpl);
    await Promise.all([a.request('GET', '/a'), b.request('GET', '/b')]);
    expect(s.refreshes()).toBe(1);
    expect(s.ended).not.toHaveBeenCalled();
  });
});
