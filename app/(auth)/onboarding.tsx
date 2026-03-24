import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
  useWindowDimensions,
} from 'react-native';
import RNAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  FadeInUp,
  FadeInLeft,
  ZoomIn,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/lib/constants';
import { shadows } from '@/lib/styles';
import { lightTap, successTap } from '@/lib/haptics';
import FloatingOrb from '@/components/FloatingOrb';
import AnimatedPressable from '@/components/AnimatedPressable';

export const ONBOARDING_KEY = 'voicenotes_onboarding_done';

interface OnboardingPage {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  subtitle: string;
}

const PAGES: OnboardingPage[] = [
  {
    icon: 'mic',
    iconColor: COLORS.recording,
    title: 'Graba cualquier conversación',
    subtitle: 'Reuniones, clases, ideas, lo que sea. Solo toca y habla.',
  },
  {
    icon: 'sparkles',
    iconColor: '#F8C537',
    title: 'Magia instantánea',
    subtitle: 'Resumen, puntos clave y tareas en segundos gracias a la IA.',
  },
  {
    icon: 'bulb',
    iconColor: COLORS.primary,
    title: 'Tu segundo cerebro',
    subtitle: 'No pierdas ni una idea nunca más. Todo organizado y exportable.',
  },
];

/* ── Pulse Ring (Reanimated) ─────────────────────────────── */
function PulseRing({ size, delayMs }: { size: number; delayMs: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
  }, [progress, delayMs]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - progress.value),
    transform: [{ scale: 1 + progress.value * 0.3 }],
  }));

  return (
    <RNAnimated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: COLORS.primaryLight,
        },
        animStyle,
      ]}
    />
  );
}

/* ── Page 1: Mic illustration ──────────────────────────── */
function MicIllustration() {
  return (
    <View style={illustrationStyles.centered}>
      <PulseRing size={180} delayMs={0} />
      <PulseRing size={160} delayMs={400} />
      <PulseRing size={140} delayMs={800} />
      <View style={illustrationStyles.micCircle}>
        <Ionicons name="mic" size={80} color={COLORS.recording} />
      </View>
    </View>
  );
}

/* ── Page 2: Bars illustration ─────────────────────────── */
const BAR_WIDTHS = ['60%', '80%', '50%', '90%', '70%'] as const;
const BAR_OPACITIES = [0.15, 0.25, 0.35, 0.45, 0.55] as const;

function SparkleIcon() {
  const pulse = useSharedValue(0.4);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.4, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <RNAnimated.View
      style={[{ position: 'absolute', top: -8, right: -8 }, animStyle]}
    >
      <Ionicons name="sparkles" size={20} color={COLORS.warning} />
    </RNAnimated.View>
  );
}

function BarsIllustration() {
  return (
    <View style={illustrationStyles.barsContainer}>
      <SparkleIcon />
      {BAR_WIDTHS.map((w, i) => (
        <RNAnimated.View
          key={i}
          entering={FadeInLeft.delay(i * 200).springify().damping(14)}
          style={{
            width: w,
            height: 10,
            borderRadius: 5,
            backgroundColor: COLORS.primary,
            opacity: BAR_OPACITIES[i],
            marginBottom: i < BAR_WIDTHS.length - 1 ? 10 : 0,
          }}
        />
      ))}
    </View>
  );
}

/* ── Page 3: Network illustration ──────────────────────── */
const NODE_COLORS = [COLORS.primary, COLORS.info, COLORS.success, COLORS.warning];
const NODE_OFFSETS = [
  { top: -30, left: -30 },   // top-left
  { top: -30, right: -30 },  // top-right
  { bottom: -30, left: -30 },  // bottom-left
  { bottom: -30, right: -30 }, // bottom-right
];
const LINE_POSITIONS: { angle: string; origin: string }[] = [
  { angle: '-45deg', origin: 'center left' },
  { angle: '45deg', origin: 'center right' },
  { angle: '-135deg', origin: 'center left' },
  { angle: '135deg', origin: 'center right' },
];

function GrowingLine({
  index,
  position,
}: {
  index: number;
  position: typeof NODE_OFFSETS[number];
}) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(
      index * 200 + 300,
      withTiming(50, { duration: 600, easing: Easing.out(Easing.ease) }),
    );
  }, [width, index]);

  const animStyle = useAnimatedStyle(() => ({
    width: width.value,
  }));

  const isTop = 'top' in position;
  const isLeft = 'left' in position;

  return (
    <RNAnimated.View
      style={[
        {
          position: 'absolute',
          height: 2,
          backgroundColor: NODE_COLORS[index],
          opacity: 0.4,
          transform: [
            { rotate: `${isTop ? '' : '-'}${isLeft ? '-' : ''}45deg` },
          ],
        },
        isTop ? { top: 18 } : { bottom: 18 },
        isLeft ? { left: 18 } : { right: 18 },
        animStyle,
      ]}
    />
  );
}

function NetworkIllustration() {
  return (
    <View style={illustrationStyles.networkContainer}>
      {/* Center circle */}
      <View style={illustrationStyles.centerNode} />

      {/* Lines */}
      {NODE_OFFSETS.map((pos, i) => (
        <GrowingLine key={`line-${i}`} index={i} position={pos} />
      ))}

      {/* Corner nodes */}
      {NODE_OFFSETS.map((pos, i) => (
        <RNAnimated.View
          key={`node-${i}`}
          entering={ZoomIn.delay(i * 200).springify().damping(12)}
          style={[
            {
              position: 'absolute',
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: NODE_COLORS[i],
            },
            pos as object,
          ]}
        />
      ))}
    </View>
  );
}

const illustrationStyles = StyleSheet.create({
  centered: {
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barsContainer: {
    width: 180,
    paddingVertical: 20,
    paddingHorizontal: 10,
    alignItems: 'flex-start',
  },
  networkContainer: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerNode: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    opacity: 0.1,
  },
});

/* ── Illustrations array ───────────────────────────────── */
const ILLUSTRATIONS: React.FC[] = [
  MicIllustration,
  BarsIllustration,
  NetworkIllustration,
];

/* ── Main screen ───────────────────────────────────────── */
export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const iconAnims = useRef(PAGES.map(() => new Animated.Value(0))).current;
  const textAnims = useRef(PAGES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    animatePage(0);
  }, []);

  const animatePage = (index: number) => {
    iconAnims[index].setValue(0);
    textAnims[index].setValue(0);

    Animated.sequence([
      Animated.spring(iconAnims[index], {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(textAnims[index], {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const page = Math.round(offsetX / width);
      if (page >= 0 && page < PAGES.length && page !== currentPage) {
        setCurrentPage(page);
        animatePage(page);
        lightTap();
      }
    },
    [width, currentPage],
  );

  const handleNext = () => {
    if (currentPage < PAGES.length - 1) {
      lightTap();
      const nextPage = currentPage + 1;
      scrollRef.current?.scrollTo({ x: nextPage * width, animated: true });
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    successTap();
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    if (__DEV__) console.log('[onboarding] flag saved, navigating to login');
    router.replace('/login');
  };

  const isLastPage = currentPage === PAGES.length - 1;

  return (
    <LinearGradient
      colors={['#FAFAFA', '#F0EFFF', '#E8E6FF']}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.container}>
        {/* Floating orbs */}
        <FloatingOrb size={300} color={COLORS.primaryLight} top={-80} right={-100} />
        <FloatingOrb size={220} color={COLORS.primary} top={400} left={-60} delay={600} />

        {/* Skip button */}
        {!isLastPage && (
          <AnimatedPressable onPress={handleComplete} style={styles.skipButton}>
            <Text style={styles.skipText}>Saltar</Text>
          </AnimatedPressable>
        )}

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
          bounces={false}
        >
          {PAGES.map((page, index) => {
            const Illustration = ILLUSTRATIONS[index];
            return (
              <View key={index} style={[styles.page, { width }]}>
                <Animated.View
                  style={[
                    styles.iconContainer,
                    {
                      transform: [
                        {
                          scale: iconAnims[index].interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.3, 1],
                          }),
                        },
                      ],
                      opacity: iconAnims[index],
                    },
                  ]}
                >
                  <Illustration />
                </Animated.View>

                <Animated.View
                  style={{
                    opacity: textAnims[index],
                    transform: [
                      {
                        translateY: textAnims[index].interpolate({
                          inputRange: [0, 1],
                          outputRange: [20, 0],
                        }),
                      },
                    ],
                  }}
                >
                  <RNAnimated.View entering={FadeInUp.delay(300)}>
                    <Text style={styles.title}>{page.title}</Text>
                  </RNAnimated.View>
                  <RNAnimated.View entering={FadeInUp.delay(500)}>
                    <Text style={styles.subtitle}>{page.subtitle}</Text>
                  </RNAnimated.View>
                </Animated.View>
              </View>
            );
          })}
        </ScrollView>

        {/* Bottom section */}
        <View style={styles.bottom}>
          {/* Dot indicators */}
          <View style={styles.dots}>
            {PAGES.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  currentPage === index ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>

          {/* Action button */}
          {isLastPage ? (
            <AnimatedPressable
              onPress={handleNext}
              style={styles.startButtonOuter}
              scaleDown={0.96}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryDark]}
                style={styles.startButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.startButtonText}>Empezar gratis</Text>
              </LinearGradient>
            </AnimatedPressable>
          ) : (
            <AnimatedPressable onPress={handleNext} style={styles.nextButton}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryDark]}
                style={styles.nextButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
              </LinearGradient>
            </AnimatedPressable>
          )}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  skipText: {
    fontSize: 15,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  page: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconContainer: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginTop: 40,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 32,
    marginTop: 16,
  },
  bottom: {
    paddingHorizontal: 32,
    paddingBottom: 48,
    gap: 28,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  dotInactive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: 'transparent',
  },
  startButtonOuter: {
    width: '100%',
    ...shadows.purple,
  },
  startButton: {
    width: '100%',
    height: 58,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  nextButton: {
    ...shadows.purple,
  },
  nextButtonGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
