import { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  ViewToken,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  interpolate,
  FadeInUp,
  type SharedValue,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/lib/constants';
import { FONT } from '@/lib/styles';
import { hapticButtonPress, hapticProcessingDone } from '@/lib/haptics';
import AnimatedPressable from '@/components/AnimatedPressable';

export const ONBOARDING_KEY = 'sythio_onboarding_done';

/* ─── Page data ─────────────────────────────────────────── */

interface OnboardingPage {
  id: string;
  title: string;
  subtitle: string;
  illustration: 'welcome' | 'record' | 'magic' | 'templates' | 'ready';
}

const PAGES: OnboardingPage[] = [
  {
    id: 'welcome',
    title: 'Tu voz\ntiene poder',
    subtitle: 'Sythio transforma lo que dices en información clara, organizada y lista para usar.',
    illustration: 'welcome',
  },
  {
    id: 'record',
    title: 'Habla.\nSythio escucha.',
    subtitle: 'Graba reuniones, ideas, clases o cualquier momento importante. Solo toca el botón y habla.',
    illustration: 'record',
  },
  {
    id: 'magic',
    title: 'Inteligencia\nque entiende',
    subtitle: 'Resúmenes, tareas, reportes, planes de acción. Un audio, múltiples resultados.',
    illustration: 'magic',
  },
  {
    id: 'templates',
    title: 'Plantillas para\ncada momento',
    subtitle: 'Reunión, idea rápida, clase, brainstorm. Cada contexto tiene su formato ideal.',
    illustration: 'templates',
  },
  {
    id: 'ready',
    title: 'Todo listo',
    subtitle: 'Empieza a transformar tu voz en claridad y acción. Es así de simple.',
    illustration: 'ready',
  },
];

/* ─── Illustrations ─────────────────────────────────────── */

function WelcomeIllustration() {
  const breathe = useSharedValue(0);
  const ring1 = useSharedValue(0.8);
  const ring1Op = useSharedValue(0.2);
  const ring2 = useSharedValue(0.8);
  const ring2Op = useSharedValue(0.2);

  useEffect(() => {
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
      ), -1, true
    );
    ring1.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 2800, easing: Easing.out(Easing.cubic) }),
        withTiming(0.8, { duration: 0 }),
      ), -1
    );
    ring1Op.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 2800, easing: Easing.out(Easing.cubic) }),
        withTiming(0.2, { duration: 0 }),
      ), -1
    );
    ring2.value = withDelay(900, withRepeat(
      withSequence(
        withTiming(1.4, { duration: 2800, easing: Easing.out(Easing.cubic) }),
        withTiming(0.8, { duration: 0 }),
      ), -1
    ));
    ring2Op.value = withDelay(900, withRepeat(
      withSequence(
        withTiming(0, { duration: 2800, easing: Easing.out(Easing.cubic) }),
        withTiming(0.2, { duration: 0 }),
      ), -1
    ));
  }, [breathe, ring1, ring1Op, ring2, ring2Op]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.06, 0.18]),
    transform: [{ scale: interpolate(breathe.value, [0, 1], [0.95, 1.08]) }],
  }));
  const r1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring1.value }],
    opacity: ring1Op.value,
  }));
  const r2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring2.value }],
    opacity: ring2Op.value,
  }));

  return (
    <View style={illStyles.container}>
      <Animated.View style={[illStyles.glow, glowStyle]} />
      <Animated.View style={[illStyles.ring, r1Style]} />
      <Animated.View style={[illStyles.ring, r2Style]} />
      <View style={illStyles.logoCircle}>
        <Text style={illStyles.logoS}>S</Text>
      </View>
    </View>
  );
}

function RecordIllustration() {
  const wave1 = useSharedValue(0);
  const wave2 = useSharedValue(0);
  const wave3 = useSharedValue(0);
  const micScale = useSharedValue(1);

  useEffect(() => {
    micScale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      ), -1, true
    );
    wave1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 0 }),
      ), -1
    );
    wave2.value = withDelay(600, withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 0 }),
      ), -1
    ));
    wave3.value = withDelay(1200, withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 0 }),
      ), -1
    ));
  }, [micScale, wave1, wave2, wave3]);

  const micStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }],
  }));
  const makeWaveStyle = (val: SharedValue<number>) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => ({
      opacity: interpolate(val.value, [0, 0.5, 1], [0, 0.4, 0]),
      transform: [{ scale: interpolate(val.value, [0, 1], [1, 1.8]) }],
    }));
  const w1Style = makeWaveStyle(wave1);
  const w2Style = makeWaveStyle(wave2);
  const w3Style = makeWaveStyle(wave3);

  return (
    <View style={illStyles.container}>
      <Animated.View style={[illStyles.waveRing, w1Style]} />
      <Animated.View style={[illStyles.waveRing, w2Style]} />
      <Animated.View style={[illStyles.waveRing, w3Style]} />
      <Animated.View style={[illStyles.micOuter, micStyle]}>
        <Ionicons name="mic" size={52} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
}

function MagicIllustration() {
  const mainRotate = useSharedValue(0);
  const sparkleScale = useSharedValue(1);
  const orb1 = useSharedValue(0);
  const orb2 = useSharedValue(0);
  const orb3 = useSharedValue(0);

  useEffect(() => {
    mainRotate.value = withRepeat(
      withTiming(360, { duration: 20000, easing: Easing.linear }), -1
    );
    sparkleScale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.95, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ), -1, true
    );
    orb1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      ), -1, true
    );
    orb2.value = withDelay(400, withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      ), -1, true
    ));
    orb3.value = withDelay(800, withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      ), -1, true
    ));
  }, [mainRotate, sparkleScale, orb1, orb2, orb3]);

  const rotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${mainRotate.value}deg` }],
  }));
  const sparkleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sparkleScale.value }],
  }));
  const makeOrbStyle = (val: SharedValue<number>) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => ({
      opacity: interpolate(val.value, [0, 1], [0.4, 1]),
      transform: [{ scale: interpolate(val.value, [0, 1], [0.8, 1.1]) }],
    }));
  const o1Style = makeOrbStyle(orb1);
  const o2Style = makeOrbStyle(orb2);
  const o3Style = makeOrbStyle(orb3);

  return (
    <View style={illStyles.container}>
      <Animated.View style={[illStyles.orbitRing, rotateStyle]}>
        <Animated.View style={[illStyles.orbitDot, { top: 0, left: '50%', marginLeft: -6 }, o1Style]} />
        <Animated.View style={[illStyles.orbitDot, illStyles.orbitDot2, { bottom: 10, left: 10 }, o2Style]} />
        <Animated.View style={[illStyles.orbitDot, illStyles.orbitDot3, { bottom: 10, right: 10 }, o3Style]} />
      </Animated.View>
      <Animated.View style={[illStyles.magicCenter, sparkleStyle]}>
        <Ionicons name="sparkles" size={56} color={COLORS.accentGold} />
      </Animated.View>
    </View>
  );
}

const TEMPLATE_ITEMS = [
  { icon: 'people-outline' as const, label: 'Reuniones', color: '#0EA5E9' },
  { icon: 'flash-outline' as const, label: 'Ideas', color: '#F59E0B' },
  { icon: 'school-outline' as const, label: 'Clases', color: '#34C759' },
  { icon: 'bulb-outline' as const, label: 'Brainstorm', color: '#8B5CF6' },
  { icon: 'business-outline' as const, label: 'Clientes', color: '#A78BFA' },
  { icon: 'book-outline' as const, label: 'Diario', color: '#EC4899' },
];

function TemplatesIllustration() {
  return (
    <View style={illStyles.templateGrid}>
      {TEMPLATE_ITEMS.map((item, i) => (
        <Animated.View
          key={item.label}
          entering={FadeInUp.delay(i * 100 + 200).duration(500).springify().damping(14)}
          style={illStyles.templateCard}
        >
          <View style={[illStyles.templateIcon, { backgroundColor: item.color + '15' }]}>
            <Ionicons name={item.icon} size={24} color={item.color} />
          </View>
          <Text style={illStyles.templateLabel}>{item.label}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

function ReadyIllustration() {
  const checkScale = useSharedValue(0);
  const glowOp = useSharedValue(0);
  const ring1 = useSharedValue(0.6);
  const ring1Op = useSharedValue(0);

  useEffect(() => {
    checkScale.value = withDelay(300, withSpring(1, { damping: 8, stiffness: 120, mass: 0.6 }));
    glowOp.value = withDelay(500, withRepeat(
      withSequence(
        withTiming(0.15, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.05, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ), -1, true
    ));
    ring1.value = withDelay(600, withRepeat(
      withSequence(
        withTiming(1.5, { duration: 3000, easing: Easing.out(Easing.cubic) }),
        withTiming(0.6, { duration: 0 }),
      ), -1
    ));
    ring1Op.value = withDelay(600, withRepeat(
      withSequence(
        withTiming(0, { duration: 3000, easing: Easing.out(Easing.cubic) }),
        withTiming(0.25, { duration: 0 }),
      ), -1
    ));
  }, [checkScale, glowOp, ring1, ring1Op]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOp.value,
  }));
  const r1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring1.value }],
    opacity: ring1Op.value,
  }));

  return (
    <View style={illStyles.container}>
      <Animated.View style={[illStyles.readyGlow, glowStyle]} />
      <Animated.View style={[illStyles.readyRing, r1Style]} />
      <Animated.View style={[illStyles.readyCircle, checkStyle]}>
        <Ionicons name="checkmark" size={56} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
}

const ILLUSTRATION_MAP: Record<string, React.FC> = {
  welcome: WelcomeIllustration,
  record: RecordIllustration,
  magic: MagicIllustration,
  templates: TemplatesIllustration,
  ready: ReadyIllustration,
};

const illStyles = StyleSheet.create({
  container: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
  },
  ring: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
    borderColor: 'rgba(124, 58, 237, 0.15)',
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(124, 58, 237, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
  logoS: {
    fontSize: 48,
    fontFamily: FONT.bold,
    color: '#7C3AED',
    letterSpacing: -1,
  },
  waveRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  micOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  orbitRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderStyle: 'dashed',
  },
  orbitDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accentGold,
  },
  orbitDot2: {
    backgroundColor: COLORS.primaryLight,
  },
  orbitDot3: {
    backgroundColor: COLORS.success,
  },
  magicCenter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: 240,
  },
  templateCard: {
    width: 104,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  templateIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateLabel: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: '#475569',
  },
  readyGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  readyRing: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1.5,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  readyCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
});

/* ─── Animated Dot Indicator ────────────────────────────── */

function DotIndicator({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i === current;
        return (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                width: isActive ? 28 : 8,
                backgroundColor: isActive ? '#0F172A' : '#E2E8F0',
              },
            ]}
            layout={withSpring({ damping: 18, stiffness: 200 }) as any}
          />
        );
      })}
    </View>
  );
}

/* ─── Main Screen ───────────────────────────────────────── */

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const flatListRef = useRef<FlatList>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentPage(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const handleNext = useCallback(() => {
    hapticButtonPress();
    if (currentPage < PAGES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentPage + 1, animated: true });
    } else {
      handleComplete();
    }
  }, [currentPage]);

  const handleComplete = async () => {
    hapticProcessingDone();
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(auth)/login');
  };

  const isLastPage = currentPage === PAGES.length - 1;

  const renderPage = useCallback(
    ({ item }: { item: OnboardingPage }) => {
      const Illustration = ILLUSTRATION_MAP[item.illustration];
      return (
        <View style={[styles.page, { width }]}>
          <View style={styles.illustrationArea}>
            <Illustration />
          </View>
          <View style={styles.textArea}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.subtitle}>{item.subtitle}</Text>
          </View>
        </View>
      );
    },
    [width]
  );

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          {!isLastPage ? (
            <AnimatedPressable onPress={handleComplete} style={styles.skipBtn}>
              <Text style={styles.skipText}>Saltar</Text>
            </AnimatedPressable>
          ) : (
            <View />
          )}
        </View>

        <FlatList
          ref={flatListRef}
          data={PAGES}
          renderItem={renderPage}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          decelerationRate="fast"
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        />

        <View style={styles.bottom}>
          <DotIndicator total={PAGES.length} current={currentPage} />

          {isLastPage ? (
            <AnimatedPressable onPress={handleNext} style={styles.ctaBtn} scaleDown={0.96}>
              <Text style={styles.ctaText}>Comenzar con Sythio</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </AnimatedPressable>
          ) : (
            <AnimatedPressable onPress={handleNext} style={styles.nextBtn} scaleDown={0.93}>
              <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
            </AnimatedPressable>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

/* ─── Styles ────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    height: 48,
    alignItems: 'center',
  },
  skipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  skipText: {
    fontSize: 15,
    fontFamily: FONT.medium,
    color: '#94A3B8',
  },
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  illustrationArea: {
    marginBottom: 48,
    alignItems: 'center',
    justifyContent: 'center',
    height: 240,
  },
  textArea: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 34,
    fontFamily: FONT.bold,
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.8,
    lineHeight: 42,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 17,
    fontFamily: FONT.regular,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 26,
    maxWidth: 320,
  },
  bottom: {
    paddingHorizontal: 32,
    paddingBottom: 28,
    gap: 24,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  ctaBtn: {
    width: '100%',
    height: 58,
    borderRadius: 29,
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaText: {
    fontSize: 17,
    fontFamily: FONT.semibold,
    color: '#FFFFFF',
  },
});
