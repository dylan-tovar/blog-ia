# Architecture Decision Records (ADR)

Un ADR registra una decisión de arquitectura: qué se decidió, por qué y qué se descartó. Sirve para no rediscutir lo ya resuelto y para saber cuándo una decisión deja de aplicar. Para entender **por qué el proyecto está hecho así**, este es el lugar; para el **qué** y el **cómo**, ver [arquitectura](../architecture/overview.md) y los [PRDs](../prds/README.md).

## Convenciones

| Aspecto | Regla |
| :--- | :--- |
| Nombre de archivo | `NNNN-kebab-title.md` (4 dígitos, correlativo) |
| Plantilla | [`0000-template.md`](0000-template.md) |
| Estados | `Propuesta`, `Aceptada`, `Reemplazada por NNNN`, `Reemplazada parcialmente por NNNN` |
| Decisiones nuevas | Un ADR aceptado no se reescribe: se crea uno nuevo que lo reemplaza y se marca el anterior como `Reemplazada` (o `Reemplazada parcialmente` si solo cambia una cláusula) |
| Actualizaciones factuales | Cuando el código cambió pero la decisión sigue, se agrega al final del ADR una sección `## Actualización (AAAA-MM-DD)` que apunta al estado actual, sin tocar el texto original |
| ADRs escritos a posteriori | Los ADR 0013 a 0021 se redactaron después de implementar. Llevan un `†` en las alternativas cuyo motivo es una reconstrucción a partir del código y no una discusión registrada, y dicen "el motivo no quedó registrado" cuando es así |
| Procedencia de los motivos | `†` junto a una alternativa o razón significa **reconstruida** a partir del código, no registrada. "Motivo no registrado" significa que se sabe qué se decidió pero no por qué. Sin marca, el motivo consta en el código, en la base o en otro ADR. La misma convención rige en los [PRDs](../prds/README.md#convención-de-procedencia) |
| Extensión | Enfocado en una decisión. El detalle largo vive en los PRDs y en el código; los ADRs de IA superan las 40 líneas de la regla original porque deben dejar por escrito alternativas y consecuencias |

## Índice

| ADR | Decisión | Estado |
| :--- | :--- | :--- |
| [0001](0001-monolito-nextjs-sin-capas.md) | Monolito Next.js con Server Actions directas, sin capas Controller/Service/Repository | Aceptada |
| [0002](0002-un-solo-tipo-de-usuario.md) | Un solo tipo de usuario, autor como estado derivado | Aceptada |
| [0003](0003-seguridad-rls-y-proxy-minimo.md) | Seguridad solo con RLS y `proxy.ts` mínimo | Aceptada |
| [0004](0004-recomendaciones-scoring-determinista.md) | Recomendaciones por scoring determinista de tags | Aceptada (implementada) |
| [0005](0005-shadcn-ui-como-primitivas.md) | shadcn/ui como primitivas en `components/ui` | Aceptada |
| [0006](0006-organizacion-por-dominio.md) | Organización por dominio en `src/features` | Aceptada |
| [0007](0007-login-por-username-con-secret-key.md) | Login por username resuelto en el servidor con la secret key | Aceptada |
| [0008](0008-tema-oscuro-y-shell-de-aplicacion.md) | Tema solo oscuro con azul y shell de aplicación mobile-first | Aceptada |
| [0009](0009-tipos-de-post-y-likes.md) | Tipos de post (nota y artículo) en una sola tabla, con las reglas en la base | Aceptada; reemplazada parcialmente por 0015 |
| [0010](0010-editor-markdown.md) | Editor de artículos con Tiptap y markdown como fuente de verdad | Aceptada |
| [0011](0011-ia-con-gemini.md) | IA con Gemini Flash: salida validada, Route Handlers y límite por minuto en Postgres | Aceptada; reemplazada parcialmente por 0013 |
| [0012](0012-integridad-de-escritura-de-posts.md) | Integridad de escritura de `posts` con privilegios por columna | Aceptada |
| [0013](0013-chat-ia-protocolo-ndjson-y-function-calling.md) | Chat de IA del editor: stream NDJSON y function calling | Aceptada |
| [0014](0014-aplicacion-de-ediciones-en-el-cliente-con-fingerprints.md) | Las ediciones de la IA se aplican en el cliente, localizadas por fingerprint de bloque | Aceptada |
| [0015](0015-notas-editables.md) | Las notas son editables por su autor | Aceptada |
| [0016](0016-migraciones-sql-manuales.md) | Migraciones SQL manuales, sin Supabase CLI y con tipos escritos a mano | Aceptada |
| [0017](0017-politica-de-thinking-y-reintentos-gemini.md) | Thinking mínimo, sin reintentos del SDK y timeouts por función | Aceptada |
| [0018](0018-sin-ci-gates-manuales.md) | Sin CI ni hooks: verificaciones a mano | Aceptada |
| [0019](0019-rutas-legacy-de-ia-deprecadas.md) | Herramientas de IA legacy (outline, títulos, tono, score) deprecadas | Propuesta |
| [0020](0020-tags-como-metadato-interno.md) | Los tags son metadato interno; solo Explorar los muestra | Aceptada (motivo no registrado); reemplazada parcialmente por 0025 |
| [0021](0021-feed-en-raiz-y-global.md) | El feed es `/` y es global | Aceptada (motivo parcialmente no registrado) |
| [0022](0022-imagenes-en-supabase-storage.md) | Imágenes de artículos en Supabase Storage, optimizadas en el navegador | Aceptada |
| [0023](0023-portada-de-articulos.md) | Portada de artículos (imagen o texto sobre color) en el feed | Aceptada |
| [0024](0024-perfil-en-onboarding.md) | El perfil se crea en `/onboarding`, no al registrarse | Aceptada; reemplazada parcialmente por 0025 |
| [0025](0025-intereses-en-onboarding.md) | El onboarding tiene un segundo paso obligatorio para elegir intereses | Aceptada |

## Cómo leerlos

| Para entender... | Leer |
| :--- | :--- |
| Por qué no hay capas ni backend aparte | 0001, 0003 |
| Cómo se protege la información | 0003, 0007, 0012 |
| Cómo se registra un usuario y se crea su perfil | 0003, 0007, 0024, 0025 |
| Por qué la IA funciona así | 0011, 0013, 0014, 0017, 0019 |
| Por qué el modelo de posts y notas es así | 0009, 0015, 0010, 0022, 0023 |
| Cómo se trabaja con la base y las pruebas | 0016, 0018 |
| Por qué la interfaz es así | 0005, 0008, 0020, 0021 |
