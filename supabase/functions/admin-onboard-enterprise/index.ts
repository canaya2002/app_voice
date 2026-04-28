// deno-lint-ignore-file
/**
 * admin-onboard-enterprise — One-shot enterprise onboarding from /admin page.
 *
 * Auth: caller must have profiles.is_admin = true (verified via JWT).
 *
 * Body:
 * {
 *   company_name: string,
 *   users: [{ email: string, role: 'owner' | 'admin' | 'member' }],
 *   billing?: {
 *     amount_cents: number,           // e.g. 20000 = $200
 *     interval: 'month' | 'year',
 *     billing_email: string,
 *   },
 *   inquiry_id?: string,               // optional, marks the inquiry as converted
 * }
 *
 * Does:
 *   1. For each email: invite via Supabase Admin API (creates user + sends magic link)
 *   2. Wait for users; set their plan = 'enterprise'
 *   3. Create workspace; link users with their roles
 *   4. (optional) Create Stripe Customer + Subscription with custom price
 *   5. Mark inquiry as converted (if inquiry_id provided)
 *
 * Returns: { workspace_id, invited_users, stripe_subscription_id?, summary }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

interface OnboardUser {
  email: string;
  role: "owner" | "admin" | "member";
}
interface BillingConfig {
  amount_cents: number;
  interval: "month" | "year";
  billing_email: string;
}

function corsHeaders(req: Request): Record<string, string> {
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
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

serve(async (req: Request) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  // ── Auth: must be admin ──
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers });
  }

  // ── Parse + validate body ──
  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
  }

  const company_name: string = (body.company_name ?? "").trim();
  const users: OnboardUser[] = Array.isArray(body.users) ? body.users : [];
  const billing: BillingConfig | undefined = body.billing;
  const inquiry_id: string | undefined = body.inquiry_id;

  if (company_name.length < 2) {
    return new Response(JSON.stringify({ error: "company_name too short" }), { status: 400, headers });
  }
  if (users.length < 1) {
    return new Response(JSON.stringify({ error: "at least one user required" }), { status: 400, headers });
  }
  for (const u of users) {
    if (!isValidEmail(u.email) || !["owner", "admin", "member"].includes(u.role)) {
      return new Response(JSON.stringify({ error: `invalid user: ${u.email}` }), { status: 400, headers });
    }
  }
  const owners = users.filter((u) => u.role === "owner");
  if (owners.length !== 1) {
    return new Response(JSON.stringify({ error: "exactly one owner required" }), { status: 400, headers });
  }

  // ── Step 1: invite (or fetch existing) users ──
  const inviteResults: Array<{ email: string; user_id: string | null; status: "invited" | "existing" | "failed"; error?: string }> = [];

  for (const u of users) {
    const email = u.email.toLowerCase().trim();

    // Check if already exists
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    let existingUser = null;
    // Listing all users every time is expensive, but we use a more targeted lookup:
    const { data: byEmail } = await admin
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (byEmail) {
      existingUser = byEmail;
    }

    if (existingUser) {
      inviteResults.push({ email, user_id: existingUser.id, status: "existing" });
    } else {
      try {
        const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo: "https://sythio.app/",
        });
        if (invErr) throw invErr;
        inviteResults.push({ email, user_id: invited.user?.id ?? null, status: "invited" });
      } catch (err: any) {
        inviteResults.push({ email, user_id: null, status: "failed", error: err.message ?? String(err) });
      }
    }
  }

  // ── Step 2: build user_emails array for the SQL helper ──
  // Reorder so the owner is first.
  const ordered = [
    ...users.filter((u) => u.role === "owner"),
    ...users.filter((u) => u.role !== "owner"),
  ];
  const orderedEmails = ordered.map((u) => u.email.toLowerCase().trim());
  const adminEmails = users.filter((u) => u.role === "admin").map((u) => u.email.toLowerCase().trim());

  // ── Step 3: call onboard_enterprise_company ──
  let onboardResult: any = null;
  let onboardError: string | null = null;
  try {
    const { data, error } = await admin.rpc("onboard_enterprise_company", {
      p_company_name: company_name,
      p_user_emails: orderedEmails,
      p_admin_emails: adminEmails,
    });
    if (error) throw error;
    onboardResult = data;
  } catch (err: any) {
    onboardError = err.message ?? String(err);
  }

  if (!onboardResult) {
    return new Response(
      JSON.stringify({
        error: "onboard_failed",
        detail: onboardError,
        invite_results: inviteResults,
        hint: "Some users may not be registered yet. Wait for them to accept the magic link, then re-run.",
      }),
      { status: 500, headers },
    );
  }

  const workspace_id = onboardResult.workspace_id as string;

  // ── Step 4: optionally create Stripe customer + subscription ──
  let stripe_customer_id: string | null = null;
  let stripe_subscription_id: string | null = null;
  let stripe_invoice_url: string | null = null;
  let stripe_error: string | null = null;

  if (billing && STRIPE_SECRET_KEY) {
    try {
      // Create customer
      const customerRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          name: company_name,
          email: billing.billing_email,
          "metadata[workspace_id]": workspace_id,
          "metadata[plan]": "enterprise",
          description: `Enterprise: ${company_name}`,
        }).toString(),
      });
      if (!customerRes.ok) throw new Error(`Stripe customer error: ${await customerRes.text()}`);
      const customer = await customerRes.json();
      stripe_customer_id = customer.id;

      // Create the price (one-off, attached to a custom product)
      const productRes = await fetch("https://api.stripe.com/v1/products", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          name: `Sythio Enterprise — ${company_name}`,
          "metadata[workspace_id]": workspace_id,
          "metadata[plan]": "enterprise_custom",
        }).toString(),
      });
      if (!productRes.ok) throw new Error(`Stripe product error: ${await productRes.text()}`);
      const product = await productRes.json();

      const priceRes = await fetch("https://api.stripe.com/v1/prices", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          unit_amount: String(billing.amount_cents),
          currency: "usd",
          product: product.id,
          "recurring[interval]": billing.interval,
        }).toString(),
      });
      if (!priceRes.ok) throw new Error(`Stripe price error: ${await priceRes.text()}`);
      const price = await priceRes.json();

      // Create subscription with that price; collect via send_invoice
      const subParams = new URLSearchParams();
      subParams.append("customer", stripe_customer_id);
      subParams.append("items[0][price]", price.id);
      subParams.append("collection_method", "send_invoice");
      subParams.append("days_until_due", "30");
      subParams.append("metadata[workspace_id]", workspace_id);
      subParams.append("metadata[plan]", "enterprise");

      const subRes = await fetch("https://api.stripe.com/v1/subscriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: subParams.toString(),
      });
      if (!subRes.ok) throw new Error(`Stripe subscription error: ${await subRes.text()}`);
      const sub = await subRes.json();
      stripe_subscription_id = sub.id;

      // Get the latest invoice URL (Stripe sends it automatically with collection_method=send_invoice)
      if (sub.latest_invoice) {
        const invRes = await fetch(`https://api.stripe.com/v1/invoices/${sub.latest_invoice}`, {
          headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
        });
        if (invRes.ok) {
          const inv = await invRes.json();
          stripe_invoice_url = inv.hosted_invoice_url ?? null;
        }
      }
    } catch (err: any) {
      stripe_error = err.message ?? String(err);
      console.error("[admin-onboard-enterprise] Stripe error:", stripe_error);
    }
  }

  // ── Step 5: mark inquiry as converted ──
  if (inquiry_id) {
    await admin
      .from("enterprise_inquiries")
      .update({
        status: "converted",
        contacted_at: new Date().toISOString(),
        notes: `Onboarded as workspace ${workspace_id}` + (stripe_subscription_id ? ` · Stripe sub ${stripe_subscription_id}` : ""),
      })
      .eq("id", inquiry_id);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      workspace_id,
      company: company_name,
      onboard_result: onboardResult,
      invite_results: inviteResults,
      stripe: billing
        ? {
            customer_id: stripe_customer_id,
            subscription_id: stripe_subscription_id,
            invoice_url: stripe_invoice_url,
            error: stripe_error,
          }
        : null,
    }),
    { status: 200, headers },
  );
});
