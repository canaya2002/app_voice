/**
 * TOTPInput — six segmented digit cells, iOS-style.
 *
 * Uses a single hidden TextInput for input handling and renders 6 visual cells
 * that reflect the current value. Auto-focuses; auto-fills via SMS/keychain
 * are passed through.
 */

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { TextInput, StyleSheet, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/lib/design/tokens';
import { Text } from '@/components/primitives/Text';

interface Props {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

export interface TOTPInputHandle {
  focus: () => void;
  clear: () => void;
}

const LENGTH = 6;

export const TOTPInput = forwardRef<TOTPInputHandle, Props>(function TOTPInput(
  { value, onChange, onComplete, autoFocus = true, disabled = false },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => onChange(''),
  }));

  const handleChange = useCallback(
    (raw: string) => {
      const digits = raw.replace(/\D/g, '').slice(0, LENGTH);
      onChange(digits);
      if (digits.length === LENGTH) onComplete?.(digits);
    },
    [onChange, onComplete],
  );

  const cells = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '');
  const activeIndex = Math.min(value.length, LENGTH - 1);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.row}>
      {cells.map((char, i) => {
        const isActive = focused && i === activeIndex && value.length < LENGTH;
        const filled = char.length > 0;
        return (
          <Cell
            key={i}
            char={char}
            active={isActive}
            filled={filled}
            disabled={disabled}
          />
        );
      })}
      <TextInput
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        maxLength={LENGTH}
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        editable={!disabled}
        style={styles.hidden}
        caretHidden
      />
    </Pressable>
  );
});

function Cell({ char, active, filled, disabled }: { char: string; active: boolean; filled: boolean; disabled: boolean }) {
  const t = useTheme();
  const scale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);

  if (active) {
    scale.value = withSpring(1.04, t.motion.spring.snappy);
    ringOpacity.value = withTiming(1, { duration: 180 });
  } else {
    scale.value = withSpring(1, t.motion.spring.snappy);
    ringOpacity.value = withTiming(0, { duration: 180 });
  }

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.cell,
        {
          backgroundColor: filled ? t.bg.elevated : t.bg.secondary,
          borderColor: filled ? t.border.strong : t.border.subtle,
        },
        aStyle,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          { borderColor: t.accentPrimary, borderRadius: t.radii.md },
          ringStyle,
        ]}
      />
      <Text variant="title" tone={disabled ? 'tertiary' : 'primary'}>
        {char}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
  },
  hidden: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
});
