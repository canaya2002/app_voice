import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/lib/constants';
import { formatDuration } from '@/lib/audio';
import { hapticSelection } from '@/lib/haptics';
import AnimatedPressable from '@/components/AnimatedPressable';

import type { Bookmark } from '@/types';

interface AudioPlayerProps {
  uri: string;
  duration: number;
  bookmarks?: Bookmark[];
  onTimeUpdate?: (positionSec: number) => void;
  onSeekToTime?: React.MutableRefObject<((timeSec: number) => void) | null>;
  onAddBookmark?: (timeSec: number) => void;
}

const SPEEDS = [1, 1.5, 2] as const;

function generateWaveformBars(seed: string, count: number): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    hash = (hash * 16807 + 12345) | 0;
    const val = ((hash & 0x7fffffff) % 100) / 100;
    bars.push(0.15 + val * 0.85);
  }
  return bars;
}

// Each bar only re-renders when its filled state flips — avoids 40 re-renders/sec on progress.
const WaveformBar = React.memo(function WaveformBar({ height, filled }: { height: number; filled: boolean }) {
  return (
    <View
      style={[
        styles.waveformBar,
        {
          height: Math.max(4, height * 32),
          backgroundColor: filled ? COLORS.primary : COLORS.border,
        },
      ]}
    />
  );
});

export default function AudioPlayer({ uri, duration, bookmarks = [], onTimeUpdate, onSeekToTime, onAddBookmark }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const [speedIndex, setSpeedIndex] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  const playAnim = useRef(new Animated.Value(1)).current;
  const waveformBars = useMemo(() => generateWaveformBars(uri, 40), [uri]);

  // Expose seekTo function to parent via ref — auto-loads audio if needed
  const seekTo = useCallback(async (timeSec: number) => {
    try {
      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          await soundRef.current.setPositionAsync(timeSec * 1000);
          setPosition(timeSec);
          if (!status.isPlaying) {
            await soundRef.current.playAsync();
            setIsPlaying(true);
          }
          return;
        }
      }
      // Audio not loaded yet — load it and start at the requested position
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, positionMillis: timeSec * 1000, rate: SPEEDS[speedIndex] },
        (status) => {
          if (status.isLoaded) {
            const posSec = Math.floor((status.positionMillis ?? 0) / 1000);
            setPosition(posSec);
            onTimeUpdate?.(posSec);
            if (status.durationMillis) {
              setTotalDuration(Math.floor(status.durationMillis / 1000));
            }
            if (status.didJustFinish) {
              setIsPlaying(false);
              setPosition(0);
              onTimeUpdate?.(0);
            }
          }
        },
      );
      soundRef.current = sound;
      setIsPlaying(true);
      setPosition(timeSec);
    } catch {
      // Audio seek/load error — silently handled
    }
  }, [uri, speedIndex, onTimeUpdate]);

  useEffect(() => {
    if (onSeekToTime) onSeekToTime.current = seekTo;
  }, [seekTo, onSeekToTime]);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  useEffect(() => {
    if (isPlaying) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(playAnim, {
            toValue: 1.08,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(playAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      playAnim.setValue(1);
    }
  }, [isPlaying, playAnim]);

  const loadAndPlay = async () => {
    try {
      hapticSelection();
      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          if (status.isPlaying) {
            await soundRef.current.pauseAsync();
            setIsPlaying(false);
          } else {
            await soundRef.current.playAsync();
            setIsPlaying(true);
          }
          return;
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, rate: SPEEDS[speedIndex] },
        (status) => {
          if (status.isLoaded) {
            const posSec = Math.floor((status.positionMillis ?? 0) / 1000);
            setPosition(posSec);
            onTimeUpdate?.(posSec);
            if (status.durationMillis) {
              setTotalDuration(Math.floor(status.durationMillis / 1000));
            }
            if (status.didJustFinish) {
              setIsPlaying(false);
              setPosition(0);
              onTimeUpdate?.(0);
            }
          }
        }
      );

      soundRef.current = sound;
      setIsPlaying(true);
    } catch (err) {
      // Audio playback error — silently handled
    }
  };

  const toggleSpeed = useCallback(async () => {
    hapticSelection();
    const nextIndex = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(nextIndex);
    if (soundRef.current) {
      const status = await soundRef.current.getStatusAsync();
      if (status.isLoaded) {
        await soundRef.current.setRateAsync(SPEEDS[nextIndex], true);
      }
    }
  }, [speedIndex]);

  const progress = totalDuration > 0 ? position / totalDuration : 0;

  return (
    <View style={styles.container}>
      <View style={styles.waveformRow}>
        {waveformBars.map((height, i) => (
          <WaveformBar
            key={i}
            height={height}
            filled={i / waveformBars.length <= progress}
          />
        ))}
      </View>

      {/* Bookmark markers on waveform */}
      {bookmarks.length > 0 && totalDuration > 0 && (
        <View style={styles.bookmarkTrack}>
          {bookmarks.map((bm, i) => {
            const pct = Math.min(bm.time / totalDuration, 1) * 100;
            return (
              <AnimatedPressable
                key={`${bm.time}-${i}`}
                onPress={() => seekTo(bm.time)}
                style={[styles.bookmarkDot, { left: `${pct}%` }]}
                accessibilityLabel={`Marcador: ${bm.label}`}
              >
                <Ionicons name="bookmark" size={10} color={COLORS.accentGold} />
              </AnimatedPressable>
            );
          })}
        </View>
      )}

      <View style={styles.controls}>
        <Animated.View style={{ transform: [{ scale: playAnim }] }}>
          <AnimatedPressable
            onPress={loadAndPlay}
            scaleDown={0.92}
            style={styles.playButton}
            accessibilityLabel={isPlaying ? 'Pausar audio' : 'Reproducir audio'}
          >
            <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.playGradient}>
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={24}
                color="#FFFFFF"
              />
            </LinearGradient>
          </AnimatedPressable>
        </Animated.View>

        <View style={styles.timeInfo}>
          <Text style={styles.time}>{formatDuration(position)}</Text>
          <Text style={styles.timeSeparator}>/</Text>
          <Text style={styles.time}>{formatDuration(totalDuration)}</Text>
        </View>

        {onAddBookmark && (
          <AnimatedPressable
            onPress={() => { hapticSelection(); onAddBookmark(position); }}
            style={styles.bookmarkButton}
            accessibilityLabel="Agregar marcador"
          >
            <Ionicons name="bookmark-outline" size={16} color={COLORS.accentGold} />
          </AnimatedPressable>
        )}

        <AnimatedPressable
          onPress={toggleSpeed}
          style={styles.speedButton}
          accessibilityLabel={`Velocidad ${SPEEDS[speedIndex]}x`}
        >
          <Text style={styles.speedText}>{SPEEDS[speedIndex]}x</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 18,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 5,
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    gap: 2,
  },
  waveformBar: {
    width: 3,
    borderRadius: 2,
    minHeight: 4,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  playButton: {
    width: 56, height: 56, borderRadius: 28, overflow: 'hidden',
  },
  playGradient: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  timeInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  time: {
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  timeSeparator: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  speedButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  speedText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  bookmarkTrack: {
    position: 'relative',
    height: 14,
    marginTop: -8,
    marginBottom: -4,
  },
  bookmarkDot: {
    position: 'absolute',
    top: 0,
    marginLeft: -5,
  },
  bookmarkButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.accentGold + '15',
  },
});
