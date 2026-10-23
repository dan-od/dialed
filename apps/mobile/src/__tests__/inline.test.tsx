import { fireEvent, render, screen } from '@testing-library/react-native';
import { InlineMessage, OfflineLine, OfflinePill } from '../ui/Inline';

// v11: notice boxes are gone. Messages are one sentence (key words bold or red, the fix as an orange text link);
// offline is a small pill with a hollow ring plus one muted line.
describe('InlineMessage', () => {
  it('reads as one sentence and is announced; the fix is a link', async () => {
    const onPress = jest.fn();
    await render(
      <InlineMessage
        parts={[
          { hot: 'Off in iPhone Settings,' },
          ' so it won’t fire. ',
          { link: 'Turn them on', onPress },
        ]}
      />,
    );
    expect(screen.getByText(/so it won’t fire/)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Turn them on' });
    fireEvent.press(link);
    expect(onPress).toHaveBeenCalled();
  });
});

describe('Offline pill', () => {
  it('says Offline, and Offline · N to sync with pending edits', async () => {
    await render(<OfflinePill pending={0} />);
    expect(screen.getByText('Offline')).toBeTruthy();
    await render(<OfflinePill pending={2} />);
    expect(screen.getByText('Offline · 2 to sync')).toBeTruthy();
  });
  it('the line version adds one muted sentence', async () => {
    await render(<OfflineLine pending={1} text="Connect to sign in." />);
    expect(screen.getByText('Offline · 1 to sync')).toBeTruthy();
    expect(screen.getByText('Connect to sign in.')).toBeTruthy();
  });
});
