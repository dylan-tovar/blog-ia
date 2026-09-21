# PRD-6.2 — Resumen de artículos: botón y tarjeta

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-6 — IA para el lector](PRD-6-ai-reader.md) |
| Dificultad / Esfuerzo | B (básica) / S (hasta 1 día) |
| Dueño sugerido / Mentor | D5 / D3 |
| Depende de | [PRD-6.1](PRD-6.1-summary-backend.md) (la acción que llama), [PRD-2.6](PRD-2.6-post-detail.md) (la página donde vive) |
| Alimenta a | Nadie: es una hoja del árbol |
| Código | `src/features/ai/components/SummaryButton.tsx`, uso en `src/app/(public)/post/[id]/page.tsx`, `AiErrorMessage.tsx`, `use-countdown.ts`, `ai-ui.ts` (`describeAiError`) |
| ADRs | [0011](../adr/0011-ia-con-gemini.md) |

## Resumen

El botón **"Ver resumen"** que aparece bajo el título de un artículo largo. Al pulsarlo abre una tarjeta con el resumen (si ya existe se ve al instante; si no, y hay sesión, se genera). También muestra los errores con un botón "Reintentar" y, si el límite de peticiones se alcanzó, una cuenta regresiva. Leer el artículo **nunca** depende de este botón: si falla, el artículo sigue legible.

## Qué necesitás entender antes

- [ ] Qué es un **componente de cliente** (`"use client"`) frente a uno de servidor.
- [ ] Qué hace `useState` y `useTransition` en React (mostrar "cargando" mientras se espera al servidor).
- [ ] Cómo un componente llama a una **Server Action** (`getPostSummary`) como si fuera una función.
- [ ] Accesibilidad básica: `aria-expanded`, `aria-live` (para que un lector de pantalla anuncie el cambio).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| El botón, la tarjeta, el aviso de privacidad y los mensajes de error | Generar o guardar el resumen: [PRD-6.1](PRD-6.1-summary-backend.md) |
| Cuándo se muestra el botón (artículo con 300 palabras o más) | El cálculo de `wordCount`: [PRD-2.6](PRD-2.6-post-detail.md) |
| Invitar a iniciar sesión cuando hace falta | El diálogo de login en sí (`LoginDrawer`, [PRD-1.1](PRD-1.1-auth-forms.md)) |

## Cómo funciona

Orden de lectura sugerido: cómo se usa en `post/[id]/page.tsx` → `SummaryButton.tsx` → `AiErrorMessage.tsx` → `use-countdown.ts`.

### Cuándo aparece

En `page.tsx`, el botón se renderiza solo si el post **no es una nota** y `post.wordCount >= MIN_WORDS_SUMMARY` (300). Recibe tres datos: `postId`, `initialSummary` (el que ya estaba guardado, o `null`) y `viewerId` (el usuario o `null`).

### El componente

```text
SummaryButton({ postId, initialSummary, viewerId }):
  estado: summary (o null), open, error, isPending

  al pulsar el botón:
    si estaba abierto -> cerrar
    si no -> abrir; y si NO hay resumen, HAY sesión y no está pendiente -> load()

  load(): getPostSummary(postId) dentro de startTransition
    ok    -> guardar el resumen en el estado
    error -> guardar el error
```

### Qué ve el lector

| Situación | Qué se muestra |
| :--- | :--- |
| Resumen guardado | "Ver resumen" abre la tarjeta al instante. El botón alterna con "Ocultar resumen" |
| Sin resumen y con sesión | "Generando resumen…" y, debajo, el aviso de que el texto se envía a Google Gemini (que en la capa gratuita puede usarlo para mejorar sus productos) |
| Sin resumen y sin sesión | "Iniciá sesión para generar el resumen." con un botón que abre `LoginDrawer` |
| Resumen mostrado | Tarjeta "Resumen" con el texto y la nota "Generado con IA (Google Gemini); puede contener errores." |
| Error | `AiErrorMessage` con "Reintentar"; en límite de peticiones, con cuenta regresiva y el botón deshabilitado hasta que llega a cero. Si el error es `unauthenticated`, se ve la misma invitación a iniciar sesión |

Detalles útiles:

- La zona del resumen es un `aria-live="polite"`: un lector de pantalla anuncia los cambios.
- `AiErrorMessage` recibe un `key` con el tipo de error y el `retryAfter` para que la cuenta regresiva **arranque de nuevo** en cada error nuevo.
- Los errores `not_allowed`, `not_configured`, `unauthenticated` y `aborted` **no** ofrecen "Reintentar" (no tiene sentido reintentar).
- El enlace de "Iniciá sesión" es un `LoginDrawer` (un panel), no una navegación a `/login`.

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **Leer nunca depende del resumen** (comentario en `SummaryButton.tsx`) | Renderizar el resumen con el artículo | El artículo se renderiza en el servidor; el botón agrega una tarjeta opcional |
| **Aviso de privacidad visible al generar** | Omitirlo | El texto se envía a un tercero y en la capa gratuita puede usarse para mejorar sus productos: el lector debe saberlo |
| **Umbral de 300 palabras en la interfaz** | Mostrar siempre | Un resumen de un texto corto no aporta; el servidor repite la regla ([PRD-6.1](PRD-6.1-summary-backend.md)) |
| **Estado local con `useState`/`useTransition`** | Una librería de datos | Suficiente para un botón; menos dependencias † |

## Criterios de aceptación

- [ ] El botón aparece solo en artículos publicados de 300 palabras o más, nunca en notas.
- [ ] Con un resumen guardado, se abre al instante sin mostrar "Generando…".
- [ ] Sin sesión y sin resumen, se invita a iniciar sesión en vez de generar.
- [ ] Un error muestra un mensaje legible y, cuando corresponde, "Reintentar".
- [ ] Con límite de peticiones, se ve una cuenta regresiva y el botón queda deshabilitado hasta que termina.
- [ ] El botón se puede usar con teclado y anuncia su estado (`aria-expanded`).
- [ ] El resumen siempre lleva la nota "Generado con IA…".

## Cómo verificarla a mano

1. `pnpm dev`, escribí y publicá un artículo de más de 300 palabras (los artículos de `pnpm seed:dev` son cortos y **no** muestran el botón): en su página debe verse "Ver resumen".
2. Abrí una **nota** y un artículo corto: no debe verse el botón.
3. Sin sesión, pulsá "Ver resumen": si el artículo no tiene resumen guardado, debe aparecer la invitación a iniciar sesión.
4. Con sesión y `GEMINI_API_KEY` válida, pulsá el botón: "Generando resumen…" y luego la tarjeta.
5. Con `AI_RATE_LIMIT_USER_PER_MIN=1`, pedí resúmenes de dos artículos seguidos: el segundo muestra la cuenta regresiva.
6. Abrí el resumen con teclado (Tab y Enter).

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| El bloque "Iniciá sesión para generar el resumen" está escrito dos veces (`needsLogin` y `error?.kind === "unauthenticated"`): extraerlo a un componente pequeño | B |
| El botón "Iniciá sesión" usa clases de color repetidas en varios componentes (`text-blue-400`): moverlas a una variante compartida ([PRD-0.2](PRD-0.2-ui-primitives.md)) | B |
| No hay prueba e2e del botón: escribir una prueba de Playwright con la acción simulada ([PRD-X.1](PRD-X.1-testing-e2e.md)) | M |
| Ofrecer "Regenerar" cuando ya hay resumen (depende de la decisión en [PRD-6.1](PRD-6.1-summary-backend.md)) | M |

## Preguntas de autoevaluación

1. ¿Por qué el componente es de cliente y el artículo se renderiza en el servidor?
2. ¿Qué hace `useTransition` aquí y qué vería el usuario sin él?
3. ¿Por qué la cuenta regresiva necesita un `key` distinto en cada error?
4. ¿Qué errores no ofrecen "Reintentar" y por qué?
5. Si `getPostSummary` falla, ¿puede el lector seguir leyendo el artículo? ¿Por qué?
6. ¿Por qué se muestra el aviso de que el texto se envía a Google?
