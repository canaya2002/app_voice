import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TEMPLATE_CONFIGS } from '@/lib/constants';
import { selectionTap } from '@/lib/haptics';
import AnimatedPressable from '@/components/AnimatedPressable';
import type { NoteTemplate } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TemplateSelectorProps {
  selected: NoteTemplate;
  onSelect: (template: NoteTemplate) => void;
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Compact chip (horizontal scroll)
// ---------------------------------------------------------------------------

function CompactChip({
  id,
  label,
  icon,
  isSelected,
  onPress,
}: {
  id: NoteTemplate;
  label: string;
  icon: string;
  isSelected: boolean;
  onPress: (id: NoteTemplate) => void;
}) {
  return (
    <AnimatedPressable
      onPress={() => {
        selectionTap();
        onPress(id);
      }}
      style={[
        styles.chip,
        isSelected ? styles.chipSelected : styles.chipDefault,
      ]}
      accessibilityLabel={`Plantilla: ${label}`}
    >
      <Ionicons
        name={icon as keyof typeof Ionicons.glyphMap}
        size={16}
        color={isSelected ? COLORS.primary : COLORS.textSecondary}
      />
      <Text
        style={[
          styles.chipLabel,
          isSelected ? styles.chipLabelSelected : styles.chipLabelDefault,
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------
// Grid card (full view)
// ---------------------------------------------------------------------------

function GridCard({
  id,
  label,
  icon,
  description,
  isSelected,
  onPress,
}: {
  id: NoteTemplate;
  label: string;
  icon: string;
  description: string;
  isSelected: boolean;
  onPress: (id: NoteTemplate) => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.gridCard,
        isSelected ? styles.gridCardSelected : styles.gridCardDefault,
      ]}
      onPress={() => {
        selectionTap();
        onPress(id);
      }}
      activeOpacity={0.7}
      accessibilityLabel={`Plantilla: ${label}`}
      accessibilityState={{ selected: isSelected }}
    >
      {isSelected && (
        <View style={styles.checkBadge}>
          <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
        </View>
      )}
      <Ionicons
        name={icon as keyof typeof Ionicons.glyphMap}
        size={24}
        color={isSelected ? COLORS.primary : COLORS.primaryLight}
      />
      <Text
        style={[
          styles.gridLabel,
          isSelected && styles.gridLabelSelected,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text style={styles.gridDescription} numberOfLines={2}>
        {description}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TemplateSelector({
  selected,
  onSelect,
  compact = true,
}: TemplateSelectorProps) {
  if (compact) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScrollContent}
      >
        {TEMPLATE_CONFIGS.map((template) => (
          <CompactChip
            key={template.id}
            id={template.id}
            label={template.label}
            icon={template.icon}
            isSelected={selected === template.id}
            onPress={onSelect}
          />
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.grid}>
      {TEMPLATE_CONFIGS.map((template) => (
        <GridCard
          key={template.id}
          id={template.id}
          label={template.label}
          icon={template.icon}
          description={template.description}
          isSelected={selected === template.id}
          onPress={onSelect}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // -- Compact (horizontal scroll) -------------------------------------------
  chipScrollContent: {
    paddingHorizontal: 24,
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 8,
    borderWidth: 1.5,
  },
  chipSelected: {
    backgroundColor: COLORS.surfaceAlt,
    borderColor: COLORS.primary,
  },
  chipDefault: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  chipLabelSelected: {
    color: COLORS.primary,
  },
  chipLabelDefault: {
    color: COLORS.textSecondary,
  },

  // -- Grid (full view) ------------------------------------------------------
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 10,
  },
  gridCard: {
    width: '31%',
    minWidth: 100,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    position: 'relative',
  },
  gridCardSelected: {
    backgroundColor: COLORS.surfaceAlt,
    borderColor: COLORS.primary,
  },
  gridCardDefault: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.borderLight,
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  gridLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 8,
    textAlign: 'center',
  },
  gridLabelSelected: {
    color: COLORS.primary,
  },
  gridDescription: {
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 13,
  },
});
