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
        withTiming(1.06, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    floatY.value = withDelay(
      800,
      withRepeat(
        withSequence(
          withTiming(-8, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
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
        <View style={styles.iconInner}>
          <Ionicons name={icon} size={44} color={COLORS.primaryLight} />
        </View>
      </Animated.View>
      <Animated.Text entering={FadeInDown.delay(200).springify().damping(16)} style={styles.title}>
        {title}
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(300).springify().damping(16)} style={styles.message}>
        {message}
      </Animated.Text>
      {actionLabel && onAction ? (
        <Animated.View entering={FadeInUp.delay(400).springify().damping(16)}>
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
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  iconInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primaryPale,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
  },
  actionButton: {
    marginTop: 28,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 15,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
