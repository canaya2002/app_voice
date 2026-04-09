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
  Modal,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
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
import { hapticSelection, hapticButtonPress } from '@/lib/haptics';
import { exportPDF } from '@/lib/export';
import type { Note, Folder } from '@/types';

const FOLDER_COLORS = ['#8FD3FF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5856D6', '#FF2D55', '#A2845E'];

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
  if (__DEV__) console.log('[history] loading');
  const {
    notes, loading, folders, trashedNotes,
    fetchNotes, subscribeToNotes, softDeleteNote, restoreNote, permanentDeleteNote,
    fetchFolders, createFolder, deleteFolder, fetchTrashedNotes,
  } = useNotesStore();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterOption>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('any');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [showTrash, setShowTrash] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
  // Batch selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchExporting, setBatchExporting] = useState(false);

  useEffect(() => {
    Promise.all([fetchNotes(), fetchFolders()]).then(() => setInitialLoad(false));
  }, [fetchNotes, fetchFolders]);
  useEffect(() => {
    if (user) { const unsub = subscribeToNotes(user.id); return unsub; }
  }, [user, subscribeToNotes]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await Promise.all([fetchNotes(), fetchFolders()]); setRefreshing(false); }, [fetchNotes, fetchFolders]);

  const handleDelete = useCallback((noteId: string) => {
    Alert.alert('Mover a papelera', 'Puedes restaurarla dentro de 30 días.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Mover', style: 'destructive', onPress: async () => { await softDeleteNote(noteId); showToast('Nota movida a papelera', 'info'); } },
    ]);
  }, [softDeleteNote]);

  const handleOpenTrash = useCallback(async () => {
    await fetchTrashedNotes();
    setShowTrash(true);
  }, [fetchTrashedNotes]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim(), newFolderColor);
    setNewFolderName('');
    setShowNewFolder(false);
    showToast('Carpeta creada', 'success');
  }, [createFolder, newFolderName, newFolderColor]);

  const toggleSelect = useCallback((noteId: string) => {
    hapticSelection();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  }, []);

  const handleBatchExport = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBatchExporting(true);
    const selected = notes.filter((n) => selectedIds.has(n.id) && n.status === 'done');
    for (const note of selected) {
      try {
        await exportPDF(note, note.primary_mode, undefined);
      } catch { /* skip errors */ }
    }
    setBatchExporting(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    showToast(`${selected.length} notas exportadas`, 'success');
  }, [selectedIds, notes]);

  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      `Eliminar ${selectedIds.size} notas`,
      'Se moverán a la papelera.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            for (const nId of selectedIds) await softDeleteNote(nId);
            setSelectMode(false);
            setSelectedIds(new Set());
            showToast(`${selectedIds.size} notas eliminadas`, 'info');
          },
        },
      ],
    );
  }, [selectedIds, softDeleteNote]);

  const handleExitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const filteredNotes = notes.filter((note) => {
    // Folder filter
    if (selectedFolder && note.folder_id !== selectedFolder) return false;
    // Time filter
    if (!matchesTimeFilter(note.created_at, timeFilter)) return false;
    // Text search with fuzzy matching (split query into words, all must match somewhere)
    if (search.trim()) {
      const words = search.toLowerCase().split(/\s+/).filter(Boolean);
      const haystack = [
        note.title, note.summary, note.transcript, note.clean_text,
        ...note.key_points, ...note.tasks,
        note.template ?? '', note.primary_mode,
        ...(note.speakers?.map(s => s.custom_name ?? s.default_name) ?? []),
        ...(note.tags ?? []),
      ].join(' ').toLowerCase();
      const matches = words.every((w) => haystack.includes(w));
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
  }).sort((a, b) => {
    // Pinned notes always at top
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return 0; // preserve existing order (created_at desc) within each group
  });

  const renderItem = ({ item, index }: { item: Note; index: number }) => {
    if (selectMode) {
      const isSelected = selectedIds.has(item.id);
      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => toggleSelect(item.id)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
          <View style={[styles.selectBox, isSelected && styles.selectBoxActive]}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
          </View>
          <View style={{ flex: 1 }}>
            <NoteCard note={item} index={index} onDelete={handleDelete} />
          </View>
        </TouchableOpacity>
      );
    }
    return (
      <NoteCard
        note={item}
        index={index}
        onDelete={handleDelete}
        onLongPress={() => { hapticSelection(); setSelectMode(true); toggleSelect(item.id); }}
      />
    );
  };

  const colors = useThemeColors();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(50).duration(500)} style={styles.header}>
        {selectMode ? (
          <>
            <AnimatedPressable onPress={handleExitSelectMode}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </AnimatedPressable>
            <Text style={styles.title}>{selectedIds.size} seleccionadas</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AnimatedPressable
                onPress={handleBatchExport}
                disabled={selectedIds.size === 0 || batchExporting}
                style={[styles.batchBtn, { backgroundColor: COLORS.primary }]}
              >
                {batchExporting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="download-outline" size={16} color="#FFF" />
                )}
              </AnimatedPressable>
              <AnimatedPressable
                onPress={handleBatchDelete}
                disabled={selectedIds.size === 0}
                style={[styles.batchBtn, { backgroundColor: COLORS.error }]}
              >
                <Ionicons name="trash-outline" size={16} color="#FFF" />
              </AnimatedPressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>Historial</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={styles.count}>{notes.length} notas</Text>
              <AnimatedPressable onPress={() => { hapticButtonPress(); setSelectMode(true); }} style={styles.trashBtn}>
                <Ionicons name="checkbox-outline" size={18} color={COLORS.textMuted} />
              </AnimatedPressable>
              <AnimatedPressable onPress={handleOpenTrash} style={styles.trashBtn}>
                <Ionicons name="trash-outline" size={18} color={COLORS.textMuted} />
              </AnimatedPressable>
            </View>
          </>
        )}
      </Animated.View>

      {/* Folder bar */}
      {folders.length > 0 && (
        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderBar}>
            <AnimatedPressable
              onPress={() => { hapticSelection(); setSelectedFolder(null); }}
              style={[styles.folderChip, !selectedFolder && styles.folderChipActive]}
            >
              <Ionicons name="apps-outline" size={12} color={!selectedFolder ? '#FFF' : COLORS.textSecondary} />
              <Text style={[styles.folderChipText, !selectedFolder && styles.folderChipTextActive]}>Todas</Text>
            </AnimatedPressable>
            {folders.map((f) => (
              <AnimatedPressable
                key={f.id}
                onPress={() => { hapticSelection(); setSelectedFolder(selectedFolder === f.id ? null : f.id); }}
                style={[styles.folderChip, selectedFolder === f.id && { backgroundColor: f.color }]}
              >
                <Ionicons name="folder" size={12} color={selectedFolder === f.id ? '#FFF' : f.color} />
                <Text style={[styles.folderChipText, selectedFolder === f.id && { color: '#FFF' }]}>{f.name}</Text>
              </AnimatedPressable>
            ))}
            <AnimatedPressable onPress={() => setShowNewFolder(true)} style={styles.folderAddBtn}>
              <Ionicons name="add" size={16} color={COLORS.textMuted} />
            </AnimatedPressable>
          </ScrollView>
        </Animated.View>
      )}
      {folders.length === 0 && (
        <View style={{ paddingHorizontal: 24, marginBottom: 4 }}>
          <AnimatedPressable onPress={() => setShowNewFolder(true)} style={styles.createFolderBtn}>
            <Ionicons name="folder-outline" size={14} color={COLORS.primaryLight} />
            <Text style={{ fontSize: 13, color: COLORS.primaryLight, fontWeight: '500' }}>Crear carpeta</Text>
          </AnimatedPressable>
        </View>
      )}

      {/* Search bar */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={20} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar en notas, transcripciones, tags..."
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
                onPress={() => { hapticSelection(); setFilter(f.id); }}
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
                onPress={() => { hapticSelection(); setTimeFilter(tf.id); }}
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

      {/* Trash Modal */}
      <Modal visible={showTrash} animationType="slide" onRequestClose={() => setShowTrash(false)}>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.trashHeader}>
            <AnimatedPressable onPress={() => setShowTrash(false)}>
              <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
            </AnimatedPressable>
            <Text style={styles.trashTitle}>Papelera</Text>
            <View style={{ width: 24 }} />
          </View>
          {trashedNotes.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
              <Ionicons name="trash-outline" size={48} color={COLORS.borderLight} />
              <Text style={{ fontSize: 17, fontWeight: '600', color: COLORS.textSecondary, marginTop: 16 }}>Papelera vacía</Text>
              <Text style={{ fontSize: 14, color: COLORS.textMuted, marginTop: 4, textAlign: 'center' }}>Las notas eliminadas aparecen aquí por 30 días.</Text>
            </View>
          ) : (
            <FlatList
              data={trashedNotes}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 24 }}
              renderItem={({ item }) => (
                <View style={styles.trashCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.trashCardTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.trashCardMeta}>
                      Eliminada {item.deleted_at ? new Date(item.deleted_at).toLocaleDateString('es-ES') : ''}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={async () => {
                        await restoreNote(item.id);
                        showToast('Nota restaurada', 'success');
                      }}
                      style={styles.trashRestoreBtn}
                    >
                      <Ionicons name="arrow-undo" size={16} color={COLORS.success} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert('Eliminar permanentemente', 'Esta acción no se puede deshacer.', [
                          { text: 'Cancelar', style: 'cancel' },
                          { text: 'Eliminar', style: 'destructive', onPress: async () => {
                            await permanentDeleteNote(item.id);
                            showToast('Eliminada permanentemente', 'info');
                          }},
                        ]);
                      }}
                      style={styles.trashDeleteBtn}
                    >
                      <Ionicons name="trash" size={16} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* New Folder Modal */}
      <Modal visible={showNewFolder} transparent animationType="fade" onRequestClose={() => setShowNewFolder(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowNewFolder(false)}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Nueva carpeta</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nombre de la carpeta"
              placeholderTextColor={COLORS.textMuted}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
              maxLength={30}
            />
            <View style={styles.colorPicker}>
              {FOLDER_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setNewFolderColor(c)}
                  style={[styles.colorDot, { backgroundColor: c }, newFolderColor === c && styles.colorDotActive]}
                />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setShowNewFolder(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateFolder} disabled={!newFolderName.trim()} style={[styles.modalCreateBtn, !newFolderName.trim() && { opacity: 0.4 }]}>
                <Text style={styles.modalCreateText}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
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

  // -- Trash button -----------------------------------------------------------
  trashBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt, justifyContent: 'center', alignItems: 'center',
  },

  // -- Folder bar -------------------------------------------------------------
  folderBar: { paddingHorizontal: 20, paddingBottom: 10, gap: 6 },
  folderChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: COLORS.surfaceAlt,
  },
  folderChipActive: { backgroundColor: COLORS.primary },
  folderChipText: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary },
  folderChipTextActive: { color: '#FFFFFF' },
  folderAddBtn: {
    width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center',
  },
  createFolderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingVertical: 4,
  },

  // -- Trash modal ------------------------------------------------------------
  trashHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  trashTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  trashCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 12, backgroundColor: COLORS.surfaceAlt,
    marginBottom: 8, gap: 12,
  },
  trashCardTitle: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  trashCardMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  trashRestoreBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.success + '15', justifyContent: 'center', alignItems: 'center',
  },
  trashDeleteBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.error + '15', justifyContent: 'center', alignItems: 'center',
  },

  // -- Modals -----------------------------------------------------------------
  modalOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalSheet: {
    width: '100%', maxWidth: 340, backgroundColor: COLORS.surface,
    borderRadius: 20, padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 16, textAlign: 'center' },
  modalInput: {
    height: 48, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, fontSize: 15, color: COLORS.textPrimary,
  },
  colorPicker: { flexDirection: 'row', gap: 8, marginTop: 14, justifyContent: 'center' },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorDotActive: { borderWidth: 3, borderColor: COLORS.textPrimary },
  modalCancelBtn: {
    flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  modalCancelText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  modalCreateBtn: {
    flex: 1, height: 44, borderRadius: 12, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  modalCreateText: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },

  // -- Batch select -----------------------------------------------------------
  batchBtn: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  selectBox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  selectBoxActive: {
    backgroundColor: COLORS.primary, borderColor: COLORS.primary,
  },

  // -- List -------------------------------------------------------------------
  list: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
});
