import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { ActionItem } from '@/types';

type SortField = 'created_at' | 'priority' | 'due_date';
type FilterStatus = 'all' | 'pending' | 'in_progress' | 'done';

interface TasksState {
  items: ActionItem[];
  loading: boolean;
  error: string | null;
  filter: FilterStatus;
  sort: SortField;

  fetchItems: () => Promise<void>;
  createItem: (item: Pick<ActionItem, 'text' | 'priority' | 'assignee' | 'due_date' | 'note_id' | 'source_quote'>) => Promise<ActionItem | null>;
  updateItem: (id: string, data: Partial<Pick<ActionItem, 'text' | 'priority' | 'status' | 'assignee' | 'due_date'>>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  toggleDone: (id: string) => Promise<void>;
  setFilter: (filter: FilterStatus) => void;
  setSort: (sort: SortField) => void;
  syncFromNote: (noteId: string, noteTasks: string[], noteTitle: string) => Promise<void>;
  reset: () => void;
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export const useTasksStore = create<TasksState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  filter: 'all',
  sort: 'created_at',

  fetchItems: async () => {
    set({ loading: true, error: null });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { set({ loading: false }); return; }

    const { data, error } = await supabase
      .from('action_items')
      .select('*, notes:note_id(title)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      set({ loading: false, error: 'No se pudieron cargar las tareas.' });
      return;
    }

    const items: ActionItem[] = (data ?? []).map((row: Record<string, unknown>) => {
      const noteJoin = row.notes as Record<string, unknown> | null;
      return {
        ...row,
        note_title: noteJoin?.title as string | undefined,
        notes: undefined,
      } as unknown as ActionItem;
    });

    set({ items, loading: false });
  },

  createItem: async (item) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { data, error } = await supabase
      .from('action_items')
      .insert({
        user_id: session.user.id,
        text: item.text,
        priority: item.priority || 'medium',
        assignee: item.assignee,
        due_date: item.due_date,
        note_id: item.note_id,
        source_quote: item.source_quote,
      })
      .select()
      .single();

    if (error || !data) return null;
    const created = data as unknown as ActionItem;
    set((state) => ({ items: [created, ...state.items] }));
    return created;
  },

  updateItem: async (id, updates) => {
    const { error } = await supabase
      .from('action_items')
      .update(updates)
      .eq('id', id);

    if (error) {
      set({ error: 'No se pudo actualizar la tarea.' });
      return;
    }

    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...updates, updated_at: new Date().toISOString() } : item
      ),
    }));
  },

  deleteItem: async (id) => {
    const { error } = await supabase
      .from('action_items')
      .delete()
      .eq('id', id);

    if (error) {
      set({ error: 'No se pudo eliminar la tarea.' });
      return;
    }

    set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
  },

  toggleDone: async (id) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;

    const newStatus = item.status === 'done' ? 'pending' : 'done';
    await get().updateItem(id, { status: newStatus });
  },

  setFilter: (filter) => set({ filter }),
  setSort: (sort) => set({ sort }),

  syncFromNote: async (noteId, noteTasks, noteTitle) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || noteTasks.length === 0) return;

    // Check which tasks already exist for this note
    const { data: existing } = await supabase
      .from('action_items')
      .select('text')
      .eq('note_id', noteId)
      .eq('user_id', session.user.id);

    const existingTexts = new Set((existing ?? []).map((e: Record<string, unknown>) => e.text as string));
    const newTasks = noteTasks.filter((t) => !existingTexts.has(t));

    if (newTasks.length === 0) return;

    const inserts = newTasks.map((text) => ({
      user_id: session.user.id,
      note_id: noteId,
      text,
      priority: 'medium' as const,
    }));

    const { data } = await supabase
      .from('action_items')
      .insert(inserts)
      .select();

    if (data) {
      const created = (data as unknown as ActionItem[]).map((item) => ({
        ...item,
        note_title: noteTitle,
      }));
      set((state) => ({ items: [...created, ...state.items] }));
    }
  },

  reset: () => set({ items: [], loading: false, error: null, filter: 'all', sort: 'created_at' }),
}));

/** Get filtered + sorted items from the store */
export function useFilteredItems(): ActionItem[] {
  const items = useTasksStore((s) => s.items);
  const filter = useTasksStore((s) => s.filter);
  const sort = useTasksStore((s) => s.sort);

  let filtered = items;
  if (filter !== 'all') {
    filtered = items.filter((i) => i.status === filter);
  }

  return [...filtered].sort((a, b) => {
    if (sort === 'priority') {
      return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
    }
    if (sort === 'due_date') {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    return b.created_at.localeCompare(a.created_at);
  });
}
