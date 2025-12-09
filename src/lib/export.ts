
import JSZip from 'jszip';
import { db } from './db';
import { saveAs } from 'file-saver';
import { v4 as uuidv4 } from 'uuid';

// Note: file-saver needs to be installed, or we can use a simple anchor tag hack.
// I'll assume we can use the hack if I don't want to install another dependency, 
// but file-saver is standard. I'll stick to a native DOM implementation to save a dependency.

export class ExportService {
    static async exportProject(novelId: string) {
        const novel = await db.novels.get(novelId);
        if (!novel) throw new Error("Novel not found");

        const acts = await db.acts.where('novelId').equals(novelId).toArray();
        const chapters = await db.chapters.where('actId').anyOf(acts.map(a => a.id)).toArray();
        // Scenes are tricky because check chapterIds. 
        // Actually, chapters queries return chapters, so we get scenes in those chapters.
        const scenes = await db.scenes.where('chapterId').anyOf(chapters.map(c => c.id)).toArray();
        const codex = await db.codex.where('novelId').equals(novelId).toArray();

        const projectData = {
            version: 1,
            novel,
            acts,
            chapters,
            scenes,
            codex
        };

        const zip = new JSZip();
        zip.file('project.json', JSON.stringify(projectData, null, 2));

        // Future: add images folder to zip

        const content = await zip.generateAsync({ type: 'blob' });

        // Save file
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = `${novel.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.narch`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    static async importProject(file: File) {
        const zip = await JSZip.loadAsync(file);
        const projectJson = await zip.file('project.json')?.async('text');

        if (!projectJson) throw new Error("Invalid Project File");

        const data = JSON.parse(projectJson);

        // Validation could go here

        // Import to DB
        // We might want to generate NEW IDs to avoid collisions if importing a copy?
        // Or strictly overwrite?
        // Let's assume restoration/overwrite behavior for now if IDs match, 
        // OR import as new copy if we change the IDs.
        // For simple "Restore", we keep IDs. 
        // For "Import Shared", we'd need new IDs.
        // Let's go with "Import as Copy" by default to be safe, creating a new Novel ID.

        const newNovelId = uuidv4();
        const oldNovelId = data.novel.id;

        const idMap: Record<string, string> = { [oldNovelId]: newNovelId };

        // Function to map IDs or generate new ones
        const getNewId = (oldId: string) => {
            if (!idMap[oldId]) idMap[oldId] = uuidv4();
            return idMap[oldId];
        };

        // 1. Novel
        await db.novels.add({
            ...data.novel,
            id: newNovelId,
            title: `${data.novel.title} (Imported)`,
            lastModified: Date.now()
        });

        // 2. Acts
        for (const act of data.acts) {
            await db.acts.add({
                ...act,
                id: getNewId(act.id),
                novelId: newNovelId
            });
        }

        // 3. Chapters
        for (const chap of data.chapters) {
            await db.chapters.add({
                ...chap,
                id: getNewId(chap.id),
                actId: getNewId(chap.actId)
            });
        }

        // 4. Scenes (and their chapter references)
        for (const scene of data.scenes) {
            await db.scenes.add({
                ...scene,
                id: getNewId(scene.id),
                chapterId: getNewId(scene.chapterId),
                // Metadata references to Codex? 
                // That's tricky. If we re-ID codex, we must update metadata locations/povs.
            });
        }

        // 5. Codex
        for (const entry of data.codex) {
            const newEntryId = getNewId(entry.id);
            await db.codex.add({
                ...entry,
                id: newEntryId,
                novelId: newNovelId
            });
        }

        // Fix References in Scene Metadata after everything is mapped
        // Actually we need to do this carefully.
        // This simple map strategy works if we process scene metadata after mapping codex IDs.
        // But we already added scenes.
        // Let's just update the scenes we just added.
        const newScenes = await db.scenes.where('chapterId').anyOf(
            data.chapters.map((c: any) => getNewId(c.id))
        ).toArray();

        for (const scene of newScenes) {
            const updates: any = {};
            if (scene.metadata.povCharacterId && idMap[scene.metadata.povCharacterId]) {
                updates.metadata = { ...scene.metadata, povCharacterId: idMap[scene.metadata.povCharacterId] };
            }
            // Do same for Location, etc.
            if (Object.keys(updates).length > 0) {
                await db.scenes.update(scene.id, updates);
            }
        }

        return newNovelId;
    }
}
