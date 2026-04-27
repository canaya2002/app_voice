/**
 * EmptyState — premium empty placeholders.
 *
 * Used in lists/sections that have no content yet. The visual goes from
 * "blank" to "intentional invitation" — premium apps are defined by how
 * they handle their empty states.
 */

import { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Button } from './Button';
import { useTheme } from '@/lib/design/tokens';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  illustration?: ReactNode;
  title: string;
  description?: string;
  cta?: {
    label: string;
    onPress: () => void;
    icon?: keyof typeof Ionicons.glyphMap;
  };
  variant?: 'inline' | 'centered';
}

export function EmptyState({
  icon = 'sparkles-outline',
  illustration,
  title,
  description,
  cta,
  variant = 'centered',
}: EmptyStateProps) {
  const t = useTheme();

  return (
    <Animated.View
      entering={FadeInUp.duration(360)}
      style={[
        styles.wrap,
        variant === 'centered' && { paddingVertical: t.spacing[12] },
      ]}
    >
      {illustration ? (
        <View style={styles.illustration}>{illustration}</View>
      ) : (
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: t.accentSubtle },
          ]}
        >
          <Ionicons name={icon} size={28} color={t.accentPrimary} />
        </View>
      )}
      <Text
        variant="subtitle"
        align="center"
        style={{ marginTop: 16, maxWidth: 320 }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          variant="callout"
          tone="secondary"
          align="center"
          style={{ marginTop: 6, maxWidth: 320, lineHeight: 20 }}
        >
          {description}
        </Text>
      ) : null}
      {cta ? (
        <View style={{ marginTop: 24 }}>
          <Button
            label={cta.label}
            variant="primary"
            size="md"
            onPress={cta.onPress}
            leadingIcon={cta.icon ? <Ionicons name={cta.icon} size={16} color="#FFFFFF" /> : undefined}
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustration: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
