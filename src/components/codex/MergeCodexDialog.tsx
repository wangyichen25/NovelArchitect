
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodexEntry } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { Search, Merge, ArrowRight } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";

interface MergeCodexDialogProps {
    currentEntry: CodexEntry;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export default function MergeCodexDialog({ currentEntry, open, onOpenChange, onSuccess }: MergeCodexDialogProps) {
    const [search, setSearch] = useState("");
    const [selectedTarget, setSelectedTarget] = useState<CodexEntry | null>(null);

    // Fetch candidates based on search
    const candidates = useLiveQuery(
        async () => {
            if (!search) return [];
            return await db.codex
                .where('novelId')
                .equals(currentEntry.novelId)
                .filter(e =>
                    e.id !== currentEntry.id &&
                    e.name.toLowerCase().includes(search.toLowerCase())
                )
                .limit(10)
                .toArray();
        },
        [currentEntry.novelId, currentEntry.id, search]
    );

    const handleMerge = async () => {
        if (!selectedTarget) return;

        if (!confirm(`Are you sure you want to merge "${selectedTarget.name}" INTO "${currentEntry.name}"? This cannot be undone.`)) return;

        try {
            // 1. Merge Aliases: Current + Target Name + Target Aliases
            const newAliases = new Set([
                ...(currentEntry.aliases || []),
                ...(selectedTarget.aliases || []),
                selectedTarget.name
            ]);

            // 2. Merge Relations (Primitive merge: just append unique ones based on targetId + type)
            // TODO: deeper de-duplication if needed
            const combinedRelations = [...(currentEntry.relations || []), ...(selectedTarget.relations || [])];

            // 3. Update Current Entry
            await db.codex.update(currentEntry.id, {
                aliases: Array.from(newAliases),
                relations: combinedRelations
            });

            // 4. Delete Target Entry
            await db.codex.delete(selectedTarget.id);

            // 5. Success
            onSuccess();
            onOpenChange(false);
            setSelectedTarget(null);
            setSearch("");

        } catch (error) {
            console.error("Merge failed:", error);
            alert("Merge failed. Check console.");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Merge Entry</DialogTitle>
                    <DialogDescription>
                        Merge another entry into <span className="font-bold text-foreground">{currentEntry.name}</span>. The selected entry will be deleted, and its name/aliases will be added to this entry.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Search Step */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Find Duplicate to Merge:</label>
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search other entries..."
                                className="pl-8"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Candidates List */}
                    {search && (
                        <div className="border rounded-md max-h-40 overflow-y-auto">
                            {candidates?.length === 0 ? (
                                <div className="p-2 text-sm text-muted-foreground text-center">No matches found</div>
                            ) : (
                                candidates?.map(c => (
                                    <div
                                        key={c.id}
                                        className={`p-2 cursor-pointer text-sm flex justify-between items-center hover:bg-accent ${selectedTarget?.id === c.id ? 'bg-accent/50 border-l-4 border-primary' : ''}`}
                                        onClick={() => setSelectedTarget(c)}
                                    >
                                        <span>{c.name}</span>
                                        <span className="text-xs text-muted-foreground capitalize">{c.category}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Preview Selection */}
                    {selectedTarget && (
                        <div className="bg-muted/30 p-4 rounded-md border text-sm space-y-2">
                            <div className="flex items-center gap-4 justify-center font-medium">
                                <div className="text-destructive text-center">
                                    <div className="line-through">{selectedTarget.name}</div>
                                    <div className="text-xs font-normal opacity-70">Will be deleted</div>
                                </div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <div className="text-primary text-center">
                                    <div>{currentEntry.name}</div>
                                    <div className="text-xs font-normal opacity-70">Will gain alias "{selectedTarget.name}"</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        onClick={handleMerge}
                        disabled={!selectedTarget}
                        className="bg-purple-600 hover:bg-purple-700"
                    >
                        <Merge className="mr-2 h-4 w-4" /> Merge Entries
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
