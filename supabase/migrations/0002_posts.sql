-- PRD 2: tablas `posts`, `tags`, `post_tags` y políticas RLS.
-- Correr en el SQL Editor de Supabase (Dashboard > SQL Editor).

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid (),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text,
  content text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'published', 'rejected')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid (),
  name text not null unique
);

create table if not exists public.post_tags (
  post_id uuid not null references public.posts (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (post_id, tag_id)
);

alter table public.posts enable row level security;
alter table public.tags enable row level security;
alter table public.post_tags enable row level security;

-- posts
create policy "Published posts are public, drafts only for the owner"
  on public.posts for select
  using (status = 'published' or author_id = auth.uid ());

create policy "Users can create their own posts"
  on public.posts for insert
  with check (author_id = auth.uid ());

create policy "Users can update their own posts"
  on public.posts for update
  using (author_id = auth.uid ())
  with check (author_id = auth.uid ());

create policy "Users can delete their own posts"
  on public.posts for delete
  using (author_id = auth.uid ());

-- tags
create policy "Tags are viewable by everyone"
  on public.tags for select
  using (true);

create policy "Authenticated users can create tags"
  on public.tags for insert
  to authenticated
  with check (true);

-- post_tags: solo el dueño del post referenciado
create policy "Users can view tags of their own posts or published posts"
  on public.post_tags for select
  using (
    exists (
      select 1 from public.posts
      where posts.id = post_tags.post_id
        and (posts.status = 'published' or posts.author_id = auth.uid ())
    )
  );

create policy "Users can tag their own posts"
  on public.post_tags for insert
  with check (
    exists (
      select 1 from public.posts
      where posts.id = post_tags.post_id
        and posts.author_id = auth.uid ()
    )
  );

create policy "Users can untag their own posts"
  on public.post_tags for delete
  using (
    exists (
      select 1 from public.posts
      where posts.id = post_tags.post_id
        and posts.author_id = auth.uid ()
    )
  );
