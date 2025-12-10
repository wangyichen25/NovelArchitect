import { createClient } from '@/lib/supabase/client'
import { db } from './index'
import { Scene, Novel, Act, Chapter, CodexEntry } from './schema'

// Queue system to prevent race conditions for dependent entities (Novel -> Act -> Chapter -> Scene)
let syncQueue: Promise<void> = Promise.resolve();

function addToQueue(operation: () => Promise<void>) {
    syncQueue = syncQueue.then(operation).catch(err => console.error('Sync Queue Error:', err));
    return syncQueue;
}

// Debounce system to prevent Supabase flooding on repetitive updates (e.g. typing)
const debounceMap = new Map<string, { timer: NodeJS.Timeout, resolve: () => void }>();

function debouncedSync(key: string, operation: () => Promise<void>, delay: number = 2000): Promise<void> {
    const existing = debounceMap.get(key);
    if (existing) {
        clearTimeout(existing.timer);
        existing.resolve(); // Resolves the previous overwritten promise immediately
    }

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            debounceMap.delete(key);
            addToQueue(operation).then(resolve).catch(reject);
        }, delay);

        debounceMap.set(key, { timer, resolve });
    });
}

// Helper to check if we have a user
async function getCurrentUserId() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id;
}

export function syncNovel(novelId: string): Promise<void> {
    return debouncedSync(`novel_${novelId}`, async () => {
        const userId = await getCurrentUserId();
        if (!userId) return; // Not logged in, skip sync

        const novel = await db.novels.get(novelId);
        if (!novel) return;

        const supabase = createClient();
        const { error } = await supabase.from('novels').upsert({
            id: novel.id,
            user_id: userId,
            title: novel.title,
            author: novel.author,
            created_at: novel.createdAt,
            last_modified: novel.lastModified,
            settings: novel.settings
        });

        if (error) {
            console.error('Auto-Sync Novel Error:', JSON.stringify(error, null, 2));
            if (error.code === '42P01') {
                console.error('CRITICAL: Table "novels" not found in Supabase. Please run the migration script.');
                alert('Sync Error: Cloud database tables missing. Please run the schema migration in Supabase Dashboard.');
            }
            console.error('Payload:', { id: novel.id, title: novel.title, user_id: userId });
        }
    });
}

export function syncAct(act: Act): Promise<void> {
    return debouncedSync(`act_${act.id}`, async () => {
        const userId = await getCurrentUserId();
        if (!userId) return;

        const supabase = createClient();
        const { error } = await supabase.from('acts').upsert({
            id: act.id,
            user_id: userId,
            novel_id: act.novelId,
            title: act.title,
            order: act.order,
            summary: act.summary
        });

        if (error) {
            // Handle missing parent (Novel)
            if (error.code === '23503') { // Foreign key violation
                console.warn('Sync Act failed due to missing parent Novel. Attempting to sync Novel...', act.novelId);
                const parent = await db.novels.get(act.novelId);
                if (parent) {
                    await syncNovel(parent.id);
                    // Retry syncAct after a small delay to allow queue processing
                    return syncAct(act);
                }
            }

            console.error('Auto-Sync Act Error:', JSON.stringify(error, null, 2));
            if (error.code === '42P01') {
                console.error('CRITICAL: Table "acts" not found in Supabase.');
            }
            console.error('Payload:', { id: act.id, title: act.title, novel_id: act.novelId });
        }
    });
}

export function syncChapter(chapter: Chapter): Promise<void> {
    return debouncedSync(`chapter_${chapter.id}`, async () => {
        const userId = await getCurrentUserId();
        if (!userId) return;

        const supabase = createClient();
        const { error } = await supabase.from('chapters').upsert({
            id: chapter.id,
            user_id: userId,
            act_id: chapter.actId,
            title: chapter.title,
            order: chapter.order,
            summary: chapter.summary
        });

        if (error) {
            // Handle missing parent (Act)
            if (error.code === '23503') {
                console.warn('Sync Chapter failed due to missing parent Act. Attempting to sync Act...', chapter.actId);
                const parent = await db.acts.get(chapter.actId);
                if (parent) {
                    await syncAct(parent);
                    return syncChapter(chapter);
                }
            }

            console.error('Auto-Sync Chapter Error:', JSON.stringify(error, null, 2));
            if (error.code === '42P01') {
                console.error('CRITICAL: Table "chapters" not found in Supabase.');
            }
            console.error('Payload:', { id: chapter.id, title: chapter.title, act_id: chapter.actId });
        }
    });
}

export function syncScene(scene: Scene): Promise<void> {
    return debouncedSync(`scene_${scene.id}`, async () => {
        const userId = await getCurrentUserId();
        if (!userId) return;

        const supabase = createClient();
        // Use upsert to handle both insert and update
        const { error } = await supabase.from('scenes').upsert({
            id: scene.id,
            user_id: userId,
            novel_id: scene.novelId,
            chapter_id: scene.chapterId,
            title: scene.title,
            content: scene.content,
            beats: scene.beats,
            order: scene.order,
            last_modified: scene.lastModified,
            metadata: scene.metadata,
            cached_mentions: scene.cachedMentions
        });

        if (error) {
            // Handle missing parent (Chapter)
            if (error.code === '23503') {
                // Determine if it is Novel or Chapter missing based on error details, or just try both hierarchy
                // Usually scenes depend on Chapters, and Chapters on Acts, Acts on Novels.
                // But Scene table has FK to Novel AND Chapter.

                console.warn('Sync Scene failed due to missing parent. checking lineage...', scene.chapterId);

                // Try to sync Chapter first (which triggers Act -> Novel if needed due to recursive fixes above)
                const chapter = await db.chapters.get(scene.chapterId);
                if (chapter) {
                    await syncChapter(chapter);
                    // Also ensure Novel is there (direct FK)
                    const novel = await db.novels.get(scene.novelId);
                    if (novel) {
                        await syncNovel(novel.id);
                    }
                    return syncScene(scene);
                }
            }

            console.error('Auto-Sync Scene Error:', JSON.stringify(error, null, 2));
            if (error.code === '42P01') {
                console.error('CRITICAL: Table "scenes" not found in Supabase.');
            }
            console.error('Payload:', { id: scene.id, title: scene.title, novel_id: scene.novelId, chapter_id: scene.chapterId });
        }
    });
}

export function syncCodex(codex: CodexEntry): Promise<void> {
    return debouncedSync(`codex_${codex.id}`, async () => {
        const userId = await getCurrentUserId();
        if (!userId) return;

        const supabase = createClient();
        const { error } = await supabase.from('codex').upsert({
            id: codex.id,
            user_id: userId,
            novel_id: codex.novelId,
            category: codex.category,
            name: codex.name,
            aliases: codex.aliases,
            description: codex.description,
            visual_summary: codex.visualSummary,
            image: codex.image,
            gallery: codex.gallery,
            relations: codex.relations
        });

        if (error) {
            // Handle missing parent (Novel)
            if (error.code === '23503') {
                console.warn('Sync Codex failed due to missing parent Novel. Attempting to sync Novel...', codex.novelId);
                const parent = await db.novels.get(codex.novelId);
                if (parent) {
                    await syncNovel(parent.id);
                    return syncCodex(codex);
                }
            }

            console.error('Auto-Sync Codex Error COMPLETE:', error);
            console.error('Auto-Sync Codex Error JSON:', JSON.stringify(error, null, 2));
            if (error.code === '42P01') {
                console.error('CRITICAL: Table "codex" not found in Supabase.');
            }
            console.error('Payload:', {
                id: codex.id,
                name: codex.name,
                novel_id: codex.novelId,
                image_type: typeof codex.image,
                image_len: codex.image?.length
            });
        }
    });
}

export function deleteEntity(table: string, id: string) {
    return addToQueue(async () => {
        const userId = await getCurrentUserId();
        if (!userId) return;

        const supabase = createClient();
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) {
            console.error(`Auto-Sync Delete ${table} Error:`, JSON.stringify(error, null, 2));
            if (error.code === '42P01') {
                console.error(`CRITICAL: Table "${table}" not found in Supabase. Please run the migration script.`);
                // alert('Sync Error: Cloud database tables missing. Please run the schema migration in Supabase Dashboard.');
            }
            console.error(`Payload:`, { table, id });
        }
    });
}

export function syncPromptPreset(preset: import('./schema').PromptPreset): Promise<void> {
    return debouncedSync(`prompt_preset_${preset.id}`, async () => {
        const userId = await getCurrentUserId();
        if (!userId) return;

        const supabase = createClient();
        const { error } = await supabase.from('prompt_presets').upsert({
            id: preset.id,
            user_id: userId,
            name: preset.name,
            prompt: preset.prompt,
            last_used: preset.lastUsed
        });

        if (error) {
            console.error('Auto-Sync PromptPreset Error:', JSON.stringify(error, null, 2));
            if (error.code === '42P01') {
                console.error('CRITICAL: Table "prompt_presets" not found in Supabase.');
            }
            console.error('Payload:', { id: preset.id, name: preset.name });
        }
    });
}

