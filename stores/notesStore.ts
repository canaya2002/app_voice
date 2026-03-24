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
  setCurrentNote: (note: Note | null) => void;
  clearError: () => void;
  reset: () => void;
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
    const { data, error } = await supabase
      .from('notes')
      .select('*')
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

    return () => { supabase.removeChannel(channel); };
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

    return () => { supabase.removeChannel(channel); };
  },

  setCurrentNote: (note: Note | null) => set({ currentNote: note }),
  clearError: () => set({ error: null }),
  reset: () => set({ notes: [], currentNote: null, modeResults: [], loading: false, converting: false, convertingMode: null, error: null }),
}));
