# 0035. `/post/[id]` pasa a `/p/[id]` y `/author/[id]` pasa a `/[username]`, con redirects permanentes

- **Estado:** Aceptada.
- **Fecha:** 2026-09-23
- **Fuentes:** `next.config.ts`, `src/app/(public)/p/[id]/page.tsx`, `src/app/(public)/[username]/page.tsx`, `src/app/(public)/author/[id]/page.tsx`; commits `3c91c44` (mover rutas), `e1820ff` (actualizar links internos), `1ccd55e` y `93a35eb` (arreglos posteriores). El motivo puntual de acortar `/post/` a `/p/` no quedó registrado †; se infiere una URL más corta y prolija para compartir.

## Contexto

El perfil público vivía en `/author/[id]` (el id UUID del usuario) y la vista de un post en `/post/[id]`. Con el login por username ([ADR 0007](0007-login-por-username-con-secret-key.md)) ya existía un identificador legible pensado para mostrarse; las URLs de perfil seguían mostrando el UUID igual.

## Decisión

El perfil público pasa a `/[username]` (ruta de un solo segmento en la raíz, ej. `/dylantovar`) y la vista de un post pasa a `/p/[id]`. Las rutas viejas se mantienen andando para siempre con redirect permanente (308): hay bookmarks y correos ya enviados (incluido el de "nuevo artículo", [ADR 0028](0028-emails-transaccionales-resend.md)) que apuntan a `/author/<id>` y no se pueden romper.

### `/post/:id` → `/p/:id` es una regla mecánica de `next.config.ts`

El id no cambia entre una ruta y otra, así que es una reescritura 1:1: `redirects()` en `next.config.ts` define `{ source: "/post/:id", destination: "/p/:id", permanent: true }`.

### `/author/[id]` → `/[username]` necesita una consulta a la base

El destino no es una reescritura mecánica del id: hace falta resolver el UUID a un username. No puede ser una regla de `next.config.ts` (esas corren antes de tocar la base). En su lugar, `src/app/(public)/author/[id]/page.tsx` queda como un shim: resuelve el perfil con `getPublicProfile` (la misma función que ya usaba la vista vieja) y llama a `permanentRedirect(`/${profile.username}`)`. Si el id no existe o el perfil no tiene username, `notFound()`.

### `/[username]` es una ruta de un solo segmento en la raíz

Vive en `src/app/(public)/[username]/page.tsx`, al mismo nivel que `/explore` o `/p/[id]`. Esto exige reservar palabras que ya son rutas de primer nivel (`login`, `settings`, `explore`, `p`, etc.): un username que colisionara con una ruta real nunca sería alcanzable vía `/[username]`. La validación de esas palabras reservadas se agregó en el commit previo (`e1b9a6e`, "thread username through author/actor embeds + reserved words") junto con sumar `username` a los embeds de autor/actor que antes solo traían `id` y `display_name`, requisito para poder linkear por username desde cualquier lugar que muestre un autor.

### Los links internos se migraron, no quedaron sobre el redirect

Todo el código que armaba un link a `/author/<id>` o `/post/<id>` se actualizó para apuntar directo a `/[username]` y `/p/[id]` (commit `e1820ff`); el redirect permanente existe para tráfico **externo** (bookmarks, emails, buscadores), no para que la navegación interna pague un salto extra en cada click.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Dejar `/author/[id]` y `/post/[id]` como están, sin URLs por username | El username ya existe para el login; no aprovecharlo en las URLs públicas deja una URL menos legible y menos compartible † |
| Redirect temporal (307) en vez de permanente (308) | Los buscadores y los clientes de email no consolidan un redirect temporal hacia la URL nueva; el permanente además permite cachear la redirección |
| Hacer `/author/[id]` → `/[username]` también una regla de `next.config.ts` | Esas reglas no pueden consultar la base; resolver `id` a `username` exige código de servidor, no una tabla de reescritura estática |

## Consecuencias

- **A favor:** URLs de perfil legibles y compartibles (`/dylantovar` en vez de `/author/3f2a...`); URLs de post más cortas; nada que ya apuntaba a las rutas viejas se rompe.
- **En contra:** visitar `/author/<id>` cuesta una consulta a la base solo para redirigir; un username reservado (igual a una ruta de primer nivel) nunca es alcanzable por `/[username]`, aunque la reserva de palabras ya lo impide al elegirlo.
- **Cuándo revisar:** si se agrega una ruta nueva de primer nivel, sumarla a la lista de palabras reservadas de username; si el volumen de tráfico a `/author/` y `/post/` cae a cero con el tiempo, evaluar si vale la pena mantener el shim y el redirect indefinidamente.
