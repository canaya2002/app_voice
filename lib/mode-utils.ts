import type { OutputMode, ModeResult } from '@/types';
import { MODE_CONFIGS, type ModeConfig } from '@/lib/constants';

export function getModeById(id: OutputMode): ModeConfig {
  return MODE_CONFIGS.find((m) => m.id === id) ?? MODE_CONFIGS[0];
}

export function getAvailableModes(existingResults: ModeResult[], currentMode: OutputMode): {
  generated: ModeConfig[];
  available: ModeConfig[];
} {
  const generatedIds = new Set(existingResults.map((r) => r.mode));
  generatedIds.add(currentMode);

  const generated = MODE_CONFIGS.filter((m) => generatedIds.has(m.id));
  const available = MODE_CONFIGS.filter((m) => !generatedIds.has(m.id));

  return { generated, available };
}

export function getDefaultResultForMode(mode: OutputMode): Record<string, unknown> {
  const defaults: Record<OutputMode, Record<string, unknown>> = {
    summary: { title_suggestion: '', summary: '', key_points: [], topics: [], speaker_highlights: [] },
    tasks: { title_suggestion: '', tasks: [], total_explicit: 0, total_implicit: 0 },
    action_plan: { title_suggestion: '', objective: '', steps: [], obstacles: [], next_immediate_step: '', success_criteria: '' },
    clean_text: { title_suggestion: '', clean_text: '', format: 'narrative', word_count: 0 },
    executive_report: { title_suggestion: '', context: '', executive_summary: '', decisions: [], key_points: [], agreements: [], pending_items: [], next_steps: [], participants: [] },
    ready_message: { title_suggestion: '', messages: { professional: '', friendly: '', firm: '', brief: '' }, suggested_subject: '', context_note: '' },
    study: { title_suggestion: '', summary: '', key_concepts: [], review_points: [], probable_questions: [], mnemonics: [], connections: [] },
    ideas: { title_suggestion: '', core_idea: '', opportunities: [], interesting_points: [], open_questions: [], suggested_next_step: '', structured_version: '' },
    outline: { title_suggestion: '', sections: [], duration_covered: '', total_sections: 0, total_points: 0 },
  };
  return defaults[mode];
}

export function parseModeResult(mode: OutputMode, raw: string): Record<string, unknown> {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return { ...getDefaultResultForMode(mode), ...parsed };
  } catch {
    return getDefaultResultForMode(mode);
  }
}
