import { useColorScheme } from 'react-native';
import type { OutputMode, NoteTemplate } from '@/types';
import { useThemeStore } from '@/stores/themeStore';

export const COLORS = {
  // Core brand — deep ink + luminous blue accent
  primary: '#0A0A0C',
  primaryLight: '#6CB4EE',
  primaryDark: '#050507',
  primaryPale: '#EAF2FB',
  primaryGlow: 'rgba(108, 180, 238, 0.22)',

  // Backgrounds — warm atmospheric, not flat white
  background: '#F8F7F4',
  backgroundSecondary: '#F2F1ED',
  surface: '#FFFFFF',
  surfaceAlt: '#F0EFE9',

  // Glassmorphism — warmer, richer
  glassBg: 'rgba(255, 255, 255, 0.68)',
  glassBorder: 'rgba(255, 255, 255, 0.45)',
  glassShadow: 'rgba(0, 0, 0, 0.10)',

  // Accent
  accentGold: '#E8930C',
  accentTeal: '#0C8CE9',

  // Text — better contrast hierarchy
  textPrimary: '#111114',
  textSecondary: '#6E7179',
  textMuted: '#A3A7B0',

  // Semantic — slightly richer tones
  success: '#1DB954',
  warning: '#E8930C',
  error: '#E5383B',
  info: '#6CB4EE',

  // Borders — warmer undertone
  border: '#E4E2DC',
  borderLight: '#ECEAE4',

  // Recording
  recording: '#E5383B',
  recordingBg: '#FEF0EF',
};

export const DARK_COLORS: typeof COLORS = {
  primary: '#F5F4F0',
  primaryLight: '#6CB4EE',
  primaryDark: '#EEEEE8',
  primaryPale: '#172030',
  primaryGlow: 'rgba(108, 180, 238, 0.22)',

  background: '#0C0C0E',
  backgroundSecondary: '#121214',
  surface: '#1A1A1E',
  surfaceAlt: '#222226',

  glassBg: 'rgba(26, 26, 30, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.07)',
  glassShadow: 'rgba(0, 0, 0, 0.35)',

  accentGold: '#F5A623',
  accentTeal: '#3AADFF',

  textPrimary: '#F0EFE9',
  textSecondary: '#8E919A',
  textMuted: '#55585F',

  success: '#1DB954',
  warning: '#E8930C',
  error: '#E5383B',
  info: '#6CB4EE',

  border: '#28282C',
  borderLight: '#222226',

  recording: '#E5383B',
  recordingBg: '#2A1616',
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
  { bg: '#E6F0FA', text: '#1B6FA8', name: 'blue' },
  { bg: '#E8F5E9', text: '#1A7A42', name: 'green' },
  { bg: '#FFF3E0', text: '#AD5A00', name: 'amber' },
  { bg: '#F0EFEA', text: '#535660', name: 'gray' },
  { bg: '#FCE4EC', text: '#9B1048', name: 'pink' },
  { bg: '#E8EAF6', text: '#303090', name: 'indigo' },
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
