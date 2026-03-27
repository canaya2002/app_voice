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
import { hapticSelection } from '@/lib/haptics';
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
        hapticSelection();
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
        color={isSelected ? '#FFFFFF' : '#B8BCC4'}
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
        hapticSelection();
        onPress(id);
      }}
      activeOpacity={0.7}
      accessibilityLabel={`Plantilla: ${label}`}
      accessibilityState={{ selected: isSelected }}
    >
      {isSelected && (
        <View style={styles.checkBadge}>
          <Ionicons name="checkmark-circle" size={16} color='#0B0B0B' />
        </View>
      )}
      <Ionicons
        name={icon as keyof typeof Ionicons.glyphMap}
        size={24}
        color={isSelected ? '#0B0B0B' : '#B8BCC4'}
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
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1.5,
  },
  chipSelected: {
    backgroundColor: '#0B0B0B',
    borderColor: '#0B0B0B',
  },
  chipDefault: {
    backgroundColor: '#F5F7FA',
    borderColor: 'transparent',
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  chipLabelSelected: {
    color: '#FFFFFF',
  },
  chipLabelDefault: {
    color: '#8A8F98',
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
    borderWidth: 1,
    alignItems: 'center',
    position: 'relative',
  },
  gridCardSelected: {
    backgroundColor: '#F5F7FA',
    borderColor: '#0B0B0B',
  },
  gridCardDefault: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EBEDF0',
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  gridLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0B0B0B',
    marginTop: 8,
    textAlign: 'center',
  },
  gridLabelSelected: {
    color: '#0B0B0B',
  },
  gridDescription: {
    fontSize: 10,
    color: '#B8BCC4',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 13,
  },
});
