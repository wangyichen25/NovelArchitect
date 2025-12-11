
"use client";

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import BubbleMenuExtension from '@tiptap/extension-bubble-menu';
import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/db';
import { AhoCorasick } from '@/lib/ai/scanner';
import { Button } from '@/components/ui/button';
import { ScanSearch, Sparkles, Loader2, RefreshCw, BookPlus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { EntityMark } from '@/components/editor/extensions/EntityMark';
import { SlashCommand, getSuggestionItems, renderItems } from '@/components/editor/extensions/SlashCommand';
import Placeholder from '@tiptap/extension-placeholder';
import { RewriteDialog } from './RewriteDialog';

interface NovelEditorProps {
    initialContent?: any;
    onUpdate?: (content: any) => void;
    sceneId: string;
}

export interface NovelEditorHandle {
    handleAnalyze: () => Promise<void>;
}

const getColorForCategory = (cat: string) => {
    switch (cat) {
        case 'character': return '#0891b2'; // Cyan-600
        case 'location': return '#16a34a'; // Green-600
        case 'object': return '#2563eb'; // Blue-600
        case 'lore': return '#9333ea'; // Purple-600
        case 'multiple': return '#db2777'; // Pink-600 (Ambiguous)
        default: return '#d97706'; // Amber-600
    }
};

const NovelEditor = forwardRef<NovelEditorHandle, NovelEditorProps>(({ initialContent, onUpdate, sceneId }, ref) => {
    const params = useParams();
    const novelId = params.id as string;
    const [isScanning, setIsScanning] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [hoveredEntity, setHoveredEntity] = useState<{ id: string; name: string; description: string; category: string; image?: string; x: number; y: number } | null>(null);
    const [isBubbleMenuOpen, setIsBubbleMenuOpen] = useState(false);
    const [bubbleMenuPos, setBubbleMenuPos] = useState({ x: 0, y: 0 });
    const [isRewriteDialogOpen, setIsRewriteDialogOpen] = useState(false);
    const handlersRef = useRef({ analyze: () => { }, scan: () => { }, aiWrite: () => { }, aiRewrite: () => { }, addCodex: () => { } });

    const editor = useEditor({
        extensions: [
            StarterKit,
            EntityMark,
            Highlight.configure({ multicolor: true }),
            BubbleMenuExtension,
            Placeholder.configure({
                placeholder: "Type '/' for commands or start writing...",
            }),
            SlashCommand.configure({
                suggestion: {
                    items: ({ query }: { query: string }) => {
                        return [
                            {
                                title: 'AI Write (Insert)',
                                icon: Sparkles,
                                command: ({ editor, range }: any) => {
                                    editor.chain().focus().deleteRange(range).run();
                                    handlersRef.current.aiWrite();
                                },
                            },
                            {
                                title: 'Scan Codex',
                                icon: ScanSearch,
                                command: ({ editor, range }: any) => {
                                    editor.chain().focus().deleteRange(range).run();
                                    handlersRef.current.scan();
                                },
                            },
                            ...getSuggestionItems({ query })
                        ].filter(item => item.title.toLowerCase().startsWith(query.toLowerCase()));
                    },
                    render: renderItems,
                },
            }),
        ],
        content: initialContent || '<p>Start writing...</p>',
        editorProps: {
            attributes: {
                class: 'prose prose-lg dark:prose-invert focus:outline-none max-w-none min-h-[500px] px-4 md:px-8 py-4 text-foreground marker:text-foreground',
            },
            handleDOMEvents: {
                mouseover: (view, event) => {
                    const target = event.target as HTMLElement;
                    if (target.hasAttribute('data-entity-id')) {
                        const id = target.getAttribute('data-entity-id')!;
                        const description = target.getAttribute('data-entity-description') || '';
                        const category = target.getAttribute('data-entity-category') || 'object';
                        const image = target.getAttribute('data-entity-image') || undefined;
                        const rect = target.getBoundingClientRect();

                        // We can't easily get the name from attributes unless we store it or read text content. 
                        // Text content is usually the name or alias.
                        const name = target.innerText;

                        setHoveredEntity({
                            id,
                            name,
                            description,
                            category,
                            image,
                            x: rect.left + window.scrollX,
                            y: rect.bottom + window.scrollY
                        });
                        return true;
                    }
                    return false;
                },
                mouseout: (view, event) => {
                    // Logic: If on desktop (hover), mouseout usually clears it.
                    // On mobile, tap (click) might trigger mouseover then click.
                    // We want to persist if it was a CLICK.
                    // However, detecting "was click" in mouseout is hard.
                    // Simplification: We rely on the fact that tapping elsewhere will trigger other events.
                    // BUT, to allow easy dismissal, let's keep mouseout clearing it for now.
                    // If users complain tooltips vanish too fast on mobile, we can add a 'pinned' state.
                    // For now, the request is just "compatibility". 
                    // Tapping usually keeps hover state on iOS until tapped elsewhere.

                    const target = event.target as HTMLElement;
                    if (target.hasAttribute('data-entity-id')) {
                        setHoveredEntity(null);
                    }
                    return false;
                },
                click: (view, event) => {
                    const target = event.target as HTMLElement;
                    if (target.hasAttribute('data-entity-id')) {
                        // Force show (redundant if mouseover fired, but ensures it runs)
                        // And prevents editor blur if needed?
                        // event.preventDefault(); // Might stop editing
                        const id = target.getAttribute('data-entity-id')!;
                        const description = target.getAttribute('data-entity-description') || '';
                        const category = target.getAttribute('data-entity-category') || 'object';
                        const image = target.getAttribute('data-entity-image') || undefined;
                        const rect = target.getBoundingClientRect();
                        const name = target.innerText;

                        setHoveredEntity({
                            id,
                            name,
                            description,
                            category,
                            image,
                            x: rect.left + window.scrollX,
                            y: rect.bottom + window.scrollY
                        });
                        return true;
                    }
                    // If clicked elsewhere, clear it (if handling here)
                    setHoveredEntity(null);
                    return false;
                }
            }
        },
        onUpdate: ({ editor }) => {
            if (onUpdate) {
                onUpdate(editor.getJSON());
            }
        },
        onSelectionUpdate: ({ editor }) => {
            const selection = editor.state.selection;
            const json = selection.toJSON();
            localStorage.setItem(`novel-architect-cursor-${sceneId}`, JSON.stringify(json));

            // Custom Bubble Menu Logic
            if (!selection.empty) {
                const { from, to } = selection;
                const start = editor.view.coordsAtPos(from);
                const end = editor.view.coordsAtPos(to);
                // Center above selection
                const left = (start.left + end.left) / 2;
                const top = start.top - 40; // Offset above

                // We need to account for scroll if using absolute, or use fixed.
                // Using fixed is easier for overlay.
                setBubbleMenuPos({ x: left, y: top });
                setIsBubbleMenuOpen(true);
            } else {
                setIsBubbleMenuOpen(false);
            }
        },
        onCreate: ({ editor }) => {
            const savedSelection = localStorage.getItem(`novel-architect-cursor-${sceneId}`);
            if (savedSelection) {
                try {
                    const json = JSON.parse(savedSelection);
                    // Need to wait for content to be populated? onCreate happens after content loads? 
                    // Tiptap onCreate is fired when the editor is ready.
                    // But we can also set it immediately.
                    // We need to resolve position mapping if document changed?
                    // Usually just try to restore anchor/head.
                    // However, resolving JSON to selection requires Transaction logic or specific methods.
                    // actually editor.commands.setTextSelection works with integer pos, not full JSON selection object usually.
                    // But we can check if it has anchor/head.
                    // A safer way is checking `from` / `to` or just text offset.
                    // Let's store simple { from, to } or just anchor.
                    // Tiptap selection JSON usually has `type`, `anchor`, `head`.
                } catch (e) { console.error(e); }
            }
        },
        immediatelyRender: false,
    });

    // Better to use useEffect for restoration after editor instance is available
    useEffect(() => {
        if (!editor || !sceneId) return;

        // Slight delay to ensure editor is mounted and content is rendered
        const timer = setTimeout(() => {
            const saved = localStorage.getItem(`novel-architect-cursor-${sceneId}`);
            if (saved) {
                try {
                    const json = JSON.parse(saved);
                    // Validate JSON structure
                    if (json.type === 'text' && typeof json.anchor === 'number') {
                        // Restore selection and scroll
                        editor.chain()
                            .focus()
                            .setTextSelection({ from: json.anchor, to: json.head ?? json.anchor })
                            .scrollIntoView()
                            .run();
                    }
                } catch (e) {
                    console.warn("Failed to restore selection", e);
                }
            }
        }, 100); // Increased timeout to 100ms

        return () => clearTimeout(timer);
    }, [editor, sceneId]);

    // ... (keep handleAnalyze same)

    const performAnalysis = async (textToAnalyze: string) => {
        if (!editor || !novelId) return;
        setIsAnalyzing(true);
        try {
            const provider = localStorage.getItem('novel-architect-provider') || 'openai';
            const model = localStorage.getItem(`novel-architect-model-${provider}`);

            // Delegate to AnalysisService
            const { AnalysisService } = await import("@/lib/services/analysis");
            const result = await AnalysisService.analyzeText(novelId, textToAnalyze, {
                provider,
                model: model || undefined,
            }, (status) => console.log(status));

            if (result.new > 0 || result.updated > 0) {
                alert(`Analysis complete! Added ${result.new} new, Updated ${result.updated} entries.`);
                await handleScan();
            } else {
                alert("Analysis complete. No new information found.");
            }

            // Mark as analyzed (Update Tracking)
            await db.scenes.update(sceneId, { "metadata.lastAnalyzed": Date.now() });

        } catch (e: any) {
            console.error(e);
            alert("Analysis failed: " + (e.message || "Unknown Error"));
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleAnalyze = async () => {
        if (!editor) return;
        await performAnalysis(editor.getText());
    };

    const handleAddCodex = async () => {
        if (!editor || !novelId) return;
        const { from, to } = editor.state.selection;
        if (from === to) {
            alert("Please select some text to analyze.");
            return;
        }

        const selection = editor.state.doc.textBetween(from, to, ' ');
        // Get surrounding context (e.g. 1000 chars before and after)
        const contextStart = Math.max(0, from - 1000);
        const contextEnd = Math.min(editor.state.doc.content.size, to + 1000);
        const context = editor.state.doc.textBetween(contextStart, contextEnd, '\n');

        setIsAnalyzing(true);
        try {
            // 1. Retrieve Config
            let provider = localStorage.getItem('novel-architect-provider') || 'openai';
            let model = localStorage.getItem(`novel-architect-model-${provider}`);
            let apiKey = '';

            // Try to load from Project Settings (Legacy/Override)
            const novel = await db.novels.get(novelId);
            if (novel && novel.settings) {
                // Legacy: if (novel.settings.aiProvider) provider = novel.settings.aiProvider;
                if (novel.settings.activeAiModel) model = novel.settings.activeAiModel;
            }
            console.log("Analysis Config:", { provider, model });


            if (provider !== 'ollama') {
                const { AnalysisService } = await import("@/lib/services/analysis");
                apiKey = await AnalysisService.getApiKey(novelId, provider) || '';

                if (!apiKey) {
                    alert("Missing API Key. Please check your Global Settings.");
                    setIsAnalyzing(false);
                    return;
                }
            }

            // 1a. Fetch Context
            const existingEntries = await db.codex.where({ novelId }).toArray();
            const existingNamesList = existingEntries.map(e => {
                const aliases = e.aliases && e.aliases.length > 0 ? ` (Aliases: ${e.aliases.join(', ')})` : '';
                return `- ${e.name}${aliases} [${e.category}]`;
            }).join('\n');

            // const novel = await db.novels.get(novelId); // Already fetched
            let globalContext = novel ? `Novel: ${novel.title}` : "";

            // 2. Call Selection API
            const response = await fetch('/api/analyze/selection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-novel-architect-key': apiKey
                },
                body: JSON.stringify({
                    selection,
                    context,
                    provider,
                    model,
                    existingEntities: existingNamesList,
                    globalContext
                })
            });

            if (!response.ok) throw new Error("Selection analysis failed");
            const result = await response.json();

            if (result.entity) {
                const e = result.entity;
                const normalize = (s: string) => s.toLowerCase().trim();
                const normName = normalize(e.name);

                let targetEntry = existingEntries.find(ex => normalize(ex.name) === normName);

                if (targetEntry) {
                    // Update Existing
                    let changed = false;
                    // Check alias
                    const currentAliases = new Set((targetEntry.aliases || []).map(normalize));
                    // Add selection as alias if it's not the name
                    if (normalize(selection) !== normName && !currentAliases.has(normalize(selection))) {
                        targetEntry.aliases = [...(targetEntry.aliases || []), selection];
                        changed = true;
                    }
                    if (e.aliases) {
                        for (const a of e.aliases) {
                            if (!currentAliases.has(normalize(a))) {
                                targetEntry.aliases.push(a);
                                changed = true;
                            }
                        }
                    }

                    // Merge Description
                    if (e.description && !targetEntry.description.includes(e.description)) {
                        targetEntry.description += "\n\n" + e.description;
                        changed = true;
                    }

                    if (changed) {
                        await db.codex.put(targetEntry);
                        alert(`Updated Codex Entry: ${targetEntry.name}`);
                    } else {
                        alert(`Entity "${targetEntry.name}" found, but no new info to add.`);
                    }

                } else {
                    // Create New
                    const newEntry = {
                        id: uuidv4(),
                        novelId,
                        category: e.category,
                        name: e.name,
                        description: e.description || '',
                        aliases: e.aliases || [],
                        relations: e.relations || [],
                        visualSummary: e.visualSummary || ""
                    };
                    // Ensure selection is alias if different
                    if (normalize(selection) !== normalize(e.name) && !newEntry.aliases.includes(selection)) {
                        newEntry.aliases.push(selection);
                    }

                    await db.codex.add(newEntry);
                    alert(`Created New Codex Entry: ${newEntry.name}`);
                }

                await handleScan();
            } else {
                alert("Could not identify an entity from selection.");
            }

        } catch (e) {
            console.error(e);
            alert("Failed to add to Codex.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleScan = useCallback(async () => {
        if (!editor || !novelId) return;
        setIsScanning(true);

        try {
            // 1. Fetch Codex Entries
            const entries = await db.codex.where({ novelId }).toArray();
            const keywords: string[] = [];
            // Map keyword -> List of Entity Data
            const entityMap: Record<string, { id: string; name: string; description: string; category: string; image?: string; color: string }[]> = {};
            const keywordsSet = new Set<string>();

            entries.forEach(e => {
                const addToMap = (key: string) => {
                    const normalizedKey = key.toLowerCase();
                    if (!entityMap[normalizedKey]) {
                        entityMap[normalizedKey] = [];
                        if (!keywordsSet.has(normalizedKey)) { // Only add unique keywords
                            keywordsSet.add(normalizedKey);
                            keywords.push(key);
                        }
                    }
                    // Avoid duplicates if alias repeated
                    if (!entityMap[normalizedKey].find(item => item.id === e.id)) {
                        entityMap[normalizedKey].push({
                            id: e.id,
                            name: e.name,
                            description: e.description,
                            category: e.category,
                            image: e.image,
                            color: getColorForCategory(e.category)
                        });
                    }
                };

                addToMap(e.name);
                if (e.aliases) {
                    e.aliases.forEach(addToMap);
                }
            });

            if (keywords.length === 0) {
                // if (!isAnalyzing) alert("No Codex entries found to scan for."); // Silent fail on auto-scan
                setIsScanning(false);
                return;
            }

            // 2. Build Scanner
            const scanner = new AhoCorasick(keywords);

            // 3. Scan & Highlight
            // For efficiency, we'll create a single transaction.
            const tr = editor.state.tr;

            // Remove existing EntityMarks first. 
            // We use removeMark over the entire document range.
            tr.removeMark(0, editor.state.doc.content.size, editor.schema.marks.entity);
            tr.removeMark(0, editor.state.doc.content.size, editor.schema.marks.highlight);

            editor.state.doc.descendants((node, pos) => {
                if (node.isText && node.text) {
                    const matches = scanner.search(node.text);
                    matches.forEach(m => {
                        const candidates = entityMap[m.word.toLowerCase()];
                        if (candidates && candidates.length > 0) {
                            const from = pos + m.start;
                            const to = pos + m.end;

                            let data;
                            if (candidates.length === 1) {
                                data = candidates[0];
                            } else {
                                // Handle Ambiguity
                                data = {
                                    id: candidates.map(c => c.id).join(','),
                                    name: m.word, // Use the matched text as name
                                    description: candidates.map(c => `[${c.name} (${c.category})]:\n${c.description || 'No description'}`).join('\n\n---\n\n'),
                                    category: 'multiple',
                                    color: getColorForCategory('multiple'),
                                    image: candidates.find(c => c.image)?.image // Use first available image
                                };
                            }

                            // Add mark to transaction
                            tr.addMark(from, to, editor.schema.marks.entity.create({
                                id: data.id,
                                description: data.description,
                                category: data.category,
                                color: data.color,
                                image: data.image
                            }));
                        }
                    });
                }
            });

            // Dispatch the transaction once
            editor.view.dispatch(tr);

        } catch (e) {
            console.error(e);
            // alert("Scan failed"); // Silent fail
        } finally {
            setIsScanning(false);
        }
    }, [editor, novelId]);

    // Auto-scan on load or scene change
    useEffect(() => {
        if (!editor || !sceneId) return;

        // Wait for editor content to be ready
        const timer = setTimeout(() => {
            handleScan();
        }, 500);

        return () => clearTimeout(timer);
    }, [sceneId, editor, handleScan]);


    const handleAIWrite = async () => {
        if (!editor) return;
        const instruction = prompt("What should the AI write?");
        if (!instruction) return;

        // Get some previous context
        const { from } = editor.state.selection;
        const context = editor.state.doc.textBetween(Math.max(0, from - 1000), Math.min(editor.state.doc.content.size, from + 1000), '\n');

        setIsAnalyzing(true); // Reuse loading state
        try {
            // 1. Retrieve Config
            let provider = localStorage.getItem('novel-architect-provider') || 'openai';
            let model = localStorage.getItem(`novel-architect-model-${provider}`);
            let apiKey = '';

            // Try to load from Project Settings
            const novel = await db.novels.get(novelId);
            if (novel && novel.settings) {
                // Legacy: if (novel.settings.aiProvider) provider = novel.settings.aiProvider;
                if (novel.settings.activeAiModel) model = novel.settings.activeAiModel;
            }
            console.log("AI Write Config:", { provider, model });


            if (provider !== 'ollama') {
                const { AnalysisService } = await import("@/lib/services/analysis");
                apiKey = await AnalysisService.getApiKey(novelId, provider) || '';

                if (!apiKey) {
                    alert("Missing API Key. Please check your Global Settings.");
                    setIsAnalyzing(false);
                    return;
                }
            }

            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instruction,
                    context,
                    provider,
                    model,
                    apiKey
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Generation failed: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();

            if (data.text) {
                // Insert at the original position
                editor.chain().insertContentAt(from, data.text).run();
            }

        } catch (e: any) {
            console.error(e);
            alert("AI Writing failed: " + e.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const performRewrite = async (instruction: string) => {
        if (!editor) return;
        const { from, to } = editor.state.selection;
        // If selection is lost (e.g. clicking dialog), we might need to rely on saved selection or just ensure we don't lose it.
        // Dialog usually steals focus?
        // We might need to store the selection range when opening the dialog.
        // But for now, let's assume Tiptap keeps selection or we recover it.

        const selectedText = editor.state.doc.textBetween(from, to, '\n');

        setIsAnalyzing(true);
        setIsRewriteDialogOpen(false);
        try {
            // 1. Retrieve Config
            let provider = localStorage.getItem('novel-architect-provider') || 'openai';
            let model = localStorage.getItem(`novel-architect-model-${provider}`);
            let apiKey = '';

            // Try to load from Project Settings
            const novel = await db.novels.get(novelId);
            if (novel && novel.settings) {
                // Legacy: if (novel.settings.aiProvider) provider = novel.settings.aiProvider;
                if (novel.settings.activeAiModel) model = novel.settings.activeAiModel;
            }
            console.log("Rewrite Config:", { provider, model });


            if (provider !== 'ollama') {
                const { AnalysisService } = await import("@/lib/services/analysis");
                apiKey = await AnalysisService.getApiKey(novelId, provider) || '';

                if (!apiKey) {
                    alert("Missing API Key. Please check your Global Settings.");
                    setIsAnalyzing(false);
                    return;
                }
            }

            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instruction: instruction,
                    prompt: selectedText, // Sending selection as prompt
                    context: "",
                    provider,
                    model,
                    apiKey
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Generation failed: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();

            if (data.text) {
                // Restore selection range then replace
                editor.chain().setTextSelection({ from, to }).insertContent(data.text).run();
            }
        } catch (e: any) {
            console.error(e);
            alert("Rewrite failed: " + e.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleAIRewrite = () => {
        if (!editor) return;
        const { from, to } = editor.state.selection;
        if (from === to) {
            alert("Please select some text to rewrite first.");
            return;
        }
        setIsRewriteDialogOpen(true);
    };

    useEffect(() => {
        handlersRef.current = {
            analyze: handleAnalyze,
            scan: handleScan,
            aiWrite: handleAIWrite,
            aiRewrite: handleAIRewrite,
            addCodex: handleAddCodex
        };
    }, [handleAnalyze, handleScan, handleAIWrite, handleAIRewrite, handleAddCodex]); // Depend on them (they are defined in-component so they change on render? No wait, strict mode?)
    // Actually handleAnalyze etc are closures, they depend on `editor` etc. so they DO change.
    // The ref needs to be updated.

    useImperativeHandle(ref, () => ({
        handleAnalyze
    }));

    if (!editor) {
        return null;
    }

    return (
        <div className="w-full max-w-4xl mx-auto min-h-screen flex flex-col relative">
            <EditorContent editor={editor} className="flex-1" />

            {/* Custom Bubble Menu */}
            {isBubbleMenuOpen && (
                <div
                    className="fixed z-50 bg-popover text-popover-foreground border rounded-md shadow-md p-1 flex items-center gap-1 animate-in fade-in zoom-in-95"
                    style={{
                        left: bubbleMenuPos.x,
                        top: bubbleMenuPos.y,
                        transform: 'translateX(-50%)' // Center horizontally
                    }}
                >
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(e) => {
                        e.preventDefault(); // Prevent losing focus?
                        handleAIRewrite();
                    }}>
                        <RefreshCw className="w-3 h-3 mr-1" />
                        AI Rewrite
                    </Button>
                    <div className="w-[1px] h-4 bg-border mx-1" />
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(e) => {
                        e.preventDefault();
                        handleAddCodex();
                    }}>
                        <BookPlus className="w-3 h-3 mr-1" />
                        Add Codex
                    </Button>
                </div>
            )}

            {/* Tooltip */}
            {hoveredEntity && (
                <div
                    className="fixed z-50 bg-popover text-popover-foreground px-3 py-2 rounded-md shadow-md border text-xs max-w-sm animate-in fade-in zoom-in-95"
                    style={{
                        left: hoveredEntity.x,
                        top: hoveredEntity.y + 10, // Offset a bit
                    }}
                >
                    {hoveredEntity.image && (
                        <div className="mb-2 rounded overflow-hidden">
                            <img src={hoveredEntity.image} alt={hoveredEntity.name} className="w-full h-auto max-h-64 object-contain" />
                        </div>
                    )}
                    <div className="font-bold flex items-center gap-2">
                        {hoveredEntity.name}
                        <span className="text-[10px] uppercase opacity-50 px-1 border rounded">{hoveredEntity.category}</span>
                    </div>
                    <div className="mt-1 opacity-90 line-clamp-[10] whitespace-pre-wrap">
                        {hoveredEntity.description || "No description available."}
                    </div>
                </div>
            )}

            <RewriteDialog
                open={isRewriteDialogOpen}
                onOpenChange={setIsRewriteDialogOpen}
                onRewrite={performRewrite}
            />
        </div>
    );
});

NovelEditor.displayName = "NovelEditor";

export default NovelEditor;
