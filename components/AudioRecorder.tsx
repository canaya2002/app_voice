import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
  FadeInUp,
  FadeInDown,
  ZoomIn,
} from 'react-native-reanimated';
import { COLORS, LIMITS } from '@/lib/constants';
import {
  requestAudioPermissions,
  startRecording,
  pauseRecording,
  resumeRecording,
  stopRecording,
  formatDuration,
} from '@/lib/audio';
import { useRecordingStore } from '@/stores/recordingStore';
import {
  hapticRecordStart,
  hapticRecordPause,
  hapticRecordResume,
  hapticRecordStop,
  hapticError,
  hapticButtonPress,
} from '@/lib/haptics';
import AnimatedPressable from './AnimatedPressable';

const NUM_BARS = 45;

interface AudioRecorderProps {
  onRecordingComplete: (uri: string, duration: number) => void;
  onCancel: () => void;
}

/* ── Pulse Ring ─────────────────────────────────────────── */
function PulseRing({ delayMs, size }: { delayMs: number; size: number }) {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    scale.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(0.8, { duration: 0 }),
          withTiming(2.2, { duration: 1600, easing: Easing.out(Easing.cubic) }),
        ),
        -1,
      ),
    );
    opacity.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(0.45, { duration: 0 }),
          withTiming(0, { duration: 1600, easing: Easing.out(Easing.cubic) }),
        ),
        -1,
      ),
    );
  }, [scale, opacity, delayMs]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: COLORS.primaryLight,
        },
        style,
      ]}
    />
  );
}

/* ── Countdown Number ──────────────────────────────────── */
function CountdownNumber({ num }: { num: number }) {
  return (
    <Animated.Text
      key={`cd-${num}`}
      entering={ZoomIn.springify().damping(8).stiffness(120)}
      style={styles.countdownText}
    >
      {num}
    </Animated.Text>
  );
}

/* ── Recording Dot Blink ───────────────────────────────── */
function RecordingDot() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.15, { duration: 600 }),
        withTiming(1, { duration: 600 }),
      ),
      -1,
    );
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.liveDot, style]} />;
}

/* ── Main Component ────────────────────────────────────── */
export default function AudioRecorder({ onRecordingComplete, onCancel }: AudioRecorderProps) {
  const { width: screenWidth } = useWindowDimensions();
  const {
    isRecording, isPaused, duration, metering,
    setRecording, setPaused, setDuration, addMetering, reset,
  } = useRecordingStore();

  const [phase, setPhase] = useState<'countdown' | 'recording'>('countdown');
  const [countdownNum, setCountdownNum] = useState(3);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationRef = useRef(duration);
  durationRef.current = duration;

  /* ── Countdown timer ──────────────────────────────────── */
  useEffect(() => {
    if (phase !== 'countdown') return;
    const timer = setTimeout(() => {
      if (countdownNum > 1) {
        hapticButtonPress();
        setCountdownNum((n) => n - 1);
      } else {
        hapticButtonPress();
        transitionToRecording();
      }
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdownNum, phase]);

  /* ── Transition to recording ──────────────────────────── */
  const transitionToRecording = async () => {
    const hasPermission = await requestAudioPermissions();
    if (!hasPermission) {
      onCancel();
      return;
    }
    try {
      hapticRecordStart();
      const recording = await startRecording(
        (level) => addMetering(level),
        (seconds) => setDuration(seconds),
      );
      recordingRef.current = recording;
      setRecording(true);
      setPhase('recording');
    } catch {
      Alert.alert('Error', 'No se pudo iniciar la grabación.');
      onCancel();
    }
  };

  /* ── Stop handler ─────────────────────────────────────── */
  const handleStop = useCallback(async () => {
    hapticRecordStop();
    const uri = await stopRecording();
    const finalDuration = durationRef.current;
    recordingRef.current = null;
    reset();
    if (uri) onRecordingComplete(uri, finalDuration);
  }, [onRecordingComplete, reset]);

  /* ── Cancel handler (back during recording) ───────────── */
  const handleCancel = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
      recordingRef.current = null;
      reset();
    }
    onCancel();
  }, [isRecording, reset, onCancel]);

  /* ── Duration limit ───────────────────────────────────── */
  const WARNING_THRESHOLD = LIMITS.MAX_AUDIO_DURATION * 0.8;
  const warnedRef = useRef(false);
  const isNearLimit = isRecording && duration >= WARNING_THRESHOLD;

  useEffect(() => {
    if (duration >= LIMITS.MAX_AUDIO_DURATION && isRecording) {
      handleStop();
      Alert.alert('Límite alcanzado', 'La grabación máxima es de 10 minutos.');
    } else if (duration >= WARNING_THRESHOLD && isRecording && !warnedRef.current) {
      warnedRef.current = true;
      hapticError();
    }
  }, [duration, isRecording, handleStop, WARNING_THRESHOLD]);

  /* ── Pause/Resume ─────────────────────────────────────── */
  const handlePause = async () => {
    if (isPaused) {
      hapticRecordResume();
      await resumeRecording();
      setPaused(false);
    } else {
      hapticRecordPause();
      await pauseRecording();
      setPaused(true);
    }
  };

  /* ── Waveform bars ────────────────────────────────────── */
  const bars = useMemo(() => {
    const slice = metering.slice(-NUM_BARS);
    const padded: number[] = [];
    for (let i = 0; i < NUM_BARS; i++) {
      const offset = NUM_BARS - slice.length;
      padded.push(i < offset ? 0 : slice[i - offset]);
    }
    return padded;
  }, [metering]);

  /* ═══════════════════════════════════════════════════════
     COUNTDOWN PHASE
     ═══════════════════════════════════════════════════════ */
  if (phase === 'countdown') {
    return (
      <View style={styles.container}>
        {/* Close button */}
        <Animated.View entering={FadeIn.delay(200)} style={styles.topBar}>
          <AnimatedPressable onPress={onCancel} style={styles.closeBtn}>
            <Ionicons name="close" size={26} color={COLORS.textSecondary} />
          </AnimatedPressable>
        </Animated.View>

        {/* Centered mic + countdown */}
        <View style={styles.countdownCenter}>
          {/* Mic with rings wrapper */}
          <View style={styles.micRingWrapper}>
            <PulseRing delayMs={0} size={100} />
            <PulseRing delayMs={500} size={100} />
            <PulseRing delayMs={1000} size={100} />
            <Animated.View entering={ZoomIn.springify().damping(10)} style={styles.countdownMic}>
              <Ionicons name="mic" size={48} color="#FFFFFF" />
            </Animated.View>
          </View>

          {/* Number — below mic with safe space */}
          <View style={styles.countdownNumWrap}>
            <CountdownNumber num={countdownNum} />
          </View>
        </View>

        {/* Preparing text */}
        <Animated.Text entering={FadeInUp.delay(400)} style={styles.preparingText}>
          Preparando grabación...
        </Animated.Text>
      </View>
    );
  }

  /* ═══════════════════════════════════════════════════════
     RECORDING PHASE
     ═══════════════════════════════════════════════════════ */
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <AnimatedPressable onPress={handleCancel} style={styles.closeBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textSecondary} />
        </AnimatedPressable>
      </View>

      {/* Mic + Status */}
      <Animated.View entering={FadeInDown.springify().damping(14)} style={styles.recordingHeader}>
        <View style={styles.recordingMic}>
          <Ionicons name="mic" size={28} color="#FFFFFF" />
        </View>
        <View style={styles.statusRow}>
          {isPaused ? (
            <Text style={styles.statusPaused}>Pausado</Text>
          ) : (
            <View style={styles.liveRow}>
              <RecordingDot />
              <Text style={styles.liveText}>Grabando</Text>
            </View>
          )}
        </View>
      </Animated.View>

      {/* Timer */}
      <Animated.Text
        entering={FadeIn.delay(200)}
        style={[styles.timer, isNearLimit && styles.timerWarning]}
      >
        {formatDuration(duration)}
      </Animated.Text>

      {/* Waveform */}
      <Animated.View
        entering={FadeInUp.delay(300).springify()}
        style={[styles.waveformWrap, { width: screenWidth - 48 }]}
      >
        {bars.map((level, i) => {
          const h = Math.max(4, level * 70);
          const alpha = 0.25 + level * 0.75;
          return (
            <View key={i} style={styles.barCol}>
              <View
                style={[
                  styles.bar,
                  {
                    height: h,
                    backgroundColor: isPaused
                      ? `rgba(200,200,210,${alpha * 0.5})`
                      : `rgba(143,211,255,${alpha})`,
                  },
                ]}
              />
              {/* Mirror reflection */}
              <View
                style={[
                  styles.bar,
                  {
                    height: h * 0.25,
                    backgroundColor: `rgba(143,211,255,${alpha * 0.12})`,
                    marginTop: 2,
                  },
                ]}
              />
            </View>
          );
        })}
      </Animated.View>

      {/* Voice detection hint */}
      <Animated.View entering={FadeIn.delay(800)} style={styles.voiceHint}>
        <Ionicons name="people-outline" size={16} color={COLORS.primaryLight} />
        <Text style={styles.voiceHintText}>Detectando voces...</Text>
      </Animated.View>

      {/* Spacer */}
      <View style={{ flex: 1 }} />

      {/* Controls */}
      <Animated.View entering={FadeInUp.delay(400).springify()} style={styles.controlsRow}>
        <AnimatedPressable onPress={handlePause} style={styles.pauseBtn} accessibilityLabel={isPaused ? 'Reanudar' : 'Pausar'}>
          <Ionicons name={isPaused ? 'play' : 'pause'} size={26} color={COLORS.textPrimary} />
        </AnimatedPressable>

        <AnimatedPressable onPress={handleStop} scaleDown={0.93} style={styles.stopOuter} accessibilityLabel="Detener grabación">
          <View style={styles.stopButton}>
            <View style={styles.stopIcon} />
          </View>
        </AnimatedPressable>
      </Animated.View>

      {/* Limit hint */}
      <Animated.Text
        entering={FadeIn.delay(600)}
        style={[styles.limitHint, isNearLimit && styles.limitWarning]}
      >
        {isNearLimit
          ? `${formatDuration(LIMITS.MAX_AUDIO_DURATION - duration)} restante`
          : `Máx. ${Math.floor(LIMITS.MAX_AUDIO_DURATION / 60)} min`}
      </Animated.Text>
    </Animated.View>
  );
}

/* ── Styles ─────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  /* ── Top bar ── */
  topBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── Countdown ── */
  countdownCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  micRingWrapper: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownMic: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  countdownNumWrap: {
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    fontSize: 72,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -2,
  },
  preparingText: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingBottom: 60,
  },

  /* ── Recording header ── */
  recordingHeader: {
    alignItems: 'center',
    paddingTop: 12,
    gap: 12,
  },
  recordingMic: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  statusRow: {
    alignItems: 'center',
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.recording,
  },
  liveText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  statusPaused: {
    fontSize: 15,
    color: COLORS.warning,
    fontWeight: '600',
  },

  /* ── Timer ── */
  timer: {
    fontSize: 48,
    fontWeight: '200',
    color: COLORS.textPrimary,
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  timerWarning: {
    color: COLORS.warning,
  },

  /* ── Waveform ── */
  waveformWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 90,
    gap: 2,
    alignSelf: 'center',
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
    maxWidth: 5,
  },
  bar: {
    width: 3,
    borderRadius: 1.5,
  },

  /* ── Voice hint ── */
  voiceHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  voiceHintText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500',
  },

  /* ── Controls ── */
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
    paddingBottom: 16,
  },
  pauseBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  stopButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.recording,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.recording,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  stopIcon: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },

  /* ── Limit ── */
  limitHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingBottom: 24,
    marginTop: 8,
  },
  limitWarning: {
    color: COLORS.warning,
    fontWeight: '600',
  },
});
