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
  daily_goal_minutes integer default 10,
  preferred_practice_time text default '17:00',
  notifications_enabled boolean default false,
  parent_whatsapp text default '',
  practice_date date,
  practice_seconds integer default 0,
  voice_speed real default 1,
  name_pronunciation text default '',
  custom_tutor_name text default '',
  tutor_nicknames text default '{}',
  preferred_voice text default '',
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

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  character_id text default 'emma',
  title text not null default 'Previous chat',
  preview text default '',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  archived_at timestamptz not null default now()
);

create index if not exists chat_sessions_user_archived_idx
  on public.chat_sessions (user_id, archived_at desc);

create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fact text not null,
  kind text not null default 'personal',
  event_on date,
  created_at timestamptz not null default now(),
  last_mentioned_at timestamptz not null default now()
);

create index if not exists user_memories_user_recent_idx
  on public.user_memories (user_id, last_mentioned_at desc);

alter table public.profiles enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.user_memories enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "chat_select_own" on public.chat_messages;
drop policy if exists "chat_insert_own" on public.chat_messages;
drop policy if exists "chat_delete_own" on public.chat_messages;
drop policy if exists "sessions_select_own" on public.chat_sessions;
drop policy if exists "sessions_insert_own" on public.chat_sessions;
drop policy if exists "sessions_delete_own" on public.chat_sessions;
drop policy if exists "memories_select_own" on public.user_memories;
drop policy if exists "memories_insert_own" on public.user_memories;
drop policy if exists "memories_update_own" on public.user_memories;
drop policy if exists "memories_delete_own" on public.user_memories;

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

create policy "sessions_select_own" on public.chat_sessions
  for select using (auth.uid() = user_id);
create policy "sessions_insert_own" on public.chat_sessions
  for insert with check (auth.uid() = user_id);
create policy "sessions_delete_own" on public.chat_sessions
  for delete using (auth.uid() = user_id);

create policy "memories_select_own" on public.user_memories
  for select using (auth.uid() = user_id);
create policy "memories_insert_own" on public.user_memories
  for insert with check (auth.uid() = user_id);
create policy "memories_update_own" on public.user_memories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "memories_delete_own" on public.user_memories
  for delete using (auth.uid() = user_id);

-- If you already created interests as text[], convert it:
-- alter table public.profiles
--   alter column interests type text using array_to_string(interests, ', ');

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists selected_character text default 'emma';
alter table public.profiles add column if not exists daily_goal_minutes integer default 10;
alter table public.profiles add column if not exists preferred_practice_time text default '17:00';
alter table public.profiles add column if not exists notifications_enabled boolean default false;
alter table public.profiles add column if not exists parent_whatsapp text default '';
alter table public.profiles add column if not exists practice_date date;
alter table public.profiles add column if not exists practice_seconds integer default 0;
alter table public.profiles add column if not exists voice_speed real default 1;
alter table public.profiles add column if not exists name_pronunciation text default '';
alter table public.profiles add column if not exists custom_tutor_name text default '';
alter table public.profiles add column if not exists tutor_nicknames text default '{}';
alter table public.profiles add column if not exists preferred_voice text default '';
alter table public.profiles add column if not exists placement_completed boolean default false;
alter table public.profiles add column if not exists xp integer default 0;
alter table public.profiles add column if not exists level integer default 1;
alter table public.profiles add column if not exists child_memory jsonb default '{}'::jsonb;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  preferred_time text not null default '17:00',
  timezone text not null default 'Asia/Jerusalem',
  enabled boolean not null default true,
  last_sent_date date,
  tutor_name text,
  kid_name text,
  goal_minutes integer default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.push_subscriptions add constraint unique_push_endpoint unique (endpoint);
exception
  when duplicate_object then null;
  when duplicate_table then null;
  when others then null;
end $$;

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists push_subscriptions_due_idx on public.push_subscriptions (enabled, preferred_time);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_select_own" on public.push_subscriptions;
drop policy if exists "push_insert_own" on public.push_subscriptions;
drop policy if exists "push_update_own" on public.push_subscriptions;
drop policy if exists "push_delete_own" on public.push_subscriptions;

create policy "push_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_update_own" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- Optional: pg_cron every minute calling your deployed send-reminders URL with CRON_SECRET.
