
import Dexie, { Table } from 'dexie';
import { Novel, Act, Chapter, Scene, CodexEntry, AgentState } from './schema';
import { syncFlags } from './sync-flags';

// Helper to apply dot-notation mods to an object
function applyMods(obj: any, mods: { [keyPath: string]: any }) {
    const newObj = JSON.parse(JSON.stringify(obj)); // Deep clone
    for (const keyPath in mods) {
        if (mods.hasOwnProperty(keyPath)) {
            const value = mods[keyPath];
            const path = keyPath.split('.');
            let current = newObj;
            for (let i = 0; i < path.length - 1; i++) {
                if (!current[path[i]]) current[path[i]] = {};
                current = current[path[i]];
            }
            current[path[path.length - 1]] = value;
        }
    }
    return newObj;
}

export class PaperArchitectDB extends Dexie {
    novels!: Table<Novel>;
    acts!: Table<Act>;
    chapters!: Table<Chapter>;
    scenes!: Table<Scene>;
    codex!: Table<CodexEntry>;
    agent_state!: Table<AgentState>;
    prompt_presets!: Table<import('./schema').PromptPreset>;

    constructor() {
        super('PaperArchitectDB');
        console.warn('[DB] Constructor: Initializing PaperArchitectDB...');

        // Expose to window for debugging
        if (typeof window !== 'undefined') {
            (window as any)._db = this;
        }

        this.version(1).stores({
            novels: 'id, lastModified',
            acts: 'id, novelId, order',
            chapters: 'id, actId, order',
            scenes: 'id, chapterId, order, metadata.povCharacterId, [chapterId+order]',
            codex: 'id, novelId, category, name, *aliases' // Multi-index for aliases
        });

        this.version(2).stores({
            scenes: 'id, novelId, chapterId, order, metadata.povCharacterId, [chapterId+order]'
        });

        this.version(3).stores({
            scenes: 'id, novelId, chapterId, order, metadata.povCharacterId, [chapterId+order]'
        });

        this.version(4).stores({
            prompt_presets: 'id, name'
        });

        this.version(5).stores({
            agent_state: 'id, novelId, sceneId'
        });

        this.version(7).stores({
            chapters: 'id, novelId, actId, order'
        }).upgrade(async tx => {
            // We need to fetch acts to map chapter -> act -> novel.
            // However, inside upgrade(), we should be careful about using tx.table() which refers to the version being upgraded to.
            // We can fetch acts first.
            const acts = await tx.table('acts').toArray();
            const actsMap = new Map(acts.map(a => [a.id, a.novelId]));

            return tx.table('chapters').toCollection().modify(c => {
                if (!c.novelId && actsMap.has(c.actId)) {
                    c.novelId = actsMap.get(c.actId);
                }
            });
        });

        this.version(6).upgrade(tx => {
            return tx.table('codex').toCollection().modify(curr => {
                // Migrate description to notes if description exists and notes does not
                if (curr.description && !curr.notes) {
                    curr.notes = curr.description;
                    delete curr.description;
                }
            });
        });

        this.version(8).upgrade(tx => {
            return tx.table('codex').toCollection().modify(curr => {
                // Cleanup "Unknown Scene" artifacts
                if (curr.notes) {
                    const trimmed = curr.notes.trim();
                    if (trimmed === '[[Scene: Unknown Scene]]' || trimmed === '[[Scene: Unknown Scene]]\n' || trimmed.match(/^\[\[Scene: Unknown Scene\]\]\s*$/)) {
                        curr.notes = '';
                    }
                }
            });
        });

        // --- Auto-Sync Hooks ---

        // Use this.table() to ensure we attach to the table even if property proxies aren't ready
        this.table('novels').hook('creating', (primKey: any, obj: Novel) => {
            console.log('[DB] Hook: novels.creating');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncNovel(obj.id));
        });
        this.table('novels').hook('updating', (mods: object, primKey: any, obj: Novel) => {
            console.log('[DB] Hook: novels.updating');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncNovel(obj.id));
        });
        this.table('novels').hook('deleting', (primKey: any) => {
            console.log('[DB] Hook: novels.deleting');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.deleteEntity('novels', primKey as string));
        });

        this.table('acts').hook('creating', (primKey: any, obj: Act) => {
            console.log('[DB] Hook: acts.creating');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncAct(obj));
        });
        this.table('acts').hook('updating', (mods: object, primKey: any, obj: Act) => {
            console.log('[DB] Hook: acts.updating');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncAct({ ...obj, ...mods } as any));
        });
        this.table('acts').hook('deleting', (primKey: any) => {
            console.log('[DB] Hook: acts.deleting');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.deleteEntity('acts', primKey as string));
        });

        this.table('chapters').hook('creating', (primKey: any, obj: Chapter) => {
            console.log('[DB] Hook: chapters.creating');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncChapter(obj));
        });
        this.table('chapters').hook('updating', (mods: object, primKey: any, obj: Chapter) => {
            console.log('[DB] Hook: chapters.updating');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncChapter({ ...obj, ...mods } as any));
        });
        this.table('chapters').hook('deleting', (primKey: any) => {
            console.log('[DB] Hook: chapters.deleting');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.deleteEntity('chapters', primKey as string));
        });

        this.table('scenes').hook('creating', (primKey: any, obj: Scene) => {
            console.log('[DB] Hook: scenes.creating');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncScene(obj));
        });
        this.table('scenes').hook('updating', (mods: object, primKey: any, obj: Scene) => {
            console.log(`[DB] Hook: scenes.updating | isApplyingCloudUpdate=${syncFlags.isApplyingCloudUpdate}`);

            if (!syncFlags.isApplyingCloudUpdate) {
                const newObj = applyMods(obj, mods as { [key: string]: any });
                console.log(`[DB] Hook Syncing payload size: ${JSON.stringify(newObj.content).length}`);
                import('./sync').then(m => m.syncScene(newObj));
            }
        });
        this.table('scenes').hook('deleting', (primKey: any) => {
            console.log('[DB] Hook: scenes.deleting');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.deleteEntity('scenes', primKey as string));
        });

        this.table('codex').hook('creating', (primKey: any, obj: CodexEntry) => {
            console.log('[DB] Hook: codex.creating');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncCodex(obj));
        });
        this.table('codex').hook('updating', (mods: object, primKey: any, obj: CodexEntry) => {
            console.log('[DB] Hook: codex.updating');
            if (!syncFlags.isApplyingCloudUpdate) {
                const newObj = { ...obj, ...mods };
                import('./sync').then(m => m.syncCodex(newObj as any));
            }
        });
        this.table('codex').hook('deleting', (primKey: any) => {
            console.log('[DB] Hook: codex.deleting');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.deleteEntity('codex', primKey as string));
        });

        this.table('prompt_presets').hook('creating', (primKey: any, obj: any) => {
            console.log('[DB] Hook: prompt_presets.creating');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncPromptPreset(obj));
        });
        this.table('prompt_presets').hook('updating', (mods: object, primKey: any, obj: any) => {
            console.log('[DB] Hook: prompt_presets.updating');
            if (!syncFlags.isApplyingCloudUpdate) {
                const newObj = { ...obj, ...mods };
                import('./sync').then(m => m.syncPromptPreset(newObj as any));
            }
        });
        this.table('prompt_presets').hook('deleting', (primKey: any) => {
            console.log('[DB] Hook: prompt_presets.deleting');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.deleteEntity('prompt_presets', primKey as string));
        });

        this.table('agent_state').hook('creating', (primKey: any, obj: AgentState) => {
            console.log('[DB] Hook: agent_state.creating');
            if (!syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncAgentState(obj));
        });
        this.table('agent_state').hook('updating', (mods: object, primKey: any, obj: AgentState) => {
            console.log('[DB] Hook: agent_state.updating');
            if (!syncFlags.isApplyingCloudUpdate) {
                const newObj = { ...obj, ...mods };
                import('./sync').then(m => m.syncAgentState(newObj as any));
            }
        });
    }
}

export const db = new PaperArchitectDB();
