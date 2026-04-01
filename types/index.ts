// ── User ──────────────────────────────────────────────────────────────────────

export type UserPlan = 'free' | 'premium' | 'enterprise';

export interface User {
  id: string;
  email: string;
  created_at: string;
  plan: UserPlan;
  daily_count: number;
  daily_audio_minutes: number;
  last_reset_date: string;
  custom_vocabulary?: string[];
  display_name?: string;
  avatar_url?: string;
  welcome_completed?: boolean;
  org_id?: string | null;
}

// ── Organizations ────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  domain?: string | null;
  owner_id?: string | null;
  plan: string;
  billing_type: 'per_seat' | 'flat';
  price_per_seat?: number | null;
  flat_price?: number | null;
  billing_cycle: 'monthly' | 'annual';
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_price_id?: string | null;
  max_seats: number;
  seats_used: number;
  active: boolean;
  custom_audio_minutes_per_day?: number | null;
  custom_notes_per_day?: number | null;
  notes?: string | null;
  contract_start?: string | null;
  contract_end?: string | null;
  created_at: string;
  updated_at: string;
}

export type OrgMemberRole = 'owner' | 'admin' | 'member';

export interface OrganizationMember {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgMemberRole;
  status: 'active' | 'suspended' | 'pending';
  invited_by?: string | null;
  invited_at: string;
  joined_at?: string | null;
  email?: string;
  display_name?: string;
}

export interface OrgInvitation {
  id: string;
  org_id: string;
  email: string;
  role: OrgMemberRole;
  token: string;
  invited_by?: string | null;
  expires_at: string;
  accepted_at?: string | null;
  created_at: string;
}

export interface BillingRecord {
  id: string;
  org_id: string;
  period_start: string;
  period_end: string;
  seats_billed: number;
  amount_charged: number;
  currency: string;
  stripe_invoice_id?: string | null;
  stripe_payment_intent_id?: string | null;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  notes?: string | null;
  created_at: string;
}

// ── Output Modes ──────────────────────────────────────────────────────────────

export type OutputMode =
  | 'summary'
  | 'tasks'
  | 'action_plan'
  | 'clean_text'
  | 'executive_report'
  | 'ready_message'
  | 'study'
  | 'ideas'
  | 'outline';

export type MessageTone = 'professional' | 'friendly' | 'firm' | 'brief';

// ── Templates ─────────────────────────────────────────────────────────────────

export type NoteTemplate =
  | 'quick_idea'
  | 'meeting'
  | 'task'
  | 'client'
  | 'journal'
  | 'class'
  | 'brainstorm'
  | 'followup'
  | 'reflection';

// ── Speakers ──────────────────────────────────────────────────────────────────

export interface TranscriptSegment {
  start: number;
  end: number;
  speaker: string;
  text: string;
}

export interface SpeakerInfo {
  id: string;
  default_name: string;
  custom_name?: string;
  color: string;
}

// ── Folders ──────────────────────────────────────────────────────────────────

export interface Folder {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export interface Note {
  id: string;
  user_id: string;
  title: string;
  audio_url: string;
  audio_duration: number;
  transcript: string;
  summary: string;
  key_points: string[];
  tasks: string[];
  clean_text: string;
  status: 'recording' | 'uploading' | 'transcribing' | 'processing' | 'done' | 'error';
  error_message?: string;
  created_at: string;
  updated_at: string;
  // v2 fields
  speakers_detected: number;
  is_conversation: boolean;
  segments: TranscriptSegment[];
  speakers: SpeakerInfo[];
  primary_mode: OutputMode;
  template?: NoteTemplate;
  retry_count: number;
  // v3 fields
  deleted_at?: string | null;
  folder_id?: string | null;
  share_token?: string | null;
  // v4 fields
  highlights?: number[];  // indexes of highlighted segments
  workspace_id?: string | null;
  images?: string[];  // storage paths to attached images
}

// ── Mode Results ──────────────────────────────────────────────────────────────

export interface ModeResult {
  id: string;
  note_id: string;
  mode: OutputMode;
  result: Record<string, unknown>;
  tone?: MessageTone;
  created_at: string;
}

// ── Comments ─────────────────────────────────────────────────────────────────

export interface Comment {
  id: string;
  note_id: string;
  user_id: string;
  text: string;
  segment_index?: number | null;
  created_at: string;
  updated_at: string;
}

// ── Workspaces ───────────────────────────────────────────────────────────────

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Workspace {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  invited_by?: string;
  joined_at: string;
  // Joined from profile
  email?: string;
  display_name?: string;
}

// ── Channels ─────────────────────────────────────────────────────────────────

export interface Channel {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  is_public: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ChannelNote {
  id: string;
  channel_id: string;
  note_id: string;
  shared_by: string;
  shared_at: string;
}

// ── API Keys ─────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  permissions: string[];
  last_used?: string;
  created_at: string;
  revoked_at?: string;
}

// ── Legacy (kept for backward compat) ─────────────────────────────────────────

export interface ProcessingResult {
  resumen: string;
  puntos_clave: string[];
  pendientes: string[];
  texto_limpio: string;
}

// ── Recording ─────────────────────────────────────────────────────────────────

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  uri: string | null;
  metering: number[];
  selectedTemplate: NoteTemplate;
  selectedMode: OutputMode;
}
