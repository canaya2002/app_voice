import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { showToast } from '@/components/Toast';
import type { Note } from '@/types';
import { formatDurationLong } from '@/lib/audio';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildPlainText(note: Note): string {
  const lines: string[] = [
    `# ${note.title}`,
    `Fecha: ${formatDate(note.created_at)} | Duración: ${formatDurationLong(note.audio_duration)}`,
    '',
    '## Resumen',
    note.summary,
    '',
    '## Puntos clave',
    ...note.key_points.map((p) => `- ${p}`),
    '',
    '## Tareas',
    ...note.tasks.map((t) => `☐ ${t}`),
    '',
    '## Transcripción limpia',
    note.clean_text,
  ];
  return lines.join('\n');
}

export async function copyToClipboard(note: Note): Promise<void> {
  const text = buildPlainText(note);
  await Clipboard.setStringAsync(text);
  showToast('Copiado al portapapeles', 'success');
}

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
  showToast('Copiado al portapapeles', 'success');
}

export async function exportPDF(note: Note): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 40px; color: #1A1A2E; line-height: 1.6; }
        h1 { color: #6C5CE7; font-size: 24px; margin-bottom: 4px; }
        .meta { color: #6B7280; font-size: 13px; margin-bottom: 24px; }
        h2 { color: #4834D4; font-size: 18px; margin-top: 24px; border-bottom: 2px solid #F0EFFF; padding-bottom: 4px; }
        ul { padding-left: 20px; }
        li { margin-bottom: 6px; }
        .task { list-style: none; padding-left: 0; }
        .task li::before { content: "☐ "; }
        .clean-text { background: #F9FAFB; padding: 16px; border-radius: 8px; border-left: 4px solid #6C5CE7; }
        .footer { margin-top: 40px; text-align: center; color: #9CA3AF; font-size: 12px; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(note.title)}</h1>
      <p class="meta">${formatDate(note.created_at)} · ${formatDurationLong(note.audio_duration)}</p>

      <h2>Resumen</h2>
      <p>${escapeHtml(note.summary)}</p>

      <h2>Puntos clave</h2>
      <ul>
        ${note.key_points.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}
      </ul>

      <h2>Tareas</h2>
      <ul class="task">
        ${note.tasks.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}
      </ul>

      <h2>Transcripción limpia</h2>
      <div class="clean-text">
        ${escapeHtml(note.clean_text).replace(/\n/g, '<br/>')}
      </div>

      <div class="footer">Generado con VoiceNotes</div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Compartir nota',
      UTI: 'com.adobe.pdf',
    });
    showToast('PDF generado', 'success');
  } else {
    showToast('No se puede compartir en este dispositivo', 'error');
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
