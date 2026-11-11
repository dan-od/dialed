// The API URL is baked into the app at build time (expo-constants evaluates app.config.ts in the Xcode build phase).
// A Release build must reach the home lab with no Metro and no shell env (Xcode GUI builds don't inherit it).
const ENV_KEYS = ['DIALED_API_URL', 'CONFIGURATION'] as const;

function load(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try {
    let cfg: { extra?: { apiBaseUrl?: string } } = {};
    jest.isolateModules(() => {
      cfg = require('../../app.config').default;
    });
    return cfg.extra?.apiBaseUrl;
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

describe('app.config apiBaseUrl', () => {
  it('uses the home lab in a Release build with no env', () => {
    expect(load({ CONFIGURATION: 'Release' })).toBe('https://dialed.okoro.me');
  });
  it('lets DIALED_API_URL override any configuration', () => {
    expect(load({ CONFIGURATION: 'Release', DIALED_API_URL: 'https://staging.example.test' })).toBe(
      'https://staging.example.test',
    );
    expect(load({ DIALED_API_URL: 'http://192.168.10.5:8080' })).toBe('http://192.168.10.5:8080');
  });
  it('keeps the Mac API for Debug and dev-server builds', () => {
    expect(load({ CONFIGURATION: 'Debug' })).toBe('http://localhost:8080');
    expect(load({})).toBe('http://localhost:8080');
  });
});
