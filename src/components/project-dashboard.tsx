
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

            // 2. Handle Text / DOCX Import
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
        <div className="flex flex-col gap-8">
            {/* Header / Auth */}
            <div className="flex justify-between items-center bg-zinc-100 dark:bg-zinc-900 p-4 rounded-lg">
                <div>
                    <h2 className="text-lg font-semibold">My Workspace</h2>
                </div>
                <div className="flex items-center gap-4">
                    {authLoading ? (
                        <span className="text-sm text-muted-foreground">Loading...</span>
                    ) : user ? (
                        <>
                            <span className="text-sm text-muted-foreground hidden md:inline">
                                {user.email?.replace('@novelarchitect.com', '')}
                            </span>
                            <Button variant="outline" size="sm" onClick={handleCloudSync} disabled={syncing}>
                                <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                                Sync Cloud
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleLogout}>
                                <LogOut className="mr-2 h-4 w-4" /> Logout
                            </Button>
                        </>
                    ) : (
                        <Button size="sm" onClick={handleLogin}>
                            <LogIn className="mr-2 h-4 w-4" /> Login
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex flex-col md:flex-row items-center gap-4 justify-between">
                <div className="flex flex-col md:flex-row items-center gap-4 flex-1 w-full md:w-auto">
                    <Input
                        placeholder="New Novel Project Title..."
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full md:max-w-md"
                    />
                    <Button onClick={createNovel} className="w-full md:w-auto">
                        <Plus className="mr-2 h-4 w-4" /> Create Project
                    </Button>
                </div>
                <div className="w-full md:w-auto flex justify-center md:justify-end">
                    <input
                        type="file"
                        accept=".narch,.txt,.md,.docx"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleImport}
                    />
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full md:w-auto">
                        <Upload className="mr-2 h-4 w-4" /> Import Project
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {novels?.map((novel) => (
                    <div
                        key={novel.id}
                        className="p-6 border rounded-lg hover:border-primary cursor-pointer transition-all bg-card text-card-foreground shadow-sm flex flex-col justify-between h-40 group"
                        onClick={() => router.push(`/project/${novel.id}`)}
                    >
                        <div>
                            <h3 className="text-xl font-bold font-serif mb-2">{novel.title}</h3>
                            <p className="text-sm text-muted-foreground">Last edited: {new Date(novel.lastModified).toLocaleDateString()}</p>
                        </div>
                        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                            <Button variant="ghost" size="icon" onClick={(e) => exportNovel(e, novel.id)} title="Export">
                                <Download className="h-4 w-4" />
                            </Button>
                            {user && (
                                <Button variant="ghost" size="icon" onClick={(e) => handleCloudUpload(e, novel.id)} title="Upload to Cloud" disabled={syncing}>
                                    <Cloud className="h-4 w-4" />
                                </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={(e) => deleteNovel(e, novel.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ))}
                {novels?.length === 0 && (
                    <div className="col-span-full text-center py-20 text-muted-foreground">
                        <BookOpen className="mx-auto h-12 w-12 mb-4 opacity-50" />
                        <p>No projects yet. Start your journey by creating one above.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
