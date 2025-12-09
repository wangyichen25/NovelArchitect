
import { createClient } from '@/lib/supabase/client'
import { Novel, Act, Chapter, Scene, CodexEntry } from './schema'
import { db } from './index'

const BATCH_SIZE = 1; // Maximum stability: upload one by one
const MAX_RETRIES = 3;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function batchUpsert(supabase: any, table: string, items: any[]) {
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);

        let attempts = 0;
        let success = false;
        let lastError: any;

        while (attempts < MAX_RETRIES && !success) {
            try {
                const { error } = await supabase.from(table).upsert(batch);
                if (error) throw error;
                success = true;
                await delay(200); // Small pause for success
            } catch (err: any) {
                lastError = err;
                attempts++;
                console.warn(`Upload failed for ${table} batch ${i}, attempt ${attempts}. Retrying...`);
                await delay(1000 * attempts); // Exponential backoff: 1s, 2s, 3s
            }
        }

        if (!success) {
            throw new Error(`Failed to upload ${table} batch ${i} after ${MAX_RETRIES} attempts. Error: ${lastError?.message || 'Unknown error'}`);
        }
    }
}

export async function uploadNovelToCloud(novelId: string, userId: string) {
    const supabase = createClient()

    // 1. Fetch all local data
    const novel = await db.novels.get(novelId)
    if (!novel) throw new Error("Novel not found locally")

    const acts = await db.acts.where('novelId').equals(novelId).toArray()
    const chapters = await Promise.all(
        acts.map(act => db.chapters.where('actId').equals(act.id).toArray())
    ).then(res => res.flat())

    const scenes = await db.scenes.where('novelId').equals(novelId).toArray()
    const codex = await db.codex.where('novelId').equals(novelId).toArray()

    // 2. Upsert Novel
    const { error: novelError } = await supabase.from('novels').upsert({
        id: novel.id,
        user_id: userId,
        title: novel.title,
        author: novel.author,
        created_at: novel.createdAt,
        last_modified: novel.lastModified,
        settings: novel.settings
    })
    if (novelError) throw novelError

    // 3. Upsert Acts
    if (acts.length > 0) {
        await batchUpsert(supabase, 'acts', acts.map(act => ({
            id: act.id,
            user_id: userId,
            novel_id: act.novelId,
            title: act.title,
            order: act.order,
            summary: act.summary
        })));
    }

    // 4. Upsert Chapters
    if (chapters.length > 0) {
        await batchUpsert(supabase, 'chapters', chapters.map(chap => ({
            id: chap.id,
            user_id: userId,
            act_id: chap.actId,
            title: chap.title,
            order: chap.order,
            summary: chap.summary
        })));
    }

    // 5. Upsert Scenes
    if (scenes.length > 0) {
        await batchUpsert(supabase, 'scenes', scenes.map(scene => ({
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
        })));
    }

    // 6. Upsert Codex (Reduced Batch Size for Images)
    if (codex.length > 0) {
        // Use smaller batch for codex as they might contain images
        const CODEX_BATCH_SIZE = 2; // Very safe low number
        for (let i = 0; i < codex.length; i += CODEX_BATCH_SIZE) {
            const batch = codex.slice(i, i + CODEX_BATCH_SIZE);
            const { error: codexError } = await supabase.from('codex').upsert(
                batch.map(entry => ({
                    id: entry.id,
                    user_id: userId,
                    novel_id: entry.novelId,
                    category: entry.category,
                    name: entry.name,
                    aliases: entry.aliases,
                    description: entry.description,
                    visual_summary: entry.visualSummary,
                    image: entry.image,
                    gallery: entry.gallery,
                    relations: entry.relations
                }))
            )
            if (codexError) throw new Error(`Error uploading codex: ${codexError.message}`);
        }
    }

    return true
}

export async function fetchUserNovels(userId: string) {
    const supabase = createClient()
    const { data, error } = await supabase.from('novels').select('*').eq('user_id', userId)
    if (error) throw error
    return data
}

export async function downloadNovelFromCloud(novelId: string) {
    const supabase = createClient()

    // Fetch all related data
    const { data: novel, error: ne } = await supabase.from('novels').select('*').eq('id', novelId).single()
    if (ne) throw ne

    const { data: acts } = await supabase.from('acts').select('*').eq('novel_id', novelId)
    const { data: chapters } = await supabase.from('chapters').select('*').in('act_id', acts?.map(a => a.id) || [])
    const { data: scenes } = await supabase.from('scenes').select('*').eq('novel_id', novelId)
    const { data: codex } = await supabase.from('codex').select('*').eq('novel_id', novelId)

    // Save to Local DB (Dexie)
    await db.transaction('rw', [db.novels, db.acts, db.chapters, db.scenes, db.codex], async () => {
        await db.novels.put({
            id: novel.id,
            title: novel.title,
            author: novel.author,
            createdAt: novel.created_at,
            lastModified: novel.last_modified,
            settings: novel.settings
        })

        if (acts) {
            await db.acts.bulkPut(acts.map(a => ({
                id: a.id,
                novelId: a.novel_id,
                title: a.title,
                order: a.order,
                summary: a.summary
            })))
        }

        // ... similar mapping for chapters, scenes, codex but handling snake_case to camelCase
        if (chapters) {
            await db.chapters.bulkPut(chapters.map(c => ({
                id: c.id,
                actId: c.act_id,
                title: c.title,
                order: c.order,
                summary: c.summary
            })))
        }

        if (scenes) {
            await db.scenes.bulkPut(scenes.map(s => ({
                id: s.id,
                novelId: s.novel_id,
                chapterId: s.chapter_id,
                title: s.title,
                content: s.content,
                beats: s.beats,
                order: s.order,
                lastModified: s.last_modified,
                metadata: s.metadata,
                cachedMentions: s.cached_mentions
            })))
        }

        if (codex) {
            await db.codex.bulkPut(codex.map(c => ({
                id: c.id,
                novelId: c.novel_id,
                category: c.category as any,
                name: c.name,
                aliases: c.aliases,
                description: c.description,
                visualSummary: c.visual_summary,
                image: c.image,
                gallery: c.gallery,
                relations: c.relations
            })))
        }
    })
}
