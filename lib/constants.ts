import type { OutputMode, NoteTemplate } from '@/types';

export const COLORS = {
  primary: '#6C5CE7',
  primaryLight: '#A29BFE',
  primaryDark: '#4834D4',

  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceAlt: '#F0EFFF',

  textPrimary: '#1A1A2E',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  border: '#E5E7EB',
  borderLight: '#F3F4F6',

  recording: '#EF4444',
  recordingBg: '#FEE2E2',
};

export const LIMITS = {
  FREE_DAILY_NOTES: 3,
  MAX_AUDIO_DURATION: 600,
  MAX_FILE_SIZE: 25 * 1024 * 1024,
  MAX_TRANSCRIPT_CHARS: 15000,
};

export const SPEAKER_COLORS = [
  { bg: '#F0EFFF', text: '#6C5CE7', name: 'purple' },
  { bg: '#E1F5EE', text: '#0F6E56', name: 'teal' },
  { bg: '#FAECE7', text: '#D85A30', name: 'coral' },
  { bg: '#FAEEDA', text: '#BA7517', name: 'amber' },
  { bg: '#E6F1FB', text: '#185FA5', name: 'blue' },
  { bg: '#FBEAF0', text: '#993556', name: 'pink' },
];

export interface ModeConfig {
  id: OutputMode;
  label: string;
  icon: string;
  description: string;
  excelExport: boolean;
}

export const MODE_CONFIGS: ModeConfig[] = [
  { id: 'summary', label: 'Resumen', icon: 'document-text-outline', description: 'Dime de qué trató', excelExport: false },
  { id: 'tasks', label: 'Tareas', icon: 'checkbox-outline', description: 'Sácame todo lo pendiente', excelExport: true },
  { id: 'action_plan', label: 'Plan de acción', icon: 'map-outline', description: 'Aterrízamelo en pasos', excelExport: true },
  { id: 'clean_text', label: 'Texto limpio', icon: 'create-outline', description: 'Déjamelo presentable', excelExport: false },
  { id: 'executive_report', label: 'Reporte ejecutivo', icon: 'briefcase-outline', description: 'Hazme un reporte serio', excelExport: true },
  { id: 'ready_message', label: 'Mensaje listo', icon: 'send-outline', description: 'Dame algo para enviar', excelExport: false },
  { id: 'study', label: 'Estudio', icon: 'school-outline', description: 'Conviértelo en material', excelExport: false },
  { id: 'ideas', label: 'Ideas', icon: 'bulb-outline', description: 'Ordena esta idea', excelExport: false },
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
