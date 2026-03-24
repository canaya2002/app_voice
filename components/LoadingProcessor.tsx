import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  withSpring,
  FadeIn,
  FadeInUp,
  FadeOut,
  ZoomIn,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/lib/constants';
import { successTap, errorTap } from '@/lib/haptics';
import FloatingOrb from '@/components/FloatingOrb';

interface LoadingProcessorProps {
  status: string;
  errorMessage?: string;
  onRetry?: () => void;
  onComplete?: () => void;
}

const PHASES: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; color: string }[] = [
  { key: 'uploading', icon: 'cloud-upload', label: 'Subiendo audio', sub: 'Preparando tu grabación', color: COLORS.info },
  { key: 'transcribing', icon: 'mic', label: 'Escuchando tu voz', sub: 'Transcribiendo audio', color: COLORS.primary },
  { key: 'processing', icon: 'sparkles', label: 'Analizando contenido', sub: 'Encontrando lo importante', color: COLORS.warning },
  { key: 'done', icon: 'checkmark-circle', label: '¡Listo!', sub: 'Tu nota está lista', color: COLORS.success },
];

function DotsAnimation() {
  const o1 = useSharedValue(0.2);
  const o2 = useSharedValue(0.2);
  const o3 = useSharedValue(0.2);

  useEffect(() => {
    o1.value = withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0.2, { duration: 400 })), -1, true);
    o2.value = withDelay(200, withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0.2, { duration: 400 })), -1, true));
    o3.value = withDelay(400, withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0.2, { duration: 400 })), -1, true));
  }, [o1, o2, o3]);

  const s1 = useAnimatedStyle(() => ({ opacity: o1.value }));
  const s2 = useAnimatedStyle(() => ({ opacity: o2.value }));
  const s3 = useAnimatedStyle(() => ({ opacity: o3.value }));

  return (
    <View style={styles.dotsRow}>
      <Animated.View style={[styles.dot, s1]} />
      <Animated.View style={[styles.dot, s2]} />
      <Animated.View style={[styles.dot, s3]} />
    </View>
  );
}

function Sparkle({ delay: d, color }: { delay: number; color: string }) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const s = useSharedValue(0);
  const o = useSharedValue(0);

  const dx = useRef((Math.random() - 0.5) * 80).current;
  const dy = useRef((Math.random() - 0.5) * 80).current;

  useEffect(() => {
    s.value = withDelay(d, withSequence(withSpring(1.5, { damping: 6, stiffness: 200 }), withTiming(0, { duration: 400 })));
    o.value = withDelay(d, withSequence(withTiming(1, { duration: 150 }), withDelay(300, withTiming(0, { duration: 300 }))));
    tx.value = withDelay(d, withTiming(dx, { duration: 600, easing: Easing.out(Easing.cubic) }));
    ty.value = withDelay(d, withTiming(dy, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, [d, dx, dy, s, o, tx, ty]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: s.value }],
    opacity: o.value,
  }));

  return <Animated.View style={[styles.sparkle, { backgroundColor: color }, style]} />;
}

export default function LoadingProcessor({ status, errorMessage, onRetry, onComplete }: LoadingProcessorProps) {
  const currentPhase = PHASES.find((p) => p.key === status) ?? PHASES[0];
  const phaseIndex = PHASES.findIndex((p) => p.key === status);
  const [prevStatus, setPrevStatus] = useState(status);

  // Ripple around icon
  const rippleScale = useSharedValue(1);
  const rippleOpacity = useSharedValue(0.2);

  // Icon rotation
  const iconRotate = useSharedValue(0);

  // Progress bar
  const progress = useSharedValue(0);

  useEffect(() => {
    if (status !== 'done' && status !== 'error') {
      rippleScale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 1200, easing: Easing.out(Easing.cubic) }),
          withTiming(1, { duration: 0 })
        ), -1
      );
      rippleOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 1200 }),
          withTiming(0.2, { duration: 0 })
        ), -1
      );
      iconRotate.value = withRepeat(
        withTiming(360, { duration: 3000, easing: Easing.linear }), -1
      );
    } else {
      iconRotate.value = withTiming(0, { duration: 300 });
    }
  }, [status, rippleScale, rippleOpacity, iconRotate]);

  // Progress per phase
  useEffect(() => {
    if (status !== prevStatus) {
      setPrevStatus(status);
      const targetProgress = status === 'done' ? 1 : (phaseIndex / (PHASES.length - 1));
      progress.value = withTiming(targetProgress, { duration: 600, easing: Easing.out(Easing.cubic) });
    }
  }, [status, prevStatus, phaseIndex, progress]);

  // Done: haptic + auto-nav
  useEffect(() => {
    if (status === 'done') {
      successTap();
      const timer = setTimeout(() => onComplete?.(), 1500);
      return () => clearTimeout(timer);
    }
    if (status === 'error') errorTap();
  }, [status, onComplete]);

  const rippleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rippleScale.value }],
    opacity: rippleOpacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${iconRotate.value}deg` }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View style={styles.container}>
      <FloatingOrb size={250} color={currentPhase.color} top={60} left={-40} delay={0} />

      <Animated.View entering={FadeIn.duration(400)} style={styles.card}>
        {/* Step dots */}
        <View style={styles.stepsRow}>
          {PHASES.map((p, i) => (
            <View key={p.key} style={styles.stepItem}>
              {i > 0 && (
                <View style={[styles.stepLine, { backgroundColor: i <= phaseIndex ? currentPhase.color : COLORS.borderLight }]} />
              )}
              <View style={[styles.stepDot, { backgroundColor: i <= phaseIndex ? currentPhase.color : COLORS.borderLight }]}>
                {i < phaseIndex && <Ionicons name="checkmark" size={8} color="#FFF" />}
              </View>
            </View>
          ))}
        </View>

        {/* Icon with ripple */}
        <View style={styles.iconWrap}>
          <Animated.View style={[styles.rippleRing, { borderColor: currentPhase.color }, rippleStyle]} />
          <View style={[styles.iconCircle, { backgroundColor: currentPhase.color + '18' }]}>
            {status === 'done' ? (
              <Animated.View entering={ZoomIn.springify().damping(8)}>
                <Ionicons name="checkmark-circle" size={56} color={COLORS.success} />
              </Animated.View>
            ) : status === 'error' ? (
              <Ionicons name="alert-circle" size={56} color={COLORS.error} />
            ) : (
              <Animated.View style={iconStyle}>
                <Ionicons name={currentPhase.icon} size={48} color={currentPhase.color} />
              </Animated.View>
            )}
          </View>
          {/* Sparkles on done */}
          {status === 'done' && (
            <>
              <Sparkle delay={100} color={COLORS.primary} />
              <Sparkle delay={200} color={COLORS.warning} />
              <Sparkle delay={300} color={COLORS.info} />
              <Sparkle delay={400} color={COLORS.success} />
              <Sparkle delay={500} color={COLORS.primaryLight} />
              <Sparkle delay={600} color={COLORS.warning} />
            </>
          )}
        </View>

        {/* Text */}
        <Animated.Text entering={FadeInUp.delay(100)} key={`label-${status}`} style={[styles.label, status === 'done' && { color: COLORS.success }, status === 'error' && { color: COLORS.error }]}>
          {status === 'error' ? 'Error' : currentPhase.label}
        </Animated.Text>

        {status !== 'done' && status !== 'error' && (
          <View style={styles.subRow}>
            <Text style={styles.subText}>{currentPhase.sub}</Text>
            <DotsAnimation />
          </View>
        )}

        {status === 'error' && errorMessage ? (
          <Text style={styles.errorText}>{errorMessage}</Text>
        ) : null}

        {/* Progress bar */}
        {status !== 'error' && (
          <View style={styles.progressBg}>
            <Animated.View style={[styles.progressFill, { backgroundColor: currentPhase.color }, progressStyle]} />
          </View>
        )}

        {status === 'error' && onRetry ? (
          <Text style={styles.retryBtn} onPress={onRetry}>Reintentar</Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  card: {
    width: 320, backgroundColor: COLORS.surface, borderRadius: 28, padding: 36, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 8,
  },
  stepsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 32, width: '100%' },
  stepItem: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center' },
  stepLine: { height: 2, flex: 1, borderRadius: 1, marginHorizontal: 2 },
  stepDot: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  rippleRing: { position: 'absolute', width: 96, height: 96, borderRadius: 48, borderWidth: 2 },
  iconCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 6 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 24 },
  subText: { fontSize: 15, color: COLORS.textSecondary },
  dotsRow: { flexDirection: 'row', gap: 3 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.textSecondary },
  progressBg: { width: '100%', height: 6, borderRadius: 3, backgroundColor: COLORS.borderLight, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  errorText: { fontSize: 14, color: COLORS.error, textAlign: 'center', marginTop: 8, marginBottom: 16, paddingHorizontal: 8 },
  retryBtn: {
    fontSize: 16, fontWeight: '600', color: COLORS.primary, marginTop: 16,
    paddingVertical: 12, paddingHorizontal: 28, borderRadius: 14,
    backgroundColor: COLORS.surfaceAlt, overflow: 'hidden', textAlign: 'center',
  },
  sparkle: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
});
