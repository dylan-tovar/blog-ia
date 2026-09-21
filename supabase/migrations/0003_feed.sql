-- PRD 3: tablas `subscriptions` y `reading_history`, índices y políticas RLS.
-- Correr en el SQL Editor de Supabase (Dashboard > SQL Editor).

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid (),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, author_id),
  check (follower_id <> author_id)
);

create table if not exists public.reading_history (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (user_id, post_id)
);

create index if not exists posts_published_at_idx
  on public.posts (published_at desc)
  where status = 'published';

create index if not exists post_tags_tag_id_idx on public.post_tags (tag_id);
create index if not exists subscriptions_author_id_idx on public.subscriptions (author_id);
create index if not exists reading_history_user_id_idx on public.reading_history (user_id);

alter table public.subscriptions enable row level security;
alter table public.reading_history enable row level security;

-- subscriptions
create policy "Subscriptions are viewable by everyone"
  on public.subscriptions for select
  using (true);

create policy "Users can follow as themselves"
  on public.subscriptions for insert
  with check (follower_id = auth.uid ());

create policy "Users can unfollow their own follows"
  on public.subscriptions for delete
  using (follower_id = auth.uid ());

-- reading_history: solo el propio usuario, y solo sobre posts publicados
create policy "Users can view their own reading history"
  on public.reading_history for select
  using (user_id = auth.uid ());

create policy "Users can record reads of published posts"
  on public.reading_history for insert
  with check (
    user_id = auth.uid ()
    and exists (
      select 1 from public.posts
      where posts.id = reading_history.post_id
        and posts.status = 'published'
    )
  );

create policy "Users can refresh their own reads of published posts"
  on public.reading_history for update
  using (user_id = auth.uid ())
  with check (
    user_id = auth.uid ()
    and exists (
      select 1 from public.posts
      where posts.id = reading_history.post_id
        and posts.status = 'published'
    )
  );
