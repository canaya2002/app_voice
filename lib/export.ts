import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { showToast } from '@/components/Toast';
import { getModeConfig } from '@/lib/constants';
import type { Note, OutputMode } from '@/types';
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function s(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val : fallback;
}

function sArr(val: unknown): string[] {
  return Array.isArray(val) ? val.filter((v): v is string => typeof v === 'string') : [];
}

function rArr(val: unknown): Record<string, unknown>[] {
  return Array.isArray(val) ? val.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)) : [];
}

const PDF_STYLES = `
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 40px; color: #0B0B0B; line-height: 1.6; max-width: 700px; margin: 0 auto; }
  h1 { color: #0B0B0B; font-size: 24px; margin-bottom: 4px; }
  .meta { color: #8A8F98; font-size: 13px; margin-bottom: 24px; }
  .mode-badge { display: inline-block; background: #F5F7FA; color: #0B0B0B; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 6px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.5px; }
  h2 { color: #0B0B0B; font-size: 16px; margin-top: 24px; border-bottom: 2px solid #F5F7FA; padding-bottom: 4px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
  .task-list { list-style: none; padding-left: 0; }
  .task-list li { padding: 6px 0; border-bottom: 1px solid #F5F7FA; }
  .task-list li::before { content: "☐ "; color: #8A8F98; }
  .priority { font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; margin-left: 6px; }
  .priority-high { background: #FFF0EF; color: #FF3B30; }
  .priority-medium { background: #FFF8F0; color: #FF9500; }
  .priority-low { background: #F0FFF4; color: #34C759; }
  .card { background: #F5F7FA; padding: 16px; border-radius: 8px; border-left: 4px solid #8FD3FF; margin: 12px 0; }
  .step { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start; }
  .step-num { background: #0B0B0B; color: #FFF; width: 24px; height: 24px; border-radius: 12px; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700; flex-shrink: 0; }
  .step-text { flex: 1; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #8A8F98; padding: 8px; border-bottom: 2px solid #EBEDF0; }
  td { padding: 8px; border-bottom: 1px solid #F5F7FA; font-size: 14px; }
  .tone-label { font-size: 12px; font-weight: 600; color: #8A8F98; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 20px; margin-bottom: 4px; }
  .message-block { background: #F5F7FA; padding: 14px; border-radius: 8px; margin-bottom: 12px; white-space: pre-wrap; }
  .flashcard { border-left: 3px solid #0B0B0B; padding: 10px 14px; margin-bottom: 8px; background: #FAFAFA; border-radius: 0 6px 6px 0; }
  .flashcard-term { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
  .flashcard-def { font-size: 13px; color: #5A5F68; }
  .chip { display: inline-block; background: #F5F7FA; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 10px; margin: 0 4px 4px 0; }
  .footer { margin-top: 40px; text-align: center; color: #B8BCC4; font-size: 12px; }
`;

function buildModeHtml(mode: OutputMode, result: Record<string, unknown>): string {
  switch (mode) {
    case 'summary': {
      const summary = s(result.summary);
      const keyPoints = sArr(result.key_points);
      const topics = sArr(result.topics);
      const highlights = sArr(result.speaker_highlights);
      let html = `<p>${escapeHtml(summary)}</p>`;
      if (keyPoints.length) html += `<h2>Puntos clave</h2><ul>${keyPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`;
      if (topics.length) html += `<h2>Temas</h2><div>${topics.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div>`;
      if (highlights.length) html += `<h2>Destacados por participante</h2><ul>${highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>`;
      return html;
    }
    case 'tasks': {
      const tasks = rArr(result.tasks);
      let html = `<ul class="task-list">`;
      tasks.forEach((t) => {
        const text = s(t.text) || s(t.task);
        const priority = s(t.priority, 'medium');
        const responsible = s(t.responsible);
        html += `<li>${escapeHtml(text)}<span class="priority priority-${priority}">${priority === 'high' ? 'Alta' : priority === 'low' ? 'Baja' : 'Media'}</span>`;
        if (responsible) html += ` <span style="color:#8A8F98;font-size:12px;">→ ${escapeHtml(responsible)}</span>`;
        html += `</li>`;
      });
      html += `</ul>`;
      return html;
    }
    case 'action_plan': {
      const objective = s(result.objective);
      const steps = rArr(result.steps);
      const obstacles = sArr(result.obstacles);
      const nextStep = s(result.next_immediate_step);
      const criteria = s(result.success_criteria);
      let html = '';
      if (objective) html += `<div class="card"><strong>Objetivo:</strong> ${escapeHtml(objective)}</div>`;
      if (steps.length) {
        html += `<h2>Pasos</h2>`;
        steps.forEach((st, i) => {
          html += `<div class="step"><div class="step-num">${i + 1}</div><div class="step-text"><strong>${escapeHtml(s(st.title) || s(st.step) || s(st.action))}</strong>`;
          if (s(st.description)) html += `<br/><span style="color:#5A5F68;font-size:13px;">${escapeHtml(s(st.description))}</span>`;
          html += `</div></div>`;
        });
      }
      if (obstacles.length) html += `<h2>Obstáculos</h2><ul>${obstacles.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ul>`;
      if (nextStep) html += `<div class="card"><strong>Siguiente paso inmediato:</strong> ${escapeHtml(nextStep)}</div>`;
      if (criteria) html += `<h2>Criterios de éxito</h2><p>${escapeHtml(criteria)}</p>`;
      return html;
    }
    case 'clean_text': {
      return `<div class="card">${escapeHtml(s(result.clean_text)).replace(/\n/g, '<br/>')}</div>`;
    }
    case 'executive_report': {
      const context = s(result.context);
      const execSummary = s(result.executive_summary);
      const decisions = rArr(result.decisions);
      const keyPoints = sArr(result.key_points);
      const agreements = sArr(result.agreements);
      const pending = sArr(result.pending_items);
      const nextSteps = sArr(result.next_steps);
      const participants = sArr(result.participants);
      let html = '';
      if (context) html += `<h2>Contexto</h2><p>${escapeHtml(context)}</p>`;
      if (execSummary) html += `<div class="card">${escapeHtml(execSummary)}</div>`;
      if (decisions.length) {
        html += `<h2>Decisiones</h2><table><tr><th>Decisión</th><th>Responsable</th></tr>`;
        decisions.forEach((d) => html += `<tr><td>${escapeHtml(s(d.decision) || s(d.text))}</td><td>${escapeHtml(s(d.responsible) || s(d.owner) || '-')}</td></tr>`);
        html += `</table>`;
      }
      if (keyPoints.length) html += `<h2>Puntos clave</h2><ul>${keyPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`;
      if (agreements.length) html += `<h2>Acuerdos</h2><ul>${agreements.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`;
      if (pending.length) html += `<h2>Pendientes</h2><ul>${pending.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`;
      if (nextSteps.length) html += `<h2>Próximos pasos</h2><ul>${nextSteps.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`;
      if (participants.length) html += `<h2>Participantes</h2><div>${participants.map((p) => `<span class="chip">${escapeHtml(p)}</span>`).join('')}</div>`;
      return html;
    }
    case 'ready_message': {
      const messages = typeof result.messages === 'object' && result.messages ? result.messages as Record<string, unknown> : {};
      const subject = s(result.suggested_subject);
      const tones = [['professional', 'Profesional'], ['friendly', 'Amigable'], ['firm', 'Firme'], ['brief', 'Breve']] as const;
      let html = '';
      if (subject) html += `<div class="card"><strong>Asunto sugerido:</strong> ${escapeHtml(subject)}</div>`;
      tones.forEach(([key, label]) => {
        const text = s(messages[key]);
        if (text) html += `<div class="tone-label">${label}</div><div class="message-block">${escapeHtml(text)}</div>`;
      });
      return html;
    }
    case 'study': {
      const summary = s(result.summary);
      const concepts = rArr(result.key_concepts);
      const review = sArr(result.review_points);
      const questions = rArr(result.probable_questions);
      let html = '';
      if (summary) html += `<p>${escapeHtml(summary)}</p>`;
      if (concepts.length) {
        html += `<h2>Conceptos clave</h2>`;
        concepts.forEach((c) => html += `<div class="flashcard"><div class="flashcard-term">${escapeHtml(s(c.concept) || s(c.term))}</div><div class="flashcard-def">${escapeHtml(s(c.explanation) || s(c.definition))}</div></div>`);
      }
      if (review.length) html += `<h2>Puntos de repaso</h2><ul>${review.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`;
      if (questions.length) {
        html += `<h2>Preguntas probables</h2>`;
        questions.forEach((q) => {
          html += `<p><strong>${escapeHtml(s(q.question))}</strong>`;
          const hint = s(q.hint) || s(q.answer);
          if (hint) html += `<br/><span style="color:#5A5F68;font-style:italic;">${escapeHtml(hint)}</span>`;
          html += `</p>`;
        });
      }
      return html;
    }
    case 'ideas': {
      const core = s(result.core_idea);
      const opps = rArr(result.opportunities);
      const points = sArr(result.interesting_points);
      const questions = sArr(result.open_questions);
      const nextStep = s(result.suggested_next_step);
      const structured = s(result.structured_version);
      let html = '';
      if (core) html += `<div class="card">${escapeHtml(core)}</div>`;
      if (opps.length) {
        html += `<h2>Oportunidades</h2><ul>`;
        opps.forEach((o) => {
          const text = s(o.opportunity) || s(o.text);
          const potential = s(o.potential);
          html += `<li>${escapeHtml(text)}${potential ? ` <span class="chip">${escapeHtml(potential)}</span>` : ''}</li>`;
        });
        html += `</ul>`;
      }
      if (points.length) html += `<h2>Puntos interesantes</h2><ul>${points.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`;
      if (questions.length) html += `<h2>Preguntas abiertas</h2><ul>${questions.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}</ul>`;
      if (nextStep) html += `<div class="card"><strong>Siguiente paso:</strong> ${escapeHtml(nextStep)}</div>`;
      if (structured) html += `<h2>Versión estructurada</h2><p>${escapeHtml(structured).replace(/\n/g, '<br/>')}</p>`;
      return html;
    }
    default:
      return `<pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>`;
  }
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

export async function exportPDF(
  note: Note,
  mode?: OutputMode,
  modeResult?: Record<string, unknown>,
): Promise<void> {
  const modeLabel = mode ? getModeConfig(mode).label : '';
  const body = mode && modeResult
    ? buildModeHtml(mode, modeResult)
    : `
      <h2>Resumen</h2><p>${escapeHtml(note.summary)}</p>
      <h2>Puntos clave</h2><ul>${note.key_points.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
      <h2>Tareas</h2><ul class="task-list">${note.tasks.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
      <h2>Transcripción limpia</h2><div class="card">${escapeHtml(note.clean_text).replace(/\n/g, '<br/>')}</div>
    `;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${PDF_STYLES}</style></head><body>
    <h1>${escapeHtml(note.title)}</h1>
    <p class="meta">${formatDate(note.created_at)} · ${formatDurationLong(note.audio_duration)}</p>
    ${modeLabel ? `<span class="mode-badge">${escapeHtml(modeLabel)}</span>` : ''}
    ${body}
    <div class="footer">Generado con Sythio</div>
  </body></html>`;

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
