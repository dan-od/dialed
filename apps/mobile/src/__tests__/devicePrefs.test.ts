import { DEFAULT_DEVICE_PREFS } from '@dialed/contracts';
import { MemoryStore } from '../data/memoryStore';
import { DevicePrefsStore } from '../settings/prefs';

// Flow 09: this phone's notification prefs apply at once (offline too) and reach PUT /v1/devices/current
// when it can; last write wins.
describe('device prefs on the phone', () => {
  it('starts from the defaults, applies a change at once and sends it', async () => {
    const put = jest.fn(async (p) => p);
    const prefs = new DevicePrefsStore(new MemoryStore(), put);
    expect(await prefs.get()).toEqual(DEFAULT_DEVICE_PREFS);
    const next = await prefs.set({ daily_cap: 7 });
    expect(next.daily_cap).toBe(7);
    await prefs.flush();
    expect(put).toHaveBeenLastCalledWith(expect.objectContaining({ daily_cap: 7 }));
  });
  it('offline: kept on the phone and sent on the next flush; the server copy never overwrites it', async () => {
    const store = new MemoryStore();
    let up = false;
    const put = jest.fn(async (p) => {
      if (!up) throw new Error('offline');
      return p;
    });
    const prefs = new DevicePrefsStore(store, put);
    await prefs.set({ lock_mode: 'line', line_on: false });
    await prefs.flush();
    expect((await prefs.get()).lock_mode).toBe('line');
    // Line only keeps the line on (D-07).
    expect((await prefs.get()).line_on).toBe(true);
    await prefs.adopt({ ...DEFAULT_DEVICE_PREFS }); // stale server copy while a change waits
    expect((await prefs.get()).lock_mode).toBe('line');
    up = true;
    await prefs.flush();
    await prefs.adopt({ ...DEFAULT_DEVICE_PREFS, daily_cap: 9 });
    expect((await prefs.get()).daily_cap).toBe(9);
  });
});
