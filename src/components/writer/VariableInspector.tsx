import { useState } from 'react';
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface VariableInspectorProps {
    variables: Record<string, any>;
    title?: string;
    trigger?: React.ReactNode;
}

export function VariableInspector({ variables, title = "Agent Variables", trigger }: VariableInspectorProps) {
    const tabs = Object.keys(variables);
    const [activeTab, setActiveTab] = useState(tabs[0] || "");

    // Ensure active tab is valid if props change
    if (tabs.length > 0 && !tabs.includes(activeTab)) {
        setActiveTab(tabs[0]);
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm" className="w-full">
                        Inspect Variables
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        Inspect the current state of variables available to the agents.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col flex-1 min-h-0">
                    {/* Tabs Header */}
                    <div className="flex border-b space-x-2 pt-2 mb-4 overflow-x-auto shrink-0">
                        {tabs.map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                                    activeTab === tab
                                        ? "border-primary text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {tab.charAt(0).toUpperCase() + tab.slice(1).replace(/_/g, " ")}
                            </button>
                        ))}
                    </div>

                    <ScrollArea className="flex-1 bg-muted/10 rounded-md p-4 border">
                        {activeTab && <DataRenderer data={variables[activeTab]} />}
                        {!activeTab && <div className="text-muted-foreground italic text-sm">No data available.</div>}
                    </ScrollArea>
                </div>

                <div className="flex justify-end text-xs text-muted-foreground">
                    <span className="font-mono">JSON View available in console.</span>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function DataRenderer({ data }: { data: any }) {
    if (data === null || data === undefined) {
        return <span className="text-muted-foreground italic">null</span>;
    }

    if (typeof data !== 'object') {
        return <span className="font-mono text-sm whitespace-pre-wrap">{String(data)}</span>;
    }

    if (Array.isArray(data)) {
        if (data.length === 0) return <span className="text-muted-foreground italic">[]</span>;
        return (
            <div className="space-y-2 pl-2 border-l-2 border-muted">
                {data.map((item, idx) => (
                    <div key={idx} className="text-sm my-1">
                        <span className="text-muted-foreground font-mono text-xs mr-2 select-none">[{idx}]</span>
                        <DataRenderer data={item} />
                    </div>
                ))}
            </div>
        );
    }

    // Object
    const entries = Object.entries(data);
    if (entries.length === 0) return <span className="text-muted-foreground italic">{"{}"}</span>;

    return (
        <div className="space-y-1">
            {entries.map(([key, value]) => (
                <div key={key} className="grid grid-cols-[140px_1fr] gap-2 items-start hover:bg-muted/50 p-1 rounded group">
                    <div className="font-mono text-xs font-semibold text-muted-foreground break-words truncate pt-0.5" title={key}>
                        {key}
                    </div>
                    <div className="text-sm overflow-hidden text-foreground">
                        {isComplex(value) ? (
                            <details className="group/details">
                                <summary className="cursor-pointer text-xs text-primary hover:underline select-none">
                                    {getSummary(value)}
                                </summary>
                                <div className="mt-1 pl-2 border-l border-primary/20">
                                    <DataRenderer data={value} />
                                </div>
                            </details>
                        ) : (
                            <DataRenderer data={value} />
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

function isComplex(value: any): boolean {
    return value !== null && typeof value === 'object';
}

function getSummary(value: any): string {
    if (Array.isArray(value)) return `Array(${value.length})`;
    return `Object(${Object.keys(value).length} keys)`;
}

