// deno-lint-ignore-file
/**
 * Sythio Slack Notifier
 *
 * Called after a note finishes processing. Sends a formatted summary
 * to the user's configured Slack webhook.
 *
 * Body: { user_id, note_id }
 * Can also be called from process-audio after completion.
 *
 * Cost: $0 — Slack incoming webhooks are free.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const { user_id, note_id } = body as { user_id?: string; note_id?: string };

    if (!user_id || !note_id) {
      return new Response(JSON.stringify({ error: "user_id and note_id required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get Slack integration
    const { data: integration } = await admin
      .from("integrations")
      .select("config, enabled, last_notified_at")
      .eq("user_id", user_id)
      .eq("provider", "slack")
      .maybeSingle();

    if (!integration || !integration.enabled) {
      return new Response(JSON.stringify({ skipped: true, reason: "No Slack integration" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── Debounce — skip if we already notified this user in the last 60 seconds. ──
    // Protects against burst-DoS on the user's Slack workspace if process-audio
    // is retried multiple times for the same note.
    const DEBOUNCE_MS = 60_000;
    if (integration.last_notified_at) {
      const lastMs = new Date(integration.last_notified_at as string).getTime();
      if (Date.now() - lastMs < DEBOUNCE_MS) {
        return new Response(JSON.stringify({ skipped: true, reason: "Debounced" }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }

    const config = integration.config as { webhook_url?: string; channel_name?: string; notify_on?: string[] };
    const webhookUrl = config.webhook_url;

    if (!webhookUrl) {
      return new Response(JSON.stringify({ skipped: true, reason: "No webhook URL" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Get note
    const { data: note } = await admin
      .from("notes")
      .select("title, summary, transcript, key_points, tasks, speakers_detected, is_conversation, audio_duration, primary_mode, template")
      .eq("id", note_id)
      .single();

    if (!note) {
      return new Response(JSON.stringify({ error: "Note not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Build Slack message
    const durationMin = Math.ceil((note.audio_duration || 0) / 60);
    const keyPoints = Array.isArray(note.key_points) ? note.key_points as string[] : [];
    const tasks = Array.isArray(note.tasks) ? note.tasks as string[] : [];

    const blocks: Record<string, unknown>[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `📝 ${note.title || "Nueva nota"}`, emoji: true },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `⏱ ${durationMin} min` },
          ...(note.is_conversation ? [{ type: "mrkdwn", text: `👥 ${note.speakers_detected} hablantes` }] : []),
          ...(note.template ? [{ type: "mrkdwn", text: `📋 ${note.template}` }] : []),
        ],
      },
    ];

    if (note.summary) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Resumen*\n${note.summary}` },
      });
    }

    if (keyPoints.length > 0) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Puntos clave*\n${keyPoints.map(p => `• ${p}`).join("\n")}` },
      });
    }

    if (tasks.length > 0) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Tareas*\n${tasks.slice(0, 5).map(t => `☐ ${typeof t === 'string' ? t : (t as any).text || ''}`).join("\n")}${tasks.length > 5 ? `\n_...y ${tasks.length - 5} más_` : ""}` },
      });
    }

    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: "_Generado con Sythio_" }],
    });

    // Send to Slack
    const slackRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });

    if (!slackRes.ok) {
      const errText = await slackRes.text();
      return new Response(JSON.stringify({ error: "Slack webhook failed", detail: errText }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Update debounce timestamp + log event (fire-and-forget)
    admin
      .from("integrations")
      .update({ last_notified_at: new Date().toISOString() })
      .eq("user_id", user_id)
      .eq("provider", "slack")
      .then(() => {});

    await admin.from("analytics_events").insert({
      user_id, event: "slack_notification_sent",
      properties: { note_id, template: note.template },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
