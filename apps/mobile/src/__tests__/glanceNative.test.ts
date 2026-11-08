import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DEVICE_PREFS } from '@dialed/contracts';
import { buildSnapshot } from '../glance/snapshot';

// Flow 08 step 2: the TS side and the Swift side must agree.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedData } = require('../../../../packages/schedule/test/seed');

const M = join(__dirname, '..', '..');
const FIXTURE = join(M, 'native-tests/glance/fixtures/snapshot-v1.json');

describe('native parity', () => {
  it('the Swift decode fixture is exactly what buildSnapshot writes (UPDATE_FIXTURES=1 rewrites it)', () => {
    const json = JSON.stringify(
      buildSnapshot(
        seedData(),
        DEFAULT_DEVICE_PREFS,
        'America/Toronto',
        new Date('2037-10-19T17:15:00.000Z'),
      ),
    );
    if (process.env.UPDATE_FIXTURES) writeFileSync(FIXTURE, json + '\n');
    expect(readFileSync(FIXTURE, 'utf8').trim()).toBe(json);
  });

  it('BlockActivityAttributes.swift is identical in the module and the widget target', () => {
    const a = readFileSync(
      join(M, 'modules/dialed-native/ios/BlockActivityAttributes.swift'),
      'utf8',
    );
    const b = readFileSync(join(M, 'targets/widgets/BlockActivityAttributes.swift'), 'utf8');
    expect(b).toBe(a);
    // Same fields as packages/contracts/src/liveActivity.ts.
    for (const f of [
      'blockKey',
      'title',
      'categoryColorHex',
      'startsAt',
      'endsAt',
      'next',
      'durationMin',
    ])
      expect(a).toContain(`var ${f}:`);
  });

  it('the widget reads the same App Group the app writes', () => {
    const plist = readFileSync(join(M, 'targets/widgets/Info.plist'), 'utf8');
    const group = /<key>DialedAppGroup<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require('../../app.config').default;
    expect(group).toBe('group.me.okoro.dialed');
    expect(config.ios.infoPlist.DialedAppGroup).toBe(group);
    expect(config.ios.entitlements['com.apple.security.application-groups']).toEqual([group]);
  });
});
