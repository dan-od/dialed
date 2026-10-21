import { Pressable, View } from 'react-native';
import { cycleDevClock } from '../clock/clock';
import { aiName } from '../config';
import { useTheme } from '../theme/theme';
import { IconButton } from '../ui/Button';
import { Header } from '../ui/Chrome';
import { AiMark, ThemeIcon } from '../ui/icons';
import { Spinner } from '../ui/Spinner';
import { D, T } from '../ui/Text';

export function initials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

export function SyncPill({
  pending,
  syncing,
  paused,
  onPress,
}: {
  pending: number;
  syncing: boolean;
  paused: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  if (!syncing && !pending && !paused) return null;
  const label = syncing ? 'Syncing' : paused ? 'Sync paused' : `${pending} to sync`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. Sync now`}
      onPress={onPress}
      style={{
        height: 32,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: c.surf2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {syncing ? <Spinner color={c.text} size={14} /> : null}
      <T size={13} weight="700">
        {label}
      </T>
    </Pressable>
  );
}

export function DayHeader(props: {
  date: string;
  name: string;
  pending: number;
  syncing: boolean;
  paused: boolean;
  onSync: () => void;
  onAccount: () => void;
  onPlan: () => void;
  onTheme: () => void;
}) {
  const { c } = useTheme();
  return (
    <Header
      left={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Pressable onLongPress={__DEV__ ? cycleDevClock : undefined} accessible={false}>
            <T accessibilityRole="header" size={16} weight="700">
              {props.date}
            </T>
          </Pressable>
          <SyncPill
            pending={props.pending}
            syncing={props.syncing}
            paused={props.paused}
            onPress={props.onSync}
          />
        </View>
      }
      right={
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <IconButton label={`Account: ${props.name}`} onPress={props.onAccount} filled>
            <D size={16} color={c.ink} style={{ lineHeight: 20 }}>
              {initials(props.name)}
            </D>
          </IconButton>
          <IconButton label={`Plan with ${aiName()}`} onPress={props.onPlan}>
            <AiMark color={c.text} />
          </IconButton>
          <IconButton label="Theme: follows system" onPress={props.onTheme}>
            <ThemeIcon color={c.text} />
          </IconButton>
        </View>
      }
    />
  );
}
