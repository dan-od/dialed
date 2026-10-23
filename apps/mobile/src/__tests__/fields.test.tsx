import { fireEvent, render, screen } from '@testing-library/react-native';
import { DateRange, TimeRange } from '../blocks/ui';

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: (p: { testID?: string }) => <View testID={p.testID} /> };
});

// v11 owner review: time and date fields show plain text (no grey iOS capsule); tapping one opens the native wheel
// under the pair at full width, so it never clips inside a half column.
describe('plain time and date fields', () => {
  it('times read as plain text and one wheel opens under the pair', async () => {
    await render(
      <TimeRange
        start={1320}
        end={1380}
        onStart={() => {}}
        onEnd={() => {}}
        testIDs={['s', 'e']}
      />,
    );
    expect(screen.getByText('10:00 pm')).toBeTruthy();
    expect(screen.queryByTestId('s-wheel')).toBeNull();
    await fireEvent.press(screen.getByTestId('s'));
    expect(screen.getByTestId('s-wheel')).toBeTruthy();
    expect(screen.getByTestId('s').props.accessibilityState).toMatchObject({ expanded: true });
    await fireEvent.press(screen.getByTestId('e'));
    expect(screen.queryByTestId('s-wheel')).toBeNull();
    expect(screen.getByTestId('e-wheel')).toBeTruthy();
  });
  it('dates close (and save once) when the wheel closes or switches field', async () => {
    const onClose = jest.fn();
    await render(
      <DateRange
        start="2026-09-14"
        end="2026-12-11"
        onStart={() => {}}
        onEnd={() => {}}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('Sep 14, 2026')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('ends'));
    expect(screen.getByTestId('ends-wheel')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('starts'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('starts'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('starts-wheel')).toBeNull();
  });
});
