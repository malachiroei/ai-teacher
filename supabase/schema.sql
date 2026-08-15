-- Run this in the Supabase SQL editor if the tables do not exist yet.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text,
  full_name text,
  age integer,
  gender text,
  english_level text default 'beginner',
  interests text not null default '',
  selected_character text default 'emma',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sender text not null check (sender in ('ai', 'user')),
  text text not null,
  translation text,
  grammar_feedback jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at asc);

alter table public.profiles enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "chat_select_own" on public.chat_messages;
drop policy if exists "chat_insert_own" on public.chat_messages;
drop policy if exists "chat_delete_own" on public.chat_messages;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "chat_select_own" on public.chat_messages
  for select using (auth.uid() = user_id);
create policy "chat_insert_own" on public.chat_messages
  for insert with check (auth.uid() = user_id);
create policy "chat_delete_own" on public.chat_messages
  for delete using (auth.uid() = user_id);

-- If you already created interests as text[], convert it:
-- alter table public.profiles
--   alter column interests type text using array_to_string(interests, ', ');

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists selected_character text default 'emma';
