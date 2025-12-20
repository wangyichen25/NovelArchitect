alter table agent_state 
add column if not exists citation_targets jsonb default '[]',
add column if not exists existing_citations jsonb default '[]';
