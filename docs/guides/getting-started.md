# Puesta en marcha

Para levantar el proyecto hace falta un proyecto de Supabase con las diez migraciones aplicadas y tres variables de entorno. Las funciones de IA piden además una clave de Gemini; sin ella la app funciona y solo la IA responde "no configurada".

## Camino rápido

1. Instalar dependencias: `pnpm install`
2. Crear `.env.local` en la raíz con las variables de [la tabla](#variables-de-entorno).
3. Aplicar las migraciones de `supabase/migrations/` en orden (`0001` a `0010`) en el SQL Editor de Supabase ([procedimiento](#migraciones)). (ESTO SOLO ES LA PRIMERA VEZ, YA ESTAN APLICADAS EN EL PROYECTO DE SUPABASE)
4. Opcional, para ver el feed con contenido: `pnpm seed:dev`. (YA TIENE CONTENIDO, NO ES NECESARIO EN NUESTRO CASO)
5. Levantar el servidor: `pnpm dev` y abrir <http://localhost:3000/register>. El registro pide email y una contraseña fuerte (8+ caracteres con minúscula, mayúscula, número y símbolo); después `/onboarding` pide en el paso 1 nombre y username (crea el perfil, [ADR 0024](../adr/0024-perfil-en-onboarding.md)) y en el paso 2 elegir al menos 3 temas de interés, tomados de los tags de artículos publicados ([ADR 0025](../adr/0025-intereses-en-onboarding.md)). Con una base sin artículos publicados el mínimo se relaja y el paso 2 se puede completar sin elegir.

## Requisitos

| Requisito | Detalle |
| :--- | :--- |
| Node.js | 24.18.0, la versión con la que se desarrolla y corre el CI. `vitest` 5 y `jsdom` 30 no soportan Node 20 (`engines`: `^22.12 \|\| ^24 \|\| >=26`), aunque Next 16.3.5 acepte 20.9. `package.json` no fija la versión ni hay `.nvmrc` |
| pnpm | `packageManager` declara `pnpm@12.4.2` |
| Proyecto de Supabase | Se necesita la URL, la publishable key y la secret key del proyecto |
| Navegador de Playwright | Solo para los e2e: `pnpm exec playwright install chromium` ([testing](testing.md)) (Ignorar si no eres D1 o D2)|
| Clave de Gemini | Opcional, de Google AI Studio |

## Variables de entorno

`src/lib/env.ts` valida las públicas con Zod al arrancar; si faltan o son inválidas, la app falla. `src/lib/env.server.ts` valida la secret key y las variables de IA solo cuando se necesitan (login por username, llamadas a Gemini), para que un valor faltante no rompa el resto de la app. `.gitignore` excluye `.env*`, por lo que **no se versionan**, incluido `.env.example`: esta tabla es la referencia de las variables.

| Variable | Obligatoria | Por defecto | Regla | Dónde se usa |
| :--- | :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | — | URL válida | Navegador y servidor |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sí | — | Texto no vacío | Navegador y servidor |
| `SUPABASE_SECRET_KEY` | Sí para login por username, publicar y el límite de IA | — | Texto no vacío (el código solo exige que no esté vacío) | Solo servidor. **Salta RLS** ([ADR 0007](../adr/0007-login-por-username-con-secret-key.md), [ADR 0012](../adr/0012-integridad-de-escritura-de-posts.md)) |
| `AI_PROVIDER` | No | `claude` | `claude`, `gemini` u `openrouter` | Proveedor de IA activo. Solo se exige la configuración del que esté activo ([ADR 0031](../adr/0031-proveedor-de-ia-intercambiable-openrouter.md), [ADR 0033](../adr/0033-claude-como-proveedor-por-defecto.md)) |
| `CLAUDE_API_KEY` | Con `AI_PROVIDER=claude` | — | Texto no vacío | Solo servidor ([console.anthropic.com](https://console.anthropic.com/)) |
| `CLAUDE_MODEL` | No | `claude-opus-5` | Texto no vacío | Modelo a usar. Verificar con `pnpm ai:smoke:claude` |
| `GEMINI_API_KEY` | Con `AI_PROVIDER=gemini` | — | Texto no vacío | Solo servidor (Google AI Studio) |
| `GEMINI_MODEL` | No | `gemini-3.5-flash-lite` | Texto no vacío; un valor en blanco usa el defecto | Modelo a usar. Verificar con `pnpm ai:smoke` que esté disponible en la capa gratuita ([ADR 0017](../adr/0017-politica-de-thinking-y-reintentos-gemini.md)) |
| `OPENROUTER_API_KEY` | Con `AI_PROVIDER=openrouter` | — | Texto no vacío | Solo servidor ([openrouter.ai/keys](https://openrouter.ai/keys)) |
| `OPENROUTER_MODEL` | Con `AI_PROVIDER=openrouter` | — (sin defecto a propósito) | Texto no vacío | Id del catálogo de [openrouter.ai/models](https://openrouter.ai/models); debe admitir `tools` y `response_format`. Verificar con `pnpm ai:smoke:openrouter`. Ejemplos comprobados: `openai/gpt-4o-mini`, `google/gemini-3.8-flash`, `anthropic/claude-haiku-4.5` |
| `AI_RATE_LIMIT_USER_PER_MIN` | No | `5` | Entero de 1 a 600 | Peticiones por usuario y por minuto, en cada carril (asistencia y moderación cuentan por separado) |
| `AI_RATE_LIMIT_GLOBAL_PER_MIN` | No | `6` | Entero de 1 a 6000 | Peticiones de asistencia (chat, resumen) de todo el proyecto por minuto. Ajustar al RPM que muestre AI Studio para la clave: los límites de la capa gratuita no se publican |
| `AI_RATE_LIMIT_MODERATION_GLOBAL_PER_MIN` | No | `4` | Entero de 1 a 6000 | Moderaciones al publicar de todo el proyecto por minuto (carril separado para que la asistencia no lo agote). La suma con el anterior debería quedar por debajo del RPM del proyecto |
| `NEXT_PUBLIC_SITE_URL` | Sí | — | URL válida | Navegador y servidor. Base de los links de confirmación, recuperación, bienvenida y baja de correo ([PRD-11](../prds/PRD-11-emails-transaccionales.md)) |
| `RESEND_API_KEY` | Para mandar correos | — | Texto no vacío | Solo servidor (`src/lib/email/`) |
| `RESEND_FROM_EMAIL` | Para mandar correos | — | Texto no vacío (ej. `Blog IA <no-reply@tu-dominio.com>`) | Solo servidor |

Sin la clave del proveedor activo (`CLAUDE_API_KEY`, o `GEMINI_API_KEY`, o `OPENROUTER_API_KEY` y `OPENROUTER_MODEL`): las funciones de IA responden "La IA no está configurada en este entorno", y publicar sigue funcionando (sin tags automáticos). En la capa gratuita de Gemini, Google puede usar el texto enviado para mejorar sus productos ([ADR 0011](../adr/0011-ia-con-gemini.md)); la interfaz lo avisa. Sin `RESEND_API_KEY`, `sendEmail` falla en silencio (logueado, nunca lanza): la confirmación/recuperación de contraseña dependen del SMTP de Supabase, no de esta variable (ver más abajo).

## Correo con Resend (fuera del repo)

Estos tres pasos son configuración del dashboard de Supabase, no viven en `supabase/migrations/` ni en ningún archivo versionado — hay que repetirlos en cada proyecto de Supabase nuevo ([PRD-11.1](../prds/PRD-11.1-confirmacion-y-recuperacion.md), [ADR 0028](../adr/0028-emails-transaccionales-resend.md)):

1. **Authentication → Emails → SMTP Settings**: activar SMTP custom apuntando al relay de Resend, con el dominio ya verificado por DNS.
2. **Authentication → Sign In / Providers → Email**: reactivar "Confirm email".
3. **Authentication → Emails → Templates**: en "Confirm signup" y "Reset password", apuntar el link a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=<path>` en vez del endpoint default de GoTrue.

`SUPABASE_SECRET_KEY` no lleva el prefijo `NEXT_PUBLIC_`, no se sube al repositorio y no se pega en el navegador. Se obtiene en Project Settings → API Keys → Secret keys.

## Migraciones

Los archivos de `supabase/migrations/` se aplican a mano, en orden, en el SQL Editor (Dashboard > SQL Editor). El repositorio no incluye `supabase/config.toml`, así que no hay flujo de Supabase CLI ([ADR 0016](../adr/0016-migraciones-sql-manuales.md)). **No existe una tabla que registre qué migraciones se aplicaron**: hay que saberlo.

| Orden | Archivo | Crea | ¿Se puede repetir? |
| :--- | :--- | :--- | :--- |
| 1 | `0001_profiles.sql` | `profiles` y sus políticas RLS | No |
| 2 | `0002_posts.sql` | `posts`, `tags`, `post_tags` y sus políticas | No |
| 3 | `0003_feed.sql` | `subscriptions`, `reading_history`, índices y políticas | No |
| 4 | `0004_username.sql` | `profiles.username` (único, con formato) y `login_email_for_username`, ejecutable solo por `service_role` | No |
| 5 | `0005_post_types_and_likes.sql` | `posts.type`, `posts.parent_post_id`, restricciones del modelo, `can_attach_note`, `likes` y políticas ajustadas. Convierte los posts de prueba existentes en notas la primera vez ([PRD-7](../prds/PRD-7-notes-likes.md)) | Solo dentro de la cadena 0005 → 0006 → 0007 |
| 6 | `0006_allow_note_updates.sql` | Política de UPDATE de `posts` sin la restricción a artículos, para editar notas ([ADR 0015](../adr/0015-notas-editables.md)) | Solo dentro de la cadena 0005 → 0006 → 0007 |
| 7 | `0007_ai_features.sql` | Columnas de caché de IA, trigger, privilegios por columna sobre `posts`, INSERT de artículos solo como borrador y el límite por minuto ([ADR 0012](../adr/0012-integridad-de-escritura-de-posts.md)) | Sí, si `0005` y `0006` ya corrieron antes |
| 8 | `0008_post_images.sql` | Bucket público `post-images` de Storage y sus políticas (INSERT, SELECT y DELETE) por carpeta de usuario ([ADR 0022](../adr/0022-imagenes-en-supabase-storage.md)) | Sí |
| 9 | `0009_post_cover.sql` | Portada de artículos: columnas `cover_*` de `posts`, restricciones y privilegio de UPDATE ([ADR 0023](../adr/0023-portada-de-articulos.md)) | Sí |
| 10 | `0010_onboarding_interests.sql` | `profiles.onboarded_at` (los perfiles existentes se marcan como terminados), `user_interests` con RLS de fila propia y `popular_tags` ([ADR 0025](../adr/0025-intereses-en-onboarding.md)) | Sí: el backfill corre solo la primera vez, así que repetirla no marca como terminado a quien esté a mitad del onboarding |

> **`0005` no se repite sola.** Vuelve a crear la política de INSERT de `posts` sin la condición `type = 'note' or status = 'draft'` y deja el UPDATE limitado a `type = 'article'`. Esas dos políticas las redefinen después `0007` y `0006`. Si se corre `0005` sola sobre un proyecto ya migrado, con los privilegios por columna de `0007` todavía vigentes (`status` y `published_at` insertables), un autor podría insertar un artículo ya publicado sin moderación y `updateNote` dejaría de funcionar. Si hay que repetir `0005`, se repite la cadena completa en orden: `0005`, `0006`, `0007`.

Reglas prácticas:

- **Proyecto nuevo:** correr las diez en orden.
- **Aplicar `0010` ANTES de desplegar el código del paso de intereses** ([ADR 0016](../adr/0016-migraciones-sql-manuales.md), [ADR 0025](../adr/0025-intereses-en-onboarding.md)). Sin ella, el proxy falla abierto pero `/onboarding` queda mostrando el paso 1 y el paso 2 no se puede completar.
- **Proyecto existente:** correr solo las que falten, en orden. Las de la fila "No" fallan si se repiten (por ejemplo, una política o una restricción que ya existe).
- **Si `0007` cambió** desde la última vez que se aplicó (el archivo se edita en su lugar), volver a correrla es seguro siempre que `0005` y `0006` ya estén aplicadas: usa `drop ... if exists` y `create or replace`. Nunca repetir `0005` o `0006` por separado (ver el aviso de arriba).
- **Ver hasta dónde llegó un proyecto** (solo lectura), en el SQL Editor. La consulta se armó a partir de los nombres que crean las migraciones y no se ejecutó contra un proyecto real:

```sql
select
  to_regclass('public.profiles') is not null                                          as m0001,
  to_regclass('public.posts') is not null                                             as m0002,
  to_regclass('public.subscriptions') is not null                                     as m0003,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'profiles'
            and column_name = 'username')                                             as m0004,
  to_regclass('public.likes') is not null                                             as m0005,
  exists (select 1 from pg_policies
          where schemaname = 'public' and tablename = 'posts'
            and policyname = 'Users can update their own posts'
            and qual not like '%article%')                                            as m0006,
  to_regclass('public.ai_rate_limits') is not null                                    as m0007,
  exists (select 1 from storage.buckets where id = 'post-images')                      as m0008,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'posts'
            and column_name = 'cover_image_url')                                     as m0009,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'profiles'
            and column_name = 'onboarded_at')                                        as m0010;
```

- **Verificar después de `0007`:** con el seed cargado, `pnpm verify:writes` confirma que el navegador ya no puede escribir `status` ni las columnas de IA (ver el [desfase de email conocido](testing.md#problemas-conocidos) entre este script y el seed).

El detalle del esquema está en [`../db/schema.md`](../db/schema.md).

## Datos de prueba

`pnpm seed:dev` (`scripts/seed-dev.mjs`) carga cuatro usuarios con artículos publicados, notas (sueltas y respuestas a artículos), likes, lecturas, tags y seguimientos, para poder ver el feed. Es solo para desarrollo y se puede correr más de una vez sin duplicar datos.

| Username | Email | Contraseña |
| :--- | :--- | :--- |
| `lucia_dev` | `lucia.seed@blog-ia.test` | `Seed-Password-123` |
| `mateo_ia` | `mateo.seed@blog-ia.test` | `Seed-Password-123` |
| `sofi_writes` | `sofia.seed@blog-ia.test` | `Seed-Password-123` |
| `nico_tech` | `nicolas.seed@blog-ia.test` | `Seed-Password-123` |

Requiere `.env.local` con las tres variables de Supabase y las migraciones `0001` a `0010`. Las cuentas se crean con el Admin API (la secret key) porque el registro público de Supabase rechaza dominios sin registro MX, como `example.com` o `test.com`. Los posts y notas se insertan con el cliente admin (desde `0007` el cliente ya no puede insertar un artículo publicado ni escribir fechas); perfil (con `onboarded_at`, para que los usuarios de prueba no pasen por el paso de intereses), tags, likes, lecturas y seguimientos se escriben con cada usuario logueado, bajo RLS. Para borrar estos datos, eliminar los usuarios desde Authentication en el dashboard de Supabase: el resto cae en cascada.

## Scripts

| Comando | Qué hace |
| :--- | :--- |
| `pnpm dev` | Servidor de desarrollo (`next dev`) |
| `pnpm build` | Build de producción (`next build`) |
| `pnpm start` | Sirve el build (`next start`) |
| `pnpm lint` | ESLint |
| `pnpm test` | Tests unitarios, una ejecución (`vitest run`) |
| `pnpm test:watch` | Vitest en modo watch |
| `pnpm test:e2e` | Tests end-to-end (`playwright test`); ver el [estado de los e2e](testing.md#problemas-conocidos) |
| `pnpm seed:dev` | Carga usuarios y posts de prueba ([Datos de prueba](#datos-de-prueba)) |
| `pnpm ai:smoke:claude` | Comprueba con la `CLAUDE_API_KEY` configurada que el modelo existe, que la salida estructurada funciona por las dos vías y que el streaming con function calling devuelve una propuesta utilizable. Consume saldo de la cuenta |
| `pnpm ai:smoke` | Comprueba con la `GEMINI_API_KEY` configurada que el modelo responde y devuelve JSON válido; muestra la latencia. No imprime la clave |
| `pnpm ai:smoke:openrouter` | Lo mismo contra OpenRouter: confirma que `OPENROUTER_MODEL` existe en el catálogo y admite `tools` y `response_format`, y prueba la salida JSON estructurada y el streaming con function calling. Consume saldo de la cuenta |
| `pnpm verify:writes` | Como usuario sembrado, intenta escrituras prohibidas sobre `posts` y las permitidas, y limpia lo que crea. Falla con código distinto de cero si algo no coincide. Requiere `0007` y el seed |

Los tres scripts `.mjs` se ejecutan con `node --env-file=.env.local`, así que leen `.env.local` sin cargar Next.

## Agregar componentes de UI

```bash
pnpm dlx shadcn@latest add <componente>
```

Ver [ADR 0005](../adr/0005-shadcn-ui-como-primitivas.md).

## Política de contraseñas en Supabase

El formulario y `registerSchema` exigen contraseñas fuertes, pero Zod se puede saltear llamando a Supabase Auth directo con la clave pública. Para que la regla valga también ahí, alineá la política del dashboard (Authentication -> Providers -> Email o Password): largo mínimo de 8, caracteres requeridos (minúscula, mayúscula, número y símbolo) y, si tu plan lo permite, la protección contra contraseñas filtradas (*leaked password protection*). Esta configuración no vive en el repo.

## Siguiente paso

Leer [`../architecture/overview.md`](../architecture/overview.md) y luego [testing.md](testing.md). Para agregar una feature, seguir [contributing.md](contributing.md).
