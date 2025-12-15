alter table agent_state 
add column if not exists action_history jsonb default '[]';
