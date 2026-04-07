// deno-lint-ignore-file
/**
 * revenuecat-webhook — Handles RevenueCat server-to-server events.
 *
 * RevenueCat Dashboard → Settings → Webhooks → Add URL:
 *   https://<project>.supabase.co/functions/v1/revenuecat-webhook
 *   Authorization header: Bearer <WEBHOOK_SECRET>
 *
 * Events handled:
 *   INITIAL_PURCHASE      → create subscription (active)
 *   RENEWAL               → update period_end (active)
 *   CANCELLATION           → mark cancelled (access until period_end)
 *   EXPIRATION             → mark expired
 *   UNCANCELLATION         → reactivate (active)
 *   BILLING_ISSUE          → mark billing issue
 *   PRODUCT_CHANGE         → update plan
 *
 * The app_user_id in RevenueCat MUST be the Supabase user UUID
 * (set via Purchases.logIn(userId) in mobile app).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // ── Verify webhook secret ──────────────────────────────────────────
  if (WEBHOOK_SECRET) {
    const auth = req.headers.get("Authorization") ?? "";
    if (auth !== `Bearer ${WEBHOOK_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const payload = await req.json();
    const event = payload.event;

    if (!event?.type || !event?.app_user_id) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = event.app_user_id;
    const eventType: string = event.type;

    // Determine platform from store
    const store: string = event.store ?? "";
    const platform =
      store === "APP_STORE" || store === "MAC_APP_STORE"
        ? "ios"
        : store === "PLAY_STORE"
        ? "android"
        : "web";

    // Parse dates
    const periodEnd = event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null;
    const periodStart = event.purchased_at_ms
      ? new Date(event.purchased_at_ms).toISOString()
      : null;

    const productId = event.product_id ?? null;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Map RevenueCat event to subscription state ───────────────────
    let status: string;
    let plan = "premium"; // Default — RevenueCat only handles premium for now

    switch (eventType) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "UNCANCELLATION":
        status = "active";
        break;
      case "CANCELLATION":
        status = "cancelled";
        break;
      case "EXPIRATION":
      case "BILLING_ISSUE":
        status = "expired";
        break;
      case "PRODUCT_CHANGE":
        status = "active";
        // If product changes in the future, map product_id to plan here
        break;
      case "TEST":
        // RevenueCat test event — acknowledge without processing
        return new Response(JSON.stringify({ ok: true, test: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      default:
        // Unknown event — acknowledge to avoid retries
        return new Response(JSON.stringify({ ok: true, skipped: eventType }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
    }

    // ── Upsert subscription ──────────────────────────────────────────
    const { error: upsertErr } = await admin.from("subscriptions").upsert(
      {
        user_id: userId,
        platform,
        plan,
        status,
        product_id: productId,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        price_cents: 1500, // $15 premium
        currency: "usd",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" }
    );

    if (upsertErr) {
      console.error("[revenuecat-webhook] upsert error:", upsertErr);
      // Return 500 so RevenueCat retries
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // The sync_profile_plan trigger auto-updates profiles.plan

    // ── If expired/cancelled past period, set profiles.plan to free ──
    if (status === "expired") {
      await admin
        .from("profiles")
        .update({ plan: "free" })
        .eq("id", userId);
    }

    return new Response(
      JSON.stringify({ ok: true, event: eventType, user: userId, status }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[revenuecat-webhook] error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
