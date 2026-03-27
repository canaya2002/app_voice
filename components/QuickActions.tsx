import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, getModeConfig } from '@/lib/constants';
import { cardEntry } from '@/lib/animations';
import { hapticButtonPress } from '@/lib/haptics';
import AnimatedPressable from '@/components/AnimatedPressable';
import type { OutputMode, NoteTemplate } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface QuickActionsProps {
  onAction: (mode: OutputMode, template?: NoteTemplate) => void;
}

// ---------------------------------------------------------------------------
// Action definitions
// ---------------------------------------------------------------------------

interface QuickAction {
  label: string;
  subtitle: string;
  mode: OutputMode;
  template?: NoteTemplate;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Resumir audio', subtitle: 'Lo esencial', mode: 'summary' },
  { label: 'Sacar tareas', subtitle: 'Pendientes claros', mode: 'tasks' },
  { label: 'Hacer plan', subtitle: 'Pasos concretos', mode: 'action_plan' },
  { label: 'Preparar mensaje', subtitle: 'Listo para enviar', mode: 'ready_message' },
  { label: 'Estudiar audio', subtitle: 'Material de estudio', mode: 'study' },
  { label: 'Organizar idea', subtitle: 'Estructura tu idea', mode: 'ideas' },
  { label: 'Grabar reunión', subtitle: 'Reporte ejecutivo', mode: 'executive_report', template: 'meeting' },
  { label: 'Texto limpio', subtitle: 'Sin muletillas', mode: 'clean_text' },
];

// ---------------------------------------------------------------------------
// Action card
// ---------------------------------------------------------------------------

function ActionCard({
  action,
  index,
  onPress,
}: {
  action: QuickAction;
  index: number;
  onPress: (mode: OutputMode, template?: NoteTemplate) => void;
}) {
  const modeConfig = getModeConfig(action.mode);

  return (
    <AnimatedPressable
      onPress={() => {
        hapticButtonPress();
        onPress(action.mode, action.template);
      }}
      style={styles.card}
      accessibilityLabel={action.label}
    >
      <View style={styles.iconCircle}>
        <Ionicons
          name={modeConfig.icon as keyof typeof Ionicons.glyphMap}
          size={22}
          color='#0B0B0B'
        />
      </View>
      <Text style={styles.cardLabel} numberOfLines={2}>
        {action.label}
      </Text>
      <Text style={styles.cardSubtitle} numberOfLines={1}>
        {action.subtitle}
      </Text>
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function QuickActions({ onAction }: QuickActionsProps) {
  return (
    <View style={styles.grid}>
      {QUICK_ACTIONS.map((action, index) => (
        <ActionCard
          key={action.mode + (action.template ?? '')}
          action={action}
          index={index}
          onPress={onAction}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EBEDF0',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F5F7FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0B0B0B',
    marginTop: 10,
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#B8BCC4',
    marginTop: 2,
  },
});
