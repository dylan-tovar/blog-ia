-- Habilita Supabase Realtime (postgres_changes) sobre notifications.
-- La autorización sigue siendo RLS (notifications_select_own): un canal
-- Realtime solo entrega al cliente las filas que su JWT ya podría leer,
-- así que no se agrega ninguna policy nueva acá.
--
-- replica identity full es necesario para que el payload de UPDATE incluya
-- las columnas no-clave de la fila anterior (`old`). Con el default
-- (DEFAULT, solo primary key), `old.read_at` llega undefined y el cliente
-- no puede distinguir "paso de no-leída a leída" de ningún otro UPDATE.
alter table public.notifications replica identity full;

-- Re-ejecutable: alter publication ... add table falla si la tabla ya es
-- miembro (a diferencia de create/drop ... if exists), así que se guarda
-- contra eso explícitamente, siguiendo la convención de migraciones
-- idempotentes del repo (ver 0011_notifications.sql).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
