
"use client";

import { useState, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { Act, Chapter, Scene } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { Plus, BookOpen, Trash2, Upload, Download } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { ExportService } from "@/lib/export";
import * as mammoth from "mammoth";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { uploadNovelToCloud, fetchUserNovels, downloadNovelFromCloud } from "@/lib/db/cloud";
import { Cloud, LogIn, LogOut, RefreshCw } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { parseEpub } from "@/lib/epub";


export default function ProjectDashboard() {
    const novels = useLiveQuery(() => db.novels.toArray());
    const [newTitle, setNewTitle] = useState("");
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { user, loading: authLoading } = useUser();
    const [syncing, setSyncing] = useState(false);

    const handleLogin = () => router.push('/login');
    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.refresh(); // dependent on how useUser works, might need window.location.reload()
    };

    const handleCloudUpload = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!user) return alert("Please login first");

        try {
            setSyncing(true);
            await uploadNovelToCloud(id, user.id);
            alert("Project uploaded to cloud successfully!");
        } catch (err: any) {
            alert("Upload failed: " + err.message);
        } finally {
            setSyncing(false);
        }
    };

    const handleCloudSync = async () => {
        if (!user) return;
        try {
            setSyncing(true);
            const cloudNovels = await fetchUserNovels(user.id);
            if (!cloudNovels || cloudNovels.length === 0) {
                alert("No projects found in cloud.");
                return;
            }

            // For now, just simplistic "Download All" or let user choose. 
            // To keep UI simple, let's just attempt to download/update all.
            // A better UI would be a dialog.
            let count = 0;
            for (const novel of cloudNovels) {
                // Check if exists
                const exists = await db.novels.get(novel.id);
                if (!exists || confirm(`Overwrite local version of "${novel.title}"?`)) {
                    await downloadNovelFromCloud(novel.id);
                    count++;
                }
            }
            alert(`Synced ${count} projects from cloud.`);
        } catch (err: any) {
            alert("Sync failed: " + err.message);
        } finally {
            setSyncing(false);
        }
    };


    const createNovel = async () => {
        if (!newTitle.trim()) return;
        const id = uuidv4();
        await db.novels.add({
            id,
            title: newTitle,
            author: "Unknown",
            createdAt: Date.now(),
            lastModified: Date.now(),
            settings: {
                theme: "system",
                aiProvider: "ollama",
            },
        });
        setNewTitle("");
        router.push(`/project/${id}/write`);
    };

    const deleteNovel = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this novel?")) {
            await db.transaction('rw', [db.novels, db.acts, db.chapters, db.scenes, db.codex], async () => {
                // 1. Get Acts to find Chapters (since Chapters don't map directly to NovelId in schema)
                const acts = await db.acts.where({ novelId: id }).toArray();
                const actIds = acts.map(a => a.id);

                // 2. Delete Chapters belonging to these Acts
                if (actIds.length > 0) {
                    await db.chapters.where('actId').anyOf(actIds).delete();
                }

                // 3. Delete Acts
                await db.acts.where({ novelId: id }).delete();

                // 4. Delete Scenes
                await db.scenes.where({ novelId: id }).delete();

                // 5. Delete Codex
                await db.codex.where({ novelId: id }).delete();

                // 6. Delete Novel
                await db.novels.delete(id);
            });
        }
    }

    const exportNovel = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        try {
            await ExportService.exportProject(id);
        } catch (err) {
            alert("Export Failed: " + err);
        }
    }

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            // 1. Handle .narch (NovelArchitect Export)
            if (file.name.endsWith('.narch')) {
                const newId = await ExportService.importProject(file);
                alert("Import Successful!");
                router.push(`/project/${newId}/write`);
                return;
            }

            // 2. Handle EPUB Import
            if (file.name.endsWith('.epub')) {
                const chapters = await parseEpub(file);
                const id = uuidv4();

                await db.novels.add({
                    id,
                    title: file.name.replace(/\.[^/.]+$/, ""),
                    author: "Unknown",
                    createdAt: Date.now(),
                    lastModified: Date.now(),
                    settings: {
                        theme: "system",
                        aiProvider: "ollama",
                    },
                });

                // Create default Act
                const actId = uuidv4();
                await db.acts.add({
                    id: actId,
                    novelId: id,
                    title: "Act 1",
                    order: 0,
                    summary: "Imported EPUB Content"
                });

                // Create Scenes from Chapters
                // We will create a new Chapter for each EPUB chapter if they are large, 
                // or just treat them as scenes in one big chapter? 
                // Standard EPUB structure usually has one file per chapter.
                // Let's create a wrapper Chapter 1 and put scenes in it, OR
                // if we want to mirror structure, maybe map EPUB chapters to Database Chapters?
                // For simplicity and editing, let's map EPUB chapters to SCENES, grouped in one "Imported" Chapter.
                // Rationale: Users often write one scene per file in other tools.

                const chapterId = uuidv4();
                await db.chapters.add({
                    id: chapterId,
                    actId: actId,
                    title: "Imported Chapters",
                    order: 0,
                    summary: "Content from EPUB"
                });

                const newScenes: Scene[] = chapters.map((ch, index) => {
                    return {
                        id: uuidv4(),
                        novelId: id,
                        chapterId: chapterId,
                        title: ch.title,
                        content: ch.content,
                        beats: "",
                        order: index,
                        lastModified: Date.now(),
                        metadata: {
                            status: 'draft',
                            wordCount: ch.content.replace(/<[^>]*>/g, '').split(/\s+/).length,
                            povCharacterId: null,
                            locationId: null,
                            timeOfDay: "Unknown"
                        },
                        cachedMentions: []
                    };
                });

                await db.scenes.bulkAdd(newScenes);

                alert("EPUB Import Successful!");
                router.push(`/project/${id}/write`);
                return;
            }

            // 3. Handle Text / DOCX Import
            let content = "";
            let title = file.name.replace(/\.[^/.]+$/, "");

            if (file.name.endsWith('.docx')) {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                content = result.value;
                if (result.messages.length > 0) {
                    console.warn("Mammoth messages:", result.messages);
                }
            } else {
                // Assume text/md
                content = await file.text();
            }

            // Create new Novel from content
            const id = uuidv4();
            await db.novels.add({
                id,
                title: title,
                author: "Unknown",
                createdAt: Date.now(),
                lastModified: Date.now(),
                settings: {
                    theme: "system",
                    aiProvider: "ollama",
                },
            });

            // Smart Splitting Logic
            const lines = content.split(/\r?\n/);
            const rawScenes: { title: string; content: string }[] = [];
            let currentTitle = "Prologue";
            let currentBuffer: string[] = [];

            // Regex for Chapter Headers
            const HEADER_REGEX = /^(?:#+\s+(.*)|(Chapter\s+\d+.*)|(第\s*[0-90-9一二三四五六七八九十百千]+\s*章.*))$/i;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const match = line.match(HEADER_REGEX);

                if (match) {
                    // Found a header
                    if (currentBuffer.length > 0) {
                        // Save previous scene
                        rawScenes.push({
                            title: currentTitle,
                            content: currentBuffer.join('\n')
                        });
                    }
                    // Start new scene
                    currentTitle = line;
                    if (line.startsWith('#')) {
                        currentTitle = line.replace(/^#+\s+/, '');
                    }
                    currentBuffer = [];
                } else {
                    currentBuffer.push(lines[i]);
                }
            }

            // Push final scene
            if (currentBuffer.length > 0) {
                rawScenes.push({
                    title: currentTitle,
                    content: currentBuffer.join('\n')
                });
            }

            if (rawScenes.length === 0) {
                rawScenes.push({ title: "Empty", content: "" });
            }

            // Hierarchy Creation
            // Create default Act 1
            const actId = uuidv4();
            const act: Act = {
                id: actId,
                novelId: id,
                title: "Act 1",
                order: 0,
                summary: "Imported Content"
            };

            // Create default Chapter 1 (Parent for all scenes for now)
            const chapterId = uuidv4();
            const chapter: Chapter = {
                id: chapterId,
                actId: actId,
                title: "Imported Chapter",
                order: 0,
                summary: "Imported Content"
            };

            // Batch Add Scenes
            const newScenes: Scene[] = rawScenes.map((scene, index) => {
                // Formatting content to HTML for Tiptap
                const htmlContent = scene.content.split(/\r?\n/)
                    .filter(line => line.trim() !== '')
                    .map(line => `<p>${line}</p>`)
                    .join('');

                return {
                    id: uuidv4(),
                    novelId: id,
                    chapterId: chapterId,
                    title: scene.title,
                    content: htmlContent,
                    beats: "", // Default empty beats
                    order: index,
                    lastModified: Date.now(),
                    metadata: {
                        status: 'draft',
                        wordCount: scene.content.split(/\s+/).length,
                        povCharacterId: null, // Fixed: use povCharacterId
                        locationId: null,
                        timeOfDay: "Unknown"
                    },
                    cachedMentions: [] // Default empty cache
                };
            });

            await db.acts.add(act);
            await db.chapters.add(chapter);
            await db.scenes.bulkAdd(newScenes);

            alert("Import Successful!");
            router.push(`/project/${id}/write`);

        } catch (err) {
            console.error(err);
            alert("Import Failed: " + err);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }

    return (
        <div className="flex flex-col gap-10">
            {/* Hero Section */}
            <div className="relative rounded-2xl border border-border/50 bg-secondary/20 p-8 md:p-10 z-50">
                {/* Background Container - Handles Clipping */}
                <div className="absolute inset-0 overflow-hidden rounded-2xl -z-10">
                    {/* Background Blobs/Effects would go here if we had them active, currently they were just bg-secondary/20 which is on the parent now, or we can move them back if we re-add blobs. */}
                </div>

                <div className="relative z-10 flex flex-col md:flex-row justify-between items-end gap-6">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-foreground/90 font-serif">
                            Library
                        </h2>
                    </div>

                    <div className="flex items-center gap-3">
                        <ThemeSwitcher />
                        {authLoading ? (
                            <span className="text-sm text-muted-foreground animate-pulse">
                                Loading...
                            </span>
                        ) : user ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={handleCloudSync}
                                    disabled={syncing}
                                    className="h-9 px-4 font-normal text-muted-foreground hover:text-foreground"
                                >
                                    <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''} sm:mr-2`} />
                                    <span className="hidden sm:inline">Sync</span>
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={handleLogout}
                                    className="h-9 w-9 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                    <LogOut className="h-4 w-4" />
                                </Button>
                            </>
                        ) : (
                            <Button onClick={handleLogin} variant="outline" className="font-normal">
                                <LogIn className="mr-2 h-4 w-4" /> Login
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-col md:flex-row items-center gap-6 justify-between animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                <div className="flex flex-col md:flex-row items-center gap-4 flex-1 w-full md:w-auto">
                    <div className="relative w-full md:w-auto flex-1 md:max-w-md group">
                        <div className="absolute inset-0 bg-primary/20 blur-lg rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <Input
                            placeholder="Title of your next masterpiece..."
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            className="relative w-full bg-background/50 border-white/10 focus:border-primary/50 transition-all h-12 text-lg px-4 backdrop-blur-md"
                        />
                    </div>
                    <Button
                        onClick={createNovel}
                        className="w-full md:w-auto h-12 px-8 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-300 bg-primary text-primary-foreground text-md font-medium tracking-wide"
                    >
                        <Plus className="mr-2 h-5 w-5" /> Create Project
                    </Button>
                </div>

                <div className="w-full md:w-auto">
                    <input
                        type="file"
                        accept=".narch,.txt,.md,.docx,.epub"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleImport}
                    />
                    <Button
                        variant="secondary"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full md:w-auto h-12 border border-white/5 bg-secondary/50 hover:bg-secondary/80 backdrop-blur-sm"
                    >
                        <Upload className="mr-2 h-4 w-4" /> Import
                    </Button>
                </div>
            </div>

            {/* Projects Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
                {novels?.map((novel) => (
                    <div
                        key={novel.id}
                        className="group relative p-6 rounded-xl border border-border/40 bg-card hover:border-primary/20 transition-all duration-300 cursor-pointer flex flex-col justify-between h-56"
                        onClick={() => router.push(`/project/${novel.id}`)}
                    >
                        <div className="relative z-10 flex flex-col h-full">
                            <div className="flex justify-between items-start mb-4">
                                <div className="h-10 w-10 rounded-lg bg-secondary/50 flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors">
                                    <BookOpen className="h-5 w-5" />
                                </div>
                                <span className="text-xs font-medium text-muted-foreground/60">
                                    {new Date(novel.lastModified).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                            </div>

                            <h3 className="text-xl font-semibold mb-2 line-clamp-1 text-foreground">
                                {novel.title}
                            </h3>

                            <p className="text-sm text-muted-foreground line-clamp-2 font-light">
                                {novel.author && novel.author !== "Unknown" ? `by ${novel.author}` : ""}
                            </p>

                            <div className="mt-auto pt-4 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <Button variant="ghost" size="icon" onClick={(e) => exportNovel(e, novel.id)} title="Export" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                    <Download className="h-4 w-4" />
                                </Button>
                                {user && (
                                    <Button variant="ghost" size="icon" onClick={(e) => handleCloudUpload(e, novel.id)} title="Upload to Cloud" disabled={syncing} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                        <Cloud className="h-4 w-4" />
                                    </Button>
                                )}
                                <Button variant="ghost" size="icon" onClick={(e) => deleteNovel(e, novel.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}

                {novels?.length === 0 && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-center text-muted-foreground border border-dashed border-border/40 rounded-xl bg-secondary/5">
                        <div className="h-16 w-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
                            <BookOpen className="h-8 w-8 opacity-40" />
                        </div>
                        <p className="text-lg font-medium mb-1">No projects yet</p>
                        <p className="text-sm opacity-60 max-w-xs font-light">
                            Create your first project above.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

