import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { COLORS } from '@/lib/constants';

interface FloatingOrbProps {
  size?: number;
  color?: string;
  top?: number;
  left?: number;
  right?: number;
  delay?: number;
}

export default function FloatingOrb({
  size = 220,
  color = COLORS.primaryLight,
  top,
  left,
  right,
  delay: orbDelay = 0,
}: FloatingOrbProps) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    translateY.value = withDelay(
      orbDelay,
      withRepeat(
        withSequence(
          withTiming(-18, { duration: 3500, easing: Easing.inOut(Easing.sin) }),
          withTiming(18, { duration: 3500, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );
    translateX.value = withDelay(
      orbDelay + 600,
      withRepeat(
        withSequence(
          withTiming(-12, { duration: 4500, easing: Easing.inOut(Easing.sin) }),
          withTiming(12, { duration: 4500, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );
    scale.value = withDelay(
      orbDelay + 300,
      withRepeat(
        withSequence(
          withTiming(1.08, { duration: 5500, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 5500, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );
  }, [translateY, translateX, scale, orbDelay]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
    ],
  }));

  const posStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    ...(top !== undefined ? { top } : {}),
    ...(left !== undefined ? { left } : {}),
    ...(right !== undefined ? { right } : {}),
  };

  return (
    <Animated.View
      style={[styles.container, posStyle, animStyle]}
      pointerEvents="none"
    >
      <LinearGradient
        colors={[color + '18', color + '0A', color + '04', 'transparent']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0.3 }}
        end={{ x: 1, y: 1 }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    overflow: 'hidden',
  },
  gradient: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
});
