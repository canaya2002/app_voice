import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS, LIMITS, getTemplateConfig, useThemeColors } from '@/lib/constants';
import { typography, shadows } from '@/lib/styles';
import AudioRecorder from '@/components/AudioRecorder';
import LoadingProcessor from '@/components/LoadingProcessor';
import TemplateSelector from '@/components/TemplateSelector';
import QuickActions from '@/components/QuickActions';
import NoteCard from '@/components/NoteCard';
import AnimatedPressable from '@/components/AnimatedPressable';
import { useAuthStore } from '@/stores/authStore';
import { useNotesStore } from '@/stores/notesStore';
import { useRecordingStore } from '@/stores/recordingStore';
import { uploadAudioAndProcess } from '@/lib/transcription';
import { watchNoteProcessing, type ProcessingCallbacks } from '@/lib/processing-watcher';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/Toast';
import { hapticButtonPress } from '@/lib/haptics';
import { track } from '@/lib/analytics';
import { canCreateNote, getRemainingNotes } from '@/lib/gates';
import { DailyLimitBanner } from '@/components/StateViews';
import Paywall from '@/components/Paywall';
import type { OutputMode, NoteTemplate } from '@/types';

const MOTIVATIONAL = [
  'Transforma tu voz en resultados.',
  'Un audio, múltiples resultados.',
  'Habla una vez. Úsalo de varias formas.',
  'De voz a claridad, estructura y acción.',
];

export default function HomeScreen() {
  const colors = useThemeColors();
  const { user, fetchProfile } = useAuthStore();
  const { notes, createNote, subscribeToNote } = useNotesStore();
  const { selectedTemplate, selectedMode, setSelectedTemplate, setSelectedMode } = useRecordingStore();
  const [processingNoteId, setProcessingNoteId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [processingError, setProcessingError] = useState<string>('');
  const [lastAudioUri, setLastAudioUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const [watcherHandle, setWatcherHandle] = useState<{ cancel: () => void } | null>(null);

  // Cleanup watcher on unmount
  useEffect(() => {
    return () => { watcherHandle?.cancel(); };
  }, [watcherHandle]);

  const motivational = MOTIVATIONAL[Math.floor(Date.now() / 86400000) % MOTIVATIONAL.length];
  const recentNotes = notes.slice(0, 3);
  const totalDuration = notes.reduce((a, n) => a + (n.audio_duration || 0), 0);
  const totalTasks = notes.reduce((a, n) => a + (n.tasks?.length || 0), 0);
  const notesWithTasks = notes.filter((n) => n.status === 'done' && n.tasks?.length > 0);

  // --- Record button ring animation ---
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.4);

  useEffect(() => {
    ringScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    ringOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.4, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [ringScale, ringOpacity]);

  const ringAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  // --- All existing handlers (unchanged) ---

  const checkDailyLimit = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    const today = new Date().toISOString().split('T')[0];
    let dailyCount = user.daily_count;
    if (user.last_reset_date < today) {
      await supabase.from('profiles').update({ daily_count: 0, last_reset_date: today }).eq('id', user.id);
      await fetchProfile();
      dailyCount = 0;
    }
    if (user.plan === 'free' && dailyCount >= LIMITS.FREE_DAILY_NOTES) {
      track('daily_limit_reached', { daily_count: dailyCount });
      Alert.alert(
        'Límite alcanzado',
        `Has usado tus ${LIMITS.FREE_DAILY_NOTES} notas gratuitas de hoy. Con Sythio Premium tendrás notas ilimitadas.`,
        [
          { text: 'Entendido', style: 'cancel' },
          { text: 'Ver Premium', onPress: () => setShowPaywall(true) },
        ],
      );
      return false;
    }
    return true;
  }, [user, fetchProfile]);

  const incrementDailyCount = async () => {
    if (!user) return;
    await supabase.from('profiles').update({ daily_count: user.daily_count + 1 }).eq('id', user.id);
    await fetchProfile();
  };

  const processNote = async (noteId: string, audioUri: string) => {
    if (!user) return;
    setProcessingNoteId(noteId);
    setLastAudioUri(audioUri);
    setProcessingStatus('uploading');
    setProcessingError('');
    setProcessingElapsed(0);
    track('processing_started', { note_id: noteId, template: selectedTemplate, mode: selectedMode });

    // Cancel any previous watcher
    watcherHandle?.cancel();

    // Start the realtime + polling watcher
    const handle = watchNoteProcessing(noteId, {
      onStatusChange: (status, errorMessage) => {
        setProcessingStatus(status);
        if (errorMessage) setProcessingError(errorMessage);
      },
      onComplete: () => {
        setProcessingStatus('done');
        track('processing_completed', { note_id: noteId });
      },
      onError: (errorMessage) => {
        setProcessingStatus('error');
        setProcessingError(errorMessage);
        track('processing_error', { note_id: noteId, error: errorMessage });
      },
      onElapsedUpdate: (seconds) => {
        setProcessingElapsed(seconds);
      },
    });
    setWatcherHandle(handle);

    try {
      await uploadAudioAndProcess(noteId, audioUri, user.id, selectedTemplate, selectedMode);
    } catch (err) {
      handle.cancel();
      setProcessingStatus('error');
      setProcessingError(err instanceof Error ? err.message : 'Error al procesar');
    }
  };

  const handleProcessingComplete = useCallback(() => {
    if (processingNoteId) {
      router.push(`/note/${processingNoteId}`);
      setTimeout(() => { setProcessingNoteId(null); setShowRecorder(false); }, 500);
    }
  }, [processingNoteId]);

  const handleRecordingComplete = async (uri: string, duration: number) => {
    if (!user) return;
    track('audio_record_completed', { duration, template: selectedTemplate, mode: selectedMode });
    const canProceed = await checkDailyLimit();
    if (!canProceed) return;
    try {
      const noteId = await createNote(user.id);
      await useNotesStore.getState().updateNote(noteId, { audio_duration: duration });
      await incrementDailyCount();
      await processNote(noteId, uri);
    } catch {
      Alert.alert('Error', 'No se pudo crear la nota.');
    }
  };

  const handleUploadFile = async () => {
    if (!user) return;
    hapticButtonPress();
    const canProceed = await checkDailyLimit();
    if (!canProceed) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      if (file.size && file.size > LIMITS.MAX_FILE_SIZE) { showToast('El archivo excede 25MB', 'error'); return; }
      showToast('Audio seleccionado', 'success');
      track('audio_uploaded', { file_size: file.size ?? 0 });
      setUploading(true);
      const noteId = await createNote(user.id);
      await incrementDailyCount();
      await processNote(noteId, file.uri);
    } catch { showToast('No se pudo subir el archivo', 'error'); } finally { setUploading(false); }
  };

  const handleQuickAction = (mode: OutputMode, template?: NoteTemplate) => {
    if (template) setSelectedTemplate(template);
    setSelectedMode(mode);
    setShowRecorder(true);
  };

  const dailyRemaining = user ? Math.max(0, LIMITS.FREE_DAILY_NOTES - user.daily_count) : 0;

  const handleCancelProcessing = useCallback(() => {
    watcherHandle?.cancel();
    setWatcherHandle(null);
    setProcessingNoteId(null);
    setProcessingStatus('');
    setProcessingError('');
    setProcessingElapsed(0);
    showToast('Procesamiento cancelado', 'info');
  }, [watcherHandle]);

  // Processing state
  if (processingNoteId) {
    const elapsedMin = Math.floor(processingElapsed / 60);
    const elapsedSec = processingElapsed % 60;
    const elapsedStr = `${elapsedMin}:${elapsedSec.toString().padStart(2, '0')}`;

    return (
      <SafeAreaView style={styles.container}>
        <LoadingProcessor
          status={processingStatus}
          errorMessage={processingError}
          onRetry={() => {
            if (processingNoteId && lastAudioUri) {
              processNote(processingNoteId, lastAudioUri);
            } else {
              setProcessingNoteId(null);
            }
          }}
          onComplete={handleProcessingComplete}
        />
        {/* Elapsed time + hints */}
        {processingStatus !== 'done' && processingStatus !== 'error' && (
          <View style={styles.processingFooter}>
            <Text style={styles.elapsedText}>Procesando... {elapsedStr}</Text>
            {processingElapsed > 60 && (
              <Text style={styles.slowHint}>
                Esto está tardando más de lo normal. Puedes cerrar la app, te notificaremos cuando esté listo.
              </Text>
            )}
            <TouchableOpacity onPress={handleCancelProcessing} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Recording state
  if (showRecorder) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.recorderHeader}>
          <TouchableOpacity onPress={() => setShowRecorder(false)} style={styles.recorderBack}>
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
            <Text style={styles.recorderBackText}>Inicio</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.templateRow}>
          <TemplateSelector selected={selectedTemplate} onSelect={(t) => { setSelectedTemplate(t); setSelectedMode(getTemplateConfig(t).defaultMode); }} compact />
        </View>
        <View style={styles.recorderContent}>
          <AudioRecorder onRecordingComplete={handleRecordingComplete} />
          <TouchableOpacity style={styles.uploadButton} onPress={handleUploadFile} disabled={uploading} activeOpacity={0.7}>
            {uploading ? <ActivityIndicator size="small" color={COLORS.primaryLight} /> : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color={COLORS.primaryLight} />
                <Text style={styles.uploadText}>Subir archivo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Dashboard state
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hola</Text>
            <Text style={styles.userName}>{user?.email?.split('@')[0] ?? 'ahí'}</Text>
            <Text style={styles.motivational}>{motivational}</Text>
          </View>
          <AnimatedPressable onPress={() => router.push('/(tabs)/profile')}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.email?.charAt(0).toUpperCase() ?? '?'}</Text>
            </View>
          </AnimatedPressable>
        </Animated.View>

        {/* Daily limit banner */}
        {user && !canCreateNote(user).allowed && (
          <DailyLimitBanner onUpgrade={() => setShowPaywall(true)} />
        )}

        {/* Record button */}
        <View style={styles.recordSection}>
          {/* Outer animated ring */}
          <Animated.View style={[styles.recordOuterRing, ringAnimStyle]} />
          {/* Main button */}
          <AnimatedPressable
            scaleDown={0.92}
            onPress={() => {
              if (user && !canCreateNote(user).allowed) {
                setShowPaywall(true);
                return;
              }
              setShowRecorder(true);
            }}
            style={styles.recordButtonPressable}
          >
            <View style={styles.bigRecordButton}>
              <Ionicons name="mic" size={36} color="#FFFFFF" />
            </View>
          </AnimatedPressable>
          <Animated.Text entering={FadeIn.delay(400)} style={styles.recordHint}>
            Toca para grabar
          </Animated.Text>
          <AnimatedPressable onPress={handleUploadFile} style={styles.dashboardUpload} scaleDown={0.95}>
            <Ionicons name="cloud-upload-outline" size={16} color={COLORS.primaryLight} />
            <Text style={styles.dashboardUploadText}>o sube un archivo de audio</Text>
          </AnimatedPressable>
        </View>

        {/* Template selector */}
        <View style={styles.sectionWide}>
          <Text style={[typography.label, styles.sectionLabel]}>Tipo de audio</Text>
          <TemplateSelector selected={selectedTemplate} onSelect={(t) => { setSelectedTemplate(t); setSelectedMode(getTemplateConfig(t).defaultMode); }} compact />
        </View>

        {/* Quick actions */}
        <View style={styles.section}>
          <Text style={[typography.label, styles.sectionLabel]}>Acciones rápidas</Text>
          <QuickActions onAction={handleQuickAction} />
        </View>

        {/* Recent notes */}
        {recentNotes.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recientes</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/history')}>
                <Text style={styles.seeAll}>Ver todo</Text>
              </TouchableOpacity>
            </View>
            {recentNotes.map((note, i) => (
              <NoteCard key={note.id} note={note} index={i} />
            ))}
          </View>
        )}

        {/* Pending tasks nudge */}
        {notesWithTasks.length > 0 && (
          <AnimatedPressable
            onPress={() => {
              track('task_revisited', { count: notesWithTasks.length });
              router.push(`/note/${notesWithTasks[0].id}`);
            }}
            style={styles.pendingCard}
          >
            <View style={styles.pendingIcon}>
              <Ionicons name="checkbox-outline" size={18} color={COLORS.primaryLight} />
            </View>
            <View style={styles.pendingText}>
              <Text style={styles.pendingTitle}>
                {totalTasks} {totalTasks === 1 ? 'tarea' : 'tareas'} en {notesWithTasks.length} {notesWithTasks.length === 1 ? 'nota' : 'notas'}
              </Text>
              <Text style={styles.pendingHint}>Toca para revisar</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </AnimatedPressable>
        )}

        {/* Stats bar */}
        <View style={styles.statsBar}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{notes.length}</Text>
            <Text style={styles.statLabel}>notas</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{Math.floor(totalDuration / 60)}</Text>
            <Text style={styles.statLabel}>min grabados</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{totalTasks}</Text>
            <Text style={styles.statLabel}>tareas</Text>
          </View>
        </View>

        {/* Daily limit */}
        {user?.plan === 'free' && (
          <Text style={styles.limitText}>{dailyRemaining}/{LIMITS.FREE_DAILY_NOTES} notas gratis hoy</Text>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <Paywall visible={showPaywall} onClose={() => setShowPaywall(false)} trigger="daily_limit" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },
  greeting: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  userName: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  motivational: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 6,
    fontWeight: '400',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },

  // Record button
  recordSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  recordOuterRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: COLORS.primaryLight,
  },
  recordButtonPressable: {
    zIndex: 1,
  },
  bigRecordButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 6,
  },
  recordHint: {
    marginTop: 14,
    fontSize: 13,
    color: COLORS.textMuted,
  },
  dashboardUpload: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  dashboardUploadText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '400',
  },

  // Sections
  sectionWide: {
    marginTop: 32,
    marginBottom: 20,
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  sectionLabel: {
    paddingHorizontal: 24,
    marginBottom: 12,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  seeAll: {
    fontSize: 14,
    color: COLORS.primaryLight,
    fontWeight: '600',
  },

  // Pending tasks card
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 12,
  },
  pendingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.info + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingText: {
    flex: 1,
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  pendingHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 24,
    marginTop: 8,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
  },

  // Daily limit
  limitText: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 12,
  },

  // Recorder state
  recorderHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  recorderBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  recorderBackText: {
    fontSize: 16,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  templateRow: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  recorderContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primaryLight,
    borderStyle: 'dashed',
    marginTop: 24,
  },
  uploadText: {
    fontSize: 14,
    color: COLORS.primaryLight,
    fontWeight: '500',
  },

  // Processing footer
  processingFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 16,
    alignItems: 'center',
    gap: 8,
  },
  elapsedText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  slowHint: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  cancelText: {
    fontSize: 14,
    color: COLORS.error,
    fontWeight: '500',
  },
});
