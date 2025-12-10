"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db"; // Ensure db is imported
import { PromptPreset } from "@/lib/db/schema";
import { v4 as uuidv4 } from 'uuid';
import { Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RewriteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRewrite: (instruction: string) => void;
    initialInstruction?: string;
}

export function RewriteDialog({ open, onOpenChange, onRewrite, initialInstruction = "" }: RewriteDialogProps) {
    const [instruction, setInstruction] = useState(initialInstruction);
    const [presets, setPresets] = useState<PromptPreset[]>([]);
    const [selectedPresetId, setSelectedPresetId] = useState<string>("custom");
    const [isSaving, setIsSaving] = useState(false);
    const [newPresetName, setNewPresetName] = useState("");

    // Load presets
    useEffect(() => {
        if (open) {
            loadPresets();
            if (initialInstruction) setInstruction(initialInstruction);
        }
    }, [open, initialInstruction]);

    const loadPresets = async () => {
        const items = await db.table('prompt_presets').toArray();
        setPresets(items as PromptPreset[]);
    };

    const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        setSelectedPresetId(id);
        if (id === "custom") {
            setInstruction("");
        } else {
            const preset = presets.find(p => p.id === id);
            if (preset) {
                setInstruction(preset.prompt);
            }
        }
    };

    const handleSavePreset = async () => {
        if (!newPresetName.trim() || !instruction.trim()) {
            alert("Please provide a name and instruction.");
            return;
        }

        const newPreset: PromptPreset = {
            id: uuidv4(),
            name: newPresetName.trim(),
            prompt: instruction.trim(),
            lastUsed: Date.now()
        };

        await db.table('prompt_presets').add(newPreset);
        await loadPresets();
        setIsSaving(false);
        setNewPresetName("");
        setSelectedPresetId(newPreset.id);
    };

    const handleDeletePreset = async () => {
        if (selectedPresetId === "custom") return;
        if (confirm("Are you sure you want to delete this preset?")) {
            await db.table('prompt_presets').delete(selectedPresetId);
            await loadPresets();
            setSelectedPresetId("custom");
            setInstruction("");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>AI Rewrite</DialogTitle>
                    <DialogDescription>
                        Provide instructions for how you want the text rewritten.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Preset
                        </label>
                        <div className="flex gap-2">
                            <select
                                className={cn(
                                    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                )}
                                value={selectedPresetId}
                                onChange={handlePresetChange}
                            >
                                <option value="custom">Custom Instruction</option>
                                {presets.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            {selectedPresetId !== "custom" && (
                                <Button variant="ghost" size="icon" onClick={handleDeletePreset} title="Delete Preset">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-medium leading-none">
                                Instruction
                            </label>
                            {selectedPresetId === "custom" && !isSaving && instruction.length > 0 && (
                                <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setIsSaving(true)}>
                                    <Save className="h-3 w-3 mr-1" />
                                    Save as Preset
                                </Button>
                            )}
                        </div>

                        {isSaving && (
                            <div className="flex gap-2 items-center animate-in fade-in slide-in-from-top-1">
                                <Input
                                    placeholder="Preset Name"
                                    value={newPresetName}
                                    onChange={e => setNewPresetName(e.target.value)}
                                    className="h-8 text-xs"
                                />
                                <Button size="sm" onClick={handleSavePreset} className="h-8 text-xs">Save</Button>
                                <Button size="sm" variant="ghost" onClick={() => setIsSaving(false)} className="h-8 text-xs">Cancel</Button>
                            </div>
                        )}

                        <textarea
                            className={cn(
                                "flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            )}
                            placeholder="e.g. Make it more descriptive, fix grammar, rewrite in first person..."
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => onRewrite(instruction)} disabled={!instruction.trim()}>Rewrite</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
