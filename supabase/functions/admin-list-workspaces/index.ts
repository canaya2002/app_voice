// deno-lint-ignore-file
/**
 * admin-list-workspaces — Returns all enterprise workspaces for the /admin page.
 * Auth: caller must have profiles.is_admin = true.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

serve(async (req: Request) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  // Auth: admin only
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
  const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) {
    return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers });
  }

  // Action routing
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "list";

  try {
    if (action === "list") {
      // List enterprise workspaces with member counts
      const { data: workspaces } = await admin
        .from("workspaces")
        .select("id, name, created_at, owner_id")
        .eq("plan", "enterprise")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      const result = await Promise.all((workspaces ?? []).map(async (w: any) => {
        const { count } = await admin
          .from("workspace_members")
          .select("user_id", { count: "exact", head: true })
          .eq("workspace_id", w.id);
        const { data: ownerProfile } = await admin
          .from("profiles")
          .select("email")
          .eq("id", w.owner_id)
          .maybeSingle();
        return {
          id: w.id,
          name: w.name,
          created_at: w.created_at,
          owner_email: ownerProfile?.email ?? null,
          member_count: count ?? 0,
        };
      }));

      return new Response(JSON.stringify({ workspaces: result }), { status: 200, headers });
    }

    if (action === "members") {
      const workspace_id = url.searchParams.get("workspace_id");
      if (!workspace_id) return new Response(JSON.stringify({ error: "workspace_id required" }), { status: 400, headers });

      const { data } = await admin
        .from("workspace_members")
        .select("user_id, role, joined_at, profiles:user_id ( email, plan )")
        .eq("workspace_id", workspace_id)
        .order("joined_at", { ascending: true });

      return new Response(JSON.stringify({ members: data ?? [] }), { status: 200, headers });
    }

    if (action === "inquiries") {
      // List enterprise_inquiries
      const status = url.searchParams.get("status") ?? "new";
      const { data } = await admin
        .from("enterprise_inquiries")
        .select("*")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(100);
      return new Response(JSON.stringify({ inquiries: data ?? [] }), { status: 200, headers });
    }

    if (action === "add_users") {
      // POST: add users to existing workspace
      const body = await req.json();
      const { workspace_id, emails, role = "member" } = body;
      if (!workspace_id || !Array.isArray(emails) || emails.length < 1) {
        return new Response(JSON.stringify({ error: "workspace_id + emails required" }), { status: 400, headers });
      }

      // Invite users that don't exist yet
      const inviteResults: any[] = [];
      for (const rawEmail of emails) {
        const email = String(rawEmail).toLowerCase().trim();
        const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
        if (!existing) {
          try {
            const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
              redirectTo: "https://sythio.app/",
            });
            if (invErr) throw invErr;
            inviteResults.push({ email, status: "invited", user_id: invited.user?.id });
          } catch (e: any) {
            inviteResults.push({ email, status: "failed", error: e.message });
          }
        } else {
          inviteResults.push({ email, status: "existing", user_id: existing.id });
        }
      }

      // Add to workspace
      const { data, error } = await admin.rpc("add_users_to_workspace", {
        p_workspace_id: workspace_id,
        p_user_emails: emails.map((e: string) => e.toLowerCase().trim()),
        p_role: role,
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message, invite_results: inviteResults }), { status: 500, headers });
      }
      return new Response(JSON.stringify({ ok: true, result: data, invite_results: inviteResults }), { status: 200, headers });
    }

    if (action === "remove_user") {
      const body = await req.json();
      const { workspace_id, email } = body;
      const { data, error } = await admin.rpc("offboard_enterprise_user", {
        p_workspace_id: workspace_id,
        p_user_email: email,
        p_keep_premium: false,
      });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
      return new Response(JSON.stringify({ ok: true, result: data }), { status: 200, headers });
    }

    if (action === "cancel_subscription") {
      // Cancel a Stripe subscription for a workspace.
      const body = await req.json();
      const { workspace_id } = body;
      if (!workspace_id || !STRIPE_SECRET_KEY) {
        return new Response(JSON.stringify({ error: "workspace_id required and Stripe configured" }), { status: 400, headers });
      }

      // Find active subscription via Stripe customer metadata search
      const searchRes = await fetch(
        `https://api.stripe.com/v1/customers/search?query=${encodeURIComponent(`metadata['workspace_id']:'${workspace_id}'`)}`,
        { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } },
      );
      const searchData = await searchRes.json();
      if (!searchData.data?.[0]) {
        return new Response(JSON.stringify({ error: "no Stripe customer found for workspace" }), { status: 404, headers });
      }
      const customerId = searchData.data[0].id;

      // List active subscriptions for that customer
      const subListRes = await fetch(
        `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active`,
        { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } },
      );
      const subList = await subListRes.json();
      const sub = subList.data?.[0];
      if (!sub) {
        return new Response(JSON.stringify({ error: "no active subscription" }), { status: 404, headers });
      }

      // Cancel
      const cancelRes = await fetch(
        `https://api.stripe.com/v1/subscriptions/${sub.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
        },
      );
      const cancelled = await cancelRes.json();
      return new Response(JSON.stringify({ ok: true, cancelled }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: `unknown action: ${action}` }), { status: 400, headers });
  } catch (err: any) {
    console.error("[admin-list-workspaces] error:", err);
    return new Response(JSON.stringify({ error: "internal", detail: err.message ?? String(err) }), { status: 500, headers });
  }
});
