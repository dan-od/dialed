import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OFFLINE_SETUP, SetupChooser } from '../day/SetupChooser';

// Flow 02 "Setup empty, offline": the Simulator can't drop its network, so this is the proof.
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

describe('SetupChooser', () => {
  it('offline: stamp shown, timetable/describe/calendar disabled, Build it myself works', async () => {
    const onPick = jest.fn();
    await render(wrap(<SetupChooser offline onPick={onPick} />));
    expect(screen.getByText(OFFLINE_SETUP)).toBeTruthy();
    for (const name of [
      /^Add your timetable/,
      /^Describe your week/,
      /^Import from Apple Calendar/,
    ]) {
      const btn = screen.getByRole('button', { name });
      expect(btn.props.accessibilityState).toMatchObject({ disabled: true });
      await fireEvent.press(btn);
    }
    expect(onPick).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: /^Build it myself/ }));
    expect(onPick).toHaveBeenCalledWith('build');
  });

  it('online: no stamp, every option enabled', async () => {
    const onPick = jest.fn();
    await render(wrap(<SetupChooser onPick={onPick} />));
    expect(screen.queryByText(OFFLINE_SETUP)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^Add your timetable/ }));
    expect(onPick).toHaveBeenCalledWith('timetable');
  });
});
