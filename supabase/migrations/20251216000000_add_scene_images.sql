alter table public.scenes
  add column if not exists images jsonb;
