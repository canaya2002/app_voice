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
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS, LIMITS, getTemplateConfig } from '@/lib/constants';
import { typography, shadows } from '@/lib/styles';
import AudioRecorder from '@/components/AudioRecorder';
import LoadingProcessor from '@/components/LoadingProcessor';
import TemplateSelector from '@/components/TemplateSelector';
import QuickActions from '@/components/QuickActions';
import NoteCard from '@/components/NoteCard';
import FloatingOrb from '@/components/FloatingOrb';
import AnimatedPressable from '@/components/AnimatedPressable';
import { useAuthStore } from '@/stores/authStore';
import { useNotesStore } from '@/stores/notesStore';
import { useRecordingStore } from '@/stores/recordingStore';
import { uploadAudioAndProcess } from '@/lib/transcription';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/Toast';
import { lightTap } from '@/lib/haptics';
import type { OutputMode, NoteTemplate } from '@/types';

const MOTIVATIONAL = [
  '¿Qué quieres convertir en acción hoy?',
  'Tu voz tiene mucho que decir.',
  'Graba. Organiza. Actúa.',
  'Habla una vez. Úsalo de varias formas.',
];

export default function HomeScreen() {
  const { user, fetchProfile } = useAuthStore();
  const { notes, createNote, subscribeToNote } = useNotesStore();
  const { selectedTemplate, selectedMode, setSelectedTemplate, setSelectedMode } = useRecordingStore();
  const [processingNoteId, setProcessingNoteId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [processingError, setProcessingError] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);

  const motivational = MOTIVATIONAL[Math.floor(Date.now() / 86400000) % MOTIVATIONAL.length];
  const recentNotes = notes.slice(0, 3);
  const totalDuration = notes.reduce((a, n) => a + (n.audio_duration || 0), 0);
  const totalTasks = notes.reduce((a, n) => a + (n.tasks?.length || 0), 0);

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
      Alert.alert('Límite alcanzado', `Has usado tus ${LIMITS.FREE_DAILY_NOTES} notas gratuitas de hoy.`, [{ text: 'Entendido' }]);
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
    setProcessingStatus('uploading');
    setProcessingError('');

    const unsubscribe = subscribeToNote(noteId);
    const channel = supabase.channel(`status-${noteId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notes', filter: `id=eq.${noteId}` },
        (payload) => {
          const newStatus = (payload.new as { status: string }).status;
          setProcessingStatus(newStatus);
          if (newStatus === 'error') {
            setProcessingError((payload.new as { error_message?: string }).error_message ?? 'Error desconocido');
            supabase.removeChannel(channel);
            unsubscribe();
          }
        }
      ).subscribe();

    try {
      await uploadAudioAndProcess(noteId, audioUri, user.id, selectedTemplate, selectedMode);
    } catch (err) {
      setProcessingStatus('error');
      setProcessingError(err instanceof Error ? err.message : 'Error al procesar');
      supabase.removeChannel(channel);
      unsubscribe();
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
    lightTap();
    const canProceed = await checkDailyLimit();
    if (!canProceed) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      if (file.size && file.size > LIMITS.MAX_FILE_SIZE) { showToast('El archivo excede 25MB', 'error'); return; }
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

  // Processing state
  if (processingNoteId) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingProcessor status={processingStatus} errorMessage={processingError} onRetry={() => setProcessingNoteId(null)} onComplete={handleProcessingComplete} />
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
            {uploading ? <ActivityIndicator size="small" color={COLORS.primary} /> : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color={COLORS.primary} />
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
    <SafeAreaView style={styles.container}>
      <FloatingOrb top={-80} right={-60} size={300} color={COLORS.primaryLight} />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hola 👋</Text>
            <Text style={styles.userName}>{user?.email?.split('@')[0] ?? 'ahí'}</Text>
          </View>
          <AnimatedPressable onPress={() => router.push('/(tabs)/profile')}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.email?.charAt(0).toUpperCase() ?? '?'}</Text>
            </View>
          </AnimatedPressable>
        </Animated.View>

        {/* Record button */}
        <View style={styles.recordSection}>
          {/* Outer animated ring */}
          <Animated.View style={[styles.recordOuterRing, ringAnimStyle]} />
          {/* Middle shadow */}
          <View style={styles.recordMiddleShadow} />
          {/* Main button */}
          <AnimatedPressable
            scaleDown={0.92}
            onPress={() => setShowRecorder(true)}
            style={styles.recordButtonPressable}
          >
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryDark]}
              style={styles.bigRecordButton}
            >
              <Ionicons name="mic" size={36} color="#FFFFFF" />
            </LinearGradient>
          </AnimatedPressable>
          <Animated.Text entering={FadeIn.delay(400)} style={styles.recordHint}>
            Toca para grabar
          </Animated.Text>
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

        <View style={{ height: 30 }} />
      </ScrollView>
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
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  userName: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Record button
  recordSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  recordOuterRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: COLORS.primaryLight,
  },
  recordMiddleShadow: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: COLORS.primary,
    opacity: 0.15,
  },
  recordButtonPressable: {
    zIndex: 1,
  },
  bigRecordButton: {
    width: 82,
    height: 82,
    borderRadius: 41,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.purple,
  },
  recordHint: {
    marginTop: 14,
    fontSize: 14,
    color: COLORS.textMuted,
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
    color: COLORS.primary,
    fontWeight: '600',
  },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 16,
    padding: 18,
    marginHorizontal: 24,
    marginTop: 8,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
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
    fontSize: 13,
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
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    marginTop: 24,
  },
  uploadText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
});
