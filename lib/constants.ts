import { useColorScheme } from 'react-native';
import type { OutputMode, NoteTemplate } from '@/types';
import { useThemeStore } from '@/stores/themeStore';

export const COLORS = {
  // Core brand — monochrome neutral (aligned with web)
  primary: '#111111',
  primaryLight: '#8B5CF6',
  primaryDark: '#000000',
  primaryPale: 'rgba(139, 92, 246, 0.05)',
  primaryGlow: 'rgba(139, 92, 246, 0.08)',

  // Backgrounds — clean neutral, not warm
  background: '#F8F9FA',
  backgroundSecondary: '#F0F1F3',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F7',

  // Glassmorphism
  glassBg: 'rgba(255, 255, 255, 0.68)',
  glassBorder: 'rgba(255, 255, 255, 0.45)',
  glassShadow: 'rgba(0, 0, 0, 0.08)',

  // Accent
  accentGold: '#F59E0B',
  accentTeal: '#14B8A6',

  // Text — clean contrast hierarchy
  textPrimary: '#111111',
  textSecondary: '#666677',
  textMuted: '#999AAA',

  // Semantic
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#8B5CF6',

  // Borders — cool neutral
  border: '#E8E8EC',
  borderLight: '#F0F0F3',

  // Recording
  recording: '#EF4444',
  recordingBg: 'rgba(239, 68, 68, 0.05)',
};

export const DARK_COLORS: typeof COLORS = {
  primary: '#F0F0F3',
  primaryLight: '#A78BFA',
  primaryDark: '#E8E8EC',
  primaryPale: 'rgba(167, 139, 250, 0.08)',
  primaryGlow: 'rgba(167, 139, 250, 0.12)',

  background: '#0A0A0C',
  backgroundSecondary: '#111114',
  surface: '#1A1A1E',
  surfaceAlt: '#222226',

  glassBg: 'rgba(26, 26, 30, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.07)',
  glassShadow: 'rgba(0, 0, 0, 0.35)',

  accentGold: '#F59E0B',
  accentTeal: '#2DD4BF',

  textPrimary: '#F0F0F3',
  textSecondary: '#8E919A',
  textMuted: '#55585F',

  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#A78BFA',

  border: '#28282C',
  borderLight: '#222226',

  recording: '#EF4444',
  recordingBg: 'rgba(239, 68, 68, 0.08)',
};

export type ThemeColors = typeof COLORS;

export function useThemeColors(): ThemeColors {
  return COLORS;
}

export function useIsDark(): boolean {
  const preference = useThemeStore((s) => s.preference);
  const systemScheme = useColorScheme();

  if (preference === 'dark') return true;
  if (preference === 'light') return false;
  return systemScheme === 'dark';
}

export const LIMITS = {
  FREE_DAILY_NOTES: 2,
  PREMIUM_DAILY_NOTES: Infinity,
  FREE_MAX_AUDIO_DURATION: 600,       // 10 min
  PREMIUM_MAX_AUDIO_DURATION: 1800,   // 30 min
  PREMIUM_MAX_DAILY_AUDIO_MINUTES: 120, // 120 min/day cap for premium
  MAX_AUDIO_DURATION: 600,            // default (overridden by plan)
  MAX_FILE_SIZE: 25 * 1024 * 1024,
  MAX_TRANSCRIPT_CHARS: 15000,
};

/** Modes available on each tier. */
export const FREE_MODES: OutputMode[] = ['summary', 'tasks', 'clean_text', 'ideas', 'outline'];
export const PREMIUM_MODES: OutputMode[] = ['action_plan', 'executive_report', 'ready_message', 'study'];
export const ALL_MODES: OutputMode[] = [...FREE_MODES, ...PREMIUM_MODES];

export function isModeFreeTier(mode: OutputMode): boolean {
  return FREE_MODES.includes(mode);
}

export const SPEAKER_COLORS = [
  { bg: 'rgba(99, 102, 241, 0.08)', text: '#6366F1', name: 'indigo' },
  { bg: 'rgba(16, 185, 129, 0.08)', text: '#10B981', name: 'green' },
  { bg: 'rgba(245, 158, 11, 0.08)', text: '#D97706', name: 'amber' },
  { bg: 'rgba(100, 116, 139, 0.08)', text: '#64748B', name: 'slate' },
  { bg: 'rgba(239, 68, 68, 0.06)', text: '#EF4444', name: 'red' },
  { bg: 'rgba(139, 92, 246, 0.08)', text: '#8B5CF6', name: 'violet' },
];

export interface ModeConfig {
  id: OutputMode;
  label: string;
  icon: string;
  description: string;
  excelExport: boolean;
}

export const MODE_CONFIGS: ModeConfig[] = [
  { id: 'summary', label: 'Resumen', icon: 'document-text-outline', description: 'Dime de qué trató', excelExport: true },
  { id: 'tasks', label: 'Tareas', icon: 'checkbox-outline', description: 'Sácame todo lo pendiente', excelExport: true },
  { id: 'action_plan', label: 'Plan de acción', icon: 'map-outline', description: 'Aterrízamelo en pasos', excelExport: true },
  { id: 'clean_text', label: 'Texto limpio', icon: 'create-outline', description: 'Déjamelo presentable', excelExport: true },
  { id: 'executive_report', label: 'Reporte ejecutivo', icon: 'briefcase-outline', description: 'Hazme un reporte serio', excelExport: true },
  { id: 'ready_message', label: 'Mensaje listo', icon: 'send-outline', description: 'Dame algo para enviar', excelExport: true },
  { id: 'study', label: 'Estudio', icon: 'school-outline', description: 'Conviértelo en material', excelExport: true },
  { id: 'ideas', label: 'Ideas', icon: 'bulb-outline', description: 'Ordena esta idea', excelExport: true },
  { id: 'outline', label: 'Outline', icon: 'list-outline', description: 'Estructura jerárquica', excelExport: true },
];

export interface TemplateConfig {
  id: NoteTemplate;
  label: string;
  icon: string;
  defaultMode: OutputMode;
  description: string;
}

export const TEMPLATE_CONFIGS: TemplateConfig[] = [
  { id: 'quick_idea', label: 'Idea rápida', icon: 'flash-outline', defaultMode: 'ideas', description: 'Captura una idea antes de que se escape' },
  { id: 'meeting', label: 'Reunión', icon: 'people-outline', defaultMode: 'executive_report', description: 'Acuerdos, decisiones y pendientes' },
  { id: 'task', label: 'Tarea', icon: 'checkbox-outline', defaultMode: 'tasks', description: 'Lo que hay que hacer' },
  { id: 'client', label: 'Cliente', icon: 'business-outline', defaultMode: 'executive_report', description: 'Llamada o reunión con cliente' },
  { id: 'journal', label: 'Diario', icon: 'book-outline', defaultMode: 'clean_text', description: 'Reflexión personal o nota del día' },
  { id: 'class', label: 'Clase', icon: 'school-outline', defaultMode: 'study', description: 'Convierte la clase en material de estudio' },
  { id: 'brainstorm', label: 'Brainstorm', icon: 'bulb-outline', defaultMode: 'ideas', description: 'Sesión de ideas y exploración' },
  { id: 'followup', label: 'Seguimiento', icon: 'arrow-redo-outline', defaultMode: 'tasks', description: 'Follow-up de algo pendiente' },
  { id: 'reflection', label: 'Reflexión', icon: 'leaf-outline', defaultMode: 'clean_text', description: 'Pensar en voz alta' },
];

export function getModeConfig(mode: OutputMode): ModeConfig {
  return MODE_CONFIGS.find((m) => m.id === mode) ?? MODE_CONFIGS[0];
}

export function getTemplateConfig(template: NoteTemplate): TemplateConfig {
  return TEMPLATE_CONFIGS.find((t) => t.id === template) ?? TEMPLATE_CONFIGS[0];
}
