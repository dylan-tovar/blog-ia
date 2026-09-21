# PRD-8.4 — Chat de IA: tarjetas de propuesta, análisis y pasos

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-8 — Chat de IA del editor](PRD-8-ai-chat.md) |
| Dificultad / Esfuerzo | M (media) / M (2 a 3 días) |
| Dueño sugerido / Mentor | D8 / D2 |
| Depende de | [PRD-8.2](PRD-8.2-chat-drawer-ui.md) (los mensajes que las contienen), [PRD-8.3](PRD-8.3-editor-context-apply.md) (`describeLocation`, `actionPreview`, `findOverlap`), [PRD-0.2](PRD-0.2-ui-primitives.md) (`Badge`, `Button`) |
| Alimenta a | Nadie: es la capa visual final del chat |
| Código | `src/features/ai/components/chat/ActionCard.tsx`, `AnalysisCard.tsx`, `StepsList.tsx`, y los reductores de estado de propuestas y plan en `chat-state.ts` |
| ADRs | [0013](../adr/0013-chat-ia-protocolo-ndjson-y-function-calling.md), [0014](../adr/0014-aplicacion-de-ediciones-en-el-cliente-con-fingerprints.md) |

## Resumen

Lo que el autor ve cuando la IA **propone** algo: una **tarjeta de propuesta** (qué cambia, dónde y cómo queda, con botones Aplicar / Descartar / Deshacer), una **tarjeta de análisis** (puntaje 0-100, métricas y listas de fortalezas, faltantes y recomendaciones) y un indicador de **pasos** mientras se genera la respuesta. Este paquete es puro estado y presentación: no habla con el servidor ni con el editor directamente (eso lo hace [PRD-8.2](PRD-8.2-chat-drawer-ui.md) con el puente de [PRD-8.3](PRD-8.3-editor-context-apply.md)).

## Qué necesitás entender antes

- [ ] Componentes de React que reciben datos por **props** y avisan con funciones (`onApply`, `onDiscard`, `onUndo`).
- [ ] **Funciones puras** y estado inmutable: los reductores de `chat-state.ts` reciben la lista de mensajes y devuelven una **nueva** lista (no modifican la anterior).
- [ ] Qué es un **estado** de una tarjeta y una máquina de estados sencilla (pending → applied → …).
- [ ] Tailwind y variantes de `Badge`.
- [ ] Accesibilidad: `aria-label`, `role="alert"`, `role="status"`, `aria-live`.
- [ ] Glosario: [docs/README.md](../README.md#glosario) (tarjeta de propuesta, stale, snapshot).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `ActionCard`: estados, vista previa antes/después, botones y avisos | Decidir dónde se aplica y si sigue vigente: [PRD-8.3](PRD-8.3-editor-context-apply.md) |
| `AnalysisCard`: puntaje, dimensiones y listas | El servidor que genera propuestas y análisis: [PRD-8.1](PRD-8.1-chat-server.md) |
| `StepsList` y los reductores de propuestas y plan en `chat-state.ts` | Los helpers de **mensajes** de `chat-state.ts` (`settleReply`, `toRequestMessages`, `shouldSubmitOnEnter`, `cleanChatContent`, `isInsertableContent`, `formatMessageTime`, `isNearBottom`): [PRD-8.2](PRD-8.2-chat-drawer-ui.md) |
| "Aplicar todo" (qué propuestas incluye) | El envío y el streaming: [PRD-8.2](PRD-8.2-chat-drawer-ui.md) |

## Cómo funciona

Orden de lectura sugerido: los tipos de `chat-state.ts` (`ActionStatus`, `ActionState`, `ChatEntry`) → `ActionCard.tsx` → los reductores (`addAction`, `markApplied`, …) → `AnalysisCard.tsx` → `StepsList.tsx`.

### 1. La tarjeta de propuesta (`ActionCard`)

Cada llamada del modelo a `propose_edit` se guarda como un `ActionState`: `{ id, action, snapshot, status, undo?, overlapsWith?, notice? }`. Fijate en que **guarda el `snapshot`**: la foto del editor con la que se hizo la propuesta, contra la cual se juzga si sigue vigente ([PRD-8.3](PRD-8.3-editor-context-apply.md)).

| Estado (`status`) | Etiqueta | Qué significa | Botones |
| :--- | :--- | :--- | :--- |
| `pending` | Propuesta | Lista. Mientras la respuesta aún se escribe, "Aplicar" está deshabilitado y se lee "Podés aplicarla cuando termine la respuesta" | Aplicar, Descartar |
| `applied` | Aplicado | Ya se insertó en el editor | Deshacer |
| `discarded` | Descartada | El autor la rechazó (la tarjeta se ve atenuada) | ninguno |
| `stale` | Desactualizada | El artículo cambió y ya no se encuentra el bloque al que apuntaba | Descartar |
| `error` | No se pudo aplicar | Superó el límite de longitud o el editor no estaba listo | Aplicar (reintentar), Descartar |

Además, una propuesta `pending` que choca con una anterior de la misma respuesta muestra la etiqueta **"Se superpone"** y un texto explicativo (`OVERLAP_NOTICE`).

La tarjeta muestra: el título (`label` que dio la IA o uno por defecto: "Agregar al final", "Reemplazar bloque"…), la ubicación legible (`describeLocation`: "Después de «…»", "Reemplaza la selección") y una **vista previa**: "Antes" (si reemplaza algo) y "Después" o "Contenido nuevo", ambas con `MarkdownContent`. Un `notice` (motivo de un fallo) se muestra con `role="alert"`.

### 2. Los reductores (`chat-state.ts`)

Son funciones puras: reciben `entries` (la lista de mensajes) y devuelven una nueva.

| Función | Qué hace |
| :--- | :--- |
| `addAction` | Agrega una propuesta `pending` con un id (`<respuesta>-a<N>`) y calcula si choca con las anteriores (`findOverlap`) |
| `markApplied` / `markDiscarded` / `markStale` / `markError` | Cambian el estado. `markDiscarded` además **libera** a las propuestas que chocaban con la descartada |
| `markUndone` | Vuelve a `pending` (se puede aplicar otra vez; el motor la revisa contra el documento de ese momento) |
| `markUndoFailed` | Deja el estado y guarda el motivo en `notice` |
| `applicableActions` | Qué incluye **"Aplicar todo (N)"**: solo las `pending`/`error` **sin superposición** y solo **cuando la respuesta ya terminó** de llegar (mientras hay *streaming*, el documento o la respuesta pueden cambiar) |
| `applyFailureNotice` | Si la propuesta chocaba, el fallo se explica por la superposición y no con el genérico "el artículo cambió" |

### 3. El plan y los pasos

El servidor emite pasos deterministas (`read` "Leyendo el artículo", `analyze` "Analizando estructura", `propose` "Preparando propuesta") y, **si el modelo llamara** a `update_plan`, pasos de su propio plan. `StepsList` **solo se muestra mientras la respuesta se está escribiendo**: busca el paso `running` (o el último) y muestra su etiqueta con un brillo (*shimmer*). Al terminar, se ocultan los pasos técnicos para dejar la pantalla en el contenido. `shouldShowSteps` decide cuándo mostrar la lista. `startPlan`, `advancePlan` y `finishPlan` hacen avanzar el plan a medida que llegan propuestas.

> **Ojo (código latente).** `update_plan` no está declarada como herramienta ni mencionada en el prompt de producción ([PRD-8.1](PRD-8.1-chat-server.md)): con la configuración actual el modelo no puede invocarla, así que `startPlan`/`advancePlan`/`finishPlan` no tienen ningún plan que avanzar en producción. Solo las pruebas unitarias y e2e (con eventos inyectados) los ejercitan.

### 4. La tarjeta de análisis (`AnalysisCard`)

Se muestra cuando el modelo llama a `present_analysis` (el atajo "Analizar"). Es solo presentación de un `ArticleAnalysis`: un **medidor circular** SVG con el puntaje y una banda de color (≥ 80 "Excelente", ≥ 50 "Bien encaminado", menos "Requiere revisión"), el veredicto, cinco métricas con barra (claridad, estructura, tono y voz, engagement, ortografía) y tres listas: "Qué está bien", "Qué falta o debe ajustarse" y "Recomendaciones accionables". **No se guarda en el post**: las columnas `content_score` y `ai_generated_titles` no las alimenta el chat.

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **El modelo nunca edita solo: cada cambio pasa por una tarjeta que el autor confirma** ([PRD-8](PRD-8-ai-chat.md)) | Aplicar automáticamente | El autor siempre tiene el control. Costo: un clic por cambio (mitigado con "Aplicar todo") |
| **Cada propuesta guarda su `snapshot`** | Comparar contra el documento actual | Se puede decidir por contenido si sigue vigente ([ADR 0014](../adr/0014-aplicacion-de-ediciones-en-el-cliente-con-fingerprints.md)) |
| **"Aplicar todo" excluye las superpuestas y espera al final de la respuesta** (comentario en `chat-state.ts`) | Aplicar todas siempre | Quien llegó primero gana; la otra queda a criterio del autor |
| **Reductores puros** † | Estado dentro de los componentes | Se prueban con Vitest sin montar React |
| **Al terminar, ocultar los pasos técnicos** (comentario en `StepsList.tsx`) | Mostrar el historial de pasos | La pantalla se centra en el contenido generado |
| **La tarjeta de análisis es solo presentación y no se guarda** | Persistir el análisis en `posts` | Sin estado que sincronizar; se pierde al recargar |

## Criterios de aceptación

- [ ] Una propuesta muestra ubicación y vista previa; "Aplicar" la inserta y la tarjeta pasa a "Aplicado".
- [ ] "Deshacer" la vuelve a "Propuesta"; si el autor siguió editando, la tarjeta explica por qué no se pudo.
- [ ] "Descartar" no modifica el artículo y atenúa la tarjeta.
- [ ] Una propuesta cuyo bloque fue editado queda "Desactualizada" con el motivo visible y solo permite descartar.
- [ ] "Aplicar todo (N)" aparece solo con más de una propuesta aplicable y solo cuando la respuesta terminó; excluye las superpuestas.
- [ ] Una propuesta que choca con otra muestra "Se superpone" y su explicación; al descartar la primera, la segunda se libera.
- [ ] Un cambio que superaría el límite del artículo muestra "No se pudo aplicar" con el motivo.
- [ ] La tarjeta de análisis muestra puntaje, cinco métricas, veredicto y las tres listas; el color del puntaje sigue las bandas.
- [ ] Cada botón tiene un nombre accesible que incluye el título de la propuesta.

## Cómo verificarla a mano

1. `pnpm test`: `chat-state.test.ts` cubre los reductores.
2. Con clave real: en un artículo con varios párrafos, pedí "agregá una introducción y una conclusión". Verás dos tarjetas y "Aplicar todo (2)". Probá Aplicar, Deshacer, Descartar.
3. Editá un párrafo al que apunta una propuesta **antes** de aplicarla: debe quedar "Desactualizada".
4. Pulsá el atajo "Analizar": debe aparecer la tarjeta de análisis (puntaje, métricas y listas).
5. El e2e `editor-ai-drawer.spec.ts` prueba todo esto con el servidor simulado; hoy su `beforeEach` está roto ([PRD-X.1](PRD-X.1-testing-e2e.md)).

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| `AnalysisCard` usa colores fijos de Tailwind (`emerald`, `amber`, `rose`) y textos en español dentro del componente: pasarlos a tokens del tema y a un archivo de textos ([PRD-0.1](PRD-0.1-theme-tokens.md)) | B |
| `AnalysisCard` tiene `key={idx}` en las listas: usar una clave más estable | B |
| Agregar pruebas de `ActionCard` y `AnalysisCard` (hoy solo están las de `chat-state.test.ts` y el e2e). Requiere decidir un entorno de DOM ([PRD-8.2](PRD-8.2-chat-drawer-ui.md)) | A |
| Mostrar en la tarjeta un aviso cuando el artículo fue recortado y la propuesta puede no ver todo ([PRD-8.1](PRD-8.1-chat-server.md)) | M |
| Decidir qué hacer con `startPlan`/`advancePlan`/`finishPlan` mientras `update_plan` siga sin declararse: borrarlos o habilitar la herramienta ([PRD-8.1](PRD-8.1-chat-server.md)) | A |
| El análisis no se guarda ni se relaciona con `content_score`: valorar guardarlo (sería una migración) o dejarlo documentado como límite | M |

## Preguntas de autoevaluación

1. ¿Por qué cada propuesta guarda su propio `snapshot`?
2. ¿Qué estados tiene una tarjeta y qué botones muestra cada uno?
3. ¿Por qué "Aplicar todo" espera a que la respuesta termine y excluye las superpuestas?
4. ¿Qué es una función pura y por qué los reductores de `chat-state.ts` lo son?
5. ¿Qué pasa con la tarjeta si el autor edita el párrafo al que apuntaba?
6. ¿Por qué los pasos del plan de la IA hoy no avanzan en producción?
