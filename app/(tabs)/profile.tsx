import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, LIMITS } from '@/lib/constants';
import { shadows } from '@/lib/styles';
import { cardEntry, FadeInUp, ZoomIn } from '@/lib/animations';
import AnimatedPressable from '@/components/AnimatedPressable';
import { useAuthStore } from '@/stores/authStore';
import { useNotesStore } from '@/stores/notesStore';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/Toast';
import { lightTap, errorTap } from '@/lib/haptics';
import { formatDurationLong } from '@/lib/audio';

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
  { bg: '#F0EFFF', iconColor: COLORS.primary, icon: 'mic', labelKey: 'Notas' },
  { bg: '#E1F5EE', iconColor: '#0F6E56', icon: 'time', labelKey: 'Tiempo' },
  { bg: '#FEF3C7', iconColor: '#92400E', icon: 'checkbox', labelKey: 'Tareas' },
  { bg: '#E6F1FB', iconColor: '#185FA5', icon: 'chatbubbles', labelKey: 'Conversaciones' },
  { bg: '#FBEAF0', iconColor: '#993556', icon: 'calendar', labelKey: 'Este mes' },
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const { notes } = useNotesStore();

  const handleLogout = () => {
    lightTap();
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
    errorTap();
    Alert.alert(
      'Eliminar cuenta',
      'Esta acción es irreversible. Se eliminarán todos tus datos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('delete_user');
              if (error) {
                showToast('No se pudo eliminar la cuenta', 'error');
                return;
              }
              await logout();
            } catch {
              showToast('Error al eliminar cuenta', 'error');
            }
          },
        },
      ]
    );
  };

  const initial = user?.email?.charAt(0).toUpperCase() ?? '?';

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
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Animated.View entering={FadeInUp.delay(50).duration(500)} style={styles.header}>
          <Text style={styles.headerTitle}>Perfil</Text>
        </Animated.View>

        {/* Avatar + identity */}
        <View style={styles.profileSection}>
          <Animated.View entering={ZoomIn.springify().damping(12).stiffness(180)}>
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryLight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarGradient}
            >
              <View style={styles.avatarInner}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
            </LinearGradient>
          </Animated.View>

          <Animated.Text entering={FadeInUp.delay(150).duration(400)} style={styles.name}>
            {user?.email ?? ''}
          </Animated.Text>

          <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.planBadge}>
            <Ionicons
              name={user?.plan === 'premium' ? 'diamond' : 'leaf'}
              size={14}
              color={COLORS.primary}
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
              <View style={[styles.statIconWrap, { backgroundColor: card.iconColor + '18' }]}>
                <Ionicons name={card.icon} size={22} color={card.iconColor} />
              </View>
              <Text style={styles.statNumber}>{statValues[index]}</Text>
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
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.premiumCard}
            >
              <View style={styles.premiumHeader}>
                <Ionicons name="diamond" size={24} color="#FFD700" />
                <Text style={styles.premiumTitle}>VoiceNotes Premium</Text>
              </View>
              <View style={styles.premiumBenefits}>
                <BenefitRow text="Notas ilimitadas por día" />
                <BenefitRow text="Transcripciones más largas (30 min)" />
                <BenefitRow text="Exportación avanzada" />
                <BenefitRow text="Sin marca de agua en PDFs" />
              </View>
              <AnimatedPressable
                style={styles.premiumButton}
                onPress={() => {}}
              >
                <Text style={styles.premiumButtonText}>Próximamente</Text>
              </AnimatedPressable>
            </LinearGradient>
          </Animated.View>
        )}

        {/* Actions */}
        <View style={styles.actionsSection}>
          <AnimatedPressable
            style={styles.logoutButton}
            onPress={handleLogout}
            accessibilityLabel="Cerrar sesión"
          >
            <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.deleteAccountButton}
            onPress={handleDeleteAccount}
            accessibilityLabel="Eliminar cuenta"
          >
            <Text style={styles.deleteAccountText}>Eliminar cuenta</Text>
          </AnimatedPressable>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Benefit row sub-component
// ---------------------------------------------------------------------------

function BenefitRow({ text }: { text: string }) {
  return (
    <View style={styles.benefitRow}>
      <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
      <Text style={styles.benefitText}>{text}</Text>
    </View>
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
    paddingBottom: 20,
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
  avatarGradient: {
    width: 92,
    height: 92,
    borderRadius: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.primary,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 14,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 6,
    marginTop: 8,
  },
  planText: {
    fontSize: 12,
    color: COLORS.primary,
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
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 20,
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
    ...shadows.sm,
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
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  usageBarFill: {
    height: 8,
    borderRadius: 4,
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
    borderRadius: 22,
    padding: 24,
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
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '400',
  },
  premiumButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  premiumButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // -- Actions ---------------------------------------------------------------
  actionsSection: {
    paddingHorizontal: 24,
    gap: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  logoutText: {
    fontSize: 16,
    color: COLORS.error,
    fontWeight: '500',
  },
  deleteAccountButton: {
    paddingVertical: 8,
  },
  deleteAccountText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '400',
  },
});
