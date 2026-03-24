import type { OutputMode, NoteTemplate, MessageTone } from '@/types';

const TEMPLATE_CONTEXTS: Record<NoteTemplate, string> = {
  meeting: 'Este audio es una grabación de reunión. Prioriza acuerdos, decisiones, responsables y pendientes.',
  client: 'Este audio es una conversación con un cliente. Prioriza compromisos, expectativas y próximos pasos.',
  class: 'Este audio es una clase o conferencia. Prioriza conceptos, explicaciones y material de estudio.',
  brainstorm: 'Este audio es una sesión de brainstorming. Prioriza ideas, oportunidades y posibilidades.',
  quick_idea: 'Este audio es una idea rápida. Captura la esencia y sugiere cómo desarrollarla.',
  task: 'Este audio describe tareas o pendientes. Extrae todo lo accionable.',
  journal: 'Este audio es un diario o reflexión personal. Respeta el tono íntimo.',
  followup: 'Este audio es un seguimiento de algo anterior. Enfócate en avances, bloqueos y próximos pasos.',
  reflection: 'Este audio es una reflexión. Organiza los pensamientos de forma clara.',
};

function buildSpeakerInstruction(isConversation: boolean, speakersDetected: number, speakerNames: string[]): string {
  if (!isConversation || speakersDetected <= 1) {
    return 'Este audio es de una sola persona hablando.';
  }
  return `Este audio es una conversación entre ${speakersDetected} personas: ${speakerNames.join(', ')}. En tus respuestas, atribuye declaraciones, decisiones, tareas y acuerdos a las personas específicas cuando sea posible.`;
}

interface PromptContext {
  transcript: string;
  isConversation: boolean;
  speakersDetected: number;
  speakerNames: string[];
  template?: NoteTemplate;
  tone?: MessageTone;
}

export function buildSpeakerDetectionPrompt(segmentsJson: string): string {
  return `Analiza esta transcripción segmentada de un audio.

Cada segmento tiene marcas de tiempo. Tu trabajo es:
1. Detectar si hay múltiples personas hablando
2. Si las hay, asignar un identificador a cada hablante (Hablante 1, Hablante 2, etc.)
3. Basar la detección en: cambios de perspectiva, turnos de conversación, respuestas directas, cambios de tema abrupto, marcadores como "tú dijiste", "yo creo", "estoy de acuerdo"

Segmentos:
"""
${segmentsJson}
"""

Responde ÚNICAMENTE con un JSON válido, sin markdown ni backticks:
{
  "speakers_detected": 2,
  "is_conversation": true,
  "segments": [
    {
      "start": 0.0,
      "end": 4.2,
      "speaker": "Hablante 1",
      "text": "texto del segmento"
    }
  ],
  "full_transcript": "Transcripción completa concatenada..."
}

Si solo hay un hablante, pon speakers_detected: 1 y speaker: "Narrador" en todos.`;
}

export function buildModePrompt(mode: OutputMode, ctx: PromptContext): string {
  const speakerInstr = buildSpeakerInstruction(ctx.isConversation, ctx.speakersDetected, ctx.speakerNames);
  const templateInstr = ctx.template ? TEMPLATE_CONTEXTS[ctx.template] : '';
  const contextBlock = [speakerInstr, templateInstr].filter(Boolean).join('\n');

  const prompts: Record<OutputMode, string> = {
    summary: `Analiza esta transcripción y genera un resumen ejecutivo.

${contextBlock}

Transcripción:
"""
${ctx.transcript}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "título corto y descriptivo de 6-8 palabras",
  "summary": "resumen claro de 3-5 oraciones",
  "key_points": ["punto clave 1", "punto clave 2"],
  "topics": ["tema 1", "tema 2"],
  "speaker_highlights": [
    {"speaker": "Hablante 1", "highlight": "lo más relevante que dijo"}
  ]
}

Si no hay múltiples hablantes, devuelve speaker_highlights como array vacío.`,

    tasks: `Analiza esta transcripción y extrae TODAS las tareas, tanto explícitas como implícitas.

${contextBlock}

Transcripción:
"""
${ctx.transcript}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "título corto",
  "tasks": [
    {
      "text": "descripción clara de la tarea",
      "priority": "high",
      "responsible": null,
      "deadline_hint": null,
      "source_quote": "frase del audio que origina esta tarea",
      "is_explicit": true
    }
  ],
  "total_explicit": 3,
  "total_implicit": 2
}

priority: "high" si es urgente o bloqueante, "medium" si es importante, "low" si es deseable.
Tareas explícitas: alguien las dice claramente. Implícitas: se deducen del contexto.`,

    action_plan: `Analiza esta transcripción y convierte el contenido en un plan de acción estructurado.

${contextBlock}

Transcripción:
"""
${ctx.transcript}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "título corto",
  "objective": "objetivo principal claro en 1-2 oraciones",
  "steps": [
    {
      "order": 1,
      "action": "qué hacer",
      "responsible": null,
      "depends_on": null,
      "estimated_effort": "bajo"
    }
  ],
  "obstacles": ["obstáculo posible 1"],
  "next_immediate_step": "lo primero que hay que hacer ahora mismo",
  "success_criteria": "cómo saber que se cumplió el objetivo"
}`,

    clean_text: `Reescribe esta transcripción como texto limpio, bien redactado y profesional.

${contextBlock}

Transcripción:
"""
${ctx.transcript}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "título corto",
  "clean_text": "texto completo reescrito, sin muletillas, bien puntuado, con párrafos, preservando todo el contenido original",
  "format": "narrative",
  "word_count": 350
}

Si hay varias personas y es conversación, usa format "dialogue" y preserva turnos con nombres.
Si es una sola persona, usa format "narrative" y convierte a prosa fluida.
Elimina: "eh", "este", "o sea", "bueno pues", repeticiones. No inventes contenido.`,

    executive_report: `Genera un reporte ejecutivo profesional a partir de esta transcripción.

${contextBlock}

Transcripción:
"""
${ctx.transcript}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "título formal del reporte",
  "context": "contexto breve: qué es este audio",
  "executive_summary": "resumen ejecutivo de 3-4 oraciones",
  "decisions": [
    {"decision": "qué se decidió", "decided_by": null}
  ],
  "key_points": ["punto clave 1"],
  "agreements": [
    {"agreement": "qué se acordó", "parties": []}
  ],
  "pending_items": [
    {"item": "qué quedó pendiente", "responsible": null}
  ],
  "next_steps": [
    {"step": "próximo paso", "responsible": null, "timeline": null}
  ],
  "participants": []
}`,

    ready_message: `Convierte esta transcripción en un mensaje listo para enviar.

Tono preferido: ${ctx.tone ?? 'professional'}

${contextBlock}

Transcripción:
"""
${ctx.transcript}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "título corto",
  "messages": {
    "professional": "versión profesional del mensaje",
    "friendly": "versión amable y cercana",
    "firm": "versión directa y firme",
    "brief": "versión ultra-corta (máximo 3 líneas)"
  },
  "suggested_subject": "asunto sugerido si fuera un email",
  "context_note": "nota interna: para quién parece ir este mensaje"
}

Genera SIEMPRE las 4 versiones. El mensaje debe ser self-contained.`,

    study: `Convierte esta transcripción en material de estudio útil y organizado.

${contextBlock}

Transcripción:
"""
${ctx.transcript}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "título del tema de estudio",
  "summary": "resumen del tema en 3-4 oraciones",
  "key_concepts": [
    {"concept": "nombre del concepto", "explanation": "explicación clara y concisa"}
  ],
  "review_points": ["punto para repasar 1"],
  "probable_questions": [
    {"question": "pregunta probable de repaso", "answer_hint": "pista de respuesta"}
  ],
  "mnemonics": [],
  "connections": []
}`,

    ideas: `Analiza esta transcripción como una sesión de brainstorming o exploración de ideas.

${contextBlock}

Transcripción:
"""
${ctx.transcript}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "nombre de la idea principal",
  "core_idea": "la idea central en 2-3 oraciones claras",
  "opportunities": [
    {"opportunity": "oportunidad detectada", "potential": "alto"}
  ],
  "interesting_points": ["punto interesante 1"],
  "open_questions": ["pregunta por validar 1"],
  "suggested_next_step": "siguiente paso concreto para avanzar esta idea",
  "structured_version": "la idea completa reorganizada de forma coherente"
}`,
  };

  return prompts[mode];
}
