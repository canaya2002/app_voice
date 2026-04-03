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
  gentle: { damping: 18, stiffness: 140, mass: 0.6 },
  bouncy: { damping: 12, stiffness: 200, mass: 0.35 },
  snappy: { damping: 22, stiffness: 380, mass: 0.5 },
  slow: { damping: 24, stiffness: 70, mass: 1.1 },
  premium: { damping: 20, stiffness: 160, mass: 0.7 },
} as const;

export const staggeredEntry = (index: number) =>
  FadeInDown.delay(index * 60).springify().damping(18).stiffness(140);

export const cardEntry = (index: number) =>
  FadeInUp.delay(index * 80).springify().damping(16).stiffness(110);

export const scaleEntry = ZoomIn.springify().damping(14).stiffness(160);

export const layoutTransition = Layout.springify().damping(18).stiffness(110);

export const fadeEntry = (delay: number = 0) =>
  FadeIn.delay(delay).duration(350);

export const slideEntry = (index: number) =>
  FadeInRight.delay(index * 60).springify().damping(18).stiffness(140);

export {
  withSpring, withTiming, withDelay, withSequence, withRepeat,
  Easing, interpolate, useAnimatedStyle, useSharedValue,
  FadeIn, FadeOut, FadeInDown, FadeInUp, FadeInLeft, FadeInRight,
  SlideInRight, SlideOutLeft, ZoomIn, ZoomOut, Layout,
};
