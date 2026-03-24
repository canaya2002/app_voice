// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_TRANSCRIPT_CHARS = 15000;
const API_TIMEOUT_MS = 120_000;

// Import prompts inline (Edge Functions can't import from app code)
function buildModePrompt(
  mode: string,
  transcript: string,
  speakerInstr: string,
  templateInstr: string,
  tone?: string
): string {
  const ctx = `${speakerInstr}\n${templateInstr}`.trim();
  const t = transcript.length > MAX_TRANSCRIPT_CHARS
    ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[Transcripción truncada]"
    : transcript;

  const prompts: Record<string, string> = {
    summary: `Analiza esta transcripción y genera un resumen ejecutivo.\n${ctx}\n\nTranscripción:\n"""\n${t}\n"""\n\nResponde ÚNICAMENTE con JSON válido, sin markdown ni backticks:\n{"title_suggestion":"título corto","summary":"resumen de 3-5 oraciones","key_points":[],"topics":[],"speaker_highlights":[]}`,
    tasks: `Extrae TODAS las tareas de esta transcripción.\n${ctx}\n\nTranscripción:\n"""\n${t}\n"""\n\nResponde ÚNICAMENTE con JSON válido, sin markdown ni backticks:\n{"title_suggestion":"título","tasks":[{"text":"tarea","priority":"medium","responsible":null,"deadline_hint":null,"source_quote":"","is_explicit":true}],"total_explicit":0,"total_implicit":0}`,
    action_plan: `Convierte esta transcripción en un plan de acción.\n${ctx}\n\nTranscripción:\n"""\n${t}\n"""\n\nResponde ÚNICAMENTE con JSON válido, sin markdown ni backticks:\n{"title_suggestion":"título","objective":"objetivo","steps":[{"order":1,"action":"qué hacer","responsible":null,"depends_on":null,"estimated_effort":"bajo"}],"obstacles":[],"next_immediate_step":"lo primero","success_criteria":"criterio"}`,
    clean_text: `Reescribe esta transcripción como texto limpio y profesional.\n${ctx}\n\nTranscripción:\n"""\n${t}\n"""\n\nResponde ÚNICAMENTE con JSON válido, sin markdown ni backticks:\n{"title_suggestion":"título","clean_text":"texto reescrito","format":"narrative","word_count":0}`,
    executive_report: `Genera un reporte ejecutivo profesional.\n${ctx}\n\nTranscripción:\n"""\n${t}\n"""\n\nResponde ÚNICAMENTE con JSON válido, sin markdown ni backticks:\n{"title_suggestion":"título","context":"contexto","executive_summary":"resumen","decisions":[],"key_points":[],"agreements":[],"pending_items":[],"next_steps":[],"participants":[]}`,
    ready_message: `Convierte esta transcripción en mensajes listos para enviar.\nTono preferido: ${tone || "professional"}\n${ctx}\n\nTranscripción:\n"""\n${t}\n"""\n\nResponde ÚNICAMENTE con JSON válido, sin markdown ni backticks:\n{"title_suggestion":"título","messages":{"professional":"","friendly":"","firm":"","brief":""},"suggested_subject":"","context_note":""}`,
    study: `Convierte esta transcripción en material de estudio.\n${ctx}\n\nTranscripción:\n"""\n${t}\n"""\n\nResponde ÚNICAMENTE con JSON válido, sin markdown ni backticks:\n{"title_suggestion":"título","summary":"resumen","key_concepts":[{"concept":"","explanation":""}],"review_points":[],"probable_questions":[{"question":"","answer_hint":""}],"mnemonics":[],"connections":[]}`,
    ideas: `Analiza esta transcripción como exploración de ideas.\n${ctx}\n\nTranscripción:\n"""\n${t}\n"""\n\nResponde ÚNICAMENTE con JSON válido, sin markdown ni backticks:\n{"title_suggestion":"nombre","core_idea":"idea central","opportunities":[{"opportunity":"","potential":"alto"}],"interesting_points":[],"open_questions":[],"suggested_next_step":"","structured_version":""}`,
  };
  return prompts[mode] || prompts["summary"];
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
  const target_mode = body.target_mode as string | undefined;
  const tone = body.tone as string | undefined;

  if (!note_id || typeof note_id !== "string" || !target_mode || typeof target_mode !== "string") {
    return new Response(JSON.stringify({ error: "Parámetros inválidos" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Verify ownership + fetch note
  const { data: note } = await admin.from("notes").select("*").eq("id", note_id).single();
  if (!note || note.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  // Check if already generated
  const { data: existing } = await admin.from("mode_results")
    .select("*")
    .eq("note_id", note_id)
    .eq("mode", target_mode)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ success: true, result: existing }), { headers: { "Content-Type": "application/json" } });
  }

  try {
    const isConversation = !!note.is_conversation;
    const speakersDetected = note.speakers_detected || 1;
    const speakers = (note.speakers || []) as Array<{ default_name: string; custom_name?: string }>;
    const speakerNames = speakers.map(s => s.custom_name || s.default_name);

    const speakerInstr = isConversation
      ? `Este audio es una conversación entre ${speakersDetected} personas: ${speakerNames.join(", ")}. Atribuye declaraciones y tareas a personas específicas.`
      : "Este audio es de una sola persona hablando.";

    const templateContexts: Record<string, string> = {
      meeting: "Grabación de reunión. Prioriza acuerdos y pendientes.",
      client: "Conversación con cliente. Prioriza compromisos.",
      class: "Clase o conferencia. Prioriza conceptos.",
      brainstorm: "Sesión de brainstorming. Prioriza ideas.",
      quick_idea: "Idea rápida.",
      task: "Descripción de tareas.",
      journal: "Diario personal.",
      followup: "Seguimiento.",
      reflection: "Reflexión.",
    };
    const templateInstr = templateContexts[note.template || ""] || "";

    const prompt = buildModePrompt(target_mode, note.transcript || "", speakerInstr, templateInstr, tone);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);

    let resultText: string;
    try {
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
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("LLM error");
      const data = await res.json();
      resultText = data.content[0].text;
    } finally {
      clearTimeout(timer);
    }

    let modeResult: Record<string, unknown>;
    try {
      const cleaned = resultText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      modeResult = JSON.parse(cleaned);
    } catch {
      modeResult = { error: "No se pudo procesar el resultado" };
    }

    const { data: saved } = await admin.from("mode_results").insert({
      note_id,
      mode: target_mode,
      result: modeResult,
      tone: tone || null,
    }).select().single();

    return new Response(JSON.stringify({ success: true, result: saved }), { headers: { "Content-Type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ error: "Error al convertir. Intenta de nuevo." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
