// deno-lint-ignore-file
// Captcha verification — validates Cloudflare Turnstile tokens server-side.
//
// Used as a gate before signup on the web (and optionally other public actions).
// If TURNSTILE_SECRET_KEY is not set, the function ALLOWS all requests (graceful
// degradation — useful during initial deployment when Turnstile keys aren't ready).
//
// Public endpoint (verify_jwt = false in config.toml).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";

const corsHeaders = (req: Request): Record<string, string> => {
  const origin = req.headers.get("Origin") ?? "";
  const ok = !origin
    || origin === "https://sythio.app"
    || origin === "https://www.sythio.app"
    || origin.startsWith("http://localhost:")
    || origin.startsWith("http://127.0.0.1:");
  return {
    "Access-Control-Allow-Origin": ok ? (origin || "https://sythio.app") : "https://sythio.app",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
};

serve(async (req: Request) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  // If Turnstile not configured, allow all requests (graceful degradation).
  if (!TURNSTILE_SECRET) {
    return new Response(JSON.stringify({ ok: true, configured: false }), { status: 200, headers });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400, headers });
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: "Missing captcha token" }), { status: 400, headers });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip") || "";

  // Verify with Cloudflare Turnstile
  const formData = new URLSearchParams();
  formData.append("secret", TURNSTILE_SECRET);
  formData.append("response", token);
  if (clientIp) formData.append("remoteip", clientIp);

  try {
    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });
    const data = await verifyRes.json();

    if (data.success === true) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }
    return new Response(
      JSON.stringify({ ok: false, error: "Captcha failed", codes: data["error-codes"] ?? [] }),
      { status: 403, headers },
    );
  } catch {
    // If Cloudflare is down, fail open — better UX than blocking signups completely.
    // The IP rate limiting on signup-adjacent endpoints provides some protection.
    return new Response(JSON.stringify({ ok: true, fallback: true }), { status: 200, headers });
  }
});
