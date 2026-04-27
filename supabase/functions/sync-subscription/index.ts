// deno-lint-ignore-file
/**
 * sync-subscription — Upserts a subscription record for the authenticated user.
 *
 * Called by:
 *   - Mobile app after RevenueCat purchase/restore (platform: 'ios')
 *   - Web app after Stripe checkout (platform: 'web')  — future
 *   - RevenueCat webhook (server-to-server)             — future
 *
 * The subscriptions table has RLS that blocks client writes, so this
 * function uses service_role to bypass RLS.
 *
 * Body: { plan, platform, status, current_period_start, current_period_end,
 *         product_id?, platform_subscription_id?, price_cents? }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    "Access-Control-Allow-Origin": ok ? origin || "*" : "https://sythio.app",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: cors });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Authenticate caller ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── Parse body ───────────────────────────────────────────────────
    const body = await req.json();
    const {
      plan,
      platform,
      status,
      current_period_start,
      current_period_end,
      product_id,
      platform_subscription_id,
      price_cents,
    } = body;

    if (!plan || !platform || !status) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: plan, platform, status" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Validate plan
    if (!["premium", "enterprise"].includes(plan)) {
      return new Response(
        JSON.stringify({ error: "Invalid plan. Must be premium or enterprise." }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // ── Use service_role to bypass RLS ───────────────────────────────
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check for existing active subscription on ANY platform
    // (the DB trigger also enforces this, but we give a better error message)
    const { data: existing } = await admin
      .from("subscriptions")
      .select("id, platform, plan, status")
      .eq("user_id", user.id)
      .in("status", ["active", "trial"])
      .gt("current_period_end", new Date().toISOString());

    if (existing && existing.length > 0) {
      const ex = existing[0];
      // If same platform, update instead of insert
      if (ex.platform === platform) {
        const { error: updateErr } = await admin
          .from("subscriptions")
          .update({
            plan,
            status,
            current_period_start: current_period_start || undefined,
            current_period_end: current_period_end || undefined,
            product_id: product_id || undefined,
            platform_subscription_id: platform_subscription_id || undefined,
            price_cents: price_cents ?? (plan === "premium" ? 1500 : undefined),
            updated_at: new Date().toISOString(),
          })
          .eq("id", ex.id);

        if (updateErr) {
          return new Response(
            JSON.stringify({ error: updateErr.message }),
            { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, action: "updated" }),
          { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }

      // Different platform with active sub — block to prevent duplicate
      return new Response(
        JSON.stringify({
          error: `Ya tienes una suscripción activa en ${ex.platform}. Cancélala primero.`,
          existing_platform: ex.platform,
          existing_plan: ex.plan,
        }),
        { status: 409, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // ── Upsert subscription ──────────────────────────────────────────
    const { error: upsertErr } = await admin.from("subscriptions").upsert(
      {
        user_id: user.id,
        platform,
        plan,
        status,
        current_period_start: current_period_start || new Date().toISOString(),
        current_period_end: current_period_end || null,
        product_id: product_id || null,
        platform_subscription_id: platform_subscription_id || null,
        price_cents: price_cents ?? (plan === "premium" ? 1500 : null),
        currency: "usd",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" }
    );

    if (upsertErr) {
      return new Response(
        JSON.stringify({ error: upsertErr.message }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // The sync_profile_plan trigger auto-updates profiles.plan

    return new Response(
      JSON.stringify({ success: true, action: "created" }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
