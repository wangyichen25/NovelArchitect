
import { db } from './index';
import { syncFlags } from './sync-flags';


let subscription: any = null;

// Map Supabase snake_case columns to Dexie camelCase properties
const tableMappings: Record<string, Record<string, string>> = {
    novels: {
        id: 'id',
        user_id: 'userId', // Not stored in local Dexie usually? Check schema. Novel schema has id, lastModified... wait using schema.ts from memory/view
        title: 'title',
        author: 'author',
        created_at: 'createdAt',
        last_modified: 'lastModified',
        settings: 'settings'
    },
    acts: {
        id: 'id',
        novel_id: 'novelId',
        title: 'title',
        order: 'order',
        summary: 'summary'
    },
    chapters: {
        id: 'id',
        act_id: 'actId',
        title: 'title',
        order: 'order',
        summary: 'summary'
    },
    scenes: {
        id: 'id',
        novel_id: 'novelId',
        chapter_id: 'chapterId',
        title: 'title',
        content: 'content',
        beats: 'beats',
        order: 'order',
        last_modified: 'lastModified',
        metadata: 'metadata',
        cached_mentions: 'cachedMentions'
    },
    codex: {
        id: 'id',
        novel_id: 'novelId',
        category: 'category',
        name: 'name',
        aliases: 'aliases',
        description: 'description',
        visual_summary: 'visualSummary',
        image: 'image',
        gallery: 'gallery',
        relations: 'relations'
    },
    prompt_presets: {
        id: 'id',
        name: 'name',
        prompt: 'prompt',
        last_used: 'lastUsed'
    }
};

export const subscribeToRealtime = (supabase: any, userId: string) => {
    // Client is passed in to ensure we use the same authenticated instance

    if (subscription) {
        return () => subscription.unsubscribe();
    }

    if (!userId) {
        console.warn('Realtime subscription skipped: No user ID provided.');
        return () => { };
    }

    console.log('Starting Realtime Subscription for user:', userId);

    const tables = Object.keys(tableMappings);

    // Create a single channel for all tables
    const channel = supabase.channel('db-changes');

    tables.forEach(table => {
        channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table: table },
            async (payload: any) => {
                console.log(`[Realtime] 🟢 Update received for table: ${table}, Event: ${payload.eventType}`, payload);

                syncFlags.isApplyingCloudUpdate = true; // LOCK
                try {
                    const { eventType, new: newRec, old: oldRec } = payload;
                    const mapping = tableMappings[table];

                    if (!mapping) return;

                    if (eventType === 'INSERT') {
                        // For INSERT, we try to map all available fields
                        const localData: any = {};
                        for (const [remote, local] of Object.entries(mapping)) {
                            if (newRec[remote] !== undefined) {
                                localData[local] = newRec[remote];
                            }
                        }
                        // Ensure ID is present
                        if (!localData.id && newRec.id) localData.id = newRec.id;

                        // @ts-ignore
                        await db.table(table).put(localData);

                    } else if (eventType === 'UPDATE') {
                        // For UPDATE, we ONLY map fields that are present in the payload (partial supported)
                        const changes: any = {};
                        for (const [remote, local] of Object.entries(mapping)) {
                            if (newRec[remote] !== undefined) {
                                changes[local] = newRec[remote];
                            }
                        }

                        if (Object.keys(changes).length > 0 && newRec.id) {
                            // Use 'update' (merge) instead of 'put' (replace)
                            // @ts-ignore
                            await db.table(table).update(newRec.id, changes);
                        }

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

    subscription = channel.subscribe((status: string, err: any) => {
        console.log(`[Realtime] 📡 Channel Status Change: ${status}`, err || '');
        if (status === 'SUBSCRIBED') {
            console.log('[Realtime] ✅ Connected and subscribed!');
        } else if (status === 'CHANNEL_ERROR') {
            const errorMsg = new Error('Realtime channel error. Check connection and permissions.');
            console.error(errorMsg, err);
        } else if (status === 'TIMED_OUT') {
            console.warn('Realtime connection timed out. Retrying...');
        } else {
            console.log('[Realtime] ℹ️ Status:', status);
        }
    });

    return () => {
        console.log('[Realtime] 🛑 Unsubscribing...');
        supabase.removeChannel(channel);
        subscription = null;
    };
};
