import { type ReactNode } from 'react';
import { type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

const SPRING_DOWN = { damping: 20, stiffness: 400, mass: 0.5 };
const SPRING_UP = { damping: 10, stiffness: 200, mass: 0.3 };

interface AnimatedPressableProps {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  haptic?: boolean;
  scaleDown?: number;
  accessibilityLabel?: string;
}

export default function AnimatedPressable({
  children,
  onPress,
  style,
  disabled = false,
  haptic = true,
  scaleDown = 0.97,
  accessibilityLabel,
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const gesture = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      scale.value = withSpring(scaleDown, SPRING_DOWN);
      opacity.value = withSpring(0.88, SPRING_DOWN);
    })
    .onFinalize((_e, success) => {
      scale.value = withSpring(1, SPRING_UP);
      opacity.value = withSpring(1, SPRING_UP);
      if (success && onPress) {
        if (haptic) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress();
      }
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[animStyle, style]}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
