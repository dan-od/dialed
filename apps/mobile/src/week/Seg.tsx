import { Pressable, View } from 'react-native';
import { haptic } from '../lib/haptics';
import { useTheme } from '../theme/theme';
import { T } from '../ui/Text';

/** `.seg` two-way switch (Lanes | Cards). Selection haptic on change (Flow 03). */
export function Seg({
  value,
  onChange,
}: {
  value: 'lanes' | 'cards';
  onChange: (v: 'lanes' | 'cards') => void;
}) {
  const { c } = useTheme();
  const item = (v: 'lanes' | 'cards', label: string) => {
    const on = v === value;
    return (
      <Pressable
        key={v}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        hitSlop={{ top: 7, bottom: 7 }} // 30 pt button + 14 = 44 pt target
        onPress={() => {
          if (on) return;
          haptic.selection();
          onChange(v);
        }}
        style={{
          paddingHorizontal: 12,
          borderRadius: 15,
          backgroundColor: on ? c.navOnBg : 'transparent',
          justifyContent: 'center',
          minHeight: 30,
        }}
      >
        <T size={13} weight={on ? '700' : '600'} color={on ? c.navOnFg : c.soft}>
          {label}
        </T>
      </Pressable>
    );
  };
  return (
    <View
      accessibilityLabel="Week layout"
      style={{
        height: 36,
        borderRadius: 18,
        backgroundColor: c.surf,
        padding: 3,
        flexDirection: 'row',
        gap: 2,
      }}
    >
      {item('lanes', 'Lanes')}
      {item('cards', 'Cards')}
    </View>
  );
}
