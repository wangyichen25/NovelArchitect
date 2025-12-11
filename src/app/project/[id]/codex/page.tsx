"use client";

import CodexSidebar from "@/components/codex/CodexSidebar";
import EntityCard from "@/components/codex/EntityCard";
import { useState } from "react";
import { CodexEntry } from "@/lib/db/schema";
import { BookOpen, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

export default function CodexPage() {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [newEntryTemplate, setNewEntryTemplate] = useState<CodexEntry | null>(null);

    const selectedEntry = useLiveQuery(async () => {
        if (!selectedId) return null;
        if (selectedId === 'new') return newEntryTemplate;
        return await db.codex.get(selectedId);
    }, [selectedId, newEntryTemplate]);

    const handleSelect = (entry: CodexEntry) => {
        if (entry.id === 'new') {
            setNewEntryTemplate(entry);
            setSelectedId('new');
        } else {
            setSelectedId(entry.id);
            setNewEntryTemplate(null);
        }
    };

    return (
        <div className="flex h-full overflow-hidden w-full relative">
            <div className={`
                h-full bg-card flex flex-col transition-all duration-300
                ${selectedId ? 'hidden md:flex md:w-64 md:border-r' : 'w-full md:w-64 md:border-r'}
            `}>
                <CodexSidebar onSelect={handleSelect} />
            </div>

            <div className={`
                flex-1 bg-background overflow-y-auto
                ${!selectedId ? 'hidden md:block' : 'w-full'}
            `}>
                {selectedEntry ? (
                    <div className="flex flex-col min-h-full">
                        <div className="md:hidden sticky top-0 bg-background/95 backdrop-blur z-10 border-b p-2 flex items-center">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                                <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
                            </Button>
                        </div>
                        <EntityCard
                            entry={selectedEntry}
                            onSave={() => {
                                // Optional: if we want to clear 'new' status after save, 
                                // we'd need to know the new ID. EntityCard handles the save logic internally.
                                // But if it was 'new', it might change ID.
                                // However, EntityCard doesn't callback with new ID.
                                // We might need to handle this better in future, but for now this preserves existing flow.
                            }}
                            onDelete={() => setSelectedId(null)}
                        />
                    </div>
                ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground flex-col gap-4">
                        <BookOpen className="h-12 w-12 opacity-20" />
                        <p>Select an entry from the Codex to view details.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
