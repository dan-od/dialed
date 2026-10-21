import { forwardRef, useContext, useRef, useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
  type ViewInstance,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { fonts, useTheme } from '../theme/theme';
import { FormScrollContext } from './Chrome';
import { T } from './Text';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  helper?: string;
  password?: boolean;
  code?: boolean;
}

/** Auth field: label above, 52pt input (68pt Anton for the code), inline error that replaces the helper. */
export const Field = forwardRef<TextInputInstance, Props>(function Field(
  { label, error, helper, password, code, style, ...rest },
  ref,
) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  const { reveal } = useContext(FormScrollContext);
  const box = useRef<ViewInstance>(null);
  const describe = error ?? helper;
  return (
    <View ref={box} style={{ gap: 6 }}>
      <T size={13} weight="700" color={c.muted} accessible={false}>
        {label}
      </T>
      <View>
        <TextInput
          ref={ref}
          accessibilityLabel={code ? 'Code, 6 digits' : label}
          accessibilityHint={describe}
          aria-invalid={!!error}
          placeholderTextColor={c.muted}
          selectionColor={c.acc}
          secureTextEntry={password && !shown}
          onFocus={(e) => {
            setFocused(true);
            reveal(box.current);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[
            {
              height: code ? 68 : 52,
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: error ? c.err : focused ? c.acc : c.line,
              backgroundColor: c.surf,
              paddingHorizontal: 16,
              paddingRight: password ? 70 : 16,
              fontSize: 17,
              fontWeight: '600',
              color: c.text,
            },
            code && {
              fontFamily: fonts.display,
              fontSize: 34,
              fontWeight: 'normal',
              letterSpacing: 14,
              textAlign: 'center',
              paddingLeft: 30,
            },
            style,
          ]}
          {...rest}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Hide password' : 'Show password'}
            accessibilityState={{ selected: shown }}
            onPress={() => setShown((s) => !s)}
            style={{
              position: 'absolute',
              right: 6,
              top: 6,
              height: 40,
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: c.surf2,
              justifyContent: 'center',
            }}
          >
            <T size={13} weight="700">
              {shown ? 'Hide' : 'Show'}
            </T>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <T size={13} weight="600" color={c.err}>
            {error}
          </T>
        </Animated.View>
      ) : helper ? (
        <T size={13} weight="600" color={c.muted}>
          {helper}
        </T>
      ) : null}
    </View>
  );
});
