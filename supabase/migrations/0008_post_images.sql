-- Imágenes de artículos: bucket público de Supabase Storage + políticas RLS.
-- Correr en el SQL Editor de Supabase (Dashboard > SQL Editor). Es re-ejecutable.

-- 1. Bucket público. Los objetos se sirven por URL pública sin pasar por RLS, así que
-- no hace falta una política de SELECT abierta (evita que cualquiera liste archivos).
-- El límite de tamaño y los tipos MIME los valida Storage, no solo el cliente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-images',
  'post-images',
  true,
  2097152,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Escritura solo dentro de la carpeta propia: el primer segmento del path es el
-- id del usuario (`<uid>/<uuid>-<w>x<h>.webp`). Un usuario no puede subir, pisar ni
-- borrar archivos de otro.
drop policy if exists "Users can upload their own post images" on storage.objects;
create policy "Users can upload their own post images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  );

-- SELECT acotado a la carpeta propia: Storage lo necesita para borrar/reemplazar.
-- La lectura pública de las imágenes no depende de esta política (bucket público).
drop policy if exists "Users can view their own post images" on storage.objects;
create policy "Users can view their own post images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  );

drop policy if exists "Users can update their own post images" on storage.objects;
create policy "Users can update their own post images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  )
  with check (
    bucket_id = 'post-images'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  );

drop policy if exists "Users can delete their own post images" on storage.objects;
create policy "Users can delete their own post images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername (name))[1] = (select auth.uid ())::text
  );
