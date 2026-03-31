import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
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
import { BlurView } from 'expo-blur';
import { COLORS, getModeConfig, useThemeColors } from '@/lib/constants';
import AudioPlayer from '@/components/AudioPlayer';
import ModeResultView from '@/components/ModeResultView';
import ModeSelector from '@/components/ModeSelector';
import SpeakerTranscript from '@/components/SpeakerTranscript';
import SpeakerRenameModal from '@/components/SpeakerRenameModal';
import ExportButton from '@/components/ExportButton';
import LoadingProcessor from '@/components/LoadingProcessor';
import AnimatedPressable from '@/components/AnimatedPressable';
import { useNotesStore } from '@/stores/notesStore';
import { useAuthStore } from '@/stores/authStore';
import { getSignedAudioUrl } from '@/lib/transcription';
import { hapticButtonPress } from '@/lib/haptics';
import { showToast } from '@/components/Toast';
import { track, trackModeView, trackModeGenerated } from '@/lib/analytics';
import Paywall from '@/components/Paywall';
import type { OutputMode, SpeakerInfo, ModeResult, Folder } from '@/types';

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    currentNote, loading, modeResults, converting, convertingMode,
    fetchNote, fetchModeResults, subscribeToNote, convertMode, updateSpeakers,
    retryProcessing,
  } = useNotesStore();

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<OutputMode | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState('');
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const { user } = useAuthStore();
  const { folders, fetchFolders, moveNoteToFolder } = useNotesStore();
  const colors = useThemeColors();

  useEffect(() => {
    if (id) {
      fetchNote(id);
      fetchModeResults(id);
      fetchFolders();
      const unsub = subscribeToNote(id);
      return unsub;
    }
  }, [id, fetchNote, fetchModeResults, fetchFolders, subscribeToNote]);

  useEffect(() => {
    if (currentNote?.audio_url) getSignedAudioUrl(currentNote.audio_url).then(setSignedUrl);
  }, [currentNote?.audio_url]);

  useEffect(() => {
    if (currentNote && !selectedMode) setSelectedMode(currentNote.primary_mode || 'summary');
  }, [currentNote, selectedMode]);

  const generatedModes = useMemo(() => {
    const modes = modeResults.map((r) => r.mode as OutputMode);
    if (currentNote?.primary_mode && !modes.includes(currentNote.primary_mode)) {
      modes.push(currentNote.primary_mode);
    }
    return modes;
  }, [modeResults, currentNote?.primary_mode]);

  const activeResult: ModeResult | undefined = modeResults.find((r) => r.mode === selectedMode);

  const handleSelectMode = useCallback((mode: OutputMode) => {
    setSelectedMode(mode);
    if (id) trackModeView(mode, id);
  }, [id]);
  const handleGenerateMode = useCallback(async (mode: OutputMode) => {
    if (!id) return;
    setSelectedMode(mode);
    const result = await convertMode(id, mode);
    if (result) {
      trackModeGenerated(mode, id);
      showToast(`${getModeConfig(mode).label} generado`, 'success');
    } else {
      showToast('No se pudo generar. Intenta de nuevo.', 'error');
    }
  }, [id, convertMode]);

  const handleSaveTranscript = useCallback(async () => {
    if (!id || !transcriptDraft.trim()) return;
    setSavingTranscript(true);
    await useNotesStore.getState().updateNote(id, { transcript: transcriptDraft.trim() });
    setEditingTranscript(false);
    setSavingTranscript(false);
    showToast('Transcripción actualizada', 'success');
  }, [id, transcriptDraft]);

  const handleSaveSpeakers = useCallback(async (updated: SpeakerInfo[]) => {
    if (!id) return;
    await updateSpeakers(id, updated);
    setShowRenameModal(false);
    track('speaker_renamed', { note_id: id });
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

  // Parse error type from error_message (format: "type: detail")
  const errorType = currentNote.error_message?.split(':')[0]?.trim() ?? 'unknown';
  const errorUserMessage =
    errorType === 'transcription_failed'
      ? 'No pudimos transcribir este audio. Verifica que el audio tiene voz clara y vuelve a intentar.'
      : errorType === 'processing_failed'
        ? 'La transcripción fue exitosa pero falló al generar el resultado. Puedes ver la transcripción abajo.'
        : currentNote.error_message ?? 'Algo salió mal. Puedes intentar de nuevo.';

  const displayResult = activeResult?.result ?? (selectedMode === currentNote.primary_mode ? {
    title_suggestion: currentNote.title,
    summary: currentNote.summary,
    key_points: currentNote.key_points,
    tasks: currentNote.tasks.map((t) => ({ text: t, priority: 'medium', responsible: null, deadline_hint: null, source_quote: '', is_explicit: true })),
    clean_text: currentNote.clean_text,
  } : undefined);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header gradient */}
      <RNAnimated.View entering={FadeIn.duration(400)}>
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <AnimatedPressable onPress={() => { hapticButtonPress(); router.back(); }} style={styles.backBtn}>
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
              <TouchableOpacity onPress={() => setShowFolderPicker(true)} style={styles.badge}>
                <Ionicons name="folder-outline" size={10} color="rgba(255,255,255,0.9)" />
                <Text style={styles.badgeText}>
                  {currentNote.folder_id
                    ? folders.find(f => f.id === currentNote.folder_id)?.name ?? 'Carpeta'
                    : 'Mover a carpeta'}
                </Text>
              </TouchableOpacity>
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
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={styles.errorSection}>
            <Ionicons
              name={errorType === 'transcription_failed' ? 'mic-off-outline' : 'alert-circle-outline'}
              size={48}
              color={COLORS.error}
            />
            <Text style={styles.errorTitle}>
              {errorType === 'transcription_failed' ? 'Error de transcripción'
                : errorType === 'processing_failed' ? 'Error de procesamiento'
                : 'Algo salió mal'}
            </Text>
            <Text style={styles.errorMsg}>{errorUserMessage}</Text>

            {/* Retry button */}
            <AnimatedPressable
              onPress={async () => {
                if (!id || retrying) return;
                setRetrying(true);
                track('note_retry', { note_id: id, error_type: errorType });
                const ok = await retryProcessing(id);
                setRetrying(false);
                if (ok) {
                  showToast('Reintentando...', 'info');
                } else {
                  showToast('No se pudo reintentar.', 'error');
                }
              }}
              disabled={retrying}
              style={styles.retryButton}
            >
              {retrying ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="refresh" size={18} color="#FFFFFF" />
                  <Text style={styles.retryText}>Reintentar</Text>
                </>
              )}
            </AnimatedPressable>

            <AnimatedPressable onPress={() => router.back()} style={styles.errorBackButton}>
              <Text style={styles.errorBackText}>Volver al inicio</Text>
            </AnimatedPressable>
          </View>

          {/* Show transcript if it was saved despite error */}
          {currentNote.transcript ? (
            <View style={styles.errorTranscriptSection}>
              <Text style={styles.errorTranscriptLabel}>Transcripción disponible</Text>
              <View style={styles.plainTranscript}>
                <Text style={styles.plainText}>{currentNote.transcript}</Text>
              </View>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100 }}>
          <RNAnimated.View entering={FadeInDown.delay(100).springify().damping(20)}>
          <ModeSelector
            currentMode={selectedMode ?? currentNote.primary_mode}
            generatedModes={generatedModes}
            onSelectMode={handleSelectMode}
            onGenerateMode={handleGenerateMode}
            onPremiumRequired={(mode) => {
              track('premium_cta_viewed', { source: 'mode_gate', mode });
              setShowPaywall(true);
            }}
            userPlan={user?.plan ?? 'free'}
            loading={converting}
            loadingMode={convertingMode}
          />
          </RNAnimated.View>

          {converting && convertingMode === selectedMode ? (
            <View style={styles.convertWrap}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.convertTitle}>Generando {getModeConfig(selectedMode ?? 'summary').label}</Text>
              <Text style={styles.convertText}>Transformando tu audio...</Text>
            </View>
          ) : displayResult ? (
            <RNAnimated.View entering={FadeInUp.delay(200).springify().damping(20)}>
              <ModeResultView
                mode={selectedMode ?? currentNote.primary_mode}
                result={displayResult}
                noteId={currentNote.id}
              />
              {/* Reconversion CTA — "One audio, multiple outcomes" */}
              {generatedModes.length < 8 && (
                <View style={styles.reconvertCta}>
                  <Ionicons name="sparkles-outline" size={16} color={COLORS.primaryLight} />
                  <Text style={styles.reconvertText}>Un audio, múltiples resultados.</Text>
                  <Text style={styles.reconvertHint}>Prueba otro formato arriba.</Text>
                </View>
              )}
            </RNAnimated.View>
          ) : (
            <View style={styles.convertWrap}>
              <Ionicons name="layers-outline" size={32} color={COLORS.borderLight} />
              <Text style={styles.convertTitle}>Elige un formato</Text>
              <Text style={styles.convertText}>Toca cualquier modo arriba para transformar este audio.</Text>
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
              ) : editingTranscript ? (
                <View style={styles.plainTranscript}>
                  <TextInput
                    style={[styles.plainText, styles.transcriptInput]}
                    value={transcriptDraft}
                    onChangeText={setTranscriptDraft}
                    multiline
                    autoFocus
                  />
                  <View style={styles.transcriptActions}>
                    <TouchableOpacity
                      onPress={() => setEditingTranscript(false)}
                      style={styles.transcriptCancelBtn}
                    >
                      <Text style={styles.transcriptCancelText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveTranscript}
                      disabled={savingTranscript}
                      style={styles.transcriptSaveBtn}
                    >
                      {savingTranscript ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.transcriptSaveText}>Guardar</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.plainTranscript}>
                  <Text style={styles.plainText}>{currentNote.transcript}</Text>
                  <TouchableOpacity
                    onPress={() => { setTranscriptDraft(currentNote.transcript); setEditingTranscript(true); }}
                    style={styles.editTranscriptBtn}
                  >
                    <Ionicons name="create-outline" size={14} color={COLORS.primaryLight} />
                    <Text style={styles.editTranscriptText}>Editar transcripción</Text>
                  </TouchableOpacity>
                </View>
              )}
            </RNAnimated.View>
          )}
        </ScrollView>
      )}

      {isDone && (
        <ExportButton
          note={currentNote}
          activeMode={selectedMode ?? currentNote.primary_mode}
          activeModeResult={displayResult as Record<string, unknown> | undefined}
        />
      )}

      <SpeakerRenameModal
        visible={showRenameModal}
        speakers={currentNote.speakers}
        onSave={handleSaveSpeakers}
        onClose={() => setShowRenameModal(false)}
      />
      <Paywall visible={showPaywall} onClose={() => setShowPaywall(false)} trigger="mode_gate" />

      {/* Folder Picker Modal */}
      {showFolderPicker && (
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity
            style={{ flex: 1, justifyContent: 'flex-end' }}
            activeOpacity={1}
            onPress={() => setShowFolderPicker(false)}
          >
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 16, textAlign: 'center' }}>Mover a carpeta</Text>
              <TouchableOpacity
                onPress={async () => {
                  if (id) await moveNoteToFolder(id, null);
                  setShowFolderPicker(false);
                  showToast('Nota sin carpeta', 'info');
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight }}
              >
                <Ionicons name="remove-circle-outline" size={20} color={COLORS.textMuted} />
                <Text style={{ fontSize: 15, color: COLORS.textSecondary }}>Sin carpeta</Text>
                {!currentNote.folder_id && <Ionicons name="checkmark" size={18} color={COLORS.success} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
              {folders.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  onPress={async () => {
                    if (id) await moveNoteToFolder(id, f.id);
                    setShowFolderPicker(false);
                    showToast(`Movida a ${f.name}`, 'success');
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight }}
                >
                  <Ionicons name="folder" size={20} color={f.color} />
                  <Text style={{ fontSize: 15, color: COLORS.textPrimary, fontWeight: '500' }}>{f.name}</Text>
                  {currentNote.folder_id === f.id && <Ionicons name="checkmark" size={18} color={COLORS.success} style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              ))}
              {folders.length === 0 && (
                <Text style={{ fontSize: 14, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 20 }}>
                  No tienes carpetas. Crea una desde el historial.
                </Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      )}
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
  convertWrap: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  convertTitle: { fontSize: 17, fontWeight: '600', color: COLORS.textSecondary },
  convertText: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', paddingHorizontal: 40 },
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
  transcriptInput: { minHeight: 120, textAlignVertical: 'top' },
  transcriptActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  transcriptCancelBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  transcriptCancelText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '500' },
  transcriptSaveBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.primary },
  transcriptSaveText: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
  editTranscriptBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-end' },
  editTranscriptText: { fontSize: 13, color: COLORS.primaryLight, fontWeight: '500' },
  notFound: { fontSize: 16, color: COLORS.textSecondary, marginBottom: 12 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: COLORS.error, marginTop: 16 },
  errorMsg: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  backLink: { fontSize: 16, color: COLORS.primary, fontWeight: '600', marginTop: 16 },
  reconvertCta: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 24, marginHorizontal: 24, paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: COLORS.surfaceAlt, borderRadius: 14, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  reconvertText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  reconvertHint: { fontSize: 13, color: COLORS.textMuted },

  // Error state
  errorSection: {
    alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32, gap: 12,
  },
  retryButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 16, marginTop: 8,
  },
  retryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  errorBackButton: { paddingVertical: 10, marginTop: 4 },
  errorBackText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '500' },
  errorTranscriptSection: { paddingHorizontal: 24, marginTop: 8 },
  errorTranscriptLabel: {
    fontSize: 13, fontWeight: '600', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
  },
});
