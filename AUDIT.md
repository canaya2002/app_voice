# SYTHIO - Auditoría Completa del Proyecto

> Documento de referencia para que cualquier IA o desarrollador entienda completamente cómo funciona Sythio, su arquitectura, stack tecnológico, flujos de datos, diseño UI/UX, modelo de negocio y estructura de código.

---

## 1. VISIÓN GENERAL

**Sythio** es una aplicación móvil premium de **voz-a-resultados**. El usuario graba audio (reuniones, ideas, clases, reflexiones) y la app lo transforma automáticamente en outputs estructurados y accionables usando IA.

**Propuesta de valor:** "Habla, y Sythio lo convierte en algo útil."

- **Plataformas:** iOS y Android (vía Expo/React Native)
- **Idioma de la app:** Español (100% de la UI)
- **Modelo de negocio:** Freemium con suscripción premium vía RevenueCat

---

## 2. STACK TECNOLÓGICO

| Capa                       | Tecnología                                      | Versión                   |
| -------------------------- | ----------------------------------------------- | ------------------------- |
| **Framework**              | Expo (React Native)                             | SDK 54                    |
| **Navegación**             | Expo Router (file-based)                        | v6                        |
| **Lenguaje**               | TypeScript                                      | 5.9                       |
| **Estado global**          | Zustand                                         | 5.x                       |
| **Backend**                | Supabase (Auth + DB + Storage + Edge Functions) | —                         |
| **Transcripción**          | Groq API (Whisper large-v3-turbo)               | —                         |
| **IA / Procesamiento**     | Claude Haiku 4.5 (Anthropic API)                | claude-haiku-4-5-20251001 |
| **Detección de hablantes** | Claude Haiku 4.5 (análisis de segmentos)        | —                         |
| **Pagos / Suscripciones**  | RevenueCat (react-native-purchases)             | 9.x                       |
| **Animaciones**            | React Native Reanimated                         | 4.x                       |
| **Audio**                  | expo-av                                         | 16.x                      |
| **Exportación**            | expo-print (PDF), xlsx (Excel), expo-sharing    | —                         |
| **Notificaciones**         | expo-notifications                              | —                         |

---

## 3. ESTRUCTURA DE ARCHIVOS

```
app_voice/
├── app/                        # Pantallas (file-based routing)
│   ├── _layout.tsx             # Root layout: auth guard, fonts, RevenueCat init
│   ├── +not-found.tsx          # Pantalla 404
│   ├── (auth)/                 # Grupo de autenticación
│   │   ├── _layout.tsx         # Stack sin headers
│   │   ├── onboarding.tsx      # Carousel de 3 páginas
│   │   ├── login.tsx           # Email + contraseña
│   │   └── register.tsx        # Registro nuevo usuario
│   ├── (tabs)/                 # Tabs principales
│   │   ├── _layout.tsx         # Tab bar animado custom
│   │   ├── index.tsx           # HOME: grabación, acciones rápidas, notas recientes
│   │   ├── history.tsx         # HISTORIAL: búsqueda, filtros, lista de notas
│   │   └── profile.tsx         # PERFIL: stats, tema, cuenta, premium
│   └── note/
│       └── [id].tsx            # DETALLE DE NOTA: player, modos, transcript, export
├── components/                 # 22 componentes reutilizables
│   ├── AnimatedPressable.tsx   # Botón con spring + haptics
│   ├── AudioPlayer.tsx         # Reproductor con waveform
│   ├── AudioRecorder.tsx       # Grabador inmersivo con visualización
│   ├── EmptyState.tsx          # Estado vacío genérico
│   ├── ErrorBoundary.tsx       # Captura errores React
│   ├── ExportButton.tsx        # FAB de exportación (PDF/Excel/Copy/Share)
│   ├── FilterBar.tsx           # Chips de filtro horizontal
│   ├── FloatingOrb.tsx         # Orbe decorativo animado
│   ├── GlassCard.tsx           # Card con efecto glassmorphism
│   ├── LoadingProcessor.tsx    # Animación de procesamiento por fases
│   ├── ModeResultView.tsx      # Vista de resultados por modo (1590 líneas, el más complejo)
│   ├── ModeSelector.tsx        # Selector horizontal de modos de salida
│   ├── NoteCard.tsx            # Card de nota con swipe-to-delete
│   ├── Paywall.tsx             # Modal de suscripción premium
│   ├── QuickActions.tsx        # Grid 2x4 de acciones rápidas
│   ├── ResultTabs.tsx          # Tabs de resultados (resumen/puntos/tareas/texto)
│   ├── Skeleton.tsx            # Skeleton loading con shimmer
│   ├── SpeakerRenameModal.tsx  # Modal para renombrar hablantes
│   ├── SpeakerTranscript.tsx   # Transcript con burbujas por hablante
│   ├── StateViews.tsx          # Vistas de estado (error, premium gate, limit)
│   ├── TemplateSelector.tsx    # Selector de plantillas (compact/grid)
│   └── Toast.tsx               # Sistema de toast notifications
├── lib/                        # Lógica de negocio y utilidades
│   ├── ai-processor.ts         # Parser de resultados AI + status labels
│   ├── analytics.ts            # Tracking de eventos → Supabase
│   ├── animations.ts           # Presets de animación reutilizables
│   ├── audio.ts                # Upload audio → Supabase Storage + crear nota + invocar edge fn
│   ├── constants.ts            # Colores, límites, configs de modos/templates, theme hook
│   ├── export-excel.ts         # Generación de Excel por modo
│   ├── export.ts               # Generación de PDF + HTML
│   ├── gates.ts                # Freemium gates (daily limit, premium check, duration)
│   ├── haptics.ts              # Wrapper de expo-haptics
│   ├── logger.ts               # Console logger con prefijos
│   ├── mode-utils.ts           # Helpers para OutputMode (labels, iconos)
│   ├── notifications.ts        # Push notifications setup
│   ├── processing-watcher.ts   # Polling de estado de nota hasta 'done'
│   ├── prompts.ts              # TODOS los prompts para Claude (8 modos + speaker detection)
│   ├── purchases.ts            # RevenueCat init + subscription helpers
│   ├── speaker-utils.ts        # Parseo de segmentos + colores de hablantes
│   ├── styles.ts               # Sombras platform-aware
│   ├── supabase.ts             # Cliente Supabase inicializado
│   ├── transcription.ts        # (placeholder, transcripción real en edge function)
│   └── validation.ts           # Validación de email/password
├── stores/                     # Estado global con Zustand
│   ├── authStore.ts            # Sesión, perfil, login/register/logout
│   ├── notesStore.ts           # CRUD notas, conversión modos, subscripciones realtime
│   ├── recordingStore.ts       # Estado de UI de grabación
│   └── themeStore.ts           # Preferencia de tema (light/dark/system)
├── supabase/
│   ├── functions/
│   │   ├── process-audio/index.ts   # Edge Function principal: transcribe + detecta speakers + procesa con IA
│   │   └── convert-mode/index.ts    # Edge Function: convierte nota existente a otro modo
│   └── migrations/
│       └── 20260327_full_schema.sql # Schema completo de producción
├── types/
│   └── index.ts                # Todas las interfaces TypeScript
├── docs/                       # Documentos legales
│   ├── deploy-guide.md
│   ├── privacy-policy.html
│   └── terms-of-service.html
├── package.json
├── app.json                    # Configuración Expo
├── eas.json                    # EAS Build config
└── tsconfig.json
```

---

## 4. FLUJO DE DATOS PRINCIPAL (Core Loop)

### 4.1 Grabación → Resultado

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  1. GRABAR   │────▶│  2. UPLOAD   │────▶│ 3. EDGE FUNCTION │
│  (expo-av)   │     │  Supabase    │     │  process-audio   │
│  max 10min   │     │  Storage     │     │                  │
└──────────────┘     └──────────────┘     └────────┬─────────┘
                                                    │
                              ┌──────────────────────┤
                              ▼                      ▼
                    ┌──────────────┐     ┌──────────────────┐
                    │ 3a. GROQ API │     │ 3b. CLAUDE HAIKU │
                    │ Whisper      │     │ Speaker Detection│
                    │ Transcribe   │     │ (si hay turnos)  │
                    └──────┬───────┘     └────────┬─────────┘
                           │                      │
                           └──────────┬───────────┘
                                      ▼
                           ┌──────────────────┐
                           │ 3c. CLAUDE HAIKU │
                           │ Procesar modo    │
                           │ (summary, tasks, │
                           │  etc.)           │
                           └────────┬─────────┘
                                    ▼
                           ┌──────────────────┐
                           │ 4. GUARDAR EN DB │
                           │ notes + mode_    │
                           │ results tables   │
                           └────────┬─────────┘
                                    ▼
                           ┌──────────────────┐
                           │ 5. CLIENTE RECIBE│
                           │ via polling /    │
                           │ realtime sub     │
                           └──────────────────┘
```

### 4.2 Detalle paso a paso

1. **El usuario graba** en `AudioRecorder.tsx` usando expo-av. Selecciona un template y un modo de salida antes o durante.
2. **`lib/audio.ts` → `processRecording()`** sube el archivo `.m4a` a Supabase Storage (`audio-files/{userId}/{uuid}.m4a}`), crea un registro en `notes` con status `uploading`, e invoca la edge function `process-audio`.
3. **Edge Function `process-audio`:**
   - Descarga el audio de Storage
   - Envía a **Groq API** (Whisper large-v3-turbo) para transcripción con timestamps
   - Si hay segmentos con timestamps, envía a **Claude Haiku** para detección de hablantes
   - Envía transcript + contexto de template a **Claude Haiku** para generar el resultado del modo seleccionado
   - Guarda todo en la tabla `notes` y `mode_results`
   - Actualiza status a `done`
4. **El cliente hace polling** (`processing-watcher.ts`) cada 3s hasta que status = `done`, luego recarga la nota.

### 4.3 Conversión de modo (post-procesamiento)

Cuando el usuario quiere ver la misma nota en otro modo (ej: ya tiene "Resumen" y quiere "Tareas"):

1. Cliente llama a edge function `convert-mode` con `note_id` + `target_mode`
2. La función toma el transcript existente de la DB (no re-transcribe)
3. Envía a Claude Haiku con el prompt del modo solicitado
4. Guarda resultado en `mode_results`
5. Cliente lo recibe y lo muestra en `ModeResultView`

---

## 5. LOS 8 MODOS DE SALIDA

Cada modo tiene un prompt especializado en `lib/prompts.ts` que genera un JSON estructurado diferente:

| #   | Modo                  | ID                 | Tier    | Qué genera                                                                                                  |
| --- | --------------------- | ------------------ | ------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | **Resumen**           | `summary`          | Free    | `title_suggestion`, `summary`, `key_points[]`, `topics[]`, `speaker_highlights[]`                           |
| 2   | **Tareas**            | `tasks`            | Free    | `tasks[]` con priority/responsible/deadline/source_quote, conteos explícitas/implícitas                     |
| 3   | **Plan de acción**    | `action_plan`      | Premium | `objective`, `steps[]` ordenados con dependencias, `obstacles[]`, `next_immediate_step`, `success_criteria` |
| 4   | **Texto limpio**      | `clean_text`       | Free    | Transcripción reescrita sin muletillas, bien puntuada, en prosa o diálogo                                   |
| 5   | **Reporte ejecutivo** | `executive_report` | Premium | `executive_summary`, `decisions[]`, `agreements[]`, `pending_items[]`, `next_steps[]`, `participants[]`     |
| 6   | **Mensaje listo**     | `ready_message`    | Premium | 4 versiones del mensaje (professional/friendly/firm/brief), `suggested_subject`                             |
| 7   | **Estudio**           | `study`            | Premium | `key_concepts[]`, `review_points[]`, `probable_questions[]` con answer hints, `mnemonics[]`                 |
| 8   | **Ideas**             | `ideas`            | Free    | `core_idea`, `opportunities[]`, `interesting_points[]`, `open_questions[]`, `structured_version`            |

---

## 6. LAS 9 PLANTILLAS (Templates)

Las plantillas pre-configuran el modo de salida default y agregan contexto al prompt:

| Template     | Modo default     | Contexto para la IA                                                  |
| ------------ | ---------------- | -------------------------------------------------------------------- |
| `quick_idea` | ideas            | "Captura una idea antes de que se escape"                            |
| `meeting`    | executive_report | "Prioriza acuerdos, decisiones, responsables y pendientes"           |
| `task`       | tasks            | "Extrae todo lo accionable"                                          |
| `client`     | executive_report | "Conversación con un cliente. Prioriza compromisos y próximos pasos" |
| `journal`    | clean_text       | "Reflexión personal. Respeta el tono íntimo"                         |
| `class`      | study            | "Clase o conferencia. Prioriza conceptos y material de estudio"      |
| `brainstorm` | ideas            | "Sesión de brainstorming. Prioriza ideas y oportunidades"            |
| `followup`   | tasks            | "Seguimiento. Enfócate en avances, bloqueos y próximos pasos"        |
| `reflection` | clean_text       | "Reflexión. Organiza los pensamientos de forma clara"                |

---

## 7. MODELO DE NEGOCIO (Freemium)

### 7.1 Tier Free

| Restricción                      | Valor                                 |
| -------------------------------- | ------------------------------------- |
| Notas por día                    | **2**                                 |
| Duración máx. de audio           | **10 minutos**                        |
| Modos disponibles                | 4 (summary, tasks, clean_text, ideas) |
| Exportación avanzada (PDF/Excel) | No                                    |

### 7.2 Tier Premium

| Beneficio              | Valor                                                           |
| ---------------------- | --------------------------------------------------------------- |
| Notas por día          | **Ilimitadas**                                                  |
| Duración máx. de audio | **30 minutos**                                                  |
| Audio diario máximo    | **120 min/día**                                                 |
| Todos los modos        | 8 (incluye action_plan, executive_report, ready_message, study) |
| Exportación avanzada   | PDF + Excel                                                     |

### 7.3 Enforcement

- **Cliente:** `lib/gates.ts` verifica antes de cada acción (crear nota, usar modo, exportar)
- **Servidor:** La edge function `process-audio` verifica independientemente (daily limits, plan check, mode allowlist)
- **Rate limiting:** IP-based en edge function (10 req/min por IP)
- **Pagos:** RevenueCat maneja la suscripción. El plan se persiste en `profiles.plan`

---

## 8. BASE DE DATOS (Supabase/PostgreSQL)

### 8.1 Tablas

#### `profiles`

```sql
id              UUID PK → auth.users(id)
email           TEXT
plan            TEXT ('free' | 'premium')
daily_count     INT (default 0)
daily_audio_minutes INT (default 0)
last_reset_date DATE
premium_interest BOOLEAN
created_at      TIMESTAMPTZ
```

#### `notes`

```sql
id              UUID PK
user_id         UUID FK → profiles(id)
title           TEXT
audio_url       TEXT
audio_duration  INT (segundos)
transcript      TEXT
summary         TEXT
key_points      JSONB []
tasks           JSONB []
clean_text      TEXT
status          TEXT ('recording'|'uploading'|'transcribing'|'processing'|'done'|'error')
error_message   TEXT?
speakers_detected INT
is_conversation BOOLEAN
segments        JSONB [] (TranscriptSegment[])
speakers        JSONB [] (SpeakerInfo[])
primary_mode    TEXT
template        TEXT?
retry_count     INT
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ (auto-trigger)
```

#### `mode_results`

```sql
id         UUID PK
note_id    UUID FK → notes(id)
mode       TEXT (OutputMode)
result     JSONB
tone       TEXT? (MessageTone)
created_at TIMESTAMPTZ
```

#### `analytics_events`

```sql
id         UUID PK
user_id    UUID FK → profiles(id)
event      TEXT
properties JSONB
created_at TIMESTAMPTZ
```

### 8.2 RLS (Row Level Security)

- `profiles`: usuarios solo leen/actualizan su propio perfil
- `notes`: CRUD completo solo para notas propias (`user_id = auth.uid()`)
- `mode_results`: lectura/inserción solo si el usuario es dueño de la nota padre
- `analytics_events`: solo inserción por el usuario, lectura solo por `service_role`

### 8.3 Triggers

- `trg_notes_updated_at`: auto-actualiza `updated_at` en cada UPDATE
- `trg_auto_reset_daily`: resetea `daily_count` y `daily_audio_minutes` cuando cambia el día
- `on_auth_user_created`: crea perfil automáticamente al registrarse un usuario

### 8.4 Storage

- Bucket `audio-files` (privado)
- Estructura: `{user_id}/{uuid}.m4a`
- Políticas: usuarios solo acceden a su propia carpeta

---

## 9. EDGE FUNCTIONS (Supabase / Deno)

### 9.1 `process-audio`

**Trigger:** Invocada por el cliente después de subir audio.

**Flujo:**

1. Valida JWT del usuario
2. Verifica daily limits y plan
3. Rate limit por IP (10/min)
4. Descarga audio de Storage
5. Transcribe con Groq (Whisper large-v3-turbo) → genera segmentos con timestamps
6. Si hay segmentos con timestamps → Claude Haiku detecta hablantes
7. Claude Haiku procesa el transcript según el modo seleccionado
8. Guarda resultados en `notes` y `mode_results`
9. Incrementa `daily_count` del perfil

**Configuración de IA:**

- Modelo: `claude-haiku-4-5-20251001`
- Timeout: 120s
- Max tokens por modo: 700-1300 según complejidad
- Max transcript chars: 15,000

### 9.2 `convert-mode`

**Trigger:** Invocada cuando el usuario quiere ver una nota existente en otro modo.

**Flujo:**

1. Valida JWT
2. Verifica que el usuario sea dueño de la nota
3. Verifica que el modo no esté ya generado
4. Verifica acceso al modo (free/premium)
5. Toma transcript existente de la DB
6. Claude Haiku procesa con el prompt del nuevo modo
7. Guarda en `mode_results`

---

## 10. ESTADO GLOBAL (Zustand Stores)

### 10.1 `authStore`

- **Estado:** `session`, `profile`, `loading`, `error`
- **Acciones:** `login()`, `register()`, `logout()`, `initialize()`, `fetchProfile()`, `setPlan()`
- **Suscripción:** Escucha cambios de sesión de Supabase Auth

### 10.2 `notesStore`

- **Estado:** `notes[]`, `currentNote`, `loading`, `error`, `modeResults{}`
- **Acciones:** `fetchNotes()`, `fetchNote()`, `createNote()`, `updateNote()`, `deleteNote()`, `convertMode()`, `updateSpeakerName()`, `retryProcessing()`
- **Suscripción realtime:** Se suscribe a cambios INSERT/UPDATE/DELETE en la tabla `notes` del usuario
- **Cache:** mode_results se cachean por `note_id:mode`

### 10.3 `recordingStore`

- **Estado:** `isRecording`, `isPaused`, `duration`, `uri`, `metering[]`, `selectedTemplate`, `selectedMode`
- **Propósito:** Estado efímero de UI durante la grabación

### 10.4 `themeStore`

- **Estado:** `preference` ('light' | 'dark' | 'system')
- **Persistencia:** AsyncStorage

---

## 11. DISEÑO UI/UX

### 11.1 Filosofía de diseño

- **Minimal y premium**: fondos oscuros (#0B0B0B) o blancos, sin ruido visual
- **Glassmorphism**: cards con blur effect (BlurView en iOS, fallback opaco en Android)
- **Animaciones spring**: todo usa react-native-reanimated con spring physics para sentirse orgánico
- **Feedback háptico**: cada interacción importante tiene haptics (selección, botones, swipe)
- **Mobile-first**: orientación portrait fija, sin soporte tablet

### 11.2 Sistema de colores

**Modo Claro:**

```
Background: #FFFFFF
Surface:    #FFFFFF
SurfaceAlt: #F5F7FA
Primary:    #0B0B0B (negro)
Accent:     #8FD3FF (azul cielo claro)
Text:       #0B0B0B / #8A8F98 / #B8BCC4
Success:    #34C759
Warning:    #FF9500
Error:      #FF3B30
Recording:  #FF3B30 (rojo)
Border:     #EBEDF0
```

**Modo Oscuro:**

```
Background: #0B0B0B
Surface:    #1A1A1A
SurfaceAlt: #222222
Primary:    #FFFFFF
Text:       #F5F5F5 / #9A9FA8 / #5A5F68
```

### 11.3 Pantallas principales

#### HOME (`(tabs)/index.tsx`)

- Barra superior: saludo + avatar + stats rápidos (notas, duración, tareas)
- Sección de plantilla: chips horizontales para elegir contexto
- **Botón central de grabar**: circular grande con anillo pulsante animado
- Acciones rápidas: grid 2x4 con shortcuts a modos específicos
- Notas recientes: últimas 3-5 notas en cards
- Banner de límite diario para usuarios free
- Nudge de tareas pendientes

#### GRABACIÓN (estado inmersivo)

- Takeover de la pantalla completa
- Waveform animada reflejando niveles de audio
- Timer con formato MM:SS
- Controles: pausa/reanuda, detener
- Aviso visual al 80% del tiempo máximo (barra amarilla → roja)
- Máximo: 10 min (free) / 30 min (premium)

#### PROCESAMIENTO (LoadingProcessor)

- 4 fases animadas: Subiendo → Transcribiendo → Analizando → Listo
- Barra de progreso por fases
- Animación de ripple + rotación en fase activa
- Sparkles al completar
- Hint de timeout a los 2 min
- Tiempo transcurrido visible

#### DETALLE DE NOTA (`note/[id].tsx`)

- Header: título + badges (template, speakers, duración)
- AudioPlayer: reproductor con waveform, speed control (1x/1.5x/2x)
- ModeSelector: chips horizontales para cambiar entre modos generados
- ModeResultView: vista específica según el modo:
  - **Resumen**: summary + puntos clave + temas
  - **Tareas**: agrupadas por prioridad, con check/edit/delete, persistencia en AsyncStorage
  - **Plan de acción**: objetivo + pasos ordenados + obstáculos + criterio de éxito
  - **Texto limpio**: texto formateado con botón copiar
  - **Reporte ejecutivo**: resumen + tabla de decisiones + acuerdos + pendientes
  - **Mensaje listo**: 4 tabs de tono (profesional/amable/firme/breve) con copiar
  - **Estudio**: flashcards + preguntas con respuestas expandibles
  - **Ideas**: idea central + oportunidades con badge de potencial + puntos interesantes
- SpeakerTranscript: burbujas estilo chat, alternando izquierda/derecha por hablante
- ExportButton: FAB flotante con opciones PDF/Excel/Copy/Share

#### HISTORIAL (`(tabs)/history.tsx`)

- Barra de búsqueda
- Filtros de categoría: chips horizontales (todos, reuniones, tareas, ideas, estudio, conversaciones)
- Filtros de tiempo: hoy, semana, mes, siempre
- Lista de NoteCards con:
  - Waveform miniatura
  - Título, fecha, badges de metadatos
  - Status dot (color-coded)
  - Swipe-left para borrar con confirmación
- Pull-to-refresh
- Empty state con CTA

#### PERFIL (`(tabs)/profile.tsx`)

- Avatar + email + badge de plan
- Grid de stats 2x2: notas totales, tiempo grabado, tareas, conversaciones, notas del mes
- Barra de uso diario (solo free)
- Card de premium upsell con beneficios
- Switcher de tema: Light / Dark / System
- Links legales (privacidad, términos)
- Exportar datos (JSON)
- Cerrar sesión + Eliminar cuenta (con modal de confirmación)

#### ONBOARDING

- Carousel de 3 slides con animaciones SVG-like:
  1. Micrófono con anillos de pulso → "Habla naturalmente"
  2. Barras animadas → "IA transforma tu voz"
  3. Nodos conectados → "Resultados accionables"
- Dots indicadores + botón Next/Skip

#### LOGIN / REGISTRO

- Inputs de email + password con validación
- Animación de shake en error
- Floating orbs decorativos
- Link a recuperar contraseña
- Link entre login ↔ registro

### 11.4 Componentes de diseño recurrentes

| Componente          | Uso                                           |
| ------------------- | --------------------------------------------- |
| `GlassCard`         | Contenedor principal con blur                 |
| `AnimatedPressable` | Botón con spring scale + haptics              |
| `FloatingOrb`       | Decoración animada en backgrounds             |
| `Skeleton`          | Loading states con shimmer                    |
| `Toast`             | Notificaciones flotantes (success/error/info) |
| `FilterBar`         | Chips horizontales scrollables                |
| `NoteCard`          | Card de nota con swipe                        |

### 11.5 Tab Bar Custom

- 3 tabs: Home (mic), Historial (time), Perfil (person)
- Pill-shaped background animada que sigue al tab activo
- Labels con fade in/out
- BlurView en iOS, color sólido en Android
- Spring animations para la transición

---

## 12. SISTEMA DE AUTENTICACIÓN

### 12.1 Flujo

```
App Launch → _layout.tsx
    │
    ├── Sin sesión → (auth)/onboarding (si primera vez) → login/register
    │
    └── Con sesión → (tabs)/index (Home)
```

### 12.2 Implementación

- **Provider:** Supabase Auth (email + password)
- **Guard:** En `_layout.tsx`, redirige según `session` y `hasOnboarded` (AsyncStorage)
- **Perfil auto-creado:** Trigger `on_auth_user_created` crea row en `profiles`
- **Listener:** `authStore` escucha `onAuthStateChange` de Supabase
- **Eliminación de cuenta:** RPC `delete_user()` borra todo (SECURITY DEFINER)

---

## 13. SISTEMA DE AUDIO

### 13.1 Grabación (`AudioRecorder.tsx` + `recordingStore.ts`)

- **Formato:** `.m4a` (AAC), 128kbps, 44.1kHz
- **Metering:** Niveles de audio cada ~100ms, últimas 50 muestras para waveform
- **Límites:** 10 min (free) / 30 min (premium)
- **Estados:** idle → recording → paused → stopped
- **Aviso:** visual a 80% del tiempo máximo

### 13.2 Upload (`lib/audio.ts`)

```typescript
processRecording(uri, userId, template, mode) →
  1. Leer archivo como blob
  2. Upload a Supabase Storage: audio-files/{userId}/{uuid}.m4a
  3. INSERT nota en DB con status 'uploading'
  4. Invocar edge function process-audio
  5. Retornar note.id
```

### 13.3 Reproducción (`AudioPlayer.tsx`)

- expo-av Sound object
- Waveform determinista generada desde hash del URI
- Speed control: 1x, 1.5x, 2x
- Progress bar + tiempo actual/total

---

## 14. SISTEMA DE EXPORTACIÓN

### 14.1 PDF (`lib/export.ts`)

- Genera HTML completo con estilos inline
- Incluye: título, fecha, template, modo, resumen, puntos clave, tareas, texto limpio
- Usa `expo-print` para convertir HTML → PDF
- Se comparte via `expo-sharing`

### 14.2 Excel (`lib/export-excel.ts`)

- Genera workbook con `xlsx` library
- Formato específico por modo (ej: tareas → columnas de prioridad/responsable/deadline)
- Se guarda en FileSystem y se comparte

### 14.3 Clipboard + Share

- Copia texto plano al clipboard
- Share sheet nativo del sistema

---

## 15. ANALYTICS

- Provider-agnostic: actualmente logea a console (dev) y guarda en `analytics_events` (Supabase)
- Eventos trackeados: `recording_started`, `note_created`, `mode_converted`, `export_pdf`, `export_excel`, `paywall_shown`, `subscription_purchased`, etc.
- Batching cada 10 eventos o 30s
- Preparado para integrar Mixpanel/Amplitude

---

## 16. DETECCIÓN DE HABLANTES

### 16.1 Flujo

1. Groq Whisper genera segmentos con timestamps
2. Si hay segmentos → se envían a Claude Haiku con `buildSpeakerDetectionPrompt()`
3. Claude analiza cambios de perspectiva, turnos, marcadores conversacionales
4. Retorna: `speakers_detected`, `is_conversation`, `segments[]` con speaker labels
5. Se asignan colores automáticos de `SPEAKER_COLORS`
6. El usuario puede renombrar hablantes via `SpeakerRenameModal`

### 16.2 Colores de hablantes

```
Hablante 1: Azul (#2B7CB5)
Hablante 2: Verde (#1A7F4B)
Hablante 3: Ámbar (#B8600A)
Hablante 4: Gris (#5A5F68)
Hablante 5: Cielo (#4A90B8)
```

---

## 17. MANEJO DE ERRORES Y RETRY

- **Error boundary:** `ErrorBoundary.tsx` captura crashes de React con botón de reset
- **Retry en procesamiento:** hasta 2 reintentos automáticos (campo `retry_count` en notes)
- **Toast system:** notificaciones de error con 5s de display (3s para success/info)
- **Edge function errors:** se guardan en `notes.error_message`, status → `error`
- **Timeout:** hint al usuario después de 2 min de procesamiento

---

## 18. SEGURIDAD

| Capa                 | Mecanismo                                                           |
| -------------------- | ------------------------------------------------------------------- |
| **Auth**             | Supabase Auth con JWT                                               |
| **DB**               | Row Level Security en todas las tablas                              |
| **Storage**          | Políticas por carpeta de usuario                                    |
| **API**              | JWT verificado en cada edge function                                |
| **Rate limiting**    | IP-based (10/min) en edge functions                                 |
| **Plan enforcement** | Dual: cliente (gates.ts) + servidor (edge function)                 |
| **Eliminación**      | SECURITY DEFINER function borra todo incluyendo auth.users          |
| **Encryption**       | `ITSAppUsesNonExemptEncryption: false` (no usa encriptación propia) |

---

## 19. VARIABLES DE ENTORNO

```
EXPO_PUBLIC_SUPABASE_URL=          # URL del proyecto Supabase
EXPO_PUBLIC_SUPABASE_ANON_KEY=     # Anon key (client-safe)
EXPO_PUBLIC_REVENUECAT_IOS_KEY=    # RevenueCat iOS API key
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY= # RevenueCat Android API key

# En edge functions (Supabase secrets):
GROQ_API_KEY=                       # Groq API para Whisper
ANTHROPIC_API_KEY=                  # Anthropic API para Claude
SUPABASE_URL=                       # URL interna
SUPABASE_SERVICE_ROLE_KEY=          # Service role (admin)
SUPABASE_ANON_KEY=                  # Anon key
```

---

## 20. BUILD & DEPLOY

- **Build system:** EAS Build (Expo Application Services)
- **Profiles:** `development`, `preview`, `production`
- **iOS:** Bundle ID `com.sythio.app`, Build number 1
- **Android:** Package `com.sythio.app`, edge-to-edge enabled
- **New Architecture:** Habilitada (`newArchEnabled: true`)
- **React Compiler:** Habilitado (`reactCompiler: true`)
- **Typed Routes:** Habilitado (`typedRoutes: true`)

---

## 21. DEPENDENCIAS CLAVE

| Dependencia                          | Propósito                         |
| ------------------------------------ | --------------------------------- |
| `expo` ~54                           | Framework base                    |
| `expo-router` ~6                     | Navegación file-based             |
| `expo-av`                            | Grabación y reproducción de audio |
| `react-native-reanimated` ~4.1       | Animaciones de alto rendimiento   |
| `react-native-gesture-handler` ~2.28 | Gestos (swipe, press)             |
| `@supabase/supabase-js`              | Cliente de Supabase               |
| `zustand` ~5                         | Estado global                     |
| `react-native-purchases` ~9.14       | RevenueCat subscriptions          |
| `expo-blur`                          | Glassmorphism effects             |
| `xlsx`                               | Generación de archivos Excel      |
| `expo-print`                         | Generación de PDFs                |
| `expo-sharing`                       | Share sheet nativo                |
| `expo-haptics`                       | Feedback háptico                  |
| `expo-notifications`                 | Push notifications                |
| `expo-file-system`                   | Acceso a filesystem               |

---

## 22. RESUMEN PARA OTRA IA

**Si eres una IA que va a trabajar en este proyecto, esto es lo que necesitas saber:**

1. **Es una app Expo SDK 54 con TypeScript**, navegación file-based con expo-router, y estado global con Zustand.

2. **El core es: grabar audio → transcribir (Groq/Whisper) → procesar con IA (Claude Haiku) → mostrar resultados estructurados.** Todo el procesamiento pesado ocurre en edge functions de Supabase (Deno), no en el cliente.

3. **Hay 8 modos de salida**, cada uno con su propio prompt y estructura JSON. 4 son free, 4 son premium. Los prompts están en `lib/prompts.ts`.

4. **Hay 9 templates** que pre-configuran el modo default y agregan contexto al prompt de IA.

5. **El modelo de negocio es freemium:** 2 notas/día gratis, modos limitados, sin exportación avanzada. Premium desbloquea todo vía RevenueCat.

6. **Las gates se enforcean en DOS lugares:** cliente (`lib/gates.ts`) y servidor (edge functions). Ambos deben estar sincronizados.

7. **La UI está 100% en español**, usa glassmorphism, spring animations (reanimated), haptics, y soporta light/dark mode.

8. **La DB tiene 4 tablas** con RLS completo. Las notas tienen un ciclo de vida: recording → uploading → transcribing → processing → done/error.

9. **Los archivos más complejos son:** `ModeResultView.tsx` (1590 líneas, renderiza 8 modos diferentes), `process-audio/index.ts` (edge function principal), y `(tabs)/index.tsx` (home screen con muchos estados).

10. **Convenciones:** colores en `lib/constants.ts`, animaciones en `lib/animations.ts`, tipos en `types/index.ts`. Todo componente usa `useThemeColors()` para temas.
