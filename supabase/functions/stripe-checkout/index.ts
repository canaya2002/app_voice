// deno-lint-ignore-file
// Stripe Checkout — creates a Checkout Session and returns its URL.
// Invoked from the web dashboard when a free user clicks "Upgrade".
//
// Auth: requires a Supabase JWT (client invokes via supabase.functions.invoke).
// Output: { checkoutUrl: string }
//
// Required env vars:
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_PREMIUM_MONTHLY
//   STRIPE_PRICE_PREMIUM_YEARLY
//   STRIPE_PRICE_ENTERPRISE_MONTHLY
//   STRIPE_PRICE_ENTERPRISE_YEARLY
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   STRIPE_SUCCESS_URL (default: https://sythio.app/settings?stripe=success)
//   STRIPE_CANCEL_URL  (default: https://sythio.app/settings?stripe=cancel)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SUCCESS_URL = Deno.env.get("STRIPE_SUCCESS_URL") ?? "https://sythio.app/settings?stripe=success";
const CANCEL_URL = Deno.env.get("STRIPE_CANCEL_URL") ?? "https://sythio.app/settings?stripe=cancel";

const PRICE_IDS: Record<string, string> = {
  "premium:month": Deno.env.get("STRIPE_PRICE_PREMIUM_MONTHLY") ?? "",
  "premium:year": Deno.env.get("STRIPE_PRICE_PREMIUM_YEARLY") ?? "",
  "enterprise:month": Deno.env.get("STRIPE_PRICE_ENTERPRISE_MONTHLY") ?? "",
  "enterprise:year": Deno.env.get("STRIPE_PRICE_ENTERPRISE_YEARLY") ?? "",
};

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const ok = !origin
    || origin === "https://sythio.app"
    || origin === "https://www.sythio.app"
    || origin.endsWith(".sythio.vercel.app")
    || origin.startsWith("http://localhost");
  return {
    "Access-Control-Allow-Origin": ok ? (origin || "*") : "https://sythio.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
}

serve(async (req: Request) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  if (!STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), { status: 503, headers });
  }

  try {
    // Auth — get user from JWT
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const body = await req.json().catch(() => ({}));
    const tier = body.tier as string;
    const interval = (body.interval as string) ?? "month";
    if (!["premium", "enterprise"].includes(tier) || !["month", "year"].includes(interval)) {
      return new Response(JSON.stringify({ error: "Invalid tier or interval" }), { status: 400, headers });
    }

    const priceId = PRICE_IDS[`${tier}:${interval}`];
    if (!priceId) {
      return new Response(JSON.stringify({ error: `Price not configured for ${tier} ${interval}` }), { status: 503, headers });
    }

    // Look up existing Stripe customer for this user (if any)
    const { data: subRow } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .eq("provider", "stripe")
      .maybeSingle();
    const existingCustomerId = subRow?.stripe_customer_id ?? null;

    // Create Checkout Session
    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("line_items[0][price]", priceId);
    params.append("line_items[0][quantity]", "1");
    params.append("success_url", `${SUCCESS_URL}&session_id={CHECKOUT_SESSION_ID}`);
    params.append("cancel_url", CANCEL_URL);
    params.append("client_reference_id", user.id);
    params.append("subscription_data[metadata][user_id]", user.id);
    params.append("subscription_data[metadata][tier]", tier);
    params.append("allow_promotion_codes", "true");
    if (existingCustomerId) {
      params.append("customer", existingCustomerId);
    } else {
      params.append("customer_email", user.email ?? "");
      params.append("customer_creation", "always");
    }

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!stripeRes.ok) {
      const errText = await stripeRes.text();
      console.error("[stripe-checkout] Stripe error:", errText);
      return new Response(JSON.stringify({ error: "Stripe error", detail: errText }), { status: 502, headers });
    }

    const session = await stripeRes.json();
    return new Response(JSON.stringify({ checkoutUrl: session.url, sessionId: session.id }), { status: 200, headers });
  } catch (err) {
    console.error("[stripe-checkout] crash:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
});
