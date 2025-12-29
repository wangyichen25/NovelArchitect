
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
import { extractTextFromContent } from "@/lib/editor-utils";
import { countWordsExcludingCitations } from "@/lib/word-count";
import { exportToLatex } from "@/lib/export";
import { useProjectStore } from "@/hooks/useProject";
import { createClient } from "@/lib/supabase/client";

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
    const [activeTab, setActiveTab] = useState<"write" | "revise" | "reference">("write");
    const [fallbackManuscript, setFallbackManuscript] = useState("");

    // Single Action Revise State
    const [revisionInstruction, setRevisionInstruction] = useState("");
    const manuscriptRef = useRef(currentManuscript || "");

    const { addLog, setLogs, logs, setLogsOpen } = useProjectStore();

    // "AI Write" State - Initialize from DB prop if available
    const [instructions, setInstructions] = useState(agentState?.instructions || "");
    const [maxPasses, setMaxPasses] = useState(agentState?.maxPasses || 1);
    const [minScore, setMinScore] = useState(agentState?.minScore || 0.8);
    const [maxHunks, setMaxHunks] = useState(agentState?.maxHunks || 5);

    // "AI Reference" State
    const [maxTargets, setMaxTargets] = useState(agentState?.maxTargets || 10);

    // Sample Paper Selection State
    const [writingExamples, setWritingExamples] = useState<{ id: string; name: string; content: string }[]>([]);
    const [selectedExampleId, setSelectedExampleId] = useState<string>("");

    const [isRunning, setIsRunning] = useState(false);

    useEffect(() => {
        // Only sync history from DB if we are NOT running.
        // If we are running, local state is the source of truth for logs.
        if (agentState?.history && !isRunning && logs.length === 0) {
            // Filter out entries that might be legacy HistoryEntry objects (missing content)
            const validLogs = (agentState.history as any[]).filter(entry => entry.content !== undefined && entry.agent !== undefined);
            // We only sync if logs are empty to avoid overwriting active session logs, 
            // OR if we switched scenes (handled by parent effect logic potentially?)
            // Actually, simplest is to just sync if we aren't running.
            setLogs(validLogs as LogEntry[]);
        }
    }, [agentState?.history, isRunning]);

    // Fetch writing examples from Supabase on mount
    useEffect(() => {
        const loadWritingExamples = async () => {
            try {
                const supabase = createClient();
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: profile } = await supabase.from('profiles').select('settings').eq('id', user.id).single();
                    if (profile?.settings?.writing_examples && Array.isArray(profile.settings.writing_examples)) {
                        setWritingExamples(profile.settings.writing_examples);
                        return;
                    }
                }
                // Fallback to localStorage
                const stored = localStorage.getItem('novel-architect-writing-examples');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed)) {
                        setWritingExamples(parsed);
                    }
                }
            } catch (e) {
                console.error('[AIWorkspace] Failed to load writing examples:', e);
                // Try localStorage on error
                try {
                    const stored = localStorage.getItem('novel-architect-writing-examples');
                    if (stored) {
                        const parsed = JSON.parse(stored);
                        if (Array.isArray(parsed)) {
                            setWritingExamples(parsed);
                        }
                    }
                } catch (localErr) {
                    console.error('[AIWorkspace] LocalStorage fallback failed:', localErr);
                }
            }
        };
        loadWritingExamples();
    }, []);

    useEffect(() => {
        const text = currentManuscript || "";
        manuscriptRef.current = text;
        if (text) {
            setFallbackManuscript("");
        }
    }, [currentManuscript]);

    useEffect(() => {
        if (currentManuscript || !sceneId) return;

        let cancelled = false;

        const loadPersistedManuscript = async () => {
            const scene = await db.scenes.get(sceneId);
            const text = extractTextFromContent(scene?.content);
            if (!cancelled && text.trim()) {
                manuscriptRef.current = text;
                setFallbackManuscript(text);
            }
        };

        loadPersistedManuscript();

        return () => {
            cancelled = true;
        };
    }, [currentManuscript, sceneId]);

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
                history: newHistory || logs,
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
    }, [instructions, maxPasses, minScore, maxHunks, maxTargets, sceneId, novelId, logs]);

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


    const manuscriptText = currentManuscript || fallbackManuscript;
    const manuscriptWordCount = manuscriptText
        ? countWordsExcludingCitations(manuscriptText)
        : 0;

    // Variables for Inspector - Derived directly from state/props
    const variables = activeTab === "write" ? {
        inputs: {
            instructions,
            maxPasses,
            minScore,
            maxHunks
        },
        system: {
            current_manuscript: manuscriptText || "(empty)",
            manuscript_word_count: manuscriptWordCount,
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
            current_manuscript: manuscriptText || "(empty)",
        },
        reference_state: {
            existing_citations: agentState?.existingCitations || [],
            citation_targets: agentState?.citationTargets || []
        }
    };

    const hasHistory = (agentState?.history?.length || 0) > 0;

    const resolveManuscript = useCallback(async () => {
        const local = manuscriptRef.current || fallbackManuscript || "";
        if (local.trim()) {
            return local;
        }

        if (!sceneId) {
            return local;
        }

        const scene = await db.scenes.get(sceneId);
        const text = extractTextFromContent(scene?.content);
        if (text.trim()) {
            manuscriptRef.current = text;
            setFallbackManuscript(text);
            return text;
        }

        return local;
    }, [fallbackManuscript, sceneId]);


    const handleStartWrite = async () => {
        if (!instructions.trim()) {
            alert('Please provide instructions for the AI writer');
            return;
        }

        setIsRunning(true);
        // Ensure logs panel is open
        setLogsOpen(true);
        // Clear previous logs ONLY if starting fresh? Or keep? Usually we want context.
        // Actually, let's keep previous logs but maybe add a separator?
        // useProjectStore logic handles appending.

        // Initialize local log tracker with current history to avoid closure staleness
        // const currentLogs = [...logs]; // Use store logs
        // Actually we need to be careful with closure. We will rely on addLog action.
        // But for final save, we need the accumulated logs. We can track them locally in this scope too.
        const currentRunLogs = [...logs];

        try {
            // Import manager workflow
            const { runManagerWorkflow } = await import('@/lib/agents/manager');

            // Fetch project images from novel settings
            const novel = await db.novels.get(novelId);
            const images = novel?.settings?.images || [];

            // Get current manuscript from parent component
            const getCurrentManuscript = async () => {
                return resolveManuscript();
            };

            // Update manuscript function - triggers parent component update
            const updateManuscript = async (text: string) => {
                manuscriptRef.current = text;
                setFallbackManuscript(text);
                console.log('[AIWorkspace] Manuscript updated, length:', text.length);
                if (onUpdateManuscript) {
                    onUpdateManuscript(text);
                }
            };

            // Log callback
            const onLog = (log: LogEntry) => {
                isDirty.current = true; // Mark as dirty to trigger autosave
                currentRunLogs.push(log); // Update local tracker for final save
                addLog(log); // Update global store for UI
            };

            // Get selected sample paper content
            const selectedExample = selectedExampleId
                ? writingExamples.find(ex => ex.id === selectedExampleId)
                : undefined;

            // Run the manager workflow
            const finalManuscript = await runManagerWorkflow(
                novelId,
                sceneId,
                instructions,
                maxPasses,
                minScore,
                images,
                getCurrentManuscript,
                updateManuscript,
                onLog,
                selectedExample?.content // Pass sample paper content
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
            currentRunLogs.push(errorLog);
            addLog(errorLog);
        } finally {
            // Force an immediate save when done to ensure consistency
            await saveAgentState(currentRunLogs);
            setIsRunning(false);
        }
    };

    const handleScanReferences = async () => {
        setIsRunning(true);
        setLogsOpen(true);

        const currentRunLogs = [...logs];

        try {
            const { runCitationWorkflow } = await import('@/lib/agents/citation_runtime');

            const getCurrentManuscript = async () => resolveManuscript();

            const updateManuscript = async (text: string) => {
                manuscriptRef.current = text;
                setFallbackManuscript(text);
                if (onUpdateManuscript) onUpdateManuscript(text);
            };

            const onLog = (log: LogEntry) => {
                isDirty.current = true;
                currentRunLogs.push(log);
                addLog(log);
            };

            const result = await runCitationWorkflow(
                novelId,
                sceneId,
                maxTargets,
                getCurrentManuscript,
                updateManuscript,
                onLog
            );

            console.log("Citation scan complete.", result);

        } catch (error) {
            console.error('[AIWorkspace] Citation error:', error);
            const errorLog: LogEntry = {
                id: uuidv4(),
                timestamp: Date.now(),
                agent: 'System',
                type: 'error',
                content: `Error: ${error instanceof Error ? error.message : String(error)}`
            };
            currentRunLogs.push(errorLog);
            addLog(errorLog);
        } finally {
            await saveAgentState(currentRunLogs);
            setIsRunning(false);
        }
    };

    const handleSingleRevise = async () => {
        if (!revisionInstruction.trim()) {
            alert('Please provide revision instructions');
            return;
        }

        const manuscript = await resolveManuscript();
        if (!manuscript.trim()) {
            alert('No manuscript content to revise');
            return;
        }

        setIsRunning(true);
        setLogsOpen(true);

        const currentRunLogs = [...logs];

        try {
            const { runSingleRevise } = await import('@/lib/agents/single_revise');

            const getCurrentManuscript = async () => resolveManuscript();

            const updateManuscript = async (text: string) => {
                manuscriptRef.current = text;
                setFallbackManuscript(text);
                if (onUpdateManuscript) onUpdateManuscript(text);
            };

            const onLog = (log: LogEntry) => {
                isDirty.current = true;
                currentRunLogs.push(log);
                addLog(log);
            };

            await runSingleRevise(
                novelId,
                sceneId,
                revisionInstruction,
                getCurrentManuscript,
                updateManuscript,
                onLog
            );

            console.log('[AIWorkspace] Single action revise complete.');

        } catch (error) {
            console.error('[AIWorkspace] Single revise error:', error);
            const errorLog: LogEntry = {
                id: uuidv4(),
                timestamp: Date.now(),
                agent: 'System',
                type: 'error',
                content: `Error: ${error instanceof Error ? error.message : String(error)}`
            };
            currentRunLogs.push(errorLog);
            addLog(errorLog);
        } finally {
            await saveAgentState(currentRunLogs);
            setIsRunning(false);
        }
    };

    const handleExport = async () => {
        const manuscript = await resolveManuscript();
        if (!manuscript.trim()) {
            alert('No manuscript content to export');
            return;
        }

        try {
            // Dynamically import JSZip
            const JSZip = (await import('jszip')).default;

            // Get novel title and images for the export
            const novel = await db.novels.get(novelId);
            const title = novel?.title || 'Manuscript';
            const images = novel?.settings?.images || [];
            const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();

            // Create ZIP file
            const zip = new JSZip();

            // === LaTeX Export ===
            const texContent = exportToLatex(manuscript, {
                title: title,
                correspondence: ''
            });
            zip.file(`${sanitizedTitle}.tex`, texContent);

            // Add figures folder with images
            if (images.length > 0) {
                const figuresFolder = zip.folder('figures');
                if (figuresFolder) {
                    for (const image of images) {
                        let base64Data = image.data;
                        if (base64Data.includes(',')) {
                            base64Data = base64Data.split(',')[1];
                        }
                        figuresFolder.file(image.name, base64Data, { base64: true });
                    }
                }
            }

            // Prepare images payload for API calls
            const imagesPayload = images.map(img => ({
                name: img.name,
                data: img.data
            }));

            // === PDF Export (via LaTeX compilation API) ===
            try {
                const pdfResponse = await fetch('/api/compile-latex', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        latex: texContent,
                        filename: sanitizedTitle,
                        images: imagesPayload
                    })
                });

                if (pdfResponse.ok) {
                    const pdfBlob = await pdfResponse.blob();
                    zip.file(`${sanitizedTitle}.pdf`, pdfBlob);
                    console.log('[AIWorkspace] PDF compilation successful');
                } else {
                    const error = await pdfResponse.json();
                    console.warn('[AIWorkspace] PDF compilation failed:', error.error);
                    // Continue without PDF - don't fail the entire export
                }
            } catch (pdfErr) {
                console.warn('[AIWorkspace] PDF compilation error:', pdfErr);
                // Continue without PDF
            }

            // === Word Export (via Pandoc API) ===
            const wordResponse = await fetch('/api/convert-to-word', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    latex: texContent,
                    filename: sanitizedTitle,
                    images: imagesPayload
                })
            });

            if (!wordResponse.ok) {
                const error = await wordResponse.json();
                throw new Error(error.error || 'Word conversion failed');
            }

            const wordBlob = await wordResponse.blob();
            zip.file(`${sanitizedTitle}.docx`, wordBlob);

            // Generate and download the ZIP
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${sanitizedTitle}_manuscript.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log(`[AIWorkspace] Export complete: .tex, .pdf, .docx, and ${images.length} figures`);
        } catch (error) {
            console.error('[AIWorkspace] Export error:', error);
            alert(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
        }
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
                    onClick={() => setActiveTab("revise")}
                    className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "revise" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    Revise
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
                                    value={isNaN(maxPasses) ? "" : maxPasses}
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
                                    value={isNaN(minScore) ? "" : minScore}
                                    onChange={(e) => handleInputChange(setMinScore, parseFloat(e.target.value))}
                                />
                            </div>
                            <div className="space-y-2 col-span-2">
                                <label className="text-sm font-medium">Search/Replace Limit (Max Hunks)</label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={isNaN(maxHunks) ? "" : maxHunks}
                                    onChange={(e) => handleInputChange(setMaxHunks, parseInt(e.target.value))}
                                />
                            </div>

                            {/* Sample Paper Selection */}
                            {writingExamples.length > 0 && (
                                <div className="space-y-2 col-span-2">
                                    <label className="text-sm font-medium">Writing Example (Optional)</label>
                                    <select
                                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                                        value={selectedExampleId}
                                        onChange={(e) => setSelectedExampleId(e.target.value)}
                                    >
                                        <option value="">None</option>
                                        {writingExamples.map((ex) => (
                                            <option key={ex.id} value={ex.id}>{ex.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-muted-foreground">
                                        Formatter will use this to guide writing style and structure.
                                    </p>
                                </div>
                            )}
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
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-xs h-8"
                                    onClick={handleExport}
                                    disabled={isRunning}
                                >
                                    Export (.tex + .pdf + .docx)
                                </Button>
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

                {activeTab === "revise" && (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Revision Instruction</label>
                            <textarea
                                className="w-full min-h-[120px] p-2 rounded-md border text-sm bg-transparent"
                                placeholder="Describe the specific revision you want to make to the manuscript... (e.g., 'Shorten the introduction section', 'Add more statistical details to the results', 'Fix the formatting of abbreviations')"
                                value={revisionInstruction}
                                onChange={(e) => setRevisionInstruction(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                This will directly send your instruction to the Reviser agent for a single, targeted edit.
                            </p>
                        </div>

                        <div className="pt-4">
                            <Button
                                className="w-full"
                                onClick={handleSingleRevise}
                                disabled={isRunning || !revisionInstruction.trim()}
                            >
                                {isRunning ? "Revising..." : "Apply Revision"}
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
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-xs h-8"
                                    onClick={handleExport}
                                    disabled={isRunning}
                                >
                                    Export (.tex + .pdf + .docx)
                                </Button>
                            </div>
                        </div>
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
                                value={isNaN(maxTargets) ? "" : maxTargets}
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
                                    variables={{ existing_citations: agentState?.existingCitations || [] }}
                                    title="Existing Citations"
                                    trigger={<Button variant="outline" size="sm" className="w-full text-xs h-8">Citations</Button>}
                                />
                                <VariableInspector
                                    variables={{ citation_targets: agentState?.citationTargets || [] }}
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
