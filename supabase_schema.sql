-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Novels Table
create table public.novels (
  id uuid not null default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  author text,
  created_at bigint not null, -- Storing as timestamp (number) to match simple Dexie schema, or use timestamptz
  last_modified bigint not null,
  settings jsonb -- Storing nested ProjectSettings as JSONB
);

-- Acts Table
create table public.acts (
  id uuid not null default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  novel_id uuid references public.novels(id) on delete cascade not null,
  title text not null,
  "order" integer not null,
  summary text
);

-- Chapters Table
create table public.chapters (
  id uuid not null default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  act_id uuid references public.acts(id) on delete cascade not null,
  title text not null,
  "order" integer not null,
  summary text
);

-- Scenes Table
create table public.scenes (
  id uuid not null default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  novel_id uuid references public.novels(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete cascade not null,
  title text not null,
  content jsonb, -- ProseMirror JSON
  beats text,
  "order" integer not null,
  last_modified bigint,
  metadata jsonb, -- Storing nested metadata
  cached_mentions jsonb -- Storing array of strings as JSONB
);

-- Codex Table
create table public.codex (
  id uuid not null default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  novel_id uuid references public.novels(id) on delete cascade not null,
  category text not null,
  name text not null,
  aliases jsonb, -- array of strings
  description text,
  visual_summary text,
  image text,
  gallery jsonb, -- array of strings
  relations jsonb -- array of CodexRelation objects
);

-- Indexes
create index idx_novels_user on public.novels(user_id);
create index idx_acts_novel on public.acts(novel_id);
create index idx_chapters_act on public.chapters(act_id);
create index idx_scenes_chapter on public.scenes(chapter_id);
create index idx_codex_novel on public.codex(novel_id);

-- Row Level Security (RLS)
alter table public.novels enable row level security;
alter table public.acts enable row level security;
alter table public.chapters enable row level security;
alter table public.scenes enable row level security;
alter table public.codex enable row level security;

-- Policies (Users can only see/edit their own data)
create policy "Users can allow select their own novels" on public.novels for select using (auth.uid() = user_id);
create policy "Users can allow insert their own novels" on public.novels for insert with check (auth.uid() = user_id);
create policy "Users can allow update their own novels" on public.novels for update using (auth.uid() = user_id);
create policy "Users can allow delete their own novels" on public.novels for delete using (auth.uid() = user_id);

-- (Repeat for other tables - Acts)
create policy "Users can interact with their own acts" on public.acts using (auth.uid() = user_id);

-- (Repeat for other tables - Chapters)
create policy "Users can interact with their own chapters" on public.chapters using (auth.uid() = user_id);

-- (Repeat for other tables - Scenes)
create policy "Users can interact with their own scenes" on public.scenes using (auth.uid() = user_id);

-- (Repeat for other tables - Codex)
create policy "Users can interact with their own codex" on public.codex using (auth.uid() = user_id);
