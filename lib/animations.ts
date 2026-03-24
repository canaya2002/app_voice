import {
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  FadeIn,
  FadeOut,
  FadeInDown,
  FadeInUp,
  FadeInLeft,
  FadeInRight,
  SlideInRight,
  SlideOutLeft,
  ZoomIn,
  ZoomOut,
  Layout,
} from 'react-native-reanimated';

export const SPRING = {
  gentle: { damping: 15, stiffness: 150, mass: 0.5 },
  bouncy: { damping: 10, stiffness: 200, mass: 0.3 },
  snappy: { damping: 20, stiffness: 400, mass: 0.5 },
  slow: { damping: 20, stiffness: 80, mass: 1 },
} as const;

export const staggeredEntry = (index: number) =>
  FadeInDown.delay(index * 80).springify().damping(15).stiffness(150);

export const cardEntry = (index: number) =>
  FadeInUp.delay(index * 100).springify().damping(14).stiffness(120);

export const scaleEntry = ZoomIn.springify().damping(12).stiffness(180);

export const layoutTransition = Layout.springify().damping(15).stiffness(120);

export {
  withSpring, withTiming, withDelay, withSequence, withRepeat,
  Easing, interpolate, useAnimatedStyle, useSharedValue,
  FadeIn, FadeOut, FadeInDown, FadeInUp, FadeInLeft, FadeInRight,
  SlideInRight, SlideOutLeft, ZoomIn, ZoomOut, Layout,
};
