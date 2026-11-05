import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../theme/theme';
import { T } from './Text';

const DELAY_MS = 400;

export function StepList({ steps, active }: { steps: string[]; active: number }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let i = 0;
    setVisible(0); // eslint-disable-line react-hooks/set-state-in-effect -- reset on steps change
    const tick = () => {
      i++;
      if (i >= steps.length) return;
      timer.current = setTimeout(() => {
        setVisible(i);
        tick();
      }, DELAY_MS);
    };
    tick();
    return () => clearTimeout(timer.current);
  }, [steps]);

  return (
    <View accessibilityLiveRegion="polite" style={{ gap: 6 }}>
      {steps.map((step, i) =>
        i <= visible ? (
          <Animated.View
            key={step}
            entering={reduce ? FadeIn.duration(120) : FadeInDown.duration(200)}
          >
            <T
              size={14}
              weight={i === active ? '700' : '500'}
              color={i <= active ? c.text : c.muted}
            >
              {i < active ? '✓ ' : i === active ? '· ' : '  '}
              {step}
            </T>
          </Animated.View>
        ) : null,
      )}
    </View>
  );
}
