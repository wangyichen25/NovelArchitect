
"use client";

import CodexSidebar from "@/components/codex/CodexSidebar";
import EntityCard from "@/components/codex/EntityCard";
import { useState } from "react";
import { CodexEntry } from "@/lib/db/schema";
import { BookOpen } from "lucide-react";

export default function CodexPage() {
    const [selectedEntry, setSelectedEntry] = useState<CodexEntry | null>(null);

    return (
        <div className="flex h-full overflow-hidden w-full">
            <CodexSidebar onSelect={setSelectedEntry} />
            <div className="flex-1 bg-background overflow-y-auto">
                {selectedEntry ? (
                    <EntityCard
                        entry={selectedEntry}
                        onSave={() => { }}
                        onDelete={() => setSelectedEntry(null)}
                    />
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
