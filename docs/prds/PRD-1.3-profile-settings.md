# PRD-1.3 — Perfil propio y ajustes de cuenta

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-1 — Autenticación](PRD-1-auth.md) |
| Dificultad | B (básica) |
| Esfuerzo | S (1 punto, menos de un día) |
| Dueño sugerido | D8 |
| Mentor | D3 |
| Depende de | [PRD-1.2](PRD-1.2-auth-security.md) (sesión y RLS de `profiles`), [PRD-0.2](PRD-0.2-ui-primitives.md) (`Drawer`, `Input`) |
| Código | `src/features/profile/{actions,queries,schemas}.ts`, `src/features/profile/components/{AccountSettings,SettingsForm}.tsx`, `src/app/(dashboard)/settings/page.tsx`, `src/app/(dashboard)/profile/page.tsx` |
| ADRs | [0007](../adr/0007-login-por-username-con-secret-key.md), [0024](../adr/0024-perfil-en-onboarding.md) |

## Resumen

Cada persona puede cambiar su **nombre para mostrar** y su **nombre de usuario** desde `/settings`. La pantalla es una lista de filas (Perfil, Email, Usuario) que abren un cajón de edición; solo Perfil y Usuario editan de verdad. El perfil se crea antes, en `/onboarding` ([ADR 0024](../adr/0024-perfil-en-onboarding.md)). `/profile` no es una pantalla propia: redirige al perfil público del usuario ([PRD-3.3](PRD-3.3-author-profile.md)).

## Qué necesitás entender antes

- [ ] Qué es una **Server Action** y `useActionState` (ver [PRD-1.1](PRD-1.1-auth-forms.md)).
- [ ] Qué es Zod y `safeParse`.
- [ ] Qué es un `upsert` (insertar o actualizar según exista la fila).
- [ ] Qué es un **conflicto de unicidad** en una base de datos (código `23505` en Postgres).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `/settings`: filas de cuenta y cajón de edición | La vista pública del autor (`AuthorProfileView`, aunque viva en `features/profile/components/`): [PRD-3.3](PRD-3.3-author-profile.md) |
| `updateProfile`, `getCurrentProfile`, `getPublicProfile` | Crear el perfil (`completeOnboarding` en `/onboarding`) y elegir intereses (`saveInterests`): [PRD-1.2](PRD-1.2-auth-security.md). Los intereses no se pueden editar desde `/settings` |
| `updateProfileSchema` y `usernameSchema` | Subida de avatar (no existe) |
| `/profile` (redirección) | Cambio real del email (no existe) |

## Cómo funciona

Orden de lectura:

**1. `schemas.ts`.**

- `usernameSchema`: recorta, pasa a minúsculas y exige `^[a-z0-9_]{3,20}$`. Lo reutiliza `onboardingSchema` ([PRD-1.1](PRD-1.1-auth-forms.md)).
- `updateProfileSchema`: `displayName` (recortado, no vacío) y `username`.
- `onboardingSchema`: los mismos dos campos, para crear el perfil en `/onboarding` ([PRD-1.2](PRD-1.2-auth-security.md)).

**2. `actions.ts`** (archivo `"use server"`).

| Función | Qué hace |
| :--- | :--- |
| `getCurrentProfile()` | Obtiene el usuario de la sesión (si no hay, redirige a `/login`) y devuelve `{ user, profile }` con `id, display_name, username, avatar_url, onboarded_at` (este último lo usa la página `/onboarding` para decidir el paso; requiere la migración `0010`, [ADR 0025](../adr/0025-intereses-en-onboarding.md)) |
| `updateProfile(_state, formData)` | Valida con `updateProfileSchema`, exige sesión y hace `upsert` en `profiles` con `id`, `display_name` y `username`. Si el error es `23505` devuelve "Ese nombre de usuario ya está en uso."; otro error, "No pudimos guardar tu perfil. Intentá de nuevo."; si todo sale bien, `{ success: true }` |

Conserva el `upsert` (y no solo `update`) de cuando el perfil podía no crearse al registrarse. Hoy el proxy lleva a `/onboarding` a quien no terminó el onboarding, es decir, sin perfil o sin `onboarded_at` ([PRD-1.2](PRD-1.2-auth-security.md), [ADR 0025](../adr/0025-intereses-en-onboarding.md)), así que `/settings` normalmente ya tiene una fila que actualizar. `updateProfile` no toca `onboarded_at`.

**3. `queries.ts`.**

- `getPublicProfile(id)`: valida el id y devuelve `id, display_name, username, created_at`; si no existe, `notFound()`.

**4. `app/(dashboard)/settings/page.tsx`.** Obtiene `{ user, profile }` y cuenta los posts del usuario (`type = 'article'`, **sin filtrar por estado**) para mostrarlo en la pantalla. Renderiza `AccountSettings`.

**5. `AccountSettings.tsx`** (Client Component).

- Tres filas en una tarjeta: Profile (nombre), Email, Handle (`@usuario`), cada una con un botón "Edit" que abre un `Drawer`. La sección "Publications" tiene "Mis artículos" y el enlace "Ver posts" (`/posts`). Abajo, "Cerrar sesión" (formulario que llama a `signOut`).
- `drawerSection` decide el contenido del cajón:
  - `profile` o `handle`: muestra `SettingsForm` (nombre + usuario).
  - `email`: texto informativo ("El correo se gestiona a través de la autenticación segura.").

**6. `SettingsForm.tsx`.** Formulario con `useActionState(updateProfile, undefined)`: campos "Nombre para mostrar" y "Nombre de usuario" (con `minLength`, `maxLength`, `pattern`), mensaje de error o "Perfil actualizado.", y botón "Guardar cambios".

**7. `/profile`.** Redirige a `/author/<id propio>`, o a `/login` si no hay sesión. El perfil propio es la vista pública del autor.

### Lo que es real y lo que es decoración

| Fila | ¿Edita de verdad? |
| :--- | :--- |
| Profile (nombre) | Sí |
| Handle (usuario) | Sí, y el login funciona de inmediato con el nuevo |
| Email | No: el cajón solo muestra el email |

## Decisiones y por qué

| Decisión | Alternativas | Consecuencia |
| :--- | :--- | :--- |
| **`upsert` en `updateProfile`** | Solo `update` | Cubría el perfil que no se creó al registrarse; se conserva aunque hoy el perfil se cree en `/onboarding` ([PRD-1-auth.md](PRD-1-auth.md)) |
| **El username se puede cambiar cuando se quiera** ([ADR 0007](../adr/0007-login-por-username-con-secret-key.md)) | Fijarlo al crear el perfil | El login usa el nuevo de inmediato. Costo: los `@usuario` compartidos dejan de servir. Motivo de permitirlo: no registrado † |
| **Solo iniciales, sin foto** | Subida de avatar | `avatar_url` existe en la tabla y se selecciona en `getCurrentProfile`, pero ninguna pantalla lo muestra |
| **Filas de cuenta con cajón de edición** | Un formulario simple | Se parece a una app móvil. La fila de Email quedó sin funcionalidad real |

## Criterios de aceptación

- [ ] `/settings` sin sesión redirige a `/login`.
- [ ] Con sesión, muestra nombre, email y `@usuario` del usuario.
- [ ] Cambiar nombre y usuario en el cajón muestra "Perfil actualizado.".
- [ ] Un username ya usado por otra persona muestra "Ese nombre de usuario ya está en uso.".
- [ ] Un username inválido (por ejemplo `ab`) se rechaza con el mensaje del schema.
- [ ] Después de cambiar el username, se puede iniciar sesión con el nuevo.
- [ ] `/profile` lleva al perfil público propio; sin sesión, a `/login`.
- [ ] Nadie puede editar el perfil de otra persona (RLS de `profiles`).

## Cómo verificarla a mano

1. Iniciar sesión y abrir `/settings`.
2. Pulsar "Edit" en la fila Handle: se abre el cajón con el formulario. Cambiar el usuario a uno libre y guardar: aparece "Perfil actualizado.".
3. Probar con un username que ya use otra cuenta (crear una segunda cuenta): debe salir el mensaje de duplicado.
4. Cerrar sesión (botón "Cerrar sesión" al final) e iniciar sesión con el username nuevo.
5. Pulsar "Edit" en Email: ver el correo actual (solo lectura).
6. Abrir `/profile`: debe terminar en `/author/<tu id>`.
7. `pnpm vitest run src/features/profile/schemas.test.ts` y `pnpm lint`.
8. Los tests e2e `auth.spec.ts` que cambian el usuario en `/settings` rellenan el campo sin pulsar antes "Edit"; como el formulario solo existe dentro del cajón cerrado, es probable que hoy fallen (lectura estática, no se ejecutaron). Ver [PRD-X.1](PRD-X.1-testing-e2e.md).

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Traducir al español los textos en inglés de `AccountSettings`: "Account", "Profile", "Email", "Handle", "Edit", "Publications" | B |
| El contador dice "publicaciones" pero cuenta todos los artículos del usuario, borradores y rechazados incluidos (`settings/page.tsx` no filtra por estado). Decidir si debe contar solo los publicados y, si es así, corregirlo | M |
| `getCurrentProfile` está exportada desde un archivo `"use server"`: en Next.js todas las exportaciones de un archivo así se exponen como Server Actions invocables. Solo devuelve datos del propio usuario, pero una consulta no debería vivir ahí. Proponer moverla a `queries.ts` | M |
| Actualizar los tres tests e2e de `/settings` para abrir el cajón antes de rellenar los campos | M |
| Si se quiere subida de avatar, escribir (solo documento) qué faltaría: almacenamiento, política, componente | A |

## Preguntas de autoevaluación

1. ¿Qué pasa exactamente al guardar el formulario? ¿Qué funciones intervienen y en qué orden?
2. ¿Por qué `updateProfile` usa `upsert` y no `update`?
3. ¿Qué significa el código `23505` y cómo se convierte en un mensaje amable?
4. ¿Qué filas de `/settings` son reales y cuáles solo muestran datos?
5. ¿Por qué `/profile` redirige en lugar de tener su propia pantalla?
6. ¿Qué garantiza que alguien no pueda cambiar el perfil de otra persona? (pista: [PRD-1.2](PRD-1.2-auth-security.md), RLS)
