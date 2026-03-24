// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_TRANSCRIPT_CHARS = 15000;
const API_TIMEOUT_MS = 120_000;

async function callClaude(prompt: string, signal: AbortSignal): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    }),
    signal,
  });
  if (!res.ok) throw new Error("LLM error");
  const data = await res.json();
  return data.content[0].text;
}

function safeJsonParse(raw: string, fallback: Record<string, unknown>): Record<string, unknown> {
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Sesión inválida" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Body inválido" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const note_id = body.note_id as string | undefined;
  const audio_path = body.audio_path as string | undefined;
  const template = (body.template as string) || "quick_idea";
  const primary_mode = (body.primary_mode as string) || "summary";

  if (!note_id || typeof note_id !== "string" || !audio_path || typeof audio_path !== "string") {
    return new Response(JSON.stringify({ error: "Parámetros inválidos" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  if (!audio_path.startsWith(`${user.id}/`)) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: noteCheck } = await admin.from("notes").select("user_id").eq("id", note_id).single();
  if (!noteCheck || noteCheck.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  try {
    // ── 1. Status: transcribing ──
    await admin.from("notes").update({ status: "transcribing" }).eq("id", note_id);

    // ── 2. Download audio ──
    const { data: audioData, error: dlError } = await admin.storage.from("audio-files").download(audio_path);
    if (dlError) throw new Error("Download failed");

    // ── 3. Whisper with verbose_json for timestamps ──
    const whisperCtrl = new AbortController();
    const whisperTimer = setTimeout(() => whisperCtrl.abort(), API_TIMEOUT_MS);

    const formData = new FormData();
    formData.append("file", audioData, "audio.m4a");
    formData.append("model", "whisper-1");
    formData.append("language", "es");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");

    let whisperSegments: Array<{ start: number; end: number; text: string }> = [];
    let rawTranscript = "";

    try {
      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: formData,
        signal: whisperCtrl.signal,
      });
      if (!whisperRes.ok) throw new Error("Whisper error");

      const whisperJson = await whisperRes.json();
      rawTranscript = whisperJson.text || "";
      whisperSegments = (whisperJson.segments || []).map((s: Record<string, unknown>) => ({
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        text: String(s.text || "").trim(),
      }));
    } finally {
      clearTimeout(whisperTimer);
    }

    // ── 4. Update transcript ──
    await admin.from("notes").update({ transcript: rawTranscript, status: "processing" }).eq("id", note_id);

    // ── 5. Speaker detection via Claude ──
    const claudeCtrl1 = new AbortController();
    const claudeTimer1 = setTimeout(() => claudeCtrl1.abort(), API_TIMEOUT_MS);

    let speakersDetected = 1;
    let isConversation = false;
    let segments: Array<{ start: number; end: number; speaker: string; text: string }> = [];

    try {
      const segmentsJson = JSON.stringify(whisperSegments.map(s => ({
        start: s.start.toFixed(1),
        end: s.end.toFixed(1),
        text: s.text,
      })));

      const speakerPrompt = `Analiza esta transcripción segmentada de un audio.

Cada segmento tiene marcas de tiempo. Tu trabajo es:
1. Detectar si hay múltiples personas hablando
2. Si las hay, asignar un identificador a cada hablante (Hablante 1, Hablante 2, etc.)
3. Basar la detección en: cambios de perspectiva, turnos de conversación, respuestas directas, cambios de tema abrupto

Segmentos:
"""
${segmentsJson}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "speakers_detected": 1,
  "is_conversation": false,
  "segments": [
    {"start": 0.0, "end": 4.2, "speaker": "Narrador", "text": "texto"}
  ],
  "full_transcript": "Transcripción completa concatenada"
}`;

      const speakerRaw = await callClaude(speakerPrompt, claudeCtrl1.signal);
      const speakerResult = safeJsonParse(speakerRaw, {
        speakers_detected: 1,
        is_conversation: false,
        segments: whisperSegments.map(s => ({ ...s, speaker: "Narrador" })),
        full_transcript: rawTranscript,
      });

      speakersDetected = Number(speakerResult.speakers_detected) || 1;
      isConversation = !!speakerResult.is_conversation;
      segments = Array.isArray(speakerResult.segments) ? speakerResult.segments as typeof segments : [];

      if (speakerResult.full_transcript && typeof speakerResult.full_transcript === "string") {
        rawTranscript = speakerResult.full_transcript;
      }
    } finally {
      clearTimeout(claudeTimer1);
    }

    // Build speakers array with colors
    const speakerColors = ["purple", "teal", "coral", "amber", "blue", "pink"];
    const uniqueSpeakers = [...new Set(segments.map(s => s.speaker))];
    const speakers = uniqueSpeakers.map((name, i) => ({
      id: `speaker_${i + 1}`,
      default_name: name,
      color: speakerColors[i % speakerColors.length],
    }));

    // ── 6. Process with primary mode ──
    const truncated = rawTranscript.length > MAX_TRANSCRIPT_CHARS
      ? rawTranscript.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[Transcripción truncada]"
      : rawTranscript;

    // Template contexts
    const templateContexts: Record<string, string> = {
      meeting: "Este audio es una grabación de reunión. Prioriza acuerdos, decisiones, responsables y pendientes.",
      client: "Este audio es una conversación con un cliente. Prioriza compromisos, expectativas y próximos pasos.",
      class: "Este audio es una clase o conferencia. Prioriza conceptos, explicaciones y material de estudio.",
      brainstorm: "Este audio es una sesión de brainstorming. Prioriza ideas, oportunidades y posibilidades.",
      quick_idea: "Este audio es una idea rápida. Captura la esencia y sugiere cómo desarrollarla.",
      task: "Este audio describe tareas o pendientes. Extrae todo lo accionable.",
      journal: "Este audio es un diario o reflexión personal. Respeta el tono íntimo.",
      followup: "Este audio es un seguimiento. Enfócate en avances, bloqueos y próximos pasos.",
      reflection: "Este audio es una reflexión. Organiza los pensamientos de forma clara.",
    };

    const speakerInstr = isConversation
      ? `Este audio es una conversación entre ${speakersDetected} personas: ${speakers.map(s => s.default_name).join(", ")}. Atribuye declaraciones y tareas a personas específicas.`
      : "Este audio es de una sola persona hablando.";
    const templateInstr = templateContexts[template] || "";

    // Build mode-specific prompt (simplified — uses summary as default for backward compat)
    const modePrompts: Record<string, string> = {
      summary: `Analiza esta transcripción y genera un resumen ejecutivo.
${speakerInstr}
${templateInstr}

Transcripción:
"""
${truncated}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "título corto de 6-8 palabras",
  "summary": "resumen de 3-5 oraciones",
  "key_points": ["punto 1", "punto 2"],
  "topics": ["tema 1"],
  "speaker_highlights": []
}`,
      tasks: `Extrae TODAS las tareas de esta transcripción.
${speakerInstr}
${templateInstr}

Transcripción:
"""
${truncated}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "título corto",
  "tasks": [{"text": "tarea", "priority": "high", "responsible": null, "deadline_hint": null, "source_quote": "frase origen", "is_explicit": true}],
  "total_explicit": 0,
  "total_implicit": 0
}`,
      action_plan: `Convierte esta transcripción en un plan de acción.
${speakerInstr}
${templateInstr}

Transcripción:
"""
${truncated}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "título corto",
  "objective": "objetivo principal",
  "steps": [{"order": 1, "action": "qué hacer", "responsible": null, "depends_on": null, "estimated_effort": "bajo"}],
  "obstacles": [],
  "next_immediate_step": "lo primero que hacer",
  "success_criteria": "cómo saber que se cumplió"
}`,
      clean_text: `Reescribe esta transcripción como texto limpio y profesional.
${speakerInstr}
${templateInstr}

Transcripción:
"""
${truncated}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "título corto",
  "clean_text": "texto reescrito sin muletillas, bien puntuado",
  "format": "narrative",
  "word_count": 0
}`,
      executive_report: `Genera un reporte ejecutivo profesional.
${speakerInstr}
${templateInstr}

Transcripción:
"""
${truncated}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "título formal",
  "context": "contexto breve",
  "executive_summary": "resumen ejecutivo",
  "decisions": [],
  "key_points": [],
  "agreements": [],
  "pending_items": [],
  "next_steps": [],
  "participants": []
}`,
      ready_message: `Convierte esta transcripción en mensajes listos para enviar.
${speakerInstr}
${templateInstr}

Transcripción:
"""
${truncated}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "título corto",
  "messages": {"professional": "versión profesional", "friendly": "versión amable", "firm": "versión firme", "brief": "versión breve"},
  "suggested_subject": "asunto sugerido",
  "context_note": "para quién parece ir"
}`,
      study: `Convierte esta transcripción en material de estudio.
${speakerInstr}
${templateInstr}

Transcripción:
"""
${truncated}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "título del tema",
  "summary": "resumen en 3-4 oraciones",
  "key_concepts": [{"concept": "nombre", "explanation": "explicación"}],
  "review_points": [],
  "probable_questions": [{"question": "pregunta", "answer_hint": "pista"}],
  "mnemonics": [],
  "connections": []
}`,
      ideas: `Analiza esta transcripción como exploración de ideas.
${speakerInstr}
${templateInstr}

Transcripción:
"""
${truncated}
"""

Responde ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "title_suggestion": "nombre de la idea",
  "core_idea": "idea central en 2-3 oraciones",
  "opportunities": [{"opportunity": "oportunidad", "potential": "alto"}],
  "interesting_points": [],
  "open_questions": [],
  "suggested_next_step": "siguiente paso concreto",
  "structured_version": "idea reorganizada"
}`,
    };

    const claudeCtrl2 = new AbortController();
    const claudeTimer2 = setTimeout(() => claudeCtrl2.abort(), API_TIMEOUT_MS);

    let modeResult: Record<string, unknown>;
    try {
      const prompt = modePrompts[primary_mode] || modePrompts["summary"];
      const resultRaw = await callClaude(prompt, claudeCtrl2.signal);
      modeResult = safeJsonParse(resultRaw, { title_suggestion: "Nota de voz", summary: rawTranscript });
    } finally {
      clearTimeout(claudeTimer2);
    }

    const autoTitle = typeof modeResult.title_suggestion === "string" && modeResult.title_suggestion
      ? modeResult.title_suggestion
      : rawTranscript.split(" ").slice(0, 6).join(" ") + "...";

    // ── 7. Save to notes ──
    // For backward compatibility, also populate legacy fields
    const legacySummary = typeof modeResult.summary === "string" ? modeResult.summary : (typeof modeResult.executive_summary === "string" ? modeResult.executive_summary : "");
    const legacyKeyPoints = Array.isArray(modeResult.key_points) ? modeResult.key_points : [];
    const legacyTasks = Array.isArray(modeResult.tasks) ? (modeResult.tasks as Array<Record<string, unknown>>).map(t => typeof t === "string" ? t : String(t.text || "")) : [];
    const legacyCleanText = typeof modeResult.clean_text === "string" ? modeResult.clean_text : rawTranscript;

    await admin.from("notes").update({
      title: autoTitle,
      transcript: rawTranscript,
      summary: legacySummary,
      key_points: legacyKeyPoints,
      tasks: legacyTasks,
      clean_text: legacyCleanText,
      status: "done",
      speakers_detected: speakersDetected,
      is_conversation: isConversation,
      segments,
      speakers,
      primary_mode,
      template,
    }).eq("id", note_id);

    // ── 8. Save mode result ──
    await admin.from("mode_results").insert({
      note_id,
      mode: primary_mode,
      result: modeResult,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (_error) {
    try {
      await admin.from("notes").update({ status: "error", error_message: "Error procesando el audio. Intenta de nuevo." }).eq("id", note_id);
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ error: "Error procesando el audio." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
