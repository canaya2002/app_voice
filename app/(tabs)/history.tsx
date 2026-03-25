import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { COLORS, useThemeColors } from '@/lib/constants';
import { cardEntry } from '@/lib/animations';
import AnimatedPressable from '@/components/AnimatedPressable';
import NoteCard from '@/components/NoteCard';
import EmptyState from '@/components/EmptyState';
import { type FilterOption } from '@/components/FilterBar';
import { NoteCardSkeletonList } from '@/components/Skeleton';
import { useNotesStore } from '@/stores/notesStore';
import { useAuthStore } from '@/stores/authStore';
import { showToast } from '@/components/Toast';
import { selectionTap } from '@/lib/haptics';
import type { Note } from '@/types';

// ---------------------------------------------------------------------------
// Filter chip data
// ---------------------------------------------------------------------------

const FILTERS: { id: FilterOption; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'all', label: 'Todos', icon: 'apps-outline' },
  { id: 'meeting', label: 'Reuniones', icon: 'people-outline' },
  { id: 'tasks', label: 'Tareas', icon: 'checkbox-outline' },
  { id: 'ideas', label: 'Ideas', icon: 'bulb-outline' },
  { id: 'study', label: 'Estudio', icon: 'school-outline' },
  { id: 'conversations', label: 'Conversaciones', icon: 'chatbubbles-outline' },
];

type TimeFilter = 'any' | 'today' | 'week' | 'month';

const TIME_FILTERS: { id: TimeFilter; label: string }[] = [
  { id: 'any', label: 'Siempre' },
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Esta semana' },
  { id: 'month', label: 'Este mes' },
];

function matchesTimeFilter(dateStr: string, timeFilter: TimeFilter): boolean {
  if (timeFilter === 'any') return true;
  const now = new Date();
  const date = new Date(dateStr);
  if (timeFilter === 'today') {
    return date.toDateString() === now.toDateString();
  }
  if (timeFilter === 'week') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return date >= weekAgo;
  }
  if (timeFilter === 'month') {
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }
  return true;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function HistoryScreen() {
  const { notes, loading, fetchNotes, subscribeToNotes, deleteNote } = useNotesStore();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterOption>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('any');
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => { fetchNotes().then(() => setInitialLoad(false)); }, [fetchNotes]);
  useEffect(() => {
    if (user) { const unsub = subscribeToNotes(user.id); return unsub; }
  }, [user, subscribeToNotes]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchNotes(); setRefreshing(false); }, [fetchNotes]);

  const handleDelete = useCallback((noteId: string) => {
    Alert.alert('Eliminar nota', '¿Estás seguro? Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await deleteNote(noteId); showToast('Nota eliminada', 'info'); } },
    ]);
  }, [deleteNote]);

  const filteredNotes = notes.filter((note) => {
    // Time filter
    if (!matchesTimeFilter(note.created_at, timeFilter)) return false;
    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      const matches =
        note.title.toLowerCase().includes(q) ||
        note.summary.toLowerCase().includes(q) ||
        note.transcript.toLowerCase().includes(q) ||
        note.clean_text.toLowerCase().includes(q) ||
        note.key_points.some((p) => p.toLowerCase().includes(q)) ||
        note.tasks.some((t) => t.toLowerCase().includes(q));
      if (!matches) return false;
    }
    // Category filter
    if (filter === 'all') return true;
    if (filter === 'meeting') return note.template === 'meeting' || note.template === 'client';
    if (filter === 'tasks') return note.primary_mode === 'tasks' || note.template === 'task';
    if (filter === 'ideas') return note.primary_mode === 'ideas' || note.template === 'brainstorm' || note.template === 'quick_idea';
    if (filter === 'study') return note.primary_mode === 'study' || note.template === 'class';
    if (filter === 'conversations') return note.is_conversation && note.speakers_detected > 1;
    return true;
  });

  const renderItem = ({ item, index }: { item: Note; index: number }) => (
    <NoteCard note={item} index={index} onDelete={handleDelete} />
  );

  const colors = useThemeColors();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(50).duration(500)} style={styles.header}>
        <Text style={styles.title}>Historial</Text>
        <Text style={styles.count}>{notes.length} notas</Text>
      </Animated.View>

      {/* Search bar */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={20} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar en notas..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} onPress={() => setSearch('')} />
          )}
        </View>
      </Animated.View>

      {/* Filter chips */}
      <Animated.View entering={FadeInDown.delay(150).duration(500)}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContainer}
        >
          {FILTERS.map((f, index) => {
            const active = filter === f.id;
            return (
              <AnimatedPressable
                key={f.id}
                onPress={() => { selectionTap(); setFilter(f.id); }}
                style={[
                  styles.chip,
                  active ? styles.chipActive : styles.chipInactive,
                ]}
              >
                <Ionicons
                  name={f.icon}
                  size={14}
                  color={active ? '#FFFFFF' : COLORS.textSecondary}
                />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {f.label}
                </Text>
              </AnimatedPressable>
            );
          })}
        </ScrollView>
      </Animated.View>

      {/* Time filter chips */}
      <Animated.View entering={FadeInDown.delay(180).duration(500)}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.timeFiltersContainer}
        >
          {TIME_FILTERS.map((tf) => {
            const active = timeFilter === tf.id;
            return (
              <AnimatedPressable
                key={tf.id}
                onPress={() => { selectionTap(); setTimeFilter(tf.id); }}
                style={[styles.timeChip, active && styles.timeChipActive]}
              >
                <Text style={[styles.timeChipText, active && styles.timeChipTextActive]}>
                  {tf.label}
                </Text>
              </AnimatedPressable>
            );
          })}
        </ScrollView>
      </Animated.View>

      {/* Content */}
      {initialLoad && loading ? (
        <NoteCardSkeletonList count={5} />
      ) : filteredNotes.length === 0 ? (
        <EmptyState
          icon={search ? 'search-outline' : 'mic-outline'}
          title={search ? 'Sin resultados' : 'Tu historia empieza aquí'}
          message={search ? 'No se encontraron notas con ese texto.' : 'Graba tu primer audio y transforma tu voz en claridad.'}
          actionLabel={search ? undefined : 'Grabar ahora'}
          onAction={search ? undefined : () => router.push('/(tabs)')}
        />
      ) : (
        <FlatList
          data={filteredNotes}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={8}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primaryLight} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  count: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500',
  },

  // -- Search ----------------------------------------------------------------
  searchContainer: {
    marginHorizontal: 24,
    marginBottom: 14,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },

  // -- Filter chips -----------------------------------------------------------
  filtersContainer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 8,
  },
  timeFiltersContainer: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 6,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  timeChipActive: {
    backgroundColor: COLORS.info + '20',
  },
  timeChipText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  timeChipTextActive: {
    color: COLORS.primaryLight,
    fontWeight: '600',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
  },
  chipInactive: {
    backgroundColor: COLORS.surfaceAlt,
  },
  chipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: COLORS.background,
    fontWeight: '600',
  },

  // -- List -------------------------------------------------------------------
  list: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
});
