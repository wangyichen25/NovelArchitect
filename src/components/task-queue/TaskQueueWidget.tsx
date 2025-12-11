"use client";

import React, { useState } from 'react';
import { useTaskQueue, TaskStatus } from "@/components/providers/TaskQueueProvider";
import { X, Loader2, CheckCircle2, AlertCircle, Trash2, ChevronUp, ChevronDown, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export function TaskQueueWidget() {
    const { tasks, cancelTask, clearCompleted } = useTaskQueue();
    const [isExpanded, setIsExpanded] = useState(false);

    // Auto-expand if running tasks appear and we were collapsed? 
    // Maybe just show a badge count when collapsed.

    const runningCount = tasks.filter(t => t.status === 'running').length;

    if (tasks.length === 0) return null;

    return (
        <div className={cn(
            "fixed bottom-4 right-4 z-50 transition-all duration-300 ease-in-out shadow-lg border rounded-lg bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
            isExpanded ? "w-80" : "w-auto"
        )}>
            {/* Header */}
            <div
                className={cn("flex items-center p-2 cursor-pointer gap-2", isExpanded ? "border-b justify-between" : "")}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    {runningCount > 0 ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                        <List className="h-4 w-4 text-muted-foreground" />
                    )}

                    {isExpanded ? (
                        <span className="text-sm font-semibold">Active Tasks</span>
                    ) : (
                        <span className="text-xs font-mono font-medium">
                            {runningCount > 0 ? `${runningCount} Running` : `${tasks.length} Done`}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </div>
            </div>

            {/* List */}
            {isExpanded && (
                <div className="flex flex-col max-h-96">
                    <ScrollArea className="flex-1 p-2">
                        <div className="space-y-2">
                            {tasks.map(task => (
                                <div key={task.id} className="flex flex-col gap-1 p-2 rounded bg-muted/40 text-xs">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex items-center gap-2 font-medium truncate flex-1">
                                            <StatusIcon status={task.status} />
                                            <span className="truncate" title={task.description}>{task.description}</span>
                                        </div>
                                        {task.status === 'running' && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-5 w-5 hover:bg-destructive/10 hover:text-destructive"
                                                onClick={(e) => { e.stopPropagation(); cancelTask(task.id); }}
                                                title="Cancel Task"
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        )}
                                    </div>
                                    <div className="flex justify-between text-[10px] text-muted-foreground pl-5">
                                        <span>{task.type}</span>
                                        <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
                                    </div>
                                    {task.error && (
                                        <div className="text-[10px] text-destructive pl-5 break-words">
                                            {task.error}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    <div className="p-2 border-t flex justify-end">
                        <Button variant="ghost" size="sm" onClick={clearCompleted} className="text-[10px] h-6 px-2">
                            Clear Completed
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatusIcon({ status }: { status: TaskStatus }) {
    switch (status) {
        case 'running': return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
        case 'completed': return <CheckCircle2 className="h-3 w-3 text-green-500" />;
        case 'failed': return <AlertCircle className="h-3 w-3 text-red-500" />;
        case 'cancelled': return <X className="h-3 w-3 text-gray-400" />;
        default: return <div className="h-3 w-3 rounded-full bg-gray-300" />;
    }
}
