# 📘 Enterprise Onboarding — Runbook para Carlos

**Última actualización:** 2026-04-28
**Audiencia:** Tú (founder/operator)
**Objetivo:** Guía simple para convertir un lead Enterprise en cliente productivo en menos de 30 min.

---

## 🔄 El flujo completo

```
1. Empresa visita sythio.app/enterprise → llena form
   ↓
2. Edge function `enterprise-inquiry`:
     - Valida (5+ usuarios, email válido, etc.)
     - Guarda en tabla `enterprise_inquiries`
     - Envía email a canaya917@gmail.com (vía Resend)
   ↓
3. TÚ recibes el email con: nombre, empresa, # usuarios, mensaje
   ↓
4. Respondes y agendan llamada → acuerdan precio custom
   ↓
5. Onboarding manual (este runbook):
     a. Crear los users en Supabase Auth
     b. Setear su plan = 'enterprise' en profiles
     c. (Opcional) Cobrar manualmente vía Stripe Invoice
   ↓
6. Cliente live ✅
```

---

## 📥 Paso 1 — Ver leads

**Opción A — Email** (más simple)
- Te llegan emails con subject `🔔 Nueva solicitud Enterprise — <Empresa> (<N> usuarios)` a `canaya917@gmail.com`.
- El email viene desde `hello@sythio.app`.
- Cada lead tiene tabla con todos los datos + botón "Ver en Supabase".

**Opción B — Supabase Dashboard** (para review masivo)
- https://supabase.com/dashboard/project/oewjbeqwihhzuvbsfctf/editor → tabla `enterprise_inquiries`
- Filtra por `status = 'new'` para ver pendientes.

**Estados disponibles** (`status` column):
- `new` — recién recibido, sin contactar
- `contacted` — ya respondiste el email
- `qualified` — agendaron llamada / es real
- `converted` — cliente activo (ya creaste sus usuarios)
- `rejected` — no aplica (spam, fuera de scope, etc.)

Después de actuar sobre un lead, marcalo:
```sql
UPDATE enterprise_inquiries SET status = 'contacted', notes = 'Respondí 28/abr, llamada el 30/abr 10am' WHERE id = '<inquiry_id>';
```

---

## 🛠 Paso 2 — Onboarding del cliente

Asume que ya hablaste con la empresa, acordaste:
- Precio: $X/usuario/mes (o flat $Y/mes, lo que sea)
- # de usuarios: N
- Forma de pago: Stripe Invoice mensual o anual

### 2.1 Crear los workspace + users

**Vía SQL directo en Supabase Dashboard → SQL Editor:**

```sql
-- ╭─ EJEMPLO: Empresa "Acme Corp" con 10 users a $20/usuario/mes ─╮

-- 1. Crear los usuarios en auth (si no existen ya)
-- Esto idealmente se hace desde Supabase Dashboard → Authentication → Users → "Add user"
-- O envíales magic link via Supabase Dashboard.
-- Cuando se registren, se auto-crea su row en `profiles`.

-- 2. Crear el workspace de la empresa
INSERT INTO public.workspaces (name, owner_id, plan)
VALUES (
  'Acme Corp',
  '<UUID DEL OWNER (admin de la empresa)>',
  'enterprise'
)
RETURNING id;
-- Anota el workspace_id que te devuelve.

-- 3. Subir a TODOS los usuarios del equipo a tier enterprise
UPDATE public.profiles
SET plan = 'enterprise'
WHERE id IN (
  '<uuid_user_1>',
  '<uuid_user_2>',
  -- ... etc
);

-- 4. Agregarlos como members del workspace
INSERT INTO public.workspace_members (workspace_id, user_id, role)
VALUES
  ('<workspace_id>', '<uuid_user_1>', 'owner'),
  ('<workspace_id>', '<uuid_user_2>', 'admin'),
  ('<workspace_id>', '<uuid_user_3>', 'member'),
  -- ... etc
;

-- 5. Marcar el inquiry como converted
UPDATE public.enterprise_inquiries
SET status = 'converted', contacted_at = NOW(), notes = 'Onboarded 10 users, $200/mes via Stripe invoice'
WHERE id = '<inquiry_id>';
```

### 2.2 Identificar UUIDs de usuarios existentes

```sql
-- Si ya se registraron en sythio.app, obtén sus UUIDs así:
SELECT id, email, plan, created_at
FROM public.profiles
WHERE email IN ('admin@acme.com', 'dev1@acme.com', 'dev2@acme.com');
```

### 2.3 Si los users aún no se han registrado

Tienes 3 opciones:

**A) Que ellos se registren solos** (más simple)
- Diles que vayan a https://sythio.app/ y se registren con su email corporativo.
- Una vez registrados, corres el SQL de arriba con sus UUIDs.

**B) Crearlos tú via Magic Link** (más control)
- Supabase Dashboard → Authentication → Users → Add User → Send invite
- Les llega email para setear contraseña.
- Una vez aceptan, sus UUIDs aparecen en `profiles` y corres el SQL.

**C) Bulk crear via API** (para 20+ users)
```bash
# Ejemplo Node.js para crear users en bulk con service_role key
node -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://oewjbeqwihhzuvbsfctf.supabase.co', '<SERVICE_ROLE_KEY>');
const emails = ['user1@acme.com', 'user2@acme.com'];
for (const email of emails) {
  await sb.auth.admin.inviteUserByEmail(email);
  console.log('Invited:', email);
}
"
```

---

## 💰 Paso 3 — Cobrar al cliente

**Sythio Enterprise NO usa Stripe Checkout self-service.** Cobras manualmente con una de estas opciones:

### Opción A — Stripe Invoices (recomendado)

1. Stripe Dashboard → Customers → New Customer
   - Email: el del admin/CFO de la empresa
   - Name: "Acme Corp"
2. Customers → Acme Corp → Create Invoice
   - Add product: crea uno custom "Sythio Enterprise — Acme Corp" con el precio acordado
   - Currency: USD
   - Due date: NET 30 (o lo que acuerden)
3. Send invoice → cliente recibe email de Stripe con link de pago
4. Para mensual recurring: Customers → Subscriptions → Create
   - Custom price (no usar productos existentes)
   - Billing cycle: monthly o yearly

⚠️ **No vincules esta subscription al usuario en `profiles.plan`** automáticamente, ya lo hiciste manual. El webhook stripe-webhook NO procesa subscriptions sin el price ID en `STRIPE_PRICE_PREMIUM_*` o `STRIPE_PRICE_PRO_PLUS_*`. Si ves un evento "no tier match" en logs, es esto y es OK ignorar.

### Opción B — Transferencia bancaria / SPEI

Para clientes mexicanos grandes que prefieren pagar por transferencia:
- Genera factura fuera de Stripe (con tu RFC, etc.)
- Cuando recibas el pago, marca en `enterprise_inquiries.notes` la fecha y monto

### Opción C — Anual con descuento

Estructura común enterprise:
- Lista: $20/usuario/mes
- Anual prepago: 15% off → $17/usuario/mes
- Pago contractual NET 30

---

## 🎯 Paso 4 — Verificar que están "en producción"

Después del onboarding, valida:

```sql
-- ¿Todos los users tienen plan = 'enterprise'?
SELECT email, plan, created_at FROM public.profiles
WHERE id IN ('<uuid1>', '<uuid2>', ...);

-- ¿Workspace creado y members assigned?
SELECT w.name, u.email, wm.role
FROM workspaces w
JOIN workspace_members wm ON wm.workspace_id = w.id
JOIN profiles u ON u.id = wm.user_id
WHERE w.id = '<workspace_id>';

-- ¿No hay rate limits hitting? (verificar en analytics_events)
SELECT COUNT(*), event, properties->>'plan' as plan
FROM public.analytics_events
WHERE created_at > NOW() - INTERVAL '7 days'
  AND event = 'rate_limit_hit'
  AND user_id IN ('<uuid1>', '<uuid2>')
GROUP BY event, plan;
```

---

## 🆘 Casos especiales

### "El cliente quiere SSO con Microsoft / Okta"
- Supabase no soporta SAML directo, requiere setup en Auth → Providers.
- Por ahora: agenda llamada con el cliente, dile que SSO está en roadmap. Si es deal-blocker, escala.

### "El cliente quiere bajar de Enterprise a Pro+"
- Cambiar `profiles.plan` a `pro_plus` para todos sus users.
- Quitar workspace_members entries (o dejar el workspace inactivo).
- Cancelar la subscription manual de Stripe.

### "El cliente no paga la invoice"
- Stripe te avisa via email. Verifica.
- Si ya pasó la due date + 7 días: bajar a `plan = 'free'` para los users.
- Mantener el workspace por si vuelven (no borrar data).

### "El cliente quiere export masivo de todas las notas del equipo"
- Hoy no hay feature built-in. Workaround SQL:
  ```sql
  SELECT n.id, n.title, n.transcript, n.summary, p.email AS user_email
  FROM notes n
  JOIN profiles p ON p.id = n.user_id
  WHERE n.user_id IN (SELECT user_id FROM workspace_members WHERE workspace_id = '<wid>')
    AND n.deleted_at IS NULL
  ORDER BY n.created_at DESC;
  ```
  Exportar como CSV desde Supabase Dashboard.

---

## 📊 Métricas a trackear (mensual)

```sql
-- Leads del mes
SELECT
  COUNT(*) FILTER (WHERE status = 'new') AS pendientes,
  COUNT(*) FILTER (WHERE status = 'converted') AS convertidos,
  COUNT(*) FILTER (WHERE status = 'rejected') AS rechazados,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'converted') / NULLIF(COUNT(*), 0), 1) AS conversion_rate
FROM enterprise_inquiries
WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE);

-- Total de usuarios enterprise activos
SELECT COUNT(*) FROM profiles WHERE plan = 'enterprise';

-- Workspaces activos
SELECT COUNT(*) FROM workspaces WHERE plan = 'enterprise' AND deleted_at IS NULL;
```

---

## 🛡 Reglas de oro

1. **Nunca** des Enterprise gratis "como prueba" — ofrece Pro+ por 1 mes.
2. **Siempre** cobra antes de hacer onboarding, o tienes hard NET 30 contractual.
3. **Nunca** mezcles datos del workspace con notas personales del owner — cada usuario tiene su namespace.
4. **Documenta** cada deal en `enterprise_inquiries.notes` (precio acordado, billing cycle, contact).
5. **Verifica** que el lead es real antes de acercarte: que el email sea del dominio corporativo, que el `num_users >= 5`, que el mensaje no sea spam.

---

*Cualquier flujo no cubierto aquí, agendar una sesión técnica para definir.*
