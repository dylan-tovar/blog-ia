# 0007. Login por username resuelto en el servidor con la secret key

- **Estado:** Aceptada
- **Fecha:** 2026-09-19
- **Fuentes:** `supabase/migrations/0004_username.sql`, `src/features/auth/actions.ts`, `src/lib/supabase/admin.ts`

## Contexto

Se quiere iniciar sesión con email o con `username`. Supabase Auth solo autentica por email, y el email vive en `auth.users`, que la API pública no expone. `profiles` es de lectura pública (ADR 0003), así que cualquier dato que se agregue ahí es visible para todos.

## Decisión

`signIn` resuelve `username` a email **solo en el servidor**, con un cliente de la secret key (`SUPABASE_SECRET_KEY`, rol `service_role`) que llama a la función SQL `login_email_for_username`. La función es `security definer`, con `search_path` vacío, y solo `service_role` tiene `execute`. El email nunca llega al navegador. Un identificador con `@` es un email; un username no puede contener `@` (`usernameSchema`), así que no hay ambigüedad.

Un username inexistente y una contraseña incorrecta devuelven el mismo `Credenciales inválidas.`, y el username inexistente igual llama a Auth con una dirección reservada (`.invalid`) para no revelar por tiempo de respuesta qué usuarios existen.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Guardar el email en `profiles` | `profiles` es pública: expone el email de todos |
| Función RPC ejecutable por `anon` | Cualquiera que conozca un username obtiene su email |
| Login solo por email | No cumple el pedido |

## Consecuencias

- **A favor:** el email no se filtra; el login por email sigue funcionando sin la secret key; los errores no permiten enumerar usuarios.
- **En contra:** hay una segunda clave que proteger (`SUPABASE_SECRET_KEY` salta RLS); `signUp` chequea el username antes de crear el usuario y hay una carrera mínima entre el chequeo y el insert.
- **Cuándo revisar:** si se pasa a un trigger que cree el perfil (ver ADR 0003) o si Supabase ofrece login por identificador propio.
