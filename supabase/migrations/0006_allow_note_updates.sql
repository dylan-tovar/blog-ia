-- Permite que los autores editen el contenido de sus propias notas
drop policy if exists "Users can update their own posts" on public.posts;
create policy "Users can update their own posts"
  on public.posts for update
  using (author_id = auth.uid ())
  with check (author_id = auth.uid ());
