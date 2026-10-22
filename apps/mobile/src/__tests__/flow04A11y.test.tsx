import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Chip, GroupRow, SheetHeader } from '../blocks/ui';
import { Notice } from '../ui/Notice';

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
  it('notice action reaches 44 pt', async () => {
    await render(
      <Notice
        inline
        kind="quiet"
        stamp="Reminders off"
        text="x"
        action={{ label: 'Turn them on', onPress: () => {} }}
      />,
    );
    const b = screen.getByRole('button', { name: 'Turn them on' });
    expect(b.props.hitSlop).toEqual({ top: 2, bottom: 2 });
  });
});
