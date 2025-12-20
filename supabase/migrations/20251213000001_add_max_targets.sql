alter table agent_state 
add column if not exists max_targets int default 10;
