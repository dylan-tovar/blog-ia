-- Bloquea la edición de artículos ya publicados: hoy `savePostContent` podía
-- pisar título/contenido de un artículo publicado sin volver a pasar por
-- moderación (la IA solo re-revisa contenido publicado cuando alguien lo
-- reporta, nunca cuando el propio autor lo edita). Vive en la base (y no solo
-- en la Server Action) para cubrir a cualquier escritor, igual que
-- posts_invalidate_ai_cache (migración 0007). Las notas quedan afuera: pueden
-- seguir editándose publicadas (migración 0006).
create or replace function public.posts_block_published_edits ()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'published'
     and old.type = 'article'
     and (new.title is distinct from old.title or new.content is distinct from old.content) then
    raise exception 'Cannot edit title/content of a published post';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_block_published_edits on public.posts;
create trigger posts_block_published_edits
  before update on public.posts
  for each row
  when (
    old.status = 'published'
    and old.type = 'article'
    and (new.title is distinct from old.title or new.content is distinct from old.content)
  )
  execute function public.posts_block_published_edits ();
