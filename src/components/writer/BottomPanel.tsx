"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AgentLogView } from './AgentLogView';
import { useProjectStore } from '@/hooks/useProject';
import { Button } from '@/components/ui/button';
import { ChevronUp, ChevronDown, X, TerminalSquare, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LogEntry } from '@/lib/agents/types';

const MIN_HEIGHT = 100;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 256;

export function BottomPanel() {
    const { logs, isLogsOpen, toggleLogs, setLogsOpen } = useProjectStore();
    const [height, setHeight] = useState(DEFAULT_HEIGHT);
    const isDragging = useRef(false);
    const startY = useRef(0);
    const startHeight = useRef(0);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        isDragging.current = true;
        startY.current = e.clientY;
        startHeight.current = height;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    }, [height]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current) return;
            const deltaY = startY.current - e.clientY;
            const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeight.current + deltaY));
            setHeight(newHeight);
        };

        const handleMouseUp = () => {
            isDragging.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    if (!isLogsOpen) {
        return (
            <div className="border-t bg-background flex justify-end px-4 py-1">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleLogs}
                    className="h-6 text-xs flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                    <TerminalSquare className="h-3 w-3" />
                    <span>Logs</span>
                    <ChevronUp className="h-3 w-3" />
                </Button>
            </div>
        );
    }

    return (
        <div
            className="flex flex-col border-t bg-background shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.1)] relative"
            style={{ height: `${height}px` }}
        >
            {/* Resize Handle */}
            <div
                className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-primary/30 transition-colors group z-10"
                onMouseDown={handleMouseDown}
            >
                <div className="absolute left-1/2 -translate-x-1/2 -top-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripHorizontal className="h-3 w-6 text-muted-foreground" />
                </div>
            </div>

            {/* Header / Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                <div className="flex items-center gap-2">
                    <TerminalSquare className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agent Logs</span>
                    <span className="text-xs text-muted-foreground/50 ml-2">({logs.length} entries)</span>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={toggleLogs}
                        title="Minimize"
                    >
                        <ChevronDown className="h-3 w-3" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setLogsOpen(false)}
                        title="Close"
                    >
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative">
                <AgentLogView logs={logs as LogEntry[]} className="border-0 rounded-none h-full" />
            </div>
        </div>
    );
}
