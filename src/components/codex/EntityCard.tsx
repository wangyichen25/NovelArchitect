
"use client";

import { CodexEntry } from "@/lib/db/schema";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { Trash2, Save, Copy, Loader2, Image as ImageIcon, X, Merge } from "lucide-react";
import { AnalysisService } from "@/lib/services/analysis";
import MergeCodexDialog from "./MergeCodexDialog";
import { useTaskQueue } from "@/components/providers/TaskQueueProvider";
import { Scene, Chapter, Act } from "@/lib/db/schema";

export default function EntityCard({ entry, onSave, onDelete }: { entry: CodexEntry, onSave: () => void, onDelete: () => void }) {
    const [params] = useState<{ id: string }>(window.location.pathname.split("/")[2] ? { id: window.location.pathname.split("/")[2] } : { id: '' });
    const [data, setData] = useState<CodexEntry>(entry);
    const { addTask } = useTaskQueue();

    // Attempt to extract novelId from URL if possible or prop? 
    // EntityCard is used inside [id]/codex/page.tsx so params.id is available via next/navigation?
    // Actually EntityCard receives `entry` which has `novelId`.
    const [stylesList, setStylesList] = useState<string[]>(["Cinematic", "Anime", "Digital Art", "Oil Painting", "Photography", "Concept Art"]);
    const [customStyle, setCustomStyle] = useState("");
    const [isCustom, setIsCustom] = useState(false);
    const [showMergeDialog, setShowMergeDialog] = useState(false);
    const [history, setHistory] = useState<string[]>([]); // Deprecated generally, but keeping for session undo if needed, OR we just use gallery.
    // Let's use gallery from data directly.

    // Timeline logic
    const [scenes, setScenes] = useState<{ id: string, title: string, order: number, label: string }[]>([]);
    const [newEventText, setNewEventText] = useState("");
    const [selectedSceneId, setSelectedSceneId] = useState("");

    // Model Selection
    const [selectedModel, setSelectedModel] = useState<string>("google/gemini-3-pro-image-preview");
    const models = [
        { id: "google/gemini-3-pro-image-preview", name: "Gemini 3 Pro" },
        { id: "google/gemini-2.5-flash-image", name: "Gemini 2.5 Flash" },
        { id: "google/gemini-2.5-flash-image-preview", name: "Gemini 2.5 Flash Preview" },
        { id: "sourceful/riverflow-v2-fast-preview", name: "Riverflow v2 Fast" },
        { id: "sourceful/riverflow-v2-standard-preview", name: "Riverflow v2 Standard" },
        { id: "sourceful/riverflow-v2-max-preview", name: "Riverflow v2 Max" },
        { id: "black-forest-labs/flux.2-flex", name: "Flux.2 Flex" },
        { id: "black-forest-labs/flux.2-pro", name: "Flux.2 Pro" },
        { id: "openai/gpt-5-image-mini", name: "GPT-5 Image Mini" },
        { id: "openai/gpt-5-image", name: "GPT-5 Image" },
    ];

    useEffect(() => {
        setData(entry);
        loadStyles();
        loadScenes();
        // Load preferred model? For now default.
        const storedModel = localStorage.getItem('novel-architect-preferred-model');
        if (storedModel) setSelectedModel(storedModel);
    }, [entry]);

    const loadStyles = async () => {
        if (!entry.novelId) return;
        const novel = await db.novels.get(entry.novelId);
        if (novel && novel.settings?.imageStyles) {
            // Merge defaults with custom, ensuring unique
            const defaults = ["Cinematic", "Anime", "Digital Art", "Oil Painting", "Photography", "Concept Art"];
            const merged = Array.from(new Set([...defaults, ...novel.settings.imageStyles]));
            setStylesList(merged);
        }
    };

    const loadScenes = async () => {
        if (!entry.novelId) return;
        const [acts, chapters, scenes] = await Promise.all([
            db.acts.where({ novelId: entry.novelId }).toArray(),
            db.chapters.where({ novelId: entry.novelId }).toArray(), // No direct index for novelId currently on chapters/scenes? 
            // Actually schema says: chapters: 'id, actId, order' -> No novelId index?
            // Wait, schema for chapters is 'id, actId, order'. No novelId index.
            // But we can filter manually or rely on Act relationship.
            // Let's just fetch all and filter JS side if dataset is small, or use actIds.
            // The schema definition for chapters is `id, actId, order`.
            // The prompt says `chapters` has `novelId`? No, schema says `actId`.
            // Wait, `Scene` has `novelId`. `Act` has `novelId`. `Chapter` does NOT?
            // Let's check schema again. `Chapter` interface has `actId`. No novelId.
            // But Scene has `novelId`.
            // So for Scenes we can use `where({ novelId })`.
            // For Acts we can use `where({ novelId })`.
            // For Chapters, we need to get chapters for those acts.
            db.scenes.where({ novelId: entry.novelId }).toArray()
        ]);

        // We probably need chapters to label scenes nicely.
        // Let's just fetch all chapters since we can't easily filter by actId list in one go without 'anyOf'.
        const allChapters = await db.chapters.toArray(); // Inefficient but fine for client-side small DB
        const relevantChapters = allChapters.filter(c => acts.some(a => a.id === c.actId));

        // Sort: Act Order -> Chapter Order -> Scene Order
        acts.sort((a, b) => a.order - b.order);

        const sortedScenes: { id: string, title: string, order: number, label: string }[] = [];
        let globalOrder = 0;

        acts.forEach(act => {
            const actChapters = relevantChapters.filter(c => c.actId === act.id).sort((a, b) => a.order - b.order);
            actChapters.forEach(chap => {
                const chapScenes = scenes.filter(s => s.chapterId === chap.id).sort((a, b) => a.order - b.order);
                chapScenes.forEach(scene => {
                    sortedScenes.push({
                        id: scene.id,
                        title: scene.title,
                        order: globalOrder++,
                        label: `${scene.title} (Ch: ${chap.title})`
                    });
                });
            });
        });
        setScenes(sortedScenes);
    };

    // Add new style to DB settings
    const addCustomStyle = async (newStyle: string) => {
        if (!newStyle || stylesList.includes(newStyle)) return;
        const updatedList = [...stylesList, newStyle];
        setStylesList(updatedList);

        // Save to Settings
        const novel = await db.novels.get(entry.novelId);
        if (novel) {
            const settings = novel.settings || { theme: 'system', aiProvider: 'openai' };
            const currentCustoms = settings.imageStyles || [];
            if (!currentCustoms.includes(newStyle)) {
                await db.novels.update(entry.novelId, {
                    settings: { ...settings, imageStyles: [...currentCustoms, newStyle] }
                });
            }
        }
    };

    const handleSave = async () => {
        const id = data.id === 'new' ? uuidv4() : data.id;
        const toSave = { ...data, id };
        await db.codex.put(toSave);
        onSave();
    };

    const handleDelete = async () => {
        if (data.id !== 'new') {
            if (confirm("Delete this entry?")) {
                await db.codex.delete(data.id);
                onDelete();
            }
        } else {
            onDelete();
        }
    }

    const [generationCount, setGenerationCount] = useState(0);
    const [style, setStyle] = useState("Cinematic");
    useEffect(() => {
        const savedStyle = localStorage.getItem('novel-architect-last-style');
        if (savedStyle) setStyle(savedStyle);
    }, []);

    const updateStyle = (newStyle: string) => {
        setStyle(newStyle);
        localStorage.setItem('novel-architect-last-style', newStyle);
    };

    const handleGenerateImage = async () => {
        if (!data.visualSummary) {
            alert("No Visual Prompt available to generate from.");
            return;
        }

        await addTask(
            'image',
            `Generating Image: ${data.name}`,
            async (signal) => {
                setGenerationCount(prev => prev + 1);
                // Decrypt API Key
                const apiKey = await AnalysisService.getApiKey(entry.novelId || 'global', 'openrouter');

                if (!apiKey) {
                    throw new Error("Please configure OpenRouter API Key in Settings first (Images currently require OpenRouter).");
                }

                const response = await fetch('/api/generate-image', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-novel-architect-key': apiKey
                    },
                    body: JSON.stringify({ prompt: data.visualSummary, style, model: selectedModel }),
                    signal
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw err; // Will be caught by task queue
                }

                return await response.json();
            },
            async (res) => {
                const currentGallery = data.gallery && data.gallery.length > 0 ? data.gallery : (data.image ? [data.image] : []);
                const newGallery = [...currentGallery, res.url];
                setData(prev => ({ ...prev, image: res.url, gallery: newGallery })); // Use functional update for safety

                // Auto-save
                await db.codex.put({ ...data, image: res.url, gallery: newGallery });
                onSave(); // Refresh parent
                setGenerationCount(prev => prev - 1);
            },
            (error) => {
                setGenerationCount(prev => prev - 1);
                if (error.name !== 'AbortError') {
                    const errorMsg = error.message || JSON.stringify(error, null, 2);
                    alert(`Error: ${errorMsg}`);
                }
            }
        );
    };

    return (
        <div className="p-4 md:p-6 pb-24 max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <Input
                    value={data.name}
                    onChange={(e) => setData({ ...data, name: e.target.value })}
                    className="text-2xl font-bold border-none shadow-none focus-visible:ring-0 px-0"
                    placeholder="Entry Name"
                />
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setShowMergeDialog(true)} title="Merge with another entry">
                        <Merge className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button onClick={handleSave}>
                        <Save className="mr-2 h-4 w-4" /> Save
                    </Button>
                </div>
            </div>

            <MergeCodexDialog
                open={showMergeDialog}
                onOpenChange={setShowMergeDialog}
                currentEntry={data}
                onSuccess={() => {
                    // Refresh data after merge (aliases likely updated)
                    // The onSave() might trigger a refresh up the chain, but let's ensure we reload locally too if needed
                    // Actually handleSave does db.codex.put(data), so we should reload data from props or re-fetch.
                    // But wait, the merge happens in the dialog on the DB level.
                    // So we must reload 'data' from DB to see the new aliases.
                    db.codex.get(data.id).then(updated => {
                        if (updated) setData(updated);
                    });
                    onSave(); // Notify parent list to refresh
                }}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-sm font-medium text-muted-foreground">Category</label>
                    <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                        value={data.category}
                        onChange={(e) => setData({ ...data, category: e.target.value as any })}
                    >
                        <option value="character">Character</option>
                        <option value="location">Location</option>
                        <option value="object">Object</option>
                        <option value="lore">Lore</option>
                    </select>
                </div>
                <div>
                    <label className="text-sm font-medium text-muted-foreground">Aliases (comma separated)</label>
                    <Input
                        value={data.aliases?.join(', ')}
                        onChange={(e) => setData({ ...data, aliases: e.target.value.split(',').map(s => s.trim()).filter(s => s) })}
                        placeholder="e.g. Gandalf, Mithrandir"
                    />
                </div>
            </div>

            {/* Image Display */}
            {data.image && (
                <div className="rounded-lg overflow-hidden border border-border relative group">
                    <img src={data.image} alt="Generated visual" className="w-full h-auto object-contain max-h-[500px]" />

                    {/* Delete Button */}
                    <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title="Remove Image"
                        onClick={async () => {
                            if (confirm("Remove this image?")) {
                                if (data.image) setHistory(prev => [...prev, data.image!]);
                                const updated = { ...data };
                                delete updated.image;
                                setData(updated);
                                await db.codex.put(updated);
                                onSave();
                            }
                        }}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>

                    {/* Modify Button / UI */}
                    <div className="absolute top-2 left-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 w-[calc(100%-4rem)]">
                        <div className="bg-background/90 backdrop-blur p-1 rounded-md border flex gap-1 flex-1 shadow-sm">
                            <Input
                                placeholder="Modify: e.g. 'Make eyes blue'"
                                className="h-8 text-xs border-none focus-visible:ring-0 bg-transparent flex-1 min-w-[100px]"
                                onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                        const prompt = (e.target as HTMLInputElement).value;
                                        if (!prompt) return;

                                        // queue task for modification
                                        await addTask(
                                            'image',
                                            `Modifying Image: ${data.name}`,
                                            async (signal) => {
                                                setGenerationCount(c => c + 1);
                                                // 1. Compress Image if needed
                                                const resizeImage = (base64Str: string, maxWidth = 1024): Promise<string> => {
                                                    return new Promise((resolve) => {
                                                        const img = new Image();
                                                        img.src = base64Str;
                                                        img.onload = () => {
                                                            const canvas = document.createElement('canvas');
                                                            let width = img.width;
                                                            let height = img.height;
                                                            if (width > maxWidth) {
                                                                height = Math.round((height * maxWidth) / width);
                                                                width = maxWidth;
                                                            }
                                                            canvas.width = width;
                                                            canvas.height = height;
                                                            const ctx = canvas.getContext('2d');
                                                            ctx?.drawImage(img, 0, 0, width, height);
                                                            resolve(canvas.toDataURL('image/jpeg', 0.8));
                                                        };
                                                    });
                                                };

                                                let payloadImage = data.image; // current image
                                                if (data.image && data.image.length > 500000) {
                                                    console.log("Resizing image before upload...");
                                                    payloadImage = await resizeImage(data.image);
                                                }

                                                // 2. Call API
                                                const apiKey = localStorage.getItem('novel-architect-key-openrouter');
                                                if (!apiKey) throw new Error("Missing API Key");

                                                const res = await fetch('/api/generate-image', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', 'x-novel-architect-key': apiKey || '' },
                                                    body: JSON.stringify({ prompt, image: payloadImage, style: "None", model: selectedModel }),
                                                    signal
                                                });
                                                return await res.json();
                                            },
                                            async (json) => {
                                                if (json.url) {
                                                    const currentGallery = data.gallery && data.gallery.length > 0 ? data.gallery : (data.image ? [data.image] : []);
                                                    const newGallery = [...currentGallery, json.url];
                                                    setData(prev => ({ ...prev, image: json.url, gallery: newGallery }));
                                                    await db.codex.put({ ...data, image: json.url, gallery: newGallery });
                                                    onSave();
                                                    (e.target as HTMLInputElement).value = "";
                                                } else {
                                                    alert("Failed to modify: " + (json.error || "Unknown"));
                                                }
                                                setGenerationCount(c => c - 1);
                                            },
                                            (err) => {
                                                console.error(err);
                                                if (err.name !== 'AbortError') alert("Error modifying image: " + err);
                                                setGenerationCount(c => c - 1);
                                            }
                                        );
                                    }
                                }}
                            />
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-xs" title="Press Enter to Modify">
                                <span className="text-purple-500">✨</span>
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Gallery Strip */}
            {
                data.gallery && data.gallery.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {data.gallery.map((img, idx) => (
                            <div
                                key={idx}
                                className={`relative flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border cursor-pointer hover:opacity-80 transition-all group ${data.image === img ? 'ring-2 ring-primary' : 'border-border'}`}
                                onClick={async () => {
                                    setData({ ...data, image: img });
                                    await db.codex.put({ ...data, image: img });
                                    onSave();
                                }}
                            >
                                <img src={img} className="w-full h-full object-cover" />
                                <button
                                    className="absolute top-0 right-0 bg-black/50 hover:bg-red-500 text-white p-0.5 rounded-bl-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        if (confirm("Remove from gallery?")) {
                                            const newGallery = data.gallery?.filter(i => i !== img);
                                            setData({ ...data, gallery: newGallery });
                                            await db.codex.put({ ...data, gallery: newGallery });
                                            onSave();
                                        }
                                    }}
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        )).reverse()}
                    </div>
                )
            }

            <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Notes</label>
                <textarea
                    className="flex min-h-[300px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={data.notes}
                    onChange={(e) => setData({ ...data, notes: e.target.value })}
                    placeholder="Chronological notes log... Use [[Scene: Title]] to mark scene-specific reveals."
                />
            </div>

            {/* Timeline Events Section REMOVED - using logical Notes Log now */}

            <div className="bg-muted/30 p-4 rounded-md text-xs text-muted-foreground">
                <p className="font-semibold mb-1">💡 Tips for Notes Log:</p>
                <p className="mb-2">
                    Use the format <code>[[Scene: Scene Title]]</code> to mark when specific information is revealed.
                    The Editor will automatically hide notes that appear under future scene headers.
                </p>
                <p>
                    Everything before the first header is considered "Backstory" and is always visible.
                </p>
            </div>

            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-muted-foreground">Visual Prompt (Image Generation Tags)</label>
                    <div className="flex gap-2 items-center">
                        {/* Model Selector */}
                        <select
                            className="h-6 text-xs rounded border border-input bg-background text-foreground px-1 max-w-[120px]"
                            value={selectedModel}
                            onChange={(e) => {
                                setSelectedModel(e.target.value);
                                localStorage.setItem('novel-architect-preferred-model', e.target.value);
                            }}
                        >
                            {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>

                        {!isCustom ? (
                            <select
                                className="h-6 text-xs rounded border border-input bg-background text-foreground px-1"
                                value={style}
                                onChange={(e) => {
                                    if (e.target.value === 'CUSTOM_NEW') {
                                        setIsCustom(true);
                                        setCustomStyle("");
                                    } else {
                                        updateStyle(e.target.value);
                                    }
                                }}
                            >
                                <option value="None">No Style</option>
                                <optgroup label="Presets">
                                    {stylesList.map(s => <option key={s} value={s}>{s}</option>)}
                                </optgroup>
                                <option value="CUSTOM_NEW">+ Custom / Edit...</option>
                            </select>
                        ) : (
                            <div className="flex gap-1 items-center animate-in fade-in">
                                <Input
                                    autoFocus
                                    className="h-6 w-32 text-xs px-1"
                                    placeholder="Type style..."
                                    value={customStyle}
                                    onChange={e => setCustomStyle(e.target.value)}
                                    onBlur={() => {
                                        if (!customStyle) setIsCustom(false);
                                    }}
                                    onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                            if (customStyle) {
                                                await addCustomStyle(customStyle);
                                                updateStyle(customStyle);
                                                setIsCustom(false);
                                            }
                                        } else if (e.key === 'Escape') {
                                            setIsCustom(false);
                                        }
                                    }}
                                />
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    onClick={async () => {
                                        if (customStyle) {
                                            await addCustomStyle(customStyle);
                                            updateStyle(customStyle);
                                        }
                                        setIsCustom(false);
                                    }}
                                >
                                    <Save className="h-3 w-3" />
                                </Button>
                            </div>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={handleGenerateImage}
                            disabled={!data.visualSummary}
                        >
                            {generationCount > 0 ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <ImageIcon className="mr-2 h-3 w-3" />}
                            Generate {generationCount > 0 ? `(${generationCount})` : ''}
                        </Button>
                        <div className="relative">
                            <input
                                type="file"
                                accept="image/*"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onloadend = async () => {
                                            const base64 = reader.result as string;
                                            const currentGallery = data.gallery && data.gallery.length > 0 ? data.gallery : (data.image ? [data.image] : []);
                                            const newGallery = [...currentGallery, base64];
                                            setData({ ...data, image: base64, gallery: newGallery });
                                            await db.codex.put({ ...data, image: base64, gallery: newGallery });
                                            onSave();
                                        };
                                        reader.readAsDataURL(file);
                                    }
                                }}
                            />
                            <Button variant="outline" size="sm" className="h-6 text-xs">
                                <span className="mr-2">📤</span> Upload
                            </Button>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => {
                                if (data.visualSummary) {
                                    navigator.clipboard.writeText(data.visualSummary);
                                    alert("Copied to clipboard!");
                                }
                            }}
                        >
                            <Copy className="mr-2 h-3 w-3" /> Copy Tags
                        </Button>
                    </div>
                </div>
                <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={data.visualSummary || ''}
                    onChange={(e) => setData({ ...data, visualSummary: e.target.value })}
                    placeholder="Natural description: 'Subject + Context + Framing + Lighting' (e.g. 'A weathered knight stands in rain, wide shot, moody lighting')"
                />
            </div>
        </div >
    );
}
