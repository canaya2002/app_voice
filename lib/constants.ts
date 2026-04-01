import { useColorScheme } from 'react-native';
import type { OutputMode, NoteTemplate } from '@/types';
import { useThemeStore } from '@/stores/themeStore';

export const COLORS = {
  // Core brand — negro elegante + azul cielo
  primary: '#0B0B0B',
  primaryLight: '#8FD3FF',
  primaryDark: '#000000',
  primaryPale: '#E8F4FD',
  primaryGlow: 'rgba(143, 211, 255, 0.25)',

  // Backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#FAFBFC',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F7FA',

  // Glassmorphism
  glassBg: 'rgba(255, 255, 255, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.5)',
  glassShadow: 'rgba(0, 0, 0, 0.08)',

  // Accent
  accentGold: '#F59E0B',
  accentTeal: '#0EA5E9',

  // Text
  textPrimary: '#0B0B0B',
  textSecondary: '#8A8F98',
  textMuted: '#B8BCC4',

  // Semantic
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  info: '#8FD3FF',

  // Borders
  border: '#EBEDF0',
  borderLight: '#F5F7FA',

  // Recording
  recording: '#FF3B30',
  recordingBg: '#FFF0EF',
};

export const DARK_COLORS: typeof COLORS = {
  primary: '#FFFFFF',
  primaryLight: '#8FD3FF',
  primaryDark: '#FAFAFA',
  primaryPale: '#1A2A3A',
  primaryGlow: 'rgba(143, 211, 255, 0.25)',

  background: '#0B0B0B',
  backgroundSecondary: '#111111',
  surface: '#1A1A1A',
  surfaceAlt: '#222222',

  glassBg: 'rgba(26, 26, 26, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassShadow: 'rgba(0, 0, 0, 0.3)',

  accentGold: '#FBBF24',
  accentTeal: '#38BDF8',

  textPrimary: '#F5F5F5',
  textSecondary: '#9A9FA8',
  textMuted: '#5A5F68',

  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  info: '#8FD3FF',

  border: '#2A2A2A',
  borderLight: '#222222',

  recording: '#FF3B30',
  recordingBg: '#2A1515',
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
  ENTERPRISE_DAILY_NOTES: Infinity,
  FREE_MAX_AUDIO_DURATION: 600,       // 10 min
  PREMIUM_MAX_AUDIO_DURATION: 1800,   // 30 min
  ENTERPRISE_MAX_AUDIO_DURATION: 3600, // 60 min
  FREE_MAX_DAILY_AUDIO_MINUTES: 20,   // 20 min/day for free
  PREMIUM_MAX_DAILY_AUDIO_MINUTES: 120, // 120 min/day cap for premium
  ENTERPRISE_MAX_DAILY_AUDIO_MINUTES: Infinity, // no limit for enterprise
  MAX_AUDIO_DURATION: 600,            // default (overridden by plan)
  MAX_FILE_SIZE: 25 * 1024 * 1024,
  MAX_TRANSCRIPT_CHARS: 15000,
  FREE_RECONVERSIONS_PER_DAY: 10,
  PREMIUM_RECONVERSIONS_PER_DAY: 50,
  ENTERPRISE_RECONVERSIONS_PER_DAY: Infinity,
  PREMIUM_PRICE: 14.99,
  PREMIUM_TRIAL_DAYS: 7,
  PREMIUM_PRODUCT_ID: 'com.sythio.app.premium.monthly',
};

/** Modes available on each tier. */
export const FREE_MODES: OutputMode[] = ['summary', 'tasks', 'clean_text', 'ideas', 'outline'];
export const PREMIUM_MODES: OutputMode[] = ['action_plan', 'executive_report', 'ready_message', 'study'];
export const ALL_MODES: OutputMode[] = [...FREE_MODES, ...PREMIUM_MODES];

export function isModeFreeTier(mode: OutputMode): boolean {
  return FREE_MODES.includes(mode);
}

export const SPEAKER_COLORS = [
  { bg: '#E8F4FD', text: '#1A7FB8', name: 'blue' },
  { bg: '#F0FFF4', text: '#1A7F4B', name: 'green' },
  { bg: '#FFF8F0', text: '#B8600A', name: 'amber' },
  { bg: '#F5F7FA', text: '#5A5F68', name: 'gray' },
  { bg: '#FCE7F3', text: '#9D174D', name: 'pink' },
  { bg: '#E0E7FF', text: '#3730A3', name: 'indigo' },
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
