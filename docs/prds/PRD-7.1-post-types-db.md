# PRD-7.1 — Tipos de post en la base de datos (notas, respuestas y `likes`)

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-7 — Notas y me gusta](PRD-7-notes-likes.md) |
| Dificultad / Esfuerzo | A (avanzada) / M (2 a 3 días) |
| Dueño sugerido / Mentor | D2 / D1 |
| Depende de | [PRD-2.1](PRD-2.1-posts-data-rls.md) (tabla `posts` y sus políticas base) |
| Alimenta a | [PRD-7.2](PRD-7.2-notes-ui.md), [PRD-7.3](PRD-7.3-likes.md), [PRD-3.2](PRD-3.2-feed-list.md) |
| Código | `supabase/migrations/0005_post_types_and_likes.sql`, `supabase/migrations/0006_allow_note_updates.sql`, el `insert` de `0007_ai_features.sql` (parte 4) |
| ADRs | [0009](../adr/0009-tipos-de-post-y-likes.md), [0015](../adr/0015-notas-editables.md), [0012](../adr/0012-integridad-de-escritura-de-posts.md) |

## Resumen

Hace que una sola tabla `posts` sirva para dos cosas distintas: el **artículo** (largo, con título y moderación) y la **nota** (500 caracteres, sin título, publicada al instante y opcionalmente colgada de otro post). Las reglas que las separan viven **en la base de datos** (restricciones `CHECK`, una función y políticas RLS), no solo en el código, para que nadie pueda saltárselas llamando a la API directamente. También crea la tabla `likes`.

## Qué necesitás entender antes

- [ ] SQL básico: `ALTER TABLE`, `CHECK`, clave foránea (`REFERENCES ... ON DELETE SET NULL`), índice.
- [ ] **RLS**: políticas por fila (`USING` para leer/actualizar/borrar, `WITH CHECK` para insertar/actualizar). Ver [PRD-2.1](PRD-2.1-posts-data-rls.md).
- [ ] Una función `SECURITY DEFINER`: se ejecuta con los permisos de quien la creó, no de quien la llama.
- [ ] Por qué una política de `posts` que consulta `posts` puede producir el error `42P17` (recursión infinita de RLS).
- [ ] Qué es una restricción `NOT VALID` (no revisa las filas existentes, sí las nuevas).
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Columnas `type` y `parent_post_id`, restricciones `CHECK` y el índice | Los formularios de notas: [PRD-7.2](PRD-7.2-notes-ui.md) |
| `can_attach_note` y las políticas de `posts`, `post_tags` y `likes` que cambian con los tipos | El botón de me gusta: [PRD-7.3](PRD-7.3-likes.md) |
| Cómo la migración `0006` reabre la edición de notas | Privilegios por columna, trigger de `updated_at` y `ai_*`: [PRD-2.1](PRD-2.1-posts-data-rls.md) |

## Cómo funciona

Orden de lectura sugerido: `0005` completa → `0006` (son 7 líneas) → la parte 4 de `0007`.

### 1. Columnas nuevas y conversión de datos (`0005`, parte 1)

- `posts.type text not null default 'article'` con `CHECK (type in ('note','article'))`.
- `posts.parent_post_id uuid references posts(id) on delete set null` (si se borra el post padre, la nota **no se borra**: queda como nota independiente).
- Un bloque `do $$ ... $$` que convierte los posts que ya existían a notas **solo la primera vez** (solo si todavía no existe la columna `type`): rellena contenido vacío con el título, borra borradores fantasma sin nada, marca el resto como notas publicadas y borra sus tags.

### 2. Invariantes en la base (`0005`, parte 2)

| Restricción | Regla |
| :--- | :--- |
| `posts_type_check` | `type` es `note` o `article` |
| `posts_note_shape_check` | Una nota es siempre `published`, con `published_at` y **sin título** |
| `posts_note_length_check` | Una nota tiene de 1 a 500 caracteres. Es `NOT VALID`: las notas convertidas pueden pasar de 500; el límite rige para toda nota nueva |
| `posts_article_no_parent_check` | Solo una nota puede tener `parent_post_id` |

Más el índice parcial `posts_parent_post_id_idx` (solo filas con padre) para listar rápido las respuestas de un post.

### 3. `can_attach_note` (`0005`, parte 3)

```sql
select exists (
  select 1 from public.posts parent
  where parent.id = p_parent_id
    and parent.status = 'published'
    and parent.parent_post_id is null
);
```

Una nota puede colgar solo de un post **publicado** que **no sea a su vez una respuesta**: `parent_post_id` siempre apunta a la raíz (artículo o nota original), nunca a otra respuesta. Es una función aparte (`SECURITY DEFINER`, `search_path` vacío, ejecutable solo por `authenticated`) porque escribir esa comprobación dentro de una política de `posts` haría que `posts` consulte `posts` y falle con `42P17`.

### 3.1 `reply_to_post_id` y `can_reply_to_note` (`0013`) — hilo plano

`0013` agrega `reply_to_post_id` (nullable, `references posts(id) on delete set null`, solo en notas). A diferencia de `parent_post_id`, **no** participa del cálculo de la raíz: es puramente de visualización, para mostrar "En respuesta a X" con el autor inmediato cuando X es otra nota, no la raíz. La invariante de `parent_post_id` (siempre la raíz) sigue intacta — así se puede responder a una respuesta sin habilitar un árbol real ni tocar `can_attach_note`. Ver [ADR 0029](../adr/0029-respuestas-a-respuestas.md).

```sql
select exists (
  select 1 from public.posts target
  where target.id = p_reply_to_id
    and target.status = 'published'
    and target.type = 'note'
    and target.parent_post_id = p_parent_id
);
```

`can_reply_to_note` exige que la nota referenciada esté publicada y sea del **mismo hilo** (mismo `parent_post_id`) que la nota nueva — evita mezclar `reply_to_post_id` de un hilo con la raíz de otro.

### 4. Políticas de `posts` y `post_tags`

| Tabla / acción | Regla vigente | De dónde sale |
| :--- | :--- | :--- |
| `posts` INSERT | `author_id = auth.uid()` **y** (`type = 'note'` **o** `status = 'draft'`) **y** (sin padre **o** `can_attach_note(padre)`) **y** (sin `reply_to_post_id` **o** `can_reply_to_note(reply_to_post_id, padre)`) | `0005` (padre), `0007` (la condición `note`/`draft`) y `0013` (`reply_to_post_id`) |
| `posts` UPDATE | `author_id = auth.uid()` (sin filtro de tipo) | `0006` |
| `post_tags` INSERT | Solo sobre artículos propios | `0005` |

Aclaraciones: la condición `type = 'note' or status = 'draft'` impide crear de una vez un **artículo ya publicado** (que se saltaría la moderación). Y `0006` es lo que **permite editar notas**: `0005` había dejado el UPDATE solo para artículos ("las notas son inmutables") y `0006` lo revirtió. **El motivo de producto no quedó registrado** ([ADR 0015](../adr/0015-notas-editables.md)) †. Sigue protegido el tipo y el estado: el cliente solo puede escribir `title` y `content` (privilegios por columna, [ADR 0012](../adr/0012-integridad-de-escritura-de-posts.md)) y los `CHECK` de la nota impiden ponerle título.

### 5. La tabla `likes` (`0005`, parte 4)

`(id, user_id → profiles, post_id → posts, created_at)` con `UNIQUE (user_id, post_id)` e índice en `post_id`. Políticas: **SELECT** público; **INSERT** solo el propio usuario y solo sobre posts **publicados** (la clave foránea ignora RLS y permitiría dar me gusta a borradores); **DELETE** solo los propios.

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **Una sola tabla `posts` con `type`** ([ADR 0009](../adr/0009-tipos-de-post-y-likes.md)) | Tablas `notes` y `articles` separadas | Notas y artículos comparten autor, feed y me gusta sin duplicar lógica. Costo: columnas en `NULL` según el tipo (`title`) |
| **Reglas en la base (`CHECK` + RLS)** ([ADR 0003](../adr/0003-seguridad-rls-y-proxy-minimo.md)) | Validar solo en las Server Actions | Una llamada directa con la clave pública no puede saltarse las reglas |
| **`can_attach_note` como `SECURITY DEFINER`** | Una política que consulte `posts` desde `posts` | Evita el error `42P17`. Riesgo: una función `SECURITY DEFINER` mal escrita es un hueco, por eso fija `search_path` vacío |
| **`parent_post_id` siempre apunta a la raíz; sin árbol real** (lo hace cumplir `can_attach_note`) | Comentarios en árbol (`parent_post_id` a cualquier nivel) | Cuenta y lista de notas de un post siguen siendo una sola consulta plana, sin CTE recursiva. `reply_to_post_id` (`0013`, [ADR 0029](../adr/0029-respuestas-a-respuestas.md)) permite responder a una respuesta sin romper esto: es solo de visualización, no cambia la raíz |
| **`ON DELETE SET NULL` en `parent_post_id`** | `CASCADE` (borrar respuestas con el padre) | Las respuestas sobreviven como notas independientes |
| **`posts_note_length_check` como `NOT VALID`** (comentario en la migración) | Validar todas las filas | Las notas convertidas pueden superar 500; el límite aplica a las nuevas |
| **Notas editables (`0006`)** ([ADR 0015](../adr/0015-notas-editables.md)) | Notas inmutables | Motivo de producto no registrado †. No hay historial de ediciones |
| **`likes` solo sobre posts publicados** | Permitirlo sobre cualquier post | Evita dar me gusta a borradores ajenos |

## Criterios de aceptación

- [ ] Un `INSERT` directo de una nota con título es rechazado por `posts_note_shape_check`.
- [ ] Una nota con más de 500 caracteres nueva es rechazada; con 0 caracteres también.
- [ ] Un artículo con `parent_post_id` es rechazado.
- [ ] No se puede dejar una nota con `parent_post_id` apuntando a un borrador ni a otra respuesta (siempre debe ser la raíz).
- [ ] Se puede responder a una respuesta: la nota nueva queda con `parent_post_id` = raíz y `reply_to_post_id` = la respuesta referenciada.
- [ ] No se puede insertar `reply_to_post_id` apuntando a una nota de otro hilo (`parent_post_id` distinto) ni a una no publicada.
- [ ] No se puede insertar un artículo con `status = 'published'`.
- [ ] Borrar un post con respuestas no borra las respuestas y su `parent_post_id` pasa a `NULL`.
- [ ] Un autor puede actualizar `content` de su nota y no puede cambiar `type` ni `status` (`pnpm verify:writes`).
- [ ] No se puede dar me gusta a un borrador.

## Cómo verificarla a mano

1. Leé `0005` en el SQL Editor de Supabase y corré, con cuidado y en un entorno de prueba, `select conname from pg_constraint where conrelid = 'public.posts'::regclass;` para ver las restricciones.
2. Con `pnpm seed:dev` (usuarios y posts de prueba) y `pnpm verify:writes`, comprobá que las reglas de escritura responden como se espera.
3. Desde la app: creá una nota sobre un post (debe aparecer bajo él) y respondé a esa nota (botón "Responder"): la respuesta debe aparecer en la misma lista de notas del post raíz, mostrando "En respuesta a [autor de la nota]".
4. Borrá un post con respuestas (desde el SQL Editor con datos de prueba) y comprobá que las respuestas siguen ahí.

**Atención:** `0005`, `0006` y `0007` se re-ejecutan **solo como cadena completa y en orden**. Correr `0005` sola después de `0007` recrea la política de INSERT sin la condición `note`/`draft` y la de UPDATE solo para artículos: reabre la publicación sin moderación y rompe la edición de notas (ver [docs/db/README.md](../db/README.md)).

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Hacer `0005` segura de re-ejecutar sola (que no recree políticas obsoletas) o consolidar `0005`–`0007` en una migración final coherente | A |
| Validar `posts_note_length_check` (`VALIDATE CONSTRAINT`) después de revisar las notas convertidas que pasan de 500 caracteres | M |
| `src/lib/supabase/database.types.ts` no incluye `can_attach_note` ni `ai_rate_limits`: agregarlos ([ADR 0016](../adr/0016-migraciones-sql-manuales.md)) | B |
| Agregar un marcador de "editada" a las notas (hoy no hay versiones ni marca) | M |
| Escribir pruebas SQL/`verify:writes` para `can_attach_note` (`parent_post_id` a una respuesta, a un borrador, a post propio) y para `can_reply_to_note` (`reply_to_post_id` de otro hilo, a una nota no publicada) | M |

## Preguntas de autoevaluación

1. ¿Por qué las reglas de una nota se ponen en la base y no solo en la Server Action?
2. ¿Qué error da una política de `posts` que consulta `posts` y cómo lo resuelve `can_attach_note`?
3. ¿Qué garantiza `type = 'note' or status = 'draft'` en el INSERT? ¿Qué ataque evita?
4. ¿Qué pasa con las respuestas si se borra el post padre y por qué se eligió eso?
5. ¿Qué significa `NOT VALID` y por qué se usó en `posts_note_length_check`?
6. ¿Por qué no se puede volver a correr solo `0005` después de `0007`?
