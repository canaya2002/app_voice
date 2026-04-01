import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  Alert,
  Animated as RNAnimated,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS, getModeConfig } from '@/lib/constants';
import { cardEntry } from '@/lib/animations';
import { formatDurationLong } from '@/lib/audio';
import { hapticButtonPress, hapticSwipeActivate, hapticSwipeConfirmDelete } from '@/lib/haptics';
import AnimatedPressable from '@/components/AnimatedPressable';
import type { Note } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NoteCardProps {
  note: Note;
  index: number;
  onDelete?: (id: string) => void;
  onLongPress?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple deterministic hash for a string -- returns 0-1 floats. */
function hashSeed(id: string, index: number): number {
  let hash = 0;
  const str = id + String(index);
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return (((hash < 0 ? -hash : hash) % 1000) / 1000);
}

/** Generate an array of deterministic bar heights (0.15 - 1) for the waveform. */
function generateWaveformBars(id: string, count: number = 12): number[] {
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const raw = hashSeed(id, i);
    bars.push(0.15 + raw * 0.85);
  }
  return bars;
}

/** Relative time in Spanish with richer formatting. */
function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffSecs < 60) return 'Justo ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return 'Ayer';
  }

  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) {
    const weekday = date.toLocaleDateString('es-ES', { weekday: 'short' });
    const day = date.getDate();
    const month = date.toLocaleDateString('es-ES', { month: 'short' });
    const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    return `${cap} ${day} ${month}`;
  }

  const day = date.getDate();
  const month = date.toLocaleDateString('es-ES', { month: 'short' });
  return `${day} ${month}`;
}

/** Status badge config. */
function getStatusBadge(status: string): { color: string; label: string; icon: keyof typeof Ionicons.glyphMap } {
  switch (status) {
    case 'done':
      return { color: '#34C759', label: 'Listo', icon: 'checkmark-circle' };
    case 'error':
      return { color: '#FF3B30', label: 'Error', icon: 'alert-circle' };
    case 'recording':
    case 'uploading':
    case 'transcribing':
    case 'processing':
      return { color: '#FF9500', label: 'Procesando', icon: 'time' };
    default:
      return { color: '#B8BCC4', label: status, icon: 'help-circle' };
  }
}

/** Format seconds to a short "Xm" or "Xh Ym" string for the chip. */
function formatDurationChip(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SWIPE_THRESHOLD = 80;
const DELETE_BUTTON_WIDTH = 90;
const MAX_WAVEFORM_HEIGHT = 20;
const BAR_COUNT = 12;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NoteCard({ note, index, onDelete, onLongPress }: NoteCardProps) {
  // -- Swipe to delete (RN Animated for PanResponder compat) -----------------
  const translateX = useRef(new RNAnimated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        return gestureState.dx < -10 && Math.abs(gestureState.dy) < 30;
      },
      onPanResponderMove: (_evt, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(Math.max(gestureState.dx, -DELETE_BUTTON_WIDTH - 20));
        }
      },
      onPanResponderRelease: (_evt, gestureState) => {
        if (gestureState.dx < -SWIPE_THRESHOLD) {
          RNAnimated.spring(translateX, {
            toValue: -DELETE_BUTTON_WIDTH,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
          hapticSwipeActivate();
        } else {
          RNAnimated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        RNAnimated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  // -- Derived data ----------------------------------------------------------
  const badge = getStatusBadge(note.status);

  const taskCount = note.tasks?.length ?? 0;
  const showTasksChip = taskCount > 0;

  // -- Handlers --------------------------------------------------------------
  const handlePress = () => {
    hapticButtonPress();
    router.push(`/note/${note.id}`);
  };

  const handleDelete = () => {
    Alert.alert(
      'Eliminar nota',
      '¿Estás seguro de que quieres eliminar esta nota? Esta acción no se puede deshacer.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
          onPress: () => {
            RNAnimated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          },
        },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            hapticSwipeConfirmDelete();
            onDelete?.(note.id);
            RNAnimated.timing(translateX, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start();
          },
        },
      ],
    );
  };

  // -- Render ----------------------------------------------------------------
  return (
    <Animated.View entering={cardEntry(index)} style={styles.outerWrapper}>
      {/* Delete button revealed behind the card */}
      <View style={styles.deleteContainer}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          activeOpacity={0.8}
          accessibilityLabel="Eliminar nota"
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.deleteText}>Eliminar</Text>
        </TouchableOpacity>
      </View>

      {/* Swipeable card */}
      <RNAnimated.View
        style={[styles.cardOuter, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <AnimatedPressable onPress={handlePress} onLongPress={onLongPress} accessibilityLabel={`Nota: ${note.title}`}>
          <View style={styles.card}>
            {/* Row 1: title + relative time */}
            <View style={styles.topRow}>
              <Text style={styles.title} numberOfLines={1}>
                {note.title}
              </Text>
              <Text style={styles.relativeTime}>
                {getRelativeTime(note.created_at)}
              </Text>
            </View>

            {/* Row 2: summary preview */}
            {note.summary ? (
              <Text style={styles.summary} numberOfLines={2}>
                {note.summary}
              </Text>
            ) : null}

            {/* Info chips */}
            {note.status === 'done' && (
              <View style={styles.infoChipRow}>
                {note.audio_duration > 0 && (
                  <View style={styles.infoChip}>
                    <Ionicons name="time-outline" size={11} color={COLORS.textMuted} />
                    <Text style={styles.infoChipText}>{formatDurationChip(note.audio_duration)}</Text>
                  </View>
                )}
                {note.is_conversation && note.speakers_detected > 1 && (
                  <View style={styles.infoChip}>
                    <Ionicons name="people-outline" size={11} color={COLORS.textMuted} />
                    <Text style={styles.infoChipText}>{note.speakers_detected}</Text>
                  </View>
                )}
                {note.tasks?.length > 0 && (
                  <View style={styles.infoChip}>
                    <Ionicons name="checkbox-outline" size={11} color={COLORS.textMuted} />
                    <Text style={styles.infoChipText}>{note.tasks.length}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Badges with staggered entry */}
            <View style={styles.badgeRow}>
              {note.primary_mode && (
                <Animated.View entering={FadeIn.delay(index * 100 + 160)} style={styles.badgeMode}>
                  <Ionicons name={getModeConfig(note.primary_mode).icon as keyof typeof Ionicons.glyphMap} size={11} color={COLORS.primaryLight} />
                  <Text style={styles.badgeModeText}>{getModeConfig(note.primary_mode).label}</Text>
                </Animated.View>
              )}
              {note.template && note.template !== 'quick_idea' && (
                <Animated.View entering={FadeIn.delay(index * 100 + 200)} style={styles.badgeTemplate}>
                  <Text style={styles.badgeTemplateText}>{note.template}</Text>
                </Animated.View>
              )}
              {note.is_conversation && note.speakers_detected > 1 && (
                <Animated.View entering={FadeIn.delay(index * 100 + 280)} style={styles.badgeSpeakers}>
                  <Ionicons name="people-outline" size={12} color="#8A8F98" />
                  <Text style={styles.badgeSpeakersText}>{note.speakers_detected} hablantes</Text>
                </Animated.View>
              )}
              {showTasksChip && (
                <Animated.View entering={FadeIn.delay(index * 100 + 360)} style={styles.badgeTasks}>
                  <Ionicons name="checkbox-outline" size={12} color="#8A8F98" />
                  <Text style={styles.badgeTasksText}>
                    {taskCount} {taskCount === 1 ? 'tarea' : 'tareas'}
                  </Text>
                </Animated.View>
              )}
              {/* Status badge */}
              <View style={styles.badgeStatus}>
                <View style={[styles.badgeStatusDot, { backgroundColor: badge.color }]} />
                <Text style={[styles.badgeStatusText, { color: badge.color }]}>
                  {badge.label}
                </Text>
              </View>
            </View>
          </View>
        </AnimatedPressable>
      </RNAnimated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  outerWrapper: {
    marginBottom: 10,
    position: 'relative',
  },

  // -- Delete layer (behind the card) ----------------------------------------
  deleteContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: DELETE_BUTTON_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    overflow: 'hidden',
  },
  deleteButton: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    gap: 4,
  },
  deleteText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  // -- Card ------------------------------------------------------------------
  cardOuter: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  card: {
    position: 'relative',
    padding: 16,
  },

  // -- Top row ---------------------------------------------------------------
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  relativeTime: {
    fontSize: 12,
    color: COLORS.textMuted,
  },

  // -- Summary ---------------------------------------------------------------
  summary: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginTop: 4,
  },

  // -- Info chips -----------------------------------------------------------
  infoChipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: COLORS.surfaceAlt,
  },
  infoChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
  },

  // -- Badge row -------------------------------------------------------------
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  badgeMode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: COLORS.info + '20',
  },
  badgeModeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primaryLight,
  },
  badgeTemplate: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt,
  },
  badgeTemplateText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  badgeSpeakers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt,
  },
  badgeSpeakersText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  badgeTasks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt,
  },
  badgeTasksText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  badgeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt,
    gap: 5,
  },
  badgeStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeStatusText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
