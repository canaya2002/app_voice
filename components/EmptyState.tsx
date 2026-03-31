import { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { COLORS } from '@/lib/constants';
import { hapticButtonPress } from '@/lib/haptics';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon = 'mic-outline',
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const pulseScale = useSharedValue(1);
  const floatY = useSharedValue(0);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    floatY.value = withDelay(
      1000,
      withRepeat(
        withSequence(
          withTiming(-6, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    );
  }, [pulseScale, floatY]);

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }, { translateY: floatY.value }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.iconCircle, iconAnimStyle]}>
        <Ionicons name={icon} size={48} color={COLORS.primaryLight} />
      </Animated.View>
      <Animated.Text entering={FadeInDown.delay(200).springify().damping(14)} style={styles.title}>
        {title}
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(300).springify().damping(14)} style={styles.message}>
        {message}
      </Animated.Text>
      {actionLabel && onAction ? (
        <Animated.View entering={FadeInUp.delay(400).springify().damping(14)}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              hapticButtonPress();
              onAction();
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.actionText}>{actionLabel}</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  actionButton: {
    marginTop: 24,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
