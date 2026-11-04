import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/theme';

/** A pinned footer at the bottom of the screen: padding 20 + safe area, border-top line. */
export function PinnedFooter({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 20),
        borderTopWidth: 1,
        borderTopColor: c.line,
        backgroundColor: c.bg,
        gap: 8,
      }}
    >
      {children}
    </View>
  );
}
