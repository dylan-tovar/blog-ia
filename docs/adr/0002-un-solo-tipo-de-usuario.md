# 0002. Un solo tipo de usuario, sin roles

- **Estado:** Aceptada
- **Fuentes:** [PRD-global](../PRD-global-vision.md) sección 2; [PRD-1](../prds/PRD-1-auth.md) (sección «Alcance / fuera de alcance»); `supabase/migrations/0001_profiles.sql`

## Contexto

Plataformas como Substack no obligan a elegir entre "autor" y "lector". Modelar dos roles exigiría flujos de conversión y dos experiencias de onboarding que no aportan al objetivo del proyecto.

## Decisión

Toda cuenta autenticada puede leer, seguir y publicar. "Autor" es un estado derivado: un usuario es autor si tiene posts publicados. Se calcula, no se guarda.

En el código: la tabla `profiles` no tiene columna de rol, y las políticas RLS de `posts` se expresan siempre como "dueño del recurso" (`author_id = auth.uid()`).

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Rol `author` / `reader` en `profiles` | Obliga a resolver la conversión lector a autor y si un autor puede suscribirse a otros |
| Dos tipos de cuenta con onboarding separado | Duplica flujos sin aportar a las funciones de IA que el proyecto quiere demostrar |

## Consecuencias

- **A favor:** un solo flujo de registro; RLS más simple (dueño vs. no dueño).
- **En contra:** no hay permisos diferenciados; un rol de moderación o administración requeriría reabrir esta decisión.
- **Cuándo revisar:** si se necesita un panel de administración o permisos por tipo de cuenta.
