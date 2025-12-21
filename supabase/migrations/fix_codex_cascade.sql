-- Migration: Fix Codex Deletion Cascade
-- Purpose: Ensure that when a Novel is deleted, all associated Codex entries are also deleted.

BEGIN;

-- 1. Drop the existing foreign key constraint
-- Tries to drop standard naming convention first. 
-- If your constraint has a different name, you might need to check the definition in Table Editor.
ALTER TABLE public.codex
DROP CONSTRAINT IF EXISTS codex_novel_id_fkey;

-- 2. Add the foreign key constraint back with ON DELETE CASCADE
ALTER TABLE public.codex
ADD CONSTRAINT codex_novel_id_fkey
FOREIGN KEY (novel_id)
REFERENCES public.novels(id)
ON DELETE CASCADE;

COMMIT;
