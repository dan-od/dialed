import { describe, expect, it } from 'vitest';
import { colors, paletteColors } from '../src';

describe('tokens', () => {
  it('dark and light define the same tokens', () => {
    expect(Object.keys(colors.light).sort()).toEqual(Object.keys(colors.dark).sort());
  });
  it('palette names map to colour pairs', () => {
    expect(paletteColors('Mint')).toEqual({ color_dark: '#9FE0D0', color_light: '#2BA58A' });
    expect(paletteColors('Purple')).toBeNull();
  });
});
