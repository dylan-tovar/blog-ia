# PRD-8.3 — Contexto del editor y motor para aplicar propuestas

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-8 — Chat de IA del editor](PRD-8-ai-chat.md) |
| Dificultad / Esfuerzo | A (avanzada) / L (más de 3 días) |
| Dueño sugerido / Mentor | D2 / — |
| Depende de | [PRD-2.2](PRD-2.2-editor-tiptap.md) (el editor Tiptap y su markdown), [PRD-8.1](PRD-8.1-chat-server.md) (el formato de `EditAction`) |
| Alimenta a | [PRD-8.2](PRD-8.2-chat-drawer-ui.md) (`use-chat` llama al puente), [PRD-8.4](PRD-8.4-action-cards-analysis.md) (usa `describeLocation`, `actionPreview`, `findOverlap`) |
| Código | `src/features/posts/components/editor/editor-context.ts`, `apply-action.ts`, `action-overlap.ts`, `editor-bridge.ts` |
| ADRs | [0014](../adr/0014-aplicacion-de-ediciones-en-el-cliente-con-fingerprints.md), [0010](../adr/0010-editor-markdown.md) |

## Resumen

La parte más delicada del chat: **convertir una propuesta de la IA en un cambio real y correcto dentro del editor**. Hay que (1) fotografiar el documento como una lista de bloques numerados (para que la IA pueda señalarlos), (2) al pulsar "Aplicar", volver a **encontrar** esos bloques en el documento tal como está *ahora* (el autor pudo seguir escribiendo), (3) insertar en un solo paso de `Ctrl+Z` y (4) poder deshacer solo ese paso. Todo ocurre en el navegador; el servidor nunca toca el artículo ([ADR 0014](../adr/0014-aplicacion-de-ediciones-en-el-cliente-con-fingerprints.md)).

## Qué necesitás entender antes

- [ ] Qué es un **documento ProseMirror/Tiptap**: un árbol de nodos; los "bloques" son los nodos de primer nivel (párrafos, títulos, listas…). Ver [PRD-2.2](PRD-2.2-editor-tiptap.md).
- [ ] Qué es una **posición** en ProseMirror (un entero que cuenta desde el inicio del documento) y un **rango** `from`–`to`.
- [ ] Qué es un **hash** (aquí FNV-1a, una función rápida que convierte texto en un número de 8 hex) y qué **no** es (no es seguridad).
- [ ] Qué es una **transacción** y el **historial de deshacer** de ProseMirror.
- [ ] Funciones puras vs. código que toca el editor (por eso el archivo `editor-bridge.ts` es fino).
- [ ] Glosario: [docs/README.md](../README.md#glosario) (bloque, snapshot, fingerprint, stale).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| El **snapshot** del editor (bloques, selección) y su recorte para enviarlo | La ruta del servidor y su validación: [PRD-8.1](PRD-8.1-chat-server.md) |
| `resolveAction` / `planApply`: dónde va cada propuesta y si sigue vigente | La tarjeta (botones, estados): [PRD-8.4](PRD-8.4-action-cards-analysis.md) |
| La superposición entre propuestas (`findOverlap`) | La conversación y el envío: [PRD-8.2](PRD-8.2-chat-drawer-ui.md) |
| El puente Tiptap (`apply`, `undo`, registro de deshacer) | Configuración del editor y su barra: [PRD-2.2](PRD-2.2-editor-tiptap.md) |

## Cómo funciona

Orden de lectura sugerido: `editor-context.ts` → `apply-action.ts` → `action-overlap.ts` → `editor-bridge.ts`. Los tres primeros son **puros** (se prueban con Vitest); el cuarto necesita un editor real (solo se prueba con Playwright).

### 1. Bloques y snapshot (`editor-context.ts`)

- **Bloque:** `{ id: "b<índice>", type, level?, markdown }`. El `id` es el índice del **nodo de primer nivel** en el documento, así que sigue alineado aunque se omitan los vacíos (por eso los ids pueden no ser consecutivos). `docToBlocks` serializa cada nodo a Markdown y descarta los vacíos.
- **Snapshot** (`buildSnapshot`): `{ title, blocks, selection, fingerprint }`. La selección solo cuenta si **no está colapsada** (un cursor sin selección no le da nada sobre qué actuar al modelo) y trae los ids de los bloques que abarca.
- **Huella de bloque** (`blockFingerprint`): hash FNV-1a de `tipo + nivel + markdown`. **Deliberadamente sin el `id`**: si un bloque solo se movió, conserva su huella y se lo sigue encontrando. `docFingerprint` combina todas y viaja en la petición, pero el servidor no la usa ([PRD-8.1](PRD-8.1-chat-server.md)).
- **Recorte para enviar** (`toRequestContext` → `fitBlocks`): solo **bloques completos**, hasta 30 000 caracteres y 250 bloques, con los de la selección primero; un bloque que nunca cabría se salta. Envía además `totalBlocks` real para que el prompt diga cuánto del artículo no se vio.

### 2. Dónde va cada propuesta (`apply-action.ts`)

`resolveAction(action, snapshot, live)` devuelve un lugar (`{ from, to, mode: "insert" | "replace" }`) o **`stale`**. `live` es el documento **actual** con posiciones (`buildLiveDoc`).

La pieza clave, `locateSequence`:

```text
locateSequence(bloques_originales, bloques_vivos):
  huellas = huella de cada bloque original
  buscar en el documento vivo la MISMA secuencia de huellas (mismo tipo, nivel y markdown)
  si hay varias coincidencias -> la más cercana a la posición original
  si no hay ninguna -> stale (ese contenido ya no existe)
```

| `op` | Dónde va | Cuándo es `stale` |
| :--- | :--- | :--- |
| `append` | Al final (si el artículo está vacío, reemplaza el párrafo vacío en vez de dejar una línea en blanco arriba) | Nunca |
| `insert_after_block` | Justo después del bloque ubicado | No se encuentra el bloque |
| `replace_block` / `replace_range` | Reemplaza el rango de bloques ubicado | No se encuentra la secuencia |
| `replace_selection` | Reemplaza la selección **si el texto seleccionado sigue igual** que en el snapshot | El texto seleccionado ahora es otro |
| `insert_at_selection` | Con selección en el snapshot: justo **después** de ella. Sin selección en el snapshot (inserción manual desde el chat): **en el cursor** | La selección cambió |

`planApply` agrega el **límite de longitud**: proyecta el largo resultante (`largo actual − lo que se reemplaza + lo nuevo`) y si supera 100 000 caracteres (`fitsContentLimit`) devuelve `too_long` con un mensaje que dice por cuánto se pasa.

Utilidades para la tarjeta: `describeLocation` ("Después de «…»", "Reemplaza la selección"), `actionPreview` (qué se reemplaza y qué se agrega) y `defaultActionLabel`.

### 3. Propuestas que chocan (`action-overlap.ts`)

`findOverlap(nueva, anteriores, snapshot)` marca cuándo aplicar una propuesta cambiaría lo que apunta otra. Cada propuesta tiene una **huella de bloques**: `mutates` (el rango que reemplaza) y `anchors` (bloques a los que solo apunta). Choca si:

- dos rangos `mutates` se solapan;
- el rango que una reemplaza **contiene** un ancla de la otra.

Dos inserciones después del mismo bloque **no** chocan (ambas se pueden aplicar). Devuelve el id de la primera anterior con la que choca.

### 4. El puente con Tiptap (`editor-bridge.ts`)

```text
apply(action, snapshot):
  plan = planApply(action, snapshot, readLiveDoc(editor))
  si no es ok (stale / too_long) -> devolver el error sin tocar el editor
  cerrar el historial (closeHistory)          <- para que este cambio sea un paso propio
  insertContentAt({from,to}, action.markdown, { contentType: "markdown" })
  cerrar el historial otra vez
  guardar un token de deshacer: { documento resultante, profundidad del historial }

undo(token):
  solo si el documento actual es EXACTAMENTE el que dejó la propuesta Y la profundidad
  del historial no cambió -> editor.commands.undo()
  si no -> "Editaste el artículo después... deshacé primero los cambios posteriores"
```

El registro de deshacer vive **por editor** (un `WeakMap`), no por puente: el puente se recrea cuando cambia el título, pero el historial es del editor. `apply` **nunca lanza**: los fallos vuelven como `ok: false` (`stale`, `too_long`, `unavailable`).

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **Aplicar en el cliente** ([ADR 0014](../adr/0014-aplicacion-de-ediciones-en-el-cliente-con-fingerprints.md)) | Aplicar en el servidor | El borrador vive en el navegador y se guarda con 2 s de retraso; el servidor no ve lo que el autor ve |
| **Huella por bloque, sin el `id`** | Una huella del documento completo (cualquier edición lejana invalidaría **todas** las propuestas); posiciones absolutas (se corren al aplicar la primera) | Solo se invalida lo que realmente cambió; una propuesta tolera que el autor haya movido o agregado otras partes |
| **Buscar la secuencia por contenido y elegir la más cercana** | Confiar en el `id` original | Aplicar varias propuestas seguidas funciona aunque las primeras desplacen posiciones |
| **Un solo paso de `Ctrl+Z`** (cerrar historial antes y después) | Dejar que el historial agrupe | Sin cerrar el historial, escribir justo antes o después se fundiría en el mismo paso |
| **Deshacer solo si el documento coincide** | Llamar siempre a `undo()` | Si el autor siguió editando, un `undo()` revertiría **otra cosa**; se prefiere explicar por qué no se puede |
| **Lógica pura + adaptador fino** | Todo dentro del componente | Casi todo se prueba con Vitest; el adaptador solo con Playwright |
| **Límite de 100 000 caracteres verificado antes de aplicar** | Dejar que falle al guardar | Error visible en la tarjeta en vez de un fallo silencioso |

## Criterios de aceptación

- [ ] Aplicar una propuesta la inserta en el lugar correcto en **un solo** `Ctrl+Z`.
- [ ] Si el autor editó el bloque al que apunta la propuesta, queda `stale` con un mensaje claro y no se aplica.
- [ ] Un bloque que solo se movió sigue encontrándose.
- [ ] `replace_selection` solo reemplaza el texto que estaba seleccionado.
- [ ] Sobre un artículo vacío, `append` no deja una línea en blanco arriba.
- [ ] Un cambio que superaría 100 000 caracteres da `too_long` y no modifica el documento.
- [ ] Aplicar varias propuestas seguidas funciona aunque las primeras desplacen las posiciones.
- [ ] Dos propuestas que tocan los mismos bloques se marcan como superpuestas; dos inserciones tras el mismo bloque, no.
- [ ] Deshacer revierte exactamente ese paso; si el autor siguió editando, explica por qué no.

## Cómo verificarla a mano

1. `pnpm test`: `editor-context.test.ts`, `apply-action.test.ts` y `action-overlap.test.ts` cubren la lógica pura.
2. `e2e/editor-ai-drawer.spec.ts` cubre aplicar, deshacer, descartar, "desactualizada", `replace_selection`, aplicar todo, superposición, inserción al cursor y límite de longitud (con el servidor simulado). **Hoy su `beforeEach` no pasa** ([PRD-X.1](PRD-X.1-testing-e2e.md)).
3. A mano con clave real: escribí tres párrafos, pedí "agregá una conclusión", pulsá **Aplicar** y luego `Ctrl+Z`: debe deshacer todo el bloque de una vez.
4. Pedí una propuesta, **antes de aplicarla** editá el párrafo al que apunta y aplicala: debe quedar "Desactualizada".
5. Aplicá una propuesta, escribí algo, y pulsá **Deshacer** en la tarjeta: debe explicar que hay cambios posteriores.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| **`fingerprint` del documento** se calcula y se envía, pero el servidor solo valida el formato. Decidir si se quita o se usa (por ejemplo, para descartar respuestas de un documento que ya cambió) | M |
| `editor-bridge.ts` solo se prueba con Playwright: evaluar un entorno con un ProseMirror real (`jsdom` está instalado pero sin configurar) para pruebas unitarias | A |
| `insertMarkdown` (en `PostEditor.tsx`) arma un `EditAction` `append` o `insert_at_selection` sin selección en el snapshot y llama a `bridge.apply`; no tiene prueba unitaria propia (solo e2e). Extraerla a una función pura y probarla | M |
| Una **secuencia de bloques repetidos** (dos párrafos idénticos) elige la copia más cercana al original: agregar pruebas de ese caso | M |
| `LABEL_MAX_CHARS` y los mensajes de error (`stale`, `too_long`) están fijos en el código: moverlos a un archivo de textos | B |
| Escribir una guía corta con un ejemplo paso a paso de `locateSequence` (para futuros mantenedores) | B |

## Preguntas de autoevaluación

1. ¿Por qué la huella de un bloque **no** incluye su `id`?
2. ¿Qué significa que una propuesta esté `stale` y cómo lo decide `locateSequence`?
3. ¿Por qué se cierra el historial antes y después de insertar?
4. ¿Por qué `undo` compara el documento y la profundidad del historial antes de deshacer?
5. ¿Por qué aplicar la primera propuesta no rompe las siguientes?
6. ¿Por qué dos inserciones después del mismo bloque **no** se consideran superpuestas, pero un `replace_block` y una inserción después de ese bloque sí?
