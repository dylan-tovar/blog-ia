-- PRD 5 y 6: funciones de IA (caché de resultados), integridad de escritura de `posts`
-- y límite de peticiones por minuto. Correr en el SQL Editor de Supabase
-- (Dashboard > SQL Editor). Es re-ejecutable.

-- 1. Columnas de caché de IA (solo las escribe el servidor con service_role)
alter table public.posts add column if not exists ai_generated_summary text;
alter table public.posts add column if not exists ai_generated_titles jsonb;
alter table public.posts add column if not exists content_score jsonb;

-- 2. Invalidación del caché: si cambia el contenido, los resultados de IA quedan
-- obsoletos. Vive en la base (y no en las Server Actions) para cubrir a cualquier
-- escritor. También sube `updated_at`, que se usa como versión en el compare-and-set.
create or replace function public.posts_invalidate_ai_cache ()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.content is distinct from old.content then
    new.ai_generated_summary := null;
    new.ai_generated_titles := null;
    new.content_score := null;
    new.updated_at := now ();
  end if;
  return new;
end;
$$;

drop trigger if exists posts_invalidate_ai_cache on public.posts;
create trigger posts_invalidate_ai_cache
  before update on public.posts
  for each row execute function public.posts_invalidate_ai_cache ();

-- 3. Integridad de `posts`: privilegios por columna. Con la anon key pública,
-- un autor podía hacer `update posts set status = 'published'` y saltarse la
-- moderación. Ahora el cliente solo escribe las columnas de contenido; `status`,
-- `published_at`, `rejection_reason` y las columnas `ai_*` las escribe el servidor
-- con service_role (que no se ve afectado por estos revoke).
revoke insert, update on public.posts from anon, authenticated;

-- INSERT: createDraftPost (artículo), createNote (nota)
grant insert (author_id, type, title, content, status, published_at, parent_post_id)
  on public.posts to authenticated;

-- UPDATE: savePostContent (artículo) y updateNote (nota). `updated_at` NO se concede:
-- lo mueve solo el trigger de arriba cuando cambia `content`, así que significa "fecha del
-- último cambio de contenido" y sirve de versión para el compare-and-set del caché y de la
-- moderación (el cliente no puede falsearla ni moverla con un cambio de título).
grant update (title, content)
  on public.posts to authenticated;

-- 4. INSERT: un artículo solo puede nacer como borrador (no como `published`).
-- No consulta `posts` desde la política de `posts` (evita 42P17); la validación
-- del padre sigue en la función security definer `can_attach_note`.
drop policy if exists "Users can create their own posts" on public.posts;
create policy "Users can create their own posts"
  on public.posts for insert
  with check (
    author_id = auth.uid ()
    and (type = 'note' or status = 'draft')
    and (
      parent_post_id is null
      or public.can_attach_note (parent_post_id)
    )
  );

-- 5. Contadores del límite de peticiones a la IA (ventana fija de 1 minuto).
-- RLS habilitada y SIN políticas: solo se accede desde la función de abajo.
create table if not exists public.ai_rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

alter table public.ai_rate_limits enable row level security;
revoke all on public.ai_rate_limits from anon, authenticated;

-- 6. Registra una petición y dice si está permitida. Primero cuenta contra el
-- usuario: si ya lo superó, rechaza SIN tocar el contador global (un usuario no
-- puede agotar la cuota de todos). Solo lo llama el servidor (service_role), que arma las
-- claves (`user:<id>`, `moderation:user:<id>`), así que no hay forma de suplantarlas desde
-- el cliente. `p_global_key` permite carriles separados: la moderación al publicar usa su
-- propio contador global para que las funciones de asistencia no puedan agotarlo.
drop function if exists public.ai_rate_limit_hit (text, int, int);

create or replace function public.ai_rate_limit_hit (
  p_user_key text,
  p_user_limit int,
  p_global_limit int,
  p_global_key text default 'global'
)
returns table (allowed boolean, scope text, retry_after int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc ('minute', now ());
  v_retry int := greatest (
    1,
    ceil (extract (epoch from (v_window + interval '1 minute' - now ())))::int
  );
  v_count int;
begin
  -- Limpieza oportunista de ventanas viejas
  if random () < 0.02 then
    delete from public.ai_rate_limits where window_start < now () - interval '1 hour';
  end if;

  insert into public.ai_rate_limits as l (key, window_start, count)
  values (p_user_key, v_window, 1)
  on conflict (key, window_start) do update set count = l.count + 1
  returning l.count into v_count;

  if v_count > p_user_limit then
    return query select false, 'user'::text, v_retry;
    return;
  end if;

  insert into public.ai_rate_limits as l (key, window_start, count)
  values (p_global_key, v_window, 1)
  on conflict (key, window_start) do update set count = l.count + 1
  returning l.count into v_count;

  if v_count > p_global_limit then
    return query select false, 'global'::text, v_retry;
    return;
  end if;

  return query select true, null::text, 0;
end;
$$;

revoke all on function public.ai_rate_limit_hit (text, int, int, text) from public, anon, authenticated;
grant execute on function public.ai_rate_limit_hit (text, int, int, text) to service_role;
