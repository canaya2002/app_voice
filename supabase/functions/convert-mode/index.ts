// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_TRANSCRIPT_CHARS = 15000;
const API_TIMEOUT_MS = 120_000;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

// ── Free-tier mode allowlist ──────────────────────────────────────────────
const FREE_MODES = ["summary", "tasks", "clean_text", "ideas", "outline"];

// ── Rate limit config ──────────────────────────────────────────────────────
const DAILY_CONVERT_LIMITS: Record<string, number> = { free: 10, premium: 50, enterprise: 9999 };
const IP_RATE_LIMIT = 20;
const IP_RATE_WINDOW_MS = 3_600_000; // 1 hour

// ── Max tokens per mode ────────────────────────────────────────────────────
const MODE_MAX_TOKENS: Record<string, number> = {
  summary: 1100, tasks: 1400, action_plan: 1400, clean_text: 1300,
  executive_report: 1600, ready_message: 700, study: 1400, ideas: 1100, outline: 1400,
};

const CHART_HINT = `\nIf the result contains countable categories (e.g. priority distribution, effort levels, types), include "charts":[{"type":"bar","title":"Chart title","data":[{"label":"Category","value":count,"color":"#hex"}]}] (max 2 charts). Colors: #EF4444=high/urgent, #F59E0B=medium/warning, #22C55E=low/success, #3B82F6=info. Omit "charts" if nothing quantifiable.`;

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
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipHits) {
    if (now >= entry.resetAt) ipHits.delete(ip);
  }
}, 5 * 60_000);

function rateLimitResponse(message: string, limitType: "daily" | "per_hour", retryAfter: number | null, cors: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: "rate_limit_exceeded", message, retry_after: retryAfter, limit_type: limitType }),
    { status: 429, headers: { ...cors, "Content-Type": "application/json", ...(retryAfter != null ? { "Retry-After": String(retryAfter) } : {}) } },
  );
}

/** Compress transcript for prompts — reduces tokens without losing meaning */
function compressTranscript(text: string): string {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/([.!?,;])\s+/g, "$1 ")
    .replace(/\b(\w+)( \1){2,}/gi, "$1")
    .trim();
}

function buildModePrompt(mode: string, transcript: string, speakerInstr: string, templateInstr: string, tone?: string): string {
  const ctx = [speakerInstr, templateInstr].filter(Boolean).join(" ");
  const compressed = compressTranscript(transcript);
  const t = compressed.length > MAX_TRANSCRIPT_CHARS ? compressed.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[Truncated]" : compressed;
  const langInstr = "IMPORTANT: Respond in the SAME LANGUAGE as the transcript.";

  const prompts: Record<string, string> = {
    summary: `Extract an executive summary. ${langInstr}${ctx ? " " + ctx : ""}\n\nTranscript:\n"""\n${t}\n"""\n\nRespond ONLY with JSON:\n{"title_suggestion":"title 6-8 words","summary":"summary 3-5 sentences","key_points":["point"],"topics":["topic"],"speaker_highlights":[]}${CHART_HINT}`,
    tasks: `Extract ALL tasks. ${langInstr}${ctx ? " " + ctx : ""}\n\nTranscript:\n"""\n${t}\n"""\n\nRespond ONLY with JSON:\n{"title_suggestion":"title","tasks":[{"text":"task","priority":"high|medium|low","responsible":null,"deadline_hint":null,"source_quote":"quote","is_explicit":true}],"total_explicit":0,"total_implicit":0}${CHART_HINT}`,
    action_plan: `Convert into an action plan. ${langInstr}${ctx ? " " + ctx : ""}\n\nTranscript:\n"""\n${t}\n"""\n\nRespond ONLY with JSON:\n{"title_suggestion":"title","objective":"objective","steps":[{"order":1,"action":"what to do","responsible":null,"depends_on":null,"estimated_effort":"low|medium|high"}],"obstacles":[],"next_immediate_step":"first step","success_criteria":"criteria"}${CHART_HINT}`,
    clean_text: `Rewrite as clean, professional text. ${langInstr}${ctx ? " " + ctx : ""}\n\nTranscript:\n"""\n${t}\n"""\n\nRespond ONLY with JSON:\n{"title_suggestion":"title","clean_text":"rewritten text without filler words","format":"narrative","word_count":0}`,
    executive_report: `Generate an executive report. ${langInstr}${ctx ? " " + ctx : ""}\n\nTranscript:\n"""\n${t}\n"""\n\nRespond ONLY with JSON:\n{"title_suggestion":"title","context":"context","executive_summary":"summary","decisions":[],"key_points":[],"agreements":[],"pending_items":[],"next_steps":[],"participants":[]}${CHART_HINT}`,
    ready_message: `Generate ready-to-send messages. Preferred tone: ${tone || "professional"}. ${langInstr}${ctx ? " " + ctx : ""}\n\nTranscript:\n"""\n${t}\n"""\n\nRespond ONLY with JSON:\n{"title_suggestion":"title","messages":{"professional":"","friendly":"","firm":"","brief":""},"suggested_subject":"subject","context_note":"recipient"}`,
    study: `Convert into study material. ${langInstr}${ctx ? " " + ctx : ""}\n\nTranscript:\n"""\n${t}\n"""\n\nRespond ONLY with JSON:\n{"title_suggestion":"title","summary":"summary","key_concepts":[{"concept":"name","explanation":"explanation"}],"review_points":[],"probable_questions":[{"question":"question","answer_hint":"hint"}],"mnemonics":[],"connections":[]}${CHART_HINT}`,
    ideas: `Analyze as idea exploration. ${langInstr}${ctx ? " " + ctx : ""}\n\nTranscript:\n"""\n${t}\n"""\n\nRespond ONLY with JSON:\n{"title_suggestion":"name","core_idea":"core idea","opportunities":[{"opportunity":"opportunity","potential":"high|medium|low"}],"interesting_points":[],"open_questions":[],"suggested_next_step":"step","structured_version":"structured idea"}${CHART_HINT}`,
    outline: `Generate a hierarchical outline. ${langInstr}${ctx ? " " + ctx : ""}\n\nTranscript:\n"""\n${t}\n"""\n\nRespond ONLY with JSON:\n{"title_suggestion":"title","sections":[{"heading":"section title","points":["point"],"subsections":[{"heading":"subsection","points":["detail"]}]}],"duration_covered":"total duration","total_sections":0,"total_points":0}`,
  };
  return prompts[mode] || prompts["summary"];
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const ok = !origin
    || origin === "https://sythio.com"
    || origin === "https://www.sythio.com"
    || origin.endsWith(".sythio.vercel.app")
    || origin.startsWith("http://localhost")
    || origin.startsWith("exp://");
  return {
    "Access-Control-Allow-Origin": ok ? (origin || "*") : "https://sythio.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
  const ipCheck = checkIpRateLimit(clientIp);
  if (!ipCheck.allowed) return rateLimitResponse("Demasiadas solicitudes.", "per_hour", ipCheck.retryAfter, corsHeaders);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: "Sesión inválida" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Body inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

  const note_id = body.note_id as string | undefined;
  const target_mode = body.target_mode as string | undefined;
  const tone = body.tone as string | undefined;
  if (!note_id || !target_mode) return new Response(JSON.stringify({ error: "Parámetros inválidos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: note } = await admin.from("notes").select("*").eq("id", note_id).single();
  if (!note || note.user_id !== user.id) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // ── Mode gate ──
  const { data: profile } = await admin.from("profiles").select("plan, daily_count, last_reset_date, org_id").eq("id", user.id).single();
  const plan = profile?.plan || "free";

  // Enterprise: verify org active + user not suspended
  if (profile?.org_id) {
    const { data: org } = await admin.from("organizations").select("active").eq("id", profile.org_id).single();
    if (org && !org.active) {
      return new Response(
        JSON.stringify({ error: "org_inactive", message: "Tu organización no tiene una suscripción activa. Contacta a tu administrador." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { data: membership } = await admin.from("organization_members").select("status").eq("org_id", profile.org_id).eq("user_id", user.id).single();
    if (membership && membership.status === "suspended") {
      return new Response(
        JSON.stringify({ error: "user_suspended", message: "Tu cuenta en esta organización está suspendida. Contacta a tu administrador." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  if (plan === "free" && !FREE_MODES.includes(target_mode)) {
    return new Response(
      JSON.stringify({ error: "gate_exceeded", gate: "requires_premium", message: "Este modo requiere Premium." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Cache check ──
  const { data: existing } = await admin.from("mode_results").select("*").eq("note_id", note_id).eq("mode", target_mode).maybeSingle();
  if (existing) return new Response(JSON.stringify({ success: true, result: existing }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // ── Daily convert rate limit ──
  const dailyMax = DAILY_CONVERT_LIMITS[plan as keyof typeof DAILY_CONVERT_LIMITS] ?? DAILY_CONVERT_LIMITS.free;
  if (dailyMax !== Infinity) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { data: userNotes } = await admin.from("notes").select("id").eq("user_id", user.id);
    const noteIds = (userNotes || []).map((n: { id: string }) => n.id);
    let todayConversions = 0;
    if (noteIds.length > 0) {
      const { count } = await admin.from("mode_results").select("id", { count: "exact", head: true }).in("note_id", noteIds).gte("created_at", todayStart.toISOString());
      todayConversions = count ?? 0;
    }
    if (todayConversions >= dailyMax) {
      await admin.from("analytics_events").insert({
        user_id: user.id, event: "rate_limit_hit",
        properties: { limit_type: "daily", endpoint: "convert-mode", plan, conversions: todayConversions, daily_max: dailyMax },
      }).then(() => {});
      return rateLimitResponse(`Límite de ${dailyMax} reconversiones diarias alcanzado.`, "daily", null, corsHeaders);
    }
  }

  // ── Generate ──
  try {
    const isConversation = !!note.is_conversation;
    const speakersDetected = note.speakers_detected || 1;
    const speakers = (note.speakers || []) as Array<{ default_name: string; custom_name?: string }>;
    const speakerNames = speakers.map((s: { default_name: string; custom_name?: string }) => s.custom_name || s.default_name);

    const speakerInstr = isConversation
      ? `Conversación entre ${speakersDetected} personas: ${speakerNames.join(", ")}. Atribuye a cada persona.`
      : "";

    const templateContexts: Record<string, string> = {
      meeting: "Reunión.", client: "Cliente.", class: "Clase.", brainstorm: "Brainstorming.",
      quick_idea: "Idea rápida.", task: "Tareas.", journal: "Diario.", followup: "Seguimiento.", reflection: "Reflexión.",
    };
    const templateInstr = templateContexts[note.template || ""] || "";

    const prompt = buildModePrompt(target_mode, note.transcript || "", speakerInstr, templateInstr, tone);
    const maxTok = MODE_MAX_TOKENS[target_mode] || 900;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);

    let resultText: string;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: HAIKU_MODEL, max_tokens: maxTok, messages: [{ role: "user", content: prompt }] }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("LLM error");
      const data = await res.json();
      resultText = data.content[0].text;
    } finally { clearTimeout(timer); }

    let modeResult: Record<string, unknown>;
    try {
      const cleaned = resultText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      modeResult = JSON.parse(cleaned);
    } catch { modeResult = { error: "No se pudo procesar el resultado" }; }

    const { data: saved } = await admin.from("mode_results").insert({ note_id, mode: target_mode, result: modeResult, tone: tone || null }).select().single();

    return new Response(JSON.stringify({ success: true, result: saved }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ error: "Error al convertir. Intenta de nuevo." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
