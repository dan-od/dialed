import { resolveDay, weekStartOf } from '@dialed/schedule';
import { colors } from '@dialed/tokens';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DayHero } from '../day/DayHero';
import { FloatingNav } from '../day/FloatingNav';
import { dayModel } from '../day/model';
import { RestOfToday } from '../day/RestOfToday';
import { DayCard, Tiles } from '../week/Cards';
import { LaneRow } from '../week/Lanes';
import { cardsModel, monthModel, weekModel } from '../week/model';
import { MonthChart } from '../week/MonthChart';
import { Seg } from '../week/Seg';

// Screen-reader pass (Flow 03 Accessibility): what VoiceOver gets — names, roles, states, and decorative
// charts hidden. Real VoiceOver speech needs a device (the Simulator has no VoiceOver).

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedData } = require('../../../../packages/schedule/test/seed');
const data = seedData();
const NOW = { date: '2026-10-19', minute: 795 };
const c = colors.dark;
const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 59, left: 0, right: 0, bottom: 34 },
    }}
  >
    {ui}
  </SafeAreaProvider>
);

const day = dayModel({
  blocks: resolveDay('2026-10-19', data).blocks,
  tomorrow: resolveDay('2026-10-20', data).blocks,
  minute: 795,
  dayStart: 450,
  dayEnd: 1440,
  width: 390,
  isLight: false,
  colors: { acc: c.acc, barPast: c.barPast, barFut: c.barFut },
});

describe('Day', () => {
  it('hero is one element with the whole sentence; bars are hidden', async () => {
    await render(<DayHero m={day} />);
    expect(
      screen.getByLabelText('Right now: Sermon Sync, 1 hour 15 minutes left, ends 2:30 pm'),
    ).toBeTruthy();
    expect(screen.getByLabelText('35% of the day gone')).toBeTruthy();
  });
  it('Rest of today rows are buttons that say what tapping does', async () => {
    await render(
      <RestOfToday rows={day.rows} label={day.restLabel} onRow={() => {}} onCollapse={() => {}} />,
    );
    const rows = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(rows).toEqual([
      'Edit Break, 2:30 pm',
      'Edit Cryptography prep, 2:45 pm',
      'Edit Gym, 4:15 pm',
      'Edit Dinner, 5:30 pm',
      'Edit Sermon Sync, 6:15 pm',
      'Edit WellServices, 8:30 pm',
    ]);
    expect(screen.getByRole('header', { name: 'Rest of today' })).toBeTruthy();
  });
  it('floating nav: tabs with selected state, Add a block; the pill names what it expands', async () => {
    const r = await render(
      wrap(
        <FloatingNav
          active="day"
          mini={false}
          onTab={() => {}}
          onPlus={() => {}}
          onExpand={() => {}}
          bottom={24}
        />,
      ),
    );
    expect(screen.getByRole('tab', { name: 'Day', selected: true })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Week', selected: false })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a block' })).toBeTruthy();
    await r.rerender(
      wrap(
        <FloatingNav
          active="day"
          mini
          onTab={() => {}}
          onPlus={() => {}}
          onExpand={() => {}}
          bottom={24}
        />,
      ),
    );
    expect(screen.getByRole('button', { name: 'Show Day, Week and Month' })).toBeTruthy();
  });
});

describe('Week, cards, month', () => {
  const start = weekStartOf(NOW.date);
  it('lanes read "Monday 19, today, 10.4 hours. Open in detail."', async () => {
    const w = weekModel(data, start, NOW, { isLight: false });
    await render(
      <>
        {w.lanes.map((l, i) => (
          <LaneRow key={l.date} lane={l} index={i} onPress={() => {}} />
        ))}
      </>,
    );
    expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual([
      'Monday 19, today, 10.4 hours. Open in detail.',
      'Tuesday 20, 12.1 hours. Open in detail.',
      'Wednesday 21, 11.6 hours. Open in detail.',
      'Thursday 22, 10.9 hours. Open in detail.',
      'Friday 23, 10.8 hours. Open in detail.',
      'Saturday 24, 5.3 hours. Open in detail.',
      'Sunday 25, 3.3 hours. Open in detail.',
    ]);
  });
  it('Lanes/Cards switch exposes the selected one', async () => {
    await render(<Seg value="lanes" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Lanes', selected: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cards', selected: false })).toBeTruthy();
  });
  it('a card is read as one summary; tiles say hours or days', async () => {
    const m = cardsModel(data, start, NOW, { isLight: false });
    await render(
      <>
        <DayCard card={m.cards[2]!} delay={0} />
        <Tiles tiles={m.tiles} />
      </>,
    );
    expect(
      screen.getByLabelText(/^Wednesday 21, 11\.6 hours\. 9:30 Capstone prep, 1h 40m\./),
    ).toBeTruthy();
    expect(screen.getByLabelText('School, 27.2 hours')).toBeTruthy();
    expect(screen.getByLabelText('Gym, 6 days')).toBeTruthy();
  });
  it('month chart and axis are hidden from VoiceOver (the poster text and week rows are the accessible path)', async () => {
    const m = monthModel(data, '2026-10', NOW, { isLight: false });
    await render(<MonthChart days={m.days} axis={m.axis} notes={m.axisNotes} />);
    expect(screen.queryByText('Thanksgiving')).toBeNull(); // not in the accessibility tree
    expect(screen.getByText('Thanksgiving', { includeHiddenElements: true })).toBeTruthy();
    expect(m.weeks.map((w) => w.a11y)).toContain(
      'Oct 19 to 25, 64.3 hours, this week. Open the week.',
    );
  });
});
