# Sythio — Paso a Paso para Lanzar a Producción

**Última actualización:** 2026-04-27
**Audiencia:** Carlos (founder/dev)
**Objetivo:** Sacar Sythio a TestFlight + producción web sin sorpresas

---

## Estado actual (snapshot)

**Hecho ✅**

- **1.1 Stripe** — 4 productos creados (Premium $14.99/$149.99, Enterprise $29.99/$299.99), webhook en `…/stripe-webhook`, signing secret guardado, todas las price IDs en `.env`
- **1.3 Apple Developer** — Sign In with Apple capability, Service ID `com.sythio.app.signin`, Key creada, Associated Domains, AASA en `web/public/.well-known/apple-app-site-association` con Team ID `ZR9U47SXX6`
- **1.4 Supabase Auth** — Apple provider habilitado vía **JWS** (no `.p8` — Supabase ya no acepta key directa) + Site URL `https://sythio.app` + Redirect URLs (`sythio.app/**`, `www.sythio.app/**`, `localhost:5173/**`, `localhost:3000/**`, `sythio://**`, `exp://**`)
- **2.1 Secrets en Supabase** — 11 secrets seteadas vía `scripts/setup-supabase-secrets.sh` (gitignored): Stripe x8, Anthropic, Groq, RevenueCat webhook secret. Verificado con `supabase secrets list` 2026-04-27.
- **2.2 Migraciones SQL** — 15/15 sincronizadas con remote (verificado con `supabase db push` → "Remote database is up to date"). Schema completo: notes (retry_count, images), profiles (display_name, push_token, vocabulary, plan_expires_at, daily_audio_minutes), integrations table, enterprise_orgs/members, subscriptions con columnas Stripe (provider, stripe_customer_id, stripe_subscription_id) + status `past_due`. **Convención nueva:** todos los archivos de migración usan formato `YYYYMMDDHHMMSS_*.sql` (14 dígitos) — la CLI no maneja bien la mezcla de 8 y 14 dígitos. Tras renames + repair, todo quedó alineado.
- **2.3 Edge Functions deploy** — 12/12 funciones deployadas y validadas. Creado `supabase/config.toml` con `verify_jwt = false` para 4 endpoints públicos (stripe-webhook, revenuecat-webhook, get-shared-note, public-api). Validación HTTP: stripe-webhook responde 400 "Invalid signature" (HMAC funciona), revenuecat-webhook 401 "Unauthorized" (Bearer check funciona), endpoints user-facing retornan 401 sin JWT como debe ser.
- **Crédito Anthropic** — saldo cargado y Auto-reload activado.
- **Validación end-to-end de Stripe** — webhook test desde Stripe Dashboard OK + flujo completo de checkout en web local OK (`profiles.plan` se actualizó a `premium` tras pago con tarjeta test) + Apple Sign In en web local OK.
- **4.x Web deploy a Vercel + DNS** — sythio.app live, privacy-policy + terms + AASA file responden 200. Deploy manual con `vercel --prod` desde `web/`. ⚠️ Auto-deploy GitHub→Vercel no está funcionando (último auto-deploy hace 14d) — reconectar en Vercel Dashboard cuando haya tiempo.

**Próximo paso recomendado** → **1.2 RevenueCat** (más bloqueante porque desbloquea TestFlight) → **3.x Mobile build / EAS** → submit a App Store.

**Pendiente bloqueante 🔴**

- 1.2 RevenueCat (productos en App Store Connect/Play Console + entitlements + webhook con `Bearer 807f2793...`)
- 3.x Mobile build (EAS) → TestFlight
- 3.3 Submit a App Store

**Follow-up post-launch 🟡**
- Reconectar GitHub → Vercel auto-deploy (Vercel Dashboard → sythio-web → Settings → Git → Connect Repository)

---

## ⚠️ Recordatorio crítico: el JWS de Apple expira

Apple permite máximo **6 meses** de vigencia para el client secret JWT. El JWS que pegamos en Supabase hoy (2026-04-27) **expira como tarde el 2026-10-27**.

Antes de esa fecha hay que:

1. Generar un JWS nuevo firmando con la misma `.p8` (o crear una key nueva si la perdiste).
2. Reemplazar el "Secret Key (for OAuth)" en Supabase → Auth → Providers → Apple.

**Acción ahora:** poner recordatorio en calendario para **2026-10-15** (12 días antes para tener margen). Si el JWS expira sin reemplazo, todos los logins con Apple se rompen en producción.

---

## Verificación rápida — probar Apple Sign In ahora

Antes de avanzar a Stripe, valida que la config de Apple + Supabase funciona end-to-end:

```bash
cd web && npm run dev
```

Abre `http://localhost:5173` → click "Continuar con Apple".

**Flujo esperado:**

1. Popup de Apple → completa login
2. Redirige a `https://oewjbeqwihhzuvbsfctf.supabase.co/auth/v1/callback`
3. De ahí regresa a `localhost:5173` autenticado
4. En Supabase Dashboard → Authentication → Users debería aparecer un row nuevo con provider `apple`

**Si falla:**

- `invalid_client` → el Service ID en Supabase no coincide exactamente con el de Apple. Revisa mayúsculas/espacios.
- `invalid_grant` → el JWS está mal formado o expirado. Verifica claims: `iss`=Team ID, `sub`=Service ID, `aud`=`https://appleid.apple.com`, `exp` futuro.
- Redirige pero no autentica → falta `https://sythio.app/**` o `http://localhost:5173/**` en Redirect URLs de Supabase (ya están).

---

## Cómo usar este documento

Cada sección es un **bloque accionable**. El orden importa: las secciones de arriba son prerrequisitos de las de abajo. No saltes pasos.

Convención:

- 🔴 **Bloqueante** — sin esto no puedes lanzar
- 🟡 **Importante** — debería estar antes del lanzamiento
- 🟢 **Nice-to-have** — puede esperar a post-launch
- ✅ **Hecho** — completado en sesiones anteriores
- ⏱️ Tiempo estimado por bloque

---

# FASE 1 — Configuración de cuentas externas

Esto se hace UNA VEZ. Son las cuentas en servicios de terceros que Sythio necesita para cobrar y autenticar.

## 1.1 ✅ Stripe — pagos en web

⏱️ 30-45 minutos

### Por qué

La app móvil cobra por App Store/Play Store (vía RevenueCat). El dashboard web (`sythio.app`) cobra con tarjeta directa vía Stripe. Sin Stripe, los usuarios web no pueden suscribirse.

### Pasos

**1. Crear cuenta Stripe**

- Ve a https://stripe.com/register
- Completa el alta (puede pedir RFC o datos fiscales — usa los de tu empresa).
- Activa tu cuenta (Stripe verifica documentación; puede tardar 1-2 días).

**2. Crear los 4 productos de Sythio**

En Stripe Dashboard → Products → Add product. Crea estos exactos:

| Producto                  | Precio      | Billing           | Descripción                        |
| ------------------------- | ----------- | ----------------- | ---------------------------------- |
| Sythio Premium            | $14.99 USD  | Recurring monthly | Notas ilimitadas, 9 modos, chat IA |
| Sythio Premium (anual)    | $149.99 USD | Recurring yearly  | 2 meses gratis vs mensual          |
| Sythio Enterprise         | $29.99 USD  | Recurring monthly | Workspaces, MCP, API ilimitada     |
| Sythio Enterprise (anual) | $299.99 USD | Recurring yearly  | 2 meses gratis vs mensual          |

Para cada producto, copia el **Price ID** (formato `price_1Xxxx...`). Los necesitarás abajo.

**3. Configurar el webhook**

Stripe Dashboard → Developers → Webhooks → Add endpoint.

- **Endpoint URL**: `https://oewjbeqwihhzuvbsfctf.supabase.co/functions/v1/stripe-webhook`
  _(reemplaza `oewjbeqwihhzuvbsfctf` con tu project-ref real de Supabase si es distinto)_
- **Events to send**: marca estos 4:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- Copia el **Signing secret** (formato `whsec_...`). Lo usarás en el siguiente bloque.

**4. Guardar credenciales**

Anota en un gestor de contraseñas (1Password / Bitwarden) — NO commits:

```
STRIPE_SECRET_KEY=sk_live_...      (Developers → API keys → Secret key)
STRIPE_WEBHOOK_SECRET=whsec_...    (del paso 3)
STRIPE_PRICE_PREMIUM_MONTHLY=price_...
STRIPE_PRICE_PREMIUM_YEARLY=price_...
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_...
STRIPE_PRICE_ENTERPRISE_YEARLY=price_...
```

**Tip**: durante desarrollo usa `sk_test_...` y crea un webhook separado apuntando al `stripe-webhook` (puedes tener varios endpoints). Switchea a live cuando lances.

✅ **Verificación**: en Stripe Dashboard → Customers debería estar vacío. Significa que las claves funcionan pero nadie ha pagado aún.

---

## 1.2 🔴 RevenueCat — pagos en iOS/Android

⏱️ 45-60 minutos (la primera vez)

### Por qué

Apple y Google obligan a que los pagos in-app pasen por sus sistemas. RevenueCat es la capa que abstrae ambas tiendas y nos da una sola API + webhook.

### Pasos

**1. Crear cuenta RevenueCat**

- https://www.revenuecat.com → Sign up (gratis hasta $10K/mes de revenue)

**2. Crear el proyecto**

- New Project → nombre `Sythio`
- Añadir dos apps:
  - **iOS**: `com.sythio.app` (debe coincidir con `app.json`)
  - **Android**: `com.sythio.app`

**3. Conectar con App Store Connect**

- Necesitas tu **App Store Connect API Key** (https://appstoreconnect.apple.com → Users and Access → Keys → App Store Connect API).
- En RevenueCat → Project Settings → Apps → iOS app → pega Issuer ID, Key ID, P8 key.

**4. Conectar con Google Play Console**

- Crea una Service Account en Google Cloud Console con rol Pub/Sub Editor.
- Descarga el JSON y súbelo a RevenueCat → Android app config.

**5. Crear los productos en RevenueCat**

RevenueCat NO crea productos en las tiendas — los crea en App Store Connect / Play Console y los sincroniza. Así que primero ve a:

**App Store Connect** → tu app → In-App Purchases:

- `sythio_premium_monthly` — Auto-Renewable Subscription, $14.99/mes, grupo de suscripción `Sythio`
- `sythio_premium_yearly` — Auto-Renewable, $149.99/año, mismo grupo
- `sythio_enterprise_monthly` — Auto-Renewable, $29.99/mes, mismo grupo
- `sythio_enterprise_yearly` — Auto-Renewable, $299.99/año, mismo grupo

Repite los mismos identifiers en **Play Console** → Monetize → Subscriptions.

**6. Configurar Entitlements en RevenueCat**

RevenueCat → Project → Entitlements:

- Crea `premium` → adjunta los 2 productos premium (monthly + yearly)
- Crea `enterprise` → adjunta los 2 productos enterprise

**Importante**: estos identificadores `premium` y `enterprise` son los que `lib/pricing.ts` ya espera (ver `revenueCatEntitlement`). No los cambies o tendrás que actualizar el código.

**7. Configurar el Offering**

RevenueCat → Offerings → crea un offering `default`:

- Package `monthly` → producto `sythio_premium_monthly`
- Package `annual` → producto `sythio_premium_yearly`
- Para Enterprise crea un offering `enterprise` aparte si quieres mostrar paywall específico.

**8. Configurar el webhook**

RevenueCat → Project → Integrations → Webhooks → Add:

- URL: `https://oewjbeqwihhzuvbsfctf.supabase.co/functions/v1/revenuecat-webhook`
- Authorization header: `Bearer <token-secreto>` (genera uno random — guárdalo en `REVENUECAT_WEBHOOK_SECRET`)

**9. Copiar las API keys públicas**

RevenueCat → Project Settings → API keys → copia:

- iOS API Key (formato `appl_...`)
- Android API Key (formato `goog_...`)

Estas SÍ van al cliente (son public keys; no son secretos).

✅ **Verificación**: en RevenueCat → Charts deberías ver $0 de revenue. Confirmas que la cuenta existe.

---

## 1.3 ✅ Apple Developer — Sign In with Apple **(HECHO 2026-04-27)**

⏱️ 30 minutos (si ya tienes cuenta dev de pago)

> **Estado:** completado. Service ID `com.sythio.app.signin`, Key creada, AASA file desplegado con Team ID `ZR9U47SXX6`. Pasos abajo conservados como referencia para troubleshooting o si hay que regenerar credenciales.

### Por qué

Apple requiere "Sign In with Apple" en cualquier app que ofrezca otros logins sociales (lo añadimos en esta sesión). Sin esto, App Store rechaza la app.

### Pasos

**1. Activar la capability en tu App ID**

- https://developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → tu App ID (`com.sythio.app`)
- Marca la casilla **Sign In with Apple** → Save

**2. Crear un Service ID**

- Identifiers → "+" → Services IDs → Continue
- Description: `Sythio Web Auth`
- Identifier: `com.sythio.app.signin` (debe ser distinto del bundle ID)
- Marca **Sign In with Apple** → Configure:
  - Primary App ID: `com.sythio.app`
  - Domains and Subdomains: `oewjbeqwihhzuvbsfctf.supabase.co`
  - Return URLs: `https://oewjbeqwihhzuvbsfctf.supabase.co/auth/v1/callback`
- Save

**3. Crear una Key**

- Keys → "+" → nombre `Sythio Sign In Key`
- Marca **Sign In with Apple** → Configure → primary App ID `com.sythio.app`
- Continue → Register
- **Descarga el archivo `.p8`** (solo se descarga UNA VEZ, guárdalo a salvo)
- Anota el **Key ID** (10 caracteres)
- Anota tu **Team ID** (10 caracteres, está en la esquina sup-derecha del developer portal)

**4. Configurar Associated Domains**

- En tu App ID → Capabilities → marca Associated Domains
- Esto permite el deep linking de `applinks:sythio.app` que ya añadimos a `app.json`

**5. Subir el `apple-app-site-association` a tu dominio**

Crea un archivo en `web/public/.well-known/apple-app-site-association` (sin extensión) con:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TU_TEAM_ID.com.sythio.app",
        "paths": ["*"]
      }
    ]
  }
}
```

Reemplaza `TU_TEAM_ID` con tu Team ID real. Cuando deployes la web, Apple verifica esta URL para activar deep linking.

✅ **Verificación**: navega a `https://sythio.app/.well-known/apple-app-site-association` después del deploy y deberías ver el JSON.

---

## 1.4 ✅ Supabase Auth — configurar URLs y Apple provider **(HECHO 2026-04-27)**

⏱️ 15 minutos

> **Estado:** completado. Apple provider habilitado vía **JWS** (la UI nueva de Supabase ya no acepta los 4 campos separados — pide directamente el JWT firmado). Site URL y Redirect URLs configurados. Recordatorio de expiración del JWS arriba (sección "Recordatorio crítico").

### Por qué

Supabase necesita saber a qué dominios puede redirigir después de auth (login, password reset, OAuth callback). Si no, el flujo se rompe.

### Pasos

**1. Site URL y Redirect URLs**

Supabase Dashboard → tu proyecto → Authentication → URL Configuration:

- **Site URL**: `https://sythio.app`
- **Redirect URLs** (add cada una):
  - `https://sythio.app/**`
  - `https://www.sythio.app/**`
  - `http://localhost:5173/**` (Vite dev)
  - `http://localhost:3000/**` (alternative dev port)
  - `sythio://**` (deep link mobile)
  - `exp://**` (Expo Go dev)

**2. Habilitar Apple provider**

Authentication → Providers → Apple → Enable.

> ⚠️ **Nota importante:** la UI nueva de Supabase pide un **JWS (Client Secret JWT) ya firmado**, no los 4 campos separados (`Team ID`, `Key ID`, `Private Key`). Hay que generar el JWT manualmente firmando con la `.p8`.

**Generar el JWS** (script Node de un solo uso):

```js
// Requiere: npm i jsonwebtoken
const jwt = require("jsonwebtoken");
const fs = require("fs");

const privateKey = fs.readFileSync("./AuthKey_XXXXXXXXXX.p8"); // tu .p8
const teamId = "ZR9U47SXX6";
const keyId = "XXXXXXXXXX"; // 10 caracteres del Key
const serviceId = "com.sythio.app.signin";

const token = jwt.sign({}, privateKey, {
  algorithm: "ES256",
  expiresIn: "180d", // máximo 6 meses
  audience: "https://appleid.apple.com",
  issuer: teamId,
  subject: serviceId,
  keyid: keyId,
});

console.log(token);
```

**Pegar en Supabase:**

- Authentication → Providers → Apple → Enable
- **Client IDs**: `com.sythio.app.signin` (el Service ID)
- **Secret Key (for OAuth)**: pega el JWT generado arriba
- Save

**3. Habilitar Google provider** (opcional pero recomendado)

Si quieres mantener "Continuar con Google" en el web/Android:

- https://console.cloud.google.com → APIs & Services → Credentials → OAuth 2.0 Client IDs
- Web application → Authorized redirect URIs: `https://oewjbeqwihhzuvbsfctf.supabase.co/auth/v1/callback`
- Copia Client ID + Client Secret a Supabase Dashboard → Auth → Providers → Google

✅ **Verificación**: desde la web (en localhost) intenta loguearte con Apple. Debería abrir el popup de Apple → completar → redirigir a tu localhost autenticado. Si falla, revisa que el Service ID en Supabase coincide exactamente.

---

# FASE 2 — Deploy del backend

Esto es lo que conecta el código que escribimos con los servicios externos que configuraste arriba.

## 2.1 🔴 Configurar secrets en Supabase Edge Functions

⏱️ 10 minutos

Los edge functions corren en Deno y leen variables de entorno via `Deno.env.get()`. Hay que setearlas con la CLI de Supabase.

### Pasos

**1. Instalar la CLI de Supabase** (si no la tienes)

```bash
npm install -g supabase
supabase login
```

**2. Linkar tu proyecto local**

Desde la raíz del repo:

```bash
supabase link --project-ref oewjbeqwihhzuvbsfctf
```

Te pedirá la database password (la encuentras en Dashboard → Project Settings → Database).

**3. Setear los secrets**

Para cada variable de Stripe + RevenueCat + Groq + Anthropic, ejecuta:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxxxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxxx
supabase secrets set STRIPE_PRICE_PREMIUM_MONTHLY=price_xxxxx
supabase secrets set STRIPE_PRICE_PREMIUM_YEARLY=price_xxxxx
supabase secrets set STRIPE_PRICE_ENTERPRISE_MONTHLY=price_xxxxx
supabase secrets set STRIPE_PRICE_ENTERPRISE_YEARLY=price_xxxxx
supabase secrets set STRIPE_SUCCESS_URL=https://sythio.app/settings?stripe=success
supabase secrets set STRIPE_CANCEL_URL=https://sythio.app/settings?stripe=cancel

supabase secrets set REVENUECAT_WEBHOOK_SECRET=tu_token_secreto

supabase secrets set GROQ_API_KEY=gsk_xxxxx          # de console.groq.com
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx  # de console.anthropic.com

# Si usas Slack/Calendar:
supabase secrets set GOOGLE_CLIENT_ID=xxxxx
supabase secrets set GOOGLE_CLIENT_SECRET=xxxxx
```

**4. Verificar**

```bash
supabase secrets list
```

Deberías ver todas las claves listadas (sin valores — solo nombres).

⚠️ **No comitees nunca el `.env` real.** Usa `.env.example` (ya creado) como referencia.

---

## 2.2 🔴 Aplicar migraciones SQL

⏱️ 5 minutos

Hay 2 migraciones nuevas creadas en esta sesión:

- `20260427_pricing_v2.sql`
- `20260427_stripe_subscriptions.sql`

### Pasos

**1. Verificar conexión local**

```bash
supabase db diff --linked
```

Si te muestra las dos migraciones nuevas, todo bien.

**2. Aplicar a producción**

```bash
supabase db push
```

Te pedirá confirmación. Escribe `y`. La migración añade:

- Comentario en `profiles.plan` con el pricing nuevo
- Columnas `stripe_customer_id`, `stripe_subscription_id`, `provider` en `subscriptions`
- Constraint `provider IN ('revenuecat', 'stripe')`
- Índices únicos para `stripe_subscription_id`

**3. Verificar en el dashboard**

Supabase → Database → Tables → `subscriptions`. Deberías ver la columna `provider` nueva.

✅ **Verificación**: corre `select column_name from information_schema.columns where table_name = 'subscriptions';` en el SQL Editor — debe incluir `stripe_customer_id`, `stripe_subscription_id`, `provider`.

---

## 2.3 🔴 Deploy de los edge functions

⏱️ 10 minutos

### Pasos

**1. Deploy individual de las funciones nuevas**

```bash
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
```

**2. Re-deploy de las funciones afectadas por el cambio de dominio**

Como cambiamos el CORS de `sythio.com` a `sythio.app` en 7 funciones, hay que re-deployar:

```bash
supabase functions deploy process-audio
supabase functions deploy convert-mode
supabase functions deploy chat-notes
supabase functions deploy sync-subscription
supabase functions deploy cancel-subscription
supabase functions deploy get-shared-note
supabase functions deploy calendar-auth
```

O en una sola pasada:

```bash
supabase functions deploy
```

(deploya todas las del directorio `supabase/functions/`)

**3. Verificar**

Supabase Dashboard → Edge Functions → deberías ver las 12 funciones con el last-deploy timestamp actualizado.

**4. Test manual del webhook de Stripe**

Stripe Dashboard → Developers → Webhooks → tu endpoint → "Send test webhook" → `checkout.session.completed`. Si la respuesta es 200, todo bien. Si es 400 (signature failed), revisa que el `STRIPE_WEBHOOK_SECRET` que pegaste en Supabase coincide con el que Stripe muestra.

✅ **Verificación end-to-end**: en modo test, ve a `sythio.app/settings`, click "Empezar Premium" → completa con tarjeta de test `4242 4242 4242 4242`, cualquier fecha futura, cualquier CVC. Después del checkout, el `profiles.plan` debe cambiar a `premium` automáticamente. Si no, revisa los logs del webhook.

---

# FASE 3 — Deploy mobile (iOS + Android)

## 3.1 🔴 EAS Build setup

⏱️ 20 minutos primera vez

### Por qué

Expo Go no soporta `expo-apple-authentication`, `react-native-purchases`, ni el `usesAppleSignIn` capability. Tienes que hacer un **development build** (con EAS) para probar en simulador/dispositivo, y después un **production build** para subir a las stores.

### Pasos

**1. Instalar EAS CLI**

```bash
npm install -g eas-cli
eas login
```

**2. Linkar proyecto**

Desde la raíz:

```bash
eas init
```

Te asignará un `projectId`. Se guarda en `app.json` automáticamente.

**3. Verificar `eas.json`**

Ya existe en el repo. Confirma que tienes 3 perfiles:

- `development` — para correr `expo run:ios` con dev client
- `preview` — para distribuir TestFlight interno
- `production` — para App Store

Si no, copia esta config:

```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

**4. Configurar credenciales iOS**

```bash
eas credentials
```

Selecciona iOS → production → "Set up new credentials". EAS te guía:

- Apple Developer account (login)
- Distribution Certificate (lo crea por ti si no tienes)
- Provisioning Profile (lo crea automáticamente)
- Push notifications key (genera uno)

Esto solo lo haces una vez.

**5. Build de development (para probar)**

```bash
eas build --profile development --platform ios
```

Tarda ~15-20 min. Cuando termine, te da un link para descargar el `.ipa`. Instálalo en un dispositivo iOS real (con tu Apple ID), o en un simulador (`eas build --profile development --platform ios --simulator`).

✅ **Verificación**: abre la app, prueba grabar, transcribir, login con Apple, paywall. Todo debe funcionar.

---

## 3.2 🔴 Build de producción → TestFlight

⏱️ 30 minutos (build) + 24h (review TestFlight)

### Pasos

**1. Subir versión y build number**

Edita `app.json`:

```json
"version": "1.0.0",        // sube si es un release nuevo
"ios": { "buildNumber": "1" }  // sube en cada upload a TestFlight
```

**2. Production build**

```bash
eas build --profile production --platform ios
```

Tarda ~20-30 min.

**3. Submit a App Store Connect**

```bash
eas submit --profile production --platform ios
```

EAS sube el build a App Store Connect. Te pide tu Apple ID y la app-specific password (créala en https://appleid.apple.com → Sign In and Security → App-Specific Passwords).

**4. Configurar TestFlight**

App Store Connect → tu app → TestFlight:

- Internal Testing → añade tu propio email + el de tu equipo
- Review Information → llena el formulario de review (si pides external testing)
- Test Information → describe qué probar

**5. Esperar review de TestFlight**

Apple revisa el build en ~24h (más rápido en internal testing). Cuando esté aprobado, tu equipo recibe email.

**6. Probar TestFlight**

Instala la app de TestFlight en tu iPhone, abre Sythio, prueba TODO:

- ✅ Login con Apple
- ✅ 2FA enrollment + verify + disable
- ✅ Grabar audio
- ✅ Procesar nota → ver resultado
- ✅ Exportar PDF y Excel
- ✅ Comprar Premium en sandbox (App Store Connect → Sandbox Testers → crea uno)
- ✅ Confirmar que `profiles.plan` se actualizó en Supabase

⚠️ **Tip sandbox**: cierra sesión en Settings → App Store en el iPhone, y entra con tu sandbox tester antes de probar la compra. Si entras con tu Apple ID real, te cobra de verdad.

---

## 3.3 🟡 Submit a App Store

⏱️ 1-2 días review Apple

### Pasos

**1. Llenar metadata en App Store Connect**

App Store Connect → tu app → App Store:

- App Name: `Sythio`
- Subtitle: `Voz a resultados con IA` (max 30 caracteres)
- Privacy Policy URL: `https://sythio.app/privacy-policy`
- Support URL: `https://sythio.app`
- Category: Productivity
- Age Rating: 4+ (sin contenido sensible)

**2. Capturas de pantalla** (requeridas)

Mínimo iPhone 6.7" (1290 × 2796 px). Te recomiendo 5 capturas que muestren:

1. Pantalla de grabación (botón hero violet glow)
2. Procesamiento (4 fases)
3. Resultado de un modo (Reporte ejecutivo se ve premium)
4. Selector de modos (3 hero + bottom sheet)
5. Paywall

**3. App Privacy** (Privacy Nutrition Label)

App Store Connect → App Privacy. Ya tenemos el desglose en `app/_layout.tsx` (líneas 33-46). Llena:

- Audio Recordings → Used for App Functionality (Linked to User, NO tracking)
- Email Address → Used for App Functionality (Linked to User)
- User ID → Used for App Functionality
- Usage Data → Used for Analytics (Linked to User)

**4. Submit for Review**

Click "Add for Review" → "Submit for Review". Apple revisa en 24-48h. Razones comunes de rechazo:

- "Sign In with Apple" no implementado correctamente → ya está OK
- Privacy Policy no carga → confirma que `sythio.app/privacy-policy` funciona
- Crashes → prueba MUY bien en TestFlight antes

✅ **Verificación**: después de aprobado, "Release this version" → tu app está live en App Store. 🚀

---

## 3.4 🟡 Android — Google Play Console

⏱️ Similar a iOS pero con menos review

### Pasos rápidos

```bash
eas build --profile production --platform android
eas submit --profile production --platform android
```

Necesitas haber creado la app en Google Play Console previamente y configurado un Service Account JSON (mismo del paso 1.2).

**Internal Testing track** en Play Console te permite probar antes de publicar.

---

# FASE 4 — Deploy web

## 4.1 🔴 Build y deploy a Vercel

⏱️ 20 minutos primera vez

### Pasos

**1. Crear cuenta Vercel**

https://vercel.com → Sign up con GitHub.

**2. Importar proyecto**

Vercel Dashboard → Add New → Project → Import Git Repository → selecciona el repo de Sythio.

**3. Configurar build**

- **Framework Preset**: Vite
- **Root Directory**: `web`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

**4. Variables de entorno**

Settings → Environment Variables:

- `VITE_SUPABASE_URL` = `https://oewjbeqwihhzuvbsfctf.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = (el anon key de Supabase, ya está en `.env`)

⚠️ **NUNCA pongas claves secretas (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY`) en variables de Vercel.** Solo las anon/public.

**5. Deploy**

Vercel hace el primer deploy automáticamente. Cuando termine, te da una URL `xxx.vercel.app`.

---

## 4.2 🔴 Conectar dominio sythio.app

⏱️ 15 minutos + 1-24h propagación DNS

### Pasos

**1. Comprar `sythio.app`** (si no lo has hecho)

Recomendado: Cloudflare Registrar (precio sin markup) o Namecheap.

**2. Conectar a Vercel**

Vercel → tu proyecto → Settings → Domains → Add → escribe `sythio.app`.

Vercel te muestra los DNS records que necesitas. Típicamente:

- `A record` apuntando a `76.76.21.21`
- O `CNAME` `cname.vercel-dns.com`

**3. Añadir a tu registrar**

En Cloudflare/Namecheap → DNS → añade los records que Vercel pide.

**4. Esperar propagación DNS**

Tarda entre 5 minutos y 24 horas. Puedes verificar con:

```bash
dig sythio.app
nslookup sythio.app
```

**5. Verificar HTTPS**

Vercel emite cert SSL automáticamente. Cuando esté listo, `https://sythio.app` carga la web.

**6. Subir el archivo apple-app-site-association**

Crea `web/public/.well-known/apple-app-site-association` con el contenido del paso 1.3.5. Re-deploy:

```bash
git add web/public/.well-known/apple-app-site-association
git commit -m "feat: add apple-app-site-association for deep linking"
git push
```

Vercel re-deploya automáticamente. Verifica:

```bash
curl https://sythio.app/.well-known/apple-app-site-association
```

✅ **Verificación**: navega a `https://sythio.app`, regístrate con un email nuevo, prueba upgrade a Premium con Stripe (modo test). Confirma que `profiles.plan` se actualiza en Supabase.

---

# FASE 5 — Testing pre-launch (checklist completo)

⏱️ 2-4 horas si haces todo

Antes de anunciar oficialmente, valida estas 25 cosas. **No saltes ninguna.**

## Mobile (iOS via TestFlight)

- [ ] App abre sin crash en cold start
- [ ] Onboarding (3 slides) → completa flujo
- [ ] Registro con email → recibe email confirmación → click link → entra a la app
- [ ] Login con Apple Sign In → funciona y crea perfil
- [ ] Login con Google (si configurado) → funciona
- [ ] Activar 2FA → escanear QR → ingresar código → ver backup codes → descargar
- [ ] Logout → reload app → login → entra al MFA prompt → ingresa código → entra OK
- [ ] Desactivar 2FA → confirma con código → 2FA off
- [ ] Grabar audio de 30 segundos → procesa → ve resultado
- [ ] Cambiar de modo en la nota → genera el modo nuevo lazy
- [ ] Exportar a PDF → abre el PDF correctamente
- [ ] Exportar a Excel → abre el .xlsx correctamente
- [ ] Compartir nota → genera link público → abrir en browser sin login
- [ ] Renombrar speakers en transcript → persiste al volver
- [ ] Comprar Premium en Sandbox → `profiles.plan` cambia a `premium`
- [ ] Restaurar compra (otra cuenta del mismo Apple ID) → recupera Premium
- [ ] Límite diario de free (2 notas/día) → bloquea correctamente la 3ª

## Web (sythio.app)

- [ ] Landing carga rápido (<2s en throttled 3G — Chrome DevTools → Network → Slow 3G)
- [ ] Login con email funciona
- [ ] Login con Apple → completa OAuth → entra autenticado
- [ ] Settings → Upgrade → Stripe Checkout abre con precio $14.99
- [ ] Pago test con `4242 4242 4242 4242` → confirmación → vuelta a `/settings?stripe=success`
- [ ] `profiles.plan` se actualizó a `premium` (verifica en SQL editor de Supabase)
- [ ] Refrescar la página → muestra plan Premium correctamente

## Backend

- [ ] `process-audio` log no muestra errores en últimos 100 invokes
- [ ] `stripe-webhook` recibe eventos (Stripe Dashboard → Developers → Webhooks → Logs)
- [ ] RevenueCat → Customer Lifetime → muestra usuarios activos correctamente

---

# FASE 6 — Lanzamiento oficial

## 6.1 🟡 Soft launch

⏱️ 1 semana

**Estrategia**: anuncia a 20-50 personas (amigos, comunidad pequeña). Recoge feedback. Arregla bugs.

**No lances en Product Hunt todavía.**

## 6.2 🟡 Hard launch

Una semana después del soft launch sin bugs críticos:

- Product Hunt (martes/miércoles ~12am UTC, máxima visibilidad)
- Twitter/X anuncio con video demo
- LinkedIn (si target B2B)
- Indie Hackers
- HackerNews "Show HN: Sythio – voice to outcomes, not transcriptions"

---

# FASE 7 — Post-launch (Sprint 2)

🟢 Estos son los "nice to have" que pueden esperar 2-4 semanas tras lanzar.

## 7.1 Migración a primitives

⏱️ 1 semana

**Estado actual**: tenemos `Surface`, `Text`, `Button`, `EmptyState`, `Banner` listos en `components/primitives/` pero solo se usan en pantallas nuevas (2FA).

**Plan progresivo** (sin big bang):

Sprint 2 — Semana 1:

- Migrar `Paywall.tsx` (más visible) → reemplazar `Text` raw + `View` con tokens nuevos
- Migrar `NoteCard.tsx` → cards con `Surface variant="elevated"`
- Migrar `StateViews.tsx` → reemplazar con `EmptyState` primitive

Sprint 2 — Semana 2:

- Migrar todas las settings rows → `Surface` + estructura consistente
- Reemplazar `Alert.alert()` por `Banner` o `Toast` en todo el código

**Cómo medir éxito**: `grep -r "import { COLORS }" --include="*.tsx"` cada vez tenga menos resultados → más componentes ya usan tokens nuevos.

## 7.2 Workspaces enterprise admin completo

⏱️ 2 semanas

**Estado**: schema en DB ✅, edge functions ✅, UI mobile parcial, UI web parcial.

**Falta**:

- Crear/editar workspaces desde web con gestión de roles (owner/admin/member)
- Invitar miembros por email → onboarding flow
- Ver/cancelar invites pendientes
- Mover notas entre canales del workspace
- Billing por seat (Stripe Prices con quantity > 1)

**Por dónde empezar**: `app/workspace/[id].tsx` ya tiene la base. Añadir tab "Members" con tabla de roles.

## 7.3 Batch export

⏱️ 3 días

**Estado**: cada nota se exporta individualmente.

**Falta**: en historial, multi-select notas → "Exportar X notas" → ZIP con todos los PDFs/Excel.

**Implementación**:

- Selector múltiple en `app/(tabs)/history.tsx` con long-press
- Edge function nueva `batch-export` que recibe `note_ids[]` → genera ZIP en Storage → devuelve signed URL
- Email con link al usuario cuando esté listo (uses puede tomar minutos)

## 7.4 Custom branding (Enterprise)

⏱️ 1 semana

**Falta**:

- Subir logo del workspace
- Color primario custom (override del violet)
- Dominio custom (`empresa.sythio.app`)
- Quitar branding de Sythio en exports

## 7.5 Templates personalizados

⏱️ 5 días

Hoy hay 9 templates fijos. Permitir que usuarios Premium creen los suyos:

- "Mi reunión semanal" → custom prompt de IA
- "Llamada con cliente X" → vocabulario específico

## 7.6 Sythio Agents (visión a 3-6 meses)

🟢 Estado: no implementado.

Idea: agentes que actúan SOBRE tus notas. Ejemplos:

- "Cada vez que termine una llamada con cliente, manda email con resumen"
- "Cuando aparezca una tarea con deadline, créamela en Notion"
- "Si una idea aparece 3 veces en distintas notas, alértame"

Esto es la diferenciación a 6 meses. Por ahora no lo construyas.

---

# Apéndice A — Troubleshooting común

## "Stripe Checkout devuelve 500"

Causa más probable: variable de entorno no seteada.

```bash
supabase functions logs stripe-checkout --tail
```

Busca el error real. Suele ser `STRIPE_PRICE_PREMIUM_MONTHLY is undefined`.

Fix: `supabase secrets set STRIPE_PRICE_PREMIUM_MONTHLY=price_xxxxx` y re-deploy.

## "Apple Sign In falla con 'invalid client'"

Causa: el `Service ID` en Supabase no coincide exactamente con el de Apple Developer Portal.

Fix: en Supabase Dashboard → Auth → Providers → Apple → Service ID debe ser EXACTAMENTE `com.sythio.app.signin` (sin espacios, sin mayúsculas distintas).

## "TestFlight build crashes al abrir"

Causa frecuente: faltan plugins en `app.json` que el build necesita.

Fix: revisa que `expo-apple-authentication` esté en `plugins`:

```json
"plugins": [
  "expo-router",
  "expo-apple-authentication",
  ...
]
```

## "Webhook de Stripe nunca llega"

1. Verifica en Stripe Dashboard → Webhooks → Events log que el evento se generó.
2. Click el evento → "Logs" → ver respuesta de Supabase.
3. Si es 400 "signature failed" → el `STRIPE_WEBHOOK_SECRET` está mal. Cópialo de nuevo.
4. Si es 500 → revisa logs de Supabase.

## "El usuario pagó pero `profiles.plan` sigue en free"

1. ¿Llegó el webhook? (paso anterior)
2. ¿La columna `provider` existe? Si no, falta la migración. Aplícala.
3. Mira los logs del webhook: ¿el `userId` del `client_reference_id` coincide con un `auth.users.id` real?

## "Deep link de password reset no abre la app"

1. Confirma que `sythio://` está en Redirect URLs de Supabase.
2. Confirma que `app.json` tiene `"scheme": "sythio"`.
3. En iOS, debes haber instalado la app via TestFlight (no Expo Go) para que el scheme funcione.

---

# Apéndice B — Comandos útiles de referencia rápida

```bash
# Backend
supabase secrets list
supabase secrets set KEY=value
supabase functions deploy <name>
supabase functions logs <name> --tail
supabase db push
supabase db diff --linked

# Mobile builds
eas build --profile development --platform ios
eas build --profile production --platform ios
eas build --profile production --platform android
eas submit --profile production --platform ios
eas submit --profile production --platform android
eas credentials

# Type checking
npx tsc --noEmit

# Lint
npm run lint  # mobile (expo lint)
cd web && npm run lint  # web

# Web build local
cd web && npm run build && npm run preview

# Stripe testing
stripe listen --forward-to https://oewjbeqwihhzuvbsfctf.supabase.co/functions/v1/stripe-webhook
stripe trigger checkout.session.completed
```

---

# Apéndice C — Orden de lanzamiento sugerido (calendario realista)

Asumiendo que dedicas 4-6 horas/día:

| Día   | Tarea                                                          | Tiempo       |
| ----- | -------------------------------------------------------------- | ------------ |
| 1     | Fase 1.1 (Stripe) + 1.4 (Supabase Auth)                        | 1h           |
| 1     | Fase 1.2 (RevenueCat — productos en App Store Connect)         | 2h           |
| 2     | Fase 1.3 (Apple Developer — Service ID, Key)                   | 1h           |
| 2     | Fase 2.1 (secrets) + 2.2 (migraciones) + 2.3 (deploy edge fns) | 1h           |
| 2     | Fase 2 — testing manual de webhooks Stripe                     | 30min        |
| 3     | Fase 3.1 (EAS build setup) + dev build iOS                     | 2h           |
| 3     | Testing en dev build (login Apple, 2FA, Stripe sandbox)        | 2h           |
| 4     | Fase 3.2 (production build → TestFlight)                       | 1h           |
| 4     | Fase 4.1 (Vercel) + 4.2 (DNS sythio.app)                       | 1h           |
| 5     | Esperar review TestFlight + fixing bugs                        | —            |
| 6     | Fase 5 (testing pre-launch completo)                           | 4h           |
| 7-13  | Soft launch + iteración                                        | —            |
| 14    | Fase 3.3 (submit App Store)                                    | 1h           |
| 15-17 | Esperar review Apple                                           | —            |
| 18    | Hard launch (Product Hunt etc.)                                | día completo |

**Total**: ~3 semanas desde "todo el código listo" hasta "público en App Store".

---

# Resumen — Lo crítico en 5 puntos

1. **Configura Stripe + RevenueCat + Apple Developer** (Fase 1) — son las 3 cuentas externas sin las cuales no puedes cobrar ni pasar el review.
2. **Setea secrets en Supabase + deploy edge functions** (Fase 2) — conecta el código a las cuentas.
3. **EAS Build → TestFlight + Vercel + DNS** (Fases 3-4) — pone tu app en manos de testers reales y la web online.
4. **Testing exhaustivo** (Fase 5) — los 25 checks de la lista. No saltes ninguno.
5. **Soft launch antes que hard launch** — 1 semana con usuarios reales antes de Product Hunt.

Si te trabas en cualquier paso, el patrón siempre es el mismo: **logs primero, suposición después**. `supabase functions logs <name> --tail` y `Stripe Dashboard → Logs` son tus mejores amigos.

---

_Doc creado tras la sesión de implementación 2026-04-27. Mantenlo actualizado cuando completes pasos para no perder el hilo._
