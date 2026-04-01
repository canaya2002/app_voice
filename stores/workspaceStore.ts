import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Workspace, WorkspaceMember, Channel, ChannelNote, WorkspaceRole } from '@/types';

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  members: WorkspaceMember[];
  channels: Channel[];
  channelNotes: ChannelNote[];
  loading: boolean;
  error: string | null;

  // Workspaces
  fetchWorkspaces: () => Promise<void>;
  createWorkspace: (name: string, description?: string) => Promise<Workspace | null>;
  updateWorkspace: (id: string, data: Partial<Workspace>) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  setCurrentWorkspace: (ws: Workspace | null) => void;

  // Members
  fetchMembers: (workspaceId: string) => Promise<void>;
  inviteMember: (workspaceId: string, email: string, role?: WorkspaceRole) => Promise<boolean>;
  updateMemberRole: (memberId: string, role: WorkspaceRole) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;

  // Channels
  fetchChannels: (workspaceId: string) => Promise<void>;
  createChannel: (workspaceId: string, name: string, description?: string, isPublic?: boolean) => Promise<Channel | null>;
  deleteChannel: (channelId: string) => Promise<void>;

  // Channel notes
  fetchChannelNotes: (channelId: string) => Promise<void>;
  shareNoteToChannel: (channelId: string, noteId: string) => Promise<boolean>;
  removeNoteFromChannel: (channelNoteId: string) => Promise<void>;

  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  currentWorkspace: null,
  members: [],
  channels: [],
  channelNotes: [],
  loading: false,
  error: null,

  // ── Workspaces ──────────────────────────────────────────────────────────

  fetchWorkspaces: async () => {
    set({ loading: true, error: null });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { set({ loading: false }); return; }

    // Fetch workspaces where user is a member
    const { data: memberships } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', session.user.id);

    if (!memberships?.length) {
      set({ workspaces: [], loading: false });
      return;
    }

    const wsIds = memberships.map((m) => m.workspace_id);
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .in('id', wsIds)
      .order('created_at', { ascending: false });

    if (error) {
      set({ loading: false, error: 'No se pudieron cargar los workspaces.' });
      return;
    }

    set({ workspaces: (data ?? []) as Workspace[], loading: false });
  },

  createWorkspace: async (name, description = '') => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { data, error } = await supabase
      .from('workspaces')
      .insert({ name, description, owner_id: session.user.id })
      .select()
      .single();

    if (error || !data) return null;
    const ws = data as Workspace;

    // Auto-add creator as owner member
    await supabase.from('workspace_members').insert({
      workspace_id: ws.id,
      user_id: session.user.id,
      role: 'owner',
    });

    set((state) => ({ workspaces: [ws, ...state.workspaces] }));
    return ws;
  },

  updateWorkspace: async (id, updates) => {
    const { error } = await supabase.from('workspaces').update(updates).eq('id', id);
    if (!error) {
      set((state) => ({
        workspaces: state.workspaces.map((w) => w.id === id ? { ...w, ...updates } : w),
        currentWorkspace: state.currentWorkspace?.id === id ? { ...state.currentWorkspace, ...updates } : state.currentWorkspace,
      }));
    }
  },

  deleteWorkspace: async (id) => {
    await supabase.from('workspaces').delete().eq('id', id);
    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== id),
      currentWorkspace: state.currentWorkspace?.id === id ? null : state.currentWorkspace,
    }));
  },

  setCurrentWorkspace: (ws) => set({ currentWorkspace: ws }),

  // ── Members ─────────────────────────────────────────────────────────────

  fetchMembers: async (workspaceId) => {
    const { data } = await supabase
      .from('workspace_members')
      .select('*, profiles:user_id(email, display_name)')
      .eq('workspace_id', workspaceId)
      .order('joined_at', { ascending: true });

    const members = (data ?? []).map((row: Record<string, unknown>) => {
      const profile = row.profiles as Record<string, unknown> | null;
      return {
        ...row,
        email: profile?.email as string | undefined,
        display_name: profile?.display_name as string | undefined,
      } as WorkspaceMember;
    });

    set({ members });
  },

  inviteMember: async (workspaceId, email, role = 'member') => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;

    // Find user by email
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (!profile) return false;

    const { error } = await supabase.from('workspace_members').insert({
      workspace_id: workspaceId,
      user_id: profile.id,
      role,
      invited_by: session.user.id,
    });

    if (error) return false;
    await get().fetchMembers(workspaceId);
    return true;
  },

  updateMemberRole: async (memberId, role) => {
    await supabase.from('workspace_members').update({ role }).eq('id', memberId);
    set((state) => ({
      members: state.members.map((m) => m.id === memberId ? { ...m, role } : m),
    }));
  },

  removeMember: async (memberId) => {
    await supabase.from('workspace_members').delete().eq('id', memberId);
    set((state) => ({ members: state.members.filter((m) => m.id !== memberId) }));
  },

  // ── Channels ────────────────────────────────────────────────────────────

  fetchChannels: async (workspaceId) => {
    const { data } = await supabase
      .from('channels')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true });

    set({ channels: (data ?? []) as Channel[] });
  },

  createChannel: async (workspaceId, name, description = '', isPublic = true) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { data, error } = await supabase
      .from('channels')
      .insert({ workspace_id: workspaceId, name, description, is_public: isPublic, created_by: session.user.id })
      .select()
      .single();

    if (error || !data) return null;
    const channel = data as Channel;
    set((state) => ({ channels: [...state.channels, channel] }));
    return channel;
  },

  deleteChannel: async (channelId) => {
    await supabase.from('channels').delete().eq('id', channelId);
    set((state) => ({ channels: state.channels.filter((c) => c.id !== channelId) }));
  },

  // ── Channel Notes ───────────────────────────────────────────────────────

  fetchChannelNotes: async (channelId) => {
    const { data } = await supabase
      .from('channel_notes')
      .select('*')
      .eq('channel_id', channelId)
      .order('shared_at', { ascending: false });

    set({ channelNotes: (data ?? []) as ChannelNote[] });
  },

  shareNoteToChannel: async (channelId, noteId) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;

    const { error } = await supabase.from('channel_notes').insert({
      channel_id: channelId,
      note_id: noteId,
      shared_by: session.user.id,
    });

    if (error) return false;
    await get().fetchChannelNotes(channelId);
    return true;
  },

  removeNoteFromChannel: async (channelNoteId) => {
    await supabase.from('channel_notes').delete().eq('id', channelNoteId);
    set((state) => ({
      channelNotes: state.channelNotes.filter((cn) => cn.id !== channelNoteId),
    }));
  },

  reset: () => {
    set({
      workspaces: [], currentWorkspace: null, members: [],
      channels: [], channelNotes: [], loading: false, error: null,
    });
  },
}));
