import { act, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RestOfToday } from '../day/RestOfToday';
import { ToastProvider, useToast } from '../ui/Toast';

const rows = [
  {
    key: 'a',
    time: '10:00',
    title: 'Pitch prep',
    duration: '1h',
    quiet: false,
    pending: false,
    isNew: false,
    a11y: 'Edit Pitch prep, 10:00 pm',
  },
];
function Show({ text }: { text: string | null }) {
  const toast = useToast();
  useEffect(() => {
    if (text) toast(text);
  }, [text, toast]);
  return <Text>host</Text>;
}
const tree = (text: string | null) => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 59, left: 0, right: 0, bottom: 34 },
    }}
  >
    <ToastProvider>
      <Show text={text} />
      <RestOfToday rows={rows} label="1 block" onRow={() => {}} onCollapse={() => {}} />
    </ToastProvider>
  </SafeAreaProvider>
);
const pad = () => screen.getByLabelText('Rest of today').props.contentContainerStyle.paddingBottom;

describe('Rest of today while a toast shows', () => {
  it('pads its end so the last row can sit above a two-line toast', async () => {
    const r = await render(tree(null));
    expect(pad()).toBe(120);
    await act(async () => r.rerender(tree('Added to Thursday. You’ll get a nudge 10 min before.')));
    expect(pad()).toBeGreaterThan(120);
  });
});
