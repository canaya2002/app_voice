# 🔍 Auditoría — Límites, Precios y Costos por Tier

**Fecha:** 2026-04-28
**Audiencia:** Carlos (founder/dev)
**Propósito:** Saber exactamente qué puede hacer cada tier, cuánto cuesta servir a cada usuario, y cuál es el margen real

---

## 🚨 Hallazgos críticos antes que nada

### 1. **BUG: Enterprise no tiene límite definido en código**

`supabase/functions/process-audio/index.ts:19`:
```js
const DAILY_LIMITS = { free: 2, premium: 50 };  // ← falta "enterprise"
```

Línea 216:
```js
const dailyMax = DAILY_LIMITS[plan] ?? DAILY_LIMITS.free;
```

**Si un usuario Enterprise procesa una nota, cae al fallback `free` = 2 notas/día.** Mismo bug en `convert-mode/index.ts:18`. Hay que arreglarlo antes de cobrar Enterprise.

### 2. **Inconsistencia entre `lib/pricing.ts` y la realidad del código**

| Tier | `lib/pricing.ts` dice | Código realmente enforza |
|---|---|---|
| Free | 2 notas/día, 10min/nota | ✅ 2/día, 10min |
| Premium | **Infinity** notas/día | ❌ **50 notas/día** + **120 min/día** |
| Enterprise | **Infinity** notas/día | ❌ **2/día** (bug) |

El cliente promete "ilimitado" pero el servidor enforza límites. **Esto es engaño legal en pricing** — si un Premium quiere meter su nota #51 del día, le va a fallar con "límite alcanzado". Hay que decidir: o subir el cap server-side o ajustar el copy del paywall.

### 3. **No hay tier "Pro+" actualmente**

Mencionas "Pro y Pro+" pero el código solo tiene 3 tiers: **free, premium, enterprise**. Si quieres un "Pro+" intermedio, hay que diseñarlo y agregarlo. Por ahora doy el análisis de los 3 que existen.

---

## 📊 Tabla maestra — Límites por tier (estado actual)

| Concepto | **Free** | **Premium** ($14.99/mes) | **Enterprise** ($29.99/mes) |
|---|---|---|---|
| **Precio mensual** | Gratis | $14.99 | $29.99 |
| **Precio anual** | Gratis | $149.99 (2 meses gratis) | $299.99 |
| **Notas/día** | **2** | **50** ⚠️ (UI dice ∞) | **2** ⚠️ (bug — debería ser ∞) |
| **Duración máx por nota** | 10 min | 30 min | 60 min |
| **Audio total/día** | ~20 min (2×10min) | **120 min** hard cap | sin cap explícito (cae a free) |
| **Tamaño máx por archivo** | 25 MB | 25 MB | 25 MB |
| **Modos disponibles** | **5/9** (summary, tasks, clean_text, ideas, outline) | **9/9** (todos) | **9/9** |
| **Reconversiones/día** (cambiar modo) | **10** | **50** ⚠️ | **10** ⚠️ (mismo bug) |
| **Chat con IA** | ❌ | ✅ sin límite explícito | ✅ |
| **Export PDF** | ✅ | ✅ | ✅ |
| **Export Excel** | ❌ | ✅ | ✅ |
| **Compartir notas (link público)** | ❌ | ✅ | ✅ |
| **API pública** | ❌ | ✅ | ✅ |
| **Workspaces (equipos)** | ❌ | ❌ | ✅ |
| **MCP integration** | ❌ | ❌ | ✅ |
| **Priority support** | ❌ | ❌ | ✅ |
| **IP rate limit** | 20 req/hora | 20 req/hora | 20 req/hora |

---

## 💰 Costo unitario — qué pagamos por cada operación

Stack:
- **Whisper transcription**: Groq `whisper-large-v3-turbo` → **$0.04/hora** ≈ $0.000667/min
- **Claude para todo lo demás**: Anthropic `claude-haiku-4-5-20251001` → **$1.00/M input tokens** + **$5.00/M output tokens**
- **Storage**: Supabase Storage → $0.021/GB/mes + $0.09/GB egress
- **Edge Function compute**: Supabase incluido en Pro plan ($25/mes flat)

### Costo por operación

| Operación | Whisper | Claude input | Claude output | **Total** |
|---|---|---|---|---|
| **Procesar nota 5 min** (típico) | $0.0033 | ~1.5K tokens × $1/M = $0.0015 | ~1.7K tokens × $5/M = $0.0085 | **~$0.013** |
| **Procesar nota 10 min** (free max) | $0.0067 | ~2.5K tokens = $0.0025 | ~1.7K tokens = $0.0085 | **~$0.018** |
| **Procesar nota 30 min** (premium max) | $0.020 | ~5K tokens = $0.005 | ~1.7K tokens = $0.0085 | **~$0.034** |
| **Procesar nota 60 min** (enterprise max) | $0.040 | ~5K tokens (truncado a 15K chars) = $0.005 | ~1.7K tokens = $0.0085 | **~$0.054** |
| **Reconvertir a otro modo** | — | ~3K tokens = $0.003 | ~1.3K tokens = $0.0065 | **~$0.010** |
| **Pregunta a chat-notes** | — | ~3K tokens = $0.003 | ~600 tokens = $0.003 | **~$0.006** |

⚠️ Cada nota dispara **2 llamadas a Claude**: una para speaker detection (~600 tokens out) + una para el modo primario. Los costos arriba ya lo consideran.

### Storage por minuto de audio
- ~1 MB/min en formato m4a comprimido
- 1 GB ≈ 1000 minutos de audio guardado

---

## 📈 Modelo de costos por usuario y tier

### 🆓 FREE — máximo abuso posible

Si un free user usa **TODO** lo que puede cada día:
- 2 notas/día × 10 min cada una = **20 min audio/día**
- 10 reconversiones/día (no veo paywall en convert-mode para free... wait, sí — pero solo modos free)
- Sin chat AI (gated)

**Cálculo diario worst-case:**
- 2 notas × $0.018 = $0.036
- 10 reconversiones × $0.010 = $0.10 (asumiendo que las usa)
- Storage: 20 MB nuevos/día
- **Costo diario: ~$0.14**
- **Costo mensual: ~$4.20**

**Realidad típica:** Los free users no usan al máximo. Un free típico graba quizá 3-4 notas a la SEMANA y casi nunca reconvierte. Costo real: **~$0.30-0.50/mes**.

⚠️ **Vector de abuso**: 10 reconversiones diarias × 30 días = 300 reconversiones gratis/mes que cuestan $3 a Sythio. Si un user crea cuenta solo para usar reconversiones gratis, te sangra. **Recomendación:** bajar a 3 reconversiones/día para free.

### 💎 PREMIUM — usuario al límite

Worst case (usa los 120 min de audio + las 50 notas + 50 reconversiones):
- Audio: 120 min × $0.000667 = $0.08
- Asumiendo 24 notas de 5 min = 24 × $0.013 = $0.312
- 50 reconversiones × $0.010 = **$0.50**
- 30 chats × $0.006 = $0.18
- **Costo diario: ~$1.07**
- **Costo mensual: ~$32**
- **Pierdes $17/mes con un power user que llegue al cap**

**Realidad típica:** un premium activo que graba diario:
- 3 notas/día × 7 min = 21 min/día
- 5 reconversiones/día
- 5 chats/día
- Diario: $0.04 + $0.05 + $0.03 = $0.12
- **Mensual: ~$3.60**
- **Margen real: $14.99 - $3.60 = $11.39 (76% margen)** ✅

**Realidad churn-aware** (usuario casual que paga premium pero usa poco):
- 2 notas/semana × 5 min = ~$0.10/mes
- **Margen: $14.89 (99%)** 🤑

### 🏢 ENTERPRISE — actualmente roto, pero supongamos arreglado

Sin caps explícitos (asumiendo fix del bug):
- Si un user enterprise quema 5 horas de audio/día = 300 min × $0.000667 = $0.20 whisper
- 60 notas/día × ~$0.025 promedio = $1.50
- 100 reconversiones/día × $0.010 = $1.00
- 50 chats × $0.006 = $0.30
- **Costo diario: ~$3.00**
- **Costo mensual: ~$90**
- **Pierdes $60/mes con un abusador enterprise**

⚠️ Sin un cap server-side, **un solo usuario malicioso enterprise puede costarte $90+/mes mientras paga $30**.

**Recomendación:** poner cap explícito enterprise en código:
- 200 notas/día (vs Premium 50)
- 480 min audio/día (vs Premium 120) = 8 horas
- 200 reconversiones/día
- 100 chats/día

---

## 🎯 Resumen ejecutivo de margen

| Tier | Precio | Costo típico | Costo worst case | Margen típico | Riesgo abuso |
|---|---|---|---|---|---|
| Free | $0 | $0.50/mes | $4.20/mes | -$0.50 ❌ | Bajo (caps strict) |
| Premium | $14.99 | $3.60/mes | $32/mes | **76%** ✅ | **Alto** si llegan al 120min cap |
| Enterprise | $29.99 | $5/mes | **$90+/mes** | 83% / -$60 | **Crítico** (sin cap arreglado) |

**Para que un free pague por sí solo:** un free typical user te cuesta $0.50, vs el costo de adquisición. No es preocupante a escala chica, pero a 10K free users = $5K/mes en infra "regalada".

**Punto de equilibrio Premium:** necesitas que solo el ~5% de tus usuarios free se conviertan a premium para empezar a tener buen margen blended.

---

## 🔧 Recomendaciones accionables

### CRÍTICO antes de lanzar
1. **Arreglar el bug enterprise** en `DAILY_LIMITS` y `DAILY_CONVERT_LIMITS`. Añadir entradas `enterprise` con valores explícitos:
   ```js
   const DAILY_LIMITS = { free: 2, premium: 50, enterprise: 200 };
   ```
2. **Sincronizar `lib/pricing.ts` con la realidad del código** o subir el cap server-side. Si dejas "ilimitado" en UI pero capeas en server, te llegan reportes de bugs y reviews negativos en App Store.
3. **Añadir cap explícito de chat-notes**. Hoy no hay límite — un premium podría hacer 10K preguntas/día (= $60/día).

### IMPORTANTE pre-launch
4. **Bajar reconversiones free a 3/día** (no 10) — vector de abuso obvio.
5. **Monitorear costo Anthropic** — set alerts en console.anthropic.com para que te avise si pasa de $X/día.
6. **Telemetría de uso por usuario** — saber quién está cerca de los caps para anticiparte (podrías querer banear o convertir).

### NICE TO HAVE
7. **Considerar un tier "Pro+" intermedio** entre Premium ($14.99) y Enterprise ($29.99). Algo como **"Pro Plus" $19.99** con:
   - 100 notas/día (vs Premium 50)
   - 240 min audio/día (vs 120)
   - 100 reconversiones (vs 50)
   - Chat ilimitado
   - Sin features enterprise (workspaces, MCP)
   
   Esto captura a power-users de premium que se sienten limitados pero no necesitan workspaces.

8. **Cobrar overages** — si un premium quiere pasar los 120 min/día, ofrecer "+30 min por $0.99". Estilo OpenAI.

9. **Anual con descuento más agresivo** — actualmente 2 meses gratis (16% off). Mover a 25% off ($134.99/año) ayuda con churn.

---

## 📋 Lo que NO está implementado pero el copy promete

Cosas mencionadas en `lib/pricing.ts` o paywall que **el código no enforza ni implementa**:
- "9 modos" para premium → ✅ implementado
- "Workspaces" para enterprise → ✅ tablas existen, UI parcial
- "MCP integration" enterprise → ❌ no implementado, solo flag boolean
- "Priority support" → ❌ no hay sistema de tickets
- "API ilimitada" enterprise → ⚠️ existe `public-api` pero sin rate limit explícito por tier

Si vas a vender enterprise, **MCP y workspaces tienen que estar funcionales** (workspaces parcial es OK si Settings → Crear workspace funciona).

---

## 🧮 Calculadora rápida — escenarios

**100 free users + 5 premium + 1 enterprise:**
- Costo: 100 × $0.50 + 5 × $3.60 + 1 × $5 = $50 + $18 + $5 = **$73/mes**
- Revenue: 5 × $14.99 + 1 × $29.99 = $74.95 + $29.99 = **$104.94/mes**
- Profit: **$31.94/mes** (ajustado solo costo variable)
- ⚠️ Falta sumar costos fijos: Supabase Pro $25 + Anthropic mínimo + dominios + Vercel free

**1000 free users + 50 premium + 5 enterprise** (escenario realista 6 meses post-launch):
- Costo variable: 1000 × $0.50 + 50 × $3.60 + 5 × $5 = $500 + $180 + $25 = **$705/mes**
- Revenue: 50 × $14.99 + 5 × $29.99 = $749.50 + $149.95 = **$899.45/mes**
- Profit antes de fijos: **~$194/mes** (margen 22%)

A esa escala los costos fijos (Supabase, Vercel Pro, etc.) son <$100, así que **profit real ~$95/mes**. Apenas rentable. Necesitas más conversión free→premium o subir precios.

---

## 📁 Archivos relacionados (source of truth)

| Archivo | Qué define |
|---|---|
| `lib/pricing.ts` | Tiers, precios, features (cliente) |
| `supabase/functions/_shared/pricing.ts` | Mismo, lado server (incompleto vs cliente) |
| `supabase/functions/process-audio/index.ts:19` | `DAILY_LIMITS` real |
| `supabase/functions/convert-mode/index.ts:18` | `DAILY_CONVERT_LIMITS` real |
| `supabase/functions/chat-notes/index.ts` | Sin cap (riesgo) |

---

*Audit realizado revisando los 12 edge functions, el schema SQL, y los archivos de pricing. Los costos asumen pricing público de Anthropic/Groq a inicios 2026 y pueden cambiar. Re-correr este análisis cada 6 meses.*
