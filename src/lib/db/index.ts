
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

        // --- Auto-Sync Hooks ---
        // Dynamically import sync functions to avoid circular dependency matching issues at runtime if any
        // But since we are inside class method, standard import should work if avoiding direct usage in constructor synchronously if dependencies are cyclic.
        // The `sync` module depends on `db`, so we might have circular dependency. 
        // We will use dynamic import() inside hooks or just rely on module loading if separated correctly.
        // Actually, sync.ts imports db. index.ts imports sync.ts. CIRCULAR.
        // Fix: Do NOT import sync functions at top level. Import inside hook.

        this.novels.hook('creating', (primKey, obj) => { import('./sync').then(m => m.syncNovel(obj.id)); });
        this.novels.hook('updating', (mods, primKey, obj) => { import('./sync').then(m => m.syncNovel(obj.id)); });
        this.novels.hook('deleting', (primKey) => { import('./sync').then(m => m.deleteEntity('novels', primKey as string)); });

        this.acts.hook('creating', (primKey, obj) => { import('./sync').then(m => m.syncAct(obj)); });
        this.acts.hook('updating', (mods, primKey, obj) => { import('./sync').then(m => m.syncAct({ ...obj, ...mods } as any)); });
        this.acts.hook('deleting', (primKey) => { import('./sync').then(m => m.deleteEntity('acts', primKey as string)); });

        this.chapters.hook('creating', (primKey, obj) => { import('./sync').then(m => m.syncChapter(obj)); });
        this.chapters.hook('updating', (mods, primKey, obj) => { import('./sync').then(m => m.syncChapter({ ...obj, ...mods } as any)); });
        this.chapters.hook('deleting', (primKey) => { import('./sync').then(m => m.deleteEntity('chapters', primKey as string)); });

        this.scenes.hook('creating', (primKey, obj) => { import('./sync').then(m => m.syncScene(obj)); });
        // For updating, we need the full object. 'mods' only has changes. 'obj' is the OLD object.
        // We need to merge them.
        this.scenes.hook('updating', (mods, primKey, obj) => {
            const newObj = { ...obj, ...mods };
            import('./sync').then(m => m.syncScene(newObj as any));
        });
        this.scenes.hook('deleting', (primKey) => { import('./sync').then(m => m.deleteEntity('scenes', primKey as string)); });

        this.codex.hook('creating', (primKey, obj) => { import('./sync').then(m => m.syncCodex(obj)); });
        this.codex.hook('updating', (mods, primKey, obj) => {
            const newObj = { ...obj, ...mods };
            import('./sync').then(m => m.syncCodex(newObj as any));
        });
        this.codex.hook('deleting', (primKey) => { import('./sync').then(m => m.deleteEntity('codex', primKey as string)); });

        this.version(4).stores({
            prompt_presets: 'id, name'
        });

        this.prompt_presets.hook('creating', (primKey, obj) => { import('./sync').then(m => m.syncPromptPreset(obj)); });
        this.prompt_presets.hook('updating', (mods, primKey, obj) => {
            const newObj = { ...obj, ...mods };
            import('./sync').then(m => m.syncPromptPreset(newObj as any));
        });
        this.prompt_presets.hook('deleting', (primKey) => { import('./sync').then(m => m.deleteEntity('prompt_presets', primKey as string)); });
    }
}

export const db = new NovelArchitectDB();
