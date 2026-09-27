# Límites de longitud por campo

Todos los inputs de la app tienen un límite en Next.js (Zod y/o `maxLength` en el JSX) y, para los que se persisten, debería haber un `CHECK` equivalente en la migración de Supabase. Esta tabla junta ambos niveles por campo para poder auditarlos de un vistazo. Cuando faltan, se marcan como gap.

## Auth

| Campo | Mín | Máx Next.js | Máx base de datos | Notas |
| :--- | :--- | :--- | :--- | :--- |
| `email` (registro, forgot-password, verify) | — | sin límite (`z.email()` solo valida formato) — `src/features/auth/schemas.ts` | gestionado por Supabase Auth (`auth.users`), fuera de las migraciones del repo | — |
| `identifier` (email o username, login) | 1 | **254** — `src/features/auth/schemas.ts:20` | sin límite propio (se resuelve a `username` o `email`) | Es el único campo de auth con `.max()` explícito |
| `password` (registro, reset, cambio) | **8** caracteres — `PASSWORD_MIN_LENGTH`, `src/features/auth/password-rules.ts:17` | **72 bytes** — `PASSWORD_MAX_LENGTH`, `password-rules.ts:21` | gestionado por Supabase Auth (bcrypt trunca a 72 bytes) | El mínimo cuenta caracteres (code points); el máximo cuenta **bytes** vía `TextEncoder` — un emoji puede gastar varios bytes. Sin `maxLength` en el input, solo validación JS |
| `confirmPassword` | — | hereda el límite de `password` por comparación de igualdad | N/A | — |
| **Cifrado de `password`** | — | — | — | No se hashea en este repo. Lo hace el servicio de Auth de Supabase (GoTrue) con **bcrypt** por defecto (soporta también argon2 y scrypt de Firebase solo para usuarios migrados), guardando el hash en `auth.users.encrypted_password`. El 72 de `PASSWORD_MAX_LENGTH` replica el límite propio de bcrypt (`MaxPasswordLength = 72` en el código de GoTrue) — no es arbitrario, evita que Supabase trunque silenciosamente contraseñas más largas. No hay forma de cambiar el algoritmo desde este proyecto sin dejar de usar Supabase Auth |
| `currentPassword` (cambio de contraseña) | 1 | sin máximo | N/A | Solo valida que no esté vacío |
| `token` (OTP) | 6 (exacto) | 6 (exacto, regex `^\d{6}$`) — `schemas.ts:44` | gestionado por Supabase Auth | UI: `OTP_LENGTH = 6`, `VerifyOtpForm.tsx:20,75` |

## Perfil

| Campo | Mín | Máx Next.js | Máx base de datos | Notas |
| :--- | :--- | :--- | :--- | :--- |
| `username` | 3 | **20** — regex `^[a-z0-9_]{3,20}$`, `src/features/profile/schemas.ts:31` | **20** — `check (username ~ '^[a-z0-9_]{3,20}$')`, `supabase/migrations/0004_username.sql:14-15` | Coinciden. Se normaliza `.trim().toLowerCase()` antes de validar; lista de reservados en `schemas.ts:7-25` |
| `displayName` | 1 | **50** — `DISPLAY_NAME_MAX_LENGTH`, `src/features/profile/constants.ts:1` | **200** — `check (char_length (display_name) <= 200) not valid`, `0020_field_length_checks.sql` | ⚠️ **Asimetría intencional, no es un gap**: es el nombre de una persona, no una frase larga (a diferencia de `title`), así que Next.js lo limita más estricto (50) que la DB (200). El `CHECK` de 200 se dejó como techo genérico al bajar el límite de producto, para no correr otra migración; no hace falta bajarlo |
| `avatar_url` | — | sin `.max()` explícito (se valida pertenencia de carpeta, no longitud) | **500** — `check (char_length (avatar_url) <= 500)`, `0016_profile_avatar.sql:62-71` | El límite real de tamaño de archivo lo impone el bucket: 2MB, solo `image/webp\|jpeg\|png` (`0016_profile_avatar.sql:9-16`) |
| bio de perfil | — | — | — | **No existe este campo hoy** — sin columna, schema ni componente |

## Posts (artículos y notas)

| Campo | Mín | Máx Next.js | Máx base de datos | Notas |
| :--- | :--- | :--- | :--- | :--- |
| `content` de nota | 1 | **500** — `NOTE_MAX_LENGTH`, `src/features/posts/constants.ts:1` | **500** — `check (type <> 'note' or char_length (content) between 1 and 500)`, `0005_post_types_and_likes.sql:53-57` | Coinciden. El `CHECK` es `NOT VALID` (notas legacy convertidas pueden superar 500; toda nota nueva sí lo respeta) |
| `title` de artículo | — (opcional) | **200** — `POST_TITLE_MAX_LENGTH`, `constants.ts:2` | **200** — `check (title is null or char_length (title) <= 200) not valid`, `0020_field_length_checks.sql` | `NOT VALID`: puede haber artículos existentes que superen el límite |
| `content`/body de artículo | — | **100.000** caracteres — `POST_CONTENT_MAX_LENGTH`, `constants.ts:3` | **100.000** — `check (type <> 'article' or char_length (content) <= 100000) not valid`, `0020_field_length_checks.sql` | `NOT VALID`, mismo motivo que `title`. Sin `maxLength` en UI: el body se edita con TipTap (`EditorContent`), no hay un input nativo donde poner el atributo — el límite se aplica en Zod al guardar |
| `cover_text` (portada) | 1 | **200** — `COVER_TEXT_MAX_LENGTH`, `src/features/posts/cover/cover-schema.ts:10` | **200** — `check (cover_text is null or char_length (cover_text) between 1 and 200)`, `0009_post_cover.sql:23-26` | Coinciden por diseño (comentario explícito en el schema: "keep in sync") |
| `cover_image_url` | — | **500** — `COVER_URL_MAX_LENGTH`, `cover-schema.ts:11` | **500** — `check (char_length (cover_image_url) <= 500)`, `0009_post_cover.sql:12-21` | Coinciden |
| tag de post (`tagName`) | 1 | **50** — `TAG_NAME_MAX_LENGTH`, `src/features/posts/constants.ts:4` | **50** — `check (char_length (name) <= 50) not valid`, `0020_field_length_checks.sql` | `NOT VALID`: puede haber tags existentes que superen el límite. Se normaliza `.trim().toLowerCase()`. Su propio tier — no se acerca a `title`/`displayName` porque es otro tipo de dato (slug corto, no texto libre) |
| intereses seleccionados (onboarding) | 0 | **20** ítems (cantidad, no longitud) — `INTERESTS_MAX`, `src/features/interests/constants.ts:2` | ⚠️ sin tope de cantidad (`user_interests` solo tiene PK compuesta) | **Gap** — es límite de cantidad de filas, no de texto |

## IA (chat del editor, no persistido)

Estos campos son de datos transitorios (van al modelo, no se guardan en tablas propias), por eso no tienen equivalente de base de datos.

| Campo | Mín | Máx | Notas |
| :--- | :--- | :--- | :--- |
| Mensaje del chat (schema de servidor) | 1 | **8.000** caracteres — `CHAT_MAX_MESSAGE_CHARS`, `src/features/ai/constants.ts:33` | — |
| Mensaje del chat (textarea de UI) | — | **4.000** caracteres — `CHAT_MAX_USER_CHARS`, `constants.ts:32`, `ChatComposer.tsx:45` | ⚠️ la UI es más restrictiva que el schema del servidor (4.000 vs 8.000) — asimétrico pero no riesgoso |
| Markdown de un bloque del artículo (contexto a IA) | — | **30.000** caracteres — `AI_MAX_INPUT_CHARS`, `constants.ts:10` | — |
| Conversación total del chat | — | **24.000** caracteres sumados / **20** mensajes — `CHAT_MAX_TOTAL_CHARS` / `CHAT_MAX_MESSAGES`, `constants.ts:34-35` | — |
| Selección de texto enviada a IA | — | **4.000** caracteres — `CHAT_SELECTION_MAX_CHARS`, `constants.ts:42` | — |
| Markdown de una propuesta de edición de IA | 1 | **12.000** caracteres — `EDIT_MAX_MARKDOWN_CHARS`, `constants.ts:45` | — |
| Etiqueta de una propuesta de edición | — | **120** caracteres — `EDIT_LABEL_MAX_CHARS`, `constants.ts:46` | — |
| Tag sugerido por IA | 2 | **30** caracteres — `AI_TAG_MIN_LENGTH` / `AI_TAG_MAX_LENGTH`, `constants.ts:21-22` | Mismo destino (`tags.name`) que el gap de arriba. Máximo 5 tags de IA por post (`MAX_AI_TAGS`), 8 en total (`MAX_TAGS_PER_POST`) |
| Razón de moderación (truncada, no ingresada por el usuario) | — | **300** caracteres — `REASON_MAX_LENGTH`, `constants.ts:28` | Se trunca, no se rechaza. Persistida en `posts.rejection_reason text` ⚠️ sin `CHECK` |
| Tema del outline (input del usuario) | 3 | **200** caracteres — `schemas.ts:93` | El `200` de `OutlineDialog.tsx:91` está hardcodeado en el JSX, no importa la constante — riesgo de drift si el schema cambia |

## Búsqueda

| Campo | Mín | Máx | Notas |
| :--- | :--- | :--- | :--- |
| Query de búsqueda (`q`) | 1 | **100** caracteres — `SEARCH_QUERY_MAX_LENGTH`, `src/features/discovery/constants.ts:4` | No se persiste (se usa en `ilike`) |

## Gaps conocidos (Next.js valida, falta el `CHECK` en SQL)

- Cantidad de intereses por usuario (20 en Next.js, sin tope en DB) — es un límite de **cantidad de filas** (`COUNT` sobre `user_interests`), no de longitud de texto, así que no se cierra con un `CHECK` simple como los de arriba; requeriría un trigger. Queda fuera de la estandarización de longitud de campos.

`title`, `content` de artículo, `tags.name` y `displayName` ya tenían este gap y se cerraron en `0020_field_length_checks.sql` (ver tablas arriba). Si se agrega un `CHECK` nuevo para otro campo, mantenerlo en sync con la constante de Next.js correspondiente (como ya se hace para `cover_text` y `username`), y anotarlo en [`docs/db/schema.md`](../db/schema.md).
