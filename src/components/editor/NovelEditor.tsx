
"use client";

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import BubbleMenuExtension from '@tiptap/extension-bubble-menu';
import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/db';
import { AhoCorasick } from '@/lib/ai/scanner';
import { Button } from '@/components/ui/button';
import { ScanSearch, Sparkles, Loader2, PenTool, RefreshCw, BookPlus } from 'lucide-react';
import { KeyChain } from '@/lib/ai/keychain';
import { v4 as uuidv4 } from 'uuid';
import { EntityMark } from '@/components/editor/extensions/EntityMark';
import { SlashCommand, getSuggestionItems, renderItems } from '@/components/editor/extensions/SlashCommand';
import Placeholder from '@tiptap/extension-placeholder';

interface NovelEditorProps {
    initialContent?: any;
    onUpdate?: (content: any) => void;
    sceneId: string;
}

export default function NovelEditor({ initialContent, onUpdate, sceneId }: NovelEditorProps) {
    const params = useParams();
    const novelId = params.id as string;
    const [isScanning, setIsScanning] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [hoveredEntity, setHoveredEntity] = useState<{ id: string; name: string; description: string; category: string; image?: string; x: number; y: number } | null>(null);
    const [isBubbleMenuOpen, setIsBubbleMenuOpen] = useState(false);
    const [bubbleMenuPos, setBubbleMenuPos] = useState({ x: 0, y: 0 });
    const handlersRef = useRef({ analyze: () => { }, scan: () => { }, aiWrite: () => { }, aiRephrase: () => { }, addCodex: () => { } });

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
                class: 'prose prose-lg dark:prose-invert focus:outline-none max-w-none min-h-[500px] px-8 py-4 text-foreground marker:text-foreground',
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
                    const target = event.target as HTMLElement;
                    if (target.hasAttribute('data-entity-id')) {
                        setHoveredEntity(null);
                    }
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
            const text = textToAnalyze;
            if (text.length < 10) { // Lower limit for selection
                alert("Selected text is too short for analysis.");
                setIsAnalyzing(false);
                return;
            }

            // 1. Retrieve & Decrypt Key
            const provider = localStorage.getItem('novel-architect-provider') || 'openai';
            const model = localStorage.getItem(`novel-architect-model-${provider}`);
            let apiKey = '';

            if (provider !== 'ollama') {
                const encrypted = localStorage.getItem(`novel-architect-key-${provider}`);
                const pin = localStorage.getItem('novel-architect-pin-hash'); // Insecure usage for prototype convenience

                if (encrypted && pin) {
                    const decrypted = await KeyChain.decrypt(encrypted, pin);
                    if (decrypted) apiKey = decrypted;
                }

                if (!apiKey) {
                    alert("Could not decrypt API Key. Please ensure you have set it in Settings.");
                    setIsAnalyzing(false);
                    return;
                }
            }

            // 1a. Fetch Global Context (Novel Title + Act Summaries)
            const novel = await db.novels.get(novelId);
            const acts = await db.acts.where({ novelId }).sortBy('order');

            let globalContext = "";
            if (novel) {
                globalContext += `Novel Title: ${novel.title}\n`;
            }
            if (acts.length > 0) {
                globalContext += "Acts Summary:\n" + acts.map(a => `- ${a.title}: ${a.summary}`).join('\n');
            }

            // 1b. Fetch Existing Entries (Context Injection)
            const existingEntries = await db.codex.where({ novelId }).toArray();
            const existingNamesList = existingEntries.map(e => {
                const aliases = e.aliases && e.aliases.length > 0 ? ` (Aliases: ${e.aliases.join(', ')})` : '';
                return `- ${e.name}${aliases} [${e.category}]`;
            }).join('\n');

            // 2. Call API
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-novel-architect-key': apiKey
                },
                body: JSON.stringify({
                    text,
                    provider,
                    model,
                    existingEntities: existingNamesList, // Pass context
                    globalContext // Pass global context
                })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Analysis request failed: ${response.status}`);
            }

            const result = await response.json();

            // 3. Process Results & Save to Codex
            const newEntries: any[] = [];
            const updatedEntries: any[] = [];

            const normalize = (s: string) => s.toLowerCase().trim();
            // Simplify for loose comparison (remove punctuation, extra spaces)
            const simplify = (s: string) => s.toLowerCase().replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ").trim();

            // Map Name AND Aliases to Entity
            const existingMap = new Map();
            existingEntries.forEach(e => {
                existingMap.set(normalize(e.name), e);
                if (e.aliases) {
                    e.aliases.forEach(a => existingMap.set(normalize(a), e));
                }
            });

            // Helper to process items
            const processItem = (item: any, cat: string) => {
                const normName = normalize(item.name);
                if (existingMap.has(normName)) {
                    // UPDATE existing
                    const existing = existingMap.get(normName)!;
                    let changed = false;

                    // Merge Aliases
                    const newAliases = item.aliases || [];
                    const currentAliases = new Set((existing.aliases || []).map(normalize));
                    for (const a of newAliases) {
                        if (!currentAliases.has(normalize(a))) {
                            existing.aliases = [...(existing.aliases || []), a];
                            changed = true;
                        }
                    }

                    // Append/Update Description
                    if (item.description && item.description.length > 5) {
                        const simpleNew = simplify(item.description);
                        const simpleExisting = simplify(existing.description || "");

                        // Case 1: New description is better/longer and includes the old info (Superset)
                        if (simpleNew.includes(simpleExisting) && simpleNew.length > simpleExisting.length) {
                            existing.description = item.description;
                            changed = true;
                        }
                        // Case 2: Old includes new (Subset) -> Do nothing.
                        else if (simpleExisting.includes(simpleNew)) {
                            // no-op
                        }
                        // Case 3: New info is disjoint/different -> Append
                        else {
                            existing.description = (existing.description ? existing.description + "\n\n" : "") + item.description;
                            changed = true;
                        }
                    }

                    // Merge Relations
                    if (item.relations && item.relations.length > 0) {
                        const currentRelations = new Set((existing.relations || []).map((r: any) => normalize(r.target) + "|" + normalize(r.relationship)));
                        for (const r of item.relations) {
                            const key = normalize(r.target) + "|" + normalize(r.relationship);
                            if (!currentRelations.has(key)) {
                                existing.relations = [...(existing.relations || []), r];
                                changed = true;
                            }
                        }
                    }

                    if (item.visualSummary) {
                        existing.visualSummary = item.visualSummary;
                        changed = true;
                    }

                    if (changed) {
                        if (!updatedEntries.includes(existing)) {
                            updatedEntries.push(existing);
                        }
                    }
                } else {
                    // CREATE new
                    const newEntry = {
                        id: uuidv4(),
                        novelId,
                        category: cat,
                        name: item.name,
                        description: item.description || '',
                        aliases: item.aliases || [],
                        relations: item.relations || [],
                        visualSummary: item.visualSummary || ""
                    };
                    newEntries.push(newEntry);
                    existingMap.set(normName, newEntry as any); // Prevent dupes in same batch
                }
            };

            if (result.characters) result.characters.forEach((c: any) => processItem(c, 'character'));
            if (result.locations) result.locations.forEach((l: any) => processItem(l, 'location'));
            if (result.objects) result.objects.forEach((o: any) => processItem(o, 'object'));
            if (result.lore) result.lore.forEach((l: any) => processItem(l, 'lore'));

            if (newEntries.length > 0) await db.codex.bulkAdd(newEntries);
            if (updatedEntries.length > 0) await db.codex.bulkPut(updatedEntries);

            if (newEntries.length > 0 || updatedEntries.length > 0) {
                alert(`Analysis complete! Added ${newEntries.length} new, Updated ${updatedEntries.length} entries.`);
                // Trigger Scan automatically
                await handleScan();
            } else {
                alert("Analysis complete. No new information found.");
            }

        } catch (e) {
            console.error(e);
            alert("Analysis failed. See console for details.");
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
            // 1. Retrieve Config (reuse logic - should be extracted to hook/util really)
            const provider = localStorage.getItem('novel-architect-provider') || 'openai';
            const model = localStorage.getItem(`novel-architect-model-${provider}`);
            let apiKey = '';
            if (provider !== 'ollama') {
                const encrypted = localStorage.getItem(`novel-architect-key-${provider}`);
                const pin = localStorage.getItem('novel-architect-pin-hash');
                if (encrypted && pin) {
                    const decrypted = await KeyChain.decrypt(encrypted, pin);
                    if (decrypted) apiKey = decrypted;
                }
            }

            // 1a. Fetch Context
            const existingEntries = await db.codex.where({ novelId }).toArray();
            const existingNamesList = existingEntries.map(e => {
                const aliases = e.aliases && e.aliases.length > 0 ? ` (Aliases: ${e.aliases.join(', ')})` : '';
                return `- ${e.name}${aliases} [${e.category}]`;
            }).join('\n');

            const novel = await db.novels.get(novelId);
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

    const handleScan = async () => {
        if (!editor || !novelId) return;
        setIsScanning(true);

        try {
            // 1. Fetch Codex Entries
            const entries = await db.codex.where({ novelId }).toArray();
            const keywords: string[] = [];
            // Map keyword -> Entity Data
            const entityMap: Record<string, { id: string; description: string; category: string; image?: string; color: string }> = {};

            entries.forEach(e => {
                keywords.push(e.name);
                entityMap[e.name.toLowerCase()] = {
                    id: e.id,
                    description: e.description,
                    category: e.category,
                    image: e.image,
                    color: getColorForCategory(e.category)
                };
                if (e.aliases) {
                    e.aliases.forEach(a => {
                        keywords.push(a);
                        entityMap[a.toLowerCase()] = {
                            id: e.id, // Aliases map to same ID
                            description: e.description,
                            category: e.category,
                            image: e.image,
                            color: getColorForCategory(e.category)
                        };
                    });
                }
            });

            if (keywords.length === 0) {
                if (!isAnalyzing) alert("No Codex entries found to scan for.");
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
                        const data = entityMap[m.word.toLowerCase()];
                        if (data) {
                            const from = pos + m.start;
                            const to = pos + m.end;

                            // Add mark to transaction
                            tr.addMark(from, to, editor.schema.marks.entity.create(data));
                        }
                    });
                }
            });

            // Dispatch the transaction once
            editor.view.dispatch(tr);

        } catch (e) {
            console.error(e);
            alert("Scan failed");
        } finally {
            setIsScanning(false);
        }
    };

    const getColorForCategory = (cat: string) => {
        switch (cat) {
            case 'character': return '#0891b2'; // Cyan-600
            case 'location': return '#16a34a'; // Green-600
            case 'object': return '#2563eb'; // Blue-600
            case 'lore': return '#9333ea'; // Purple-600
            default: return '#d97706'; // Amber-600
        }
    };

    const handleAIWrite = async () => {
        if (!editor) return;
        const instruction = prompt("What should the AI write?");
        if (!instruction) return;

        // Get some previous context
        const { from } = editor.state.selection;
        const context = editor.state.doc.textBetween(Math.max(0, from - 1000), Math.min(editor.state.doc.content.size, from + 1000), '\n');

        setIsAnalyzing(true); // Reuse loading state
        try {
            const provider = localStorage.getItem('novel-architect-provider') || 'openai';
            const model = localStorage.getItem(`novel-architect-model-${provider}`);
            // We need Key passing logic here too similar to Analyze, but for brevity/prototype:
            // I'll copy the key retrieval logic or assume the API handles it (it doesn't, I need to send it).
            // NOTE: The route I just wrote didn't check for headers! 
            // I should update the route to check headers or just pass key in body from here? 
            // The route uses standard AI SDK which depends on ENV vars usually, but I want BYOK.
            // I'll grab the key here and pass it in body for now as 'apiKey' property (need to update route to use it?).
            // Wait, standard AI SDK doesn't take key in `generateText` options easily unless I instantiate provider with it.
            // My route implementation instantiated provider *inside* the handler.
            // I need to update the route to accept key.

            // Let's implement the FE logic assuming route will take 'apiKey'.
            let apiKey = '';
            if (provider !== 'ollama') {
                const encrypted = localStorage.getItem(`novel-architect-key-${provider}`);
                const pin = localStorage.getItem('novel-architect-pin-hash');
                if (encrypted && pin) {
                    const decrypted = await KeyChain.decrypt(encrypted, pin);
                    if (decrypted) apiKey = decrypted;
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

        } catch (e) {
            console.error(e);
            alert("AI Writing failed.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleAIRephrase = async () => {
        if (!editor) return;
        const { from, to } = editor.state.selection;
        if (from === to) {
            alert("Please select some text to rephrase first.");
            return;
        }
        const selectedText = editor.state.doc.textBetween(from, to, '\n');

        setIsAnalyzing(true);
        try {
            const provider = localStorage.getItem('novel-architect-provider') || 'openai';
            const model = localStorage.getItem(`novel-architect-model-${provider}`);
            let apiKey = '';
            if (provider !== 'ollama') {
                const encrypted = localStorage.getItem(`novel-architect-key-${provider}`);
                const pin = localStorage.getItem('novel-architect-pin-hash');
                if (encrypted && pin) {
                    const decrypted = await KeyChain.decrypt(encrypted, pin);
                    if (decrypted) apiKey = decrypted;
                }
            }

            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instruction: "Rephrase the following text to be more engaging and descriptive.",
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
        } catch (e) {
            console.error(e);
            alert("Rephrase failed.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    useEffect(() => {
        handlersRef.current = {
            analyze: handleAnalyze,
            scan: handleScan,
            aiWrite: handleAIWrite,
            aiRephrase: handleAIRephrase,
            addCodex: handleAddCodex
        };
    }, [handleAnalyze, handleScan, handleAIWrite, handleAIRephrase, handleAddCodex]); // Depend on them (they are defined in-component so they change on render? No wait, strict mode?)
    // Actually handleAnalyze etc are closures, they depend on `editor` etc. so they DO change.
    // The ref needs to be updated.

    if (!editor) {
        return null;
    }

    return (
        <div className="w-full max-w-4xl mx-auto min-h-screen flex flex-col relative">
            <div className="sticky top-0 z-50 p-2 border-b flex justify-between items-center bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <span className="text-xs text-muted-foreground ml-2">Editor</span>
                <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={handleAnalyze} disabled={isAnalyzing || isScanning}>
                        {isAnalyzing ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Sparkles className="h-4 w-4 mr-2 text-purple-500" />}
                        {isAnalyzing ? "Analyzing..." : "Auto-Extract"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleScan} disabled={isScanning || isAnalyzing}>
                        {isScanning ? <ScanSearch className="animate-spin h-4 w-4 mr-2" /> : <ScanSearch className="h-4 w-4 mr-2" />}
                        Scan Codex
                    </Button>
                </div>
            </div>
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
                        handleAIRephrase();
                    }}>
                        <RefreshCw className="w-3 h-3 mr-1" />
                        AI Rephrase
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
                    <div className="mt-1 opacity-90 line-clamp-[10]">
                        {hoveredEntity.description || "No description available."}
                    </div>
                </div>
            )}
        </div>
    );
}
