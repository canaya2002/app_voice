/**
 * Sythio State Views — Consistent empty, error, and gate states.
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/lib/constants';
import AnimatedPressable from '@/components/AnimatedPressable';
import type { OutputMode } from '@/types';

// ---------------------------------------------------------------------------
// ErrorState
// ---------------------------------------------------------------------------

interface ErrorStateProps {
  type: 'network' | 'processing' | 'unknown';
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

const ERROR_CONFIG = {
  network: {
    icon: 'cloud-offline-outline' as const,
    title: 'Sin conexión',
    message: 'Verifica tu internet e intenta de nuevo.',
  },
  processing: {
    icon: 'warning-outline' as const,
    title: 'Error al procesar',
    message: 'No pudimos procesar tu audio. Intenta de nuevo.',
  },
  unknown: {
    icon: 'alert-circle-outline' as const,
    title: 'Algo salió mal',
    message: 'Ocurrió un error inesperado.',
  },
};

export function ErrorState({ type, message, onRetry, retrying }: ErrorStateProps) {
  const config = ERROR_CONFIG[type];
  return (
    <View style={styles.center}>
      <View style={styles.errorIconCircle}>
        <Ionicons name={config.icon} size={44} color={COLORS.error} />
      </View>
      <Text style={styles.title}>{config.title}</Text>
      <Text style={styles.subtitle}>{message || config.message}</Text>
      {onRetry && (
        <AnimatedPressable style={styles.retryBtn} onPress={onRetry} disabled={retrying}>
          {retrying ? (
            <ActivityIndicator color={COLORS.primary} size="small" />
          ) : (
            <Text style={styles.retryText}>Reintentar</Text>
          )}
        </AnimatedPressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// PremiumGate
// ---------------------------------------------------------------------------

interface PremiumGateProps {
  mode: OutputMode;
  modeLabel: string;
  onUpgrade: () => void;
}

export function PremiumGate({ mode, modeLabel, onUpgrade }: PremiumGateProps) {
  return (
    <View style={styles.center}>
      <View style={styles.lockCircle}>
        <Ionicons name="lock-closed" size={26} color={COLORS.primaryLight} />
      </View>
      <Text style={styles.title}>{modeLabel}</Text>
      <Text style={styles.subtitle}>Disponible en Premium</Text>
      <AnimatedPressable style={styles.upgradeBtn} onPress={onUpgrade}>
        <Ionicons name="diamond-outline" size={16} color="#FFFFFF" />
        <Text style={styles.upgradeBtnText}>Ver Premium</Text>
      </AnimatedPressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// DailyLimitBanner
// ---------------------------------------------------------------------------

interface DailyLimitBannerProps {
  onUpgrade: () => void;
}

export function DailyLimitBanner({ onUpgrade }: DailyLimitBannerProps) {
  return (
    <View style={styles.banner}>
      <View style={styles.bannerContent}>
        <Ionicons name="alert-circle" size={20} color={COLORS.warning} />
        <Text style={styles.bannerText}>
          Has usado tus 3 notas de hoy.
        </Text>
      </View>
      <AnimatedPressable style={styles.bannerBtn} onPress={onUpgrade}>
        <Text style={styles.bannerBtnText}>Ver Premium</Text>
      </AnimatedPressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// NoteDetailSkeleton
// ---------------------------------------------------------------------------

export function NoteDetailSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      <View style={[styles.skeletonBlock, { width: '60%', height: 26 }]} />
      <View style={[styles.skeletonBlock, { width: '40%', height: 16, marginTop: 10 }]} />
      <View style={[styles.skeletonBlock, { width: '100%', height: 64, marginTop: 28 }]} />
      <View style={[styles.skeletonBlock, { width: '100%', height: 130, marginTop: 18 }]} />
      <View style={[styles.skeletonBlock, { width: '80%', height: 16, marginTop: 18 }]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 44,
    gap: 12,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14.5,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },

  // -- Error icon circle
  errorIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.error + '0A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.error + '12',
  },

  // -- Retry button
  retryBtn: {
    marginTop: 10,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceAlt,
    minWidth: 120,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // -- Lock / Premium gate
  lockCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primaryLight + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.primaryLight + '20',
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  upgradeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // -- Daily limit banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.warning + '12',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.warning + '18',
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  bannerText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: COLORS.textPrimary,
    flex: 1,
  },
  bannerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  bannerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // -- Skeleton
  skeletonContainer: {
    padding: 24,
  },
  skeletonBlock: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 10,
  },
});
