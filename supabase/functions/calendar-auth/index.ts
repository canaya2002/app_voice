// deno-lint-ignore-file
/**
 * Sythio Google Calendar OAuth Handler
 *
 * Handles the OAuth2 flow for Google Calendar:
 *   GET  ?action=authorize&user_id=X  → Redirects to Google consent screen
 *   GET  ?action=callback&code=X&state=X → Exchanges code for tokens, saves to integrations
 *   POST ?action=disconnect            → Removes calendar integration
 *   GET  ?action=events&user_id=X      → Lists upcoming calendar events
 *
 * Env vars needed (set in Supabase Dashboard → Edge Functions → Secrets):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/calendar-auth?action=callback`;
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events.readonly";

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const ok =
    !origin ||
    origin === "https://sythio.app" ||
    origin === "https://www.sythio.app" ||
    origin.endsWith(".sythio.vercel.app") ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("exp://");
  return {
    "Access-Control-Allow-Origin": ok ? origin || "https://sythio.app" : "https://sythio.app",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return new Response(JSON.stringify({
      error: "Google Calendar no configurado",
      setup: "Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Supabase → Edge Functions → Secrets",
    }), { status: 503, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } });
  }

  switch (action) {
    // ── Step 1: Redirect to Google ──
    case "authorize": {
      const userId = url.searchParams.get("user_id");
      const returnUrl = url.searchParams.get("return_url") || "https://sythio.app";
      if (!userId) return new Response("user_id required", { status: 400 });

      const state = btoa(JSON.stringify({ user_id: userId, return_url: returnUrl }));
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");

      return Response.redirect(authUrl.toString(), 302);
    }

    // ── Step 2: Google redirects back with code ──
    case "callback": {
      const code = url.searchParams.get("code");
      const stateRaw = url.searchParams.get("state");
      if (!code || !stateRaw) return new Response("Missing code or state", { status: 400 });

      let state: { user_id: string; return_url: string };
      try { state = JSON.parse(atob(stateRaw)); } catch { return new Response("Invalid state", { status: 400 }); }

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        return new Response(`Token exchange failed: ${errText}`, { status: 502 });
      }

      const tokens = await tokenRes.json();

      // Get primary calendar info
      let calendarId = "primary";
      try {
        const calRes = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (calRes.ok) {
          const cal = await calRes.json();
          calendarId = cal.id || "primary";
        }
      } catch { /* use primary */ }

      // Save to integrations
      await admin.from("integrations").upsert({
        user_id: state.user_id,
        provider: "google_calendar",
        config: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expiry: Date.now() + (tokens.expires_in * 1000),
          calendar_id: calendarId,
          scope: tokens.scope,
        },
        enabled: true,
      }, { onConflict: "user_id,provider" });

      // Redirect back to app
      const returnUrl = new URL(state.return_url);
      returnUrl.searchParams.set("calendar_connected", "true");
      return Response.redirect(returnUrl.toString(), 302);
    }

    // ── Disconnect ──
    case "disconnect": {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return new Response("Unauthorized", { status: 401, headers: getCorsHeaders() });

      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return new Response("Unauthorized", { status: 401, headers: getCorsHeaders() });

      await admin.from("integrations").delete().eq("user_id", user.id).eq("provider", "google_calendar");
      return new Response(JSON.stringify({ success: true }), { headers: { ...getCorsHeaders(), "Content-Type": "application/json" } });
    }

    // ── List events ──
    case "events": {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return new Response("Unauthorized", { status: 401, headers: getCorsHeaders() });

      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return new Response("Unauthorized", { status: 401, headers: getCorsHeaders() });

      const { data: integration } = await admin.from("integrations")
        .select("config").eq("user_id", user.id).eq("provider", "google_calendar").single();

      if (!integration) {
        return new Response(JSON.stringify({ error: "Calendar not connected" }), {
          status: 404, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
        });
      }

      let accessToken = (integration.config as any).access_token;
      const tokenExpiry = (integration.config as any).token_expiry || 0;
      const refreshToken = (integration.config as any).refresh_token;

      // Refresh token if expired
      if (Date.now() > tokenExpiry && refreshToken) {
        const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            grant_type: "refresh_token",
          }),
        });
        if (refreshRes.ok) {
          const newTokens = await refreshRes.json();
          accessToken = newTokens.access_token;
          await admin.from("integrations").update({
            config: { ...(integration.config as any), access_token: accessToken, token_expiry: Date.now() + (newTokens.expires_in * 1000) },
          }).eq("user_id", user.id).eq("provider", "google_calendar");
        }
      }

      // Fetch events
      const now = new Date().toISOString();
      const maxTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const eventsRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&timeMax=${maxTime}&maxResults=20&singleEvents=true&orderBy=startTime`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!eventsRes.ok) {
        return new Response(JSON.stringify({ error: "Failed to fetch events" }), {
          status: 502, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
        });
      }

      const eventsData = await eventsRes.json();
      const events = (eventsData.items || []).map((e: any) => ({
        id: e.id,
        title: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        meet_link: e.hangoutLink || e.conferenceData?.entryPoints?.[0]?.uri,
        attendees: (e.attendees || []).length,
      }));

      return new Response(JSON.stringify({ events }), {
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    default:
      return new Response(JSON.stringify({ error: "Unknown action", actions: ["authorize", "callback", "disconnect", "events"] }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
  }
});
