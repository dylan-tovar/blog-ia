-- Avatar de perfil: bucket público de Supabase Storage + políticas RLS, más el
-- CHECK que ata `avatar_url` a la carpeta propia del usuario. Mismo patrón que
-- `post-images` (0008) y `posts.cover_image_url` (0009). Correr en el SQL Editor
-- de Supabase (Dashboard > SQL Editor). Es re-ejecutable.

-- 1. Bucket público. Los objetos se sirven por URL pública sin pasar por RLS, así que
-- no hace falta una política de SELECT abierta (evita que cualquiera liste archivos).
-- El límite de tamaño y los tipos MIME los valida Storage, no solo el cliente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatar-images',
  'avatar-images',
  true,
  2097152,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Escritura solo dentro de la carpeta propia: el primer segmento del path es el
-- id del usuario (`<uid>/<uuid>-<w>x<h>.webp`). Un usuario no puede subir ni
-- borrar archivos de otro.
drop policy if exists "Users can upload their own avatar images" on storage.objects;
create policy "Users can upload their own avatar images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatar-images'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  );

-- SELECT acotado a la carpeta propia: Storage lo necesita para borrar.
-- La lectura pública del avatar no depende de esta política (bucket público).
drop policy if exists "Users can view their own avatar images" on storage.objects;
create policy "Users can view their own avatar images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatar-images'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  );

-- Sin política de UPDATE: cada subida usa un nombre con UUID nuevo (`upsert: false`);
-- el reemplazo se hace borrando el objeto anterior, nunca sobrescribiéndolo.
drop policy if exists "Users can update their own avatar images" on storage.objects;

drop policy if exists "Users can delete their own avatar images" on storage.objects;
create policy "Users can delete their own avatar images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatar-images'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  );

-- 3. Integridad. El avatar debe vivir en la carpeta del propio dueño del perfil: el
-- bucket es público, así que sin esto alguien podría apuntar su avatar a la imagen
-- de otro usuario. La app valida lo mismo (server action); esto es la red de
-- seguridad de la base.
alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles
  add constraint profiles_avatar_url_check
  check (
    avatar_url is null
    or (
      char_length (avatar_url) <= 500
      and avatar_url like ('%/storage/v1/object/public/avatar-images/' || id::text || '/%')
    )
  );
