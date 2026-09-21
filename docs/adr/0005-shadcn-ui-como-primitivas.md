# 0005. shadcn/ui como primitivas en `components/ui`

- **Estado:** Aceptada
- **Fuentes:** [PRD-0](../prds/PRD-0-design-system.md) (sección «Primitivas de UI disponibles»); `components.json`; `src/components/ui/`

## Contexto

Login, editor y demás pantallas necesitan botones, inputs y cards accesibles y consistentes. Escribirlos a mano duplicaría lo que el CLI de shadcn ya genera.

## Decisión

Las primitivas viven en `src/components/ui/` y las genera el CLI de shadcn:

```bash
pnpm dlx shadcn@latest add <componente>
```

No se editan a mano salvo para ajustar variantes ya generadas. Los archivos conservan el nombre en minúscula que produce el CLI (`button.tsx`, `input.tsx`), como excepción a la convención `PascalCase` de los componentes propios (`PostEditor.tsx`), para no divergir cuando `shadcn add` vuelva a tocarlos.

En el código: `components.json` usa el estilo `base-nova` con `@base-ui/react`, `lucide` como librería de íconos y el alias `@/components/ui`. Existen `avatar`, `badge`, `button`, `card`, `dialog`, `drawer`, `dropdown-menu`, `input`, `label` y `textarea`. `dialog` y `dropdown-menu` traen textos en inglés ("Close"), así que los usos propios pasan `showCloseButton={false}` y ponen su propio botón en español en vez de editar el archivo generado. El único ajuste manual es el alto por defecto de `Button` e `Input` (44 px en mobile).

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Componentes propios | Duplica trabajo ya resuelto (accesibilidad, tipado, variantes) |
| Atomic Design con 5 categorías | La frontera molécula/organismo es subjetiva; alcanza con `ui/`, `shared/` y `features/<dominio>/components/` |

## Consecuencias

- **A favor:** UI consistente con poco código propio.
- **En contra:** la API depende del estilo elegido; por ejemplo, con `base-nova` el botón usa la prop `render` (ver `src/app/not-found.tsx`).
- **Cuándo revisar:** si se necesita un sistema de tokens propio (dark mode, marca blanca).

## Actualización (2026-09-20)

`src/components/ui/` sumó `bubble`, `marker` y `message` para la conversación del chat de IA ([PRD-8](../prds/PRD-8-ai-chat.md)); siguen la misma convención que el resto (nombre en minúscula, atributos `data-slot`, `cn` desde `lib/utils`). No se verificó si los generó el CLI de shadcn o se escribieron a mano, así que al actualizarlos con `shadcn add` conviene revisar el diff. Los usos propios de `dialog` y `dropdown-menu` siguen pasando `showCloseButton={false}` con su propio botón en español.

## Actualización (2026-09-20): origen de `cn`

La nota anterior dice que las primitivas usan `cn` desde `lib/utils`. En el código, los 13 archivos de `src/components/ui/` importan `cn` directamente del paquete `cn` (dependencia `"cn": "^0.3.0"` en `package.json`), y `src/lib/utils.ts` solo lo re-exporta (`export { cn } from "cn"`). Ambos caminos resuelven a la misma función; la convención vigente en `ui/` es importar del paquete. La decisión de este ADR no cambia.
