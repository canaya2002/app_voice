# App Store Connect — Metadata para Sythio 1.0.0

**Idioma primario:** Español (México) — `es-MX`
**Bundle ID:** `com.sythio.app`
**Categoría:** Productivity
**Secondary Category:** (vacío — solo elegir si Apple lo requiere; Business funciona)
**Age Rating:** 4+

> Todo el copy abajo respeta el Master Alignment Brief: vende **transformación** (claridad, estructura, acción), no transcripción ni tecnología. Sin tech-jargon, premium-minimal.

---

## 1. Información básica

| Campo | Valor | Caracteres |
|---|---|---|
| **App Name** | `Sythio` | 6 / 30 |
| **Subtitle** | `Voz a resultados con IA` | 24 / 30 |
| **Bundle ID** | `com.sythio.app` | — |
| **SKU** | `sythio-001` | — |
| **Primary Language** | Spanish (Mexico) | — |

**Alternativas de subtitle** (si el actual no convence o quieres A/B test):
- `Convierte tu voz en acción` (28)
- `Habla, obtén claridad` (21)
- `Tu voz, estructurada con IA` (28)

---

## 2. Promotional Text (170 caracteres)

> Aparece arriba de la descripción. Editable sin nueva review. Úsalo para anuncios temporales (lanzamientos, ofertas).

**Versión 1.0.0:**
```
Habla, y Sythio convierte tu voz en resúmenes, tareas y reportes listos para compartir. Sin teclear, sin reescribir.
```
*(157 chars)*

---

## 3. Description (4000 caracteres max)

> Soporta saltos de línea pero NO markdown. Apple recomienda primer párrafo súper-claro porque solo se ve la primera línea hasta que el usuario expande.

```
Habla, y Sythio convierte tu voz en algo útil.

No es una app de notas de voz. No es transcripción. Es la forma más rápida de pasar de lo que piensas a lo que necesitas: un resumen claro, una lista de tareas, un reporte ejecutivo, un mensaje listo para enviar.

GRABA UNA VEZ, OBTÉN LO QUE NECESITES

• Resumen — lo importante en segundos
• Tareas — extraídas con prioridad y responsable
• Plan de acción — pasos concretos para ejecutar
• Texto limpio — sin muletillas, listo para compartir
• Reporte ejecutivo — con decisiones, acuerdos y próximos pasos
• Mensaje listo — en tono profesional, amigable o directo
• Material de estudio — conceptos clave y preguntas de repaso
• Exploración de ideas — oportunidades y siguientes pasos

Cambia entre formatos en un toque. Sin volver a grabar.

PARA TUS REUNIONES, IDEAS, CLASES Y CONVERSACIONES

Sythio detecta automáticamente quién habla en una reunión y atribuye cada idea. Renombra a los participantes con un toque. Marca los momentos importantes mientras grabas.

Plantillas para cada situación:
• Reunión, Cliente, Tareas
• Idea rápida, Brainstorming
• Clase, Diario, Reflexión, Seguimiento

EXPORTA CON UN TOQUE

PDF profesional, Word editable, Excel con tareas estructuradas, link público para compartir o copia el texto al portapapeles.

PRIVACIDAD COMO PRIORIDAD

Tu audio se procesa de forma segura y se elimina automáticamente. Tú controlas qué exportas y qué compartes. Sin anuncios, sin venta de datos, nunca.

PLANES

• Gratis: 2 notas al día, modos esenciales
• Premium: notas ilimitadas, todos los modos, exportación completa
• Pro+: para profesionales que necesitan más volumen y velocidad

Inicia gratis. Cancela cuando quieras.

—

Sigue a Sythio: sythio.app
Soporte: hola@sythio.app
```

*(~2400 chars — deja margen para añadir cosas sin pasar el límite)*

---

## 4. Keywords (100 caracteres, separados por coma SIN espacios después de coma)

> NO repitas palabras del nombre o subtitle (Apple ya las indexa). Prioriza búsquedas reales.

**Versión 1.0.0:**
```
notas,voz,reunion,tareas,resumen,IA,productividad,grabar,audio,transcribir,minutas,reportes
```
*(95 chars)*

**Por qué estos:**
- `notas`, `voz`, `audio`: búsqueda genérica
- `reunion`, `minutas`: el caso de uso #1 en B2B
- `tareas`, `resumen`, `reportes`: outputs principales (lo que vendemos)
- `IA`: búsqueda en alza en todos los stores
- `productividad`: categoría aspiracional
- `grabar`, `transcribir`: acciones que el usuario teclea

**NO uses:** sythio (auto-indexado), app, mejor, mejor app (filler), AI (acentúa duplicado con IA), apple, ios.

---

## 5. URLs

| Campo | URL |
|---|---|
| **Privacy Policy URL** | `https://sythio.app/privacy-policy` |
| **Support URL** | `https://sythio.app` |
| **Marketing URL** | `https://sythio.app` *(opcional, mismo)* |
| **Copyright** | `© 2026 Carlos Anaya Ruiz` |

---

## 6. Privacy Nutrition Label (App Privacy)

> Pestaña "App Privacy" en ASC. Apple es estricto — declara TODO lo que recolectas o serás rechazado. Cada categoría tiene "Used to Track You" (solo si haces tracking cross-app, NO marques) y "Linked to User" (sí, todo está atado a `auth.users.id`).

### Q: ¿Recolectas data?
**Sí**

### Categorías a declarar (selecciona en este orden):

#### 6.1 Contact Info
- ✅ **Email Address**
  - Used for: **App Functionality** (login)
  - Linked to user: **Yes**
  - Used for tracking: **No**

- ✅ **Name**
  - Used for: **App Functionality** (display name)
  - Linked to user: **Yes**
  - Tracking: **No**

#### 6.2 User Content
- ✅ **Audio Data**
  - Used for: **App Functionality** (procesar a outputs)
  - Linked to user: **Yes**
  - Tracking: **No**

- ✅ **Other User Content** (transcripts, summaries, tasks, etc.)
  - Used for: **App Functionality**
  - Linked to user: **Yes**
  - Tracking: **No**

- ✅ **Photos** *(solo si activan profile pic)*
  - Used for: **App Functionality**
  - Linked to user: **Yes**
  - Tracking: **No**

#### 6.3 Identifiers
- ✅ **User ID**
  - Used for: **App Functionality, Analytics**
  - Linked to user: **Yes**
  - Tracking: **No**

#### 6.4 Usage Data
- ✅ **Product Interaction**
  - Used for: **Analytics, App Functionality**
  - Linked to user: **Yes**
  - Tracking: **No**

#### 6.5 Diagnostics
- ✅ **Crash Data**
  - Used for: **App Functionality**
  - Linked to user: **No**
  - Tracking: **No**

- ✅ **Performance Data**
  - Used for: **App Functionality**
  - Linked to user: **No**
  - Tracking: **No**

### Categorías a declarar como **NO recolectas** (por si Apple pregunta):
- ❌ Health & Fitness
- ❌ Financial Info (Stripe procesa pagos en su lado, no almacenamos números de tarjeta)
- ❌ Location
- ❌ Sensitive Info
- ❌ Contacts
- ❌ Browsing History
- ❌ Search History
- ❌ Other Data Types

### Tracking
- ❌ **No usamos tracking cross-app/site**

---

## 7. App Review Information

> Estos campos solo los ve el reviewer de Apple, no el usuario.

| Campo | Valor |
|---|---|
| **Sign-in required** | ✅ Sí |
| **Demo Account Username** | (crea uno: `apple-review@sythio.app` con plan premium) |
| **Demo Account Password** | (cualquier segura — anótala en 1Password) |
| **Notes** (campo libre) | Ver bloque abajo ↓ |
| **Contact First/Last** | Carlos / Anaya Ruiz |
| **Contact Email** | canaya917@gmail.com |
| **Contact Phone** | (tu número con +52) |

### Notes (campo libre — ayuda al reviewer)

```
Sythio es una app de productividad que transforma audio (reuniones, ideas, clases) en outputs estructurados con IA: resúmenes, tareas, reportes ejecutivos.

Cómo probar:
1. Inicia sesión con la cuenta demo provista
2. En Home, toca el botón de micrófono → graba 30 segundos hablando sobre cualquier tema (ej: una reunión ficticia)
3. Espera 30-60s al procesamiento (Whisper + Claude)
4. Revisa el resultado en cualquier modo (Resumen, Tareas, Reporte Ejecutivo, etc.)
5. Cambia entre modos sin volver a grabar
6. Exporta a PDF/Excel/link compartible

La cuenta demo tiene plan Premium activo (vía Stripe sandbox) — no requiere comprar nada para probar todos los modos.

In-app purchases: 4 productos auto-renew (Premium mensual/anual, Pro+ mensual/anual). Implementados con StoreKit 2 vía RevenueCat.

Sign in with Apple está implementado y funciona como método de auth principal en iOS.

Contacto técnico: canaya917@gmail.com
```

---

## 8. What's New (Release Notes — versión 1.0.0)

> Solo aplica desde 1.0.1 en adelante. Para 1.0.0 Apple lo deja vacío automáticamente. Pero te lo dejo listo para 1.0.1.

**Plantilla 1.0.1 (cuando saques tu primer update):**
```
¡Hola! Esta es nuestra primera actualización. Mejoramos:

• Velocidad de procesamiento
• Estabilidad en notas largas
• Pequeñas correcciones de UI

Gracias por usar Sythio. Si tienes feedback, escríbenos a hola@sythio.app
```

---

## 9. Version Information

| Campo | Valor |
|---|---|
| **Version** | `1.0.0` |
| **Build** | (lo asigna EAS, normalmente `1` para primer submit) |
| **Copyright** | `© 2026 Carlos Anaya Ruiz` |
| **Trade Representative Contact Info** | (opcional — solo si publicas en Korea) |

---

# 📲 TestFlight — "What to test"

> Lo que ven los testers internos (tu equipo) cuando reciben el invite. Brief, directo.

```
Sythio convierte audio en resúmenes, tareas y reportes con IA. Esta build es para validar:

✅ Flujo principal (graba 30s → ve el resultado)
✅ Cambio entre modos (Resumen, Tareas, Reporte ejecutivo, etc.)
✅ Exportación: PDF, Excel, link público
✅ Compras Sandbox (Premium $14.99 / Pro+ $29.99)
✅ Login con Apple, 2FA, recuperación de contraseña

⚠️ Si encuentras un bug: hola@sythio.app con captura.

Cuenta sandbox para compras:
[Email del Sandbox Tester]
[Password]

Importante: cierra sesión de tu Apple ID en Settings → App Store antes de probar las compras (si no, te cobra de verdad).
```

---

# 📷 Guía de Capturas (5 screenshots — iPhone 6.7", 1290×2796 px)

> Usa el simulador iPhone 16 Pro Max (o tu iPhone real si es uno reciente). Captura con `Cmd+S` en simulador. Apple acepta hasta 10 capturas pero 5 es óptimo.

> **Estilo general:** Mock data limpio (no datos reales tuyos). Mantén el theme claro (background blanco). Si añades texto overlay (no obligatorio pero convierte mejor), usa Inter Bold #0B0B0B sobre fondo blanco con padding generoso.

---

### Captura 1 — Hero / Recording state
**Pantalla:** Home con botón de mic activo (recording)
**Texto overlay sugerido:**
> **Habla.**
> Sythio escucha y aprende.

**Cómo capturarla:**
1. Login con cuenta demo
2. Toca el mic una vez (estado "recording" con anillos pulsando)
3. Antes de los 30s captura

**Clave:** muestra el botón con su animación detenida (orbital ring + mic blanco). El usuario debe entender en 1s que graba con voz.

---

### Captura 2 — Procesando / Transformación
**Pantalla:** LoadingProcessor (las 4 fases con check marks)
**Texto overlay:**
> **Lo convierte.**
> En segundos, no minutos.

**Cómo capturarla:**
1. Termina una grabación
2. Captura cuando estés en la fase 2 o 3 (con un check verde y otro spinning)

**Clave:** transmite que la magia ocurre rápido y sin que el usuario teclee nada.

---

### Captura 3 — Resultado: Reporte Ejecutivo
**Pantalla:** ModeResultView con `executive_report` mode generado
**Texto overlay:**
> **Reporte ejecutivo.**
> Listo para enviar.

**Cómo capturarla:**
1. Procesa una nota tipo "reunión" (~1 min hablando sobre acuerdos, decisiones, próximos pasos)
2. Toca el modo "Reporte Ejecutivo"
3. Scroll hasta donde se vean: contexto + 2-3 decisiones + próximos pasos
4. Captura

**Clave:** muestra densidad — el usuario ve VALOR estructurado, no transcripción. Decisiones, acuerdos, action items.

---

### Captura 4 — Selector de modos
**Pantalla:** ModeSelector horizontal con 3-4 modos visibles + bottom sheet de "más modos"
**Texto overlay:**
> **8 formatos.**
> Una sola grabación.

**Cómo capturarla:**
1. En una nota ya procesada, abre el selector de modos
2. Asegúrate que se vean al menos 3 modos generados (con check verde) y 1-2 disponibles (con +)
3. Captura

**Clave:** muestra que NO tiene que volver a grabar para cambiar el output. Vende reutilización.

---

### Captura 5 — Compartir / Exportar
**Pantalla:** ExportButton modal abierto con todas las opciones
**Texto overlay:**
> **Exporta donde quieras.**
> PDF, Word, Excel, link.

**Cómo capturarla:**
1. En una nota procesada, toca "Compartir"
2. Captura el bottom sheet con todas las opciones visibles

**Clave:** cierra la promesa: el output sale del teléfono. Listo para tu equipo, cliente, profesor.

---

## Notas finales

### Antes de submit:
- [ ] Crear demo account con plan Premium activo en Supabase
- [ ] Crear Sandbox Tester en ASC (paso B.1 del roadmap)
- [ ] Verificar que `https://sythio.app/privacy-policy` carga 200
- [ ] Verificar que `https://sythio.app` carga (Marketing/Support URL)
- [ ] Tener las 5 capturas en formato 1290×2796 px (iPhone 6.7") en una carpeta lista para subir
- [ ] App icon 1024×1024 PNG sin transparencia ni redondeado (Apple lo redondea solo)

### Tiempos esperados:
- Llenar metadata + subir capturas: **45-60 min**
- Apple review: **24-48h** (a veces 24h en Q1/Q2 que es ahora)
- Si rechazan: razones más comunes documentadas en `docs/PASOS_RESTANTES.md`

### Si Apple pide más info (resolución):
Responde por el portal de "Resolution Center" en ASC. Tip: contesta con respeto, sé específico, agrega capturas o screencast si es útil. NO discutas — implementa lo que pidan o pide aclaración.
