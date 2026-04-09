import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { deleteAudioFile } from '@/lib/transcription';
import type { Note, ModeResult, OutputMode, MessageTone, SpeakerInfo, Folder, Bookmark } from '@/types';

interface NotesState {
  notes: Note[];
  trashedNotes: Note[];
  folders: Folder[];
  currentNote: Note | null;
  modeResults: ModeResult[];
  loading: boolean;
  converting: boolean;
  convertingMode: OutputMode | null;
  error: string | null;
  fetchNotes: () => Promise<void>;
  fetchNote: (id: string) => Promise<void>;
  fetchModeResults: (noteId: string) => Promise<void>;
  createNote: (userId: string) => Promise<string>;
  updateNote: (id: string, data: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  // Trash
  softDeleteNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  permanentDeleteNote: (id: string) => Promise<void>;
  fetchTrashedNotes: () => Promise<void>;
  // Folders
  fetchFolders: () => Promise<void>;
  createFolder: (name: string, color: string) => Promise<Folder | null>;
  deleteFolder: (id: string) => Promise<void>;
  moveNoteToFolder: (noteId: string, folderId: string | null) => Promise<void>;
  // Sharing
  generateShareLink: (noteId: string) => Promise<string | null>;
  removeShareLink: (noteId: string) => Promise<void>;
  convertMode: (noteId: string, targetMode: OutputMode, tone?: MessageTone) => Promise<ModeResult | null>;
  updateSpeakers: (noteId: string, speakers: SpeakerInfo[]) => Promise<void>;
  togglePin: (noteId: string) => Promise<void>;
  addBookmark: (noteId: string, bookmark: Bookmark) => Promise<void>;
  removeBookmark: (noteId: string, time: number) => Promise<void>;
  subscribeToNote: (id: string) => () => void;
  subscribeToNotes: (userId: string) => () => void;
  retryProcessing: (noteId: string) => Promise<boolean>;
  pollNoteStatus: (id: string) => Promise<Note | null>;
  setCurrentNote: (note: Note | null) => void;
  clearError: () => void;
  reset: () => void;
  _activeUnsubs: Set<() => void>;
  _registerUnsub: (unsub: () => void) => void;
}

function parseNote(row: Record<string, unknown>): Note {
  return {
    ...(row as unknown as Note),
    key_points: Array.isArray(row.key_points) ? row.key_points as string[] : [],
    tasks: Array.isArray(row.tasks) ? row.tasks as string[] : [],
    segments: Array.isArray(row.segments) ? row.segments as Note['segments'] : [],
    speakers: Array.isArray(row.speakers) ? row.speakers as Note['speakers'] : [],
    speakers_detected: typeof row.speakers_detected === 'number' ? row.speakers_detected : 1,
    is_conversation: !!row.is_conversation,
    primary_mode: (row.primary_mode as Note['primary_mode']) ?? 'summary',
    template: row.template as Note['template'],
    retry_count: typeof row.retry_count === 'number' ? row.retry_count : 0,
    deleted_at: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    folder_id: typeof row.folder_id === 'string' ? row.folder_id : null,
    share_token: typeof row.share_token === 'string' ? row.share_token : null,
    tags: Array.isArray(row.tags) ? row.tags as string[] : [],
    is_pinned: !!row.is_pinned,
    bookmarks: Array.isArray(row.bookmarks) ? row.bookmarks as Bookmark[] : [],
  };
}

function generateToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms)),
  ]);
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  trashedNotes: [],
  folders: [],
  currentNote: null,
  modeResults: [],
  loading: false,
  converting: false,
  convertingMode: null,
  error: null,

  fetchNotes: async () => {
    set({ loading: true, error: null });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { set({ loading: false }); return; }
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      set({ loading: false, error: 'No se pudieron cargar las notas.' });
      return;
    }

    const notes = (data ?? []).map((row) => parseNote(row as Record<string, unknown>));
    set({ notes, loading: false });
  },

  fetchNote: async (id: string) => {
    set({ loading: true, error: null });
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      set({ loading: false, error: 'No se pudo cargar la nota.' });
      return;
    }

    const note = parseNote(data as Record<string, unknown>);
    set({ currentNote: note, loading: false });
  },

  fetchModeResults: async (noteId: string) => {
    const { data } = await supabase
      .from('mode_results')
      .select('*')
      .eq('note_id', noteId)
      .order('created_at', { ascending: true });

    set({ modeResults: (data ?? []) as ModeResult[] });
  },

  createNote: async (userId: string) => {
    const { data, error } = await supabase
      .from('notes')
      .insert({ user_id: userId, status: 'recording' })
      .select('id')
      .single();

    if (error) throw new Error('No se pudo crear la nota.');
    return data.id as string;
  },

  updateNote: async (id: string, updates: Partial<Note>) => {
    const { error } = await supabase
      .from('notes')
      .update(updates)
      .eq('id', id);

    if (error) set({ error: 'No se pudo actualizar la nota.' });
  },

  deleteNote: async (id: string) => {
    // Legacy hard delete - now calls softDeleteNote
    await get().softDeleteNote(id);
  },

  softDeleteNote: async (id: string) => {
    const { error } = await supabase
      .from('notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) { set({ error: 'No se pudo eliminar la nota.' }); return; }

    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
      currentNote: state.currentNote?.id === id ? null : state.currentNote,
    }));
  },

  restoreNote: async (id: string) => {
    const { error } = await supabase
      .from('notes')
      .update({ deleted_at: null })
      .eq('id', id);

    if (error) { set({ error: 'No se pudo restaurar la nota.' }); return; }

    set((state) => ({
      trashedNotes: state.trashedNotes.filter((n) => n.id !== id),
    }));
    // Refresh main notes list
    get().fetchNotes();
  },

  permanentDeleteNote: async (id: string) => {
    const note = get().trashedNotes.find((n) => n.id === id);
    const { error } = await supabase.from('notes').delete().eq('id', id);

    if (error) { set({ error: 'No se pudo eliminar permanentemente.' }); return; }

    if (note?.audio_url) {
      try { await deleteAudioFile(note.audio_url); } catch { /* best-effort */ }
    }

    set((state) => ({
      trashedNotes: state.trashedNotes.filter((n) => n.id !== id),
    }));
  },

  fetchTrashedNotes: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', session.user.id)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    const trashed = (data ?? []).map((row) => parseNote(row as Record<string, unknown>));
    set({ trashedNotes: trashed });
  },

  // ── Folders ──────────────────────────────────────────────────────────────

  fetchFolders: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data } = await supabase
      .from('folders')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true });

    set({ folders: (data ?? []) as Folder[] });
  },

  createFolder: async (name: string, color: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    const { data, error } = await supabase
      .from('folders')
      .insert({ user_id: session.user.id, name, color })
      .select()
      .single();

    if (error || !data) return null;
    const folder = data as Folder;
    set((state) => ({ folders: [...state.folders, folder] }));
    return folder;
  },

  deleteFolder: async (id: string) => {
    // Move all notes out of folder first
    await supabase.from('notes').update({ folder_id: null }).eq('folder_id', id);
    await supabase.from('folders').delete().eq('id', id);
    set((state) => ({ folders: state.folders.filter((f) => f.id !== id) }));
    get().fetchNotes();
  },

  moveNoteToFolder: async (noteId: string, folderId: string | null) => {
    const { error } = await supabase
      .from('notes')
      .update({ folder_id: folderId })
      .eq('id', noteId);

    if (!error) {
      set((state) => ({
        notes: state.notes.map((n) => n.id === noteId ? { ...n, folder_id: folderId } : n),
        currentNote: state.currentNote?.id === noteId
          ? { ...state.currentNote, folder_id: folderId }
          : state.currentNote,
      }));
    }
  },

  // ── Sharing ──────────────────────────────────────────────────────────────

  generateShareLink: async (noteId: string) => {
    const token = generateToken();
    const { error } = await supabase
      .from('notes')
      .update({ share_token: token })
      .eq('id', noteId);

    if (error) return null;

    set((state) => ({
      notes: state.notes.map((n) => n.id === noteId ? { ...n, share_token: token } : n),
      currentNote: state.currentNote?.id === noteId
        ? { ...state.currentNote, share_token: token }
        : state.currentNote,
    }));
    return token;
  },

  removeShareLink: async (noteId: string) => {
    await supabase.from('notes').update({ share_token: null }).eq('id', noteId);
    set((state) => ({
      notes: state.notes.map((n) => n.id === noteId ? { ...n, share_token: null } : n),
      currentNote: state.currentNote?.id === noteId
        ? { ...state.currentNote, share_token: null }
        : state.currentNote,
    }));
  },

  convertMode: async (noteId: string, targetMode: OutputMode, tone?: MessageTone): Promise<ModeResult | null> => {
    set({ converting: true, convertingMode: targetMode, error: null });

    // Check if already exists locally
    const existing = get().modeResults.find(
      (r) => r.note_id === noteId && r.mode === targetMode
    );
    if (existing) {
      set({ converting: false, convertingMode: null });
      return existing;
    }

    try {
      const { data: fnData, error: fnError } = await withTimeout(
        supabase.functions.invoke('convert-mode', {
          body: { note_id: noteId, target_mode: targetMode, tone },
        }),
        60_000,
        'convert-mode',
      );

      if (fnError) throw new Error('Error al convertir.');

      const result = fnData?.result as ModeResult | undefined;
      if (result) {
        set((state) => ({
          modeResults: [...state.modeResults, result],
          converting: false,
          convertingMode: null,
        }));
        return result;
      }

      set({ converting: false, convertingMode: null });
      return null;
    } catch {
      set({ converting: false, convertingMode: null, error: 'Error al convertir. Intenta de nuevo.' });
      return null;
    }
  },

  updateSpeakers: async (noteId: string, speakers: SpeakerInfo[]) => {
    const { error } = await supabase
      .from('notes')
      .update({ speakers })
      .eq('id', noteId);

    if (!error) {
      set((state) => ({
        currentNote: state.currentNote?.id === noteId
          ? { ...state.currentNote, speakers }
          : state.currentNote,
      }));
    }
  },

  togglePin: async (noteId: string) => {
    const note = get().currentNote ?? get().notes.find((n) => n.id === noteId);
    if (!note) return;
    const newVal = !note.is_pinned;
    const { error } = await supabase
      .from('notes')
      .update({ is_pinned: newVal })
      .eq('id', noteId);

    if (!error) {
      set((state) => ({
        notes: state.notes.map((n) => n.id === noteId ? { ...n, is_pinned: newVal } : n),
        currentNote: state.currentNote?.id === noteId
          ? { ...state.currentNote, is_pinned: newVal }
          : state.currentNote,
      }));
    }
  },

  addBookmark: async (noteId: string, bookmark: Bookmark) => {
    const note = get().currentNote ?? get().notes.find((n) => n.id === noteId);
    if (!note) return;
    const current = note.bookmarks ?? [];
    const updated = [...current, bookmark].sort((a, b) => a.time - b.time);
    const { error } = await supabase
      .from('notes')
      .update({ bookmarks: updated })
      .eq('id', noteId);

    if (!error) {
      set((state) => ({
        notes: state.notes.map((n) => n.id === noteId ? { ...n, bookmarks: updated } : n),
        currentNote: state.currentNote?.id === noteId
          ? { ...state.currentNote, bookmarks: updated }
          : state.currentNote,
      }));
    }
  },

  removeBookmark: async (noteId: string, time: number) => {
    const note = get().currentNote ?? get().notes.find((n) => n.id === noteId);
    if (!note) return;
    const updated = (note.bookmarks ?? []).filter((b) => b.time !== time);
    const { error } = await supabase
      .from('notes')
      .update({ bookmarks: updated })
      .eq('id', noteId);

    if (!error) {
      set((state) => ({
        notes: state.notes.map((n) => n.id === noteId ? { ...n, bookmarks: updated } : n),
        currentNote: state.currentNote?.id === noteId
          ? { ...state.currentNote, bookmarks: updated }
          : state.currentNote,
      }));
    }
  },

  subscribeToNote: (id: string) => {
    const channel = supabase
      .channel(`note-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notes', filter: `id=eq.${id}` },
        (payload) => {
          const note = parseNote(payload.new as Record<string, unknown>);
          set({ currentNote: note });
          set((state) => ({
            notes: state.notes.map((n) => (n.id === id ? note : n)),
          }));
        }
      )
      .subscribe();

    const unsub = () => { supabase.removeChannel(channel); get()._activeUnsubs.delete(unsub); };
    get()._registerUnsub(unsub);
    return unsub;
  },

  subscribeToNotes: (userId: string) => {
    const channel = supabase
      .channel('all-notes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` },
        () => { get().fetchNotes(); }
      )
      .subscribe();

    const unsub = () => { supabase.removeChannel(channel); get()._activeUnsubs.delete(unsub); };
    get()._registerUnsub(unsub);
    return unsub;
  },

  retryProcessing: async (noteId: string): Promise<boolean> => {
    const note = get().currentNote ?? get().notes.find((n) => n.id === noteId);
    if (!note) { set({ error: 'Nota no encontrada.' }); return false; }
    if (!note.audio_url) { set({ error: 'No hay audio para reprocesar.' }); return false; }
    if (note.retry_count >= 2) {
      set({ error: 'Se alcanzó el máximo de reintentos.' });
      return false;
    }

    set({ loading: true, error: null });

    // Reset note status to processing
    await supabase.from('notes').update({ status: 'processing', error_message: null }).eq('id', noteId);
    set((state) => ({
      currentNote: state.currentNote?.id === noteId
        ? { ...state.currentNote, status: 'processing', error_message: undefined }
        : state.currentNote,
    }));

    try {
      const { error: fnError } = await supabase.functions.invoke('process-audio', {
        body: {
          note_id: noteId,
          audio_path: note.audio_url,
          template: note.template ?? 'quick_idea',
          primary_mode: note.primary_mode ?? 'summary',
          is_retry: true,
        },
      });

      set({ loading: false });
      if (fnError) {
        set({ error: 'Error al reintentar. Intenta más tarde.' });
        return false;
      }
      return true;
    } catch {
      set({ loading: false, error: 'Error de red al reintentar.' });
      return false;
    }
  },

  pollNoteStatus: async (id: string): Promise<Note | null> => {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    const note = parseNote(data as Record<string, unknown>);

    // Update local state
    set({ currentNote: note });
    set((state) => ({
      notes: state.notes.map((n) => (n.id === id ? note : n)),
    }));

    return note;
  },

  setCurrentNote: (note: Note | null) => set({ currentNote: note }),
  clearError: () => set({ error: null }),

  _activeUnsubs: new Set(),
  _registerUnsub: (unsub: () => void) => { get()._activeUnsubs.add(unsub); },

  reset: () => {
    // Clean up all active realtime subscriptions
    const unsubs = get()._activeUnsubs;
    for (const unsub of unsubs) {
      try { unsub(); } catch { /* ignore */ }
    }
    unsubs.clear();
    set({ notes: [], trashedNotes: [], folders: [], currentNote: null, modeResults: [], loading: false, converting: false, convertingMode: null, error: null });
  },
}));
