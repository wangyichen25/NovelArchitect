
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VariableInspector } from './VariableInspector';
import { ScrollArea } from "@/components/ui/scroll-area";
import { db } from "@/lib/db";
import { AgentState } from "@/lib/db/schema";
import { v4 as uuidv4 } from 'uuid';
import { AgentLogView } from './AgentLogView';
import { LogEntry } from '@/lib/agents/types';

interface AIWorkspaceProps {
    className?: string;
    onClose?: () => void;
    currentManuscript?: string;
    onUpdateManuscript?: (text: string) => void;
    sceneId: string;
    novelId: string;
    agentState?: AgentState | null;
}

export function AIWorkspace({ className, onClose, currentManuscript = "", onUpdateManuscript, sceneId, novelId, agentState }: AIWorkspaceProps) {
    const [activeTab, setActiveTab] = useState<"write" | "reference" | "logs">("write");

    // "AI Write" State - Initialize from DB prop if available
    const [instructions, setInstructions] = useState(agentState?.instructions || "");
    const [maxPasses, setMaxPasses] = useState(agentState?.maxPasses || 1);
    const [minScore, setMinScore] = useState(agentState?.minScore || 0.8);
    const [maxHunks, setMaxHunks] = useState(agentState?.maxHunks || 5);

    // "AI Reference" State
    const [maxTargets, setMaxTargets] = useState(agentState?.maxTargets || 10);

    const [isRunning, setIsRunning] = useState(false);

    // Local history state
    const [localHistory, setLocalHistory] = useState<LogEntry[]>([]);

    useEffect(() => {
        // Only sync history from DB if we are NOT running.
        // If we are running, local state is the source of truth for logs.
        if (agentState?.history && !isRunning) {
            // Filter out entries that might be legacy HistoryEntry objects (missing content)
            const validLogs = (agentState.history as any[]).filter(entry => entry.content !== undefined && entry.agent !== undefined);
            setLocalHistory(validLogs as LogEntry[]);
        }
    }, [agentState?.history, isRunning]);

    // Internal state to track if we need to save (dirty check)
    const isDirty = useRef(false);
    const saveTimeout = useRef<NodeJS.Timeout | null>(null);

    // Update local state if DB state changes externally (e.g. sync)
    // Only if we are not currently editing
    useEffect(() => {
        if (agentState) {
            if (!isDirty.current) {
                setInstructions(agentState.instructions || "");
                setMaxPasses(agentState.maxPasses);
                setMinScore(agentState.minScore);
                setMaxHunks(agentState.maxHunks || 5);
                setMaxTargets(agentState.maxTargets || 10);
            }
        }
    }, [agentState]);

    const saveAgentState = useCallback(async (newHistory?: LogEntry[]) => {
        try {
            const existing = await db.agent_state.where({ sceneId }).first();

            const data = {
                instructions,
                maxPasses,
                minScore,
                maxHunks,
                maxTargets,
                history: newHistory || localHistory,
                lastModified: Date.now()
            };

            if (existing) {
                await db.agent_state.update(existing.id, data);
            } else {
                await db.agent_state.add({
                    id: uuidv4(),
                    userId: 'user', // Placeholder, strictly should come from auth context
                    novelId,
                    sceneId,
                    ...data,
                    passIndex: 0,
                    history: [],
                    actionHistory: []
                });
            }
            console.log("Agent state saved.");
            isDirty.current = false;
        } catch (error) {
            console.error("Failed to save agent state:", error);
        }
    }, [instructions, maxPasses, minScore, maxHunks, maxTargets, sceneId, novelId, localHistory]);

    // Debounced Save
    useEffect(() => {
        // Skip initial mount save unless dirty
        if (!isDirty.current) return;

        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(saveAgentState, 1000);

        return () => {
            if (saveTimeout.current) clearTimeout(saveTimeout.current);
        };
    }, [instructions, maxPasses, minScore, maxHunks, maxTargets, saveAgentState]);

    const handleInputChange = (setter: React.Dispatch<React.SetStateAction<any>>, value: any) => {
        setter(value);
        isDirty.current = true;
    };


    // Variables for Inspector - Derived directly from state/props
    const variables = activeTab === "write" ? {
        inputs: {
            instructions,
            maxPasses,
            minScore,
            maxHunks
        },
        system: {
            current_manuscript: currentManuscript || "(empty)",
            manuscript_word_count: currentManuscript?.split(/\s+/).length || 0,
            has_format_guidance: !!agentState?.formatGuidance
        },
        agent_state: {
            pass_index: agentState?.passIndex ?? 0,
            last_history_entry: agentState?.history?.[(agentState?.history?.length || 0) - 1] ?? null,
            section_plan: agentState?.sectionPlan ?? null,
            sections_drafted: agentState?.sectionsDrafted ?? null,
            format_guidance: agentState?.formatGuidance ?? null
        },
        full_state_dump: agentState || { status: "No DB Record" }
    } : {
        // Reference Tab Variables
        inputs: {
            maxTargets
        },
        system: {
            current_manuscript: currentManuscript || "(empty)",
        },
        reference_state: {
            existing_citations: [], // TODO: Connect to real citation parser
            citation_targets: [] // TODO: Connect to Citation Orchestrator output
        }
    };

    const hasHistory = (agentState?.history?.length || 0) > 0;


    const handleStartWrite = async () => {
        if (!instructions.trim()) {
            alert('Please provide instructions for the AI writer');
            return;
        }

        setIsRunning(true);
        setActiveTab("logs");

        // Initialize local log tracker with current history to avoid closure staleness
        let currentLogs = [...localHistory];

        try {
            // Import manager workflow
            const { runManagerWorkflow } = await import('@/lib/agents/manager');

            // Get current manuscript from parent component
            const getCurrentManuscript = async () => {
                return currentManuscript || '';
            };

            // Update manuscript function - triggers parent component update
            const updateManuscript = async (text: string) => {
                console.log('[AIWorkspace] Manuscript updated, length:', text.length);
                if (onUpdateManuscript) {
                    onUpdateManuscript(text);
                }
            };

            // Log callback
            const onLog = (log: LogEntry) => {
                isDirty.current = true; // Mark as dirty to trigger autosave
                currentLogs.push(log); // Update local tracker
                setLocalHistory(prev => [...prev, log]);
            };

            // Run the manager workflow
            const finalManuscript = await runManagerWorkflow(
                novelId,
                sceneId,
                instructions,
                maxPasses,
                minScore,
                getCurrentManuscript,
                updateManuscript,
                onLog
            );

            console.log('[AIWorkspace] Workflow complete. Final manuscript length:', finalManuscript.length);

        } catch (error) {
            console.error('[AIWorkspace] Workflow error:', error);
            const errorLog: LogEntry = {
                id: uuidv4(),
                timestamp: Date.now(),
                agent: 'System',
                type: 'error',
                content: `Error: ${error instanceof Error ? error.message : String(error)}`
            };
            currentLogs.push(errorLog);
            setLocalHistory(prev => [...prev, errorLog]);
        } finally {
            // Force an immediate save when done to ensure consistency
            // Must pass currentLogs explicitly because saveAgentState from the closure
            // has a stale reference to the old localHistory
            await saveAgentState(currentLogs);
            setIsRunning(false);
        }
    };

    const handleScanReferences = () => {
        console.log("Scanning references...");
    };

    return (
        <div className={`flex flex-col h-full border-l bg-background ${className}`}>
            <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">AI Workspace</h2>
                <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </div>

            {/* Custom Simple Tabs */}
            <div className="flex border-b">
                <button
                    onClick={() => setActiveTab("write")}
                    className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "write" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    Write
                </button>
                <button
                    onClick={() => setActiveTab("logs")}
                    className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "logs" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    Logs
                </button>

                <button
                    onClick={() => setActiveTab("reference")}
                    className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "reference" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    AI Reference
                </button>
            </div>

            <ScrollArea className="flex-1 p-4">
                {activeTab === "write" && (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Instructions</label>
                            <textarea
                                className="w-full min-h-[100px] p-2 rounded-md border text-sm bg-transparent"
                                placeholder="Describe what you want the AI to write..."
                                value={instructions}
                                onChange={(e) => handleInputChange(setInstructions, e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Max Passes</label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={maxPasses}
                                    onChange={(e) => handleInputChange(setMaxPasses, parseInt(e.target.value))}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Min Score</label>
                                <Input
                                    type="number"
                                    step={0.1}
                                    min={0}
                                    max={1}
                                    value={minScore}
                                    onChange={(e) => handleInputChange(setMinScore, parseFloat(e.target.value))}
                                />
                            </div>
                            <div className="space-y-2 col-span-2">
                                <label className="text-sm font-medium">Search/Replace Limit (Max Hunks)</label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={maxHunks}
                                    onChange={(e) => handleInputChange(setMaxHunks, parseInt(e.target.value))}
                                />
                            </div>
                        </div>

                        <div className="pt-4">
                            <Button className="w-full" onClick={handleStartWrite} disabled={isRunning}>
                                {isRunning ? "Agent Running..." : (hasHistory ? "Resume Agent" : "Start Agent")}
                            </Button>
                        </div>

                        <div className="pt-4 border-t space-y-3">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Context Data</label>
                            <div className="grid grid-cols-2 gap-2">
                                <VariableInspector
                                    variables={{ current_manuscript: variables?.system?.current_manuscript }}
                                    title="Current Manuscript"
                                    trigger={<Button variant="outline" size="sm" className="w-full text-xs h-8">View Manuscript</Button>}
                                />
                                <VariableInspector
                                    variables={{ section_plan: agentState?.sectionPlan }}
                                    title="Section Plan"
                                    trigger={<Button variant="outline" size="sm" className="w-full text-xs h-8">View Plan</Button>}
                                />
                                <VariableInspector
                                    variables={{ format_guidance: agentState?.formatGuidance }}
                                    title="Formatting Guidance"
                                    trigger={<Button variant="outline" size="sm" className="w-full text-xs h-8">View Guidance</Button>}
                                />
                                <VariableInspector
                                    variables={{ last_history_entry: agentState?.history?.[(agentState?.history?.length || 0) - 1] ?? null }}
                                    title="Last Status"
                                    trigger={<Button variant="outline" size="sm" className="w-full text-xs h-8">Last Status</Button>}
                                />
                                <VariableInspector
                                    variables={{ history: agentState?.history }}
                                    title="Agent History"
                                    trigger={<Button variant="outline" size="sm" className="w-full text-xs h-8">Full History</Button>}
                                />
                                <VariableInspector
                                    variables={variables}
                                    title="Full Context"
                                    trigger={<Button variant="secondary" size="sm" className="w-full text-xs h-8 col-span-2">Debug State</Button>}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "logs" && (
                    <div className="h-full">
                        <AgentLogView logs={localHistory} />
                    </div>
                )}

                {activeTab === "reference" && (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Max Targets</label>
                            <Input
                                type="number"
                                min={1}
                                max={20}
                                value={maxTargets}
                                onChange={(e) => handleInputChange(setMaxTargets, parseInt(e.target.value))}
                            />
                        </div>

                        <div className="pt-4">
                            <Button className="w-full" variant="secondary" onClick={handleScanReferences}>
                                Scan References
                            </Button>
                        </div>

                        <div className="pt-4 border-t space-y-3">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Citation Data</label>
                            <div className="grid grid-cols-2 gap-2">
                                <VariableInspector
                                    variables={{ existing_citations: [] }}
                                    title="Existing Citations"
                                    trigger={<Button variant="outline" size="sm" className="w-full text-xs h-8">Citations</Button>}
                                />
                                <VariableInspector
                                    variables={{ citation_targets: [] }}
                                    title="Citation Targets"
                                    trigger={<Button variant="outline" size="sm" className="w-full text-xs h-8">Targets</Button>}
                                />
                                <VariableInspector
                                    variables={{ ...variables, mode: "Reference" }}
                                    title="Full Context"
                                    trigger={<Button variant="secondary" size="sm" className="w-full text-xs h-8 col-span-2">Debug State</Button>}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </ScrollArea>
        </div >
    );
}
