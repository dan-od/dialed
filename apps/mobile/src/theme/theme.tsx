import { colors, type Colors } from '@dialed/tokens';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export type ThemePref = 'system' | 'light' | 'dark';

interface ThemeValue {
  c: Colors;
  isLight: boolean;
  pref: ThemePref;
}

const ThemeContext = createContext<ThemeValue>({ c: colors.dark, isLight: false, pref: 'system' });

export function ThemeProvider({ pref, children }: { pref: ThemePref; children: ReactNode }) {
  const scheme = useColorScheme();
  const value = useMemo(() => {
    const isLight = pref === 'system' ? scheme === 'light' : pref === 'light';
    return { c: isLight ? colors.light : colors.dark, isLight, pref };
  }, [pref, scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** Prototype theme button: system → the opposite of what shows; then dark ↔ light. */
export function nextTheme(pref: ThemePref, isLight: boolean): ThemePref {
  if (pref === 'system') return isLight ? 'dark' : 'light';
  return pref === 'dark' ? 'light' : 'dark';
}

export const fonts = { display: 'Anton_400Regular' };
