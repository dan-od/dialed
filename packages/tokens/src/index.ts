import tokens from './tokens.json';

export type ThemeName = 'dark' | 'light';
export type ColorToken = keyof typeof tokens.color.dark;
export type Colors = Record<ColorToken, string>;
export type PaletteName = keyof typeof tokens.palette;

export const colors: Record<ThemeName, Colors> = tokens.color;
export const palette = tokens.palette as unknown as Record<PaletteName, [string, string]>;
export const radius = tokens.radius;
export const size = tokens.size;
export const motion = tokens.motion;
export const toast = tokens.toast;

/** AI `palette` name → stored colour pair (Design_Identity; used by the server's create_category mapping). */
export { contrast, luminance } from './contrast';

export function paletteColors(name: string): { color_dark: string; color_light: string } | null {
  const pair = (palette as Record<string, [string, string] | undefined>)[name];
  return pair ? { color_dark: pair[0], color_light: pair[1] } : null;
}
