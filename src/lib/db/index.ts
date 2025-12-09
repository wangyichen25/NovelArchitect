
import Dexie, { Table } from 'dexie';
import { Novel, Act, Chapter, Scene, CodexEntry } from './schema';

export class NovelArchitectDB extends Dexie {
    novels!: Table<Novel>;
    acts!: Table<Act>;
    chapters!: Table<Chapter>;
    scenes!: Table<Scene>;
    codex!: Table<CodexEntry>;

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
    }
}

export const db = new NovelArchitectDB();
