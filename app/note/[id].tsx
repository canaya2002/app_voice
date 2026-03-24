import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import RNAnimated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, getModeConfig } from '@/lib/constants';
import AudioPlayer from '@/components/AudioPlayer';
import ModeResultView from '@/components/ModeResultView';
import ModeSelector from '@/components/ModeSelector';
import SpeakerTranscript from '@/components/SpeakerTranscript';
import SpeakerRenameModal from '@/components/SpeakerRenameModal';
import ExportButton from '@/components/ExportButton';
import LoadingProcessor from '@/components/LoadingProcessor';
import AnimatedPressable from '@/components/AnimatedPressable';
import { useNotesStore } from '@/stores/notesStore';
import { getSignedAudioUrl } from '@/lib/transcription';
import { lightTap } from '@/lib/haptics';
import { showToast } from '@/components/Toast';
import type { OutputMode, SpeakerInfo, ModeResult } from '@/types';

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    currentNote, loading, modeResults, converting, convertingMode,
    fetchNote, fetchModeResults, subscribeToNote, convertMode, updateSpeakers,
  } = useNotesStore();

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<OutputMode | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);

  useEffect(() => {
    if (id) {
      fetchNote(id);
      fetchModeResults(id);
      const unsub = subscribeToNote(id);
      return unsub;
    }
  }, [id, fetchNote, fetchModeResults, subscribeToNote]);

  useEffect(() => {
    if (currentNote?.audio_url) getSignedAudioUrl(currentNote.audio_url).then(setSignedUrl);
  }, [currentNote?.audio_url]);

  useEffect(() => {
    if (currentNote && !selectedMode) setSelectedMode(currentNote.primary_mode || 'summary');
  }, [currentNote, selectedMode]);

  const generatedModes = modeResults.map((r) => r.mode as OutputMode);
  if (currentNote?.primary_mode && !generatedModes.includes(currentNote.primary_mode)) {
    generatedModes.push(currentNote.primary_mode);
  }

  const activeResult: ModeResult | undefined = modeResults.find((r) => r.mode === selectedMode);

  const handleSelectMode = useCallback((mode: OutputMode) => setSelectedMode(mode), []);
  const handleGenerateMode = useCallback(async (mode: OutputMode) => {
    if (!id) return;
    setSelectedMode(mode);
    const result = await convertMode(id, mode);
    if (result) showToast(`${getModeConfig(mode).label} generado`, 'success');
  }, [id, convertMode]);

  const handleSaveSpeakers = useCallback(async (updated: SpeakerInfo[]) => {
    if (!id) return;
    await updateSpeakers(id, updated);
    setShowRenameModal(false);
    showToast('Hablantes actualizados', 'success');
  }, [id, updateSpeakers]);

  if (loading && !currentNote) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!currentNote) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.notFound}>Nota no encontrada</Text>
          <AnimatedPressable onPress={() => router.back()}>
            <Text style={styles.backLink}>Volver</Text>
          </AnimatedPressable>
        </View>
      </SafeAreaView>
    );
  }

  const isDone = currentNote.status === 'done';
  const isError = currentNote.status === 'error';
  const isProcessing = !isDone && !isError;

  const displayResult = activeResult?.result ?? (selectedMode === currentNote.primary_mode ? {
    title_suggestion: currentNote.title,
    summary: currentNote.summary,
    key_points: currentNote.key_points,
    tasks: currentNote.tasks.map((t) => ({ text: t, priority: 'medium', responsible: null, deadline_hint: null, source_quote: '', is_explicit: true })),
    clean_text: currentNote.clean_text,
  } : undefined);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header gradient */}
      <RNAnimated.View entering={FadeIn.duration(400)}>
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <AnimatedPressable onPress={() => { lightTap(); router.back(); }} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </AnimatedPressable>
          <View style={styles.headerCenter}>
            <RNAnimated.Text entering={FadeInDown.delay(200)} style={styles.title} numberOfLines={2}>
              {currentNote.title}
            </RNAnimated.Text>
            <RNAnimated.View entering={FadeInUp.delay(300)} style={styles.badgeRow}>
              {currentNote.template && (
                <View style={styles.badge}><Text style={styles.badgeText}>{currentNote.template}</Text></View>
              )}
              {currentNote.is_conversation && currentNote.speakers_detected > 1 && (
                <View style={styles.badge}>
                  <Ionicons name="people" size={10} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.badgeText}>{currentNote.speakers_detected} hablantes</Text>
                </View>
              )}
              {currentNote.audio_duration > 0 && (
                <View style={styles.badge}>
                  <Ionicons name="time" size={10} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.badgeText}>{Math.ceil(currentNote.audio_duration / 60)} min</Text>
                </View>
              )}
            </RNAnimated.View>
          </View>
          <View style={{ width: 40 }} />
        </LinearGradient>
      </RNAnimated.View>

      {/* Audio player (overlaps header) */}
      {signedUrl && (
        <View style={styles.playerWrap}>
          <AudioPlayer uri={signedUrl} duration={currentNote.audio_duration} />
        </View>
      )}

      {/* Content */}
      {isProcessing ? (
        <LoadingProcessor
          status={currentNote.status}
          errorMessage={currentNote.error_message}
          onComplete={() => { if (id) { fetchNote(id); fetchModeResults(id); } }}
        />
      ) : isError ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={48} color={COLORS.error} />
          <Text style={styles.errorTitle}>Error al procesar</Text>
          <Text style={styles.errorMsg}>{currentNote.error_message ?? 'Error desconocido'}</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          <ModeSelector
            currentMode={selectedMode ?? currentNote.primary_mode}
            generatedModes={generatedModes}
            onSelectMode={handleSelectMode}
            onGenerateMode={handleGenerateMode}
            loading={converting}
            loadingMode={convertingMode}
          />

          {converting && convertingMode === selectedMode ? (
            <View style={styles.convertWrap}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.convertText}>Generando {getModeConfig(selectedMode ?? 'summary').label}...</Text>
            </View>
          ) : displayResult ? (
            <ModeResultView
              mode={selectedMode ?? currentNote.primary_mode}
              result={displayResult}
              noteId={currentNote.id}
            />
          ) : (
            <View style={styles.convertWrap}>
              <Text style={styles.convertText}>Toca un modo para generarlo</Text>
            </View>
          )}

          {/* Transcript toggle */}
          <AnimatedPressable
            onPress={() => setShowTranscript(!showTranscript)}
            style={styles.transcriptToggle}
          >
            <Ionicons
              name={showTranscript ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={COLORS.primary}
            />
            <Text style={styles.transcriptToggleText}>
              {showTranscript ? 'Ocultar transcripción' : 'Ver transcripción completa'}
            </Text>
          </AnimatedPressable>

          {showTranscript && (
            <RNAnimated.View entering={FadeInUp.springify()}>
              {currentNote.is_conversation && currentNote.segments.length > 0 ? (
                <SpeakerTranscript
                  segments={currentNote.segments}
                  speakers={currentNote.speakers}
                  onRenameSpeaker={() => setShowRenameModal(true)}
                />
              ) : (
                <View style={styles.plainTranscript}>
                  <Text style={styles.plainText}>{currentNote.transcript}</Text>
                </View>
              )}
            </RNAnimated.View>
          )}
        </ScrollView>
      )}

      {isDone && <ExportButton note={currentNote} />}

      <SpeakerRenameModal
        visible={showRenameModal}
        speakers={currentNote.speakers}
        onSave={handleSaveSpeakers}
        onClose={() => setShowRenameModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: { flex: 1, marginHorizontal: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', letterSpacing: -0.3 },
  badgeRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  badgeText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  playerWrap: { paddingHorizontal: 20, marginTop: -16, zIndex: 1, marginBottom: 8 },
  scroll: { flex: 1 },
  convertWrap: { alignItems: 'center', paddingVertical: 48, gap: 16 },
  convertText: { fontSize: 15, color: COLORS.textMuted },
  transcriptToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 18, marginHorizontal: 24,
    borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  transcriptToggleText: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },
  plainTranscript: {
    marginHorizontal: 24, marginBottom: 16,
    backgroundColor: COLORS.surfaceAlt, borderRadius: 16, padding: 18,
  },
  plainText: { fontSize: 15, lineHeight: 26, color: COLORS.textPrimary },
  notFound: { fontSize: 16, color: COLORS.textSecondary, marginBottom: 12 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: COLORS.error, marginTop: 16 },
  errorMsg: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  backLink: { fontSize: 16, color: COLORS.primary, fontWeight: '600', marginTop: 16 },
});
