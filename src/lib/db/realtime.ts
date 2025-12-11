import { createClient } from '@/lib/supabase/client';
import { db } from './index';
import { syncFlags } from './sync-flags';


let subscription: any = null;

// Map Supabase snake_case to Dexie camelCase
const mappers: Record<string, (payload: any) => any> = {
    novels: (p) => ({
        id: p.id,
        title: p.title,
        author: p.author,
        createdAt: p.created_at,
        lastModified: p.last_modified,
        settings: p.settings
    }),
    acts: (p) => ({
        id: p.id,
        novelId: p.novel_id,
        title: p.title,
        order: p.order,
        summary: p.summary
    }),
    chapters: (p) => ({
        id: p.id,
        actId: p.act_id,
        title: p.title,
        order: p.order,
        summary: p.summary
    }),
    scenes: (p) => ({
        id: p.id,
        novelId: p.novel_id,
        chapterId: p.chapter_id,
        title: p.title,
        content: p.content,
        beats: p.beats,
        order: p.order,
        lastModified: p.last_modified,
        metadata: p.metadata,
        cachedMentions: p.cached_mentions
    }),
    codex: (p) => ({
        id: p.id,
        novelId: p.novel_id,
        category: p.category,
        name: p.name,
        aliases: p.aliases,
        description: p.description,
        visualSummary: p.visual_summary,
        image: p.image,
        gallery: p.gallery,
        relations: p.relations
    }),
    prompt_presets: (p) => ({
        id: p.id,
        name: p.name,
        prompt: p.prompt,
        lastUsed: p.last_used
    })
};

export const subscribeToRealtime = (userId: string) => {
    // Create client instance inside function to ensure it picks up the latest session (cookies/storage)
    const supabase = createClient();

    if (subscription) {
        return () => subscription.unsubscribe();
    }

    console.log('Starting Realtime Subscription for user:', userId);

    const tables = ['novels', 'acts', 'chapters', 'scenes', 'codex', 'prompt_presets'];

    // Create a single channel for all tables
    const channel = supabase.channel('db-changes');

    tables.forEach(table => {
        channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table: table, filter: `user_id=eq.${userId}` },
            async (payload) => {
                console.log(`Realtime update received for ${table}:`, payload.eventType);

                syncFlags.isApplyingCloudUpdate = true; // LOCK
                try {
                    const { eventType, new: newRec, old: oldRec } = payload;
                    const mapper = mappers[table];

                    if (eventType === 'INSERT' || eventType === 'UPDATE') {
                        const localData = mapper(newRec);
                        // @ts-ignore
                        await db.table(table).put(localData);
                    } else if (eventType === 'DELETE') {
                        // @ts-ignore
                        await db.table(table).delete(oldRec.id);
                    }
                } catch (err) {
                    console.error(`Error applying realtime update for ${table}:`, err);
                } finally {
                    syncFlags.isApplyingCloudUpdate = false; // UNLOCK
                }
            }
        );
    });

    subscription = channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log('Realtime connected!');
        } else {
            console.log('Realtime status:', status);
        }

        if (status === 'CHANNEL_ERROR') {
            console.error('Realtime channel error. Check connection and permissions.');
        }

        if (status === 'TIMED_OUT') {
            console.warn('Realtime connection timed out. Retrying...');
        }
    });

    return () => {
        console.log('Unsubscribing from Realtime...');
        supabase.removeChannel(channel);
        subscription = null;
    };
};
