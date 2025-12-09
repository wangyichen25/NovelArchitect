
"use client";

import NovelEditor from "@/components/editor/NovelEditor";
import { useParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useProjectStore } from "@/hooks/useProject";
import { Scene } from "@/lib/db/schema";
import { v4 as uuidv4 } from 'uuid';
import { Button } from "@/components/ui/button";
import { Plus, Save, ChevronLeft, ChevronRight } from "lucide-react";

export default function WritePage() {
    const params = useParams();
    const novelId = params.id as string;
    const { activeSceneId, setActiveScene } = useProjectStore();
    const [status, setStatus] = useState<"saved" | "saving" | "unsaved">("saved");

    // Fetch all scenes for this novel to show selector
    const scenes = useLiveQuery(
        () => db.scenes.where({ novelId }).toArray().then(rows => rows.sort((a, b) => a.order - b.order))
    );

    // Load Content of Active Scene
    // We use a separate query for content to avoid re-rendering list constantly? 
    // Actually Dexie hooks are fine.
    const activeScene = useLiveQuery(
        async () => activeSceneId ? await db.scenes.get(activeSceneId) : null,
        [activeSceneId]
    );

    // Live query for the novel to get settings
    const novel = useLiveQuery(
        async () => await db.novels.get(novelId),
        [novelId]
    );

    // 1. On Load: detailed logic to restore session state from DB if available
    useEffect(() => {
        if (!novel || !scenes) return;

        // If no active scene is set in store, try to use the one from DB settings
        if (!activeSceneId && novel.settings?.lastActiveSceneId) {
            // Verify it exists in current scenes list
            if (scenes.some(s => s.id === novel.settings.lastActiveSceneId)) {
                setActiveScene(novel.settings.lastActiveSceneId);
                return;
            }
        }

        // Fallbacks
        if (scenes.length === 0) {
            createNewScene();
        } else if (!activeSceneId) {
            setActiveScene(scenes[0].id);
        } else if (activeSceneId && scenes.length > 0) {
            // Check if active scene belongs to another novel (persistence cleanup)
            const belongs = scenes.some(s => s.id === activeSceneId);
            if (!belongs) {
                setActiveScene(scenes[0].id);
            }
        }
    }, [scenes, novel, activeSceneId]);

    // 2. On Change: Persist active scene to DB settings
    useEffect(() => {
        if (!activeSceneId || !novel) return;

        // Only update if changed
        if (novel.settings?.lastActiveSceneId !== activeSceneId) {
            db.novels.update(novelId, {
                'settings.lastActiveSceneId': activeSceneId,
                lastModified: Date.now()
            });
        }
    }, [activeSceneId, novelId, novel]);

    const createNewScene = async () => {
        const id = uuidv4();
        // create a default chapter if needed, but for now just null chapterId
        await db.scenes.add({
            id,
            novelId,
            chapterId: 'default', // placeholder
            title: 'Untitled Scene',
            content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Start writing here...' }] }] },
            order: scenes ? scenes.length : 0,
            metadata: {
                status: 'draft',
                wordCount: 0,
                povCharacterId: null,
                locationId: null,
                timeOfDay: "Day"
            },
            beats: '',
            cachedMentions: []
        });
        setActiveScene(id);
    };

    const handleUpdate = useCallback(async (content: any) => {
        if (!activeSceneId) return;
        setStatus("saving");
        try {
            // Caluclate word count (naive)
            const text = JSON.stringify(content);
            const wordCount = text.length / 5; // Very rough approx

            await db.scenes.update(activeSceneId, {
                content,
                lastModified: Date.now(),
                // partial update metadata?
            });
            setStatus("saved");
        } catch (e) {
            console.error(e);
            setStatus("unsaved");
        }
    }, [activeSceneId]);

    // Calculate previous/next scenes
    const activeSceneIndex = scenes?.findIndex(s => s.id === activeSceneId) ?? -1;
    const prevSceneId = activeSceneIndex > 0 ? scenes?.[activeSceneIndex - 1]?.id : null;
    const nextSceneId = activeSceneIndex !== -1 && activeSceneIndex < (scenes?.length ?? 0) - 1 ? scenes?.[activeSceneIndex + 1]?.id : null;

    return (
        <div className="flex flex-col h-full bg-background relative">
            {/* Simple Scene Toolbar */}
            <div className="p-2 flex items-center justify-between transition-opacity hover:opacity-100 opacity-50 focus-within:opacity-100">
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => prevSceneId && setActiveScene(prevSceneId)}
                        disabled={!prevSceneId}
                        className="h-8 w-8 p-0"
                        title="Previous Scene"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>

                    <select
                        value={activeSceneId || ''}
                        onChange={(e) => setActiveScene(e.target.value)}
                        className="h-8 rounded-md border-none bg-transparent text-foreground px-3 text-sm font-medium focus:outline-none cursor-pointer hover:bg-accent/50 max-w-[150px] md:max-w-xs truncate"
                    >
                        {scenes?.map(s => <option key={s.id} value={s.id} className="bg-background text-foreground">{s.title}</option>)}
                    </select>

                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => nextSceneId && setActiveScene(nextSceneId)}
                        disabled={!nextSceneId}
                        className="h-8 w-8 p-0"
                        title="Next Scene"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>

                    <div className="w-[1px] h-4 bg-border mx-1" />

                    <Button size="sm" variant="ghost" onClick={createNewScene} className="h-8 w-8 p-0" title="New Scene">
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                    {status === 'saving' && <span className="animate-pulse">Saving...</span>}
                    {status === 'saved' && <span>All changes saved</span>}
                    {status === 'unsaved' && <span className="text-red-500">Unsaved changes</span>}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {/* Key prop ensures editor remounts when scene changes */}
                {activeScene && (
                    <NovelEditor
                        key={activeScene.id}
                        initialContent={activeScene.content}
                        onUpdate={handleUpdate}
                        sceneId={activeScene.id}
                    />
                )}
            </div>
        </div>
    );
}
