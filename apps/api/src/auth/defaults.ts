import { palette } from '@dialed/tokens';

/** C-0102 / D-33: new accounts get these categories only. Personal's colour (Sky) is ASSUMED. */
export const DEFAULT_CATEGORIES = [
  {
    name: 'Class',
    group_name: 'School',
    color_dark: '#8FB0FF',
    color_light: '#3D6FD9',
    weight: 0.8,
    quiet: false,
    protected: true,
  },
  {
    name: 'Study',
    group_name: 'School',
    color_dark: '#5FD8BE',
    color_light: '#12917A',
    weight: 0.7,
    quiet: false,
    protected: false,
  },
  {
    name: 'Gym',
    group_name: 'Life',
    color_dark: '#B5E36A',
    color_light: '#5E9A1E',
    weight: 0.6,
    quiet: false,
    protected: false,
  },
  {
    name: 'Personal',
    group_name: 'Life',
    color_dark: palette.Sky[0],
    color_light: palette.Sky[1],
    weight: 0.6,
    quiet: false,
    protected: false,
  },
  {
    name: 'Meal',
    group_name: 'Life',
    color_dark: '#8A6A5C',
    color_light: '#B89A8A',
    weight: 0.3,
    quiet: true,
    protected: false,
  },
  {
    name: 'Break',
    group_name: 'Life',
    color_dark: '#5A3A2A',
    color_light: '#D9C2B4',
    weight: 0.18,
    quiet: true,
    protected: false,
  },
] as const;
