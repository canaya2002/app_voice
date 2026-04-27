// deno-lint-ignore-file
// Stripe Webhook — receives subscription lifecycle events and updates the DB.
//
// Events handled:
//   - checkout.session.completed
//   - customer.subscription.updated
//   - customer.subscription.deleted
//   - invoice.payment_failed
//
// Required env vars:
//   STRIPE_WEBHOOK_SECRET  (from Stripe dashboard → Webhooks)
//   STRIPE_SECRET_KEY
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Map Stripe price IDs back to tiers — keep in sync with stripe-checkout.
const TIER_BY_PRICE: Record<string, "premium" | "enterprise"> = {
  [Deno.env.get("STRIPE_PRICE_PREMIUM_MONTHLY") ?? "_"]: "premium",
  [Deno.env.get("STRIPE_PRICE_PREMIUM_YEARLY") ?? "_"]: "premium",
  [Deno.env.get("STRIPE_PRICE_ENTERPRISE_MONTHLY") ?? "_"]: "enterprise",
  [Deno.env.get("STRIPE_PRICE_ENTERPRISE_YEARLY") ?? "_"]: "enterprise",
};

// Verify Stripe signature. Adapted from Stripe's recommended verification.
async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  const parts = signature.split(",").reduce<Record<string, string>>((acc, p) => {
    const [k, v] = p.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
  if (!parts.t || !parts.v1) return false;

  const signedPayload = `${parts.t}.${payload}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time-ish compare
  if (expected.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  }
  return diff === 0;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature") ?? "";
  const payload = await req.text();

  const ok = await verifySignature(payload, signature, STRIPE_WEBHOOK_SECRET);
  if (!ok) {
    console.warn("[stripe-webhook] signature verification failed");
    return new Response("Invalid signature", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id ?? session.metadata?.user_id;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        if (!userId || !subscriptionId) break;

        // Fetch subscription detail to know tier + period
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
          headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
        });
        const sub = await subRes.json();
        const priceId: string = sub.items?.data?.[0]?.price?.id ?? "";
        const tier = TIER_BY_PRICE[priceId] ?? "premium";

        await upsertSubscription(supabase, {
          userId,
          tier,
          customerId,
          subscriptionId,
          status: sub.status,
          periodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
          periodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const userId = sub.metadata?.user_id;
        if (!userId) break;
        const priceId: string = sub.items?.data?.[0]?.price?.id ?? "";
        const tier = TIER_BY_PRICE[priceId] ?? "premium";
        await upsertSubscription(supabase, {
          userId,
          tier,
          customerId: sub.customer,
          subscriptionId: sub.id,
          status: sub.status,
          periodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
          periodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = sub.metadata?.user_id;
        if (!userId) break;
        await supabase
          .from("subscriptions")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("provider", "stripe");
        // Downgrade profile to free
        await supabase.from("profiles").update({ plan: "free" }).eq("id", userId);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        if (!customerId) break;
        await supabase
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_customer_id", customerId);
        break;
      }

      default:
        // Ignore unhandled events
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] handler error:", err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

async function upsertSubscription(
  supabase: ReturnType<typeof createClient>,
  args: {
    userId: string;
    tier: "premium" | "enterprise";
    customerId: string;
    subscriptionId: string;
    status: string;
    periodStart: string | null;
    periodEnd: string | null;
  },
) {
  const { userId, tier, customerId, subscriptionId, status, periodStart, periodEnd } = args;

  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      provider: "stripe",
      platform: "web",
      plan: tier,
      status,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      renewed_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );

  if (status === "active" || status === "trialing") {
    await supabase.from("profiles").update({ plan: tier }).eq("id", userId);
  } else if (status === "canceled" || status === "unpaid") {
    await supabase.from("profiles").update({ plan: "free" }).eq("id", userId);
  }
}
