import * as XLSX from 'xlsx';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { showToast } from '@/components/Toast';
import type { Note, OutputMode } from '@/types';

type SheetData = { name: string; data: (string | number | null)[][] };

function buildTasksSheets(result: Record<string, unknown>): SheetData[] {
  const tasks = Array.isArray(result.tasks) ? result.tasks as Record<string, unknown>[] : [];
  const rows: (string | number | null)[][] = [
    ['Tarea', 'Prioridad', 'Responsable', 'Deadline', 'Tipo'],
  ];
  tasks.forEach((t) => {
    rows.push([
      String(t.text ?? ''),
      String(t.priority ?? 'medium'),
      t.responsible ? String(t.responsible) : null,
      t.deadline_hint ? String(t.deadline_hint) : null,
      t.is_explicit ? 'Explícita' : 'Implícita',
    ]);
  });
  return [{ name: 'Tareas', data: rows }];
}

function buildReportSheets(result: Record<string, unknown>): SheetData[] {
  const sheets: SheetData[] = [];

  sheets.push({
    name: 'Resumen',
    data: [
      ['Contexto', String(result.context ?? '')],
      ['Resumen ejecutivo', String(result.executive_summary ?? '')],
    ],
  });

  const decisions = Array.isArray(result.decisions) ? result.decisions as Record<string, unknown>[] : [];
  if (decisions.length > 0) {
    sheets.push({
      name: 'Decisiones',
      data: [['Decisión', 'Responsable'], ...decisions.map((d) => [String(d.decision ?? ''), d.decided_by ? String(d.decided_by) : null])],
    });
  }

  const pending = Array.isArray(result.pending_items) ? result.pending_items as Record<string, unknown>[] : [];
  if (pending.length > 0) {
    sheets.push({
      name: 'Pendientes',
      data: [['Pendiente', 'Responsable'], ...pending.map((p) => [String(p.item ?? ''), p.responsible ? String(p.responsible) : null])],
    });
  }

  const steps = Array.isArray(result.next_steps) ? result.next_steps as Record<string, unknown>[] : [];
  if (steps.length > 0) {
    sheets.push({
      name: 'Próximos pasos',
      data: [['Paso', 'Responsable', 'Timeline'], ...steps.map((s) => [String(s.step ?? ''), s.responsible ? String(s.responsible) : null, s.timeline ? String(s.timeline) : null])],
    });
  }

  return sheets;
}

function buildSummarySheets(result: Record<string, unknown>): SheetData[] {
  const sheets: SheetData[] = [];
  const keyPoints = Array.isArray(result.key_points) ? result.key_points as string[] : [];
  const topics = Array.isArray(result.topics) ? result.topics as string[] : [];
  sheets.push({
    name: 'Resumen',
    data: [
      ['Resumen', String(result.summary ?? '')],
      [],
      ['Puntos clave'],
      ...keyPoints.map((p) => [String(p)]),
      [],
      ['Temas'],
      ...topics.map((t) => [String(t)]),
    ],
  });
  return sheets;
}

function buildStudySheets(result: Record<string, unknown>): SheetData[] {
  const sheets: SheetData[] = [];
  const concepts = Array.isArray(result.key_concepts) ? result.key_concepts as Record<string, unknown>[] : [];
  const review = Array.isArray(result.review_points) ? result.review_points as string[] : [];
  const questions = Array.isArray(result.probable_questions) ? result.probable_questions as Record<string, unknown>[] : [];

  if (concepts.length) {
    sheets.push({
      name: 'Conceptos',
      data: [['Concepto', 'Explicación'], ...concepts.map((c) => [String(c.concept ?? c.term ?? ''), String(c.explanation ?? c.definition ?? '')])],
    });
  }
  if (review.length) {
    sheets.push({
      name: 'Repaso',
      data: [['Punto de repaso'], ...review.map((r) => [String(r)])],
    });
  }
  if (questions.length) {
    sheets.push({
      name: 'Preguntas',
      data: [['Pregunta', 'Pista'], ...questions.map((q) => [String(q.question ?? ''), String(q.hint ?? q.answer ?? '')])],
    });
  }
  if (!sheets.length) {
    sheets.push({ name: 'Estudio', data: [['Resumen', String(result.summary ?? '')]] });
  }
  return sheets;
}

function buildIdeasSheets(result: Record<string, unknown>): SheetData[] {
  const opps = Array.isArray(result.opportunities) ? result.opportunities as Record<string, unknown>[] : [];
  const questions = Array.isArray(result.open_questions) ? result.open_questions as string[] : [];
  const rows: (string | number | null)[][] = [
    ['Idea central', String(result.core_idea ?? '')],
    [],
  ];
  if (opps.length) {
    rows.push(['Oportunidad', 'Potencial']);
    opps.forEach((o) => rows.push([String(o.opportunity ?? o.text ?? ''), String(o.potential ?? '')]));
    rows.push([]);
  }
  if (questions.length) {
    rows.push(['Preguntas abiertas']);
    questions.forEach((q) => rows.push([String(q)]));
    rows.push([]);
  }
  if (result.suggested_next_step) rows.push(['Siguiente paso', String(result.suggested_next_step)]);
  return [{ name: 'Ideas', data: rows }];
}

function buildCleanTextSheets(result: Record<string, unknown>): SheetData[] {
  return [{ name: 'Texto limpio', data: [['Texto'], [String(result.clean_text ?? '')]] }];
}

function buildReadyMessageSheets(result: Record<string, unknown>): SheetData[] {
  const messages = typeof result.messages === 'object' && result.messages ? result.messages as Record<string, unknown> : {};
  const rows: (string | number | null)[][] = [['Tono', 'Mensaje']];
  const tones = [['professional', 'Profesional'], ['friendly', 'Amigable'], ['firm', 'Firme'], ['brief', 'Breve']];
  tones.forEach(([key, label]) => {
    const text = messages[key];
    if (typeof text === 'string' && text) rows.push([label, text]);
  });
  if (result.suggested_subject) rows.push([], ['Asunto sugerido', String(result.suggested_subject)]);
  return [{ name: 'Mensajes', data: rows }];
}

function buildActionPlanSheets(result: Record<string, unknown>): SheetData[] {
  const steps = Array.isArray(result.steps) ? result.steps as Record<string, unknown>[] : [];
  return [{
    name: 'Plan de acción',
    data: [
      ['#', 'Acción', 'Responsable', 'Depende de', 'Esfuerzo'],
      ...steps.map((s) => [
        Number(s.order ?? 0),
        String(s.action ?? ''),
        s.responsible ? String(s.responsible) : null,
        s.depends_on ? String(s.depends_on) : null,
        String(s.estimated_effort ?? ''),
      ]),
    ],
  }];
}

export async function exportToExcel(
  mode: OutputMode,
  result: Record<string, unknown>,
  note: Note
): Promise<void> {
  let sheets: SheetData[] = [];

  switch (mode) {
    case 'summary':
      sheets = buildSummarySheets(result);
      break;
    case 'tasks':
      sheets = buildTasksSheets(result);
      break;
    case 'action_plan':
      sheets = buildActionPlanSheets(result);
      break;
    case 'clean_text':
      sheets = buildCleanTextSheets(result);
      break;
    case 'executive_report':
      sheets = buildReportSheets(result);
      break;
    case 'ready_message':
      sheets = buildReadyMessageSheets(result);
      break;
    case 'study':
      sheets = buildStudySheets(result);
      break;
    case 'ideas':
      sheets = buildIdeasSheets(result);
      break;
    default:
      showToast('Este modo no soporta exportación Excel', 'info');
      return;
  }

  const workbook = XLSX.utils.book_new();
  sheets.forEach(({ name, data }) => {
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, name.slice(0, 31));
  });

  const wbout = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const sanitizedTitle = (note.title || 'sythio').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  const fileName = `${sanitizedTitle}_${mode}.xlsx`;

  const file = new File(Paths.cache, fileName);
  const bytes = Uint8Array.from(atob(wbout), (c) => c.charCodeAt(0));
  const ws = file.writableStream();
  const writer = ws.getWriter();
  await writer.write(bytes);
  await writer.close();

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Exportar Excel',
    });
    showToast('Excel generado', 'success');
  } else {
    showToast('No se puede compartir en este dispositivo', 'error');
  }
}
