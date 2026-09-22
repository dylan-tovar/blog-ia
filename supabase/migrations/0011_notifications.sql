-- PRD: Activity/Notifications. Tabla `notifications` alimentada por triggers cuando
-- alguien sigue, le da like a un post o deja una nota. Correr en el SQL Editor de
-- Supabase (Dashboard > SQL Editor). Es re-ejecutable.

-- 1. Tabla. RLS habilitada y SIN políticas de insert/delete para authenticated/anon:
-- solo la escriben las funciones SECURITY DEFINER de abajo, disparadas por trigger.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid (),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('follow', 'like', 'note')),
  -- 'like': post likeado. 'note': post padre (para navegar al hilo). 'follow': null.
  post_id uuid references public.posts (id) on delete cascade,
  -- Solo 'note': la nota en sí. Borrar la nota borra esta fila por el cascade.
  note_id uuid references public.posts (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now ()
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid () = recipient_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid () = recipient_id)
  with check (auth.uid () = recipient_id);

-- 2. Follow → notificación. `security definer` porque `notifications` no tiene
-- política de insert para `authenticated`: RLS es la única autorización, y solo
-- estas funciones pueden escribir la tabla (mismo patrón que
-- `posts_invalidate_ai_cache` en 0007_ai_features.sql).
create or replace function public.notify_on_follow ()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.follower_id <> new.author_id then
    insert into public.notifications (recipient_id, actor_id, type)
    values (new.author_id, new.follower_id, 'follow');
  end if;
  return new;
end;
$$;

drop trigger if exists subscriptions_notify_follow on public.subscriptions;
create trigger subscriptions_notify_follow
  after insert on public.subscriptions
  for each row execute function public.notify_on_follow ();

-- Unfollow → borra la notificación de follow correspondiente (si no, quedaría una
-- notificación de "te sigue" stale después de dejar de seguir).
create or replace function public.notify_on_unfollow ()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications
  where recipient_id = old.author_id
    and actor_id = old.follower_id
    and type = 'follow';
  return old;
end;
$$;

drop trigger if exists subscriptions_notify_unfollow on public.subscriptions;
create trigger subscriptions_notify_unfollow
  after delete on public.subscriptions
  for each row execute function public.notify_on_unfollow ();

-- 3. Like → notificación al autor del post.
create or replace function public.notify_on_like ()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author_id uuid;
begin
  select author_id into v_author_id from public.posts where id = new.post_id;

  if v_author_id is not null and v_author_id <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    values (v_author_id, new.user_id, 'like', new.post_id);
  end if;

  return new;
end;
$$;

drop trigger if exists likes_notify_like on public.likes;
create trigger likes_notify_like
  after insert on public.likes
  for each row execute function public.notify_on_like ();

-- Unlike → borra la notificación de like correspondiente.
create or replace function public.notify_on_unlike ()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications
  where actor_id = old.user_id
    and post_id = old.post_id
    and type = 'like';
  return old;
end;
$$;

drop trigger if exists likes_notify_unlike on public.likes;
create trigger likes_notify_unlike
  after delete on public.likes
  for each row execute function public.notify_on_unlike ();

-- 4. Nota adjunta a un post → notificación al autor del post padre. `note_id`
-- apunta a la nota misma: borrarla (deleteNote) borra esta fila por el cascade,
-- así que no hace falta un trigger de DELETE acá.
create or replace function public.notify_on_note ()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author_id uuid;
begin
  select author_id into v_author_id from public.posts where id = new.parent_post_id;

  if v_author_id is not null and v_author_id <> new.author_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id, note_id)
    values (v_author_id, new.author_id, 'note', new.parent_post_id, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists posts_notify_note on public.posts;
create trigger posts_notify_note
  after insert on public.posts
  for each row
  when (new.type = 'note' and new.parent_post_id is not null)
  execute function public.notify_on_note ();
