# Documentación de blog-ia

`blog-ia` es una plataforma de publicación asistida por IA, construida como monolito Next.js 16 (App Router) con Supabase (PostgreSQL, Auth, RLS), shadcn/ui y Gemini. Cualquier usuario autenticado puede leer, seguir y publicar (artículos y notas). La IA asiste al autor con un chat dentro del editor, modera al publicar y resume artículos para los lectores; las recomendaciones, en cambio, son un ranking determinista de tags, sin IA.

Esta documentación está escrita para que alguien que recibe el proyecto entienda **qué se construyó, cómo funciona y por qué se decidió así**.

## Recorrido de lectura (unos 10 minutos)

| # | Leer | Para qué |
| :--- | :--- | :--- |
| 1 | Esta página | Ubicarse: estado, mapa y glosario |
| 2 | [`PRD-global-vision.md`](PRD-global-vision.md) | Visión del producto y las decisiones de alcance (KISS) |
| 3 | [`architecture/overview.md`](architecture/overview.md) | Estructura, rutas, flujo de una petición y tabla "por qué está hecho así" |
| 4 | [`adr/README.md`](adr/README.md), sección "Cómo leerlos" | Qué decisiones existen y cuál leer según la duda |
| 5 | [`db/schema.md`](db/schema.md), matriz de RLS | Cómo se protegen los datos |
| 6 | [`ai/overview.md`](ai/overview.md) | La capa de IA de punta a punta |
| 7 | [`guides/getting-started.md`](guides/getting-started.md) | Levantar el proyecto |

## Mapa de la documentación

| Carpeta | Qué contiene | Cuándo leerla |
| :--- | :--- | :--- |
| [`PRD-global-vision.md`](PRD-global-vision.md) | Visión, alcance y decisiones KISS del producto | Antes de proponer cambios de alcance |
| [`prds/`](prds/README.md) | PRDs por feature (0 a 9) y sus paquetes de trabajo (`PRD-N.M`): objetivos, comportamiento, datos y criterios de aceptación | Al implementar o revisar una feature, o al asumir un paquete |
| [`team/`](team/reparto-de-tareas.md) | Reparto de los 35 paquetes entre las 12 personas del equipo: cargas, mentorías, olas, acuerdos y guía de presentación | Al incorporarte al equipo o al planificar quién hace qué |
| [`adr/`](adr/README.md) | Decisiones de arquitectura con alternativas y consecuencias (0001 a 0021) | Al cuestionar o cambiar una decisión |
| [`architecture/`](architecture/README.md) | Cómo funciona la app hoy: carpetas, rutas, flujos, auth, errores | Al incorporarse al código o agregar un módulo |
| [`ai/`](ai/overview.md) | La capa de IA: funciones, límites, protecciones y cómo agregar una | Al tocar cualquier cosa de IA |
| [`db/`](db/README.md) | Esquema, RLS, funciones y migraciones | Al tocar tablas, políticas o queries |
| [`guides/`](guides/README.md) | Puesta en marcha, testing y cómo agregar una feature | Al levantar el proyecto o escribir código y tests |

## Índice de PRDs

| PRD | Título |
| :--- | :--- |
| [PRD-global](PRD-global-vision.md) | Generador de Contenido Personalizado con IA (visión del producto) |
| [PRD-0](prds/PRD-0-design-system.md) | Sistema de diseño y fundación del proyecto |
| [PRD-1](prds/PRD-1-auth.md) | Autenticación, perfiles y modelo de datos base |
| [PRD-2](prds/PRD-2-posts.md) | Posts: artículos, editor y publicación |
| [PRD-3](prds/PRD-3-feed-follows.md) | Feed, seguimiento e historial de lectura |
| [PRD-4](prds/PRD-4-recommendations.md) | Motor de recomendaciones (scoring por tags, sin IA) |
| [PRD-5](prds/PRD-5-ai-author.md) | IA para el autor |
| [PRD-6](prds/PRD-6-ai-reader.md) | IA para el lector: resumen de artículos |
| [PRD-7](prds/PRD-7-notes-likes.md) | Tipos de post (notas y artículos) y me gusta |
| [PRD-8](prds/PRD-8-ai-chat.md) | Chat de IA del editor |
| [PRD-9](prds/PRD-9-explore-activity.md) | Explorar, Actividad y opciones de post |
| [PRD-10](prds/PRD-10-post-images-cover.md) | Imágenes de artículos y portada en el feed |

Cada PRD se parte en paquetes de trabajo (`PRD-1.1`, `PRD-1.2`…) con quien lo implementará; el listado y las convenciones de nombre están en [`prds/README.md`](prds/README.md#nombres-de-archivo-y-paquetes-de-trabajo) y el reparto del equipo en [`team/reparto-de-tareas.md`](team/reparto-de-tareas.md).

## Estado actual

Lo que existe en el código hoy. Las limitaciones y pendientes están en la [tabla de pendientes de la arquitectura](architecture/overview.md#pendiente-y-limitaciones-conocidas) y en cada PRD.

| Área | Estado | Dónde |
| :--- | :--- | :--- |
| Autenticación (registro, login por email o username, logout) | Implementado ([ADR 0007](adr/0007-login-por-username-con-secret-key.md)) | `src/features/auth/` |
| Protección de rutas privadas | Implementado: `proxy.ts` para `/settings`, `/editor` y `/posts`; `/profile` y `/activity` se protegen solas | `src/proxy.ts` |
| Perfil (nombre y username editables) y perfil público de autor | Implementado; email y teléfono de `/settings` son solo lectura; sin avatar | `src/features/profile/` |
| Interfaz: tema oscuro, barra superior e inferior, botón "+" | Implementado ([ADR 0008](adr/0008-tema-oscuro-y-shell-de-aplicacion.md)) | `src/components/shared/` |
| Artículos: editor Tiptap con markdown, autoguardado, tags, publicar con moderación de IA | Implementado ([ADR 0010](adr/0010-editor-markdown.md), [ADR 0011](adr/0011-ia-con-gemini.md)) | `src/features/posts/`, `src/app/(editor)/` |
| Notas (crear, editar, borrar, responder) y me gusta | Implementado ([ADR 0009](adr/0009-tipos-de-post-y-likes.md), [ADR 0015](adr/0015-notas-editables.md)) | `src/features/posts/`, `src/features/likes/` |
| Feed en `/` (global, cronológico, "Cargar más") y `/explore` con filtro por tag | Implementado ([ADR 0021](adr/0021-feed-en-raiz-y-global.md), [ADR 0020](adr/0020-tags-como-metadato-interno.md)) | `src/app/(public)/` |
| Seguir y dejar de seguir; lecturas (`reading_history`) | Implementado; seguir no cambia el feed | `src/features/subscriptions/` |
| Recomendaciones por tags | Implementado ([ADR 0004](adr/0004-recomendaciones-scoring-determinista.md)) | `src/features/recommendations/` |
| Chat de IA del editor (propuestas aplicables, análisis) | Implementado ([ADR 0013](adr/0013-chat-ia-protocolo-ndjson-y-function-calling.md), [ADR 0014](adr/0014-aplicacion-de-ediciones-en-el-cliente-con-fingerprints.md)) | `src/features/ai/`, `src/features/posts/components/editor/` |
| Imágenes en el editor (subir, arrastrar, pegar) y verlas en el lector | Implementado ([ADR 0022](adr/0022-imagenes-en-supabase-storage.md)) | `src/features/posts/images/` |
| Portada del artículo (imagen o texto sobre color) en las tarjetas del feed | Implementado con limitaciones: el texto de la portada no se modera ([ADR 0023](adr/0023-portada-de-articulos.md)) | `src/features/posts/cover/` |
| Moderación con auto-tagging al publicar | Implementado | `publishPost`, `src/features/ai/moderation.ts` |
| Resumen de IA para lectores | Implementado | `src/features/ai/summary-actions.ts` |
| Herramientas de IA "legacy" (outline, títulos, tono, score) | Código sin llamador; deprecadas ([ADR 0019](adr/0019-rutas-legacy-de-ia-deprecadas.md)) | `src/app/api/ai/{outline,titles,tone,score}` |
| Actividad (`/activity`) | Pantalla vacía; no hay notificaciones | `src/app/(dashboard)/activity/` |
| Búsqueda por texto | No existe | — |
| CI y e2e vigentes | Sin CI; los e2e tienen desfases ([ADR 0018](adr/0018-sin-ci-gates-manuales.md)) | `e2e/` |

## Glosario

| Término | Significado en este proyecto |
| :--- | :--- |
| **Artículo** | Post con título, contenido en markdown y tags. Nace como borrador, se publica pasando por moderación. Solo se edita desde computadora |
| **Nota** | Post corto (hasta 500 caracteres), sin título ni tags, publicado al instante. Puede dejarse sobre otro post (respuesta). Es editable |
| **Feed** | La lista cronológica de posts publicados en `/` |
| **Viewer** | El usuario actual (o `null`), cacheado por request (`getViewer()`) |
| **RLS** | Row Level Security de PostgreSQL: las políticas que deciden qué filas puede leer o escribir cada usuario |
| **Publishable key / secret key** | La clave pública del proyecto de Supabase (navegador) y la clave de servidor que **salta RLS** |
| **Proxy** | `src/proxy.ts`: el reemplazo de `middleware` en Next 16. Refresca la sesión y redirige rutas privadas |
| **Reclamo (claim)** | Al publicar, el artículo se marca `pending_review` con un compare-and-set para que dos peticiones no lo moderen a la vez |
| **Compare-and-set** | Actualizar solo si la fila sigue en el estado leído (`status` y `updated_at`); si no, otro escritor ganó |
| **Carril (lane)** | Un contador del límite de IA: `assist` para el chat y el resumen, `moderation` para publicar |
| **Moderación** | Revisión con Gemini al publicar: `{ is_appropriate, reason, suggested_tags }` |
| **Cajón (drawer)** | El panel lateral del chat de IA en el editor (`Cmd/Ctrl+I`) |
| **NDJSON** | Un objeto JSON por línea; el formato del stream del chat |
| **Bloque (`bN`)** | Nodo de primer nivel del documento del editor con id `b0`, `b1`…; lo que el modelo ve y señala |
| **Fingerprint** | Huella corta (FNV-1a) del contenido de un bloque; detecta si cambió desde que la IA lo vio |
| **Snapshot** | Foto del editor (título, bloques, selección) tomada al enviar un mensaje al chat |
| **Tarjeta de propuesta (action card)** | La propuesta de edición de la IA, con ubicación y antes/después, que el autor aplica, descarta o deshace |
| **Stale** | Estado de una propuesta cuyo contenido ya no coincide con el documento, así que no se puede aplicar |
| **Acción rápida** | Botón del cajón (Estructura, Títulos, Tono, Analizar) que envía un prompt ya escrito al chat |
| **Carga perezosa del borrador** | El artículo nuevo no crea su fila en la base hasta el primer guardado con contenido |

## Convenciones de esta documentación

- Español técnico neutro; los identificadores y comentarios de código, en inglés.
- Cada afirmación sobre el código se puede verificar en el archivo citado. Donde algo no pudo verificarse (por ejemplo, la configuración de un proyecto de Supabase que no está en el repositorio) el texto lo dice.
- Los ADR 0013 a 0021 se escribieron después de implementar; los motivos reconstruidos llevan `†`, y los que no quedaron registrados lo dicen ([convenciones de ADR](adr/README.md#convenciones)).
