import React, { useEffect, useRef } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { LogEntry } from "@/lib/agents/types";
import { cn } from "@/lib/utils";

interface AgentLogViewProps {
    logs: LogEntry[];
    className?: string;
}

const AGENT_COLORS: Record<string, string> = {
    System: "bg-gray-100 text-gray-900 border-gray-200 dark:bg-gray-800/50 dark:text-gray-300 dark:border-gray-700",
    Manager: "bg-purple-100 text-purple-900 border-purple-200 dark:bg-purple-900/30 dark:text-purple-100 dark:border-purple-800",
    Planner: "bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-100 dark:border-indigo-800",
    Writer: "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-100 dark:border-emerald-800",
    Critic: "bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-900/30 dark:text-orange-100 dark:border-orange-800",
    Reviser: "bg-red-100 text-red-900 border-red-200 dark:bg-red-900/30 dark:text-red-100 dark:border-red-800",
    Formatter: "bg-cyan-100 text-cyan-900 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-100 dark:border-cyan-800",
};

const DEFAULT_AGENT_COLOR = "bg-zinc-100 text-zinc-900 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";

export function AgentLogView({ logs, className }: AgentLogViewProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new logs
    useEffect(() => {
        if (scrollRef.current) {
            const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }
    }, [logs]);

    const formatTime = (ts: number) => {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const getStyle = (agent: string) => {
        return AGENT_COLORS[agent] || DEFAULT_AGENT_COLOR;
    };

    return (
        <ScrollArea className={cn("h-full w-full rounded-md border bg-background", className)} ref={scrollRef}>
            <div className="p-4 space-y-4">
                {logs.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm italic py-8">
                        No logs yet. Start the agent to see activity.
                    </div>
                )}
                {logs.map((log, index) => {
                    const style = getStyle(log.agent);
                    const label = log.agent;

                    return (
                        <div key={log.id || `log-${index}`} className={cn("flex flex-col border rounded-lg overflow-hidden text-sm shadow-sm", style)}>
                            <div className="px-3 py-1.5 border-b border-inherit/20 bg-inherit/30 flex justify-between items-center text-xs font-semibold uppercase tracking-wider opacity-80">
                                <span>{label}</span>
                                <span className="font-mono opacity-70">{formatTime(log.timestamp)}</span>
                            </div>
                            <div className="p-3 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed opacity-90">
                                {log.content}
                            </div>
                        </div>
                    );
                })}
            </div>
        </ScrollArea>
    );
}
