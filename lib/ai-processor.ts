import type { ProcessingResult } from '@/types';

export function parseProcessingResult(raw: string): ProcessingResult {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as ProcessingResult;

    return {
      resumen: parsed.resumen ?? '',
      puntos_clave: Array.isArray(parsed.puntos_clave) ? parsed.puntos_clave : [],
      pendientes: Array.isArray(parsed.pendientes) ? parsed.pendientes : [],
      texto_limpio: parsed.texto_limpio ?? '',
    };
  } catch {
    return {
      resumen: '',
      puntos_clave: [],
      pendientes: [],
      texto_limpio: raw,
    };
  }
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    recording: 'Grabando...',
    uploading: 'Subiendo audio...',
    transcribing: 'Transcribiendo...',
    processing: 'Analizando contenido...',
    done: 'Listo',
    error: 'Error',
  };
  return labels[status] ?? status;
}

export function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    recording: 'mic',
    uploading: 'cloud-upload',
    transcribing: 'document-text',
    processing: 'sparkles',
    done: 'checkmark-circle',
    error: 'alert-circle',
  };
  return icons[status] ?? 'help-circle';
}
