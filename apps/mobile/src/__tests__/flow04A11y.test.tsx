import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Chip, GroupRow, SheetHeader } from '../blocks/ui';
import { FitStrip } from '../blocks/FitStrip';
import { fitModel } from '../blocks/fit';

// Flow 04 accessibility (static pass): what VoiceOver gets from the sheet pieces. Spoken VoiceOver itself
// needs a device (the Simulator has no VoiceOver).
describe('Flow 04 sheet pieces', () => {
  it('chips are buttons with a selected state and a 44 pt target', async () => {
    await render(<Chip label="Study" on onPress={() => {}} />);
    const chip = screen.getByRole('button', { name: 'Study' });
    expect(chip.props.accessibilityState).toMatchObject({ selected: true });
    expect(chip.props.hitSlop).toBe(4); // 36 pt + 2 × 4
  });
  it('the dashed chip says what it does', async () => {
    await render(<Chip label="+ New" a11yLabel="New category" dashed onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'New category' })).toBeTruthy();
  });
  it('Push alert row reads its value', async () => {
    await render(
      <GroupRow
        icon={null}
        label="Push alert"
        right={<Text>Default (off)</Text>}
        onPress={() => {}}
        a11y={{ label: 'Push alert', value: 'Default (off)' }}
      />,
    );
    const row = screen.getByRole('button', { name: 'Push alert' });
    expect(row.props.accessibilityValue).toEqual({ text: 'Default (off)' });
  });
  it('sheet title is a header and Close is labelled', async () => {
    await render(<SheetHeader title="Edit block" onClose={() => {}} />);
    expect(screen.getByRole('header', { name: 'Edit block' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
  it('fit strip: Keep both and the dashed slot are labelled buttons with room to tap', async () => {
    const m = fitModel({
      day: [
        {
          key: 'w',
          title: 'WellServices',
          start_min: 1080,
          end_min: 1260,
          quiet: false,
          color: '#0af',
        },
      ],
      start: 1170,
      end: 1290,
      title: 'Study',
      keep: false,
    });
    await render(<FitStrip m={m} onShift={() => {}} onKeep={() => {}} />);
    const keep = screen.getByRole('button', { name: 'Keep both' });
    expect(keep.props.hitSlop).toMatchObject({ top: 14, bottom: 14 });
    expect(screen.getByRole('button', { name: /^Move to / })).toBeTruthy();
    expect(screen.getByRole('image', { name: /Overlaps WellServices/ })).toBeTruthy();
  });
});
