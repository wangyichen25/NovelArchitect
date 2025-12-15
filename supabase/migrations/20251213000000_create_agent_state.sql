create table if not exists agent_state (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) not null,
    novel_id uuid references novels(id) on delete cascade not null,
    scene_id uuid references scenes(id) on delete cascade,
    instructions text,
    max_passes int default 3,
    min_score float8 default 0.8,
    section_plan jsonb,
    sections_drafted jsonb,
    format_guidance text,
    pass_index int default 0,
    history jsonb default '[]',
    last_modified bigint
);

alter table agent_state enable row level security;

create policy "Users can view their own agent states"
on agent_state for select
using (auth.uid() = user_id);

create policy "Users can insert their own agent states"
on agent_state for insert
with check (auth.uid() = user_id);

create policy "Users can update their own agent states"
on agent_state for update
using (auth.uid() = user_id);

create policy "Users can delete their own agent states"
on agent_state for delete
using (auth.uid() = user_id);
