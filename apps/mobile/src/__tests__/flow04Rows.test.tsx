import { resolveDay } from '@dialed/schedule';
import { colors } from '@dialed/tokens';
import { render, screen } from '@testing-library/react-native';
import { dayModel } from '../day/model';
import { RestOfToday } from '../day/RestOfToday';

// Flow 04 build seed (UI half): the saved block shows in Rest of today with a "New" chip, and an offline
// change is marked "· waiting to sync".
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedData } = require('../../../../packages/schedule/test/seed');
const data = seedData();
const c = colors.dark;
const blocks = resolveDay('2026-10-19', data).blocks;
const gym = blocks.find((b: { title: string }) => b.title === 'Gym')!;
const model = (o: { highlight?: string; pending?: string[] }) =>
  dayModel({
    blocks,
    tomorrow: [],
    minute: 795,
    dayStart: 450,
    dayEnd: 1440,
    width: 390,
    isLight: false,
    colors: { acc: c.acc, barPast: c.barPast, barFut: c.barFut },
    highlight: o.highlight,
    pendingIds: new Set(o.pending ?? []),
  });

describe('Rest of today after a Flow 04 change', () => {
  it('the highlighted row carries a New chip and says so to VoiceOver', async () => {
    const m = model({ highlight: gym.key });
    await render(
      <RestOfToday rows={m.rows} label={m.restLabel} onRow={() => {}} onCollapse={() => {}} />,
    );
    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.getByLabelText('Edit Gym, 4:15 pm, new')).toBeTruthy();
  });
  it('a pending routine block row shows · waiting to sync', async () => {
    const m = model({ pending: [gym.routine_block_id!] });
    await render(
      <RestOfToday rows={m.rows} label={m.restLabel} onRow={() => {}} onCollapse={() => {}} />,
    );
    expect(screen.getByText(/waiting to sync/)).toBeTruthy();
    expect(screen.getByLabelText('Edit Gym, 4:15 pm, waiting to sync')).toBeTruthy();
    expect(screen.queryByText('New')).toBeNull();
  });
});
