# Sythio — Pasos para Lanzar a Producción

**Última actualización:** 2026-04-28
**Audiencia:** Carlos (founder/dev)
**Objetivo:** TestFlight → App Store iOS (Android se hará después, sin dev account aún)

---

## 📊 Estado actual

### ✅ Hecho — backend + web 100% en producción

| # | Bloque | Notas clave |
|---|---|---|
| 1.1 | Stripe | Premium ($14.99/$149.99) + **Pro+ ($29.99/$299.99)** — Enterprise renombrado a Pro+, nuevo Enterprise = custom B2B |
| 1.3 | Apple Developer | Sign In with Apple, AASA file desplegado |
| 1.4 | Supabase Auth (Apple) | Provider via JWS |
| 2.1 | Supabase Secrets | 13 secrets (Stripe x8, Anthropic, Groq, RevenueCat, Enterprise inquiry config) |
| 2.2 | Migraciones SQL | 19/19 sincronizadas (incluye tier restructure + security lockdown + atomic increments) |
| 2.3 | Edge Functions | 13 deployadas (nueva: `enterprise-inquiry`) |
| 4.1 | Vercel deploy | sythio.app live |
| 4.2 | DNS | sythio.app + www.sythio.app con SSL |
| — | **Tier restructure** (2026-04-28) | free / premium / **pro_plus** / **enterprise** (custom B2B) |
| — | **Forgot password** | Mobile + web → email con link a `/auth/reset` |
| — | **Enterprise contact** | `/enterprise` page → form → DB + email vía Resend |
| — | **Security lockdown** | Trigger bloquea UPDATE de plan + counters; RPCs con auth check |
| — | **Bug fixes pre-launch** | DAILY_LIMITS para todos los tiers, race conditions arregladas, anti-spoof de duration |

### 🔴 Pendiente — todo iOS mobile

| # | Bloque | Tiempo |
|---|---|---|
| 1.2 | **RevenueCat (solo iOS)** ← siguiente | 30-45 min |
| 3.1 | EAS Build setup | 20 min |
| 3.2 | Production build → TestFlight | 30 min build + 24h review |
| 3.3 | Submit a App Store | 1-2 días review Apple |

### 🟡 Follow-up post-launch
- **Setear `RESEND_API_KEY`** en Supabase secrets para que enterprise-inquiry envíe emails (sin esto, solo guarda en DB)
- Reconectar GitHub → Vercel auto-deploy
- Android: cuando tengas Google Play Console ($25 one-time)
- Captcha en signup para limitar abuso (recomendado pre-launch)
- Ver `docs/AUDITORIA_2_Y_3.md` para backlog completo de mejoras de seguridad

---

## ⚠️ Recordatorios críticos

### JWS de Apple expira **2026-10-27** (máx 6 meses)
Antes del **2026-10-15** generar un JWS nuevo y reemplazar en Supabase → Auth → Providers → Apple → Secret Key. Si vence sin reemplazo, todos los logins con Apple se rompen en producción.

### Vercel auto-deploy roto
Para deployar web: `cd web && vercel --prod`. NO sirve `git push` (la integración GitHub está desconectada).

### Token RevenueCat webhook (ya generado)
```
Bearer 807f2793ddd7ec0b2ab0b698a218ace512cfb040e38566623f05e4f199a369d4
```
Este mismo token va en el header `Authorization` cuando configures el webhook en RevenueCat (paso 1.2.7 abajo).

---

# 🔴 1.2 RevenueCat — solo iOS

⏱️ **30-45 min**

### Por qué
Apple obliga a que pagos in-app pasen por App Store. RevenueCat abstrae App Store Connect y nos da una sola API + webhook hacia Supabase.

### Prerequisitos (verificar antes de seguir)
- [ ] Membresía Apple Developer activa ($99/año)
- [ ] App `com.sythio.app` creada en App Store Connect
  - Si no: https://appstoreconnect.apple.com → My Apps → "+" → New App. Nombre `Sythio`, Bundle ID `com.sythio.app`, SKU `sythio-001`, idioma primario.

### Pasos

**1. Crear cuenta RevenueCat**
- https://www.revenuecat.com → Sign up (gratis hasta $10K/mes revenue)

**2. Crear el proyecto**
- New Project → nombre `Sythio`
- Solo iOS por ahora (Android se añade después): Bundle ID `com.sythio.app`

**3. Conectar con App Store Connect**
- Necesitas **App Store Connect API Key**:
  - https://appstoreconnect.apple.com → Users and Access → Keys → App Store Connect API → Generate
  - Anota Issuer ID, Key ID; descarga la `.p8` (solo se descarga UNA VEZ)
- En RevenueCat → Project Settings → Apps → iOS app → pega Issuer ID, Key ID, contenido del `.p8`

**4. Crear los 4 productos en App Store Connect**

ASC → tu app → Monetization → In-App Purchases → "+":

| Product ID | Tipo | Precio | Grupo |
|---|---|---|---|
| `sythio_premium_monthly` | Auto-Renewable Subscription | $14.99/mes | `Sythio` |
| `sythio_premium_yearly` | Auto-Renewable | $149.99/año | `Sythio` |
| `sythio_enterprise_monthly` | Auto-Renewable | $29.99/mes | `Sythio` |
| `sythio_enterprise_yearly` | Auto-Renewable | $299.99/año | `Sythio` |

⚠️ Los **Product IDs deben ser exactos** — `lib/pricing.ts` ya los espera así.

Para cada uno: llena nombre/descripción en español, sube el screenshot de review (puede ser el paywall de la app).

**5. Configurar Entitlements en RevenueCat**

RevenueCat → Project → Entitlements → "+":
- `premium` → adjunta `sythio_premium_monthly` + `sythio_premium_yearly`
- `enterprise` → adjunta `sythio_enterprise_monthly` + `sythio_enterprise_yearly`

⚠️ Identificadores `premium` y `enterprise` son los que `lib/pricing.ts` espera (campo `revenueCatEntitlement`). No los cambies.

**6. Configurar Offerings**

RevenueCat → Offerings → "+" → `default`:
- Package `monthly` → `sythio_premium_monthly`
- Package `annual` → `sythio_premium_yearly`

(Para Enterprise, crear offering aparte si quieres paywall específico.)

**7. Configurar el webhook**

RevenueCat → Project → Integrations → Webhooks → Add:
- **URL**: `https://oewjbeqwihhzuvbsfctf.supabase.co/functions/v1/revenuecat-webhook`
- **Authorization header**: `Bearer 807f2793ddd7ec0b2ab0b698a218ace512cfb040e38566623f05e4f199a369d4`
- Send a test event → debería devolver 200

**8. Copiar API key iOS al `.env`**

RevenueCat → Project Settings → API keys → copia la iOS key (formato `appl_...`).

Pega en `.env`:
```
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=appl_xxxxxxxxxxxx
```

(Esta SÍ va al cliente — es public key, no secreto.)

✅ **Verificación final**: en RevenueCat → Charts deberías ver `$0` revenue. Confirma que la cuenta existe y el proyecto está activo.

---

# 🔴 3.1 EAS Build setup

⏱️ **20 min**

### Por qué
Expo Go no soporta `expo-apple-authentication` ni `react-native-purchases`. Necesitamos un dev build para probar en simulador/dispositivo, y un production build para subir a App Store.

### Pasos

**1. Instalar EAS CLI**
```bash
npm install -g eas-cli
eas login
```

**2. Linkar proyecto**
```bash
eas init
```
Asigna `projectId` (se guarda en `app.json` automáticamente). El proyecto ya tiene uno: `a7176742-154f-4c45-8200-8c2f6bb2dccc`.

**3. Verificar `eas.json`**

Si no existe en raíz:
```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal", "ios": { "simulator": false } },
    "production": { "autoIncrement": true }
  },
  "submit": { "production": {} }
}
```

**4. Configurar credenciales iOS**
```bash
eas credentials
```
Selecciona **iOS → production → "Set up new credentials"**. EAS te guía:
- Apple Developer login
- Distribution Certificate (lo crea automáticamente)
- Provisioning Profile (idem)
- Push notifications key

Solo lo haces una vez.

**5. Build de development (opcional pero recomendado)**
```bash
eas build --profile development --platform ios --simulator
```
Tarda ~15-20 min. Te da un `.app` para correr en simulador. Útil para probar Apple Sign In + RevenueCat sandbox antes del production build.

✅ **Verificación**: corre el dev build en simulador, prueba grabar/transcribir, login con Apple, paywall.

---

# 🔴 3.2 Production build → TestFlight

⏱️ **30 min build + 24h review**

### Pasos

**1. Subir versión y build number en `app.json`**
```json
"version": "1.0.0",
"ios": { "buildNumber": "1" }
```
(El `buildNumber` se incrementa con cada upload a TestFlight.)

**2. Production build**
```bash
eas build --profile production --platform ios
```
Tarda ~20-30 min.

**3. Submit a App Store Connect**
```bash
eas submit --profile production --platform ios
```
Pide tu Apple ID + app-specific password (créala en https://appleid.apple.com → Sign In and Security → App-Specific Passwords).

**4. Configurar TestFlight**

ASC → tu app → TestFlight:
- Internal Testing → añade tu email + tu equipo
- Test Information → describe qué probar

**5. Review TestFlight (~24h, más rápido en internal)**

Cuando llegue el email "Ready to Test", instala TestFlight en tu iPhone, abre Sythio y prueba:

- [ ] Login con Apple
- [ ] 2FA enrollment + verify + disable
- [ ] Grabar audio 30s → procesa → ve resultado
- [ ] Cambiar de modo en la nota
- [ ] Exportar PDF y Excel
- [ ] Compartir nota → link público abre en browser
- [ ] Comprar Premium en **Sandbox** (ASC → Sandbox Testers → crea uno)
- [ ] `profiles.plan` cambia a `premium` en Supabase tras la compra
- [ ] Restaurar compra
- [ ] Límite free (2 notas/día) bloquea la 3ª

⚠️ **Sandbox tip**: cierra sesión de App Store en iPhone (Settings → App Store), entra con tu sandbox tester. Si entras con tu Apple ID real, te cobra de verdad.

---

# 🔴 3.3 Submit a App Store

⏱️ **1-2 días review Apple**

### Pasos

**1. Llenar metadata en App Store Connect**

App Store → tu app → App Store tab:
- App Name: `Sythio`
- Subtitle: `Voz a resultados con IA` (max 30 chars)
- Privacy Policy URL: `https://sythio.app/privacy-policy` ✅
- Support URL: `https://sythio.app`
- Category: Productivity
- Age Rating: 4+

**2. Capturas de pantalla** (mínimo iPhone 6.7" — 1290 × 2796 px)

5 capturas recomendadas:
1. Pantalla de grabación (botón violet glow)
2. Procesamiento (4 fases)
3. Resultado de un modo (Reporte ejecutivo)
4. Selector de modos (3 hero + bottom sheet)
5. Paywall

**3. App Privacy** (Privacy Nutrition Label)

ASC → App Privacy. Llena:
- Audio Recordings → Used for App Functionality (Linked to User, NO tracking)
- Email Address → Used for App Functionality (Linked to User)
- User ID → Used for App Functionality
- Usage Data → Used for Analytics (Linked to User)

**4. Submit for Review**

Click "Add for Review" → "Submit for Review". Apple revisa en 24-48h.

**Razones comunes de rechazo:**
- "Sign In with Apple" no implementado correctamente → ya está OK ✅
- Privacy Policy no carga → ya carga 200 ✅
- Crashes → prueba EXHAUSTIVO en TestFlight antes

✅ **Cuando aprueben**: "Release this version" → app live en App Store. 🚀

---

# 📋 Apéndices

## Comandos útiles

```bash
# Backend (Supabase)
supabase secrets list
supabase secrets set KEY=value
supabase functions deploy <name>
supabase db push

# Mobile (EAS)
eas build --profile development --platform ios --simulator
eas build --profile production --platform ios
eas submit --profile production --platform ios
eas credentials

# Web (Vercel)
cd web && vercel --prod

# Type check
npx tsc --noEmit
```

## Troubleshooting

### "Apple Sign In falla con invalid_client"
Service ID en Supabase no coincide con el de Apple Developer. Debe ser exactamente `com.sythio.app.signin`.

### "Stripe webhook nunca llega"
Stripe Dashboard → Webhooks → tu endpoint → Logs. Si 400 "signature failed" → `STRIPE_WEBHOOK_SECRET` mal copiado.

### "TestFlight build crashea al abrir"
Falta plugin en `app.json`. Verifica que `expo-apple-authentication` está en `plugins`.

### "Usuario pagó pero `profiles.plan` sigue en free"
1. Webhook llegó? (Stripe/RevenueCat dashboard → Logs)
2. ¿`provider` column existe? (sí, ya está en migración 20260427000003)
3. Logs del webhook: ¿el `userId` del `client_reference_id` matches `auth.users.id`?

## Calendario sugerido (4-6 hr/día)

| Día | Tarea |
|---|---|
| 1 | 1.2 RevenueCat (productos en ASC + RevenueCat config) |
| 1 | 3.1 EAS Build setup + dev build iOS |
| 2 | Testing dev build (Apple, 2FA, RevenueCat sandbox) |
| 2 | 3.2 Production build → submit TestFlight |
| 3-4 | Esperar review TestFlight + bug fixes |
| 5 | Testing exhaustivo TestFlight |
| 6 | 3.3 Submit App Store |
| 7-9 | Esperar review Apple |
| 10 | 🚀 Release |
