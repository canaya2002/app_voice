import { create } from 'zustand';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import type { User } from '@/types';
import type { Session } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<'ok' | 'confirm_email' | undefined>;
  resendConfirmation: (email: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  fetchProfile: () => Promise<void>;
  setPlan: (plan: 'free' | 'premium') => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  loading: true,
  error: null,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      set({ session, loading: false });

      if (session) {
        await get().fetchProfile();
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        set({ session });
        if (session) {
          await get().fetchProfile();
        } else {
          set({ user: null });
        }
      });
    } catch {
      set({ loading: false });
    }
  },

  fetchProfile: async () => {
    const { session } = get();
    if (!session) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (error) {
      // Profile fetch failed — non-critical, user can retry
      return;
    }

    set({
      user: {
        id: data.id,
        email: data.email,
        created_at: data.created_at,
        plan: data.plan,
        daily_count: data.daily_count,
        daily_audio_minutes: data.daily_audio_minutes ?? 0,
        last_reset_date: data.last_reset_date,
        custom_vocabulary: Array.isArray(data.custom_vocabulary) ? data.custom_vocabulary : [],
        display_name: data.display_name ?? undefined,
        avatar_url: data.avatar_url ?? undefined,
        welcome_completed: !!data.welcome_completed,
      },
    });
  },

  login: async (email: string, password: string) => {
    set({ loading: true, error: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    set({ loading: false });
  },

  register: async (email: string, password: string) => {
    set({ loading: true, error: null });
    const redirectUrl = Linking.createURL('auth-callback');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });
    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    // If user has no identities, the email is already registered
    if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
      set({ loading: false, error: 'Este email ya está registrado. Intenta iniciar sesión.' });
      return;
    }
    // If no session returned, email confirmation is required
    if (!data.session) {
      set({ loading: false, error: null });
      return 'confirm_email' as const;
    }
    set({ loading: false });
    return 'ok' as const;
  },

  resendConfirmation: async (email: string) => {
    const redirectUrl = Linking.createURL('auth-callback');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectUrl },
    });
    return !error;
  },

  logout: async () => {
    set({ loading: true });
    try {
      await supabase.auth.signOut();
    } catch {
      // Force local cleanup even if signOut fails
    }
    // Clear all stores
    const { useNotesStore } = await import('@/stores/notesStore');
    const { useRecordingStore } = await import('@/stores/recordingStore');
    useNotesStore.getState().reset();
    useRecordingStore.getState().reset();
    set({ session: null, user: null, loading: false, error: null });
  },

  clearError: () => set({ error: null }),

  setPlan: (plan: 'free' | 'premium') => {
    const { user, session } = get();
    if (user) {
      set({ user: { ...user, plan } });
    }
    // Also persist to DB
    if (session) {
      supabase.from('profiles').update({ plan }).eq('id', session.user.id).then(() => {});
    }
  },
}));
