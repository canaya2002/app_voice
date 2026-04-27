# Sythio — Documento Maestro

**Fecha de análisis:** 2026-04-27
**Branch:** main
**Estado general:** MVP sólido (~90% listo para producción del core)

---

## 1. Qué es Sythio (en una frase)

**Sythio convierte audio en resultados accionables — no transcripciones.** Grabas tu voz y la app te devuelve resúmenes ejecutivos, tareas, planes de acción, mensajes listos para enviar, fichas de estudio, etc., con detección de hablantes y exportación profesional.

> *"Turn voice into clarity, action, and structure."*

No es una app de transcripción. No es una app de notas de voz. Es una herramienta **voice-to-outcomes**: el usuario habla, recibe estructura accionable.

---

## 2. Qué hace exactamente (flujo de usuario)

### Flujo principal (90 segundos típicos)

```
1. USUARIO ABRE LA APP
   ↓
2. ELIGE TEMPLATE (opcional, define contexto)
   → Idea rápida / Reunión / Tarea / Cliente / Diario /
     Clase / Brainstorm / Followup / Reflexión
   ↓
3. PULSA GRABAR
   → Hasta 10 min (free) o 30 min (premium)
   → Waveform en vivo + temporizador
   ↓
4. DETIENE → ELIGE MODO DE OUTPUT
   → Resumen / Tareas / Plan / Texto limpio /
     Reporte ejecutivo / Mensaje listo / Estudio /
     Ideas / Outline
   ↓
5. PROCESAMIENTO (4 fases visibles)
   a) Subiendo audio a Supabase Storage
   b) Transcribiendo con Groq Whisper (large-v3-turbo)
   c) Detectando hablantes con Claude Haiku 4.5
   d) Generando resultado del modo elegido con Claude Haiku 4.5
   ↓
6. RESULTADO ESTRUCTURADO
   → Renderizado nativo según modo (checklist, charts, flashcards…)
   → Transcript con burbujas por hablante (renombrables)
   → Botón flotante de exportación (PDF / Excel / Copy / Share)
   → Chat IA con contexto de la nota
```

### Funciones secundarias

- **Convertir modo a posteriori**: una nota grabada como "Resumen" puede convertirse a "Tareas" o "Plan de acción" sin re-transcribir (reusa el transcript).
- **Renombrar hablantes**: "Speaker 1" → "Carlos", "Speaker 2" → "Cliente".
- **Carpetas, tags, pins, bookmarks** para organización.
- **Compartir nota** con link público (share token).
- **Comentarios** sobre segmentos específicos del transcript.
- **Imágenes adjuntas** a notas.
- **Task inbox global** que agrega tareas extraídas de TODAS las notas.
- **Chat IA** sobre cualquier nota ("¿qué decidimos sobre X?").

---

## 3. Stack técnico

| Capa | Tecnología |
|------|------------|
| **Frontend móvil** | Expo SDK 54 + React Native 0.81 + Expo Router 6 |
| **Frontend web** | React 19 + Vite (dashboard separado) |
| **Estado global** | Zustand 5 |
| **Animaciones** | Reanimated 4 + Gesture Handler |
| **Backend** | Supabase (Postgres + Edge Functions Deno + Storage + Auth) |
| **Transcripción** | Groq API · Whisper large-v3-turbo |
| **IA generativa** | Anthropic Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) |
| **Suscripciones** | RevenueCat (iOS + Android) |
| **Exportación** | expo-print (PDF) + xlsx (Excel) + DOCX (web) |
| **MCP** | Servidor Node.js que expone notas a Claude Desktop / Cursor / ChatGPT |
| **Idioma de UI** | Español (es-ES) |
| **TypeScript** | 5.9 strict |

**Costo por nota procesada:** ~$0.0093 USD (Groq Whisper + Claude Haiku).

---

## 4. Modos de output (9)

| Modo | Tier | Qué genera |
|------|------|------------|
| **Resumen** (`summary`) | Free | Síntesis breve + puntos clave |
| **Tareas** (`tasks`) | Free | Checklist editable con prioridad/responsable/deadline |
| **Texto limpio** (`clean_text`) | Free | Reescritura sin muletillas, profesional |
| **Ideas** (`ideas`) | Free | Idea central + oportunidades + extensiones |
| **Outline** (`outline`) | Free | Estructura jerárquica de la conversación |
| **Plan de acción** (`action_plan`) | Premium | Pasos ordenados + obstáculos + criterios de éxito |
| **Reporte ejecutivo** (`executive_report`) | Premium | Decisiones, acuerdos, pendientes + charts |
| **Mensaje listo** (`ready_message`) | Premium | Mensaje pulido en 4 tonos: profesional / amable / firme / breve |
| **Estudio** (`study`) | Premium | Conceptos + flashcards + preguntas de repaso |

---

## 5. Templates de input (9)

Definen el contexto inicial del audio para que la IA interprete mejor. Cada template tiene un **modo por defecto** sugerido:

| Template | Modo por defecto | Para qué |
|----------|------------------|----------|
| Idea rápida | `ideas` | Captura espontánea |
| Reunión | `executive_report` | Acuerdos, decisiones |
| Tarea | `tasks` | Extraer accionables |
| Cliente | `executive_report` | Llamadas con compromisos |
| Diario | `clean_text` | Reflexión personal |
| Clase | `study` | Apuntes y estudio |
| Brainstorm | `ideas` | Lluvia de ideas |
| Followup | `tasks` | Seguimiento de proyectos |
| Reflexión | `clean_text` | Pensamiento personal pulido |

---

## 6. Modelo de negocio (freemium)

| Plan | Precio | Notas/día | Duración máx | Modos | Extras |
|------|--------|-----------|--------------|-------|--------|
| **Free** | $0 | 2 | 10 min | 5 modos free | — |
| **Premium** | $14.99/mes | ∞ | 30 min | Los 9 modos | Chat IA, exportar Excel, compartir, API personal |
| **Enterprise** | $29.99/mes | ∞ | 60 min | Los 9 + workspaces | Workspaces, MCP, API ilimitada, soporte prioritario |

Pagos:
- **Mobile**: RevenueCat (iOS/Android nativo)
- **Web**: ❌ pendiente integrar Stripe

---

## 7. Arquitectura de archivos (alto nivel)

```
app_voice/
├── app/                    # Expo Router (file-based routing)
│   ├── (auth)/             # onboarding, login, register, welcome
│   ├── (tabs)/             # index (home), tasks, history, profile, menu
│   ├── note/[id].tsx       # Detalle de nota (550+ líneas)
│   └── workspace/          # Workspaces empresariales
├── components/             # 29 componentes reutilizables
│   ├── ModeResultView.tsx  # 56KB — renderiza los 9 modos
│   ├── AudioRecorder.tsx   # 17KB — grabador con waveform
│   ├── AIChatModal.tsx     # 26KB — chat con contexto
│   └── …
├── lib/                    # 20 archivos de lógica (prompts, audio, export, gates…)
├── stores/                 # Zustand: auth, notes, recording, theme, tasks, workspace
├── types/index.ts          # Todas las interfaces TS
├── supabase/
│   ├── functions/          # 10 edge functions Deno
│   └── migrations/         # 12 migraciones SQL
├── web/                    # Dashboard React + Vite
├── mcp-server/             # Servidor MCP para integraciones externas
├── docs/                   # deploy-guide, privacy, terms
└── AUDIT.md                # Doc exhaustiva del proyecto
```

---

## 8. Qué hay implementado (✅ producción-ready)

### Core funcional
- ✅ Grabación de audio con metering en vivo (expo-av)
- ✅ Transcripción Groq Whisper con auto-detect de idioma
- ✅ Detección de hablantes con Claude
- ✅ Renombrar hablantes (UI con burbujas tipo chat)
- ✅ 9 modos de output completos (prompts + render)
- ✅ 9 templates de input
- ✅ Conversión de modo lazy (no re-transcribe)
- ✅ Chat IA sobre notas con contexto

### Backend
- ✅ 10 edge functions deployables
- ✅ 12 migraciones SQL (schema completo)
- ✅ RLS en todas las tablas
- ✅ Storage privado por usuario
- ✅ Realtime subscriptions (notesStore se suscribe a cambios)
- ✅ RPC atómica para daily count
- ✅ Triggers: auto-reset diario, updated_at, profile auto-creation

### Auth & seguridad
- ✅ Email + password (Supabase Auth)
- ✅ MFA (TOTP) — lógica completa, falta UI dedicada
- ✅ Deep linking para password reset
- ✅ Rate limiting por IP en process-audio
- ✅ Daily limits enforcement server-side

### Monetización
- ✅ RevenueCat integrado (mobile)
- ✅ Webhook RevenueCat → DB sync
- ✅ Paywall component con tiers
- ✅ Gates para modos premium

### UX premium
- ✅ Tab bar custom animado con spring physics
- ✅ Glassmorphism (GlassCard)
- ✅ Light/dark mode con preferencia persistida
- ✅ Haptics contextuales
- ✅ Animaciones Reanimated 4
- ✅ Toast system custom
- ✅ Skeleton loaders
- ✅ Error boundary

### Organización
- ✅ Carpetas
- ✅ Tags, pins, bookmarks
- ✅ Soft delete (papelera)
- ✅ Búsqueda y filtros en historial
- ✅ Task inbox global (action_items)
- ✅ Comentarios en notas
- ✅ Imágenes adjuntas

### Exportación
- ✅ PDF (expo-print con HTML)
- ✅ Excel por modo (xlsx)
- ✅ Clipboard
- ✅ Share sheet nativo
- ✅ DOCX en web

### Integraciones / extensibilidad
- ✅ Slack notifications (edge function lista)
- ✅ Google Calendar OAuth (edge function lista)
- ✅ MCP server completo (list_notes, get_note, get_transcript, search_notes)
- ✅ Public API con API key auth
- ✅ Share tokens para notas públicas

### Web
- ✅ Auth completo (login, register, MFA, reset)
- ✅ Demo animado en landing
- ✅ Dashboard de notas
- ✅ Detalle de nota con todos los modos
- ✅ i18n español/inglés

---

## 9. Qué falta / está pendiente

### 🔴 Bloqueantes para lanzamiento
Ninguno crítico. La app puede ir a TestFlight/Play Store hoy.

### 🟡 Importantes (pre-launch ideal)

1. **Errores TypeScript de Reanimated** (3 errores menores)
   - `app/(auth)/onboarding.tsx:399,411` — `SharedValue` import
   - `components/LoadingScreen.tsx:43` — `SharedValue` import
   - **Solución**: actualizar `react-native-reanimated` o ajustar import

2. **UI dedicada para enrollment de 2FA**
   - `app/(tabs)/menu.tsx:292` tiene `// TODO: Navigate to dedicated 2FA screen`
   - La lógica MFA existe en `authStore.ts`, falta pantalla aparte

3. **Stripe checkout en web**
   - `web/src/components/SettingsPage.tsx:244` tiene `// TODO: Replace with Stripe Checkout URL when configured`
   - Web actualmente no permite suscribirse — solo RevenueCat mobile

4. **Limpiar últimos commits "sss"**
   - Los últimos ~15 commits son `sss`, `seos`, etc. sin mensaje útil
   - Si vas a publicar el repo, considerar squash + commit message decente

### 🟢 Nice-to-have (post-launch)

5. **Admin dashboard para workspaces empresariales**
   - Schema (`workspaces`, `workspace_members`, `channels`) ya existe
   - UI parcial (puede crear/listar) pero falta gestión completa de roles, invites, billing

6. **UI completa de Google Calendar**
   - Endpoint `calendar-auth` listo
   - Falta UI para conectar cuenta + crear eventos desde tareas con deadline

7. **UI de configuración de Slack**
   - Endpoint `notify-slack` listo
   - Setup actual es manual (pegar webhook URL); falta wizard

8. **Social login** (Google, Apple)
   - Hoy solo email/password
   - Apple Sign In es prácticamente requerido por App Store si tienes otros logins

9. **Batch export UI**
   - Exportar varias notas a la vez en un ZIP/PDF combinado

10. **Generación de API keys desde UI**
    - Endpoint `public-api` valida API keys
    - Falta pantalla para crearlas/revocarlas (hoy hay que insertar en DB manualmente)

11. **Custom branding en workspaces enterprise**
    - Logo, colores, dominio propio

### 📋 Verificar antes de publicar

- [ ] `npx tsc --noEmit` pase limpio (3 errores menores hoy)
- [ ] EAS Build profile `production` configurado
- [ ] App Store Connect listo (capturas, descripción, política de privacidad)
- [ ] RevenueCat sandbox testeado en dispositivo real
- [ ] Cuotas de Groq + Anthropic en plan apropiado
- [ ] Edge functions deployadas con env vars correctas
- [ ] Storage bucket `audio-files` con políticas activas
- [ ] Rate limiting probado bajo carga

---

## 10. Métricas de completitud

| Área | % completado |
|------|--------------|
| Core funcional (grabar → IA → resultado) | 100% |
| 9 modos de output | 100% |
| Backend Supabase | 95% |
| Auth + seguridad | 95% (falta UI 2FA dedicada) |
| Exportación | 100% |
| UX/UI mobile | 90% |
| Web dashboard | 80% (falta Stripe) |
| Workspaces enterprise | 40% (schema sí, UI no) |
| Integraciones (Slack, Calendar) | 50% (backend sí, UI parcial) |
| MCP server | 100% |
| Documentación | 90% |

**Estimación global:** ~85-90% del producto está listo. El 10-15% restante es enterprise + pulimiento web.

---

## 11. Próximos pasos sugeridos (priorizados)

### Sprint 1 — Salir a producción mobile (1 semana)
1. Fix de los 3 errores TS de Reanimated
2. UI dedicada de 2FA enrollment
3. Squash commits "sss" + commit con mensaje real
4. EAS Build production → TestFlight
5. Google Play Internal Testing

### Sprint 2 — Web monetizable (1 semana)
6. Integrar Stripe Checkout en web settings
7. Sync Stripe ↔ DB via webhook (similar a RevenueCat)
8. Apple Sign In (requisito App Store)

### Sprint 3 — Enterprise real (2 semanas)
9. Admin dashboard de workspaces (roles, invites, miembros)
10. UI de generación de API keys
11. UI de configuración de Slack/Calendar
12. Batch export

### Sprint 4 — Diferenciación (continuo)
13. Custom branding enterprise
14. Templates personalizados por usuario
15. Marketplace de prompts
16. Sythio Agents (agentes que actúan en tus notas)

---

## 12. Referencias rápidas

| Documento | Ubicación | Para qué |
|-----------|-----------|----------|
| AUDIT.md | `/AUDIT.md` | Estado técnico exhaustivo (35KB) |
| Deploy guide | `/docs/deploy-guide.md` | Cómo publicar a producción |
| Privacy policy | `/docs/privacy-policy.html` | Política de privacidad |
| Terms of service | `/docs/terms-of-service.html` | Términos de uso |
| Este documento | `/docs/SYTHIO.md` | Visión global + pendientes |

---

*Sythio no es voice-to-text. Es voice-to-outcomes.*
