# Auditoría #2 + #3 — Cambios de hoy + Bugs generales

**Fecha:** 2026-04-28
**Scope:** Tras restructure de tiers (free / premium / pro_plus / enterprise), forgot password web, enterprise contact form, security lockdown, fixes de límites.

---

## ✅ Cambios desplegados hoy (resumen)

### Backend
- **Migración tiers**: `enterprise` (anterior) → `pro_plus`. Nuevo `enterprise` para B2B custom.
- **Migración security_lockdown**: trigger en `profiles` que bloquea UPDATE de `plan`, `daily_count`, `daily_audio_minutes`, `daily_chat_count`, `daily_convert_count`, `last_reset_date`, `plan_expires_at` para usuarios autenticados (solo service_role puede cambiar). RLS removida en `subscriptions` para INSERT/UPDATE/DELETE (solo service_role).
- **Migración atomic_chat_increment**: RPC `increment_chat_count` race-safe con auth check.
- **`process-audio`**: límites por tier (free 2/día, premium 50, pro_plus 200, enterprise ∞), validación de duración por nota, validación de minutos diarios, anti-spoof de duration (compara file size vs declared duration).
- **`convert-mode`**: límites por tier (free 3/día — bajado de 10, premium 50, pro_plus 200, enterprise ∞).
- **`chat-notes`**: rate limit IP (30/h) + RPC atómico de increment, free gated, premium 100/día, pro_plus 500, enterprise ∞.
- **`stripe-checkout`**: solo acepta `premium` y `pro_plus` (rechaza `enterprise` que es manual).
- **`stripe-webhook`**: mapea `STRIPE_PRICE_PRO_PLUS_*` → `pro_plus`.
- **`enterprise-inquiry`** (nueva): edge function que valida + persiste + envía email vía Resend. IP rate limit 5/h, honeypot, validación 5+ usuarios.

### Web
- Forgot password en login → email con link a `/auth/reset`
- `/auth/reset` page (componente nuevo) — handle recovery session, set new password
- `/enterprise` page (componente nuevo) — contact form B2B
- Settings → upgrade panel ahora muestra Premium / Pro+ / Enterprise (3 cards)
- `vercel.json` rewrites simplificados (rutas SPA funcionan ahora)

### Mobile
- Login forgot password → ahora redirige a `https://sythio.app/auth/reset` (más seguro que deep-link mobile)
- `lib/pricing.ts` actualizado con 4 tiers

### Stripe
- Producto "Sythio Enterprise" renombrado a "Sythio Pro+" (mismo price IDs, $29.99/$299.99)
- Metadata `plan: enterprise` → `plan: pro_plus`

---

## 🔍 Auditoría #2 — Bugs en lo que acabo de hacer

### ✅ FIXED durante implementación
1. **Race condition en chat-notes** — read-then-update non-atomic. **Fix:** RPC `increment_chat_count` que hace todo en un UPDATE atómico Postgres (row-level lock).
2. **Duration spoofing exploit** — usuario podía declarar `audio_duration: 60` en notes mientras subía 60min real, bypaseando cap. **Fix:** validación de file size (max 2 MB/min de declared) en process-audio.
3. **Reset infinito en chat-notes** — al detectar nuevo día, leía counter como 0 pero no actualizaba `last_reset_date`, causando re-reset infinito. **Fix:** ahora el reset también actualiza `last_reset_date` en el mismo UPDATE.

### ⚠️ Bugs/limitaciones conocidas restantes (no críticos)

#### A1. Race en `daily_audio_minutes` increment (process-audio)
- **Severidad:** Baja
- **Descripción:** El UPDATE final `daily_audio_minutes = local_value + new_minutes` no es atómico. Dos requests simultáneos podrían ambos leer `daily_audio_minutes=80` y escribir `85` (en lugar de `90`).
- **Impacto:** Un power-user podría obtener +5-10 min extra/día con timing perfecto. Insignificante.
- **Fix futuro:** Mover increment a un RPC atómico tipo `increment_audio_minutes(user_id, minutes_to_add, max_minutes)`.

#### A2. Falla de LLM consume cuota
- **Severidad:** Muy baja
- **Descripción:** En chat-notes, hago `increment_chat_count` ANTES del fetch a Anthropic. Si Anthropic falla (timeout, 503), el user ya gastó 1 de su cuota.
- **Impacto:** En 1% de fallos, el user ve "Error al procesar" pero su counter avanzó.
- **Trade-off elegido:** prefiero esto a hacer increment después (que abre race condition explotable).
- **Fix futuro:** rollback opcional del counter si LLM falla y respuesta es 5xx (pero no si es timeout, ya que la respuesta puede haber salido).

#### A3. `audioDurationSec === 0` permite cualquier file size
- **Severidad:** Baja
- **Descripción:** Si el cliente envía `audio_duration: 0` y un archivo de 1MB, `maxBytesForDuration = max(2_000_000, 0) = 2MB`. Permite hasta 2MB de audio sin validar duration.
- **Impacto:** ~2 min de audio "free" extra por nota. Aún bloqueado por el daily total cap.
- **Fix:** require audio_duration > 0 y > 1 segundo en validación inicial.

#### A4. `enterprise-inquiry` confirma siempre que email se "envió"
- **Severidad:** Baja
- **Descripción:** Si Resend falla (API key faltante o rate limit), la función guarda en DB y devuelve 200 sin avisar al usuario. El email del founder no llega.
- **Mitigación:** Carlos puede ver inquiries en Supabase Dashboard incluso si email falla.
- **Fix futuro:** monitorear via cron o agregar status `email_sent: bool` en la tabla.

#### A5. Reset day boundary timezone
- **Severidad:** Media
- **Descripción:** `CURRENT_DATE` en Postgres usa el TZ del servidor (UTC). `today` en JS también es UTC (`toISOString()`). Pero usuarios en MX (UTC-6) ven sus límites resetearse a las 18:00 hora local, no a medianoche local. UX confusa.
- **Fix futuro:** usar timezone del usuario (almacenado en profile) o documentar claramente en paywall que reset es UTC midnight.

---

## 🔍 Auditoría #3 — Bugs generales (todo el codebase)

### 🔴 CRÍTICOS

#### G1. Mobile no maneja `PASSWORD_RECOVERY` event
- **Severidad:** Media
- **Descripción:** El forgot password en mobile envía email con link a la web (mi fix). Pero si en algún momento se cambia y el link va al app via deep-link, el listener en `_layout.tsx` setea la session pero no muestra UI de "set new password". El user queda autenticado con password viejo.
- **Estado actual:** No es bug porque el flujo va por web. Pero si se cambia, romperá.
- **Recomendación:** dejar el comentario en login.tsx explicando el design choice.

#### G2. `subscriptions` RLS removed for non-service-role
- **Severidad:** Verificar
- **Descripción:** En el security lockdown, removí policies de INSERT/UPDATE/DELETE para subscriptions (solo service_role puede modificar). Pero NO removí la policy de SELECT que permite a users leer su propia subscription. Verifiqué que la SELECT policy existente sigue ahí (line 41-44 de `20260407000001_subscription_alignment.sql`).
- **Estado:** OK ✅

#### G3. `cancel-subscription` edge function
- **Severidad:** Alta — verificar
- **Descripción:** El edge function `cancel-subscription` actualiza la subscription. Tras el lockdown que removió la policy de UPDATE, el edge function debe usar `service_role`. Verifiqué que sí lo usa (importa `SUPABASE_SERVICE_KEY`).
- **Estado:** OK ✅

#### G4. `sync-subscription` edge function
- **Severidad:** Alta — verificar
- **Estado:** Igual que G3, usa service role. ✅

### 🟡 IMPORTANTES

#### G5. Ningún cap en `notify-slack`
- **Severidad:** Baja
- **Descripción:** El edge function se invoca después de cada nota procesada. No tiene rate limit. Si un user con webhook Slack válido procesa 50 notas/día (premium), Slack recibe 50 webhooks. Ok dentro del límite, pero si hay loop de retry, podría DoS al Slack workspace.
- **Recomendación:** debounce o batch cada N minutos.

#### G6. `public-api` sin rate limit explícito
- **Severidad:** Media
- **Descripción:** El endpoint para Enterprise API users no tiene un cap por API key. Un user con API key válida puede hacer 10K req/día.
- **Recomendación:** agregar tabla `api_usage` y enforcear cuota.

#### G7. Audio storage no se limpia automáticamente
- **Severidad:** Baja-media
- **Descripción:** Cuando un user borra una nota (soft delete), el archivo de audio se queda en storage forever. No hay cleanup job.
- **Costo:** 1 GB Storage = $0.021/mes. A 1000 users con 100 MB cada uno = 100 GB = $2.10/mes.
- **Recomendación:** cron job semanal que borra audios de notes con `deleted_at` > 30 días.

#### G8. RevenueCat webhook idempotency
- **Severidad:** Media
- **Descripción:** Si RevenueCat reenvía el mismo evento (failure → retry), `revenuecat-webhook` lo procesará de nuevo. La upsert con `onConflict` debería ser idempotente, pero no verifiqué eventos como `RENEWAL` que extienden período. Podrían sumar period_end múltiples veces si no son idempotentes.
- **Recomendación:** loggear todos los webhook events recibidos en una tabla y validar idempotency por event_id.

#### G9. Sin captcha en signup
- **Severidad:** Media
- **Descripción:** Cualquiera puede crear cuentas free a velocidad. Cada cuenta consume API costs hasta llegar al cap diario. 1000 cuentas falsas × $0.50/mes worst-case = $500/mes.
- **Recomendación:** agregar Cloudflare Turnstile o hCaptcha en signup.

#### G10. `share_token` bruteforceable si no hay rate limit
- **Severidad:** Media
- **Descripción:** El endpoint `get-shared-note` recibe un token. Si se generan tokens de 8 caracteres, son crackeables por brute force con suficientes requests. Verifiqué que el rate limit IP de la edge function aplica (dado que es callable). Pero hay rate limiting?
- **Verificar:** que `get-shared-note` tenga IP throttling.

### 🟢 MEJORAS NICE-TO-HAVE

#### G11. CORS demasiado permisivo en algunos endpoints
- `enterprise-inquiry` permite `*.vercel.app` — útil para dev pero amplio. Considerar restringir a sythio.app prod.

#### G12. Sin logs estructurados
- Los `console.log` están dispersos. Considerar usar un logger estructurado (Pino-style) que incluya `user_id`, `request_id`, `event_type` para queries fáciles en Supabase Logs.

#### G13. `.env.example` desactualizado
- Las nuevas vars (`STRIPE_PRICE_PRO_PLUS_*`, `RESEND_API_KEY`, `ENTERPRISE_INQUIRY_TO`) deberían estar en `.env.example`.

#### G14. Falta sitemap.xml y robots.txt en sythio.app
- Para SEO de la página de pricing y enterprise contact.

#### G15. Sin "soft launch" beta gate
- Cualquiera puede registrarse en sythio.app. Considerar `BETA_INVITE_ONLY=true` con waitlist hasta soft launch.

---

## 📋 Acciones recomendadas (priorizadas)

### 🔴 Antes de TestFlight / App Store
1. Agregar captcha en signup web (G9) — protege presupuesto Anthropic
2. Setear `RESEND_API_KEY` en Supabase secrets (sin esto, emails enterprise no se envían)
3. Verificar IP rate limit en `get-shared-note` (G10)

### 🟡 Primera semana post-launch
4. Cleanup job para storage de notas borradas (G7)
5. Logs estructurados con user_id (G12)
6. Idempotency check en revenuecat-webhook (G8)

### 🟢 Backlog
7. Cap por API key en public-api (G6)
8. Beta gate / waitlist (G15)
9. Atomic increment de daily_audio_minutes (A1)

---

## ⚙️ Pendiente: setear RESEND_API_KEY

El edge function `enterprise-inquiry` está deployada y persiste en DB pero no envía emails hasta que setees:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxx
```

Obtén la key en https://resend.com/api-keys.

Mientras tanto: las solicitudes Enterprise se guardan en la tabla `enterprise_inquiries` y puedes verlas en:
https://supabase.com/dashboard/project/oewjbeqwihhzuvbsfctf/editor → tabla `enterprise_inquiries`

---

*Auditoría realizada inmediatamente después del deploy. Re-correr cada vez que se haga cambio significativo a edge functions o RLS policies.*
