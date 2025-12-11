-- Enable Realtime for all tables
alter publication supabase_realtime add table public.novels;
alter publication supabase_realtime add table public.acts;
alter publication supabase_realtime add table public.chapters;
alter publication supabase_realtime add table public.scenes;
alter publication supabase_realtime add table public.codex;
alter publication supabase_realtime add table public.prompt_presets;
