import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Image,
  Alert,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { COLORS } from '@/lib/constants';
import { FONT } from '@/lib/styles';
import { track } from '@/lib/analytics';
import AnimatedPressable from '@/components/AnimatedPressable';
import { useAuthStore } from '@/stores/authStore';
import { useNotesStore } from '@/stores/notesStore';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/Toast';
import {
  hapticButtonPress,
  hapticError,
  hapticExportSuccess,
  hapticCopyClipboard,
} from '@/lib/haptics';

const PRIVACY_URL = 'https://sythio.app/privacy-policy';
const TERMS_URL = 'https://sythio.app/terms';
const SUPPORT_EMAIL = 'soporte@sythio.app';

// ---------------------------------------------------------------------------
// Glass card wrapper
// ---------------------------------------------------------------------------

function GlassCard({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: object;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(450).springify().damping(16)}
      style={[styles.glassCard, style]}
    >
      {Platform.OS === 'ios' && (
        <BlurView tint="light" intensity={40} style={StyleSheet.absoluteFill} />
      )}
      <View style={[StyleSheet.absoluteFill, styles.glassOverlay]} />
      <View style={styles.glassContent}>{children}</View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Menu row
// ---------------------------------------------------------------------------

function MenuRow({
  icon,
  label,
  subtitle,
  color = COLORS.textPrimary,
  onPress,
  disabled,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  color?: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <AnimatedPressable style={styles.menuRow} onPress={onPress} disabled={disabled}>
      <View style={[styles.menuIconWrap, { backgroundColor: (danger ? COLORS.error : color) + '12' }]}>
        <Ionicons name={icon} size={20} color={danger ? COLORS.error : color} />
      </View>
      <View style={styles.menuTextCol}>
        <Text style={[styles.menuLabel, danger && { color: COLORS.error }]}>{label}</Text>
        {subtitle && <Text style={styles.menuSub}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={16} color={COLORS.primaryLight} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function MenuScreen() {
  if (__DEV__) console.log('[menu] loading');
  const { user, logout, fetchProfile } = useAuthStore();
  const { notes } = useNotesStore();

  // State for modals
  const [showSlackModal, setShowSlackModal] = useState(false);
  const [slackUrl, setSlackUrl] = useState('');
  const [savingSlack, setSavingSlack] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [vocabInput, setVocabInput] = useState('');
  const [savingVocab, setSavingVocab] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);

  // Check MFA on mount
  useState(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const verified = data?.totp?.find((f) => f.status === 'verified');
      if (verified) setMfaEnabled(true);
    });
  });

  const handleExportData = async () => {
    setExporting(true);
    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        email: user?.email,
        plan: user?.plan,
        totalNotes: notes.length,
        notes: notes.map((n) => ({
          id: n.id, title: n.title, transcript: n.transcript,
          summary: n.summary, key_points: n.key_points, tasks: n.tasks,
          primary_mode: n.primary_mode, audio_duration: n.audio_duration,
          status: n.status, created_at: n.created_at,
        })),
      };
      const json = JSON.stringify(exportData, null, 2);
      const date = new Date().toISOString().split('T')[0];
      const file = new File(Paths.cache, `sythio-datos-${date}.json`);
      file.create();
      await file.write(json);
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
      hapticExportSuccess();
      track('data_exported', { notes_count: notes.length });
    } catch {
      showToast('Error al exportar datos', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleLogout = () => {
    hapticButtonPress();
    Alert.alert('Cerrar sesion', 'Estas seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesion', style: 'destructive', onPress: () => { logout(); showToast('Sesion cerrada', 'info'); } },
    ]);
  };

  const handleDeleteAccount = () => {
    hapticError();
    Alert.alert(
      'Eliminar cuenta',
      'Esta accion es permanente. Se eliminaran todas tus notas, grabaciones y datos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => { setDeleteConfirmText(''); setShowDeleteModal(true); } },
      ],
    );
  };

  const executeDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_user');
      if (error) {
        hapticError();
        Alert.alert('No pudimos eliminar tu cuenta', `Contacta soporte en ${SUPPORT_EMAIL}`, [
          { text: 'Copiar email', onPress: () => { Clipboard.setStringAsync(SUPPORT_EMAIL); hapticCopyClipboard(); } },
          { text: 'OK' },
        ]);
        setDeleting(false);
        return;
      }
      setShowDeleteModal(false);
      await logout();
    } catch {
      hapticError();
      showToast('Error al eliminar cuenta', 'error');
      setDeleting(false);
    }
  };

  const addVocabTerm = async () => {
    const term = vocabInput.trim();
    if (!term || !user) return;
    const current = user.custom_vocabulary ?? [];
    if (current.includes(term)) { setVocabInput(''); return; }
    setSavingVocab(true);
    await supabase.from('profiles').update({ custom_vocabulary: [...current, term] }).eq('id', user.id);
    await fetchProfile();
    setSavingVocab(false);
    setVocabInput('');
    showToast('Termino agregado', 'success');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(50).duration(400)} style={styles.header}>
          <LinearGradient colors={['#0B0B0B', '#1A2A3A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerGradient}>
            <Ionicons name="grid" size={20} color={COLORS.primaryLight} />
            <Text style={styles.headerTitle}>Menu</Text>
            <Text style={styles.headerSub}>Todo en un solo lugar</Text>
          </LinearGradient>
        </Animated.View>

        {/* Workspaces */}
        <GlassCard delay={80}>
          <SectionHeader icon="people" title="WORKSPACES" />
          <MenuRow
            icon="people-outline"
            label="Mis workspaces"
            subtitle="Colabora con tu equipo"
            color="#8B5CF6"
            onPress={() => router.push('/workspace' as any)}
          />
        </GlassCard>

        {/* Integrations */}
        <GlassCard delay={140}>
          <SectionHeader icon="link" title="INTEGRACIONES" />
          <MenuRow
            icon="logo-slack"
            label="Slack"
            subtitle="Notificaciones al terminar"
            color="#4A154B"
            onPress={() => setShowSlackModal(true)}
          />
          <MenuRow
            icon="calendar-outline"
            label="Google Calendar"
            subtitle="Conecta tu calendario"
            color={COLORS.accentTeal}
            onPress={async () => {
              if (!user) return;
              const returnUrl = Linking.createURL('/(tabs)/menu');
              const authUrl = `https://oewjbeqwihhzuvbsfctf.supabase.co/functions/v1/calendar-auth?action=authorize&user_id=${user.id}&return_url=${encodeURIComponent(returnUrl)}`;
              await Linking.openURL(authUrl);
            }}
          />
        </GlassCard>

        {/* Settings */}
        <GlassCard delay={200}>
          <SectionHeader icon="settings" title="CONFIGURACION" />
          <MenuRow
            icon="shield-checkmark-outline"
            label="Verificación en 2 pasos"
            subtitle={mfaEnabled ? 'Activada — gestionar' : 'No activada — activar ahora'}
            color={mfaEnabled ? COLORS.success : COLORS.textPrimary}
            onPress={() => router.push('/security/two-factor' as any)}
          />
          <View style={styles.vocabSection}>
            <View style={styles.vocabHeader}>
              <Ionicons name="text-outline" size={20} color={COLORS.accentGold} />
              <View style={styles.menuTextCol}>
                <Text style={styles.menuLabel}>Vocabulario personalizado</Text>
                <Text style={styles.menuSub}>Terminos que Sythio debe reconocer</Text>
              </View>
            </View>
            <View style={styles.vocabInputRow}>
              <TextInput
                style={styles.vocabInput}
                placeholder="Ej: SCRUM, Dr. Garcia"
                placeholderTextColor={COLORS.textMuted}
                value={vocabInput}
                onChangeText={setVocabInput}
                returnKeyType="done"
                onSubmitEditing={addVocabTerm}
              />
              <TouchableOpacity
                onPress={addVocabTerm}
                disabled={savingVocab || !vocabInput.trim()}
                style={[styles.vocabAddBtn, (!vocabInput.trim() || savingVocab) && { opacity: 0.4 }]}
              >
                {savingVocab ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="add" size={20} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>
            {(user?.custom_vocabulary ?? []).length > 0 && (
              <View style={styles.chipRow}>
                {(user?.custom_vocabulary ?? []).map((term, i) => (
                  <TouchableOpacity
                    key={`${term}-${i}`}
                    onPress={async () => {
                      if (!user) return;
                      const updated = (user.custom_vocabulary ?? []).filter((_, idx) => idx !== i);
                      await supabase.from('profiles').update({ custom_vocabulary: updated }).eq('id', user.id);
                      await fetchProfile();
                    }}
                    style={styles.vocabChip}
                  >
                    <Text style={styles.vocabChipText}>{term}</Text>
                    <Ionicons name="close-circle" size={14} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          <MenuRow
            icon="key-outline"
            label="API Key"
            subtitle="Acceso programatico"
            color={COLORS.textPrimary}
            onPress={async () => {
              if (!user) return;
              const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)))
                .map((b) => b.toString(16).padStart(2, '0')).join('');
              const apiKey = `sk_${raw}`;
              const encoder = new TextEncoder();
              const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(apiKey));
              const keyHash = Array.from(new Uint8Array(hashBuffer))
                .map((b) => b.toString(16).padStart(2, '0')).join('');
              const { error } = await supabase.from('api_keys').insert({
                user_id: user.id, key_hash: keyHash, name: 'API Key', permissions: ['read', 'write'],
              });
              if (error) { showToast('Error al generar API key', 'error'); return; }
              await Clipboard.setStringAsync(apiKey);
              hapticCopyClipboard();
              Alert.alert('API Key generada', 'Copiada al portapapeles. Guardala en un lugar seguro.');
              track('api_key_generated');
            }}
          />
        </GlassCard>

        {/* Support & Legal */}
        <GlassCard delay={260}>
          <SectionHeader icon="information-circle" title="SOPORTE" />
          <MenuRow
            icon="shield-checkmark-outline"
            label="Privacidad y datos"
            color={COLORS.textSecondary}
            onPress={() => Linking.openURL(PRIVACY_URL)}
          />
          <MenuRow
            icon="document-text-outline"
            label="Terminos de servicio"
            color={COLORS.textSecondary}
            onPress={() => Linking.openURL(TERMS_URL)}
          />
          <MenuRow
            icon="mail-outline"
            label="Contactar soporte"
            subtitle={SUPPORT_EMAIL}
            color={COLORS.textSecondary}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          />
        </GlassCard>

        {/* Account */}
        <GlassCard delay={320}>
          <SectionHeader icon="person-circle" title="CUENTA" />
          <MenuRow
            icon="download-outline"
            label={exporting ? 'Exportando...' : 'Exportar mis datos'}
            subtitle="JSON con todas tus notas"
            color={COLORS.textPrimary}
            onPress={handleExportData}
            disabled={exporting}
          />
          <View style={styles.separator} />
          <MenuRow icon="log-out-outline" label="Cerrar sesion" color={COLORS.warning} onPress={handleLogout} />
          <MenuRow icon="trash-outline" label="Eliminar cuenta" onPress={handleDeleteAccount} danger />
        </GlassCard>

        {/* Dev Reset */}
        {__DEV__ && (
          <GlassCard delay={380}>
            <MenuRow
              icon="refresh-outline"
              label="Dev Reset (primera vez)"
              subtitle="Borra onboarding + welcome"
              color="#8B5CF6"
              onPress={() => {
                Alert.alert('Dev Reset', 'Borrar onboarding + welcome?', [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Reset', style: 'destructive',
                    onPress: async () => {
                      await AsyncStorage.multiRemove(['sythio_onboarding_done', 'sythio_welcome_done']);
                      await logout();
                    },
                  },
                ]);
              }}
            />
          </GlassCard>
        )}

        <Text style={styles.version}>Sythio v1.0.0</Text>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Slack modal */}
      <Modal visible={showSlackModal} transparent animationType="fade" onRequestClose={() => setShowSlackModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Conectar Slack</Text>
            <Text style={styles.modalDesc}>
              Pega la URL del Incoming Webhook de tu workspace de Slack.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="https://hooks.slack.com/services/..."
              placeholderTextColor={COLORS.textMuted}
              value={slackUrl}
              onChangeText={setSlackUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => { setShowSlackModal(false); setSlackUrl(''); }}
                disabled={savingSlack}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnAction, !slackUrl.startsWith('https://hooks.slack.com/') && { opacity: 0.4 }]}
                onPress={async () => {
                  if (!slackUrl.startsWith('https://hooks.slack.com/') || !user) return;
                  setSavingSlack(true);
                  const { error } = await supabase.from('integrations').upsert({
                    user_id: user.id, provider: 'slack',
                    config: { webhook_url: slackUrl, notify_on: ['processing_complete'] }, enabled: true,
                  }, { onConflict: 'user_id,provider' });
                  setSavingSlack(false);
                  if (error) { showToast('Error al guardar', 'error'); return; }
                  showToast('Slack conectado', 'success');
                  setShowSlackModal(false);
                  setSlackUrl('');
                }}
                disabled={!slackUrl.startsWith('https://hooks.slack.com/') || savingSlack}
              >
                {savingSlack ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.modalBtnActionText}>Conectar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete account modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirmar eliminacion</Text>
            <Text style={styles.modalDesc}>Escribe ELIMINAR para confirmar.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Escribe ELIMINAR"
              placeholderTextColor={COLORS.textMuted}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowDeleteModal(false)} disabled={deleting}>
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnDanger, deleteConfirmText !== 'ELIMINAR' && { opacity: 0.4 }]}
                onPress={executeDeleteAccount}
                disabled={deleteConfirmText !== 'ELIMINAR' || deleting}
              >
                {deleting ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.modalBtnActionText}>Eliminar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },

  // Header
  header: { marginBottom: 20, borderRadius: 20, overflow: 'hidden' },
  headerGradient: { padding: 24, gap: 6 },
  headerTitle: { fontSize: 26, fontFamily: FONT.bold, color: '#FFFFFF', letterSpacing: -0.5 },
  headerSub: { fontSize: 14, fontFamily: FONT.regular, color: 'rgba(255,255,255,0.6)' },

  // Glass card
  glassCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(143, 211, 255, 0.12)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 16 },
      android: { elevation: 3 },
    }),
  },
  glassOverlay: { backgroundColor: 'rgba(255, 255, 255, 0.85)' },
  glassContent: { padding: 16 },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontFamily: FONT.semibold, color: COLORS.primaryLight, letterSpacing: 1.2 },

  // Menu row
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  menuIconWrap: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  menuTextCol: { flex: 1 },
  menuLabel: { fontSize: 15, fontFamily: FONT.medium, color: COLORS.textPrimary },
  menuSub: { fontSize: 12, fontFamily: FONT.regular, color: COLORS.textSecondary, marginTop: 1 },

  // Vocabulary
  vocabSection: { paddingVertical: 12, gap: 10 },
  vocabHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vocabInputRow: { flexDirection: 'row', gap: 8 },
  vocabInput: {
    flex: 1, height: 40, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: COLORS.textPrimary,
    fontFamily: FONT.regular,
  },
  vocabAddBtn: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  vocabChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.surfaceAlt, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  vocabChipText: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.textPrimary },

  separator: { height: 1, backgroundColor: COLORS.border, marginVertical: 6 },

  version: { textAlign: 'center', fontSize: 12, fontFamily: FONT.regular, color: COLORS.textMuted, marginTop: 20 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontFamily: FONT.bold, color: COLORS.textPrimary, marginBottom: 8 },
  modalDesc: { fontSize: 14, fontFamily: FONT.regular, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 16 },
  modalInput: {
    height: 48, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, fontSize: 15, color: COLORS.textPrimary, fontFamily: FONT.regular, marginBottom: 16,
  },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalBtnCancel: {
    flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  modalBtnCancelText: { fontSize: 15, fontFamily: FONT.medium, color: COLORS.textPrimary },
  modalBtnAction: {
    flex: 1, height: 46, borderRadius: 12, backgroundColor: '#4A154B',
    justifyContent: 'center', alignItems: 'center',
  },
  modalBtnDanger: {
    flex: 1, height: 46, borderRadius: 12, backgroundColor: COLORS.error,
    justifyContent: 'center', alignItems: 'center',
  },
  modalBtnActionText: { fontSize: 15, fontFamily: FONT.semibold, color: '#FFFFFF' },
});
