alter table agent_state 
add column if not exists max_hunks int default 5;
