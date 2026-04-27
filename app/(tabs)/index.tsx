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
  withDelay,
  Easing,
  FadeInDown,
  FadeInUp,
  FadeIn,
  ZoomIn,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS, LIMITS, getTemplateConfig } from '@/lib/constants';
import { typography } from '@/lib/styles';
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
import { watchNoteProcessing } from '@/lib/processing-watcher';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/Toast';
import { hapticButtonPress } from '@/lib/haptics';
import { track } from '@/lib/analytics';
import { canCreateNote, getRemainingNotes } from '@/lib/gates';
import { DailyLimitBanner } from '@/components/StateViews';
import Paywall from '@/components/Paywall';
import AIChatModal from '@/components/AIChatModal';
import type { OutputMode, NoteTemplate } from '@/types';

const MOTIVATIONAL = [
  'Transforma tu voz en resultados.',
  'Un audio, múltiples resultados.',
  'Habla una vez. Úsalo de varias formas.',
  'De voz a claridad, estructura y acción.',
];

export default function HomeScreen() {
  if (__DEV__) console.log('[home] loading');
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
  const [showAIChat, setShowAIChat] = useState(false);
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const [watcherHandle, setWatcherHandle] = useState<{ cancel: () => void } | null>(null);

  useEffect(() => {
    return () => { watcherHandle?.cancel(); };
  }, [watcherHandle]);

  const motivational = MOTIVATIONAL[Math.floor(Date.now() / 86400000) % MOTIVATIONAL.length];
  const recentNotes = notes.slice(0, 3);
  const totalDuration = notes.reduce((a, n) => a + (n.audio_duration || 0), 0);
  const totalTasks = notes.reduce((a, n) => a + (n.tasks?.length || 0), 0);
  const notesWithTasks = notes.filter((n) => n.status === 'done' && n.tasks?.length > 0);

  // User display name
  const rawName = user?.email?.split('@')[0] ?? '';
  const displayName = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : 'Bienvenido';

  // --- Mic button breathing animation ---
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.35);
  const ring2Scale = useSharedValue(1);
  const ring2Opacity = useSharedValue(0.2);

  useEffect(() => {
    ringScale.value = withRepeat(
      withSequence(
        withTiming(1.25, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    ringOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.35, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    ring2Scale.value = withDelay(
      600,
      withRepeat(
        withSequence(
          withTiming(1.4, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    );
    ring2Opacity.value = withDelay(
      600,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.2, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    );
  }, [ringScale, ringOpacity, ring2Scale, ring2Opacity]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring2Scale.value }],
    opacity: ring2Opacity.value,
  }));

  // --- Handlers (same logic, cleaned up) ---

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

    watcherHandle?.cancel();
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
    setShowRecorder(false);
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
    if (user && !canCreateNote(user).allowed) {
      setShowPaywall(true);
      return;
    }
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

  // ═══ Processing state ═══
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
            if (processingNoteId && lastAudioUri) processNote(processingNoteId, lastAudioUri);
            else setProcessingNoteId(null);
          }}
          onComplete={handleProcessingComplete}
        />
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

  // ═══ Recording state (full screen with countdown) ═══
  if (showRecorder) {
    return (
      <SafeAreaView style={styles.container}>
        <AudioRecorder
          onRecordingComplete={handleRecordingComplete}
          onCancel={() => setShowRecorder(false)}
        />
      </SafeAreaView>
    );
  }

  // ═══ Dashboard ═══
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(50).springify().damping(14)} style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hola</Text>
            <Text style={styles.userName}>{displayName}</Text>
            <Animated.Text entering={FadeIn.delay(400)} style={styles.motivational}>{motivational}</Animated.Text>
          </View>
          <View style={styles.headerRight}>
            {/* Upload button */}
            <AnimatedPressable onPress={handleUploadFile} style={styles.uploadBtn} scaleDown={0.9}>
              {uploading ? (
                <ActivityIndicator size="small" color={COLORS.primaryLight} />
              ) : (
                <Ionicons name="cloud-upload-outline" size={20} color={COLORS.textSecondary} />
              )}
            </AnimatedPressable>
            {/* Avatar */}
            <AnimatedPressable onPress={() => router.push('/(tabs)/profile')}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user?.email?.charAt(0).toUpperCase() ?? '?'}</Text>
              </View>
            </AnimatedPressable>
          </View>
        </Animated.View>

        {/* Daily limit banner */}
        {user && !canCreateNote(user).allowed && (
          <DailyLimitBanner onUpgrade={() => setShowPaywall(true)} />
        )}

        {/* Record button section */}
        <View style={styles.recordSection}>
          <Animated.View entering={ZoomIn.delay(150).springify().damping(12)} style={styles.micWrapper}>
            {/* Double breathing rings — centered in wrapper */}
            <Animated.View style={[styles.recordRing, ringStyle]} />
            <Animated.View style={[styles.recordRing2, ring2Style]} />
            {/* Button */}
            <AnimatedPressable
              scaleDown={0.9}
              onPress={() => {
                hapticButtonPress();
                if (user && !canCreateNote(user).allowed) {
                  setShowPaywall(true);
                  return;
                }
                setShowRecorder(true);
              }}
            >
              <View style={styles.bigRecordButton}>
                <Ionicons name="mic" size={40} color="#FFFFFF" />
              </View>
            </AnimatedPressable>
          </Animated.View>
          <Animated.Text entering={FadeIn.delay(500)} style={styles.recordHint}>
            Toca para grabar
          </Animated.Text>
        </View>

        {/* Template selector */}
        <Animated.View entering={FadeInUp.delay(200).springify()} style={styles.sectionWide}>
          <Text style={[typography.label, styles.sectionLabel]}>Tipo de audio</Text>
          <TemplateSelector
            selected={selectedTemplate}
            onSelect={(t) => { setSelectedTemplate(t); setSelectedMode(getTemplateConfig(t).defaultMode); }}
            compact
          />
        </Animated.View>

        {/* Quick actions */}
        <Animated.View entering={FadeInUp.delay(300).springify()} style={styles.section}>
          <Text style={[typography.label, styles.sectionLabel]}>Acciones rápidas</Text>
          <QuickActions onAction={handleQuickAction} />
        </Animated.View>

        {/* Recent notes */}
        {recentNotes.length > 0 && (
          <Animated.View entering={FadeInUp.delay(400).springify()} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recientes</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/history')}>
                <Text style={styles.seeAll}>Ver todo</Text>
              </TouchableOpacity>
            </View>
            {recentNotes.map((note, i) => (
              <NoteCard key={note.id} note={note} index={i} />
            ))}
          </Animated.View>
        )}

        {/* Pending tasks nudge */}
        {notesWithTasks.length > 0 && (
          <Animated.View entering={FadeInUp.delay(500).springify()}>
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
          </Animated.View>
        )}

        {/* Stats bar */}
        <Animated.View entering={FadeInUp.delay(600).springify()} style={styles.statsBar}>
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
        </Animated.View>

        {/* Daily limit */}
        {user?.plan === 'free' && (
          <Animated.Text entering={FadeIn.delay(700)} style={styles.limitText}>
            {dailyRemaining}/{LIMITS.FREE_DAILY_NOTES} notas gratis hoy
          </Animated.Text>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* AI Chat FAB */}
      {notes.length > 0 && (
        <AnimatedPressable
          onPress={() => setShowAIChat(true)}
          style={styles.chatFab}
          scaleDown={0.9}
        >
          <Ionicons name="sparkles" size={22} color="#FFFFFF" />
        </AnimatedPressable>
      )}

      <Paywall visible={showPaywall} onClose={() => setShowPaywall(false)} trigger="daily_limit" />
      <AIChatModal visible={showAIChat} onClose={() => setShowAIChat(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  uploadBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingVertical: 44,
  },
  micWrapper: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: COLORS.primaryLight,
  },
  recordRing2: {
    position: 'absolute',
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 1.5,
    borderColor: COLORS.primaryLight,
  },
  bigRecordButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primaryLight,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 14,
  },
  recordHint: {
    marginTop: 12,
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500',
  },

  // Sections
  sectionWide: {
    marginTop: 24,
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

  // AI Chat FAB
  chatFab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primaryLight,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
});
