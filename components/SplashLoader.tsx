import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
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
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/lib/constants';
import { FONT } from '@/lib/styles';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TIPS = [
  { icon: 'mic-outline' as const, text: 'Graba una idea y Sythio la organiza por ti' },
  { icon: 'people-outline' as const, text: 'Convierte reuniones en resúmenes ejecutivos' },
  { icon: 'checkbox-outline' as const, text: 'Dicta tareas y obtén una lista clara al instante' },
  { icon: 'grid-outline' as const, text: 'Usa plantillas para estructurar tus notas' },
  { icon: 'download-outline' as const, text: 'Exporta tus notas a Excel con un toque' },
  { icon: 'school-outline' as const, text: 'Graba una clase y recibe material de estudio' },
  { icon: 'map-outline' as const, text: 'Transforma una llamada en un plan de acción' },
  { icon: 'walk-outline' as const, text: 'Captura ideas mientras caminas o manejas' },
  { icon: 'document-text-outline' as const, text: 'Tu voz se convierte en texto limpio y organizado' },
  { icon: 'send-outline' as const, text: 'Crea mensajes listos para enviar desde tu voz' },
];

// Pulsing ring around logo
function PulseRing({ delay: d, size }: { delay: number; size: number }) {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    scale.value = withDelay(
      d,
      withRepeat(
        withSequence(
          withTiming(1.5, { duration: 2400, easing: Easing.out(Easing.cubic) }),
          withTiming(0.8, { duration: 0 })
        ),
        -1
      )
    );
    opacity.value = withDelay(
      d,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 2400, easing: Easing.out(Easing.cubic) }),
          withTiming(0.3, { duration: 0 })
        ),
        -1
      )
    );
  }, [d, scale, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.pulseRing,
        { width: size, height: size, borderRadius: size / 2 },
        animStyle,
      ]}
    />
  );
}

export default function SplashLoader() {
  const [tipIndex, setTipIndex] = useState(0);
  const tipOpacity = useSharedValue(0);
  const tipTranslateY = useSharedValue(12);

  const logoScale = useSharedValue(0);
  const logoGlow = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);

  const dotValues = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];

  const advanceTip = useCallback(() => {
    setTipIndex((prev) => (prev + 1) % TIPS.length);
  }, []);

  // Logo entrance
  useEffect(() => {
    logoScale.value = withDelay(200, withSpring(1, { damping: 12, stiffness: 100, mass: 0.8 }));
    logoGlow.value = withDelay(
      600,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.sin) })
        ),
        -1, true
      )
    );
    subtitleOpacity.value = withDelay(800, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, [logoScale, logoGlow, subtitleOpacity]);

  // Tip cycling
  useEffect(() => {
    const animateIn = () => {
      tipOpacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
      tipTranslateY.value = withSpring(0, { damping: 15, stiffness: 120 });
    };
    const animateOut = () => {
      tipOpacity.value = withTiming(0, { duration: 400, easing: Easing.in(Easing.cubic) });
      tipTranslateY.value = withTiming(-12, { duration: 400 });
    };
    animateIn();
    const interval = setInterval(() => {
      animateOut();
      setTimeout(() => {
        runOnJS(advanceTip)();
        tipTranslateY.value = 12;
        animateIn();
      }, 450);
    }, 3500);
    return () => clearInterval(interval);
  }, [tipOpacity, tipTranslateY, advanceTip]);

  // Wave dots
  useEffect(() => {
    dotValues.forEach((val, i) => {
      val.value = withDelay(
        i * 150,
        withRepeat(
          withSequence(
            withTiming(-6, { duration: 350, easing: Easing.out(Easing.cubic) }),
            withTiming(0, { duration: 350, easing: Easing.in(Easing.cubic) })
          ),
          -1
        )
      );
    });
  }, []);

  const logoAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));

  const glowAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(logoGlow.value, [0, 1], [0.05, 0.2]),
    transform: [{ scale: interpolate(logoGlow.value, [0, 1], [0.9, 1.1]) }],
  }));

  const subtitleAnimStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const tipAnimStyle = useAnimatedStyle(() => ({
    opacity: tipOpacity.value,
    transform: [{ translateY: tipTranslateY.value }],
  }));

  const dotAnimStyles = dotValues.map((val) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => ({
      transform: [{ translateY: val.value }],
    }))
  );

  const currentTip = TIPS[tipIndex];

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Logo section */}
        <Animated.View style={[styles.logoContainer, logoAnimStyle]}>
          {/* Glow */}
          <Animated.View style={[styles.logoGlow, glowAnimStyle]} />

          {/* Pulse rings */}
          <PulseRing delay={0} size={140} />
          <PulseRing delay={800} size={140} />
          <PulseRing delay={1600} size={140} />

          {/* Logo circle */}
          <View style={styles.logoCircle}>
            <View style={styles.logoCircleInner}>
              <Text style={styles.logoLetter}>S</Text>
            </View>
          </View>
        </Animated.View>

        {/* Brand name */}
        <Animated.View style={logoAnimStyle}>
          <Text style={styles.brandName}>Sythio</Text>
        </Animated.View>

        <Animated.View style={subtitleAnimStyle}>
          <Text style={styles.subtitle}>Tu voz, organizada</Text>
        </Animated.View>

        {/* Loading dots */}
        <View style={styles.dotsContainer}>
          {dotValues.map((_, i) => (
            <Animated.View key={i} style={[styles.loadingDot, dotAnimStyles[i]]} />
          ))}
        </View>
      </View>

      {/* Tip section at bottom */}
      <Animated.View style={[styles.tipContainer, tipAnimStyle]}>
        <View style={styles.tipBadge}>
          <Ionicons name="bulb-outline" size={12} color={COLORS.accentGold} />
          <Text style={styles.tipLabel}>TIP</Text>
        </View>
        <View style={styles.tipContent}>
          <Ionicons name={currentTip.icon} size={20} color={COLORS.textMuted} style={styles.tipIcon} />
          <Text style={styles.tipText}>{currentTip.text}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
  },
  logoContainer: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  logoGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.primaryLight,
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: COLORS.primaryLight + '25',
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  logoCircleInner: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0B0B0B',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 44,
  },
  logoLetter: {
    fontSize: 40,
    fontFamily: FONT.bold,
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  brandName: {
    fontSize: 36,
    fontFamily: FONT.bold,
    color: COLORS.textPrimary,
    letterSpacing: -1,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: FONT.regular,
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 32,
  },
  loadingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.textMuted,
  },
  tipContainer: {
    position: 'absolute',
    bottom: 80,
    left: 32,
    right: 32,
    alignItems: 'center',
  },
  tipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accentGold + '12',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  tipLabel: {
    fontSize: 10,
    fontFamily: FONT.semibold,
    color: COLORS.accentGold,
    letterSpacing: 1.2,
  },
  tipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  tipIcon: {
    marginRight: 10,
  },
  tipText: {
    fontSize: 15,
    fontFamily: FONT.medium,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    flex: 1,
  },
});
