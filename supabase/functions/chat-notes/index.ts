// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAX_CONTEXT_CHARS = 12000;
const MAX_NOTES_CONTEXT = 5;

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const ok = !origin || origin.includes("sythio") || origin.endsWith(".vercel.app") || origin.startsWith("http://localhost") || origin.startsWith("exp://");
  return {
    "Access-Control-Allow-Origin": ok ? (origin || "*") : "https://sythio.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

  const question = body.question as string | undefined;
  if (!question || typeof question !== "string" || question.length > 500) {
    return new Response(JSON.stringify({ error: "Pregunta inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Fetch user's recent notes for context ──
  const { data: notes } = await admin
    .from("notes")
    .select("id, title, summary, transcript, key_points, tasks, clean_text, created_at, primary_mode, template, speakers_detected")
    .eq("user_id", user.id)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!notes || notes.length === 0) {
    return new Response(
      JSON.stringify({ answer: "Aún no tienes notas procesadas. Graba tu primer audio para poder hacerme preguntas.", sources: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Simple text search to find relevant notes ──
  const queryWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const scored = notes.map((note) => {
    const haystack = [
      note.title, note.summary, note.transcript,
      ...(Array.isArray(note.key_points) ? note.key_points : []),
      ...(Array.isArray(note.tasks) ? note.tasks : []),
    ].join(" ").toLowerCase();

    let score = 0;
    for (const w of queryWords) {
      if (haystack.includes(w)) score++;
    }
    // Recency boost
    const daysAgo = (Date.now() - new Date(note.created_at).getTime()) / 86400000;
    if (daysAgo < 1) score += 2;
    else if (daysAgo < 7) score += 1;

    return { note, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const relevant = scored.slice(0, MAX_NOTES_CONTEXT).filter(s => s.score > 0);

  // If no relevant notes found, use the most recent ones
  const contextNotes = relevant.length > 0
    ? relevant.map(r => r.note)
    : notes.slice(0, 3);

  // ── Build context from notes ──
  let contextChars = 0;
  const contextBlocks: string[] = [];
  const sourceIds: string[] = [];

  for (const note of contextNotes) {
    const block = `[Nota: "${note.title}" | ${note.created_at}]
Resumen: ${note.summary || "Sin resumen"}
Puntos clave: ${Array.isArray(note.key_points) ? note.key_points.join("; ") : ""}
Tareas: ${Array.isArray(note.tasks) ? note.tasks.join("; ") : ""}
Transcripción: ${(note.transcript || "").slice(0, 2000)}`;

    if (contextChars + block.length > MAX_CONTEXT_CHARS) break;
    contextBlocks.push(block);
    sourceIds.push(note.id);
    contextChars += block.length;
  }

  // ── Call Claude ──
  const systemPrompt = `You are Sythio AI, a helpful assistant that answers questions about the user's voice notes and recordings.
You have access to the user's notes provided below. Answer based ONLY on the information in these notes.
If the answer isn't in the notes, say so honestly.
Respond in the SAME LANGUAGE as the user's question.
Be concise and direct. Reference specific notes when possible.`;

  const userPrompt = `My notes:\n\n${contextBlocks.join("\n\n---\n\n")}\n\nQuestion: ${question}`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: ctrl.signal,
    });

    clearTimeout(timer);

    if (!res.ok) throw new Error("LLM error");
    const data = await res.json();
    const answer = data.content[0].text;

    return new Response(
      JSON.stringify({ answer, sources: sourceIds }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "No pude procesar tu pregunta. Intenta de nuevo." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
