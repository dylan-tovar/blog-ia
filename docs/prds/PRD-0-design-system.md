# PRD 0 — Sistema de diseño y fundación del proyecto

| Campo | Valor |
| :--- | :--- |
| Estado | Implementado (tema solo oscuro) |
| Depende de | Nada. Es el prerrequisito de todos los demás PRDs |
| Migraciones | Ninguna |
| ADRs relacionados | [0005](../adr/0005-shadcn-ui-como-primitivas.md), [0006](../adr/0006-organizacion-por-dominio.md), [0008](../adr/0008-tema-oscuro-y-shell-de-aplicacion.md) |
| Código | `src/components/ui/`, `src/components/shared/`, `src/app/globals.css`, `src/app/layout.tsx`, `components.json` |

## Paquetes de trabajo

Este PRD se reparte en tres paquetes que se pueden asignar por separado ([reparto del equipo](../team/reparto-de-tareas.md)).

| Paquete | Qué cubre | Dificultad | Esfuerzo |
| :--- | :--- | :--- | :--- |
| [PRD-0.1 — Tema y tokens](PRD-0.1-theme-tokens.md) | `globals.css`, `layout.tsx`, tema oscuro, fuentes | B | S |
| [PRD-0.2 — Primitivas de UI](PRD-0.2-ui-primitives.md) | `components/ui/` (shadcn, `bubble`, `marker`, `message`) | B | M |
| [PRD-0.3 — Shell de la aplicación](PRD-0.3-app-shell.md) | Cabecera, navegación, menú de cuenta | M | M |

## Resumen

Antes de construir features se fijaron tres cosas: **dónde vive cada componente**, **qué piezas base existen** y **cómo se ve la app** (tema oscuro, mobile-first, una columna). Sirve para que las features hechas en momentos distintos no diverjan en estructura ni en estilo.

## Problema y objetivo

El login ya necesita botones, inputs y cards. Si cada feature decide por su cuenta cómo organizar componentes o qué colores usar, el resultado es inconsistente y hay que reconstruir piezas a mitad del proyecto. El objetivo es tomar esas decisiones una vez, antes de la primera pantalla.

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Convención de carpetas de componentes | Componentes de dominio (viven en cada feature) |
| Primitivas de UI (shadcn/ui) y el shell de la aplicación | Un catálogo de componentes documentado (Storybook) |
| Paleta, tipografía, breakpoints, estructura de pantalla | Modo claro (se descartó, ver decisiones) |
| Convenciones de nombrado | Internacionalización: la interfaz está en español |

## Cómo funciona

### 1. Dónde vive cada componente

Se usa la idea central de Atomic Design (separar por reutilización) con **tres carpetas** en vez de cinco categorías.

| Carpeta | Qué contiene | Regla |
| :--- | :--- | :--- |
| `components/ui/` | Primitivas generadas por el CLI de shadcn/ui | No se escriben a mano. Se agregan con `pnpm dlx shadcn@latest add <componente>`. Los archivos quedan en minúscula (`button.tsx`) tal como salen del CLI |
| `components/shared/` | Piezas con lógica de presentación usadas por más de una feature: el shell de la app, la navegación, el avatar | Si solo la usa una feature, no va aquí. Se componen con piezas de `ui/` |
| `features/<dominio>/components/` | Componentes de un dominio (`PostCard`, `PostEditor`, `AiChatDrawer`) | Viven junto a las actions y queries de esa feature |

La pregunta que decide la carpeta: **¿este componente es genérico o es de un dominio?**

`components/shared/` contiene hoy: `AppShell`, `MainNav`, `BottomNav`, `HeaderTitle`, `HeaderAccount`, `AccountDrawer`, `UserAvatar` y `navigation.ts`. `components/shared/` intenta no depender de `features/`: cuando `AppShell` necesita un componente de una feature (el botón "+"), el layout se lo pasa como función (`fab(viewer)`). La regla **no se cumple del todo** hoy: `HeaderAccount` importa `LoginDrawer` y `AccountDrawer` importa la Server Action `signOut`, ambos de `features/auth`. Son excepciones conocidas; ver "Limitaciones conocidas".

### 2. Estructura de carpetas

Ver el árbol vigente en [`PRD-global-vision.md`](../PRD-global-vision.md#11-arquitectura-de-carpetas-por-dominio) y el detalle en [`architecture/overview.md`](../architecture/overview.md). `proxy.ts` vive dentro de `src/` porque Next.js exige que quede al mismo nivel que `app/`.

Regla de subdivisión: dentro de cada feature se empieza plano y se crea `components/` solo cuando el número de archivos lo justifica.

### 3. Primitivas de UI disponibles

| Primitiva | Archivo | Notas |
| :--- | :--- | :--- |
| `Button` | `ui/button.tsx` | El estado de carga se arma en el sitio de uso con `Loader2` de `lucide-react` y `disabled`. No hay componente `Spinner` |
| `Input`, `Label`, `Textarea` | `ui/input.tsx`, `label.tsx`, `textarea.tsx` | |
| `Card` | `ui/card.tsx` | Los formularios de auth la usan; el feed usa filas planas |
| `Badge` | `ui/badge.tsx` | Estados de un post (borrador, en revisión, publicado, rechazado) y tags |
| `Avatar` | `ui/avatar.tsx` | Envuelto por `shared/UserAvatar.tsx`, que muestra **iniciales**: `avatar_url` no se usa |
| `Dialog`, `Drawer`, `DropdownMenu` | `ui/dialog.tsx`, `drawer.tsx`, `dropdown-menu.tsx` | Agregadas después del diseño original: notas, publicación, ajustes, menús de post |
| `Bubble`, `Message`, `Marker` | `ui/bubble.tsx`, `message.tsx`, `marker.tsx` | Primitivas para la conversación del chat de IA ([PRD-8](PRD-8-ai-chat.md)); no se verificó si las generó el CLI de shadcn o se escribieron a mano ([ADR 0005](../adr/0005-shadcn-ui-como-primitivas.md)) |

**Único ajuste manual sobre los archivos generados:** `Button` (`default` y `lg`) e `Input` miden `h-11` (44 px, tamaño mínimo de un blanco táctil) en móvil y vuelven a `md:h-9`/`md:h-10` desde `md:`.

### 4. Estilo visual

**Mobile-first:** las clases se escriben para pantalla chica y se agregan variantes (`md:`, `lg:`) solo cuando el layout lo necesita.

**Paleta (app solo oscura).** `<html class="dark">` está fijo en `src/app/layout.tsx` y los tokens viven en `:root` de `globals.css`.

| Uso | Color | Cómo se aplica |
| :--- | :--- | :--- |
| Primario (botones principales, foco, botón "+") | Azul | `bg-primary` (`oklch(0.546 0.245 262.881)`, texto blanco) |
| Links y acciones de texto ("Seguir") | Azul claro (`blue-400`) | `blue-600` sobre fondo oscuro no llega a contraste AA en texto chico |
| Texto principal / secundario | Casi blanco / gris claro | `text-foreground` / `text-muted-foreground` |
| Fondo | Casi negro (`oklch(0.175 0 0)`) | `bg-background`; separadores con `border` |
| Publicado / éxito | Verde | `bg-green-500/15 text-green-300` |
| Rechazado / error | Rojo | `text-destructive`, `bg-red-500/15 text-red-300` |
| En revisión | Ámbar | `bg-amber-500/15 text-amber-300` |

Lo semántico (fondo, texto, bordes) usa las variables CSS de shadcn (`--background`, `--primary`, ...); la escala de Tailwind se usa para los estados y los links azules.

**Tipografía:** Geist y Geist Mono vía `next/font/google` (se autoaloja en el build; no hay pedido a Google en runtime). Escala: `text-sm` metadatos, `text-base` cuerpo, `text-lg` subtítulos, `text-xl`/`text-2xl` títulos de post.

**Breakpoints (mobile-first):**

| Breakpoint | Medida | Qué cambia |
| :--- | :--- | :--- |
| Base | `< 768px` | Barra inferior con 4 destinos (Inicio, Explorar, Actividad, Perfil) y botón "+" que abre la nota directo |
| `md:` | `768px` | La navegación pasa a iconos en la barra superior; el botón "+" abre el menú "Crear" (Nota / Artículo); el editor de artículos se habilita |
| `lg:` | `1024px` | Sin cambios de layout |

**Estructura de pantalla:** una sola columna (`max-w-2xl`, centrada) en **todos** los tamaños: barra superior fija (logo, título de la página, avatar o "Iniciar sesión"/"Registrarse"), contenido, y con sesión la barra inferior y el botón "+" (solo móvil hasta `md`). El feed **no** pasa a dos columnas en pantallas grandes (el diseño original lo preveía).

### 5. Convenciones de nombrado

| Elemento | Convención | Ejemplo |
| :--- | :--- | :--- |
| Componentes | `PascalCase` | `PostCard.tsx` |
| Funciones utilitarias y hooks | `camelCase` en el archivo; los hooks nuevos usan `kebab-case` de archivo | `scoreByTags.ts`, `use-autosave.ts` |
| Server Actions | verbo + entidad | `createNote`, `publishPost`, `followAuthor` |
| Rutas de `app/` | minúsculas con guiones | `reading-history` |

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **shadcn/ui como primitivas** ([ADR 0005](../adr/0005-shadcn-ui-como-primitivas.md)) | Componentes propios; otra librería (MUI, Chakra) | Accesibles, tipadas y con variantes sin escribirlas †. Costo: los archivos generados no se editan a mano salvo el ajuste táctil, para no divergir del CLI |
| **Tres carpetas en vez de Atomic Design completo** ([ADR 0006](../adr/0006-organizacion-por-dominio.md)) | atoms/molecules/organisms/templates/pages | "Molecule" vs "organism" es subjetivo y rara vez cambia una decisión de código † |
| **Tema solo oscuro con azul de marca** ([ADR 0008](../adr/0008-tema-oscuro-y-shell-de-aplicacion.md)) | Modo claro y oscuro con selector; tema del sistema | Un solo conjunto de tokens que mantener y verificar. Costo: no hay modo claro |
| **Geist en vez de la fuente del sistema** | Fuente del sistema | Viene de la plantilla de Create Next App y se autoaloja (verificable en `src/app/layout.tsx`). Por qué se conservó en vez de la fuente del sistema: motivo no registrado |
| **Blancos táctiles de 44 px en móvil** | Tamaños compactos también en móvil | Usable con el pulgar †; a cambio, más altura en móvil. La medida de 44 px consta en el código de `Button` e `Input` |

## Criterios de aceptación

- [x] Todas las pantallas usan las primitivas de `components/ui/` en vez de reimplementar botones o inputs.
- [x] La app es solo oscura: `<html class="dark">` y ninguna pantalla cambia de tema.
- [x] En móvil aparece la barra inferior con 4 destinos y no hay scroll horizontal; desde `md` la navegación está en la barra superior.
- [x] `AppShell` no importa componentes de `features/`: recibe el botón "+" como función `fab(viewer)`. (Excepciones conocidas: `HeaderAccount` → `LoginDrawer` y `AccountDrawer` → `signOut`, de `features/auth`.)
- [x] Los botones e inputs miden 44 px en móvil.

## Limitaciones conocidas y deuda

| Tema | Detalle |
| :--- | :--- |
| Piezas prometidas y no construidas | El diseño original preveía `TagList`, `EmptyState` y `UserAvatarWithName` en `components/shared/`. **No existen**: los tags no se muestran a los lectores (ver [PRD-2](PRD-2-posts.md)) y cada pantalla dibuja su estado vacío en línea |
| Mezcla de idiomas en la interfaz | La app está en español, pero `AccountSettings` y `AuthorProfileView` tienen textos en inglés ("Account", "Edit profile", "Activity", "Subscriptions"). No hay una capa de i18n |
| El shell depende de `features/auth` | `HeaderAccount` importa `LoginDrawer` y `AccountDrawer` importa `signOut`, contra la regla "`shared/` no importa de `features/`". Solo el botón "+" respeta el patrón de pasar la pieza como función (`fab(viewer)`). Para cumplir la regla, el layout debería inyectarlos igual que el botón |
| Estilos repetidos | Varias pantallas repiten clases como `bg-neutral-800`/`bg-[#161618]` en vez de usar tokens; conviene extraerlos si se sigue creciendo |

## Pruebas

| Tipo | Cobertura |
| :--- | :--- |
| Unitarias | `src/components/shared/navigation.test.ts` (títulos de página y ruta activa), `src/lib/format.test.ts` |
| e2e | `e2e/shell.spec.ts` cubre el shell (header, barra inferior, móvil vs escritorio). **Está desactualizado**: espera la barra inferior con "Inicio, Mis posts, Perfil" y el botón "+" creando un borrador, cuando hoy son 4 destinos y el "+" abre una nota |
