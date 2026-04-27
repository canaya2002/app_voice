/**
 * Banner — inline non-modal feedback. Replaces Alert.alert() for non-blocking
 * messages. Tone-mapped colors, optional dismiss + action.
 *
 * Use Toast for transient success/info messages, Banner for persistent ones
 * the user must read or act on (e.g., "you've used 2/2 free notes today").
 */

import { ReactNode } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useTheme } from '@/lib/design/tokens';

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'accent';

interface BannerProps {
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
  onDismiss?: () => void;
  trailing?: ReactNode;
}

const ICONS: Record<Tone, keyof typeof Ionicons.glyphMap> = {
  info: 'information-circle',
  success: 'checkmark-circle',
  warning: 'alert-circle',
  danger: 'close-circle',
  accent: 'sparkles',
};

export function Banner({
  tone = 'info',
  icon,
  title,
  description,
  action,
  onDismiss,
  trailing,
}: BannerProps) {
  const t = useTheme();

  const palette = (() => {
    switch (tone) {
      case 'success': return { bg: t.semantic.success + '14', border: t.semantic.success + '40', accent: t.semantic.success };
      case 'warning': return { bg: t.semantic.warning + '14', border: t.semantic.warning + '40', accent: t.semantic.warning };
      case 'danger': return { bg: t.semantic.danger + '14', border: t.semantic.danger + '40', accent: t.semantic.danger };
      case 'accent': return { bg: t.accentSubtle, border: t.accentPrimary + '40', accent: t.accentPrimary };
      case 'info':
      default: return { bg: t.semantic.info + '14', border: t.semantic.info + '40', accent: t.semantic.info };
    }
  })();

  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      exiting={FadeOut.duration(200)}
      style={[
        styles.wrap,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: palette.accent + '22' }]}>
        <Ionicons name={icon ?? ICONS[tone]} size={18} color={palette.accent} />
      </View>
      <View style={styles.body}>
        <Text variant="body-strong" numberOfLines={2}>
          {title}
        </Text>
        {description ? (
          <Text variant="callout" tone="secondary" style={{ marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={6} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
            <Text variant="callout" weight="semibold" style={{ color: palette.accent }}>
              {action.label} →
            </Text>
          </Pressable>
        ) : null}
      </View>
      {trailing}
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={8} style={styles.dismiss}>
          <Ionicons name="close" size={16} color={t.text.tertiary} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  body: {
    flex: 1,
  },
  dismiss: {
    padding: 2,
  },
});
