
"use client";

import NovelEditor, { NovelEditorHandle } from "@/components/editor/NovelEditor";
import { useParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { useProjectStore } from "@/hooks/useProject";
import { Scene, Act, Chapter } from "@/lib/db/schema";
import { v4 as uuidv4 } from 'uuid';
import { Button } from "@/components/ui/button";
import { Plus, Save, ChevronLeft, ChevronRight, Sparkles, Loader2 } from "lucide-react";

export default function WritePage() {
    const params = useParams();
    const novelId = params.id as string;
    const { activeSceneId, setActiveScene } = useProjectStore();
    const [status, setStatus] = useState<"saved" | "saving" | "unsaved">("saved");
    const saveTimeoutRef = useRef<NodeJS.Timeout>(null);
    const editorRef = useRef<NovelEditorHandle>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

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
        // 1. Find or Create Act
        let actId = '';
        const acts = await db.acts.where({ novelId }).toArray();
        if (acts.length > 0) {
            actId = acts[0].id;
        } else {
            actId = uuidv4();
            await db.acts.add({
                id: actId,
                novelId,
                title: 'Act 1',
                order: 0,
                summary: ''
            });
        }

        // 2. Find or Create Chapter
        let chapterId = '';
        // Find chapters for this act
        const chapters = await db.chapters.where({ actId }).toArray();
        if (chapters.length > 0) {
            chapterId = chapters[0].id;
        } else {
            chapterId = uuidv4();
            await db.chapters.add({
                id: chapterId,
                actId,
                title: 'Chapter 1',
                order: 0,
                summary: ''
            });
        }

        const id = uuidv4();
        await db.scenes.add({
            id,
            novelId,
            chapterId,
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

    const handleUpdate = useCallback((content: any) => {
        if (!activeSceneId) return;
        setStatus("saving");

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(async () => {
            try {
                // Caluclate word count (naive)
                const text = JSON.stringify(content);
                const wordCount = text.length / 5; // Very rough approx

                console.warn('[Editor] Saving scene content to DB...', activeSceneId);
                await db.scenes.update(activeSceneId, {
                    content,
                    lastModified: Date.now(),
                    // partial update metadata?
                });
                console.warn('[Editor] Save complete.');
                setStatus("saved");
            } catch (e) {
                console.error(e);
                setStatus("unsaved");
            }
        }, 1000);
    }, [activeSceneId]);

    const handleAnalyze = async () => {
        if (editorRef.current) {
            setIsAnalyzing(true);
            try {
                await editorRef.current.handleAnalyze();
            } finally {
                setIsAnalyzing(false);
            }
        }
    };

    // Calculate previous/next scenes
    const activeSceneIndex = scenes?.findIndex(s => s.id === activeSceneId) ?? -1;
    const prevSceneId = activeSceneIndex > 0 ? scenes?.[activeSceneIndex - 1]?.id : null;
    const nextSceneId = activeSceneIndex !== -1 && activeSceneIndex < (scenes?.length ?? 0) - 1 ? scenes?.[activeSceneIndex + 1]?.id : null;

    return (
        <div className="flex flex-col h-full bg-background relative">
            {/* Simple Scene Toolbar */}
            <div className="p-2 flex items-center justify-between transition-opacity hover:opacity-100 opacity-50 focus-within:opacity-100 border-b">
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

                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        className="h-8 px-2 text-xs"
                    >
                        {isAnalyzing ? <Loader2 className="animate-spin h-3 w-3 mr-1" /> : <Sparkles className="h-3 w-3 mr-1 text-purple-500" />}
                        <span className="hidden sm:inline">{isAnalyzing ? "Analyzing..." : "Auto-Extract"}</span>
                    </Button>
                    <div className="w-[1px] h-4 bg-border mx-1 hidden sm:block" />
                    <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-2">
                        {status === 'saving' && <span className="animate-pulse">Saving...</span>}
                        {status === 'saved' && <span>Saved</span>}
                        {status === 'unsaved' && <span className="text-red-500">Unsaved</span>}
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {/* Key prop ensures editor remounts when scene changes */}
                {activeScene && (
                    <NovelEditor
                        ref={editorRef}
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
