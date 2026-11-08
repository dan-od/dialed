import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DEVICE_PREFS } from '@dialed/contracts';
import { resolveDay, type ScheduleData } from '@dialed/schedule';
import { lineAt } from '../glance/lineText';
import { buildSnapshot } from '../glance/snapshot';

// Flow 08 step 2: the TS side and the Swift side must agree.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedData } = require('../../../../packages/schedule/test/seed');

const M = join(__dirname, '..', '..');
const FIXTURE = join(M, 'native-tests/glance/fixtures/snapshot-v1.json');
const LINE_CASES = join(M, 'native-tests/glance/fixtures/line-cases.json');

/** Monday 2037-10-19 without its last block (a skip override): the day ends at 8:15 pm. */
function skipLast(data: ScheduleData): ScheduleData {
  const last = resolveDay('2037-10-19', data).blocks.at(-1)!;
  return {
    ...data,
    overrides: [
      ...data.overrides,
      {
        id: 'skip-last',
        on_date: '2037-10-19',
        kind: 'skip',
        routine_block_id: last.routine_block_id,
        title: null,
        start_min: null,
        end_min: null,
        category_id: null,
        moved_to_date: null,
        note: null,
        deleted_at: null,
      },
    ],
  };
}

/** Inputs for the Swift LineText parity test: snapshots plus the TS answer at many instants. */
function lineCases() {
  const TZ = 'America/Toronto';
  const made = new Date('2037-10-19T04:00:00.000Z'); // Mon 12:00 am EDT
  const data = seedData();
  const snapshots = {
    live: buildSnapshot(data, DEFAULT_DEVICE_PREFS, TZ, made),
    line: buildSnapshot(data, { ...DEFAULT_DEVICE_PREFS, lock_mode: 'line' }, TZ, made),
    off: buildSnapshot(data, { ...DEFAULT_DEVICE_PREFS, line_on: false }, TZ, made),
    early: buildSnapshot(skipLast(data), DEFAULT_DEVICE_PREFS, TZ, made),
    empty: buildSnapshot(
      { ...data, routineBlocks: [], overrides: [] },
      DEFAULT_DEVICE_PREFS,
      TZ,
      made,
    ),
  };
  type Case = { snapshot: keyof typeof snapshots | 'none'; now: string; expected: string };
  const cases: Case[] = [];
  const add = (snapshot: Case['snapshot'], now: Date) =>
    cases.push({
      snapshot,
      now: now.toISOString(),
      expected: lineAt(snapshot === 'none' ? null : snapshots[snapshot], now),
    });
  // Every 5 minutes from Monday 12:00 am to Wednesday 1:00 am local, both lock modes.
  for (let t = made.getTime(); t <= made.getTime() + 49 * 3600_000; t += 5 * 60_000) {
    add('live', new Date(t));
    add('line', new Date(t));
  }
  // 9:00 pm, 9:55 pm and 10:05 pm on the short Monday: "Day done", then tomorrow's first work block.
  for (const iso of ['2037-10-20T01:00:00Z', '2037-10-20T01:55:00Z', '2037-10-20T02:05:00Z'])
    add('early', new Date(iso));
  const at = new Date('2037-10-19T21:30:00Z');
  add('off', at);
  add('empty', at);
  add('none', at);
  return { snapshots, cases };
}

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

  it('the Swift LineText parity cases are what lineAt says (UPDATE_FIXTURES=1 rewrites them)', () => {
    const json = JSON.stringify(lineCases());
    if (process.env.UPDATE_FIXTURES) writeFileSync(LINE_CASES, json + '\n');
    const cases = JSON.parse(json).cases as { expected: string }[];
    // The sweep covers every line state.
    for (const p of [
      'Then ',
      ' left, then ',
      ' left',
      'Next: ',
      'Last block today',
      'Day done',
      'Tomorrow: ',
      'Open Dialed to refresh',
      'Set up your week in Dialed',
      'Sign in to Dialed',
    ])
      expect(cases.some((c) => c.expected.includes(p))).toBe(true);
    expect(cases.some((c) => c.expected === '')).toBe(true);
    expect(readFileSync(LINE_CASES, 'utf8').trim()).toBe(json);
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
