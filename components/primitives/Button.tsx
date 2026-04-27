/**
 * Button — premium pressable with spring scale + haptics.
 *
 * Variants:
 *   - primary: filled accent, used for CTAs (one per screen)
 *   - secondary: outline, used for secondary actions
 *   - ghost: text-only, used for tertiary actions
 *   - danger: filled red, for destructive actions
 *
 * Sizes:
 *   - sm: 36px, dense lists
 *   - md: 44px, default (matches Apple HIG min tap target)
 *   - lg: 56px, hero CTAs
 */

import { ReactNode, useCallback } from 'react';
import { Pressable, ViewStyle, StyleProp, TextStyle, ActivityIndicator } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { useTheme } from '@/lib/design/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label?: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  haptic = 'light',
  onPress,
  style,
  children,
}: ButtonProps) {
  const t = useTheme();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.96, t.motion.spring.snappy);
    opacity.value = withTiming(0.85, { duration: 100 });
  }, [scale, opacity, t.motion.spring.snappy]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, t.motion.spring.snappy);
    opacity.value = withTiming(1, { duration: 150 });
  }, [scale, opacity, t.motion.spring.snappy]);

  const handlePress = useCallback(() => {
    if (disabled || loading) return;
    if (haptic !== 'none') {
      const style =
        haptic === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy :
        haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium :
        Haptics.ImpactFeedbackStyle.Light;
      Haptics.impactAsync(style).catch(() => undefined);
    }
    onPress?.();
  }, [disabled, loading, haptic, onPress]);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const height = size === 'sm' ? 36 : size === 'md' ? 48 : 56;
  const paddingH = size === 'sm' ? t.spacing[3] : size === 'md' ? t.spacing[5] : t.spacing[6];

  const baseStyle: ViewStyle = {
    height,
    paddingHorizontal: paddingH,
    borderRadius: size === 'sm' ? t.radii.md : t.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: t.spacing[2],
    ...(fullWidth ? { alignSelf: 'stretch' } : {}),
  };

  let bg: string = 'transparent';
  let textTone: 'primary' | 'inverse' | 'secondary' | 'tertiary' | 'danger' | 'accent' = 'primary';
  let borderColor: string | undefined;

  switch (variant) {
    case 'primary':
      bg = disabled ? t.bg.tertiary : t.accentPrimary;
      textTone = disabled ? 'tertiary' : 'inverse';
      break;
    case 'secondary':
      bg = t.bg.secondary;
      borderColor = t.border.default;
      textTone = 'primary';
      break;
    case 'ghost':
      bg = 'transparent';
      textTone = 'primary';
      break;
    case 'danger':
      bg = t.semantic.danger;
      textTone = 'inverse';
      break;
  }

  const finalStyle: ViewStyle = {
    ...baseStyle,
    backgroundColor: bg,
    ...(borderColor ? { borderWidth: 1, borderColor } : {}),
  };

  const textWeight: TextStyle['fontWeight'] = '600';
  const textSize = size === 'sm' ? 14 : size === 'md' ? 15 : 17;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[finalStyle, aStyle, style]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={textTone === 'inverse' ? t.text.onAccent : t.text.primary} />
      ) : (
        <>
          {leadingIcon}
          {label ? (
            <Text tone={textTone} style={{ fontSize: textSize, fontWeight: textWeight }}>
              {label}
            </Text>
          ) : null}
          {children}
          {trailingIcon}
        </>
      )}
    </AnimatedPressable>
  );
}
