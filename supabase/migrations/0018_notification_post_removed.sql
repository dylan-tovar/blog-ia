-- Reportar publicaciones (PostOptionsDrawer): si la IA confirma que un post
-- reportado viola las normas, se borra y se avisa al autor por notificación
-- in-app. Sin actor humano (lo borra el sistema) y con el motivo de la IA.

alter table public.notifications
  alter column actor_id drop not null;

alter table public.notifications
  drop constraint notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('follow', 'like', 'note', 'post_removed'));

alter table public.notifications
  add column reason text;
