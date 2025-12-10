
"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { CodexEntry } from "@/lib/db/schema";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, User, MapPin, Box, Book, ScanSearch } from "lucide-react";
import { useParams } from "next/navigation";
import BatchExtractDialog from "./BatchExtractDialog";

export default function CodexSidebar({ onSelect }: { onSelect: (entry: CodexEntry) => void }) {
    const params = useParams();
    const novelId = params.id as string;
    const [generatingProgress, setGeneratingProgress] = useState<string | null>(null);
    const [showBatchDialog, setShowBatchDialog] = useState(false);

    const handleGenerateAll = async () => {
        if (!entries) return;

        // Filter candidates: Has visualSummary AND check for 'image' field (might be empty/null)
        const candidates = entries.filter(e => e.visualSummary && (!e.image || e.image.length === 0));

        if (candidates.length === 0) {
            alert("No entries found with visual prompts needing images.");
            return;
        }

        if (!confirm(`Found ${candidates.length} entries missing images. Generate them now? This may take a while.`)) return;

        setGeneratingProgress(`Preparing...`);

        // Get Key
        const provider = localStorage.getItem('novel-architect-provider') || 'openai';
        const encrypted = localStorage.getItem('novel-architect-key-openrouter'); // Always OpenRouter for now
        const pin = localStorage.getItem('novel-architect-pin-hash');

        if (!encrypted || !pin) {
            alert("Please configure OpenRouter API Key in Settings first.");
            setGeneratingProgress(null);
            return;
        }

        const { KeyChain } = await import("@/lib/ai/keychain");
        const apiKey = await KeyChain.decrypt(encrypted, pin);
        if (!apiKey) {
            alert("Could not decrypt API Key.");
            setGeneratingProgress(null);
            return;
        }

        const savedStyle = localStorage.getItem('novel-architect-last-style') || "Cinematic";
        const savedModel = localStorage.getItem('novel-architect-preferred-model') || "google/gemini-3-pro-image-preview";

        let completed = 0;
        let errors = 0;

        for (const entry of candidates) {
            completed++;
            setGeneratingProgress(`Generating ${completed}/${candidates.length}: ${entry.name}...`);

            try {
                const response = await fetch('/api/generate-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-novel-architect-key': apiKey },
                    body: JSON.stringify({ prompt: entry.visualSummary, style: savedStyle, model: savedModel })
                });

                if (response.ok) {
                    const res = await response.json();
                    if (res.url) {
                        await db.codex.update(entry.id, { image: res.url });
                    }
                } else {
                    errors++;
                    const errBody = await response.text();
                    console.error(`Failed to generate for ${entry.name}: ${response.status} - ${errBody}`);
                }
            } catch (e) {
                console.error(e);
                errors++;
            }
        }

        setGeneratingProgress(null);
        alert(`Batch generation complete. ${completed - errors} success, ${errors} failed.`);
    };

    // Convert to UUID if it's not a valid UUID (which happens with our rough test data but lets stick to logic)
    // Actually, we should just query by novelId.

    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<'all' | 'character' | 'location' | 'object' | 'lore'>('all');

    const entries = useLiveQuery(
        async () => {
            let collection = db.codex.where('novelId').equals(novelId);
            if (filter !== 'all') {
                collection = collection.filter(e => e.category === filter);
            }
            const all = await collection.toArray();
            return all.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
        },
        [novelId, search, filter]
    );

    const getIcon = (category: string) => {
        switch (category) {
            case 'character': return <User className="h-4 w-4" />;
            case 'location': return <MapPin className="h-4 w-4" />;
            case 'object': return <Box className="h-4 w-4" />;
            case 'lore': return <Book className="h-4 w-4" />;
            default: return <Book className="h-4 w-4" />;
        }
    }

    return (
        <div className="w-64 border-r bg-card h-full flex flex-col">
            <div className="p-4 border-b space-y-4">
                <h2 className="font-serif font-bold text-lg">Codex</h2>
                <div className="relative">
                    <Button variant="ghost" size="icon" onClick={() => setShowBatchDialog(true)} title="Batch Auto-Extract">
                        <ScanSearch className="h-4 w-4" />
                    </Button>
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search..."
                        className="pl-8"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 justify-between">
                    <Button variant={filter === 'all' ? 'default' : 'ghost'} size="icon" onClick={() => setFilter('all')} title="All"><Box className="h-4 w-4" /></Button>
                    <Button variant={filter === 'character' ? 'default' : 'ghost'} size="icon" onClick={() => setFilter('character')} title="Characters"><User className="h-4 w-4" /></Button>
                    <Button variant={filter === 'location' ? 'default' : 'ghost'} size="icon" onClick={() => setFilter('location')} title="Locations"><MapPin className="h-4 w-4" /></Button>
                </div>
            </div>

            <BatchExtractDialog open={showBatchDialog} onOpenChange={setShowBatchDialog} />

            <div className="flex-1 overflow-y-auto p-2">
                {entries?.map(entry => (
                    <div
                        key={entry.id}
                        className="flex items-center gap-2 p-2 hover:bg-accent rounded-md cursor-pointer text-sm"
                        onClick={() => onSelect(entry)}
                    >
                        {getIcon(entry.category)}
                        <span className="font-medium truncate">{entry.name}</span>
                    </div>
                ))}
            </div>

            <div className="p-4 border-t space-y-2">
                {generatingProgress ? (
                    <div className="text-xs text-center text-muted-foreground animate-pulse p-2 border rounded bg-muted/20">
                        {generatingProgress}
                    </div>
                ) : (
                    <Button
                        className="w-full"
                        variant="secondary"
                        size="sm"
                        onClick={handleGenerateAll}
                        disabled={!entries || entries.length === 0}
                    >
                        <Plus className="mr-2 h-4 w-4" /> Generate Missing Images
                    </Button>
                )}
                <Button className="w-full" variant="outline" onClick={() => onSelect({ id: 'new', novelId, category: 'character', name: 'New Entry', aliases: [], description: '', relations: [] })}>
                    <Plus className="mr-2 h-4 w-4" /> New Entry
                </Button>
            </div>
        </div>
    );
}
