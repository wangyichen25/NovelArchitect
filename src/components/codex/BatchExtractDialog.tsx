"use client";

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Play, CheckCircle2, RotateCcw } from "lucide-react";
import { db } from "@/lib/db";
import { Act, Scene } from "@/lib/db/schema";
import { AnalysisService } from "@/lib/services/analysis";
import { useParams } from "next/navigation";
import { useTaskQueue } from "@/components/providers/TaskQueueProvider";

interface TreeNode {
    id: string;
    label: string;
    type: 'act' | 'scene';
    children?: TreeNode[];
    data?: any;
}

export default function BatchExtractDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
    const params = useParams();
    const novelId = params.id as string;

    const [tree, setTree] = useState<TreeNode[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState<{ current: number, total: number, message: string } | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const abortRef = useRef(false);
    const { addTask } = useTaskQueue();

    useEffect(() => {
        if (open && novelId) {
            loadStructure();
        }
    }, [open, novelId]);

    useEffect(() => {
        if (!open) {
            // Reset abort on close? Or just when opening?
            abortRef.current = false;
        }
    }, [open]);

    const extractTextFromContent = (content: any): string => {
        if (!content) return "";

        // 1. If it's a string, assume HTML (legacy/import)
        if (typeof content === 'string') {
            const div = document.createElement('div');
            div.innerHTML = content;
            return div.innerText || "";
        }

        // 2. If it's a Tiptap JSON object
        if (typeof content === 'object') {
            // Recursive extractor
            let text = "";
            if (content.text) {
                text += content.text;
            }
            if (content.content && Array.isArray(content.content)) {
                content.content.forEach((child: any) => {
                    text += extractTextFromContent(child) + "\n";
                });
            }
            return text.trim();
        }

        return "";
    };

    const loadStructure = async () => {
        setLoading(true);
        try {
            const acts = await db.acts.where({ novelId }).sortBy('order');
            const scenes = await db.scenes.where({ novelId }).sortBy('order');

            const nodes: TreeNode[] = [];

            // Group Layout logic: Act -> Chapter -> Scene?
            // Current schema has Acts and Chapters, but Scene has chapterId. 
            // Simplifying to Act -> Scene for now as Chapter structure reconstruction takes more effort 
            // and often Scenes map directly to Acts in simple views.
            // Let's try to do Act -> Scene grouping.

            for (const act of acts) {
                const actScenes = scenes.filter(s => {
                    // We need to resolve act ownership via chapter lookup or if direct?
                    // Schema: Scene -> Chapter -> Act.
                    // We need chapters too.
                    return false; // temp
                });
            }

            // Let's just do a flat list or grouping by Act -> Chapter is safer but requires fetching chapters.
            const chapters = await db.chapters.where('actId').anyOf(acts.map(a => a.id)).toArray();

            for (const act of acts) {
                const actChapters = chapters.filter(c => c.actId === act.id).sort((a, b) => a.order - b.order);
                const actNode: TreeNode = {
                    id: act.id,
                    label: act.title,
                    type: 'act',
                    children: []
                };

                for (const chap of actChapters) {
                    // Ideally we'd have Chapter nodes, but let's flatten scenes under Acts for simplicity
                    // or show Chapter headers. Users select Scenes usually.
                    const chapScenes = scenes.filter(s => s.chapterId === chap.id).sort((a, b) => a.order - b.order);

                    if (chapScenes.length > 0) {
                        const sceneNodes: TreeNode[] = chapScenes.map(s => ({
                            id: s.id,
                            label: s.title,
                            type: 'scene',
                            data: s
                        }));
                        // Add scene nodes directly to Act for now, or maybe grouped by chapter label?
                        // Let's just add scenes to actNode for simpler UI
                        actNode.children!.push(...sceneNodes);
                    }
                }

                // Only add acts that have content?
                // Or maybe the user has scenes without acts (unlikely)?
                nodes.push(actNode);
            }

            // Handle orphaned scenes?
            // const mappedIds = new Set(nodes.flatMap(n => n.children?.map(c => c.id) || []));
            // const orphans = scenes.filter(s => !mappedIds.has(s.id));
            // if (orphans.length > 0) {
            //     nodes.push({ id: 'orphans', label: 'Uncategorized', type: 'act', children: orphans.map(s => ({ id: s.id, label: s.title, type: 'scene', data: s })) });
            // }

            setTree(nodes);
        } finally {
            setLoading(false);
        }
    };

    const toggleSelection = (id: string, checked: boolean) => {
        const newSet = new Set(selectedIds);
        if (checked) {
            newSet.add(id);
            // If it's a parent, select all children
            const node = tree.find(n => n.id === id);
            if (node && node.children) {
                node.children.forEach(c => newSet.add(c.id));
            }
        } else {
            newSet.delete(id);
            // If it's a parent, deselect all children
            const node = tree.find(n => n.id === id);
            if (node && node.children) {
                node.children.forEach(c => newSet.delete(c.id));
            }
        }
        setSelectedIds(newSet);
    };

    const handleStop = () => {
        if (confirm("Stop batch analysis? Progress so far will be saved.")) {
            abortRef.current = true;
            // The loop will break on next iteration
        }
    }

    const runAnalysis = async () => {
        abortRef.current = false; // Reset
        const scenesToProcess: Scene[] = [];

        // Gather scenes
        tree.forEach(act => {
            if (act.children) {
                act.children.forEach(sceneNode => {
                    if (selectedIds.has(sceneNode.id)) {
                        scenesToProcess.push(sceneNode.data);
                    }
                });
            }
        });

        if (scenesToProcess.length === 0) {
            alert("No scenes selected.");
            return;
        }

        setProcessing(true);
        setLogs([]);
        setProgress({ current: 0, total: scenesToProcess.length, message: "Initializing..." });

        try {
            // Get Settings (Global)
            const provider = localStorage.getItem('novel-architect-provider') || 'openai';
            const model = localStorage.getItem(`novel-architect-model-${provider}`);
            // Use AnalysisService to get key (checks Profiles > LocalStorage)
            const apiKey = await AnalysisService.getApiKey(novelId, provider);

            if (!apiKey && provider !== 'ollama') {
                throw new Error("Missing API Key. Please check Global Settings.");
            }

            const analysisSettings = {
                provider,
                model: model || undefined,
                apiKey: apiKey || undefined
            };

            let totalNew = 0;
            let totalUpdated = 0;

            for (let i = 0; i < scenesToProcess.length; i++) {
                if (abortRef.current) {
                    setLogs(prev => [...prev, "⚠ Processing stopped by user."]);
                    break;
                }

                const scene = scenesToProcess[i];
                setProgress({ current: i + 1, total: scenesToProcess.length, message: `Analyzing: ${scene.title}` });

                try {
                    const text = extractTextFromContent(scene.content);

                    if (text.length < 50) {
                        setLogs(prev => [...prev, `Skipped ${scene.title}: Too short (${text.length} chars)`]);
                        continue;
                    }

                    await addTask(
                        'analysis',
                        `Batch: ${scene.title}`,
                        async (signal) => {
                            return await AnalysisService.analyzeText(novelId, text, analysisSettings, undefined, signal);
                        },
                        async (result) => {
                            totalNew += result.new;
                            totalUpdated += result.updated;
                            setLogs(prev => [...prev, `✓ ${scene.title}: +${result.new} new, ~${result.updated} updated`]);

                            // Update scene lastAnalyzed in metadata
                            const currentMeta = scene.metadata || { povCharacterId: null, locationId: null, timeOfDay: '', wordCount: 0, status: 'draft' };
                            await db.scenes.update(scene.id, { metadata: { ...currentMeta, lastAnalyzed: Date.now() } });
                        },
                        (e) => {
                            throw e; // Propagate to outer catch
                        }
                    );

                    // const result = await AnalysisService.analyzeText(novelId, text, analysisSettings); 
                    // Moved logic to onSuccess/task
                    // Note: addTask awaits the taskFn, but we wait for valid result? 
                    // addTask returns Promise<void>. It resolves when task finishes/failed.
                    // The onSuccess runs before addTask resolves? 
                    // Our TaskQueueProvider implementation:
                    // await taskFn() -> if success -> onSuccess -> resolve
                    // if error -> onError -> catch block -> resolve (if error handled?)
                    // The provider implementation catches error and calls onError, but DOES NOT rethrow unless we want it to?
                    // The provider implementation swallows error after onError.
                    // So `addTask` usually resolves to void.
                    // But we rely on `totalNew` mutation. This works because it's in closure.

                } catch (e: any) {
                    console.error(e);
                    setLogs(prev => [...prev, `❌ ${scene.title}: ${e.message}`]);
                }
            }

            setProgress(null);
            if (abortRef.current) {
                alert(`Batch Analysis Stopped.\nTotal New: ${totalNew}\nTotal Updated: ${totalUpdated}`);
            } else {
                alert(`Batch Analysis Complete!\nTotal New: ${totalNew}\nTotal Updated: ${totalUpdated}`);
            }
            onOpenChange(false);
            window.location.reload(); // Refresh to show new data in sidebar

        } catch (e: any) {
            alert("Error starting batch: " + e.message);
        } finally {
            setProcessing(false);
            abortRef.current = false;
        }
    };

    const handleResetStatus = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm("Reset extraction status for selected scenes? They will be marked as not analyzed.")) return;

        setLoading(true);
        try {
            const sceneIds: string[] = [];
            tree.forEach(act => {
                if (act.children) {
                    act.children.forEach(sceneNode => {
                        if (selectedIds.has(sceneNode.id)) {
                            sceneIds.push(sceneNode.id);
                        }
                    });
                }
            });

            await db.scenes.where('id').anyOf(sceneIds).modify(s => {
                if (s.metadata) s.metadata.lastAnalyzed = undefined;
            });

            await loadStructure();
        } catch (e) {
            console.error(e);
            alert("Failed to reset status");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => {
            // If processing, do not allow closing via overlay click unless we stop?
            // Better to force user to click Stop.
            if (!processing) onOpenChange(v);
        }}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Batch Auto-Extract</DialogTitle>
                    <DialogDescription>Select scenes to analyze for entities.</DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col gap-4">
                    {processing ? (
                        <div className="flex flex-col items-center justify-center p-8 gap-4">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            {progress && (
                                <div className="text-center">
                                    <p className="font-semibold">{Math.round((progress.current / progress.total) * 100)}%</p>
                                    <p className="text-sm text-muted-foreground">{progress.message}</p>
                                </div>
                            )}
                            <ScrollArea className="h-40 w-full border rounded p-2 bg-muted/50 text-xs font-mono">
                                {logs.map((l, i) => <div key={i}>{l}</div>)}
                            </ScrollArea>
                            <Button variant="destructive" onClick={handleStop} size="sm">
                                Stop Processing
                            </Button>
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0 border rounded">
                            <ScrollArea className="h-[50vh] p-4">
                                {loading ? <div className="p-4 text-center">Loading structure...</div> : (
                                    <div className="space-y-4">
                                        {tree.map(node => (
                                            <div key={node.id} className="space-y-2">
                                                <div className="flex items-center gap-2 font-semibold">
                                                    <Checkbox
                                                        id={node.id}
                                                        checked={selectedIds.has(node.id) || (node.children?.every(c => selectedIds.has(c.id)) && node.children.length > 0)}
                                                        onCheckedChange={(c: boolean | 'indeterminate') => toggleSelection(node.id, c === true)}
                                                    />
                                                    <label htmlFor={node.id} className="cursor-pointer select-none">{node.label}</label>
                                                </div>
                                                <div className="pl-6 space-y-1">
                                                    {node.children?.map(child => (
                                                        <div key={child.id} className="flex items-center gap-2 group">
                                                            <Checkbox
                                                                id={child.id}
                                                                checked={selectedIds.has(child.id)}
                                                                onCheckedChange={(c: boolean | 'indeterminate') => toggleSelection(child.id, c === true)}
                                                            />
                                                            <label htmlFor={child.id} className="cursor-pointer select-none text-sm flex-1 truncate">
                                                                {child.label}
                                                            </label>
                                                            {child.data?.metadata?.lastAnalyzed && (
                                                                <span title={`Last analyzed: ${new Date(child.data.metadata.lastAnalyzed).toLocaleString()}`}>
                                                                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>

                        </div>
                    )}
                </div>

                <DialogFooter>
                    {!processing && (
                        <div className="flex justify-between w-full">
                            <div className="text-xs text-muted-foreground self-center">
                                {selectedIds.size > 0 ? `${selectedIds.size} items selected` : ''}
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={handleResetStatus} disabled={selectedIds.size === 0} title="Reset Status">
                                    <RotateCcw className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                                <Button onClick={runAnalysis} disabled={selectedIds.size === 0}>
                                    <Play className="mr-2 h-4 w-4" />
                                    Start Analysis
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

