# 0006. Organización por dominio en `src/features`

- **Estado:** Aceptada
- **Fuentes:** [PRD-global](../PRD-global-vision.md) sección 11; [PRD-0](../prds/PRD-0-design-system.md) (secciones «Dónde vive cada componente» y «Estructura de carpetas»); `src/features/`

## Contexto

Agrupar por tipo técnico (todos los componentes juntos, todas las actions juntas) dispersa el código de una misma funcionalidad.

## Decisión

El código específico de cada dominio vive en `src/features/<dominio>/` (componentes, actions, queries, schemas). Lo genérico va a `src/components/ui/` y lo transversal a `src/lib/`. Se empieza plano y se subdivide solo cuando el tamaño lo justifique.

Dominios existentes: `auth`, `posts`, `profile`, `subscriptions`. Dominios previstos: `ai`, `recommendations` (planificados).

Estado real (al momento de aceptar el ADR, con los cuatro dominios entonces existentes): los cuatro dominios ya tienen una subcarpeta `components/` y archivos planos `actions.ts`, `schemas.ts` y, en `posts`, `queries.ts` y `utils.ts`. Los tests unitarios se ubican junto al archivo (`schemas.test.ts`).

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Carpetas por tipo (`components/`, `actions/`, `hooks/` globales) | Un cambio de feature toca muchas carpetas |
| Subcarpetas rígidas dentro de cada feature desde el inicio | Carpetas casi vacías; se subdivide cuando el código lo pida |

## Consecuencias

- **A favor:** un cambio de feature queda localizado en una carpeta.
- **En contra:** el criterio de "cuándo subdividir" es de juicio; ya se aplicó con `components/`.
- **Cuándo revisar:** si un dominio supera el tamaño manejable o dos dominios comparten demasiado código.

## Actualización (2026-09-20)

Los dominios "previstos" ya existen. Hoy `src/features/` contiene `ai`, `auth`, `likes`, `posts`, `profile`, `recommendations` y `subscriptions`. `ai` es el más grande (unas dos docenas de módulos planos, más `components/` y `components/chat/`) y varios archivos de la capa de IA se importan desde `posts` y viceversa: el editor (`posts/components/editor/`) define el modelo de bloques que usa el chat (`ai/`), y `ai/chat-stream.ts` y `ai/prompts.ts` importan de él el tipo `Block` y `fitBlocks`. Es un acoplamiento que existe por diseño del protocolo de edición ([ADR 0014](0014-aplicacion-de-ediciones-en-el-cliente-con-fingerprints.md)), pero es el primer candidato si se replantea la frontera entre dominios. Además existe `src/hooks/` para hooks transversales (`use-is-desktop`, `use-visual-viewport-style`).
