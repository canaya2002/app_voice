import React, { useState, useEffect as useEffectHook } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
  FadeInUp,
} from 'react-native-reanimated';
import { COLORS, LIMITS, useThemeColors } from '@/lib/constants';
import { FONT } from '@/lib/styles';
import { cardEntry } from '@/lib/animations';
import { track } from '@/lib/analytics';
import Paywall from '@/components/Paywall';
import AnimatedPressable from '@/components/AnimatedPressable';
import { useAuthStore } from '@/stores/authStore';
import { useNotesStore } from '@/stores/notesStore';
import { hapticPaywallOpen } from '@/lib/haptics';
import { formatDurationLong } from '@/lib/audio';

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
// Stat card config
// ---------------------------------------------------------------------------

interface StatCardConfig {
  bg: string;
  iconColor: string;
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: string;
}

const STAT_CARDS: StatCardConfig[] = [
  { bg: COLORS.surfaceAlt, iconColor: COLORS.textPrimary, icon: 'mic', labelKey: 'Notas' },
  { bg: COLORS.surfaceAlt, iconColor: COLORS.textPrimary, icon: 'time', labelKey: 'Tiempo' },
  { bg: COLORS.surfaceAlt, iconColor: COLORS.textPrimary, icon: 'checkbox', labelKey: 'Tareas' },
  { bg: COLORS.surfaceAlt, iconColor: COLORS.textPrimary, icon: 'chatbubbles', labelKey: 'Conversaciones' },
  { bg: COLORS.surfaceAlt, iconColor: COLORS.textPrimary, icon: 'calendar', labelKey: 'Este mes' },
];

// ---------------------------------------------------------------------------
// Glass wrapper
// ---------------------------------------------------------------------------

function GlassCard({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.glassCard, style]}>
      {Platform.OS === 'ios' && (
        <BlurView tint="light" intensity={40} style={StyleSheet.absoluteFill} />
      )}
      <View style={[StyleSheet.absoluteFill, styles.glassOverlay]} />
      <View style={styles.glassContent}>{children}</View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  if (__DEV__) console.log('[profile] loading');
  const colors = useThemeColors();
  const [showPaywall, setShowPaywall] = useState(false);
  const { user } = useAuthStore();
  const { notes } = useNotesStore();

  const getInitials = (str: string): string => {
    const clean = str.includes('@') ? str.split('@')[0].replace(/[._-]/g, ' ') : str;
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0]?.[0] ?? '?').toUpperCase();
  };

  const displayName = user?.display_name || user?.email || '';
  const initials = getInitials(displayName);

  const notesThisMonth = notes.filter((n) => {
    const d = new Date(n.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const totalDuration = notes.reduce((acc, n) => acc + (n.audio_duration || 0), 0);
  const totalTasks = notes.reduce((acc, n) => acc + (n.tasks?.length || 0), 0);
  const totalConversations = notes.filter((n) => n.is_conversation && n.speakers_detected > 1).length;

  const dailyUsed = user?.daily_count ?? 0;
  const dailyMax = LIMITS.FREE_DAILY_NOTES;
  const dailyProgress = Math.min(dailyUsed / dailyMax, 1);
  const dailyBarColor =
    dailyProgress < 0.5 ? COLORS.success : dailyProgress < 0.9 ? COLORS.warning : COLORS.error;

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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Animated.View entering={FadeInUp.delay(50).duration(500)} style={styles.header}>
          <Text style={styles.headerTitle}>Perfil</Text>
        </Animated.View>

        {/* Avatar + identity — glassmorphic hero card */}
        <GlassCard style={styles.heroCard}>
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
        </GlassCard>

        {/* Stats grid: 2 columns */}
        <View style={styles.statsGrid}>
          {STAT_CARDS.map((card, index) => (
            <Animated.View
              key={card.labelKey}
              entering={cardEntry(index)}
              style={styles.statCard}
            >
              <View style={[styles.statIconWrap, { backgroundColor: card.bg }]}>
                <Ionicons name={card.icon} size={22} color={card.iconColor} />
              </View>
              <AnimatedCounter value={statValues[index]} style={styles.statNumber} />
              <Text style={styles.statLabel}>{card.labelKey}</Text>
            </Animated.View>
          ))}
        </View>

        {/* Daily usage bar */}
        {user?.plan === 'free' && (
          <Animated.View entering={cardEntry(5)}>
            <GlassCard style={styles.usageOuter}>
              <View style={styles.usageHeader}>
                <Text style={styles.usageTitle}>Uso de hoy</Text>
                <Text style={styles.usageCount}>{dailyUsed}/{dailyMax}</Text>
              </View>
              <View style={styles.usageBarBg}>
                <View
                  style={[styles.usageBarFill, { width: `${dailyProgress * 100}%`, backgroundColor: dailyBarColor }]}
                />
              </View>
              <Text style={styles.usageText}>{dailyUsed} de {dailyMax} notas gratis</Text>
            </GlassCard>
          </Animated.View>
        )}

        {/* Premium upsell */}
        {user?.plan === 'free' && (
          <Animated.View entering={cardEntry(6)} style={styles.premiumOuter}>
            <LinearGradient
              colors={['#0B0B0B', '#1A2A3A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.premiumCard}
            >
              <View style={styles.premiumHeader}>
                <Ionicons name="diamond" size={24} color="#8FD3FF" />
                <Text style={styles.premiumTitle}>Sythio Premium</Text>
              </View>
              <View style={styles.premiumBenefits}>
                {['Audios ilimitados por dia', 'Audios de hasta 30 minutos', 'Exportacion avanzada por modo', 'Todos los modos de salida'].map((text) => (
                  <View key={text} style={styles.benefitRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#8FD3FF" />
                    <Text style={styles.benefitText}>{text}</Text>
                  </View>
                ))}
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
            </LinearGradient>
          </Animated.View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <Paywall visible={showPaywall} onClose={() => setShowPaywall(false)} trigger="profile" />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 120 },
  header: { paddingHorizontal: 24, paddingVertical: 12 },
  headerTitle: { fontSize: 28, fontFamily: FONT.bold, color: COLORS.textPrimary, letterSpacing: -0.5 },

  // Glass card
  glassCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(143, 211, 255, 0.12)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 16 },
      android: { elevation: 3 },
    }),
  },
  glassOverlay: { backgroundColor: 'rgba(255, 255, 255, 0.85)' },
  glassContent: { padding: 20 },

  // Hero card
  heroCard: { marginHorizontal: 24, marginBottom: 20, alignItems: 'center' },

  avatarCircle: {
    width: 88, height: 88, borderRadius: 44,
    justifyContent: 'center', alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  avatarImage: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 3, borderColor: 'rgba(143, 211, 255, 0.3)',
  },
  avatarText: { fontSize: 24, fontFamily: FONT.bold, color: '#FFFFFF' },
  name: { fontSize: 20, fontFamily: FONT.bold, color: COLORS.textPrimary, marginTop: 14, textAlign: 'center' },
  emailSub: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center' },
  planBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(143, 211, 255, 0.12)',
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, gap: 6, marginTop: 10,
  },
  planText: { fontSize: 12, fontFamily: FONT.semibold, color: COLORS.primaryLight },

  // Stats grid
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 24, gap: 10, marginBottom: 20,
  },
  statCard: {
    width: '47%', flexGrow: 1, borderRadius: 16, padding: 16, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1, borderColor: 'rgba(143, 211, 255, 0.1)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  statIconWrap: {
    width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  statNumber: { fontSize: 22, fontFamily: FONT.bold, color: COLORS.textPrimary, marginTop: 2 },
  statLabel: { fontSize: 11, fontFamily: FONT.medium, color: COLORS.textSecondary, marginTop: 2 },

  // Usage card
  usageOuter: { marginHorizontal: 24, marginBottom: 20 },
  usageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  usageTitle: { fontSize: 14, fontFamily: FONT.semibold, color: COLORS.textPrimary },
  usageCount: { fontSize: 13, fontFamily: FONT.bold, color: COLORS.textSecondary },
  usageBarBg: { height: 6, borderRadius: 3, backgroundColor: COLORS.border, overflow: 'hidden' },
  usageBarFill: { height: 6, borderRadius: 3 },
  usageText: { fontSize: 12, fontFamily: FONT.regular, color: COLORS.textMuted, marginTop: 8 },

  // Premium card
  premiumOuter: { marginHorizontal: 24, marginBottom: 20, borderRadius: 20, overflow: 'hidden' },
  premiumCard: { padding: 24, borderRadius: 20 },
  premiumHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  premiumTitle: { fontSize: 18, fontFamily: FONT.bold, color: '#FFFFFF' },
  premiumBenefits: { gap: 10, marginBottom: 18 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  benefitText: { fontSize: 14, fontFamily: FONT.regular, color: '#FFFFFF' },
  premiumButton: {
    backgroundColor: 'rgba(143, 211, 255, 0.15)',
    borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(143, 211, 255, 0.3)',
  },
  premiumButtonText: { color: '#FFFFFF', fontSize: 15, fontFamily: FONT.bold },
});
