"use client";

import CodexSidebar from "@/components/codex/CodexSidebar";
import EntityCard from "@/components/codex/EntityCard";
import { useState } from "react";
import { CodexEntry } from "@/lib/db/schema";
import { BookOpen, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CodexPage() {
    const [selectedEntry, setSelectedEntry] = useState<CodexEntry | null>(null);

    return (
        <div className="flex h-full overflow-hidden w-full relative">
            <div className={`
                h-full bg-card flex flex-col transition-all duration-300
                ${selectedEntry ? 'hidden md:flex md:w-64 md:border-r' : 'w-full md:w-64 md:border-r'}
            `}>
                <CodexSidebar onSelect={setSelectedEntry} />
            </div>

            <div className={`
                flex-1 bg-background overflow-y-auto
                ${!selectedEntry ? 'hidden md:block' : 'w-full'}
            `}>
                {selectedEntry ? (
                    <div className="flex flex-col min-h-full">
                        <div className="md:hidden sticky top-0 bg-background/95 backdrop-blur z-10 border-b p-2 flex items-center">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedEntry(null)}>
                                <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
                            </Button>
                        </div>
                        <EntityCard
                            entry={selectedEntry}
                            onSave={() => { }}
                            onDelete={() => setSelectedEntry(null)}
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
