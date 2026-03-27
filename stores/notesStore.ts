import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { deleteAudioFile } from '@/lib/transcription';
import type { Note, ModeResult, OutputMode, MessageTone, SpeakerInfo } from '@/types';

interface NotesState {
  notes: Note[];
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
  convertMode: (noteId: string, targetMode: OutputMode, tone?: MessageTone) => Promise<ModeResult | null>;
  updateSpeakers: (noteId: string, speakers: SpeakerInfo[]) => Promise<void>;
  subscribeToNote: (id: string) => () => void;
  subscribeToNotes: (userId: string) => () => void;
  retryProcessing: (noteId: string) => Promise<boolean>;
  pollNoteStatus: (id: string) => Promise<Note | null>;
  setCurrentNote: (note: Note | null) => void;
  clearError: () => void;
  reset: () => void;
  /** Track active channel unsubscribers so logout can clean them all */
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
  };
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
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
    const note = get().notes.find((n) => n.id === id);
    const { error } = await supabase.from('notes').delete().eq('id', id);

    if (error) {
      set({ error: 'No se pudo eliminar la nota.' });
      return;
    }

    if (note?.audio_url) {
      try { await deleteAudioFile(note.audio_url); } catch { /* best-effort */ }
    }

    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
      currentNote: state.currentNote?.id === id ? null : state.currentNote,
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
      const { data: fnData, error: fnError } = await supabase.functions.invoke('convert-mode', {
        body: { note_id: noteId, target_mode: targetMode, tone },
      });

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
    set({ notes: [], currentNote: null, modeResults: [], loading: false, converting: false, convertingMode: null, error: null });
  },
}));
