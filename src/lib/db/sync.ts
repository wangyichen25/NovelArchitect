
import { createClient } from '@/lib/supabase/client'
import { db } from './index'
import { Scene, Novel, Act, Chapter, CodexEntry } from './schema'

// Queue to prevent overwhelming the network or race conditions
// Simple mutex-like lock per ID? 
// For now, simpler: fire and forget with error logging, relying on Supabase handle concurrency.
// Ideally usage of a queue system (e.g. async-mutex or PQueue) would be better for heavy usage.

// Helper to check if we have a user
async function getCurrentUserId() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id;
}

export async function syncNovel(novelId: string) {
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

    if (error) console.error('Auto-Sync Novel Error:', error);
}

export async function syncAct(act: Act) {
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

    if (error) console.error('Auto-Sync Act Error:', error);
}

export async function syncChapter(chapter: Chapter) {
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

    if (error) console.error('Auto-Sync Chapter Error:', error);
}

export async function syncScene(scene: Scene) {
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

    if (error) console.error('Auto-Sync Scene Error:', error);
}

export async function syncCodex(codex: CodexEntry) {
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

    if (error) console.error('Auto-Sync Codex Error:', error);
}

export async function deleteEntity(table: string, id: string) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const supabase = createClient();
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) console.error(`Auto-Sync Delete ${table} Error:`, error);
}
