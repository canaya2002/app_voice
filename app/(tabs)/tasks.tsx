import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Platform,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOut, Layout } from 'react-native-reanimated';
import { router } from 'expo-router';
import { COLORS } from '@/lib/constants';
import { useTasksStore, useFilteredItems } from '@/stores/tasksStore';
import { hapticButtonPress, hapticSelection } from '@/lib/haptics';
import AnimatedPressable from '@/components/AnimatedPressable';
import type { ActionItem } from '@/types';

// ── Filter / Sort chips ────────────────────────────────────────────────────

type FilterStatus = 'all' | 'pending' | 'in_progress' | 'done';
type SortField = 'created_at' | 'priority' | 'due_date';

const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'done', label: 'Hechas' },
];

const SORT_OPTIONS: { value: SortField; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'created_at', label: 'Recientes', icon: 'time-outline' },
  { value: 'priority', label: 'Prioridad', icon: 'flag-outline' },
  { value: 'due_date', label: 'Fecha límite', icon: 'calendar-outline' },
];

const PRIORITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: '#FEE2E2', text: '#DC2626', label: 'Alta' },
  medium: { bg: '#FEF3C7', text: '#D97706', label: 'Media' },
  low: { bg: '#DCFCE7', text: '#16A34A', label: 'Baja' },
};

// ── Action Item Row ────────────────────────────────────────────────────────

function ActionItemRow({
  item,
  onToggle,
  onEdit,
  onDelete,
  onNavigate,
}: {
  item: ActionItem;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onNavigate: () => void;
}) {
  const isDone = item.status === 'done';
  const prio = PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium;

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(14)}
      exiting={FadeOut.duration(150)}
      layout={Layout.springify().damping(14)}
      style={[styles.itemCard, cardShadow] as any}
    >
      {/* Checkbox */}
      <TouchableOpacity onPress={onToggle} style={styles.checkbox} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <View style={[styles.checkCircle, isDone && styles.checkCircleDone]}>
          {isDone && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
        </View>
      </TouchableOpacity>

      {/* Content */}
      <View style={styles.itemContent}>
        <Text style={[styles.itemText, isDone && styles.itemTextDone]} numberOfLines={2}>
          {item.text}
        </Text>

        <View style={styles.itemMeta}>
          {/* Priority badge */}
          <View style={[styles.prioBadge, { backgroundColor: prio.bg }]}>
            <Text style={[styles.prioText, { color: prio.text }]}>{prio.label}</Text>
          </View>

          {/* Assignee */}
          {item.assignee ? (
            <View style={styles.metaChip}>
              <Ionicons name="person-outline" size={11} color={COLORS.textMuted} />
              <Text style={styles.metaText}>{item.assignee}</Text>
            </View>
          ) : null}

          {/* Due date */}
          {item.due_date ? (
            <View style={styles.metaChip}>
              <Ionicons name="calendar-outline" size={11} color={COLORS.textMuted} />
              <Text style={styles.metaText}>{item.due_date}</Text>
            </View>
          ) : null}

          {/* Source note */}
          {item.note_title ? (
            <TouchableOpacity onPress={onNavigate} style={styles.metaChip}>
              <Ionicons name="document-outline" size={11} color={COLORS.primaryLight} />
              <Text style={[styles.metaText, { color: COLORS.primaryLight }]} numberOfLines={1}>
                {item.note_title}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.itemActions}>
        <TouchableOpacity onPress={onEdit} hitSlop={8}>
          <Ionicons name="create-outline" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={COLORS.error} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ── Edit Modal (inline) ────────────────────────────────────────────────────

function EditSheet({
  item,
  onSave,
  onCancel,
}: {
  item: ActionItem;
  onSave: (updates: Partial<ActionItem>) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(item.text);
  const [priority, setPriority] = useState(item.priority);
  const [assignee, setAssignee] = useState(item.assignee ?? '');
  const [dueDate, setDueDate] = useState(item.due_date ?? '');
  const [status, setStatus] = useState(item.status);

  const handleSave = () => {
    onSave({
      text: text.trim() || item.text,
      priority,
      assignee: assignee.trim() || null,
      due_date: dueDate.trim() || null,
      status,
    });
  };

  return (
    <Animated.View entering={FadeInDown.springify().damping(14)} style={styles.editSheet}>
      <View style={styles.editHeader}>
        <Text style={styles.editTitle}>Editar tarea</Text>
        <TouchableOpacity onPress={onCancel}>
          <Ionicons name="close" size={22} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.editInput}
        value={text}
        onChangeText={setText}
        placeholder="Descripción de la tarea"
        placeholderTextColor={COLORS.textMuted}
        multiline
      />

      {/* Priority selector */}
      <Text style={styles.editLabel}>Prioridad</Text>
      <View style={styles.editChipRow}>
        {(['high', 'medium', 'low'] as const).map((p) => {
          const c = PRIORITY_COLORS[p];
          const active = priority === p;
          return (
            <TouchableOpacity
              key={p}
              onPress={() => { hapticSelection(); setPriority(p); }}
              style={[styles.editChip, active && { backgroundColor: c.bg, borderColor: c.text }]}
            >
              <Text style={[styles.editChipText, active && { color: c.text, fontWeight: '600' }]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Status selector */}
      <Text style={styles.editLabel}>Estado</Text>
      <View style={styles.editChipRow}>
        {FILTER_OPTIONS.filter(f => f.value !== 'all').map((f) => {
          const active = status === f.value;
          return (
            <TouchableOpacity
              key={f.value}
              onPress={() => { hapticSelection(); setStatus(f.value as ActionItem['status']); }}
              style={[styles.editChip, active && { backgroundColor: COLORS.primaryPale, borderColor: COLORS.primaryLight }]}
            >
              <Text style={[styles.editChipText, active && { color: COLORS.primaryLight, fontWeight: '600' }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Assignee */}
      <Text style={styles.editLabel}>Asignado a</Text>
      <TextInput
        style={styles.editInputSmall}
        value={assignee}
        onChangeText={setAssignee}
        placeholder="Nombre (opcional)"
        placeholderTextColor={COLORS.textMuted}
      />

      {/* Due date */}
      <Text style={styles.editLabel}>Fecha límite</Text>
      <TextInput
        style={styles.editInputSmall}
        value={dueDate}
        onChangeText={setDueDate}
        placeholder="YYYY-MM-DD (opcional)"
        placeholderTextColor={COLORS.textMuted}
      />

      <AnimatedPressable onPress={handleSave} style={styles.editSaveBtn}>
        <Text style={styles.editSaveBtnText}>Guardar</Text>
      </AnimatedPressable>
    </Animated.View>
  );
}

// ── New Task Sheet ─────────────────────────────────────────────────────────

function NewTaskSheet({ onSave, onCancel }: { onSave: (text: string, priority: 'high' | 'medium' | 'low') => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');

  return (
    <Animated.View entering={FadeInDown.springify().damping(14)} style={styles.editSheet}>
      <View style={styles.editHeader}>
        <Text style={styles.editTitle}>Nueva tarea</Text>
        <TouchableOpacity onPress={onCancel}>
          <Ionicons name="close" size={22} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.editInput}
        value={text}
        onChangeText={setText}
        placeholder="¿Qué hay que hacer?"
        placeholderTextColor={COLORS.textMuted}
        multiline
        autoFocus
      />

      <View style={styles.editChipRow}>
        {(['high', 'medium', 'low'] as const).map((p) => {
          const c = PRIORITY_COLORS[p];
          const active = priority === p;
          return (
            <TouchableOpacity
              key={p}
              onPress={() => { hapticSelection(); setPriority(p); }}
              style={[styles.editChip, active && { backgroundColor: c.bg, borderColor: c.text }]}
            >
              <Text style={[styles.editChipText, active && { color: c.text, fontWeight: '600' }]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <AnimatedPressable
        onPress={() => { if (text.trim()) onSave(text.trim(), priority); }}
        disabled={!text.trim()}
        style={[styles.editSaveBtn, !text.trim() && { opacity: 0.4 }]}
      >
        <Text style={styles.editSaveBtnText}>Crear</Text>
      </AnimatedPressable>
    </Animated.View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const { fetchItems, toggleDone, updateItem, deleteItem, createItem, setFilter, setSort, filter, sort } = useTasksStore();
  const items = useFilteredItems();
  const loading = useTasksStore((s) => s.loading);

  const [editingItem, setEditingItem] = useState<ActionItem | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchItems(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchItems();
    setRefreshing(false);
  }, [fetchItems]);

  const handleDelete = (item: ActionItem) => {
    Alert.alert('Eliminar tarea', `¿Eliminar "${item.text.slice(0, 60)}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => deleteItem(item.id) },
    ]);
  };

  const handleEditSave = (updates: Partial<ActionItem>) => {
    if (!editingItem) return;
    updateItem(editingItem.id, updates);
    setEditingItem(null);
  };

  const handleNewSave = async (text: string, priority: 'high' | 'medium' | 'low') => {
    await createItem({ text, priority, assignee: null, due_date: null, note_id: null, source_quote: null });
    setShowNew(false);
    hapticButtonPress();
  };

  // ── Stats ──
  const allItems = useTasksStore((s) => s.items);
  const pendingCount = allItems.filter((i) => i.status === 'pending').length;
  const inProgressCount = allItems.filter((i) => i.status === 'in_progress').length;
  const doneCount = allItems.filter((i) => i.status === 'done').length;

  const renderItem = ({ item }: { item: ActionItem }) => (
    <ActionItemRow
      item={item}
      onToggle={() => { hapticSelection(); toggleDone(item.id); }}
      onEdit={() => setEditingItem(item)}
      onDelete={() => handleDelete(item)}
      onNavigate={() => {
        if (item.note_id) router.push(`/note/${item.note_id}`);
      }}
    />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Tareas</Text>
        <AnimatedPressable
          onPress={() => { hapticButtonPress(); setShowNew(true); }}
          style={styles.addBtn}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </AnimatedPressable>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pendientes</Text>
        </View>
        <View style={[styles.statItem, styles.statDivider]}>
          <Text style={styles.statNumber}>{inProgressCount}</Text>
          <Text style={styles.statLabel}>En progreso</Text>
        </View>
        <View style={[styles.statItem, styles.statDivider]}>
          <Text style={[styles.statNumber, { color: COLORS.success }]}>{doneCount}</Text>
          <Text style={styles.statLabel}>Completadas</Text>
        </View>
      </View>

      {/* Filter chips */}
      <View style={styles.chipSection}>
        <View style={styles.chipRow}>
          {FILTER_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => { hapticSelection(); setFilter(opt.value); }}
              style={[styles.chip, filter === opt.value && styles.chipActive]}
            >
              <Text style={[styles.chipText, filter === opt.value && styles.chipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sort selector */}
        <View style={styles.chipRow}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => { hapticSelection(); setSort(opt.value); }}
              style={[styles.sortChip, sort === opt.value && styles.sortChipActive]}
            >
              <Ionicons
                name={opt.icon}
                size={13}
                color={sort === opt.value ? COLORS.primaryLight : COLORS.textMuted}
              />
              <Text style={[styles.sortText, sort === opt.value && styles.sortTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* New task sheet */}
      {showNew && (
        <NewTaskSheet onSave={handleNewSave} onCancel={() => setShowNew(false)} />
      )}

      {/* Edit sheet */}
      {editingItem && (
        <EditSheet
          item={editingItem}
          onSave={handleEditSave}
          onCancel={() => setEditingItem(null)}
        />
      )}

      {/* List */}
      {items.length === 0 && !loading ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="checkbox-outline" size={40} color={COLORS.primaryLight} />
          </View>
          <Text style={styles.emptyTitle}>Sin tareas aún</Text>
          <Text style={styles.emptyDesc}>
            Las tareas extraídas de tus notas de voz aparecerán aquí. También puedes crear tareas manualmente.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: 120 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primaryLight} />
          }
        />
      )}
    </View>
  );
}

// ── Shadow presets (web-aligned) ───────────────────────────────────────────

const cardShadow = Platform.select<ViewStyle>({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
  android: { elevation: 2 },
  default: {},
}) as ViewStyle;

const sheetShadow = Platform.select<ViewStyle>({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
  android: { elevation: 6 },
  default: {},
}) as ViewStyle;

// ── Styles ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const styles = StyleSheet.create<any>({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...cardShadow,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    borderLeftWidth: 1,
    borderLeftColor: COLORS.borderLight,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Chips
  chipSection: {
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 9999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '550',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceAlt,
  },
  sortChipActive: {
    backgroundColor: COLORS.primaryPale,
  },
  sortText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  sortTextActive: {
    color: COLORS.primaryLight,
    fontWeight: '600',
  },

  // List
  list: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  // Item card (shadow applied inline via cardShadow)
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  checkbox: {
    marginTop: 2,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkCircleDone: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  itemContent: {
    flex: 1,
  },
  itemText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textPrimary,
    lineHeight: 21,
  },
  itemTextDone: {
    textDecorationLine: 'line-through',
    color: COLORS.textMuted,
  },
  itemMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  prioBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  prioText: {
    fontSize: 11,
    fontWeight: '600',
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 11,
    color: COLORS.textMuted,
    maxWidth: 120,
  },
  itemActions: {
    gap: 12,
    paddingTop: 2,
  },

  // Empty
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Edit sheet
  editSheet: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...sheetShadow,
  },
  editHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  editTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  editInput: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
    minHeight: 48,
    maxHeight: 100,
    marginBottom: 12,
  },
  editInputSmall: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  editLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  editChipRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  editChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.surfaceAlt,
  },
  editChipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  editSaveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  editSaveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
