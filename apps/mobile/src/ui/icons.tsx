import Svg, { Circle, Path, Rect } from 'react-native-svg';

// Verbatim from the prototype's icon set (24-unit grid). Colour comes from the caller.
type P = { color: string; size?: number };

export const LOGO_D = 'M160 30H198V216H160V207.03A70 70 0 1 1 160 86.97Z';
export const LOGO_SLOT =
  'M133.19 159.02L158.65 133.56A15 15 0 0 0 137.44 112.35L111.98 137.81A15 15 0 0 0 133.19 159.02Z';
const LOGO_WORD =
  'M22.160227272727273 216.0V77.0H60.38522727272727Q75.39090909090909 77.0 82.97272727272727 85.33210227272727Q90.55454545454546 93.66420454545454 90.55454545454546 109.6965909090909V174.77386363636364Q90.55454545454546 194.5181818181818 83.64403409090909 205.2590909090909Q76.73352272727273 216.0 59.4375 216.0ZM50.11818181818182 191.43806818181818H54.935795454545456Q62.596590909090914 191.43806818181818 62.596590909090914 184.01420454545453V112.3028409090909Q62.596590909090914 105.3528409090909 60.740625 103.33892045454544Q58.88465909090909 101.325 53.19829545454546 101.325H50.11818181818182ZM103.89854545454544 216.0V77.0H130.75081818181818V216.0ZM141.25163636363635 216.0 154.67777272727272 77.0H201.82720454545452L215.01640909090906 216.0H188.71697727272726L186.74254545454545 193.57045454545454H169.99936363636363L168.2618636363636 216.0ZM171.97379545454544 171.3778409090909H184.61015909090906L178.52890909090908 100.69318181818181H177.2652727272727ZM226.7808636363636 216.0V77.0H254.5808636363636V192.3068181818182H283.17063636363633V216.0ZM294.3032727272727 216.0V77.0H349.9032727272727V103.85227272727272H322.5771363636363V130.94147727272727H348.7975909090909V157.08295454545453H322.5771363636363V188.91079545454545H351.71975V216.0ZM364.1160227272727 216.0V77.0H402.3410227272727Q417.3467045454545 77.0 424.9285227272727 85.33210227272727Q432.51034090909087 93.66420454545454 432.51034090909087 109.6965909090909V174.77386363636364Q432.51034090909087 194.5181818181818 425.5998295454545 205.2590909090909Q418.6893181818181 216.0 401.3932954545454 216.0ZM392.07397727272723 191.43806818181818H396.89159090909084Q404.55238636363634 191.43806818181818 404.55238636363634 184.01420454545453V112.3028409090909Q404.55238636363634 105.3528409090909 402.69642045454543 103.33892045454544Q400.8404545454545 101.325 395.1540909090909 101.325H392.07397727272723Z';

export const Mark = ({ color, size = 30 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 256 256">
    <Path fill={color} fillRule="evenodd" d={`${LOGO_D} ${LOGO_SLOT}`} />
  </Svg>
);

export const Wordmark = ({ color, height = 20 }: { color: string; height?: number }) => (
  <Svg height={height} width={(height * 410) / 139} viewBox="22.2 77 410 139">
    <Path fill={color} d={LOGO_WORD} />
  </Svg>
);

export const BackIcon = ({ color, size = 22 }: P) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.4}
    strokeLinecap="round"
  >
    <Path d="M15 6l-6 6 6 6" />
  </Svg>
);
export const PlusIcon = ({ color, size = 22 }: P) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.6}
    strokeLinecap="round"
  >
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);
export const UpIcon = ({ color, size = 14 }: P) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.8}
    strokeLinecap="round"
  >
    <Path d="M6 15l6-6 6 6" />
  </Svg>
);
export const CloseIcon = ({ color, size = 18 }: P) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.4}
    strokeLinecap="round"
  >
    <Path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
/** AI mark: the knob with its slot and a clockwise arrow (assets/brand/ai-mark-paths.txt). Never a sparkle. */
export const AiMark = ({ color, size = 18 }: P) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path
      d="M4.10 13.2a7.2 7.2 0 1 0 14.40 0a7.2 7.2 0 1 0 -14.40 0Z M12.15 14.61L15.19 11.57A1.6 1.6 0 0 0 12.93 9.31L9.89 12.35A1.6 1.6 0 0 0 12.15 14.61Z"
      fill={color}
      fillRule="evenodd"
      stroke="none"
    />
    <Path d="M2.38 8.05A10.3 10.3 0 0 1 19.42 6.86" />
    <Path d="M16.80 6.21L19.42 6.86L19.42 4.16" />
  </Svg>
);
export const ThemeIcon = ({ color, size = 18 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
    <Circle cx={12} cy={12} r={8} />
    <Path d="M12 4a8 8 0 0 1 0 16z" fill={color} />
  </Svg>
);
export const CameraIcon = ({ color, size = 22 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2}>
    <Path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <Circle cx={12} cy={13} r={3.5} />
  </Svg>
);
export const CalendarIcon = ({ color, size = 22 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2}>
    <Rect x={4} y={5} width={16} height={15} rx={3} />
    <Path d="M4 10h16M9 3v4M15 3v4" />
  </Svg>
);
export const RepeatIcon = ({ color, size = 18 }: P) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
  >
    <Path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
  </Svg>
);
