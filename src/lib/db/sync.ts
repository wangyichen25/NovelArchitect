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
            console.log(`[Sync] Executing debounced sync for ${key}`);
            addToQueue(operation).then(resolve).catch((err) => {
                console.error(`[Sync] Error executing ${key}:`, err);
                reject(err);
            });
        }, delay);

        debounceMap.set(key, { timer, resolve });
    });
}

// Helper to check if we have a user
async function getCurrentUserId() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
        console.warn('[Sync] No authenticated user found. Skipping sync.');
        return null;
    }
    return session.user.id;
}

// Internal Immediate Sync Functions (Bypass Debounce & Queue - Assumes called from within Queue or Debounce)
async function _syncNovelImmediate(novelId: string): Promise<void> {
    const userId = await getCurrentUserId();
    if (!userId) return;

    console.log(`[Sync] FORCE Syncing Novel ${novelId}`);
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
        console.error('Auto-Sync Novel Error:', error);
    } else {
        console.log(`[Sync] Novel ${novelId} synced successfully.`);
    }
}

async function _syncActImmediate(act: Act): Promise<void> {
    const userId = await getCurrentUserId();
    if (!userId) return;

    console.log(`[Sync] FORCE Syncing Act ${act.title}`);
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
        if (error.code === '23503') {
            console.warn('Sync Act failed due to missing parent. Fixing...');
            await _syncNovelImmediate(act.novelId);
            return _syncActImmediate(act); // Retry
        }
        console.error('Auto-Sync Act Error:', error);
    }
}

async function _syncChapterImmediate(chapter: Chapter): Promise<void> {
    const userId = await getCurrentUserId();
    if (!userId) return;

    console.log(`[Sync] FORCE Syncing Chapter ${chapter.title}`);
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
        if (error.code === '23503') {
            console.warn('Sync Chapter failed due to missing parent. Fixing...');
            const parent = await db.acts.get(chapter.actId);
            if (parent) {
                await _syncActImmediate(parent);
                return _syncChapterImmediate(chapter); // Retry
            }
        }
        console.error('Auto-Sync Chapter Error:', error);
    }
}

// Public Debounced Functions
export function syncNovel(novelId: string): Promise<void> {
    return debouncedSync(`novel_${novelId}`, () => _syncNovelImmediate(novelId));
}

export function syncAct(act: Act): Promise<void> {
    return debouncedSync(`act_${act.id}`, () => _syncActImmediate(act));
}

export function syncChapter(chapter: Chapter): Promise<void> {
    return debouncedSync(`chapter_${chapter.id}`, () => _syncChapterImmediate(chapter));
}

export function syncScene(scene: Scene): Promise<void> {
    return debouncedSync(`scene_${scene.id}`, async () => {
        const userId = await getCurrentUserId();
        if (!userId) return;

        const supabase = createClient();
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
            if (error.code === '23503') {
                console.warn('Sync Scene failed due to missing parent. FAST FIXING lineage...', scene.chapterId);

                // Use IMMEDIATE syncs to fix lineage
                const chapter = await db.chapters.get(scene.chapterId);
                if (chapter) {
                    await _syncChapterImmediate(chapter);

                    const novel = await db.novels.get(scene.novelId);
                    if (novel) await _syncNovelImmediate(novel.id);

                    // We don't retry immediately here because debounce will retry if user types? 
                    // No, we should retry THIS operation immediately inside the queue.
                    // But we are inside the debounced operation, so we can't easily "retry" the debounce wrapper.
                    // We can just call the upsert again here.

                    console.log('Retrying Scene Sync...');
                    await supabase.from('scenes').upsert({
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
                }
            } else {
                console.error('Auto-Sync Scene Error:', JSON.stringify(error, null, 2));
            }
        }
    });
}

export function syncCodex(codex: CodexEntry): Promise<void> {
    return debouncedSync(`codex_${codex.id}`, async () => {
        const userId = await getCurrentUserId();
        if (!userId) return;

        const supabase = createClient();
        const { error } = await supabase.from('codex').upsert({
            // ... fields
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
            if (error.code === '23503') {
                console.warn('Sync Codex missing parent. Fixing...');
                await _syncNovelImmediate(codex.novelId);
                // Retry upsert
                await supabase.from('codex').upsert({
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
            } else {
                console.error('Codex Sync Error:', error);
            }
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

