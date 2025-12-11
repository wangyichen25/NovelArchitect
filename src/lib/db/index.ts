
import Dexie, { Table } from 'dexie';
import { Novel, Act, Chapter, Scene, CodexEntry } from './schema';

export class NovelArchitectDB extends Dexie {
    novels!: Table<Novel>;
    acts!: Table<Act>;
    chapters!: Table<Chapter>;
    scenes!: Table<Scene>;
    codex!: Table<CodexEntry>;
    prompt_presets!: Table<import('./schema').PromptPreset>;

    constructor() {
        super('NovelArchitectDB');
        console.warn('[DB] Constructor: Initializing NovelArchitectDB...');

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

        // --- Auto-Sync Hooks ---
        // Dynamically import sync functions to avoid circular dependency matching issues at runtime if any
        // But since we are inside class method, standard import should work if avoiding direct usage in constructor synchronously if dependencies are cyclic.
        // The `sync` module depends on `db`, so we might have circular dependency. 
        // We will use dynamic import() inside hooks or just rely on module loading if separated correctly.
        // Actually, sync.ts imports db. index.ts imports sync.ts. CIRCULAR.
        // Fix: Do NOT import sync functions at top level. Import inside hook.

        // Use this.table() to ensure we attach to the table even if property proxies aren't ready
        this.table('novels').hook('creating', (primKey, obj) => {
            console.log('[DB] Hook: novels.creating');
            import('./sync-flags').then(f => { if (!f.syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncNovel(obj.id)); });
        });
        this.table('novels').hook('updating', (mods, primKey, obj) => {
            console.log('[DB] Hook: novels.updating');
            import('./sync-flags').then(f => { if (!f.syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncNovel(obj.id)); });
        });
        this.table('novels').hook('deleting', (primKey) => {
            console.log('[DB] Hook: novels.deleting');
            import('./sync-flags').then(f => { if (!f.syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.deleteEntity('novels', primKey as string)); });
        });

        this.table('acts').hook('creating', (primKey, obj) => {
            console.log('[DB] Hook: acts.creating');
            import('./sync-flags').then(f => { if (!f.syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncAct(obj)); });
        });
        this.table('acts').hook('updating', (mods, primKey, obj) => {
            console.log('[DB] Hook: acts.updating');
            import('./sync-flags').then(f => { if (!f.syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncAct({ ...obj, ...mods } as any)); });
        });
        this.table('acts').hook('deleting', (primKey) => {
            console.log('[DB] Hook: acts.deleting');
            import('./sync-flags').then(f => { if (!f.syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.deleteEntity('acts', primKey as string)); });
        });

        this.table('chapters').hook('creating', (primKey, obj) => {
            console.log('[DB] Hook: chapters.creating');
            import('./sync-flags').then(f => { if (!f.syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncChapter(obj)); });
        });
        this.table('chapters').hook('updating', (mods, primKey, obj) => {
            console.log('[DB] Hook: chapters.updating');
            import('./sync-flags').then(f => { if (!f.syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncChapter({ ...obj, ...mods } as any)); });
        });
        this.table('chapters').hook('deleting', (primKey) => {
            console.log('[DB] Hook: chapters.deleting');
            import('./sync-flags').then(f => { if (!f.syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.deleteEntity('chapters', primKey as string)); });
        });

        this.table('scenes').hook('creating', (primKey, obj) => {
            console.log('[DB] Hook: scenes.creating');
            import('./sync-flags').then(f => { if (!f.syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncScene(obj)); });
        });
        this.table('scenes').hook('updating', (mods, primKey, obj) => {
            console.warn('[DB] Hook: scenes.updating');
            import('./sync-flags').then(f => {
                if (!f.syncFlags.isApplyingCloudUpdate) {
                    const newObj = { ...obj, ...mods };
                    import('./sync').then(m => m.syncScene(newObj as any));
                }
            });
        });
        this.table('scenes').hook('deleting', (primKey) => {
            console.log('[DB] Hook: scenes.deleting');
            import('./sync-flags').then(f => { if (!f.syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.deleteEntity('scenes', primKey as string)); });
        });

        this.table('codex').hook('creating', (primKey, obj) => {
            console.log('[DB] Hook: codex.creating');
            import('./sync-flags').then(f => { if (!f.syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncCodex(obj)); });
        });
        this.table('codex').hook('updating', (mods, primKey, obj) => {
            console.log('[DB] Hook: codex.updating');
            import('./sync-flags').then(f => {
                if (!f.syncFlags.isApplyingCloudUpdate) {
                    const newObj = { ...obj, ...mods };
                    import('./sync').then(m => m.syncCodex(newObj as any));
                }
            });
        });
        this.table('codex').hook('deleting', (primKey) => {
            console.log('[DB] Hook: codex.deleting');
            import('./sync-flags').then(f => { if (!f.syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.deleteEntity('codex', primKey as string)); });
        });

        this.table('prompt_presets').hook('creating', (primKey, obj) => {
            console.log('[DB] Hook: prompt_presets.creating');
            import('./sync-flags').then(f => { if (!f.syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.syncPromptPreset(obj)); });
        });
        this.table('prompt_presets').hook('updating', (mods, primKey, obj) => {
            console.log('[DB] Hook: prompt_presets.updating');
            import('./sync-flags').then(f => {
                if (!f.syncFlags.isApplyingCloudUpdate) {
                    const newObj = { ...obj, ...mods };
                    import('./sync').then(m => m.syncPromptPreset(newObj as any));
                }
            });
        });
        this.table('prompt_presets').hook('deleting', (primKey) => {
            console.log('[DB] Hook: prompt_presets.deleting');
            import('./sync-flags').then(f => { if (!f.syncFlags.isApplyingCloudUpdate) import('./sync').then(m => m.deleteEntity('prompt_presets', primKey as string)); });
        });
    }
}

export const db = new NovelArchitectDB();
