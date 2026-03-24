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
    case 'tasks':
      sheets = buildTasksSheets(result);
      break;
    case 'executive_report':
      sheets = buildReportSheets(result);
      break;
    case 'action_plan':
      sheets = buildActionPlanSheets(result);
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
  const sanitizedTitle = (note.title || 'voicenotes').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
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
