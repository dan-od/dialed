import { useRef } from 'react';
import { ScrollView, type ScrollViewInstance, type ScrollViewProps } from 'react-native';
import { useToastAwareList } from './Toast';

/** A page list whose end makes room for a toast, so the toast never covers its last row. */
export function ToastAwareScroll({
  base,
  contentContainerStyle,
  onScroll,
  ...rest
}: ScrollViewProps & { base: number }) {
  const ref = useRef<ScrollViewInstance>(null);
  const room = useToastAwareList(base, ref);
  return (
    <ScrollView
      ref={ref}
      scrollEventThrottle={16}
      onLayout={room.measure}
      onScroll={(e) => {
        room.track(e);
        onScroll?.(e);
      }}
      contentContainerStyle={[contentContainerStyle, { paddingBottom: room.paddingBottom }]}
      {...rest}
    />
  );
}
