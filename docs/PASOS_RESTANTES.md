# Sythio — Pasos para Lanzar a Producción

**Última actualización:** 2026-05-02 (build #2 en TestFlight — esperando processing/internal review de Apple)
**Audiencia:** Carlos (founder/dev)
**Objetivo:** Internal smoke test → metadata final → 1 click "Submit for Review" → App Store

---

## 🚦 EN QUÉ PUNTO ESTAMOS HOY

```
[✅] Build EAS #2 finished           commit 0d3bdb1c
[✅] Subido a TestFlight            submission a4ed53c1
[⏳] Apple Processing                ~5-10 min → email "processing complete"
[⏳] Apple Internal Review           24-48h → email "ready to test"
[🛑 PAUSA AQUÍ]                      libre para hacer cambios cuantas veces quieras
[ ] Smoke test en iPhone real
[ ] Llenar lo que falta de metadata 1.0.0 en ASC
[ ] 5 capturas (1290×2796)
[ ] Submit for Review                ← NO TOCAR sin doble check Carlos + Claude
[ ] Apple Review (1-2 días)
[ ] 🚀 Release (manual desde ASC)
```

---

## 🟢 Lo único que YO (Carlos) tengo que hacer ahora

### Mientras Apple procesa la build (1-2 días):

1. **Configurar Sandbox Account en mi iPhone** (2 min, OBLIGATORIO antes del smoke test)
   - iPhone → Settings → App Store → scroll a Sandbox Account → Sign In
   - Email: `canaya917+sandbox@gmail.com` / Password: la del 1Password
   - ⚠️ Sin esto, las compras Sandbox cobran de verdad con tu Apple ID real

2. **Añadirme como Internal Tester en TestFlight** (1 min, ya hecho?)
   - https://appstoreconnect.apple.com/apps/6764143516/testflight/ios
   - Internal Testing → App Store Connect Users → + → marcar mi cuenta

3. **Llenar metadata text de 1.0.0 en ASC** (~30 min, copy-paste desde `docs/APP_STORE_METADATA.md`)
   - Promotional Text, Description, Keywords
   - Support URL, Marketing URL
   - Copyright
   - App Review Information (datos del demo account)
   - Version Release: marcar "**Manually release this version**"
   - ⚠️ NO seleccionar la build todavía (sigue en Processing)
   - ⚠️ NO marcar "Add for Review"

4. **Decidir si hago más cambios al código antes del smoke test**
   - Si sí → editar → `eas build` → `eas submit` (reemplaza la #2 en TestFlight)
   - Si no → esperar email "Ready to Test" y arrancar smoke test directo

### Cuando llegue email "Build is ready to test" (24-48h):

5. **Smoke test obligatorio en iPhone con TestFlight**
   - [ ] Login con Apple
   - [ ] 2FA enrollment + verify + disable
   - [ ] Grabar audio 30s → procesa → ve resultado
   - [ ] Cambiar de modo en la nota
   - [ ] Exportar PDF + Excel
   - [ ] Compartir nota → link público abre en browser
   - [ ] **Comprar Premium en Sandbox** (con Sandbox Tester) → `profiles.plan = premium` en Supabase
   - [ ] **Comprar Pro+ en Sandbox** → `profiles.plan = pro_plus`
   - [ ] Restaurar compras
   - [ ] Límite free (2 notas/día) bloquea la 3ª

6. **Si encuentra bugs** → fix → nueva build → re-submit a TestFlight → re-test

7. **Si todo OK** → tomar las 5 capturas (1290×2796 px, guía en `docs/APP_STORE_METADATA.md` sección "📷 Guía de Capturas")

8. **Subir capturas a ASC** → completa la sección "App Previews and Screenshots"

9. **Verificación final con Claude antes del botón "Add for Review"**

10. **Click "Add for Review"** (con doble check) → Apple review (1-2 días)

11. **Cuando aprueben** → ASC → "Release this version" → 🚀 live en App Store

---

## ✅ Hecho hasta hoy (2026-05-02)

### Backend + Web — 100% en producción

| Bloque | Notas |
|---|---|
| Stripe | Premium ($14.99/$149.99) + Pro+ ($29.99/$299.99) — `provider` constraint allows `stripe`/`revenuecat` |
| Apple Developer | Sign In with Apple, AASA file, JWS |
| Supabase Auth | Apple + Google + email/password + 2FA TOTP |
| Supabase Secrets | Stripe, Anthropic, Groq, RevenueCat, Resend |
| Migraciones SQL | 23/23 (tier restructure + security lockdown + atomic increments + admin flag + cron via vault + **distributed IP rate limiting** + **subscription status alignment**) |
| Edge Functions | 17 deployadas con CORS hardening + rate limiter distribuido (DB-backed) |
| Vercel | sythio.app live con bundle code-split (575 KB → 290 KB main + chunks lazy) |
| DNS | sythio.app + www.sythio.app con SSL |
| Forgot password | Mobile + web flow funcional |
| Enterprise contact | `/enterprise` → form → DB + Resend email |
| Admin Dashboard | `/admin` con UI premium para onboard enterprise |
| Security lockdown | Trigger bloquea UPDATE de plan + counters |
| Storage cleanup | pg_cron daily 04:00 UTC vía edge function |
| RC webhook | Fail-closed si secret no está, idempotency check |
| Web npm audit | 0 vulnerabilities |
| Web captcha | Turnstile widget integrado en signup (dormido hasta que sete keys) |

### iOS — completado en esta semana

| Bloque | Status |
|---|---|
| RevenueCat productos en ASC + entitlements + offerings + webhook | ✅ |
| EAS credentials (cert + provisioning + push key + ASC API key) | ✅ |
| App Store Connect — App Information completa | ✅ |
| App Store Connect — Privacy Nutrition Label | ✅ |
| App Store Connect — Pricing and Availability (Free, all territories) | ✅ |
| App Store Connect — Encryption Compliance (Note 4 exemption) | ✅ |
| Sandbox Tester en ASC | ✅ `canaya917+sandbox@gmail.com` |
| Demo account `apple-review@sythio.app` con Premium 5 años | ✅ Supabase auto-confirm |
| Production build #2 (commit `0d3bdb1c`) | ✅ finished 2026-05-02 |
| Subida a TestFlight | ✅ submission `a4ed53c1` |

### Code quality (esta sesión 2026-05-02)

| Fix | Lugar |
|---|---|
| Splash colgada si AsyncStorage falla | `app/_layout.tsx` |
| Audio player atorado si signed URL falla | `app/note/[id].tsx` |
| Skeleton infinito si fetch inicial rejecta | `app/(tabs)/history.tsx` |
| Pull-to-refresh atorado en history y tasks | mismo |
| Welcome screen vacía si language read falla | `app/(auth)/welcome.tsx` |
| `useState` mal usado para side effect | `app/(tabs)/menu.tsx` |
| A11y enriquecido | AnimatedPressable, ModeSelector, AudioRecorder, TemplateSelector, AIChatModal, history.tsx |

### Docs entregados

- `docs/APP_STORE_METADATA.md` — copy completo para ASC (subtitle, descripción, keywords, privacy nutrition, app review info, TestFlight what to test, guía de 5 capturas)
- `docs/SYTHIO.md` — overview del proyecto
- `docs/billing-architecture.md` — arquitectura RevenueCat + Stripe
- `docs/deploy-guide.md` — pasos de deployment
- `docs/ENTERPRISE_RUNBOOK.md` — runbook B2B
- `docs/PASOS_RESTANTES.md` — este archivo

---

## 🟡 Pendientes opcionales (NO bloquean lanzamiento iOS)

### Android (trabado por verificación de identidad de Google)

| # | Tarea | Quién |
|---|---|---|
| A.2.1 | Crear app en Google Play Console | Carlos (cuando Google destrabe identidad) |
| A.2.2 | Generar Google Service Account JSON | Carlos |
| A.2.3 | Crear 4 SKUs en Play Console | Carlos |
| A.2.4–8 | Configurar RevenueCat Android (app + service account + entitlements + offering + API key) | Carlos |
| C.1 | `eas build --profile production --platform android` | Carlos |
| C.2 | `eas submit --profile production --platform android --track internal` | Carlos |
| E.2 | Llenar metadata Google Play Console | Carlos |

> Config Android ya está en `eas.json` y `app.json`. `lib/purchases.ts` selecciona key por plataforma. Cuando Google destrabe → solo añadir el `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` a `eas.json` y proceder.

### Misc post-launch (cualquier momento)

- **Activar Turnstile** — Cloudflare site key + Vercel env var `VITE_TURNSTILE_SITE_KEY` + `supabase secrets set TURNSTILE_SECRET_KEY=...`
- **Reconectar GitHub → Vercel auto-deploy** (actualmente roto, deploys son manuales con `cd web && vercel --prod`)
- **Verificar `RESEND_API_KEY` en Supabase secrets** — `supabase secrets list` (no solo en `.env`)

---

## ⚠️ Recordatorios críticos con fecha

### JWS de Apple expira **2026-10-27** (max 6 meses)
Antes del **2026-10-15** generar un JWS nuevo y reemplazar en Supabase → Auth → Providers → Apple → Secret Key. Si vence sin reemplazo, todos los logins con Apple se rompen en producción.

### Vercel auto-deploy roto
Para deployar web: `cd web && vercel --prod`. NO sirve `git push` (la integración GitHub está desconectada).

### Token RevenueCat webhook (en .env y RC dashboard)
```
Bearer 807f2793ddd7ec0b2ab0b698a218ace512cfb040e38566623f05e4f199a369d4
```

### Constraint en `subscriptions.provider`
Solo acepta `'stripe'` o `'revenuecat'`. Cuentas manuales (como `apple-review@sythio.app`) deben usar `'stripe'` como provider.

---

## 📋 Comandos útiles

```bash
# Backend (Supabase)
npx supabase secrets list
npx supabase secrets set KEY=value
npx supabase functions deploy <name>
npx supabase db push

# Mobile (EAS)
eas build --profile production --platform ios
eas submit --profile production --platform ios
eas build:list --platform ios --limit 5
eas credentials

# Web (Vercel)
cd web && vercel --prod

# Type check
npx tsc --noEmit

# Build mobile to TestFlight desde cero (si necesitas re-build después de cambios)
eas build --profile production --platform ios && eas submit --profile production --platform ios
```

---

## Troubleshooting

### "Apple Sign In falla con invalid_client"
Service ID en Supabase no coincide con el de Apple Developer. Debe ser exactamente `com.sythio.app.signin`.

### "Stripe webhook nunca llega"
Stripe Dashboard → Webhooks → tu endpoint → Logs. Si 400 "signature failed" → `STRIPE_WEBHOOK_SECRET` mal copiado.

### "TestFlight build crashea al abrir"
Verifica plugins en `app.json`. `expo-apple-authentication`, `expo-av`, `expo-notifications`, `expo-image-picker`, `expo-splash-screen` deben estar.

### "Usuario pagó pero `profiles.plan` sigue en free"
1. Webhook llegó? (Stripe/RevenueCat dashboard → Logs)
2. ¿`provider` column existe? (sí, ya está en migración 20260427000003)
3. Logs del webhook: ¿el `userId` matches `auth.users.id`?

### "EAS build falla con env var validation"
EAS no acepta env vars vacías. Si añades una clave, debe tener valor o quitarla del JSON.

### "submit a ASC falla"
Probablemente API key expirada o cambio en App Store Connect. Re-correr `eas credentials` para regenerar.
