// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const ok = !origin
    || origin === "https://sythio.com"
    || origin === "https://www.sythio.com"
    || origin.endsWith(".sythio.vercel.app")
    || origin.startsWith("http://localhost");
  return {
    "Access-Control-Allow-Origin": ok ? (origin || "*") : "https://sythio.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  };
}

function jsonResponse(data: unknown, status = 200, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ── Auth: verify user is a sythio admin ──
async function verifyAdmin(
  req: Request,
  admin: ReturnType<typeof createClient>,
): Promise<{ userId: string; adminRole: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  const cors = getCorsHeaders(req);
  if (!authHeader) return jsonResponse({ error: "No autorizado" }, 401, cors);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return jsonResponse({ error: "Sesión inválida" }, 401, cors);

  const { data: adminRow } = await admin
    .from("sythio_admins")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!adminRow) return jsonResponse({ error: "No autorizado como admin" }, 403, cors);

  return { userId: user.id, adminRole: adminRow.role };
}

// ── Route parser ──
function parsePath(url: string): { segments: string[]; searchParams: URLSearchParams } {
  const u = new URL(url);
  const path = u.pathname.replace(/^\/admin-api\/?/, "").replace(/\/$/, "");
  const segments = path ? path.split("/") : [];
  return { segments, searchParams: u.searchParams };
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const authResult = await verifyAdmin(req, admin);
  if (authResult instanceof Response) return authResult;

  const { segments, searchParams } = parsePath(req.url);
  const method = req.method;

  try {
    // ════════════════════════════════════════════════════════════════════
    // GET /stats
    // ════════════════════════════════════════════════════════════════════
    if (method === "GET" && segments[0] === "stats") {
      const { count: totalUsers } = await admin.from("profiles").select("id", { count: "exact", head: true });
      const { count: freeUsers } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("plan", "free");
      const { count: premiumUsers } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("plan", "premium");
      const { count: enterpriseUsers } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("plan", "enterprise");

      const { count: activeOrgs } = await admin.from("organizations").select("id", { count: "exact", head: true }).eq("active", true);

      const today = new Date().toISOString().split("T")[0];
      const { count: notesToday } = await admin.from("notes").select("id", { count: "exact", head: true }).gte("created_at", today + "T00:00:00Z");

      // MRR calculation
      const premiumMRR = (premiumUsers ?? 0) * 14.99;
      const { data: orgs } = await admin.from("organizations").select("billing_type, price_per_seat, flat_price, seats_used, billing_cycle").eq("active", true);
      let enterpriseMRR = 0;
      for (const o of orgs ?? []) {
        let monthly = 0;
        if (o.billing_type === "per_seat") {
          monthly = (o.price_per_seat ?? 0) * (o.seats_used ?? 0);
        } else {
          monthly = o.flat_price ?? 0;
        }
        if (o.billing_cycle === "annual") monthly = monthly / 12;
        enterpriseMRR += monthly;
      }

      const costPerNote = 0.015;
      const estimatedCostToday = (notesToday ?? 0) * costPerNote;

      // Activity last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const { data: recentUsers } = await admin
        .from("profiles")
        .select("created_at")
        .gte("created_at", thirtyDaysAgo + "T00:00:00Z")
        .order("created_at", { ascending: true });

      const { data: recentNotes } = await admin
        .from("notes")
        .select("created_at")
        .gte("created_at", thirtyDaysAgo + "T00:00:00Z")
        .order("created_at", { ascending: true });

      // Group by day
      const usersByDay: Record<string, number> = {};
      const notesByDay: Record<string, number> = {};
      for (const u of recentUsers ?? []) {
        const day = u.created_at.split("T")[0];
        usersByDay[day] = (usersByDay[day] ?? 0) + 1;
      }
      for (const n of recentNotes ?? []) {
        const day = n.created_at.split("T")[0];
        notesByDay[day] = (notesByDay[day] ?? 0) + 1;
      }

      // Recent orgs
      const { data: recentOrgs } = await admin
        .from("organizations")
        .select("id, name, slug, domain, seats_used, max_seats, active, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      return jsonResponse({
        total_users: totalUsers ?? 0,
        free_users: freeUsers ?? 0,
        premium_users: premiumUsers ?? 0,
        enterprise_users: enterpriseUsers ?? 0,
        active_orgs: activeOrgs ?? 0,
        notes_today: notesToday ?? 0,
        estimated_cost_today: estimatedCostToday,
        premium_mrr: premiumMRR,
        enterprise_mrr: enterpriseMRR,
        total_mrr: premiumMRR * 0.70 + enterpriseMRR, // after Apple 30% cut on premium
        activity: { users_by_day: usersByDay, notes_by_day: notesByDay },
        recent_orgs: recentOrgs ?? [],
      }, 200, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // GET /organizations
    // ════════════════════════════════════════════════════════════════════
    if (method === "GET" && segments[0] === "organizations" && !segments[1]) {
      const search = searchParams.get("search") || "";
      const status = searchParams.get("status");
      const sort = searchParams.get("sort") || "created_at";
      const order = searchParams.get("order") === "asc" ? true : false;

      let query = admin.from("organizations").select("*");
      if (search) {
        query = query.or(`name.ilike.%${search}%,domain.ilike.%${search}%,slug.ilike.%${search}%`);
      }
      if (status === "active") query = query.eq("active", true);
      if (status === "inactive") query = query.eq("active", false);
      query = query.order(sort, { ascending: order });

      const { data, error: qErr } = await query;
      if (qErr) return jsonResponse({ error: qErr.message }, 500, cors);

      // Calculate MRR for each org
      const orgsWithMRR = (data ?? []).map((o: Record<string, unknown>) => {
        let mrr = 0;
        if (o.billing_type === "per_seat") {
          mrr = ((o.price_per_seat as number) ?? 0) * ((o.seats_used as number) ?? 0);
        } else {
          mrr = (o.flat_price as number) ?? 0;
        }
        if (o.billing_cycle === "annual") mrr = mrr / 12;
        return { ...o, mrr };
      });

      return jsonResponse(orgsWithMRR, 200, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /organizations — create new org
    // ════════════════════════════════════════════════════════════════════
    if (method === "POST" && segments[0] === "organizations" && !segments[1]) {
      const body = await req.json();
      const slug = (body.slug || body.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).slice(0, 50);

      const { data: org, error: insertErr } = await admin.from("organizations").insert({
        name: body.name,
        slug,
        domain: body.domain || null,
        owner_id: body.owner_id || null,
        billing_type: body.billing_type || "per_seat",
        price_per_seat: body.price_per_seat || null,
        flat_price: body.flat_price || null,
        billing_cycle: body.billing_cycle || "monthly",
        max_seats: body.max_seats || 10,
        custom_audio_minutes_per_day: body.custom_audio_minutes_per_day || null,
        custom_notes_per_day: body.custom_notes_per_day || null,
        notes: body.notes || null,
        contract_start: body.contract_start || null,
        contract_end: body.contract_end || null,
      }).select().single();

      if (insertErr) return jsonResponse({ error: insertErr.message }, 400, cors);

      // If admin email provided, send invitation
      if (body.admin_email) {
        await admin.from("org_invitations").insert({
          org_id: org.id,
          email: body.admin_email,
          role: "admin",
          invited_by: authResult.userId,
        });
      }

      return jsonResponse(org, 201, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // GET /organizations/:id
    // ════════════════════════════════════════════════════════════════════
    if (method === "GET" && segments[0] === "organizations" && segments[1] && !segments[2]) {
      const { data: org } = await admin.from("organizations").select("*").eq("id", segments[1]).single();
      if (!org) return jsonResponse({ error: "Organización no encontrada" }, 404, cors);
      return jsonResponse(org, 200, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // PATCH /organizations/:id — update org
    // ════════════════════════════════════════════════════════════════════
    if (method === "PATCH" && segments[0] === "organizations" && segments[1] && !segments[2]) {
      const body = await req.json();
      const allowedFields = [
        "name", "slug", "domain", "owner_id", "billing_type", "price_per_seat",
        "flat_price", "billing_cycle", "max_seats", "active",
        "custom_audio_minutes_per_day", "custom_notes_per_day", "notes",
        "contract_start", "contract_end", "stripe_customer_id",
        "stripe_subscription_id", "stripe_price_id",
      ];
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const field of allowedFields) {
        if (field in body) updates[field] = body[field];
      }

      const { data: org, error: upErr } = await admin
        .from("organizations")
        .update(updates)
        .eq("id", segments[1])
        .select()
        .single();

      if (upErr) return jsonResponse({ error: upErr.message }, 400, cors);
      return jsonResponse(org, 200, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // GET /organizations/:id/members
    // ════════════════════════════════════════════════════════════════════
    if (method === "GET" && segments[0] === "organizations" && segments[1] === segments[1] && segments[2] === "members") {
      const orgId = segments[1];
      const { data: members } = await admin
        .from("organization_members")
        .select("*, profiles!organization_members_user_id_fkey(email, display_name, daily_count, last_reset_date)")
        .eq("org_id", orgId);

      // Get note counts for this month per user
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const enriched = [];
      for (const m of members ?? []) {
        const profile = (m as Record<string, unknown>).profiles as Record<string, unknown> | null;
        const { count: notesThisMonth } = await admin
          .from("notes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", m.user_id)
          .gte("created_at", monthStart.toISOString());

        enriched.push({
          ...m,
          email: profile?.email,
          display_name: profile?.display_name,
          notes_this_month: notesThisMonth ?? 0,
        });
      }

      return jsonResponse(enriched, 200, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /organizations/:id/invite
    // ════════════════════════════════════════════════════════════════════
    if (method === "POST" && segments[0] === "organizations" && segments[2] === "invite") {
      const orgId = segments[1];
      const body = await req.json();

      const { data: inv, error: invErr } = await admin.from("org_invitations").insert({
        org_id: orgId,
        email: body.email,
        role: body.role || "member",
        invited_by: authResult.userId,
      }).select().single();

      if (invErr) return jsonResponse({ error: invErr.message }, 400, cors);
      return jsonResponse(inv, 201, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /organizations/:id/suspend-all
    // ════════════════════════════════════════════════════════════════════
    if (method === "POST" && segments[0] === "organizations" && segments[2] === "suspend-all") {
      const orgId = segments[1];
      await admin.from("organization_members").update({ status: "suspended" }).eq("org_id", orgId);
      return jsonResponse({ success: true }, 200, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // PATCH /organizations/:id/members/:userId
    // ════════════════════════════════════════════════════════════════════
    if (method === "PATCH" && segments[0] === "organizations" && segments[2] === "members" && segments[3]) {
      const orgId = segments[1];
      const userId = segments[3];
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.role) updates.role = body.role;
      if (body.status) updates.status = body.status;

      const { error: upErr } = await admin
        .from("organization_members")
        .update(updates)
        .eq("org_id", orgId)
        .eq("user_id", userId);

      if (upErr) return jsonResponse({ error: upErr.message }, 400, cors);
      return jsonResponse({ success: true }, 200, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // DELETE /organizations/:id/members/:userId
    // ════════════════════════════════════════════════════════════════════
    if (method === "DELETE" && segments[0] === "organizations" && segments[2] === "members" && segments[3]) {
      const orgId = segments[1];
      const userId = segments[3];
      await admin.from("organization_members").delete().eq("org_id", orgId).eq("user_id", userId);
      // Reset user plan to free
      await admin.from("profiles").update({ plan: "free", org_id: null }).eq("id", userId);
      return jsonResponse({ success: true }, 200, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /billing/record
    // ════════════════════════════════════════════════════════════════════
    if (method === "POST" && segments[0] === "billing" && segments[1] === "record") {
      const body = await req.json();
      const { data: record, error: billingErr } = await admin.from("billing_history").insert({
        org_id: body.org_id,
        period_start: body.period_start,
        period_end: body.period_end,
        seats_billed: body.seats_billed,
        amount_charged: body.amount_charged,
        currency: body.currency || "usd",
        stripe_invoice_id: body.stripe_invoice_id || null,
        stripe_payment_intent_id: body.stripe_payment_intent_id || null,
        status: body.status || "pending",
        notes: body.notes || null,
      }).select().single();

      if (billingErr) return jsonResponse({ error: billingErr.message }, 400, cors);
      return jsonResponse(record, 201, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // PATCH /billing/:id
    // ════════════════════════════════════════════════════════════════════
    if (method === "PATCH" && segments[0] === "billing" && segments[1]) {
      const body = await req.json();
      const { data: record, error: upErr } = await admin
        .from("billing_history")
        .update({ status: body.status, notes: body.notes })
        .eq("id", segments[1])
        .select()
        .single();
      if (upErr) return jsonResponse({ error: upErr.message }, 400, cors);
      return jsonResponse(record, 200, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // GET /billing?org_id=xxx
    // ════════════════════════════════════════════════════════════════════
    if (method === "GET" && segments[0] === "billing") {
      const orgId = searchParams.get("org_id");
      let query = admin.from("billing_history").select("*").order("period_start", { ascending: false });
      if (orgId) query = query.eq("org_id", orgId);
      const { data } = await query;
      return jsonResponse(data ?? [], 200, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // GET /users
    // ════════════════════════════════════════════════════════════════════
    if (method === "GET" && segments[0] === "users") {
      const search = searchParams.get("search") || "";
      const planFilter = searchParams.get("plan");
      const hasOrg = searchParams.get("has_org");
      const sort = searchParams.get("sort") || "created_at";
      const order = searchParams.get("order") === "asc" ? true : false;
      const limit = parseInt(searchParams.get("limit") || "100", 10);
      const offset = parseInt(searchParams.get("offset") || "0", 10);

      let query = admin.from("profiles").select("*, organizations!profiles_org_id_fkey(name, slug)", { count: "exact" });

      if (search) {
        query = query.or(`email.ilike.%${search}%,display_name.ilike.%${search}%`);
      }
      if (planFilter) query = query.eq("plan", planFilter);
      if (hasOrg === "true") query = query.not("org_id", "is", null);
      if (hasOrg === "false") query = query.is("org_id", null);

      query = query.order(sort, { ascending: order }).range(offset, offset + limit - 1);

      const { data, count, error: qErr } = await query;
      if (qErr) return jsonResponse({ error: qErr.message }, 500, cors);

      // Get note counts
      const enriched = [];
      for (const u of data ?? []) {
        const { count: totalNotes } = await admin
          .from("notes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", u.id);

        const today = new Date().toISOString().split("T")[0];
        const { count: notesToday } = await admin
          .from("notes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", u.id)
          .gte("created_at", today + "T00:00:00Z");

        const org = (u as Record<string, unknown>).organizations as Record<string, unknown> | null;
        enriched.push({
          ...u,
          org_name: org?.name ?? null,
          org_slug: org?.slug ?? null,
          total_notes: totalNotes ?? 0,
          notes_today: notesToday ?? 0,
        });
      }

      return jsonResponse({ users: enriched, total: count ?? 0 }, 200, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // PATCH /users/:id
    // ════════════════════════════════════════════════════════════════════
    if (method === "PATCH" && segments[0] === "users" && segments[1]) {
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.plan) updates.plan = body.plan;
      if ("org_id" in body) updates.org_id = body.org_id;
      if ("daily_count" in body) updates.daily_count = body.daily_count;

      const { data: user, error: upErr } = await admin
        .from("profiles")
        .update(updates)
        .eq("id", segments[1])
        .select()
        .single();

      if (upErr) return jsonResponse({ error: upErr.message }, 400, cors);

      // If assigning to org, also add as member
      if (body.org_id && body.plan === "enterprise") {
        const { error: memErr } = await admin.from("organization_members").upsert({
          org_id: body.org_id,
          user_id: segments[1],
          role: "member",
          status: "active",
          joined_at: new Date().toISOString(),
        }, { onConflict: "org_id,user_id" });
        if (memErr) console.error("Member upsert error:", memErr.message);
      }

      return jsonResponse(user, 200, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // GET /organizations/:id/activity
    // ════════════════════════════════════════════════════════════════════
    if (method === "GET" && segments[0] === "organizations" && segments[2] === "activity") {
      const orgId = segments[1];
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      // Get org members
      const { data: members } = await admin
        .from("organization_members")
        .select("user_id, profiles!organization_members_user_id_fkey(email, display_name)")
        .eq("org_id", orgId)
        .eq("status", "active");

      const userActivity = [];
      for (const m of members ?? []) {
        const profile = (m as Record<string, unknown>).profiles as Record<string, unknown> | null;
        const { count: notesCount } = await admin
          .from("notes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", m.user_id)
          .gte("created_at", monthStart.toISOString());

        const { data: notesList } = await admin
          .from("notes")
          .select("audio_duration")
          .eq("user_id", m.user_id)
          .gte("created_at", monthStart.toISOString());

        const totalMinutes = Math.round(
          (notesList ?? []).reduce((sum: number, n: Record<string, unknown>) => sum + ((n.audio_duration as number) || 0), 0) / 60
        );

        userActivity.push({
          user_id: m.user_id,
          email: profile?.email,
          display_name: profile?.display_name,
          notes_this_month: notesCount ?? 0,
          audio_minutes_this_month: totalMinutes,
        });
      }

      // Sort by notes descending
      userActivity.sort((a, b) => b.notes_this_month - a.notes_this_month);

      return jsonResponse({
        members: userActivity,
        top_5: userActivity.slice(0, 5),
      }, 200, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // GET /invitations?org_id=xxx
    // ════════════════════════════════════════════════════════════════════
    if (method === "GET" && segments[0] === "invitations") {
      const orgId = searchParams.get("org_id");
      if (!orgId) return jsonResponse({ error: "org_id required" }, 400, cors);
      const { data } = await admin
        .from("org_invitations")
        .select("*")
        .eq("org_id", orgId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      return jsonResponse(data ?? [], 200, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // DELETE /invitations/:id
    // ════════════════════════════════════════════════════════════════════
    if (method === "DELETE" && segments[0] === "invitations" && segments[1]) {
      await admin.from("org_invitations").delete().eq("id", segments[1]);
      return jsonResponse({ success: true }, 200, cors);
    }

    // ════════════════════════════════════════════════════════════════════
    // GET /verify — check if current user is admin
    // ════════════════════════════════════════════════════════════════════
    if (method === "GET" && segments[0] === "verify") {
      return jsonResponse({ admin: true, role: authResult.adminRole }, 200, cors);
    }

    return jsonResponse({ error: "Endpoint no encontrado" }, 404, cors);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return jsonResponse({ error: msg }, 500, cors);
  }
});
