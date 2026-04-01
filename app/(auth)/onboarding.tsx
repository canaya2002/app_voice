import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  Platform,
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
  FadeIn,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { FONT } from '@/lib/styles';
import { hapticButtonPress, hapticProcessingDone } from '@/lib/haptics';
import AnimatedPressable from '@/components/AnimatedPressable';

export const ONBOARDING_KEY = 'sythio_onboarding_done';

// ---------------------------------------------------------------------------
// Floating particles background
// ---------------------------------------------------------------------------

function Particle({ x, y, size, delay, color }: { x: number; y: number; size: number; delay: number; color: string }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(0);
  useEffect(() => {
    opacity.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(0.6, { duration: 2000 + Math.random() * 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.08, { duration: 2000 + Math.random() * 2000, easing: Easing.inOut(Easing.sin) }),
      ), -1, true,
    ));
    translateY.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(-12, { duration: 3000 + Math.random() * 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(12, { duration: 3000 + Math.random() * 2000, easing: Easing.inOut(Easing.sin) }),
      ), -1, true,
    ));
  }, [opacity, translateY, delay]);
  const anim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
  return (
    <Animated.View style={[{
      position: 'absolute', left: x, top: y, width: size, height: size,
      borderRadius: size / 2, backgroundColor: color,
    }, anim]} />
  );
}

function ParticleBg({ width, height }: { width: number; height: number }) {
  const particles = useMemo(() => {
    const colors = ['#8FD3FF', '#FFFFFF', '#A78BFA', '#34C759', '#F59E0B'];
    return Array.from({ length: 40 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: 2 + Math.random() * 4,
      delay: Math.random() * 4000,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
  }, [width, height]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => <Particle key={i} {...p} />)}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Page data
// ---------------------------------------------------------------------------

interface OnboardingPage {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  glowColor: string;
  accentGradient: [string, string];
}

const PAGES: OnboardingPage[] = [
  {
    id: 'welcome', title: 'Tu voz\ntiene poder',
    subtitle: 'Sythio transforma lo que dices en informacion clara, organizada y lista para usar.',
    icon: 'sparkles', iconColor: '#F59E0B', glowColor: 'rgba(245, 158, 11, 0.15)',
    accentGradient: ['#F59E0B', '#F97316'],
  },
  {
    id: 'record', title: 'Habla.\nSythio escucha.',
    subtitle: 'Graba reuniones, ideas, clases o cualquier momento importante. Solo toca y habla.',
    icon: 'mic', iconColor: '#EF4444', glowColor: 'rgba(239, 68, 68, 0.15)',
    accentGradient: ['#EF4444', '#DC2626'],
  },
  {
    id: 'magic', title: 'Inteligencia\nque entiende',
    subtitle: 'Resumenes, tareas, reportes, planes de accion. Un audio, multiples resultados.',
    icon: 'bulb', iconColor: '#8B5CF6', glowColor: 'rgba(139, 92, 246, 0.15)',
    accentGradient: ['#8B5CF6', '#7C3AED'],
  },
  {
    id: 'templates', title: 'Plantillas para\ncada momento',
    subtitle: 'Reunion, idea rapida, clase, brainstorm. Cada contexto tiene su formato ideal.',
    icon: 'grid', iconColor: '#0EA5E9', glowColor: 'rgba(14, 165, 233, 0.15)',
    accentGradient: ['#0EA5E9', '#0284C7'],
  },
  {
    id: 'ready', title: 'Todo listo',
    subtitle: 'Empieza a transformar tu voz en claridad y accion.',
    icon: 'checkmark-circle', iconColor: '#22C55E', glowColor: 'rgba(34, 197, 94, 0.15)',
    accentGradient: ['#22C55E', '#16A34A'],
  },
];

// ---------------------------------------------------------------------------
// Illustration component
// ---------------------------------------------------------------------------

function PageIllustration({ page }: { page: OnboardingPage }) {
  const breathe = useSharedValue(0);
  const ring1Scale = useSharedValue(0.85);
  const ring1Op = useSharedValue(0.15);
  const ring2Scale = useSharedValue(0.85);
  const ring2Op = useSharedValue(0.15);

  useEffect(() => {
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
      ), -1, true,
    );
    ring1Scale.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 3000, easing: Easing.out(Easing.cubic) }),
        withTiming(0.85, { duration: 0 }),
      ), -1,
    );
    ring1Op.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 3000, easing: Easing.out(Easing.cubic) }),
        withTiming(0.2, { duration: 0 }),
      ), -1,
    );
    ring2Scale.value = withDelay(800, withRepeat(
      withSequence(
        withTiming(1.5, { duration: 3000, easing: Easing.out(Easing.cubic) }),
        withTiming(0.85, { duration: 0 }),
      ), -1,
    ));
    ring2Op.value = withDelay(800, withRepeat(
      withSequence(
        withTiming(0, { duration: 3000, easing: Easing.out(Easing.cubic) }),
        withTiming(0.2, { duration: 0 }),
      ), -1,
    ));
  }, [breathe, ring1Scale, ring1Op, ring2Scale, ring2Op]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.08, 0.25]),
    transform: [{ scale: interpolate(breathe.value, [0, 1], [0.92, 1.08]) }],
  }));
  const r1 = useAnimatedStyle(() => ({ transform: [{ scale: ring1Scale.value }], opacity: ring1Op.value }));
  const r2 = useAnimatedStyle(() => ({ transform: [{ scale: ring2Scale.value }], opacity: ring2Op.value }));

  return (
    <View style={ill.container}>
      <Animated.View style={[ill.glow, { backgroundColor: page.glowColor }, glowStyle]} />
      <Animated.View style={[ill.ring, { borderColor: page.iconColor + '30' }, r1]} />
      <Animated.View style={[ill.ring, { borderColor: page.iconColor + '20' }, r2]} />
      <LinearGradient
        colors={page.accentGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={ill.iconCircle}
      >
        <Ionicons name={page.icon} size={56} color="#FFFFFF" />
      </LinearGradient>
    </View>
  );
}

const ill = StyleSheet.create({
  container: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 220, height: 220, borderRadius: 110 },
  ring: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 1.5 },
  iconCircle: {
    width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24 },
      android: { elevation: 12 },
    }),
  },
});

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ total, current }: { total: number; current: number }) {
  return (
    <View style={pb.container}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[pb.segment, i <= current && pb.segmentActive]}>
          {i <= current && (
            <LinearGradient colors={['#8FD3FF', '#0EA5E9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={pb.fill} />
          )}
        </View>
      ))}
    </View>
  );
}

const pb = StyleSheet.create({
  container: { flexDirection: 'row', gap: 6, height: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  segmentActive: {},
  fill: { flex: 1, borderRadius: 2 },
});

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const flatListRef = useRef<FlatList>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentPage(viewableItems[0].index);
      }
    },
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
    ({ item }: { item: OnboardingPage }) => (
      <View style={[pageStyles.page, { width }]}>
        <View style={pageStyles.illustrationArea}>
          <PageIllustration page={item} />
        </View>
        {/* Glassmorphic text card */}
        <View style={pageStyles.glassWrap}>
          {Platform.OS === 'ios' && (
            <BlurView tint="dark" intensity={60} style={StyleSheet.absoluteFill} />
          )}
          <View style={[StyleSheet.absoluteFill, pageStyles.glassOverlay]} />
          <View style={pageStyles.glassInner}>
            <Text style={pageStyles.title}>{item.title}</Text>
            <Text style={pageStyles.subtitle}>{item.subtitle}</Text>
          </View>
        </View>
      </View>
    ),
    [width],
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#0B0B0B', '#0F172A', '#1A1A2E']}
        style={StyleSheet.absoluteFill}
      />
      <ParticleBg width={width} height={height} />

      <SafeAreaView style={styles.safe}>
        {/* Top bar: progress + skip */}
        <Animated.View entering={FadeIn.delay(200).duration(500)} style={styles.topBar}>
          <View style={styles.progressWrap}>
            <ProgressBar total={PAGES.length} current={currentPage} />
          </View>
          {!isLastPage && (
            <AnimatedPressable onPress={handleComplete} style={styles.skipBtn}>
              <Text style={styles.skipText}>Saltar</Text>
            </AnimatedPressable>
          )}
        </Animated.View>

        {/* Pages */}
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

        {/* Bottom CTA */}
        <Animated.View entering={FadeInUp.delay(400).duration(500)} style={styles.bottom}>
          {isLastPage ? (
            <AnimatedPressable onPress={handleNext} scaleDown={0.96}>
              <LinearGradient
                colors={['#8FD3FF', '#0EA5E9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaBtn}
              >
                <Text style={styles.ctaText}>Comenzar con Sythio</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </LinearGradient>
            </AnimatedPressable>
          ) : (
            <AnimatedPressable onPress={handleNext} scaleDown={0.93}>
              <LinearGradient
                colors={['rgba(143, 211, 255, 0.2)', 'rgba(143, 211, 255, 0.08)']}
                style={styles.nextBtn}
              >
                <Ionicons name="arrow-forward" size={24} color="#8FD3FF" />
              </LinearGradient>
            </AnimatedPressable>
          )}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Page styles
// ---------------------------------------------------------------------------

const pageStyles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  illustrationArea: { marginBottom: 40, alignItems: 'center', justifyContent: 'center' },
  glassWrap: {
    borderRadius: 24, overflow: 'hidden', width: '100%',
    borderWidth: 1, borderColor: 'rgba(143, 211, 255, 0.15)',
  },
  glassOverlay: { backgroundColor: 'rgba(255, 255, 255, 0.06)' },
  glassInner: { padding: 28, alignItems: 'center' },
  title: {
    fontSize: 34, fontFamily: FONT.bold, color: '#FFFFFF', textAlign: 'center',
    letterSpacing: -0.8, lineHeight: 42, marginBottom: 14,
  },
  subtitle: {
    fontSize: 16, fontFamily: FONT.regular, color: 'rgba(255,255,255,0.65)',
    textAlign: 'center', lineHeight: 24, maxWidth: 300,
  },
});

// ---------------------------------------------------------------------------
// Screen styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12, gap: 16,
  },
  progressWrap: { flex: 1 },
  skipBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  skipText: { fontSize: 14, fontFamily: FONT.medium, color: 'rgba(255,255,255,0.5)' },
  bottom: { paddingHorizontal: 32, paddingBottom: 28, alignItems: 'center' },
  nextBtn: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(143, 211, 255, 0.25)',
  },
  ctaBtn: {
    width: '100%', height: 58, borderRadius: 29,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    ...Platform.select({
      ios: { shadowColor: '#0EA5E9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  ctaText: { fontSize: 17, fontFamily: FONT.semibold, color: '#FFFFFF' },
});
