import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/lib/constants';
import { hapticSelection } from '@/lib/haptics';

export type FilterOption = 'all' | 'meeting' | 'tasks' | 'ideas' | 'study' | 'conversations';

interface FilterBarProps {
  selected: FilterOption;
  onSelect: (filter: FilterOption) => void;
}

const FILTERS: { id: FilterOption; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'all', label: 'Todos', icon: 'apps-outline' },
  { id: 'meeting', label: 'Reuniones', icon: 'people-outline' },
  { id: 'tasks', label: 'Tareas', icon: 'checkbox-outline' },
  { id: 'ideas', label: 'Ideas', icon: 'bulb-outline' },
  { id: 'study', label: 'Estudio', icon: 'school-outline' },
  { id: 'conversations', label: 'Conversaciones', icon: 'chatbubbles-outline' },
];

export default function FilterBar({ selected, onSelect }: FilterBarProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      {FILTERS.map((f) => {
        const active = selected === f.id;
        return (
          <TouchableOpacity
            key={f.id}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => { hapticSelection(); onSelect(f.id); }}
            activeOpacity={0.7}
          >
            <Ionicons name={f.icon} size={14} color={active ? '#FFFFFF' : COLORS.textMuted} />
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: COLORS.borderLight,
  },
  chipActive: { backgroundColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  chipTextActive: { color: '#FFFFFF', fontWeight: '600' },
});
