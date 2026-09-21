-- PRD 1: tabla `profiles` y políticas RLS.
-- Correr en el SQL Editor de Supabase (Dashboard > SQL Editor).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid () = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid () = id)
  with check (auth.uid () = id);
