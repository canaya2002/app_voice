import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, MODE_CONFIGS, isModeFreeTier } from '@/lib/constants';
import { selectionTap } from '@/lib/haptics';
import type { OutputMode } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ModeSelectorProps {
  currentMode: OutputMode;
  generatedModes: OutputMode[];
  onSelectMode: (mode: OutputMode) => void;
  onGenerateMode: (mode: OutputMode) => void;
  onPremiumRequired?: (mode: OutputMode) => void;
  userPlan?: 'free' | 'premium';
  loading?: boolean;
  loadingMode?: OutputMode | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ModeSelector({
  currentMode,
  generatedModes,
  onSelectMode,
  onGenerateMode,
  onPremiumRequired,
  userPlan = 'free',
  loading = false,
  loadingMode = null,
}: ModeSelectorProps) {
  const generatedSet = new Set(generatedModes);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.scrollView}
    >
      {MODE_CONFIGS.map((config) => {
        const isCurrent = config.id === currentMode;
        const isGenerated = generatedSet.has(config.id);
        const isLoading = loading && loadingMode === config.id;
        const isLocked = userPlan === 'free' && !isModeFreeTier(config.id) && !isGenerated;

        const handlePress = () => {
          selectionTap();
          if (isCurrent) return;
          if (isLocked) {
            onPremiumRequired?.(config.id);
            return;
          }
          if (isGenerated) {
            onSelectMode(config.id);
          } else {
            onGenerateMode(config.id);
          }
        };

        // Determine chip style variant
        const chipStyle = isCurrent
          ? styles.chipCurrent
          : isGenerated
            ? styles.chipGenerated
            : styles.chipAvailable;

        const textStyle = isCurrent
          ? styles.chipTextCurrent
          : isGenerated
            ? styles.chipTextGenerated
            : styles.chipTextAvailable;

        const iconColor = isCurrent
          ? '#FFFFFF'
          : isGenerated
            ? COLORS.primary
            : COLORS.textMuted;

        return (
          <TouchableOpacity
            key={config.id}
            style={[styles.chip, chipStyle]}
            activeOpacity={0.7}
            onPress={handlePress}
            disabled={isLoading}
            accessibilityLabel={config.label}
            accessibilityRole="button"
            accessibilityState={{ selected: isCurrent }}
          >
            {isLoading ? (
              <ActivityIndicator
                size="small"
                color={isCurrent ? '#FFFFFF' : COLORS.primary}
                style={styles.loader}
              />
            ) : (
              <View style={styles.iconContainer}>
                {isGenerated && !isCurrent && (
                  <View style={styles.checkOverlay}>
                    <Ionicons name="checkmark-circle" size={10} color={COLORS.success} />
                  </View>
                )}
                <Ionicons
                  name={config.icon as keyof typeof Ionicons.glyphMap}
                  size={16}
                  color={iconColor}
                />
              </View>
            )}

            <Text style={[styles.chipText, textStyle]} numberOfLines={1}>
              {isLocked ? '' : (!isGenerated && !isCurrent ? '+ ' : '')}
              {config.label}
            </Text>
            {isLocked && (
              <Ionicons name="lock-closed" size={10} color={COLORS.textMuted} />
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // -- Chip base --
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },

  // -- Chip variants --
  chipCurrent: {
    backgroundColor: COLORS.primary,
  },
  chipGenerated: {
    backgroundColor: COLORS.surfaceAlt,
  },
  chipAvailable: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // -- Text variants --
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextCurrent: {
    color: '#FFFFFF',
  },
  chipTextGenerated: {
    color: COLORS.primary,
  },
  chipTextAvailable: {
    color: COLORS.textMuted,
  },

  // -- Icon --
  iconContainer: {
    position: 'relative',
  },
  checkOverlay: {
    position: 'absolute',
    top: -4,
    right: -6,
    zIndex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 5,
  },

  // -- Loader --
  loader: {
    width: 16,
    height: 16,
  },
});
