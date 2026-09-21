# PRD-9.2 — Actividad (`/activity`) y destinos de navegación

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-9 — Explorar, Actividad y opciones de post](PRD-9-explore-activity.md) |
| Dificultad | B (básica) |
| Esfuerzo | S (1 punto, menos de un día) |
| Dueño sugerido | D10 |
| Mentor | D6 (apoyo entre pares; escala a D2 o D1) |
| Depende de | [PRD-0.3](PRD-0.3-app-shell.md) (la navegación que lleva a esta página) |
| Código | `src/app/(dashboard)/activity/page.tsx`, `src/components/shared/navigation.ts` (`NAV_ITEMS`, `getPageTitle`, `isNavItemActive`) |
| ADRs | [0008](../adr/0008-tema-oscuro-y-shell-de-aplicacion.md), [0021](../adr/0021-feed-en-raiz-y-global.md) |

## Resumen

`/activity` es hoy una **pantalla vacía reservada**: exige sesión y muestra un icono de campana con el texto "No tenés actividad reciente". No existe ningún cálculo de actividad detrás. Este paquete es también un ejercicio de honestidad técnica: hay que saber explicar qué es real y qué es una promesa sin implementar, y cómo se llegaría a implementarla.

## Qué necesitás entender antes

- [ ] Qué es un **Server Component** `async` y qué hace `redirect()` de Next.js.
- [ ] Qué es `getViewer()` (usuario con sesión o `null`, ver [PRD-0.3](PRD-0.3-app-shell.md)).
- [ ] Idea de **placeholder**: una pantalla o pieza reservada que aún no tiene función real.

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| La página `/activity` y su estado vacío | Diseñar o implementar notificaciones (no existen) |
| Que `/activity` exija sesión | La barra de navegación en sí: [PRD-0.3](PRD-0.3-app-shell.md) |
| Cómo `NAV_ITEMS` incluye Actividad | Tablas de likes, notas y seguimientos: [PRD-7.3](PRD-7.3-likes.md), [PRD-7.2](PRD-7.2-notes-ui.md), [PRD-3.1](PRD-3.1-follow-system.md) |

## Cómo funciona

### La página (`activity/page.tsx`, 29 líneas)

```text
ActivityPage():
  viewer = getViewer()
  si no hay viewer -> redirect("/login")
  mostrar:
    <h1 class="sr-only">Actividad</h1>           // título solo para lectores de pantalla
    icono de campana
    "No tenés actividad reciente"
    "Cuando otros usuarios le den me gusta a tus publicaciones, dejen notas o te sigan, lo verás acá."
```

- **No hay consulta, ni tabla de notificaciones, ni estado de "leído".** El texto promete algo que no existe todavía.
- Los datos de origen sí existen por separado: `likes`, notas con `parent_post_id` y `subscriptions`. Nada los junta en una pantalla.
- La protección es **de la propia página**: `/activity` **no** está en la lista `PROTECTED_PATHS` de `src/proxy.ts` (solo están `/settings`, `/editor` y `/posts`), así que si no hubiera este `redirect`, cualquiera la vería.

### Los destinos de navegación

`NAV_ITEMS` (`navigation.ts`) define cuatro destinos: Inicio `/`, Explorar `/explore`, **Actividad `/activity`** y Perfil `/profile`. `getPageTitle` da el título "Actividad" para el primer segmento `activity`. `isNavItemActive` marca activo el destino cuando la ruta coincide o empieza por él. La barra inferior y los iconos de escritorio se dibujan en [PRD-0.3](PRD-0.3-app-shell.md); el test `src/components/shared/navigation.test.ts` comprueba los cuatro destinos y los títulos.

## Decisiones y por qué

| Decisión | Alternativas | Consecuencia |
| :--- | :--- | :--- |
| **Reservar el destino con un estado vacío** | No mostrar el destino hasta que exista | La navegación queda con cuatro destinos. No hay una decisión escrita sobre `/activity`: motivo no registrado †. El [ADR 0021](../adr/0021-feed-en-raiz-y-global.md) deja las notificaciones fuera del alcance de [PRD-3](PRD-3-feed-follows.md) y menciona `/activity` como pantalla vacía |
| **Proteger con `redirect` en la página** | Agregarla a `PROTECTED_PATHS` | Funciona igual; cada ruta privada nueva debe guardarse sola o sumarse a la lista ([ADR 0003](../adr/0003-seguridad-rls-y-proxy-minimo.md)) |
| **Cuatro destinos** ([ADR 0008](../adr/0008-tema-oscuro-y-shell-de-aplicacion.md)) | Los tres originales | El ADR 0008 previó revisar la navegación cuando existieran más destinos |

## Criterios de aceptación

- [ ] Sin sesión, `/activity` redirige a `/login`.
- [ ] Con sesión, muestra el icono, el título "No tenés actividad reciente" y el texto de ayuda.
- [ ] El destino "Actividad" aparece en la barra inferior (móvil) y en los iconos de escritorio, y se marca activo estando en `/activity`.
- [ ] El título de la cabecera en `/activity` es "Actividad".
- [ ] Quien asume el paquete puede explicar por qué esta pantalla no muestra actividad real.

## Cómo verificarla a mano

1. Sin sesión, abrir `/activity`: debe redirigir a `/login`.
2. Iniciar sesión y abrir `/activity`: pantalla vacía con la campana.
3. En móvil (360 px), pulsar el icono de la campana de la barra inferior: es el destino activo y el título de la cabecera dice "Actividad".
4. Dar "me gusta" a un post desde otra cuenta y volver a `/activity`: **no aparece nada** (es el comportamiento actual documentado).
5. `pnpm vitest run src/components/shared/navigation.test.ts`.
6. No hay test propio de `/activity` ni e2e.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Cambiar el texto para que no prometa algo inexistente (por ejemplo "Pronto verás aquí tu actividad") | B |
| Escribir un test e2e simple: sin sesión redirige a `/login`; con sesión muestra el estado vacío (coordinar con [PRD-X.1](PRD-X.1-testing-e2e.md)) | M |
| Redactar (solo documento, sin código) un diseño mínimo de actividad: qué eventos (like, nota, seguidor), de qué tablas salen y qué consulta los juntaría | A |
| Decidir si `/activity` debería sumarse a `PROTECTED_PATHS` y dejar la decisión escrita | B |

## Preguntas de autoevaluación

1. ¿Qué hace hoy la página `/activity` y qué promete que no hace?
2. ¿Quién protege esta ruta si no está en `PROTECTED_PATHS`?
3. ¿De qué tablas saldría la actividad real (likes, notas, seguidores) y qué faltaría construir?
4. ¿Cómo sabe el título de la cabecera que estamos en Actividad?
5. ¿Cuál es el riesgo de dejar un texto que promete una función inexistente?
