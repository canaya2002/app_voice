// ── User ──────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  created_at: string;
  plan: 'free' | 'premium';
  daily_count: number;
  daily_audio_minutes: number;
  last_reset_date: string;
  custom_vocabulary?: string[];
  display_name?: string;
  avatar_url?: string;
  welcome_completed?: boolean;
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
  | 'ideas';

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
