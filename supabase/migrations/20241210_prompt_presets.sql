-- Create prompt_presets table
create table if not exists public.prompt_presets (
  id uuid not null primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  prompt text not null,
  last_used bigint
);

-- RLS
alter table public.prompt_presets enable row level security;

-- Policies
create policy "Users can manage their own prompt presets"
  on public.prompt_presets
  for all
  using (auth.uid() = user_id);

-- Add index
create index if not exists idx_prompt_presets_user on public.prompt_presets(user_id);
