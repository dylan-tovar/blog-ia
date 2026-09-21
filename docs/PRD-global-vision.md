# PRD global — Generador de Contenido Personalizado con IA

*Stack: Next.js (full-stack) + Supabase.*

| Campo | Valor |
| :--- | :--- |
| Estado | Vigente. Describe el producto tal como está construido |
| Alcance | Todo el producto. Cada feature tiene su PRD en [`prds/`](prds/README.md) |
| ADRs relacionados | [0001](adr/0001-monolito-nextjs-sin-capas.md), [0002](adr/0002-un-solo-tipo-de-usuario.md), [0003](adr/0003-seguridad-rls-y-proxy-minimo.md), [0006](adr/0006-organizacion-por-dominio.md), [0011](adr/0011-ia-con-gemini.md) |
| Código | `src/`, `supabase/migrations/` |

## Resumen

`blog-ia` es una plataforma de publicación. Cualquier persona registrada puede leer, seguir autores y publicar **notas** (texto corto) y **artículos** (markdown). La IA (Gemini) asiste al autor mientras escribe (chat en el editor) y al publicar (moderación y etiquetas automáticas), y resume artículos largos para el lector. Las recomendaciones **no** usan IA: son un ranking determinista por tags.

Todo el diseño obedece a una regla: **cada pieza de complejidad debe pagar su costo con un problema real del proyecto** (sección 0). Las secciones 15 y 16 registran qué se cortó, qué se construyó igual más tarde y por qué cambió cada decisión.

---

## 0. Principio guía: KISS (Keep It Simple, Stupid)

> Cada pieza de complejidad (una librería, una capa extra, un patrón de arquitectura) debe pagar su costo con un problema real que el proyecto vaya a enfrentar dentro de su alcance. Si el problema no existe en este contexto (tráfico alto, varios equipos en paralelo, necesidad de escalar a microservicios), la solución tampoco debería existir todavía. Complejidad "por si acaso" o "porque así se ve profesional" es deuda técnica desde el día uno.

**Cómo se aplica en la práctica:** una decisión KISS no es "hacer lo mínimo", es "no anticipar problemas que no existen". Cuando el problema apareció de verdad (por ejemplo, el abuso de la cuota de IA), la complejidad se construyó, en su versión más simple posible. Por eso la sección 15 tiene una columna "Estado hoy".

---

## 1. Qué es el producto

| Pieza | Descripción |
| :--- | :--- |
| Publicación | **Notas** (hasta 500 caracteres, se publican al instante) y **artículos** (editor markdown, borrador, moderación al publicar) |
| Descubrimiento | Feed cronológico en `/`, página `/explore` con filtro por tag, sección "Recomendados para ti" |
| Social | Seguir autores, me gusta, notas como respuesta a otro post, perfil público con pestañas |
| IA para el autor | Chat lateral en el editor que propone ediciones aplicables ([PRD-8](prds/PRD-8-ai-chat.md)); moderación y auto-tagging al publicar ([PRD-5](prds/PRD-5-ai-author.md)) |
| IA para el lector | Resumen bajo demanda de artículos largos ([PRD-6](prds/PRD-6-ai-reader.md)) |

Un motor de recomendación determinista personaliza el feed sin depender de IA generativa ([PRD-4](prds/PRD-4-recommendations.md)).

---

## 2. Usuarios: sin distinción de roles

Existe un solo tipo de usuario. Cualquier cuenta autenticada puede leer, seguir a otros y publicar. No hay dos flujos ni dos tipos de cuenta.

> **KISS aplicado:** no se elige "ser autor" o "ser lector" al registrarse. Separar los roles obligaría a resolver problemas que no aportan a lo que el proyecto quiere demostrar (las funciones de IA): flujos de conversión, decidir si un autor puede suscribirse a otros, dos onboardings distintos.

"Autor" es un **estado derivado de los datos** (tiene posts publicados), no un rol guardado. Ver [ADR 0002](adr/0002-un-solo-tipo-de-usuario.md).

---

## 3. Arquitectura: monolito Next.js, sin capas artificiales

Next.js (App Router, React 19) + Supabase (Postgres, Auth, RLS). Sin backend separado. Las lecturas ocurren en Server Components, las escrituras en Server Actions que validan con Zod y llaman directo a Supabase. Solo las funciones de IA del editor usan Route Handlers (`src/app/api/ai/*`), porque necesitan streaming y no deben bloquear el autoguardado (ver [`architecture/overview.md`](architecture/overview.md)).

> **KISS aplicado:** se descarta la cadena "Controller → Service → Repository". En este tamaño, una Server Action que valida y llama a Supabase es suficiente; tres capas que se pasan un objeto sin lógica intermedia agregan archivos, no mantenibilidad. Ver [ADR 0001](adr/0001-monolito-nextjs-sin-capas.md).

---

## 4. Stack tecnológico

| Capa | Tecnología | Rol |
| :--- | :--- | :--- |
| Full-stack | Next.js 16 (App Router) + React 19 + TypeScript | UI, Server Components, Server Actions, Route Handlers |
| Estilos y UI | Tailwind CSS v4 + shadcn/ui (base `@base-ui/react`) | UI mobile-first, tema solo oscuro ([ADR 0005](adr/0005-shadcn-ui-como-primitivas.md), [ADR 0008](adr/0008-tema-oscuro-y-shell-de-aplicacion.md)) |
| Editor | Tiptap 3 con extensión Markdown | Editor de artículos; el markdown es la fuente de verdad ([ADR 0010](adr/0010-editor-markdown.md)) |
| Base de datos | Supabase (PostgreSQL) | Persistencia relacional |
| Autenticación | Supabase Auth (`@supabase/ssr`) | Registro/login por email o username, sesión por cookies |
| Seguridad de datos | Supabase RLS + privilegios por columna | Reglas de acceso a nivel de fila y de columna ([ADR 0003](adr/0003-seguridad-rls-y-proxy-minimo.md), [ADR 0012](adr/0012-integridad-de-escritura-de-posts.md)) |
| Validación | Zod 4 | Inputs y respuestas de la IA |
| IA | Google Gemini (`@google/genai`), modelo por defecto `gemini-3.5-flash-lite` | Chat del editor, moderación, resumen ([ADR 0011](adr/0011-ia-con-gemini.md)) |
| Pruebas | Vitest (unitarias) + Playwright (e2e) | Ver [`guides/testing.md`](guides/testing.md) |

> **Cambio respecto a la versión original:** el PRD original decía "API externa (OpenAI/Anthropic)". Se eligió Gemini Flash; el motivo de la elección del proveedor no quedó registrado y los límites del nivel gratuito no están publicados con cifras ([ADR 0011](adr/0011-ia-con-gemini.md)). Lo que sí consta en el código es que el límite por minuto gobierna el diseño (sección 10). Ver [ADR 0011](adr/0011-ia-con-gemini.md).

---

## 5. Funcionalidades core (sin IA)

### 5.1 Plataforma de publicación con seguimiento

* Cualquier usuario autenticado publica notas y artículos ([PRD-2](prds/PRD-2-posts.md), [PRD-7](prds/PRD-7-notes-likes.md)).
* Se sigue a autores ([PRD-3](prds/PRD-3-feed-follows.md)). Seguir **no** filtra el feed: el feed es global y cronológico.
* El feed puede filtrarse por tag (`/?tag=x`), y `/explore` ofrece la fila de tags como interfaz ([PRD-9](prds/PRD-9-explore-activity.md)). Los tags no se muestran en las tarjetas del feed ni en el post.
* Me gusta en cualquier post ([PRD-7](prds/PRD-7-notes-likes.md)).

### 5.2 Motor de recomendaciones por scoring de tags (sin IA)

Se compara la relevancia de cada artículo candidato contra los tags de lo que el usuario ya leyó (`reading_history`). A más tags en común, más arriba. Detalle en [PRD-4](prds/PRD-4-recommendations.md).

> **Por qué NO usar IA generativa aquí:** es un problema de similitud/ranking, no de generación de texto.
> * **Más rápido:** una consulta acotada, sin llamada a API externa.
> * **Más barato:** cero tokens por cada carga de feed.
> * **Más confiable:** el match de tags es 100 % explicable; un LLM podría inventar relaciones inexistentes.
> * **Problema resuelto:** es el caso estándar de recomendación por atributos.

---

## 6. Funcionalidades de IA — Autor

| Momento | Qué hace hoy | PRD |
| :--- | :--- | :--- |
| Mientras escribe | **Chat de IA** en un panel lateral del editor (Cmd/Ctrl+I). Responde preguntas, analiza el texto y **propone ediciones** que el autor aplica, descarta o deshace | [PRD-8](prds/PRD-8-ai-chat.md) |
| Mientras escribe | Acciones rápidas del chat: estructura (outline), títulos, cambio de tono y análisis. Reemplazan a los botones y diálogos separados del diseño original | [PRD-5](prds/PRD-5-ai-author.md), [PRD-8](prds/PRD-8-ai-chat.md) |
| Al publicar | Moderación + auto-tagging: `{ is_appropriate, reason, suggested_tags }` | [PRD-5](prds/PRD-5-ai-author.md) |

> **KISS aplicado a la moderación:** es una sola llamada síncrona al publicar (el autor espera unos segundos con un estado de carga). Se descartó hacerla asíncrona con colas: resolver esto con eventos sería anticipar un problema de escala que el proyecto no tiene.

---

## 7. Funcionalidad de IA — Lector

Botón "resumen" en artículos de al menos 300 palabras. El resumen se genera una vez, se guarda en el post y cualquiera puede leerlo después sin costo. Generarlo requiere sesión. Detalle en [PRD-6](prds/PRD-6-ai-reader.md).

---

## 8. Modelo de datos (Supabase / PostgreSQL)

Fuente de verdad: [`db/schema.md`](db/schema.md) (derivado de las migraciones). Resumen:

| Tabla | Campos relevantes | Notas |
| :--- | :--- | :--- |
| `profiles` | `id` (= `auth.users.id`), `display_name`, `username` (único), `avatar_url`, `created_at` | Un solo tipo de usuario. `avatar_url` existe pero no hay subida de imagen |
| `posts` | `id`, `author_id`, `type` (`note` \| `article`), `title`, `content`, `status`, `rejection_reason`, `parent_post_id`, `created_at`, `updated_at`, `published_at`, `ai_generated_summary`, `ai_generated_titles`, `content_score` | `status`: `draft` / `pending_review` / `published` / `rejected`. Las notas son siempre `published`. Las columnas `ai_*` y `content_score` son caché que solo escribe el servidor |
| `tags` | `id`, `name` (único) | Catálogo de temas |
| `post_tags` | `post_id`, `tag_id` | Many-to-many; solo artículos llevan tags |
| `subscriptions` | `id`, `follower_id`, `author_id` | Único por par; `CHECK` impide seguirse a sí mismo |
| `reading_history` | `id`, `user_id`, `post_id`, `read_at` | Único por par; base de las recomendaciones |
| `likes` | `id`, `user_id`, `post_id`, `created_at` | Único por par; solo sobre posts publicados |
| `ai_rate_limits` | `key`, `window_start`, `count` | Infraestructura del límite por minuto de IA; sin acceso desde el cliente |

> **Por qué `tags` como tabla propia:** permite JOINs eficientes para el scoring y evita duplicar strings por post. No es complejidad extra: es el modelo relacional correcto. KISS no significa evitar normalizar cuando corresponde.

> **Por qué una sola tabla `posts` para notas y artículos:** comparten autor, likes y feed. Dos tablas duplicarían esa lógica. Ver [ADR 0009](adr/0009-tipos-de-post-y-likes.md).

---

## 9. Seguridad: RLS primero, más privilegios por columna

La protección de acceso vive en RLS: "dueño del recurso vs. no dueño". No existen roles. `proxy.ts` (Next.js 16, reemplaza a `middleware`) refresca la sesión en cada request y solo redirige a `/login` en las rutas privadas que empiezan con `/settings`, `/editor` o `/posts`; eso es UX, no seguridad.

Dos endurecimientos posteriores al diseño original, ambos por problemas reales:

| Endurecimiento | Problema que resuelve | Dónde |
| :--- | :--- | :--- |
| Privilegios por columna sobre `posts` | Con la anon key pública, un autor podía hacer `update posts set status = 'published'` y saltarse la moderación. Ahora el cliente solo escribe `title` y `content`; `status`, `published_at`, `rejection_reason` y las columnas `ai_*` las escribe solo el servidor | Migración `0007`, [ADR 0012](adr/0012-integridad-de-escritura-de-posts.md) |
| Login por username resuelto en el servidor | `profiles` es pública: guardar el email ahí lo expondría. Una función SQL solo ejecutable por `service_role` resuelve username → email | Migración `0004`, [ADR 0007](adr/0007-login-por-username-con-secret-key.md) |

> **Qué se mantiene del recorte original:** no hay una segunda capa de verificación de rol en la aplicación. RLS ya rechaza el acceso aunque alguien llame directo a la API de Supabase.

---

## 10. Rate limiting de IA

**Estado hoy: existe, en Postgres, con dos carriles.** El PRD original lo había cortado; ver la explicación en la sección 15.

| Carril | Claves | Límite por defecto | Para qué |
| :--- | :--- | :--- | :--- |
| Asistencia (chat, resumen) | `user:<id>` y `global` | 5 por usuario y 6 globales por minuto | Proteger la cuota gratuita del proveedor |
| Moderación | `moderation:user:<id>` y `moderation:global` | Mismo límite por usuario, 4 globales por minuto | Que la asistencia nunca deje sin cupo a la publicación |

* Ventana fija de 1 minuto, contador en la tabla `ai_rate_limits` mediante la función `ai_rate_limit_hit` (solo `service_role`). Se cuenta primero al usuario: si ya se pasó, se rechaza **sin** tocar el contador global.
* Los límites se ajustan con `AI_RATE_LIMIT_USER_PER_MIN`, `AI_RATE_LIMIT_GLOBAL_PER_MIN` y `AI_RATE_LIMIT_MODERATION_GLOBAL_PER_MIN`.
* **Falla cerrado:** si el limitador no responde, no se llama al modelo.
* Un acierto de caché (por ejemplo, un resumen ya generado) no consume cupo.

Ver [ADR 0011](adr/0011-ia-con-gemini.md).

---

## 11. Arquitectura de carpetas (por dominio)

```text
src/
├── app/
│   ├── (auth)/                 # login, register
│   ├── (public)/               # / (feed), explore, post/[id], author/[id]
│   ├── (dashboard)/            # posts, settings, profile, activity
│   ├── (editor)/               # editor/[id] (pantalla completa, sin AppShell)
│   └── api/ai/                 # chat (stream NDJSON), outline, titles, score, tone
│
├── components/
│   ├── ui/                     # primitivas shadcn/ui (+ bubble, marker, message; origen no verificado, ver ADR 0005)
│   └── shared/                 # AppShell, MainNav, BottomNav, AccountDrawer, UserAvatar...
│
├── features/                   # un dominio por carpeta (ver ADR 0006)
│   ├── ai/  auth/  likes/  posts/  profile/  recommendations/  subscriptions/
│
├── hooks/                      # use-is-desktop, use-visual-viewport-style
├── lib/                        # env, auth, viewer, format, supabase/{client,server,admin}
└── proxy.ts                    # refresco de sesión + redirección de rutas privadas
```

> **KISS aplicado:** se agrupa por dominio porque ayuda a navegar el código, y se empieza plano dentro de cada feature; se crean subcarpetas (`components/`) solo cuando el número de archivos lo pide. Ver [ADR 0006](adr/0006-organizacion-por-dominio.md).

---

## 12. Validación de datos

Zod donde el costo de un dato malformado es alto: formularios críticos y, sobre todo, **las respuestas de la IA** (JSON de moderación, acciones del chat, análisis) antes de guardarlas o mostrarlas, porque un modelo puede devolver un formato inesperado. No se valida todo con schemas exhaustivos.

---

## 13. Manejo de errores

* `src/app/error.tsx` es el boundary único de la app ("Algo salió mal" + "Reintentar"); no hay `error.tsx` por sección.
* **Si la IA falla al publicar**, el artículo se publica igual **sin tags automáticos**. No hay marca de "revisión manual" (el diseño original la mencionaba; no se implementó). Cada fallo de IA tiene un tipo (`AiErrorKind`) y un mensaje en español.
* Dos fallos **no** publican: un bloqueo de seguridad del proveedor (`rejected`, con motivo genérico) y un límite de peticiones (el artículo queda sin publicar y se muestra "reintentá en N s").

> **Por qué el límite no "falla abierto":** un atacante puede provocarlo a propósito agotando la cuota; si eso publicara sin revisión, cualquiera se saltaría la moderación. Un corte del proveedor, en cambio, no lo controla nadie, y no debe impedir publicar.

---

## 14. Caché de resultados de IA

Los resultados (resumen, títulos, score) se guardan en la fila del post. La invalidación la hace un **trigger de base de datos**: si cambia `content`, anula las tres columnas de caché y sube `updated_at`. Vive en la base para cubrir a cualquier escritor, no solo a las Server Actions. Las escrituras de caché usan compare-and-set sobre `updated_at`, de modo que un resultado generado sobre texto viejo nunca pisa uno nuevo.

> **Por qué esto sí se mantiene:** ahorra cuota de API con casi cero código adicional, y el trigger evita depender de que cada camino de escritura recuerde invalidar.

---

## 15. Qué se cortó, qué se reincorporó y por qué

| Decisión original | Estado hoy | Por qué |
| :--- | :--- | :--- |
| Separación Controller/Service/Repository | **Cortada, se mantiene** | Sin lógica intermedia real; las Server Actions directas alcanzan ([ADR 0001](adr/0001-monolito-nextjs-sin-capas.md)) |
| Middleware de verificación de rol además de RLS | **Cortada, se mantiene** | RLS es la defensa real; duplicarla no agrega seguridad |
| Distinción de roles autor/lector | **Cortada, se mantiene** | Un solo tipo de usuario evita flujos de conversión ([ADR 0002](adr/0002-un-solo-tipo-de-usuario.md)) |
| Moderación asíncrona con colas | **Cortada, se mantiene** | Una llamada síncrona con estado de carga resuelve lo mismo |
| Subcarpetas rígidas dentro de cada feature | **Cortada, se mantiene** | Se subdivide solo cuando el tamaño lo pide |
| **Rate limiting con Redis/Upstash** | **Cortada la infraestructura, pero se construyó una versión mínima en Postgres** | La suposición "no habrá abuso" no se sostuvo: la moderación al publicar depende de una llamada externa con cuota y, sin límite, se podía agotar a propósito para publicar sin moderar (razonamiento registrado en el código de `publishPost`; que la cuota del nivel gratuito sea pequeña es †, no hay cifras publicadas). Se resolvió sin infraestructura nueva: una tabla y una función SQL |
| **Tabla `ai_usage_log` con ventanas de tiempo** | **Sustituida** por `ai_rate_limits` (contador por clave y minuto) | Mismo problema, la versión mínima que alcanza: no se guarda historial de uso, solo contadores que se limpian solos |
| **Caché comparando `updated_at` a mano** | **Reemplazada** por un trigger | Un trigger cubre cualquier escritor y no depende de la disciplina de cada Server Action |
| **"Solo RLS" para la seguridad de `posts`** | **Ampliada** con privilegios por columna | RLS decide *qué filas*, no *qué columnas*: un autor podía cambiar su propio `status` |
| **Funciones de IA como botones y diálogos separados** (outline, títulos, tono, score) | **Reemplazadas** por el chat del editor | Un panel conversacional evita abrir modales encima del texto y permite aplicar cambios sobre el propio documento ([PRD-8](prds/PRD-8-ai-chat.md)). El código antiguo sigue en el repositorio sin ninguna pantalla que lo use ([ADR 0019](adr/0019-rutas-legacy-de-ia-deprecadas.md)) |

---

## 16. Limitaciones conocidas del producto

Las que afectan a más de un PRD; el detalle de cada una está en la sección "Limitaciones conocidas" del PRD correspondiente.

| Limitación | Dónde se explica |
| :--- | :--- |
| Un artículo ya publicado se puede editar y **no se vuelve a moderar** | [PRD-2](prds/PRD-2-posts.md) |
| No hay borrado de artículos desde la interfaz (solo de notas) | [PRD-2](prds/PRD-2-posts.md), [PRD-7](prds/PRD-7-notes-likes.md) |
| No hay subida de avatar ni de imágenes en el editor | [PRD-1](prds/PRD-1-auth.md), [PRD-2](prds/PRD-2-posts.md) |
| `/activity` es un estado vacío estático; no hay notificaciones | [PRD-9](prds/PRD-9-explore-activity.md) |
| Varias opciones del menú "más opciones" de un post son botones sin efecto (guardar, ocultar, silenciar, bloquear, reportar) | [PRD-9](prds/PRD-9-explore-activity.md), [PRD-7](prds/PRD-7-notes-likes.md) |
| La pestaña "Subscriptions" del perfil siempre está vacía | [PRD-3](prds/PRD-3-feed-follows.md) |
| Los tests e2e de posts y del shell no se actualizaron a los flujos actuales | [PRD-2](prds/PRD-2-posts.md), [`guides/testing.md`](guides/testing.md) |
| No hay integración continua: la calidad se verifica a mano | [ADR 0018](adr/0018-sin-ci-gates-manuales.md) |
