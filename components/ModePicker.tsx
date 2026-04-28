/**
 * ModePicker — post-recording mode selection with hero/secondary jerarchy.
 *
 * Top: 3 hero modes as large tappable cards (Resumen / Tareas / Reporte).
 * Bottom: "Más modos" button → opens bottom sheet with 6 secondary modes.
 *
 * Different from ModeSelector: ModeSelector is for the note detail tabs (where
 * the user toggles between already-generated modes); ModePicker is for the
 * initial choice right after recording, where most users should pick one of
 * the hero options without thinking.
 */

import { useState } from 'react';
import { View, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Surface } from '@/components/primitives/Surface';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/lib/design/tokens';
import {
  HERO_MODES,
  SECONDARY_MODES,
  MODE_CONFIGS,
  isModeFreeTier,
  getModeConfig,
} from '@/lib/constants';
import type { OutputMode } from '@/types';
import * as Haptics from 'expo-haptics';
import { track } from '@/lib/analytics';

interface Props {
  selectedMode: OutputMode;
  userPlan?: 'free' | 'premium' | 'pro_plus' | 'enterprise';
  onSelect: (mode: OutputMode) => void;
  onPremiumRequired?: (mode: OutputMode) => void;
  source?: 'recording' | 'detail' | 'convert';
}

export default function ModePicker({
  selectedMode,
  userPlan = 'free',
  onSelect,
  onPremiumRequired,
  source = 'recording',
}: Props) {
  const t = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handlePick = (mode: OutputMode) => {
    Haptics.selectionAsync().catch(() => undefined);
    const isLocked = userPlan === 'free' && !isModeFreeTier(mode);
    if (isLocked) {
      onPremiumRequired?.(mode);
      return;
    }
    track('mode_selected', { mode, source, tier: HERO_MODES.includes(mode) ? 'hero' : 'secondary' });
    onSelect(mode);
    setSheetOpen(false);
  };

  return (
    <View>
      {/* Hero row */}
      <View style={styles.heroRow}>
        {HERO_MODES.map((mode, index) => {
          const cfg = getModeConfig(mode);
          const isSelected = mode === selectedMode;
          const locked = userPlan === 'free' && !isModeFreeTier(mode);
          return (
            <Animated.View
              key={mode}
              entering={FadeInUp.duration(280).delay(index * 50)}
              style={{ flex: 1 }}
            >
              <Pressable
                onPress={() => handlePick(mode)}
                style={({ pressed }) => [
                  styles.heroCard,
                  {
                    backgroundColor: isSelected ? t.accentPrimary : t.bg.elevated,
                    borderColor: isSelected ? t.accentPrimary : t.border.subtle,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
              >
                <View
                  style={[
                    styles.heroIcon,
                    {
                      backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : t.accentSubtle,
                    },
                  ]}
                >
                  <Ionicons
                    name={cfg.icon as keyof typeof Ionicons.glyphMap}
                    size={20}
                    color={isSelected ? '#FFFFFF' : t.accentPrimary}
                  />
                </View>
                <Text
                  variant="body-strong"
                  tone={isSelected ? 'inverse' : 'primary'}
                  align="center"
                  style={{ marginTop: 12 }}
                  numberOfLines={1}
                >
                  {cfg.label}
                </Text>
                <Text
                  variant="caption"
                  tone={isSelected ? 'inverse' : 'tertiary'}
                  align="center"
                  style={{ marginTop: 2, opacity: isSelected ? 0.85 : 1 }}
                  numberOfLines={2}
                >
                  {cfg.description}
                </Text>
                {locked && (
                  <View style={[styles.lockBadge, { backgroundColor: t.bg.tertiary }]}>
                    <Ionicons name="lock-closed" size={10} color={t.text.tertiary} />
                  </View>
                )}
              </Pressable>
            </Animated.View>
          );
        })}
      </View>

      {/* More modes button */}
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          setSheetOpen(true);
        }}
        style={({ pressed }) => [
          styles.moreBtn,
          {
            backgroundColor: t.bg.secondary,
            borderColor: t.border.subtle,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons name="grid-outline" size={16} color={t.text.secondary} />
        <Text variant="callout" tone="secondary" weight="semibold">
          Más modos
        </Text>
      </Pressable>

      {/* Bottom sheet */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={[styles.scrim, { backgroundColor: t.bg.scrim }]} onPress={() => setSheetOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.sheet, { backgroundColor: t.bg.elevated }]}
          >
            <View style={[styles.sheetGrip, { backgroundColor: t.border.strong }]} />
            <View style={styles.sheetHeader}>
              <Text variant="title">Todos los modos</Text>
              <Pressable onPress={() => setSheetOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={t.text.secondary} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetGrid}>
              {[...HERO_MODES, ...SECONDARY_MODES].map((mode, i) => {
                const cfg = getModeConfig(mode);
                const isSelected = mode === selectedMode;
                const locked = userPlan === 'free' && !isModeFreeTier(mode);
                return (
                  <Animated.View
                    key={mode}
                    entering={FadeIn.duration(180).delay(i * 25)}
                    style={styles.sheetCell}
                  >
                    <Pressable
                      onPress={() => handlePick(mode)}
                      style={({ pressed }) => [
                        styles.sheetCard,
                        {
                          backgroundColor: isSelected ? t.accentSubtle : t.bg.secondary,
                          borderColor: isSelected ? t.accentPrimary : t.border.subtle,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <View style={[styles.sheetIcon, { backgroundColor: t.bg.elevated }]}>
                        <Ionicons
                          name={cfg.icon as keyof typeof Ionicons.glyphMap}
                          size={20}
                          color={t.accentPrimary}
                        />
                      </View>
                      <Text variant="body-strong" style={{ marginTop: 10 }} numberOfLines={1}>
                        {cfg.label}
                      </Text>
                      <Text variant="caption" tone="secondary" style={{ marginTop: 2 }} numberOfLines={2}>
                        {cfg.description}
                      </Text>
                      {locked && (
                        <View style={[styles.sheetLock, { backgroundColor: t.bg.tertiary }]}>
                          <Ionicons name="lock-closed" size={10} color={t.text.tertiary} />
                          <Text variant="caption" tone="tertiary">Premium</Text>
                        </View>
                      )}
                    </Pressable>
                  </Animated.View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    gap: 10,
  },
  heroCard: {
    minHeight: 128,
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
  },
  // Bottom sheet
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
  },
  sheetGrip: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 8,
  },
  sheetCell: {
    width: '50%',
    padding: 6,
  },
  sheetCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 120,
    alignItems: 'flex-start',
  },
  sheetIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetLock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },
});
