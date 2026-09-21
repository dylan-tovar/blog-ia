# PRD-0.2 — Primitivas de UI (`components/ui`)

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-0 — Sistema de diseño](PRD-0-design-system.md) |
| Dificultad | B (básica) |
| Esfuerzo | M (2 puntos, 2 a 3 días leyendo y probando) |
| Dueño sugerido | D5 |
| Mentor | D2 |
| Depende de | [PRD-0.1](PRD-0.1-theme-tokens.md) (los colores que usan) |
| Código | `src/components/ui/*.tsx` (13 archivos), `components.json`, `src/lib/utils.ts` |
| ADRs | [0005](../adr/0005-shadcn-ui-como-primitivas.md) |

## Resumen

Los "ladrillos" visuales que usa toda la app: botón, campo de texto, tarjeta, insignia, avatar, ventanas modales, cajones inferiores, menús y tres piezas para el chat de IA. Se apoyan en shadcn/ui y en `@base-ui/react`. Quien asuma este paquete debe poder decir qué hace cada pieza, cómo se cambia su aspecto con `variant` y `size`, y por qué casi nadie las edita a mano.

## Qué necesitás entender antes

- [ ] Qué es un **componente React** que recibe **props** (`<Button variant="outline">`).
- [ ] Qué es `className` y que Tailwind arma el aspecto con clases.
- [ ] Idea de **variantes**: un mismo componente con varias apariencias (`default`, `outline`, `ghost`...).
- [ ] Qué es un **componente controlado** (`open` + `onOpenChange`), solo para Dialog y Drawer.

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Los 13 archivos de `src/components/ui/` | Componentes de una feature (`PostCard`, `PostEditor`): viven en cada dominio |
| Cómo se agregan piezas nuevas (CLI de shadcn) | Colores y tema: [PRD-0.1](PRD-0.1-theme-tokens.md) |
| El ajuste táctil de 44 px | Barra de navegación y menú de cuenta: [PRD-0.3](PRD-0.3-app-shell.md) |
| `bubble`, `marker`, `message` (definición) | Cómo el chat las compone: [PRD-8.2](PRD-8.2-chat-drawer-ui.md) |

## Cómo funciona

### Las piezas

| Archivo | Qué es | Variantes o partes |
| :--- | :--- | :--- |
| `button.tsx` | Botón | `variant`: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`. `size`: `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg` |
| `input.tsx`, `textarea.tsx`, `label.tsx` | Campos de formulario y su etiqueta | Sin variantes |
| `card.tsx` | Tarjeta | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` |
| `badge.tsx` | Insignia (estado de un post, tags) | `default`, `secondary`, `destructive`, `outline`, `ghost`, `link` |
| `avatar.tsx` | Círculo con imagen o iniciales | `size`: `default`, `sm`, `lg`. La app solo usa el texto de reemplazo (iniciales), ver `UserAvatar` en [PRD-0.3](PRD-0.3-app-shell.md) |
| `dialog.tsx` | Ventana modal centrada | `DialogContent` acepta `showCloseButton` (por defecto `true`) |
| `drawer.tsx` | Cajón que sube desde abajo (móvil) | `Drawer`, `DrawerTrigger`, `DrawerContent`, `DrawerHeader`, `DrawerTitle`, `DrawerDescription`, `DrawerFooter`, `DrawerClose`, `DrawerSwipeHandle` |
| `dropdown-menu.tsx` | Menú desplegable | Varias partes |
| `bubble.tsx`, `message.tsx`, `marker.tsx` | Burbuja, mensaje y marcador de la conversación del chat | `Bubble`: `default`, `secondary`, `muted`, `tinted`, `outline`, `ghost`, `destructive` |

### Cómo leer un archivo (ejemplo `button.tsx`)

1. `cva(...)` (de `class-variance-authority`) define una **base** de clases y un mapa de `variants`. Es lo que traduce `variant="outline"` a clases concretas.
2. La función `Button` recibe `variant`, `size`, `className` y el resto de props.
3. Usa `ButtonPrimitive` de `@base-ui/react/button`: un botón accesible (teclado, foco) ya resuelto.
4. Con la prop `render`, un botón puede dibujarse como otro elemento, por ejemplo un enlace: `<Button render={<Link href="/register" />}>`. Como un `<a>` no es un `<button>`, `Button` calcula `nativeButton` para que Base UI no avise: si `render` es un elemento cuyo tipo no es `"button"`, pasa `nativeButton={false}`.
5. **Estado de carga:** no hay un componente `Spinner`. Se arma en cada uso con el icono `Loader2` de `lucide-react` y `disabled` (por ejemplo en `LoginForm.tsx`).

### El ajuste táctil

`Button` (`size` `default` y `lg`) e `Input` miden `h-11` (44 px) en móvil y bajan a `md:h-9` o `md:h-10` desde 768 px. 44 px es el tamaño mínimo cómodo para un dedo. Es la única modificación deliberada sobre lo que generó el CLI (la registra [ADR 0005](../adr/0005-shadcn-ui-como-primitivas.md)).

### Cómo se agrega una pieza

```bash
pnpm dlx shadcn@latest add <componente>
```

El CLI lee `components.json` (estilo `base-nova`, iconos `lucide`, alias `@/components/ui`) y crea el archivo en `src/components/ui/`. Los nombres quedan en minúscula (`button.tsx`) tal como salen del CLI, a diferencia de los componentes propios en `PascalCase`.

### Discrepancia detectada: de dónde viene `cn`

`cn` es la función que junta clases de Tailwind resolviendo conflictos. Hoy:

- Los **13** archivos de `ui/` la importan de `"cn"`, un **paquete de terceros** (`"cn": "^0.3.0"` en `package.json`, descrito como reemplazo de `clsx` + `tailwind-merge`).
- `src/lib/utils.ts` solo hace `export { cn } from "cn"`, y las features la importan de `@/lib/utils`.
- Ninguno de los archivos de `ui/` importa de `@/lib/utils`, y `package.json` no tiene `clsx` ni `tailwind-merge`.

El [ADR 0005](../adr/0005-shadcn-ui-como-primitivas.md) dice en su nota de actualización que las piezas nuevas usan "`cn` desde `lib/utils`"; el código no coincide. Por qué se eligió ese paquete en lugar del `cn` habitual de shadcn: motivo no registrado †. Consecuencia práctica: un `shadcn add` puede traer un archivo que importe `cn` de otra forma y haya que ajustarlo.

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **shadcn/ui como base** ([ADR 0005](../adr/0005-shadcn-ui-como-primitivas.md)) | Componentes propios; otra librería | Accesibilidad, tipado y variantes ya resueltos. Costo: la API depende del estilo elegido (por ejemplo `render` en `base-nova`) |
| **No editar a mano lo generado**, salvo el ajuste táctil | Personalizar cada archivo | Se pueden regenerar sin perder cambios. Registrado en ADR 0005 |
| **`bubble`, `message`, `marker`** propias del chat | Estilar el chat con clases sueltas | Si las generó el CLI o se escribieron a mano no se verificó ([ADR 0005](../adr/0005-shadcn-ui-como-primitivas.md)) |
| **Botones de 44 px en móvil** | Compactos también en móvil | Cómodo con el pulgar †; a cambio, más altura |

## Criterios de aceptación

- [ ] Existen los 13 archivos de `src/components/ui/` y cada pantalla usa estas piezas en lugar de reimplementar botones o inputs.
- [ ] `Button` respeta los seis `variant` y los tamaños listados.
- [ ] `Button` y `Input` miden 44 px de alto por debajo de 768 px y bajan a 36 o 40 px después.
- [ ] `<Button render={<Link href="..." />}>` produce un enlace sin errores en la consola del navegador.
- [ ] Quien asume el paquete puede agregar una pieza nueva con el CLI y explicar dónde queda.

## Cómo verificarla a mano

1. `pnpm dev`, abrir `/login` y `/register`: ver `Input`, `Label`, `Button` y `Card` en uso.
2. En F12 → modo dispositivo móvil (360 px), inspeccionar un `Input`: su alto debe ser 44 px. Ampliar la ventana a más de 768 px: baja a 36 px.
3. Abrir el menú de cuenta (avatar de la barra superior): es un `Drawer`. Abrir "Crear" → "Nota": es un `Dialog`.
4. Abrir `/post/<id>` de un artículo y mirar el estado de un post en `/posts`: son `Badge`.
5. Buscar en el código un `render={<Link` y comprobar que no aparecen advertencias de `nativeButton` en la consola.
6. `pnpm test` y `pnpm lint`. No hay tests propios de las primitivas.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Documentar en una tabla (en este archivo) qué pieza de `ui/` usa cada feature (`rg "components/ui/<pieza>"`) | B |
| `dialog.tsx` trae el texto "Close" en inglés dentro de `sr-only` (línea 75) para lectores de pantalla. Revisar qué `DialogContent` de la app dejan `showCloseButton` en `true` (`NoteDialog.tsx`, `EditNoteDialog.tsx`) y proponer cómo traducirlo | B |
| Aclarar la discrepancia de `cn`: decidir si se deja el paquete `cn` o se vuelve al patrón habitual de shadcn, y actualizar el ADR 0005 con una nota. Requiere consultar a [D1] | M |
| Probar `pnpm dlx shadcn@latest add <pieza>` en una rama de prueba y anotar qué archivos cambia y si conserva el ajuste de 44 px | M |

## Preguntas de autoevaluación

1. ¿Qué hace `cva` y qué gana `Button` con él frente a escribir `if`/`else` con clases?
2. ¿Por qué `Button` recibe `render` y para qué se calcula `nativeButton`?
3. ¿Por qué los archivos de `ui/` están en minúscula y los demás componentes en `PascalCase`?
4. ¿Cuál es la única modificación manual permitida sobre lo generado y por qué existe?
5. ¿Qué diferencia hay entre `Dialog` y `Drawer` y dónde se usa cada uno en la app?
6. ¿De dónde sale `cn` en este proyecto y qué riesgo trae que no sea el habitual de shadcn?
