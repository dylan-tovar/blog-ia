# PRD-0.1 — Tema oscuro y tokens de diseño

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-0 — Sistema de diseño](PRD-0-design-system.md) |
| Dificultad | B (básica) |
| Esfuerzo | S (1 punto, menos de un día) |
| Dueño sugerido | D4 |
| Mentor | D2 |
| Depende de | Nada |
| Código | `src/app/globals.css`, `src/app/layout.tsx`, `components.json` (solo lectura) |
| ADRs | [0005](../adr/0005-shadcn-ui-como-primitivas.md), [0008](../adr/0008-tema-oscuro-y-shell-de-aplicacion.md) |

## Resumen

Toda la app se ve oscura y con el mismo azul de marca porque los colores, la tipografía y el tema se definen **una sola vez**, en dos archivos. Este paquete es esa fundación: si alguien cambia un color aquí, cambia en todas las pantallas. Es el paquete más chico del proyecto y sirve para entender cómo se conectan Tailwind, shadcn y Next.js.

## Qué necesitás entender antes

- [ ] Qué es una **variable CSS** (`--primary: ...`) y cómo se usa (`var(--primary)`).
- [ ] Qué es Tailwind y que sus clases (`bg-primary`, `text-muted-foreground`) leen esas variables.
- [ ] Qué es un **layout raíz** en Next.js (`layout.tsx` envuelve todas las páginas).
- [ ] Idea general de un **token de diseño**: un nombre con significado (`--primary`) en lugar de un color suelto (`#2563eb`).

No hace falta saber React a fondo.

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Variables de color y radio en `:root` | Componentes (`Button`, `Card`...): ver [PRD-0.2](PRD-0.2-ui-primitives.md) |
| Clase `dark` fija en `<html>` y `color-scheme: dark` | Barra de navegación y layout de pantalla: ver [PRD-0.3](PRD-0.3-app-shell.md) |
| Fuentes Geist y Geist Mono (`next/font`) | Estilos del editor de artículos (`.tiptap`, `.prose` al final de `globals.css`): ver [PRD-2.2](PRD-2.2-editor-tiptap.md) |
| Variantes de Tailwind propias (`dark`, `short`) | Modo claro (se descartó) |

## Cómo funciona

Orden recomendado de lectura:

**1. `src/app/layout.tsx` (29 líneas).**

- Importa `Geist` y `Geist_Mono` de `next/font/google`. Next las descarga en el build y las sirve desde el propio sitio: no hay pedido a Google mientras la app corre.
- Cada fuente expone una variable CSS (`--font-geist-sans`, `--font-geist-mono`).
- El `<html>` recibe `lang="es"` y las clases `dark antialiased` junto con las variables de las fuentes. **La clase `dark` está fija**: la app nunca cambia de tema.
- El `<body>` usa `flex min-h-svh flex-col`: ocupa como mínimo toda la altura visible y organiza su contenido en columna (así las páginas centradas, como el login, pueden usar `flex-1`).
- `metadata` define el título "Blog IA" y la descripción de la pestaña.

**2. `src/app/globals.css`, de arriba hacia abajo.**

| Bloque | Qué hace |
| :--- | :--- |
| `@import "tailwindcss"`, `tw-animate-css`, `shadcn/tailwind.css` | Trae Tailwind v4, animaciones y los estilos base de shadcn |
| `@plugin "@tailwindcss/typography"` | Habilita la clase `prose` (se usa para renderizar markdown, ver [PRD-2.6](PRD-2.6-post-detail.md)) |
| `@custom-variant dark (&:is(.dark *))` | Hace que las clases `dark:...` se activen cuando un ancestro tiene la clase `dark`. Como `<html>` la tiene siempre, están siempre activas |
| `@custom-variant short (@media (max-height: 600px))` | Variante propia para pantallas bajas. Se usa solo en el chat de IA (`ChatComposer.tsx`, `AiChatDrawer.tsx`) |
| `@theme inline { ... }` | **Puente**: le dice a Tailwind que `bg-primary` significa `var(--primary)`, etc. Sin esto, las clases no existirían |
| `:root { ... }` | **Los valores reales** de los tokens: fondo, texto, primario, bordes, radio |
| `@layer base` | Aplica borde, fondo y color de texto por defecto a toda la app |

**3. Los tokens que importan** (definidos en `:root`):

| Token | Valor | Uso |
| :--- | :--- | :--- |
| `--background` | `oklch(0.175 0 0)` | Fondo de la app (casi negro) |
| `--foreground` | `oklch(0.97 0 0)` | Texto principal (casi blanco) |
| `--primary` | `oklch(0.546 0.245 262.881)` | Azul de marca (botones, foco, botón "+"). El texto sobre él es blanco |
| `--muted-foreground` | `oklch(0.7 0 0)` | Texto secundario |
| `--border` | `oklch(1 0 0 / 10%)` | Bordes: blanco al 10 % de opacidad |
| `--radius` | `0.625rem` | Base de todas las esquinas redondeadas |

`oklch(luminosidad croma matiz)` es una forma de escribir colores. Solo importa saber que el primer número es la luminosidad (0 = negro, 1 = blanco).

Los tokens `--sidebar-*` y `--chart-*` también están definidos, pero ninguna pantalla los usa (una búsqueda de `sidebar` y `chart-` fuera de `globals.css` no devuelve resultados). Vienen de la inicialización de shadcn †.

## Decisiones y por qué

| Decisión | Por qué |
| :--- | :--- |
| **App solo oscura** con `<html class="dark">` fijo ([ADR 0008](../adr/0008-tema-oscuro-y-shell-de-aplicacion.md)) | Un solo conjunto de tokens que mantener y verificar. El costo: no hay modo claro |
| **Azul como primario, con texto blanco encima** | El comentario junto a `--primary` en `globals.css` dice que es el primario del PRD 0 y que con texto blanco cumple contraste AA |
| **Geist en lugar de la fuente del sistema** | Es la fuente que trae la plantilla de Create Next App. Por qué se conservó: motivo no registrado † |
| **Tokens en `:root` y no colores sueltos en cada componente** | Un cambio de marca se hace en un solo lugar. Es la razón de ser de los tokens y lo que permite que las primitivas de shadcn lean los colores; ningún ADR lo registra como decisión propia † |

## Criterios de aceptación

- [ ] `<html>` tiene las clases `dark` y `antialiased` y `lang="es"`.
- [ ] Las tres variables `--background`, `--foreground` y `--primary` existen en `:root` y las clases `bg-background`, `text-foreground` y `bg-primary` producen esos colores.
- [ ] La fuente visible es Geist (se ve en las herramientas de desarrollo del navegador, pestaña *Computed* → `font-family`).
- [ ] Ninguna pantalla se muestra clara, aunque el sistema operativo esté en modo claro (`color-scheme: dark`).
- [ ] No hay scroll horizontal en móvil (360 px de ancho).

## Cómo verificarla a mano

1. En la terminal: `pnpm dev` y abrir `http://localhost:3000`.
2. Abrir las herramientas de desarrollo (F12), pestaña *Elements*, y comprobar que la etiqueta `<html>` tiene `class="... dark antialiased"`.
3. Seleccionar `<html>`, ir a la pestaña *Styles* y buscar `:root`. Cambiar `--primary` a otro color (por ejemplo `red`): el botón principal cambia de inmediato. Recargar la página deshace el cambio.
4. Activar el modo de dispositivo móvil (icono del teléfono) y elegir un ancho de 360 px: la página no debe tener scroll horizontal.
5. Correr `pnpm lint` para confirmar que no se rompió nada al tocar archivos.

No hay tests automáticos para este paquete.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Medir con una herramienta de contraste (por ejemplo la de las herramientas de desarrollo) el contraste de `--muted-foreground` sobre `--background` y de `--primary` con su texto, y anotar el resultado en este documento | B |
| Decidir qué hacer con los tokens `--sidebar-*` y `--chart-*` sin uso (dejarlos como están o quitarlos) y dejarlo escrito | B |
| Reemplazar los colores fijos repetidos (`bg-[#161618]`, `neutral-800`) por tokens. Están en `AccountSettings.tsx` (9 usos), `AuthorProfileView.tsx` (5) y `activity/page.tsx` (1). Requiere coordinarse con los dueños de [PRD-1.3](PRD-1.3-profile-settings.md), [PRD-3.3](PRD-3.3-author-profile.md) y [PRD-9.2](PRD-9.2-activity-nav.md) | M |

## Preguntas de autoevaluación

1. ¿Qué diferencia hay entre `:root { --primary: ... }` y `@theme inline { --color-primary: var(--primary) }`? ¿Qué pasaría si faltara la segunda parte?
2. ¿Por qué la clase `dark` está fija en `<html>` y no cambia con el sistema operativo?
3. ¿Qué hace `next/font/google` y por qué no hay un pedido a Google cuando se abre la app?
4. ¿Para qué sirve la variante `short` y dónde se usa?
5. Si mañana el equipo de diseño pide un verde de marca en lugar del azul, ¿qué archivo y qué línea se cambia? ¿Qué pantallas se ven afectadas?
