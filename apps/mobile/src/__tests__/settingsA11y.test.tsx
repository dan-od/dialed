import { fireEvent, render, screen } from '@testing-library/react-native';
import { SetRow, Stepper } from '../settings/ui';

jest.mock('../lib/haptics', () => ({
  haptic: { selection: jest.fn(), light: jest.fn(), success: jest.fn(), warning: jest.fn() },
}));

// Flow 09 accessibility (static pass): rows read with their value; the stepper says Fewer/More, is clamped
// 1–20 and announces its value. Spoken VoiceOver needs a device.
describe('settings pieces', () => {
  it('a row is a button read with its value ("Categories, 9")', async () => {
    await render(<SetRow label="Categories" value="9" chevron onPress={() => {}} />);
    const row = screen.getByRole('button', { name: 'Categories' });
    expect(row.props.accessibilityValue).toEqual({ text: '9' });
  });
  it('a disabled row says so (Export offline)', async () => {
    await render(
      <SetRow label="Export my data" value="JSON + calendar" disabled onPress={() => {}} />,
    );
    expect(
      screen.getByRole('button', { name: 'Export my data' }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });
  it('stepper: Fewer / More, clamped at the bounds, value announced', async () => {
    const onChange = jest.fn();
    await render(<Stepper value={20} min={1} max={20} unit="a day" onChange={onChange} />);
    await fireEvent.press(screen.getByRole('button', { name: 'More' }));
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Fewer' }));
    expect(onChange).toHaveBeenCalledWith(19);
    expect(screen.getByLabelText('20 a day')).toBeTruthy();
  });
});
