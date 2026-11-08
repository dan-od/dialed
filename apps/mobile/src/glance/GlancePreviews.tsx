import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { D, T } from '../ui/Text';
import type { GlancePreview } from './preview';

// Flow 08 Customize guide: small renderings of each Dialed widget with live data (prototype `lockWidget`,
// `homeWidget`). They read like the real widgets but are pictures: the real ones are added in iOS's editors.

const WHITE = '#FFFFFF';
const ORANGE = '#FF5A1F';
const INK = '#140A05';
const CREAM = '#FFF1E8';
/** The lock screen's frosted pill on the prototype's dark wallpaper. */
const GLASS = 'rgba(255,255,255,0.17)';
const WALL = '#2A1A12';

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [
    cx + r * Math.cos(((a - 90) * Math.PI) / 180),
    cy + r * Math.sin(((a - 90) * Math.PI) / 180),
  ];
  const [x0, y0] = p(a0) as [number, number];
  const [x1, y1] = p(a1) as [number, number];
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** The lock screen backdrop the lock previews sit on. */
export function LockBackdrop({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: WALL,
        borderRadius: 22,
        padding: 14,
        gap: 10,
        alignItems: 'flex-start',
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </View>
  );
}

const Kicker = ({ text }: { text: string }) => (
  <T
    size={10.5}
    weight="800"
    color={WHITE}
    numberOfLines={1}
    style={{ opacity: 0.8, letterSpacing: 0.4 }}
  >
    {text.toUpperCase()}
  </T>
);

function Rect({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        width: 158,
        height: 74,
        borderRadius: 20,
        backgroundColor: GLASS,
        paddingHorizontal: 12,
        justifyContent: 'center',
        gap: 2,
      }}
    >
      {children}
    </View>
  );
}

export function LinePreview({ p }: { p: GlancePreview }) {
  return (
    <T size={15} weight="600" color={WHITE} numberOfLines={1}>
      {p.line || ' '}
    </T>
  );
}

export function CountdownPreview({ p }: { p: GlancePreview }) {
  const r = 27;
  const C = 2 * Math.PI * r;
  const m = p.countdown;
  return (
    <View
      style={{
        width: 74,
        height: 74,
        borderRadius: 37,
        backgroundColor: GLASS,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={70} height={70} viewBox="0 0 70 70" style={{ position: 'absolute' }}>
        <Circle cx={35} cy={35} r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={6} />
        {m.live ? (
          <Circle
            cx={35}
            cy={35}
            r={r}
            fill="none"
            stroke={WHITE}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${(C * m.progress).toFixed(1)} ${C.toFixed(1)}`}
            transform="rotate(-90 35 35)"
          />
        ) : null}
      </Svg>
      <D size={17} color={WHITE}>
        {m.label}
      </D>
      <T
        size={7.5}
        weight="700"
        color={WHITE}
        style={{ opacity: 0.75, letterSpacing: 0.5, marginTop: -3 }}
      >
        {m.caption}
      </T>
    </View>
  );
}

export function DayRingPreview({ p }: { p: GlancePreview }) {
  const ang = (f: number) => Math.max(0, Math.min(359.9, f * 360));
  const na = ang(p.dayRing.now);
  const nx = 35 + 27 * Math.cos(((na - 90) * Math.PI) / 180);
  const ny = 35 + 27 * Math.sin(((na - 90) * Math.PI) / 180);
  return (
    <View
      style={{
        width: 74,
        height: 74,
        borderRadius: 37,
        backgroundColor: GLASS,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={70} height={70} viewBox="0 0 70 70" style={{ position: 'absolute' }}>
        <Circle
          cx={35}
          cy={35}
          r={27}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={6}
        />
        {p.dayRing.segments.map((s, i) => (
          <Path
            key={i}
            d={arc(35, 35, 27, ang(s.start) + 1.5, Math.max(ang(s.start) + 3, ang(s.end) - 1.5))}
            fill="none"
            stroke={s.past ? 'rgba(255,255,255,0.35)' : WHITE}
            strokeWidth={6}
          />
        ))}
        <Circle cx={nx} cy={ny} r={4.5} fill={ORANGE} stroke={WHITE} strokeWidth={1.5} />
      </Svg>
      <D size={20} color={WHITE}>
        {String(p.dayRing.left)}
      </D>
      <T
        size={7.5}
        weight="700"
        color={WHITE}
        style={{ opacity: 0.75, letterSpacing: 0.5, marginTop: -4 }}
      >
        LEFT
      </T>
    </View>
  );
}

export function UpNextPreview({ p }: { p: GlancePreview }) {
  return (
    <Rect>
      <Kicker text={p.upNext.kicker} />
      <T size={15} weight="800" color={WHITE} numberOfLines={1}>
        {p.upNext.title}
      </T>
      <T size={11} weight="600" color={WHITE} numberOfLines={1} style={{ opacity: 0.8 }}>
        {p.upNext.detail}
      </T>
    </Rect>
  );
}

export function TodayPreview({ p }: { p: GlancePreview }) {
  return (
    <Rect>
      <Kicker text={p.today.kicker} />
      <View style={{ height: 14, marginVertical: 2 }}>
        {p.today.bars.map((b, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              top: 3,
              height: 8,
              borderRadius: 3,
              backgroundColor: WHITE,
              opacity: b.past ? 0.4 : 1,
              left: `${(b.start * 100).toFixed(1)}%`,
              width: `${Math.max(1.2, (b.end - b.start) * 100 - 0.8).toFixed(1)}%`,
            }}
          />
        ))}
        <View
          style={{
            position: 'absolute',
            top: -1,
            width: 3,
            height: 16,
            borderRadius: 2,
            backgroundColor: ORANGE,
            left: `${(p.today.now * 100).toFixed(1)}%`,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {['9a', p.today.middle, '12a'].map((s) => (
          <T key={s} size={11} weight="600" color={WHITE} style={{ opacity: 0.8 }}>
            {s}
          </T>
        ))}
      </View>
    </Rect>
  );
}

export function WeekPreview({ p }: { p: GlancePreview }) {
  if (!p.week) return null;
  const w = p.week;
  return (
    <Rect>
      <Kicker text={w.kicker} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 4,
          height: 22,
          marginVertical: 2,
        }}
      >
        {w.bars.map((h, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: `${h * 100}%`,
              borderRadius: 2,
              backgroundColor: WHITE,
              opacity: i === w.todayIndex ? 1 : 0.45,
            }}
          />
        ))}
      </View>
      <T size={11} weight="600" color={WHITE} style={{ opacity: 0.8 }}>
        {w.detail}
      </T>
    </Rect>
  );
}

function HomeCard({
  hot,
  wide,
  tall,
  children,
}: {
  hot?: boolean;
  wide?: boolean;
  tall?: boolean;
  children: ReactNode;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: wide ? 300 : 142,
        height: tall ? 300 : 142,
        borderRadius: 22,
        padding: 14,
        backgroundColor: hot ? ORANGE : '#24140C',
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

const HomeKicker = ({ text, color }: { text: string; color: string }) => (
  <T size={11} weight="800" color={color} numberOfLines={1} style={{ letterSpacing: 0.6 }}>
    {text.toUpperCase()}
  </T>
);

export function NowPreview({ p }: { p: GlancePreview }) {
  if (!p.now) return <NextPreview p={p} />;
  const m = p.now;
  return (
    <HomeCard hot>
      <HomeKicker text="Now" color={INK} />
      <T size={14} weight="800" color={INK} numberOfLines={2} style={{ marginTop: 6 }}>
        {m.title}
      </T>
      <View style={{ flex: 1 }} />
      <D size={34} color={INK}>
        {m.left}
      </D>
      <View
        style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(20,10,5,0.22)', marginTop: 4 }}
      >
        <View
          style={{
            height: 5,
            borderRadius: 3,
            backgroundColor: INK,
            width: `${Math.round(m.progress * 100)}%`,
          }}
        />
      </View>
      <T size={11} weight="700" color={INK} numberOfLines={1} style={{ marginTop: 5 }}>
        {m.foot}
      </T>
    </HomeCard>
  );
}

export function NextPreview({ p }: { p: GlancePreview }) {
  return (
    <HomeCard>
      <HomeKicker text="Up next" color={CREAM} />
      <View style={{ flex: 1 }} />
      <D size={40} color={ORANGE}>
        {p.next.time}
      </D>
      <T size={14} weight="800" color={CREAM} numberOfLines={2}>
        {p.next.title}
      </T>
      <T
        size={11}
        weight="700"
        color={CREAM}
        numberOfLines={1}
        style={{ opacity: 0.7, marginTop: 4 }}
      >
        {p.next.foot}
      </T>
    </HomeCard>
  );
}

export function RundownPreview({ p }: { p: GlancePreview }) {
  return (
    <HomeCard wide>
      <HomeKicker text={p.rundown.kicker} color={CREAM} />
      <View style={{ marginTop: 6, gap: 2 }}>
        {p.rundown.rows.map((r, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 3,
              paddingHorizontal: 6,
              marginHorizontal: -6,
              borderRadius: 8,
              backgroundColor: r.current ? 'rgba(255,90,31,0.16)' : 'transparent',
            }}
          >
            <D size={15} color={ORANGE} style={{ width: 42 }}>
              {r.time}
            </D>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: r.color }} />
            <T size={13} weight="600" color={CREAM} numberOfLines={1} style={{ flex: 1 }}>
              {r.title}
            </T>
            <T size={12} weight="600" color={CREAM} style={{ opacity: 0.7 }}>
              {r.detail}
            </T>
          </View>
        ))}
      </View>
    </HomeCard>
  );
}

export function TimelinePreview({ p }: { p: GlancePreview }) {
  return (
    <HomeCard wide tall>
      <HomeKicker text={p.timeline.kicker} color={CREAM} />
      <View style={{ marginTop: 10, gap: 4 }}>
        {p.timeline.rows.map((r, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              gap: 8,
              minHeight: 26,
              borderRadius: 8,
              paddingRight: 8,
              opacity: r.past ? 0.45 : 1,
              backgroundColor: r.current ? 'rgba(255,90,31,0.16)' : 'transparent',
            }}
          >
            <View style={{ width: 4, borderRadius: 2, backgroundColor: r.color }} />
            <D size={14} color={ORANGE} style={{ width: 40 }}>
              {r.time}
            </D>
            <T size={13} weight="700" color={CREAM} numberOfLines={1} style={{ flex: 1 }}>
              {r.title}
            </T>
          </View>
        ))}
      </View>
    </HomeCard>
  );
}
