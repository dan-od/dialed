import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { fonts, useTheme } from '../theme/theme';

/** System font (SF Pro) with the prototype's inherited 1.45 line height. */
export function T({
  style,
  size = 15,
  weight = '500',
  color,
  ...rest
}: TextProps & { size?: number; weight?: TextStyle['fontWeight']; color?: string }) {
  const { c } = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        {
          fontSize: size,
          fontWeight: weight,
          color: color ?? c.text,
          lineHeight: Math.round(size * 1.45),
        },
        style,
      ]}
    />
  );
}

/** Small Anton text (≤ 28 pt: times, stamps, buttons). Headlines use DisplayTitle. */
export function D({ style, size, color, ...rest }: TextProps & { size: number; color?: string }) {
  const { c } = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: fonts.display,
          fontSize: size,
          lineHeight: Math.round(size * 1.15),
          color: color ?? c.text,
        },
        style,
      ]}
    />
  );
}
