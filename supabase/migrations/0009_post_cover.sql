-- Portada de artículos: imagen (del bucket `post-images`) o un texto sobre un color, que se
-- muestran en la tarjeta del feed. Correr en el SQL Editor de Supabase. Es re-ejecutable.

-- 1. Columnas. Todas opcionales: sin portada, la tarjeta se ve igual que antes.
alter table public.posts add column if not exists cover_image_url text;
alter table public.posts add column if not exists cover_text text;
alter table public.posts add column if not exists cover_color text;

-- 2. Integridad. La imagen debe vivir en la carpeta del propio autor del artículo: el bucket
-- es público, así que sin esto alguien podría apuntar su portada a la imagen de otro usuario.
-- La app valida lo mismo (schema + server action); esto es la red de seguridad de la base.
alter table public.posts drop constraint if exists posts_cover_image_url_check;
alter table public.posts
  add constraint posts_cover_image_url_check
  check (
    cover_image_url is null
    or (
      char_length (cover_image_url) <= 500
      and cover_image_url like ('%/storage/v1/object/public/post-images/' || author_id::text || '/%')
    )
  );

alter table public.posts drop constraint if exists posts_cover_text_check;
alter table public.posts
  add constraint posts_cover_text_check
  check (cover_text is null or char_length (cover_text) between 1 and 200);

-- Paleta cerrada (con texto blanco): contraste garantizado y sin colores arbitrarios.
-- Si se agrega un color, hay que actualizar también `cover-palette.ts`.
alter table public.posts drop constraint if exists posts_cover_color_check;
alter table public.posts
  add constraint posts_cover_color_check
  check (
    cover_color is null
    or cover_color in ('slate', 'olive', 'wine', 'forest', 'navy', 'plum', 'rust', 'teal')
  );

-- Solo los artículos tienen portada; las notas siempre quedan sin ella.
alter table public.posts drop constraint if exists posts_cover_article_only_check;
alter table public.posts
  add constraint posts_cover_article_only_check
  check (
    type = 'article'
    or (cover_image_url is null and cover_text is null and cover_color is null)
  );

-- 3. Privilegios por columna (ver 0007): sin este grant, guardar la portada falla con
-- "permission denied". Solo UPDATE: la portada se elige al publicar, nunca al crear el borrador.
grant update (cover_image_url, cover_text, cover_color) on public.posts to authenticated;
