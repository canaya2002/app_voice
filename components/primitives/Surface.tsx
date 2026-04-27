/**
 * Surface — the unified container primitive for Sythio.
 *
 * Replaces ad-hoc Views with backgrounds + borders so that every elevated
 * area in the UI uses the same set of visual tokens. Premium consistency
 * comes from never having two cards that "almost" match.
 */

import { ReactNode } from 'react';
import { View, ViewStyle, StyleProp, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme, type Theme } from '@/lib/design/tokens';

export type SurfaceVariant = 'plain' | 'subtle' | 'elevated' | 'glass' | 'outline';
export type SurfaceRadius = keyof Theme['radii'];

interface SurfaceProps {
  variant?: SurfaceVariant;
  radius?: SurfaceRadius;
  padding?: keyof Theme['spacing'];
  paddingHorizontal?: keyof Theme['spacing'];
  paddingVertical?: keyof Theme['spacing'];
  border?: 'none' | 'subtle' | 'default' | 'strong';
  shadow?: keyof Theme['shadows'];
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function Surface({
  variant = 'plain',
  radius = 'lg',
  padding,
  paddingHorizontal,
  paddingVertical,
  border = 'none',
  shadow = 'none',
  style,
  children,
}: SurfaceProps) {
  const t = useTheme();

  const baseStyle: ViewStyle = {
    borderRadius: t.radii[radius],
    overflow: 'hidden',
  };

  if (padding != null) baseStyle.padding = t.spacing[padding];
  if (paddingHorizontal != null) baseStyle.paddingHorizontal = t.spacing[paddingHorizontal];
  if (paddingVertical != null) baseStyle.paddingVertical = t.spacing[paddingVertical];

  if (border !== 'none') {
    baseStyle.borderWidth = StyleSheet.hairlineWidth * 1.5;
    baseStyle.borderColor = t.border[border];
  }

  switch (variant) {
    case 'plain':
      baseStyle.backgroundColor = t.bg.primary;
      break;
    case 'subtle':
      baseStyle.backgroundColor = t.bg.secondary;
      break;
    case 'elevated':
      baseStyle.backgroundColor = t.bg.elevated;
      break;
    case 'outline':
      baseStyle.backgroundColor = 'transparent';
      if (border === 'none') {
        baseStyle.borderWidth = StyleSheet.hairlineWidth * 1.5;
        baseStyle.borderColor = t.border.default;
      }
      break;
    case 'glass':
      // Background applied via BlurView below
      break;
  }

  if (shadow !== 'none') {
    Object.assign(baseStyle, t.shadows[shadow]);
  }

  if (variant === 'glass') {
    return (
      <View style={[baseStyle, style]}>
        {Platform.OS === 'ios' ? (
          <BlurView
            tint={t.mode === 'dark' ? 'dark' : 'light'}
            intensity={t.blur.default}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg.elevated, opacity: 0.92 }]} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg.overlay }]} />
        <View style={{ flex: 0 }}>{children}</View>
      </View>
    );
  }

  return <View style={[baseStyle, style]}>{children}</View>;
}
