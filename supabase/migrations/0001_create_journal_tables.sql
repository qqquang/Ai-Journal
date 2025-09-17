-- Enable required extensions
create extension if not exists "pgcrypto" with schema public;

-- Profiles table keeps lightweight user metadata synced with auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default now()
);

-- Journal entries authored by users
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  mood text,
  content text not null,
  reflection_summary text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- AI generated insights per entry (emotions, actions, topics)
create table if not exists public.entry_insights (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries (id) on delete cascade,
  insight_type text not null,
  payload jsonb not null,
  created_at timestamp with time zone default now()
);

-- Minimal table used by clients to verify connectivity without exposing sensitive data
create table if not exists public.healthcheck (
  id serial primary key,
  description text default 'ok',
  created_at timestamp with time zone default now()
);

-- Ensure row level security is active
alter table public.profiles enable row level security;
alter table public.journal_entries enable row level security;
alter table public.entry_insights enable row level security;
alter table public.healthcheck enable row level security;

-- Ownership policy: users can manage their own profile record
create policy "Profiles are viewable by owner" on public.profiles
  for select using (auth.uid() = id);
create policy "Profiles are updatable by owner" on public.profiles
  for update using (auth.uid() = id);
create policy "Profiles are insertable by owner" on public.profiles
  for insert with check (auth.uid() = id);

-- Journal entries CRUD limited to owner
create policy "Users can view their journal entries" on public.journal_entries
  for select using (auth.uid() = user_id);
create policy "Users can insert their journal entries" on public.journal_entries
  for insert with check (auth.uid() = user_id);
create policy "Users can update their journal entries" on public.journal_entries
  for update using (auth.uid() = user_id);
create policy "Users can delete their journal entries" on public.journal_entries
  for delete using (auth.uid() = user_id);

-- Insights bound to entry ownership
create policy "Users can view their entry insights" on public.entry_insights
  for select using (
    auth.uid() = (
      select je.user_id from public.journal_entries je where je.id = entry_id
    )
  );
create policy "Users can insert their entry insights" on public.entry_insights
  for insert with check (
    auth.uid() = (
      select je.user_id from public.journal_entries je where je.id = entry_id
    )
  );
create policy "Users can delete their entry insights" on public.entry_insights
  for delete using (
    auth.uid() = (
      select je.user_id from public.journal_entries je where je.id = entry_id
    )
  );

-- Healthcheck is readable by authenticated users only
create policy "Authenticated users can read healthcheck" on public.healthcheck
  for select using (auth.role() = 'authenticated');

-- Helper trigger to keep updated_at in sync
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists journal_entries_updated_at on public.journal_entries;
create trigger journal_entries_updated_at
  before update on public.journal_entries
  for each row
  execute procedure public.update_updated_at();
