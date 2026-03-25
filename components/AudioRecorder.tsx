import { useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  FadeIn,
  FadeInUp,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, LIMITS } from '@/lib/constants';
import { SPRING } from '@/lib/animations';
import {
  requestAudioPermissions,
  startRecording,
  pauseRecording,
  resumeRecording,
  stopRecording,
  formatDuration,
} from '@/lib/audio';
import { useRecordingStore } from '@/stores/recordingStore';
import { lightTap, selectionTap, mediumTap, errorTap } from '@/lib/haptics';
import AnimatedPressable from '@/components/AnimatedPressable';

const NUM_BARS = 40;

interface AudioRecorderProps {
  onRecordingComplete: (uri: string, duration: number) => void;
}

function getBarOpacity(level: number, isPaused: boolean): number {
  if (isPaused) return 0.2;
  return 0.25 + level * 0.75;
}

export default function AudioRecorder({ onRecordingComplete }: AudioRecorderProps) {
  const { width: screenWidth } = useWindowDimensions();
  const {
    isRecording, isPaused, duration, metering,
    setRecording, setPaused, setDuration, addMetering, reset,
  } = useRecordingStore();

  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationRef = useRef(duration);
  durationRef.current = duration;

  // Reanimated values for recording ring pulse
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.3);
  const dotOpacity = useSharedValue(1);

  useEffect(() => {
    if (isRecording && !isPaused) {
      ringScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 1500, easing: Easing.inOut(Easing.sin) })
        ), -1, true
      );
      ringOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 1500 }),
          withTiming(0.3, { duration: 1500 })
        ), -1, true
      );
      dotOpacity.value = withRepeat(
        withSequence(
          withTiming(0.2, { duration: 600 }),
          withTiming(1, { duration: 600 })
        ), -1, true
      );
    } else {
      ringScale.value = withTiming(1, { duration: 300 });
      ringOpacity.value = withTiming(0, { duration: 300 });
      dotOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording, isPaused, ringScale, ringOpacity, dotOpacity]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
  }));

  // Handlers
  const handleStop = useCallback(async () => {
    mediumTap();
    const uri = await stopRecording();
    const finalDuration = durationRef.current;
    recordingRef.current = null;
    reset();
    if (uri) onRecordingComplete(uri, finalDuration);
  }, [onRecordingComplete, reset]);

  const WARNING_THRESHOLD = LIMITS.MAX_AUDIO_DURATION * 0.8; // 8 min
  const warnedRef = useRef(false);
  const isNearLimit = isRecording && duration >= WARNING_THRESHOLD;

  useEffect(() => {
    if (duration >= LIMITS.MAX_AUDIO_DURATION && isRecording) {
      handleStop();
      Alert.alert('Límite alcanzado', 'La grabación máxima es de 10 minutos.');
    } else if (duration >= WARNING_THRESHOLD && isRecording && !warnedRef.current) {
      warnedRef.current = true;
      errorTap();
    }
  }, [duration, isRecording, handleStop, WARNING_THRESHOLD]);

  const handleStart = async () => {
    const hasPermission = await requestAudioPermissions();
    if (!hasPermission) return;
    try {
      lightTap();
      const recording = await startRecording(
        (level) => addMetering(level),
        (seconds) => setDuration(seconds)
      );
      recordingRef.current = recording;
      setRecording(true);
    } catch {
      Alert.alert('Error', 'No se pudo iniciar la grabación.');
    }
  };

  const handlePause = async () => {
    selectionTap();
    if (isPaused) { await resumeRecording(); setPaused(false); }
    else { await pauseRecording(); setPaused(true); }
  };

  const bars = useMemo(() => {
    const slice = metering.slice(-NUM_BARS);
    const padded: number[] = [];
    for (let i = 0; i < NUM_BARS; i++) {
      const offset = NUM_BARS - slice.length;
      padded.push(i < offset ? 0 : slice[i - offset]);
    }
    return padded;
  }, [metering]);

  // ── Idle state ──
  if (!isRecording) {
    return (
      <View style={styles.idleContainer}>
        {/* Pulsing ring */}
        <Animated.View style={[styles.idleRing, ringStyle]} />
        {/* Shadow layer */}
        <View style={styles.idleShadow} />
        {/* Button */}
        <AnimatedPressable onPress={handleStart} scaleDown={0.92} style={styles.idleButton} accessibilityLabel="Grabar nota de voz">
          <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.idleGradient}>
            <Ionicons name="mic" size={36} color="#FFFFFF" />
          </LinearGradient>
        </AnimatedPressable>
        <Text style={styles.idleHint}>Toca para grabar</Text>
      </View>
    );
  }

  // ── Recording (immersive) ──
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.immersive}>
      {/* Waveform */}
      <Animated.View entering={FadeInUp.delay(200).springify()} style={[styles.waveformWrap, { width: screenWidth - 48 }]}>
        {bars.map((level, i) => {
          const h = Math.max(6, level * 80);
          return (
            <View key={i} style={styles.barCol}>
              <View
                style={[
                  styles.bar,
                  {
                    height: h,
                    opacity: getBarOpacity(level, isPaused),
                    backgroundColor: isPaused ? 'rgba(255,255,255,0.2)' : `rgba(162,155,254,${0.3 + level * 0.6})`,
                  },
                ]}
              />
              {/* Mirror */}
              <View
                style={[
                  styles.bar,
                  {
                    height: h * 0.3,
                    opacity: 0.1,
                    backgroundColor: 'rgba(162,155,254,0.4)',
                    marginTop: 2,
                  },
                ]}
              />
            </View>
          );
        })}
      </Animated.View>

      {/* Timer */}
      <Text style={[styles.timer, isNearLimit && styles.timerWarning]}>{formatDuration(duration)}</Text>

      {/* Status */}
      {isPaused ? (
        <Text style={styles.statusPaused}>Pausado</Text>
      ) : (
        <View style={styles.liveRow}>
          <Animated.View style={[styles.liveDot, dotStyle]} />
          <Text style={styles.liveText}>Grabando</Text>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controlsRow}>
        <AnimatedPressable onPress={handlePause} style={styles.pauseBtn} accessibilityLabel={isPaused ? 'Reanudar' : 'Pausar'}>
          <Ionicons name={isPaused ? 'play' : 'pause'} size={24} color="#FFFFFF" />
        </AnimatedPressable>

        <AnimatedPressable onPress={handleStop} scaleDown={0.93} style={styles.stopOuter} accessibilityLabel="Detener grabación">
          <LinearGradient colors={[COLORS.recording, '#DC2626']} style={styles.stopGradient}>
            <View style={styles.stopIcon} />
          </LinearGradient>
        </AnimatedPressable>
      </View>

      <Text style={[styles.limitHint, isNearLimit && styles.limitWarning]}>
        {isNearLimit
          ? `${formatDuration(LIMITS.MAX_AUDIO_DURATION - duration)} restante`
          : `Máx. ${Math.floor(LIMITS.MAX_AUDIO_DURATION / 60)} min`}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // ── Idle ──
  idleContainer: { alignItems: 'center', paddingVertical: 32 },
  idleRing: {
    position: 'absolute', top: 32 - 14, width: 110, height: 110, borderRadius: 55,
    borderWidth: 2, borderColor: COLORS.primaryLight,
  },
  idleShadow: {
    position: 'absolute', top: 32 - 4, width: 90, height: 90, borderRadius: 45,
    backgroundColor: COLORS.primary, opacity: 0.12,
  },
  idleButton: { width: 82, height: 82, borderRadius: 41, overflow: 'hidden' },
  idleGradient: {
    width: 82, height: 82, borderRadius: 41,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  idleHint: { marginTop: 14, fontSize: 14, color: COLORS.textMuted },

  // ── Immersive ──
  immersive: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(13,13,26,0.96)',
    borderRadius: 28, minHeight: 420, paddingVertical: 40, paddingHorizontal: 24,
  },

  // ── Waveform ──
  waveformWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 100, gap: 2, marginBottom: 32 },
  barCol: { alignItems: 'center', flex: 1, maxWidth: 6 },
  bar: { width: 3.5, borderRadius: 2 },

  // ── Timer ──
  timer: {
    fontSize: 56, fontWeight: '200', color: '#FFFFFF',
    letterSpacing: 4, fontVariant: ['tabular-nums'], marginBottom: 8,
  },

  // ── Status ──
  statusPaused: { fontSize: 15, color: COLORS.warning, fontWeight: '600', marginBottom: 36 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 36 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.recording },
  liveText: { fontSize: 14, color: 'rgba(255,255,255,0.5)' },

  // ── Controls ──
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 36, marginBottom: 24 },
  pauseBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  stopOuter: { width: 76, height: 76, borderRadius: 38, overflow: 'hidden' },
  stopGradient: {
    width: 76, height: 76, borderRadius: 38,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.recording, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
  },
  stopIcon: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#FFFFFF' },

  limitHint: { fontSize: 12, color: 'rgba(255,255,255,0.25)' },
  timerWarning: { color: COLORS.warning },
  limitWarning: { color: COLORS.warning, fontWeight: '600' },
});
