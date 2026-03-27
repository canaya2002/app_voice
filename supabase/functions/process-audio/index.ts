// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_TRANSCRIPT_CHARS = 15000;
const API_TIMEOUT_MS = 120_000;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

// ── Free-tier mode allowlist (must match client lib/constants.ts FREE_MODES) ──
const FREE_MODES = ["summary", "tasks", "clean_text", "ideas"];

// ── Rate limit config ──────────────────────────────────────────────────────
const DAILY_LIMITS = { free: 2, premium: Infinity };
const PREMIUM_MAX_DAILY_AUDIO_MINUTES = 120;
const IP_RATE_LIMIT = 10;
const IP_RATE_WINDOW_MS = 60_000;

// ── Max tokens per mode (tuned for Haiku output) ──────────────────────────
const MODE_MAX_TOKENS: Record<string, number> = {
  summary: 900,
  tasks: 1100,
  action_plan: 1100,
  clean_text: 1300,
  executive_report: 1300,
  ready_message: 700,
  study: 1100,
  ideas: 900,
};

// In-memory IP rate limiter (resets on cold start — acceptable for edge functions)
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkIpRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = ipHits.get(ip);

  if (!entry || now >= entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + IP_RATE_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  entry.count++;
  if (entry.count > IP_RATE_LIMIT) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true, retryAfter: 0 };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipHits) {
    if (now >= entry.resetAt) ipHits.delete(ip);
  }
}, 5 * 60_000);

// ── Helpers ────────────────────────────────────────────────────────────────

async function callClaude(prompt: string, maxTokens: number, signal: AbortSignal): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: maxTokens,
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

/** Compress transcript for prompts — reduces tokens without losing meaning */
function compressTranscript(text: string): string {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/([.!?,;])\s+/g, "$1 ")
    .replace(/\b(\w+)( \1){2,}/gi, "$1")
    .trim();
}

function rateLimitResponse(
  message: string,
  limitType: "daily" | "per_minute",
  retryAfter: number | null,
  cors: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: "rate_limit_exceeded",
      message,
      retry_after: retryAfter,
      limit_type: limitType,
    }),
    {
      status: 429,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        ...(retryAfter != null ? { "Retry-After": String(retryAfter) } : {}),
      },
    },
  );
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Main handler ───────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── IP rate limit (layer 1 — before any DB work) ──
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
  const ipCheck = checkIpRateLimit(clientIp);
  if (!ipCheck.allowed) {
    return rateLimitResponse("Demasiadas solicitudes. Espera un momento.", "per_minute", ipCheck.retryAfter, corsHeaders);
  }

  // ── Auth ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Sesión inválida" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Body inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const note_id = body.note_id as string | undefined;
  const audio_path = body.audio_path as string | undefined;
  const template = (body.template as string) || "quick_idea";
  const primary_mode = (body.primary_mode as string) || "summary";

  if (!note_id || typeof note_id !== "string" || !audio_path || typeof audio_path !== "string") {
    return new Response(JSON.stringify({ error: "Parámetros inválidos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!audio_path.startsWith(`${user.id}/`)) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Fetch profile + rate limits ──
  const { data: profile } = await admin.from("profiles").select("plan, daily_count, daily_audio_minutes, last_reset_date").eq("id", user.id).single();
  if (!profile) {
    return new Response(JSON.stringify({ error: "Perfil no encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const today = new Date().toISOString().split("T")[0];
  let dailyCount = profile.daily_count ?? 0;
  let dailyAudioMinutes = profile.daily_audio_minutes ?? 0;

  // Auto-reset if new day
  if (profile.last_reset_date < today) {
    await admin.from("profiles").update({ daily_count: 0, daily_audio_minutes: 0, last_reset_date: today }).eq("id", user.id);
    dailyCount = 0;
    dailyAudioMinutes = 0;
  }

  const plan = profile.plan || "free";

  // ── Free: daily note count limit ──
  if (plan === "free") {
    const dailyMax = DAILY_LIMITS.free;
    if (dailyCount >= dailyMax) {
      await admin.from("analytics_events").insert({
        user_id: user.id, event: "rate_limit_hit",
        properties: { function: "process-audio", plan, daily_count: dailyCount, daily_max: dailyMax },
      }).then(() => {});
      return rateLimitResponse(`Has alcanzado el límite diario de ${dailyMax} notas. Actualiza a Premium para continuar.`, "daily", null, corsHeaders);
    }
  }

  // ── Ownership check ──
  const { data: noteCheck } = await admin.from("notes").select("user_id, retry_count, audio_duration").eq("id", note_id).single();
  if (!noteCheck || noteCheck.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── Premium: daily audio minutes limit ──
  if (plan === "premium") {
    const audioDurationMin = ((noteCheck as Record<string, unknown>).audio_duration as number || 0) / 60;
    if ((dailyAudioMinutes + audioDurationMin) > PREMIUM_MAX_DAILY_AUDIO_MINUTES) {
      return new Response(
        JSON.stringify({ error: "daily_minutes_exceeded", message: "Has alcanzado el límite de 120 minutos diarios de audio." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // ── Mode gate ──
  if (plan === "free" && !FREE_MODES.includes(primary_mode)) {
    return new Response(
      JSON.stringify({ error: "gate_exceeded", gate: "requires_premium", message: "Este modo requiere Premium." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Increment daily count NOW (before expensive work) ──
  if (plan === "free") {
    await admin.from("profiles").update({ daily_count: dailyCount + 1 }).eq("id", user.id);
  }

  // Increment retry_count
  const currentRetry = (noteCheck as Record<string, unknown>).retry_count as number | undefined;
  await admin.from("notes").update({ retry_count: (currentRetry ?? 0) + (body.is_retry ? 1 : 0) }).eq("id", note_id);

  try {
    // ── 1. Status: transcribing ──
    await admin.from("notes").update({ status: "transcribing", error_message: null }).eq("id", note_id);

    // ── 2. Download audio ──
    const { data: audioData, error: dlError } = await admin.storage.from("audio-files").download(audio_path);
    if (dlError) throw new Error(`download_failed: ${dlError.message}`);

    // ── 3. Groq Whisper transcription ──
    const whisperCtrl = new AbortController();
    const whisperTimer = setTimeout(() => whisperCtrl.abort(), API_TIMEOUT_MS);

    const formData = new FormData();
    formData.append("file", audioData, "audio.m4a");
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("language", "es");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");

    let whisperSegments: Array<{ start: number; end: number; text: string }> = [];
    let rawTranscript = "";

    try {
      const whisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        body: formData,
        signal: whisperCtrl.signal,
      });

      if (!whisperRes.ok) {
        const status = whisperRes.status;
        if (status === 413) throw new Error("transcription_failed: El archivo de audio supera el límite de 25MB");
        if (status === 429) throw new Error("transcription_failed: Límite de transcripción alcanzado. Intenta en unos minutos.");
        if (status === 503) throw new Error("transcription_failed: Servicio de transcripción no disponible temporalmente");
        throw new Error(`transcription_failed: Groq HTTP ${status}`);
      }

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

    // ── 4. Save transcript (original, uncompressed) ──
    await admin.from("notes").update({ transcript: rawTranscript, status: "processing" }).eq("id", note_id);

    // ── 5. Speaker detection via Claude Haiku ──
    const claudeCtrl1 = new AbortController();
    const claudeTimer1 = setTimeout(() => claudeCtrl1.abort(), API_TIMEOUT_MS);

    let speakersDetected = 1;
    let isConversation = false;
    let segments: Array<{ start: number; end: number; speaker: string; text: string }> = [];

    try {
      const speakerPrompt = `Analiza estos segmentos de audio y asigna un hablante a cada uno.

Responde ÚNICAMENTE con JSON, sin texto adicional:
{"speakers_count":<int>,"is_conversation":<bool>,"segments":[{"start":<float>,"end":<float>,"speaker":"Speaker 1","text":"..."}]}

Reglas:
- Usa "Speaker 1", "Speaker 2", etc.
- Si solo hay una voz: speakers_count=1, is_conversation=false
- Agrupa segmentos consecutivos del mismo hablante

Segmentos:
${JSON.stringify(whisperSegments.map((s, i) => ({ i, t: s.text })))}`;

      const speakerRaw = await callClaude(speakerPrompt, 600, claudeCtrl1.signal);
      const speakerResult = safeJsonParse(speakerRaw, {
        speakers_count: 1,
        is_conversation: false,
        segments: whisperSegments.map(s => ({ ...s, speaker: "Speaker 1" })),
      });

      speakersDetected = Number(speakerResult.speakers_count) || 1;
      isConversation = !!speakerResult.is_conversation;

      // Map speaker result segments back with timestamps
      const resultSegs = Array.isArray(speakerResult.segments) ? speakerResult.segments as Array<Record<string, unknown>> : [];
      segments = resultSegs.map((rs, i) => ({
        start: Number(rs.start) || (whisperSegments[i]?.start ?? 0),
        end: Number(rs.end) || (whisperSegments[i]?.end ?? 0),
        speaker: String(rs.speaker || "Speaker 1"),
        text: String(rs.text || whisperSegments[i]?.text || ""),
      }));

      if (segments.length === 0) {
        segments = whisperSegments.map(s => ({ ...s, speaker: "Speaker 1" }));
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

    // ── 6. Process with primary mode (compressed transcript for prompt) ──
    const transcriptForPrompt = compressTranscript(rawTranscript);
    const truncated = transcriptForPrompt.length > MAX_TRANSCRIPT_CHARS
      ? transcriptForPrompt.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[Truncado]"
      : transcriptForPrompt;

    const templateContexts: Record<string, string> = {
      meeting: "Reunión. Prioriza acuerdos, decisiones y pendientes.",
      client: "Cliente. Prioriza compromisos y próximos pasos.",
      class: "Clase. Prioriza conceptos y material de estudio.",
      brainstorm: "Brainstorming. Prioriza ideas y oportunidades.",
      quick_idea: "Idea rápida.", task: "Tareas.", journal: "Diario.",
      followup: "Seguimiento.", reflection: "Reflexión.",
    };

    const speakerInstr = isConversation
      ? `Conversación entre ${speakersDetected} personas: ${speakers.map(s => s.default_name).join(", ")}. Atribuye a cada persona.`
      : "";
    const templateInstr = templateContexts[template] || "";
    const ctx = [speakerInstr, templateInstr].filter(Boolean).join(" ");

    const modePrompts: Record<string, string> = {
      summary: `Extrae un resumen ejecutivo de esta transcripción.${ctx ? " " + ctx : ""}\n\nTranscripción:\n"""\n${truncated}\n"""\n\nResponde ÚNICAMENTE con JSON:\n{"title_suggestion":"título 6-8 palabras","summary":"resumen 3-5 oraciones","key_points":["punto"],"topics":["tema"],"speaker_highlights":[]}`,
      tasks: `Extrae TODAS las tareas de esta transcripción.${ctx ? " " + ctx : ""}\n\nTranscripción:\n"""\n${truncated}\n"""\n\nResponde ÚNICAMENTE con JSON:\n{"title_suggestion":"título","tasks":[{"text":"tarea","priority":"high|medium|low","responsible":null,"deadline_hint":null,"source_quote":"frase","is_explicit":true}],"total_explicit":0,"total_implicit":0}`,
      action_plan: `Convierte en plan de acción.${ctx ? " " + ctx : ""}\n\nTranscripción:\n"""\n${truncated}\n"""\n\nResponde ÚNICAMENTE con JSON:\n{"title_suggestion":"título","objective":"objetivo","steps":[{"order":1,"action":"qué hacer","responsible":null,"depends_on":null,"estimated_effort":"bajo|medio|alto"}],"obstacles":[],"next_immediate_step":"primero","success_criteria":"criterio"}`,
      clean_text: `Reescribe como texto limpio y profesional.${ctx ? " " + ctx : ""}\n\nTranscripción:\n"""\n${truncated}\n"""\n\nResponde ÚNICAMENTE con JSON:\n{"title_suggestion":"título","clean_text":"texto reescrito sin muletillas","format":"narrative","word_count":0}`,
      executive_report: `Genera reporte ejecutivo.${ctx ? " " + ctx : ""}\n\nTranscripción:\n"""\n${truncated}\n"""\n\nResponde ÚNICAMENTE con JSON:\n{"title_suggestion":"título","context":"contexto","executive_summary":"resumen","decisions":[],"key_points":[],"agreements":[],"pending_items":[],"next_steps":[],"participants":[]}`,
      ready_message: `Genera mensajes listos para enviar.${ctx ? " " + ctx : ""}\n\nTranscripción:\n"""\n${truncated}\n"""\n\nResponde ÚNICAMENTE con JSON:\n{"title_suggestion":"título","messages":{"professional":"","friendly":"","firm":"","brief":""},"suggested_subject":"asunto","context_note":"destinatario"}`,
      study: `Convierte en material de estudio.${ctx ? " " + ctx : ""}\n\nTranscripción:\n"""\n${truncated}\n"""\n\nResponde ÚNICAMENTE con JSON:\n{"title_suggestion":"título","summary":"resumen","key_concepts":[{"concept":"nombre","explanation":"explicación"}],"review_points":[],"probable_questions":[{"question":"pregunta","answer_hint":"pista"}],"mnemonics":[],"connections":[]}`,
      ideas: `Analiza como exploración de ideas.${ctx ? " " + ctx : ""}\n\nTranscripción:\n"""\n${truncated}\n"""\n\nResponde ÚNICAMENTE con JSON:\n{"title_suggestion":"nombre","core_idea":"idea central","opportunities":[{"opportunity":"oportunidad","potential":"alto|medio|bajo"}],"interesting_points":[],"open_questions":[],"suggested_next_step":"paso","structured_version":"idea organizada"}`,
    };

    const claudeCtrl2 = new AbortController();
    const claudeTimer2 = setTimeout(() => claudeCtrl2.abort(), API_TIMEOUT_MS);

    let modeResult: Record<string, unknown>;
    try {
      const prompt = modePrompts[primary_mode] || modePrompts["summary"];
      const maxTok = MODE_MAX_TOKENS[primary_mode] || 900;
      const resultRaw = await callClaude(prompt, maxTok, claudeCtrl2.signal);
      modeResult = safeJsonParse(resultRaw, { title_suggestion: "Nota de voz", summary: rawTranscript });
    } finally {
      clearTimeout(claudeTimer2);
    }

    const autoTitle = typeof modeResult.title_suggestion === "string" && modeResult.title_suggestion
      ? modeResult.title_suggestion
      : rawTranscript.split(" ").slice(0, 6).join(" ") + "...";

    // ── 7. Save to notes (original transcript, not compressed) ──
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
    await admin.from("mode_results").insert({ note_id, mode: primary_mode, result: modeResult });

    // ── 9. Update daily audio minutes for premium users ──
    if (plan === "premium") {
      const audioDurationMin = Math.ceil(((noteCheck as Record<string, unknown>).audio_duration as number || 0) / 60);
      await admin.from("profiles").update({ daily_audio_minutes: dailyAudioMinutes + audioDurationMin }).eq("id", user.id);
    }

    // ── 10. Push notification (if user has token) ──
    // TODO: Uncomment when ready
    // const { data: pushProfile } = await admin.from("profiles").select("push_token").eq("id", user.id).single();
    // if (pushProfile?.push_token) {
    //   await fetch("https://exp.host/--/api/v2/push/send", {
    //     method: "POST", headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ to: pushProfile.push_token, title: "Tu nota está lista", body: autoTitle, data: { noteId: note_id }, sound: "default" }),
    //   }).catch(() => {});
    // }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (_error) {
    const errMsg = _error instanceof Error ? _error.message : "unknown_error";

    let errorType: string;
    let userMessage: string;

    if (errMsg.startsWith("transcription_failed") || errMsg.includes("Groq") || errMsg.includes("Whisper")) {
      errorType = "transcription_failed";
      userMessage = errMsg.includes("25MB") ? "El archivo de audio supera el límite de 25MB."
        : errMsg.includes("Límite") ? "Límite de transcripción alcanzado. Intenta en unos minutos."
        : errMsg.includes("no disponible") ? "Servicio de transcripción no disponible temporalmente."
        : "No pudimos transcribir este audio. Verifica que tiene voz clara.";
      // Rollback daily count
      if (plan === "free") {
        await admin.from("profiles").update({ daily_count: dailyCount }).eq("id", user.id).then(() => {});
      }
    } else if (errMsg.startsWith("download_failed")) {
      errorType = "download_failed";
      userMessage = "No se pudo descargar el audio. Intenta de nuevo.";
      if (plan === "free") {
        await admin.from("profiles").update({ daily_count: dailyCount }).eq("id", user.id).then(() => {});
      }
    } else {
      errorType = "processing_failed";
      userMessage = "La transcripción fue exitosa pero falló al generar el resultado. Puedes reintentar.";
    }

    try {
      await admin.from("notes").update({ status: "error", error_message: `${errorType}: ${errMsg}` }).eq("id", note_id);
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: errorType, message: userMessage, detail: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
