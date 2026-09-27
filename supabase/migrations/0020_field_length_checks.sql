-- Cierra los gaps de límite de longitud documentados en docs/guides/limites-de-campos.md:
-- title y content de artículo, tags.name y profiles.display_name ya tenían límite en
-- Next.js (Zod + maxLength) pero no en la base. Los cuatro usan NOT VALID: puede haber
-- filas existentes que superen el nuevo límite; el CHECK aplica desde ahora en adelante,
-- igual que posts_note_length_check en 0005_post_types_and_likes.sql.

alter table public.posts drop constraint if exists posts_title_check;
alter table public.posts
  add constraint posts_title_check
  check (title is null or char_length (title) <= 200) not valid;

alter table public.posts drop constraint if exists posts_article_content_check;
alter table public.posts
  add constraint posts_article_content_check
  check (type <> 'article' or char_length (content) <= 100000) not valid;

alter table public.tags drop constraint if exists tags_name_check;
alter table public.tags
  add constraint tags_name_check
  check (char_length (name) <= 50) not valid;

alter table public.profiles drop constraint if exists profiles_display_name_check;
alter table public.profiles
  add constraint profiles_display_name_check
  check (char_length (display_name) <= 200) not valid;
