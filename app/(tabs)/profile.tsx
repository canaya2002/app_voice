import React, { useState, useEffect as useEffectHook } from 'react';
import { router } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  Image,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import * as Linking from 'expo-linking';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { COLORS, LIMITS, useThemeColors } from '@/lib/constants';
import { track } from '@/lib/analytics';
import Paywall from '@/components/Paywall';
import { shadows } from '@/lib/styles';
import { cardEntry, FadeInUp, ZoomIn } from '@/lib/animations';
import AnimatedPressable from '@/components/AnimatedPressable';
import { useAuthStore } from '@/stores/authStore';
import { useNotesStore } from '@/stores/notesStore';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/Toast';
import { hapticButtonPress, hapticError, hapticPaywallOpen, hapticExportSuccess, hapticCopyClipboard } from '@/lib/haptics';
import { formatDurationLong } from '@/lib/audio';

const PRIVACY_URL = 'https://sythio.com/privacy';
const TERMS_URL = 'https://sythio.com/terms';
const SUPPORT_EMAIL = 'soporte@sythio.com';

// ---------------------------------------------------------------------------
// Stats card config
// ---------------------------------------------------------------------------

interface StatCardConfig {
  bg: string;
  iconColor: string;
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: string;
}

const STAT_CARD_STYLES: StatCardConfig[] = [
  { bg: COLORS.surfaceAlt, iconColor: COLORS.textPrimary, icon: 'mic', labelKey: 'Notas' },
  { bg: COLORS.surfaceAlt, iconColor: COLORS.textPrimary, icon: 'time', labelKey: 'Tiempo' },
  { bg: COLORS.surfaceAlt, iconColor: COLORS.textPrimary, icon: 'checkbox', labelKey: 'Tareas' },
  { bg: COLORS.surfaceAlt, iconColor: COLORS.textPrimary, icon: 'chatbubbles', labelKey: 'Conversaciones' },
  { bg: COLORS.surfaceAlt, iconColor: COLORS.textPrimary, icon: 'calendar', labelKey: 'Este mes' },
];

// ---------------------------------------------------------------------------
// Animated counter
// ---------------------------------------------------------------------------

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function AnimatedCounter({ value, style }: { value: string; style: object }) {
  const numericVal = parseInt(value, 10);
  const isNumeric = !isNaN(numericVal) && String(numericVal) === value;
  const animatedVal = useSharedValue(0);

  const animatedProps = useAnimatedProps(() => ({
    text: isNumeric ? String(Math.round(animatedVal.value)) : value,
    defaultValue: isNumeric ? '0' : value,
  }));

  useEffectHook(() => {
    if (isNumeric) {
      animatedVal.value = withTiming(numericVal, { duration: 800, easing: Easing.out(Easing.exp) });
    }
  }, [numericVal, isNumeric, animatedVal]);

  if (!isNumeric) return <Text style={style}>{value}</Text>;

  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
      editable={false}
      animatedProps={animatedProps}
      style={[style, { padding: 0 }]}
    />
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  const colors = useThemeColors();
  const [showPaywall, setShowPaywall] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [vocabInput, setVocabInput] = useState('');
  const [savingVocab, setSavingVocab] = useState(false);
  const [showSlackModal, setShowSlackModal] = useState(false);
  const [slackUrl, setSlackUrl] = useState('');
  const [savingSlack, setSavingSlack] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaQr, setMfaQr] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const { user, logout, fetchProfile } = useAuthStore();
  const { notes } = useNotesStore();

  // Check MFA status on mount
  useEffectHook(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const totp = data?.totp ?? [];
      const verified = totp.find(f => f.status === 'verified');
      if (verified) { setMfaEnabled(true); setMfaFactorId(verified.id); }
    });
  }, []);

  const handleEnableMfa = async () => {
    setMfaLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Sythio App' });
      if (error) throw error;
      setMfaQr(data.totp.qr_code);
      setMfaFactorId(data.id);
    } catch {
      showToast('Error al configurar 2FA', 'error');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleVerifyMfa = async () => {
    if (!mfaFactorId || mfaCode.length !== 6) return;
    setMfaLoading(true);
    try {
      const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (!challenge) throw new Error('No challenge');
      const { error } = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.id, code: mfaCode });
      if (error) throw error;
      setMfaEnabled(true);
      setMfaQr(null);
      setMfaCode('');
      showToast('2FA activado correctamente', 'success');
    } catch {
      showToast('Código incorrecto', 'error');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!mfaFactorId) return;
    Alert.alert('Desactivar 2FA', '¿Estás seguro? Tu cuenta será menos segura.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desactivar', style: 'destructive', onPress: async () => {
          setMfaLoading(true);
          const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
          if (error) { showToast('Error al desactivar', 'error'); }
          else { setMfaEnabled(false); setMfaFactorId(null); showToast('2FA desactivado', 'info'); }
          setMfaLoading(false);
        },
      },
    ]);
  };

  const handleLogout = () => {
    hapticButtonPress();
    Alert.alert('Cerrar sesión', '¿Estás seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: () => {
          logout();
          showToast('Sesión cerrada', 'info');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    hapticError();
    Alert.alert(
      'Eliminar cuenta',
      'Esta acción es permanente. Se eliminarán todas tus notas, grabaciones y datos. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            setDeleteConfirmText('');
            setShowDeleteModal(true);
          },
        },
      ],
    );
  };

  const executeDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_user');
      if (error) {
        hapticError();
        Alert.alert(
          'No pudimos eliminar tu cuenta',
          `Por favor contacta soporte en ${SUPPORT_EMAIL}`,
          [
            { text: 'Copiar email', onPress: () => { Clipboard.setStringAsync(SUPPORT_EMAIL); hapticCopyClipboard(); } },
            { text: 'OK' },
          ],
        );
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

  const handleExportData = async () => {
    setExporting(true);
    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        email: user?.email,
        plan: user?.plan,
        totalNotes: notes.length,
        notes: notes.map((n) => ({
          id: n.id,
          title: n.title,
          transcript: n.transcript,
          summary: n.summary,
          key_points: n.key_points,
          tasks: n.tasks,
          clean_text: n.clean_text,
          primary_mode: n.primary_mode,
          audio_duration: n.audio_duration,
          speakers_detected: n.speakers_detected,
          is_conversation: n.is_conversation,
          status: n.status,
          created_at: n.created_at,
        })),
      };
      const json = JSON.stringify(exportData, null, 2);
      const date = new Date().toISOString().split('T')[0];
      const file = new File(Paths.cache, `sythio-datos-${date}.json`);
      await file.text(); // ensure path exists
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

  const getInitials = (str: string): string => {
    const clean = str.includes('@') ? str.split('@')[0].replace(/[._-]/g, ' ') : str;
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0]?.[0] ?? '?').toUpperCase();
  };
  const displayName = user?.display_name || user?.email || '';
  const initials = getInitials(displayName);

  const notesThisMonth = notes.filter((n) => {
    const noteDate = new Date(n.created_at);
    const now = new Date();
    return noteDate.getMonth() === now.getMonth() && noteDate.getFullYear() === now.getFullYear();
  }).length;

  const totalDuration = notes.reduce((acc, n) => acc + (n.audio_duration || 0), 0);
  const totalTasks = notes.reduce((acc, n) => acc + (n.tasks?.length || 0), 0);
  const totalConversations = notes.filter((n) => n.is_conversation && n.speakers_detected > 1).length;

  const dailyUsed = user?.daily_count ?? 0;
  const dailyMax = LIMITS.FREE_DAILY_NOTES;
  const dailyProgress = Math.min(dailyUsed / dailyMax, 1);
  const dailyBarColor =
    dailyProgress < 0.5 ? COLORS.success : dailyProgress < 0.9 ? COLORS.warning : COLORS.error;

  // Build stat values array (matching STAT_CARD_STYLES order)
  const statValues: string[] = [
    String(notes.length),
    totalDuration >= 3600
      ? `${Math.floor(totalDuration / 3600)}h ${Math.floor((totalDuration % 3600) / 60)}m`
      : formatDurationLong(totalDuration),
    String(totalTasks),
    String(totalConversations),
    String(notesThisMonth),
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Animated.View entering={FadeInUp.delay(50).duration(500)} style={styles.header}>
          <Text style={styles.headerTitle}>Perfil</Text>
        </Animated.View>

        {/* Avatar + identity */}
        <View style={styles.profileSection}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
          ) : (
            <LinearGradient
              colors={['#0B0B0B', '#2A2A2A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarCircle}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </LinearGradient>
          )}

          <Animated.Text entering={FadeInUp.delay(150).duration(400)} style={styles.name}>
            {displayName}
          </Animated.Text>
          {user?.display_name && user?.email ? (
            <Animated.Text entering={FadeInUp.delay(180).duration(400)} style={styles.emailSub}>
              {user.email}
            </Animated.Text>
          ) : null}

          <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.planBadge}>
            <Ionicons
              name={user?.plan === 'premium' ? 'diamond' : 'leaf'}
              size={14}
              color="#8FD3FF"
            />
            <Text style={styles.planText}>
              {user?.plan === 'premium' ? 'Premium' : 'Plan gratuito'}
            </Text>
          </Animated.View>
        </View>

        {/* Stats grid: 2 columns */}
        <View style={styles.statsGrid}>
          {STAT_CARD_STYLES.map((card, index) => (
            <Animated.View
              key={card.labelKey}
              entering={cardEntry(index)}
              style={[styles.statCard, { backgroundColor: card.bg }]}
            >
              <View style={styles.statIconWrap}>
                <Ionicons name={card.icon} size={22} color={card.iconColor} />
              </View>
              <AnimatedCounter value={statValues[index]} style={styles.statNumber} />
              <Text style={styles.statLabel}>{card.labelKey}</Text>
            </Animated.View>
          ))}
        </View>

        {/* Daily usage bar */}
        {user?.plan === 'free' && (
          <Animated.View entering={cardEntry(5)} style={styles.usageCard}>
            <View style={styles.usageHeader}>
              <Text style={styles.usageTitle}>Uso de hoy</Text>
              <Text style={styles.usageCount}>
                {dailyUsed}/{dailyMax}
              </Text>
            </View>
            <View style={styles.usageBarBg}>
              <View
                style={[
                  styles.usageBarFill,
                  {
                    width: `${dailyProgress * 100}%`,
                    backgroundColor: dailyBarColor,
                  },
                ]}
              />
            </View>
            <Text style={styles.usageText}>
              {dailyUsed} de {dailyMax} notas gratis
            </Text>
          </Animated.View>
        )}

        {/* Premium upsell */}
        {user?.plan === 'free' && (
          <Animated.View entering={cardEntry(6)}>
            <View style={styles.premiumCard}>
              <View style={styles.premiumHeader}>
                <Ionicons name="diamond" size={24} color="#8FD3FF" />
                <Text style={styles.premiumTitle}>Sythio Premium</Text>
              </View>
              <View style={styles.premiumBenefits}>
                <BenefitRow text="Audios ilimitados por día" />
                <BenefitRow text="Audios de hasta 30 minutos" />
                <BenefitRow text="Exportación avanzada por modo" />
                <BenefitRow text="Todos los modos de salida" />
              </View>
              <AnimatedPressable
                style={styles.premiumButton}
                onPress={() => {
                  hapticPaywallOpen();
                  track('premium_cta_tapped', { source: 'profile' });
                  setShowPaywall(true);
                }}
              >
                <Text style={styles.premiumButtonText}>Ver planes</Text>
              </AnimatedPressable>
            </View>
          </Animated.View>
        )}

        {/* 2FA section */}
        <Animated.View entering={cardEntry(7)} style={[styles.accountCard, { borderColor: colors.border }]}>
          <Text style={[styles.accountTitle, { color: colors.textPrimary }]}>Seguridad</Text>
          {mfaQr ? (
            <View style={{ alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 18 }}>
                Escanea este código QR con tu app de autenticación (Google Authenticator, Authy, etc.)
              </Text>
              <Image source={{ uri: mfaQr }} style={{ width: 200, height: 200, borderRadius: 12 }} />
              <TextInput
                style={{
                  width: '100%', height: 48, borderWidth: 1.5, borderColor: COLORS.border,
                  borderRadius: 12, paddingHorizontal: 14, fontSize: 20, fontWeight: '600',
                  textAlign: 'center', letterSpacing: 8, color: COLORS.textPrimary,
                }}
                placeholder="000000"
                placeholderTextColor={COLORS.textMuted}
                value={mfaCode}
                onChangeText={setMfaCode}
                keyboardType="number-pad"
                maxLength={6}
              />
              <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                <TouchableOpacity
                  onPress={() => { setMfaQr(null); setMfaCode(''); }}
                  style={{ flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleVerifyMfa}
                  disabled={mfaCode.length !== 6 || mfaLoading}
                  style={{ flex: 1, height: 44, borderRadius: 10, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', opacity: mfaCode.length !== 6 ? 0.4 : 1 }}
                >
                  {mfaLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontSize: 14, color: '#FFF', fontWeight: '600' }}>Verificar</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '500', color: COLORS.textPrimary }}>
                  Autenticación de dos factores
                </Text>
                <Text style={{ fontSize: 13, color: mfaEnabled ? COLORS.success : COLORS.textMuted, marginTop: 2 }}>
                  {mfaEnabled ? 'Activada' : 'No activada'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={mfaEnabled ? handleDisableMfa : handleEnableMfa}
                disabled={mfaLoading}
                style={{
                  paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
                  backgroundColor: mfaEnabled ? COLORS.surfaceAlt : COLORS.primary,
                }}
              >
                {mfaLoading ? (
                  <ActivityIndicator size="small" color={mfaEnabled ? COLORS.textSecondary : '#FFF'} />
                ) : (
                  <Text style={{ fontSize: 13, fontWeight: '600', color: mfaEnabled ? COLORS.textSecondary : '#FFF' }}>
                    {mfaEnabled ? 'Desactivar' : 'Activar'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>

        {/* Vocabulary section */}
        <Animated.View entering={cardEntry(7)} style={[styles.accountCard, { borderColor: colors.border }]}>
          <Text style={[styles.accountTitle, { color: colors.textPrimary }]}>Vocabulario personalizado</Text>
          <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 12, lineHeight: 18 }}>
            Agrega nombres, términos técnicos o palabras que Sythio debe reconocer mejor al transcribir.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <TextInput
              style={{
                flex: 1, height: 42, borderWidth: 1, borderColor: COLORS.border,
                borderRadius: 10, paddingHorizontal: 12, fontSize: 15, color: COLORS.textPrimary,
              }}
              placeholder="Ej: Sythio, SCRUM, Dr. García"
              placeholderTextColor={COLORS.textMuted}
              value={vocabInput}
              onChangeText={setVocabInput}
              returnKeyType="done"
              onSubmitEditing={async () => {
                const term = vocabInput.trim();
                if (!term || !user) return;
                const current = user.custom_vocabulary ?? [];
                if (current.includes(term)) { setVocabInput(''); return; }
                const updated = [...current, term];
                setSavingVocab(true);
                await supabase.from('profiles').update({ custom_vocabulary: updated }).eq('id', user.id);
                await fetchProfile();
                setSavingVocab(false);
                setVocabInput('');
                showToast('Término agregado', 'success');
              }}
            />
            <TouchableOpacity
              onPress={async () => {
                const term = vocabInput.trim();
                if (!term || !user) return;
                const current = user.custom_vocabulary ?? [];
                if (current.includes(term)) { setVocabInput(''); return; }
                const updated = [...current, term];
                setSavingVocab(true);
                await supabase.from('profiles').update({ custom_vocabulary: updated }).eq('id', user.id);
                await fetchProfile();
                setSavingVocab(false);
                setVocabInput('');
                showToast('Término agregado', 'success');
              }}
              disabled={savingVocab || !vocabInput.trim()}
              style={{
                width: 42, height: 42, borderRadius: 10, backgroundColor: COLORS.primary,
                justifyContent: 'center', alignItems: 'center',
                opacity: savingVocab || !vocabInput.trim() ? 0.4 : 1,
              }}
            >
              {savingVocab ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="add" size={22} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
          {(user?.custom_vocabulary ?? []).length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {(user?.custom_vocabulary ?? []).map((term, i) => (
                <TouchableOpacity
                  key={`${term}-${i}`}
                  onPress={async () => {
                    if (!user) return;
                    const updated = (user.custom_vocabulary ?? []).filter((_, idx) => idx !== i);
                    await supabase.from('profiles').update({ custom_vocabulary: updated }).eq('id', user.id);
                    await fetchProfile();
                  }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: COLORS.surfaceAlt, paddingHorizontal: 10, paddingVertical: 6,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: 13, color: COLORS.textPrimary }}>{term}</Text>
                  <Ionicons name="close-circle" size={14} color={COLORS.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Animated.View>

        {/* Integrations section */}
        <Animated.View entering={cardEntry(7)} style={[styles.accountCard, { borderColor: colors.border }]}>
          <Text style={[styles.accountTitle, { color: colors.textPrimary }]}>Integraciones</Text>

          <AccountRow
            icon="logo-slack"
            label="Slack"
            color="#4A154B"
            onPress={() => setShowSlackModal(true)}
          />
          <AccountRow
            icon="calendar-outline"
            label="Google Calendar"
            color={COLORS.accentTeal}
            onPress={async () => {
              const returnUrl = Linking.createURL('/(tabs)/profile');
              const authUrl = `https://oewjbeqwihhzuvbsfctf.supabase.co/functions/v1/calendar-auth?action=authorize&user_id=${user!.id}&return_url=${encodeURIComponent(returnUrl)}`;
              await Linking.openURL(authUrl);
            }}
          />
        </Animated.View>

        {/* Account section */}
        <Animated.View entering={cardEntry(8)} style={[styles.accountCard, { borderColor: colors.border }]}>
          <Text style={[styles.accountTitle, { color: colors.textPrimary }]}>Cuenta</Text>

          <AccountRow
            icon="people-outline"
            label="Workspaces"
            color={colors.textPrimary}
            onPress={() => router.push('/workspace' as any)}
          />
          <AccountRow
            icon="shield-checkmark-outline"
            label="Privacidad y datos"
            color={colors.textPrimary}
            onPress={() => Linking.openURL(PRIVACY_URL)}
          />
          <AccountRow
            icon="document-text-outline"
            label="Términos de servicio"
            color={colors.textPrimary}
            onPress={() => Linking.openURL(TERMS_URL)}
          />
          <AccountRow
            icon="download-outline"
            label={exporting ? 'Exportando...' : 'Exportar mis datos'}
            color={colors.textPrimary}
            onPress={handleExportData}
            disabled={exporting}
          />
          <AccountRow
            icon="key-outline"
            label="API Key"
            color={colors.textPrimary}
            onPress={async () => {
              // Generate a new API key
              const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)))
                .map(b => b.toString(16).padStart(2, '0')).join('');
              const apiKey = `sk_${raw}`;
              // Hash it
              const encoder = new TextEncoder();
              const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(apiKey));
              const keyHash = Array.from(new Uint8Array(hashBuffer))
                .map(b => b.toString(16).padStart(2, '0')).join('');
              const { error } = await supabase.from('api_keys').insert({
                user_id: user!.id,
                key_hash: keyHash,
                name: 'API Key',
                permissions: ['read', 'write'],
              });
              if (error) {
                showToast('Error al generar API key', 'error');
              } else {
                await Clipboard.setStringAsync(apiKey);
                hapticCopyClipboard();
                Alert.alert('API Key generada', 'Tu API key ha sido copiada al portapapeles. Guárdala en un lugar seguro, no se puede recuperar.');
                track('api_key_generated');
              }
            }}
          />

          <View style={[styles.accountSeparator, { backgroundColor: colors.border }]} />

          <AnimatedPressable
            style={styles.logoutButton}
            onPress={handleLogout}
            accessibilityLabel="Cerrar sesión"
          >
            <Ionicons name="log-out-outline" size={20} color={COLORS.warning} />
            <Text style={[styles.accountRowLabel, { color: COLORS.warning }]}>Cerrar sesión</Text>
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.deleteAccountButton}
            onPress={handleDeleteAccount}
            accessibilityLabel="Eliminar cuenta"
          >
            <Ionicons name="trash-outline" size={20} color={COLORS.error} />
            <Text style={[styles.accountRowLabel, { color: COLORS.error }]}>Eliminar cuenta</Text>
          </AnimatedPressable>

          {__DEV__ && (
            <>
              <View style={[styles.accountSeparator, { backgroundColor: colors.border }]} />
              <AnimatedPressable
                style={styles.logoutButton}
                onPress={() => {
                  Alert.alert('Dev Reset', 'Borrar onboarding + welcome para empezar de cero?', [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Reset',
                      style: 'destructive',
                      onPress: async () => {
                        await AsyncStorage.multiRemove(['sythio_onboarding_done', 'sythio_welcome_done']);
                        await logout();
                      },
                    },
                  ]);
                }}
              >
                <Ionicons name="refresh-outline" size={20} color="#8B5CF6" />
                <Text style={[styles.accountRowLabel, { color: '#8B5CF6' }]}>Dev Reset (primera vez)</Text>
              </AnimatedPressable>
            </>
          )}
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <Paywall visible={showPaywall} onClose={() => setShowPaywall(false)} trigger="profile" />

      {/* Delete account confirmation modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Confirmar eliminación</Text>
            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              Escribe ELIMINAR para confirmar que deseas eliminar permanentemente tu cuenta y todos tus datos.
            </Text>
            <TextInput
              style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Escribe ELIMINAR"
              placeholderTextColor={colors.textMuted}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                <Text style={[styles.modalBtnText, { color: colors.textPrimary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnDelete,
                  deleteConfirmText !== 'ELIMINAR' && styles.modalBtnDisabled,
                ]}
                onPress={executeDeleteAccount}
                disabled={deleteConfirmText !== 'ELIMINAR' || deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.modalBtnDeleteText}>Eliminar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Slack modal */}
      <Modal visible={showSlackModal} transparent animationType="fade" onRequestClose={() => setShowSlackModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Conectar Slack</Text>
            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              Pega la URL del Incoming Webhook de tu workspace de Slack.{'\n\n'}
              Créalo en api.slack.com/apps → tu app → Incoming Webhooks → Add New Webhook
            </Text>
            <TextInput
              style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="https://hooks.slack.com/services/..."
              placeholderTextColor={colors.textMuted}
              value={slackUrl}
              onChangeText={setSlackUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]}
                onPress={() => { setShowSlackModal(false); setSlackUrl(''); }}
                disabled={savingSlack}
              >
                <Text style={[styles.modalBtnText, { color: colors.textPrimary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#4A154B' }, !slackUrl.startsWith('https://hooks.slack.com/') && styles.modalBtnDisabled]}
                onPress={async () => {
                  if (!slackUrl.startsWith('https://hooks.slack.com/')) {
                    showToast('URL inválida', 'error');
                    return;
                  }
                  setSavingSlack(true);
                  const { error } = await supabase.from('integrations').upsert({
                    user_id: user!.id,
                    provider: 'slack',
                    config: { webhook_url: slackUrl, notify_on: ['processing_complete'] },
                    enabled: true,
                  }, { onConflict: 'user_id,provider' });
                  setSavingSlack(false);
                  if (error) { showToast('Error al guardar', 'error'); return; }
                  showToast('Slack conectado', 'success');
                  setShowSlackModal(false);
                  setSlackUrl('');
                }}
                disabled={!slackUrl.startsWith('https://hooks.slack.com/') || savingSlack}
              >
                {savingSlack ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.modalBtnDeleteText}>Conectar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Benefit row sub-component
// ---------------------------------------------------------------------------

function BenefitRow({ text }: { text: string }) {
  return (
    <View style={styles.benefitRow}>
      <Ionicons name="checkmark-circle" size={16} color="#8FD3FF" />
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

function AccountRow({
  icon,
  label,
  color,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <AnimatedPressable style={styles.accountRow} onPress={onPress} disabled={disabled}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.accountRowLabel, { color }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },

  // -- Profile section -------------------------------------------------------
  profileSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 14,
  },
  emailSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.info + '20',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 6,
    marginTop: 8,
  },
  planText: {
    fontSize: 12,
    color: COLORS.primaryLight,
    fontWeight: '600',
  },

  // -- Stats grid (2 columns) ------------------------------------------------
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    width: '47%',
    flexGrow: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },

  // -- Usage card -------------------------------------------------------------
  usageCard: {
    marginHorizontal: 24,
    marginBottom: 20,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  usageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  usageTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  usageCount: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  usageBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  usageBarFill: {
    height: 6,
    borderRadius: 3,
  },
  usageText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 8,
  },

  // -- Premium card -----------------------------------------------------------
  premiumCard: {
    marginHorizontal: 24,
    marginBottom: 20,
    borderRadius: 18,
    padding: 24,
    backgroundColor: COLORS.primary,
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  premiumTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  premiumBenefits: {
    gap: 10,
    marginBottom: 18,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  benefitText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '400',
  },
  premiumButton: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  premiumButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // -- Theme card -------------------------------------------------------------
  themeCard: {
    marginHorizontal: 24,
    marginBottom: 20,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
  },
  themeTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  themeOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceAlt,
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },

  // -- Account card ----------------------------------------------------------
  accountCard: {
    marginHorizontal: 24,
    marginBottom: 20,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
  },
  accountTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  accountRowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  accountSeparator: {
    height: 1,
    marginVertical: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },

  // -- Delete modal ----------------------------------------------------------
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalContent: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  modalInput: {
    height: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnCancel: {
    borderWidth: 1,
  },
  modalBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalBtnDelete: {
    backgroundColor: COLORS.error,
  },
  modalBtnDisabled: {
    opacity: 0.4,
  },
  modalBtnDeleteText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
