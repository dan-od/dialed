// D-35 screens stay behind a flag. Bare (dev-client) builds read Constants.expoConfig baked in at build time, so
// the flag must come from an EXPO_PUBLIC_ variable that Metro inlines when it bundles.
describe('feature flags', () => {
  const load = () => {
    let f: { d35Screens: boolean } | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      f = require('../config').FEATURES;
    });
    return f!;
  };
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_FEATURE_D35;
  });
  it('off by default', () => {
    expect(load().d35Screens).toBe(false);
  });
  it('on when EXPO_PUBLIC_FEATURE_D35=true at bundle time', () => {
    process.env.EXPO_PUBLIC_FEATURE_D35 = 'true';
    expect(load().d35Screens).toBe(true);
  });
});
