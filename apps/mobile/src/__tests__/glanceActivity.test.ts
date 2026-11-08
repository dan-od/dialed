import { DEFAULT_DEVICE_PREFS } from '@dialed/contracts';
import { currentActivity, type ScheduleData } from '@dialed/schedule';
import { LiveActivityClient, type ActivityNative, type RunningActivity } from '../glance/activity';

// Flow 08 step 8: the app starts, updates and ends Live Activities and reports tokens (mocked DialedNative).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedData } = require('../../../../packages/schedule/test/seed');

const TZ = 'America/Toronto';
const at1315 = new Date('2037-10-19T17:15:00.000Z'); // Mon 1:15 pm, Sermon Sync 12:40–2:30
const live = DEFAULT_DEVICE_PREFS;

function fakeNative(enabled = true) {
  const running: RunningActivity[] = [];
  const listeners: Record<string, ((e: never) => void)[]> = {};
  const n = {
    running,
    emit: (event: string, e: unknown) => listeners[event]?.forEach((f) => f(e as never)),
    activitiesEnabled: jest.fn(() => enabled),
    runningActivities: jest.fn(() => running.map((r) => ({ ...r }))),
    startActivity: jest.fn(
      async (attrs: { blockKey: string }, state: { endsAt: string }, _localOnly: boolean) => {
        running.push({
          blockKey: attrs.blockKey,
          state: 'active',
          endsAt: state.endsAt.replace('.000Z', 'Z'),
        });
        return 'id-' + attrs.blockKey;
      },
    ),
    updateActivity: jest.fn(async (blockKey: string, state: { endsAt: string }) => {
      running.find((r) => r.blockKey === blockKey)!.endsAt = state.endsAt;
    }),
    endActivity: jest.fn(async (blockKey: string) => {
      running.find((r) => r.blockKey === blockKey)!.state = 'ended';
    }),
    endAllActivities: jest.fn(async () => running.forEach((r) => (r.state = 'ended'))),
    addListener: jest.fn((event: string, fn: (e: never) => void) => {
      (listeners[event] ??= []).push(fn);
      return { remove: () => (listeners[event] = listeners[event]!.filter((f) => f !== fn)) };
    }),
  };
  return n as typeof n & ActivityNative;
}

function fakeApi() {
  return {
    putDevice: jest.fn(async () => ({})),
    putActivity: jest.fn(async () => ({})),
  };
}

const mondayKey = (data: ScheduleData, minute: number) =>
  currentActivity(data, '2037-10-19', minute, TZ)!.blockKey;

describe('LiveActivityClient.sync (foreground during a work block)', () => {
  it('starts the current work block with its end and the next two blocks', async () => {
    const n = fakeNative();
    const api = fakeApi();
    const c = new LiveActivityClient(n, api, false);
    expect(await c.sync(seedData(), live, TZ, at1315)).toBe('started');
    expect(n.startActivity).toHaveBeenCalledTimes(1);
    const [attrs, state, localOnly] = n.startActivity.mock.calls[0]!;
    expect(attrs).toEqual({
      blockKey: mondayKey(seedData(), 795),
      title: 'Sermon Sync',
      categoryColorHex: expect.stringMatching(/^#/),
      startsAt: '2037-10-19T16:40:00.000Z',
    });
    expect(state).toEqual({
      endsAt: '2037-10-19T18:30:00.000Z',
      next: [
        { title: 'Break', startsAt: '2037-10-19T18:30:00.000Z', durationMin: 15 },
        { title: 'Cryptography prep', startsAt: '2037-10-19T18:45:00.000Z', durationMin: 90 },
      ],
    });
    expect(localOnly).toBe(false);
    // Paid account: the server learns it started (the token follows on its own stream).
    expect(api.putActivity).toHaveBeenCalledWith(attrs.blockKey, { state: 'started' });
  });

  it('does not start a second one on the next foreground', async () => {
    const n = fakeNative();
    const c = new LiveActivityClient(n, fakeApi(), false);
    await c.sync(seedData(), live, TZ, at1315);
    expect(await c.sync(seedData(), live, TZ, new Date('2037-10-19T17:20:00.000Z'))).toBe(
      'showing',
    );
    expect(n.startActivity).toHaveBeenCalledTimes(1);
    expect(n.updateActivity).not.toHaveBeenCalled();
  });

  it('Personal Team: starts it local-only and reports nothing', async () => {
    const n = fakeNative();
    const api = fakeApi();
    await new LiveActivityClient(n, api, true).sync(seedData(), live, TZ, at1315);
    expect(n.startActivity.mock.calls[0]![2]).toBe(true);
    expect(api.putActivity).not.toHaveBeenCalled();
  });

  it('starts nothing in a meal, a break or a gap', async () => {
    const n = fakeNative();
    const c = new LiveActivityClient(n, fakeApi(), false);
    for (const iso of [
      '2037-10-19T21:45:00.000Z',
      '2037-10-19T18:35:00.000Z',
      '2037-10-20T00:20:00.000Z',
    ])
      expect(await c.sync(seedData(), live, TZ, new Date(iso))).toBe('none');
    expect(n.startActivity).not.toHaveBeenCalled();
  });

  it('back-to-back blocks: ends the finished one and starts the next in the same sync', async () => {
    const n = fakeNative();
    const c = new LiveActivityClient(n, fakeApi(), false);
    await c.sync(seedData(), live, TZ, new Date('2037-10-19T20:00:00.000Z')); // 4:00 pm, Cryptography prep
    const prep = n.running[0]!.blockKey;
    expect(await c.sync(seedData(), live, TZ, new Date('2037-10-19T20:15:00.000Z'))).toBe(
      'started',
    ); // Gym
    expect(n.endActivity).toHaveBeenCalledWith(prep, null);
    const active = n.running.filter((r) => r.state === 'active');
    expect(active).toHaveLength(1);
    expect(active[0]!.blockKey).toBe(mondayKey(seedData(), 975));
  });

  it('updates the card when the block’s end moves', async () => {
    const n = fakeNative();
    const c = new LiveActivityClient(n, fakeApi(), false);
    const data = seedData() as ScheduleData;
    await c.sync(data, live, TZ, at1315);
    const key = n.running[0]!.blockKey;
    const rbId = key.split(':')[0]!;
    const moved: ScheduleData = {
      ...data,
      overrides: [
        ...data.overrides,
        {
          id: '00000000-0000-4000-8000-000000000001',
          on_date: '2037-10-19',
          kind: 'modify',
          routine_block_id: rbId,
          title: null,
          start_min: null,
          end_min: 900,
          category_id: null,
          moved_to_date: null,
          note: null,
          deleted_at: null,
        },
      ],
    };
    const r = await c.sync(moved, live, TZ, new Date('2037-10-19T17:16:00.000Z'));
    // A modify override keeps the routine block's key, so the same card is updated in place.
    expect(r).toBe('updated');
    expect(n.updateActivity).toHaveBeenCalledWith(
      key,
      expect.objectContaining({ endsAt: '2037-10-19T19:00:00.000Z' }),
    );
    expect(n.startActivity).toHaveBeenCalledTimes(1);
  });

  it('a block the Planner dismissed is never started again', async () => {
    const n = fakeNative();
    const api = fakeApi();
    const c = new LiveActivityClient(n, api, false);
    c.listen();
    await c.sync(seedData(), live, TZ, at1315);
    const key = n.running[0]!.blockKey;
    n.running[0]!.state = 'dismissed';
    n.emit('onActivityState', { blockKey: key, state: 'dismissed' });
    n.running.length = 0; // iOS drops it
    expect(await c.sync(seedData(), live, TZ, new Date('2037-10-19T17:30:00.000Z'))).toBe('none');
    expect(n.startActivity).toHaveBeenCalledTimes(1);
    expect(api.putActivity).toHaveBeenCalledWith(key, { state: 'dismissed' });
  });

  it('Line only ends every activity and starts none', async () => {
    const n = fakeNative();
    const c = new LiveActivityClient(n, fakeApi(), false);
    await c.sync(seedData(), live, TZ, at1315);
    expect(await c.sync(seedData(), { lock_mode: 'line' }, TZ, at1315)).toBe('line_only');
    expect(n.endAllActivities).toHaveBeenCalledTimes(1);
    expect(n.running.every((r) => r.state === 'ended')).toBe(true);
  });

  it('Live Activities off in iPhone Settings: does nothing', async () => {
    const n = fakeNative(false);
    expect(
      await new LiveActivityClient(n, fakeApi(), false).sync(seedData(), live, TZ, at1315),
    ).toBe('off');
    expect(n.startActivity).not.toHaveBeenCalled();
  });

  it('without the native module (Expo Go, old build) it is a no-op', async () => {
    expect(
      await new LiveActivityClient(null, fakeApi(), false).sync(seedData(), live, TZ, at1315),
    ).toBe('unavailable');
  });
});

describe('tokens and sign-out', () => {
  it('sends the push-to-start token and each activity token to the server', async () => {
    const n = fakeNative();
    const api = fakeApi();
    const c = new LiveActivityClient(n, api, false);
    c.listen();
    c.listen(); // idempotent
    n.emit('onPushToStartToken', { token: 'ab'.repeat(32) });
    n.emit('onActivityToken', { blockKey: 'k:2037-10-19', token: 'cd'.repeat(32) });
    await Promise.resolve();
    expect(api.putDevice).toHaveBeenCalledTimes(1);
    expect(api.putDevice).toHaveBeenCalledWith({ live_activity_start_token: 'ab'.repeat(32) });
    expect(api.putActivity).toHaveBeenCalledWith('k:2037-10-19', {
      state: 'started',
      push_token: 'cd'.repeat(32),
    });
    c.stopListening();
    n.emit('onPushToStartToken', { token: 'ef'.repeat(32) });
    expect(api.putDevice).toHaveBeenCalledTimes(1);
  });

  it('Personal Team listens only for dismissals', () => {
    const n = fakeNative();
    new LiveActivityClient(n, fakeApi(), true).listen();
    expect(n.addListener.mock.calls.map((c) => c[0])).toEqual(['onActivityState']);
  });

  it('endAll ends every activity (sign-out)', async () => {
    const n = fakeNative();
    const c = new LiveActivityClient(n, fakeApi(), false);
    await c.sync(seedData(), live, TZ, at1315);
    await c.endAll();
    expect(n.endAllActivities).toHaveBeenCalled();
  });
});
