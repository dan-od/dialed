import { useState } from 'react';
import { Text, View, type TextLayoutEvent } from 'react-native';
import { fonts } from '../theme/theme';

// Anton hhea metrics (2048 upm): ascent 2409, descent −674. CSS line-height L puts the baseline at
// L/2 + (asc − desc)/2 from the line top; React Native's natural line puts it at `asc`. Rendering each line
// at natural height shifted by the difference reproduces the prototype's `.h1 { line-height: .9 }` without
// iOS clipping the caps (which a sub-natural `lineHeight` does).
const ASC = 2409 / 2048;
const DESC = 674 / 2048;
export const lineShift = (line: number) => ASC - (line / 2 + (ASC - DESC) / 2);

interface Props {
  children: string;
  size: number;
  color: string;
  upper?: boolean;
  /** Minimum size for the per-word auto-fit (prototype `fitHeads`: 2 pt steps down to 26). */
  min?: number;
  accessibilityRole?: 'header' | 'text';
  /** CSS line-height in em (`.h1` .9; sheet titles 1; Month poster .85). */
  line?: number;
  letterSpacing?: number;
}

/**
 * Anton headline: wraps by word, shrinks only while one word is wider than the box (to 26 pt),
 * line height .9. Measured with hidden text, then drawn line by line.
 */
export function DisplayTitle({
  children,
  size,
  color,
  upper,
  min = 26,
  accessibilityRole = 'header',
  line: LINE = 0.9,
  letterSpacing,
}: Props) {
  const SHIFT = lineShift(LINE);
  const text = upper ? children.toUpperCase() : children;
  const [width, setWidth] = useState(0);
  const [fit, setFit] = useState<{ key: string; size: number } | null>(null);
  const [lines, setLines] = useState<{ key: string; lines: string[] } | null>(null);
  const key = `${text}|${size}|${width}`;
  const longest = text.split(' ').reduce((a, b) => (b.length > a.length ? b : a), '');
  const fs = fit?.key === key ? fit.size : null;

  const onWord = (e: TextLayoutEvent) => {
    const w = Math.max(...e.nativeEvent.lines.map((l) => l.width));
    const next =
      w > width && width > 0 ? Math.max(min, Math.floor((size * width) / w / 2) * 2) : size;
    setFit({ key, size: next });
  };
  const onLines = (e: TextLayoutEvent) =>
    setLines({ key: `${key}|${fs}`, lines: e.nativeEvent.lines.map((l) => l.text.trimEnd()) });
  const ready = fs !== null && lines?.key === `${key}|${fs}`;
  const base = { fontFamily: fonts.display, color, letterSpacing } as const;

  return (
    <View
      accessible
      accessibilityRole={accessibilityRole}
      accessibilityLabel={children}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && fs === null ? (
        <Text
          onTextLayout={onWord}
          style={[base, { fontSize: size, position: 'absolute', opacity: 0, width: 10_000 }]}
        >
          {longest}
        </Text>
      ) : null}
      {fs !== null && !ready ? (
        <Text
          onTextLayout={onLines}
          style={[base, { fontSize: fs, position: 'absolute', opacity: 0, width }]}
        >
          {text}
        </Text>
      ) : null}
      {ready ? (
        lines!.lines.map((line, i) => (
          <View key={i} style={{ height: fs! * LINE, overflow: 'visible' }}>
            <Text style={[base, { fontSize: fs!, marginTop: -fs! * SHIFT }]} numberOfLines={1}>
              {line}
            </Text>
          </View>
        ))
      ) : (
        <View style={{ height: size * LINE }} />
      )}
    </View>
  );
}
