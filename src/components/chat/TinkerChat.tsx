
"use client";

import { useChat } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '@/hooks/useProject';
import SettingsDialog from '@/components/settings-dialog';
import { Orchestrator } from '@/lib/ai/orchestrator';
import { useParams } from 'next/navigation';
import { db } from '@/lib/db';
import { KeyChain } from '@/lib/ai/keychain';

export default function TinkerChat() {
    const params = useParams();
    const novelId = params.id as string;
    const { activeSceneId, isSidebarOpen } = useProjectStore();
    const orchestratorRef = useRef(new Orchestrator());

    // We need to manage the API Key here to pass it to the server
    const [apiKey, setApiKey] = useState<string>('');

    useEffect(() => {
        const init = async () => {
            await orchestratorRef.current.initialize(novelId);

            // Try to fetch key
            const provider = localStorage.getItem('novel-architect-provider') || 'openai';
            if (provider !== 'ollama') {
                const encKey = localStorage.getItem(`novel-architect-key-${provider}`);
                // In a real app we'd prompt for PIN if not in memory. 
                // For now assuming we can't easily decrypt without user interaction every time?
                // Let's assume the PIN is stored in session storage or we prompt.
                // For this prototype, I'll rely on the user having just entered it in Settings if it's missing.
            }
        };
        init();
    }, [novelId]);

    const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
        api: '/api/chat',
        body: async () => {
            // RAG Time!
            // 1. Get Active Scene
            let scene: any = { content: {}, metadata: { povCharacterId: null, timeOfDay: '' }, beats: '' };
            if (activeSceneId) {
                scene = await db.scenes.get(activeSceneId) || scene;
            }

            // 2. Get Decrypted Key (Quick hack: ask SettingsDialog to expose it? No. 
            // We need a way to get the key. 
            // Let's grab it from local storage and decrypt with a prompt? 
            // Too complex for this step.
            // Let's assume the valid API Key is passed via a header we set.
            // Actually `useChat` headers can be dynamic.

            const provider = localStorage.getItem('novel-architect-provider') || 'openai';
            const model = localStorage.getItem(`novel-architect-model-${provider}`);
            const encKey = localStorage.getItem(`novel-architect-key-${provider}`);
            // Ideally we need the PIN. 
            // For now, let's just assume the user set it and we can't decrypt it easily without the PIN.
            // I will add a PIN field to this chat if needed, OR just send the encrypted blob and let server fail?
            // No, server can't decrypt.
            // Let's skip encryption for the "Prototype" demo if it blocks us, 
            // OR assumes a session variable holds the decrypted key.

            // 3. Orchestrate
            const context = await orchestratorRef.current.assemblePrompt(
                filters(scene), // Abstracted
                "", // History (todo)
                input // The user's current query is the instruction
            );

            return {
                provider,
                model,
                context, // We send the full context string
                novelId,
                activeSceneId
            }
        },
        headers: {
            // We'll handle auth in the route via body for now to keep it simple or adds complexity
        }
    });

    // Helper to safety check scene
    const filters = (s: any) => s || { content: "", metadata: {}, beats: "" };

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const onSubmit = (e: React.FormEvent) => {
        // We need to inject the key into the request or ensure it's available.
        // For simplicity in this iteration, I'll assume the Route handles the "No Key" error gracefully.
        handleSubmit(e, {
            // We can pass extra headers here
            headers: {
                'x-novel-architect-key': 'TODO_GET_DECRYPTED_KEY' // This is the blocker.
            }
        });
    }

    if (!isSidebarOpen) return null;

    return (
        <div className="w-80 border-l bg-card flex flex-col h-full shadow-lg z-20 border-l-border">
            <div className="p-4 border-b flex justify-between items-center bg-muted/20">
                <h3 className="font-serif font-bold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" /> Tinker
                </h3>
                <SettingsDialog />
            </div>

            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-4">
                    {messages.map(m => (
                        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-lg p-3 text-sm ${m.role === 'user'
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'bg-muted text-muted-foreground'
                                }`}>
                                {m.content}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-muted text-muted-foreground rounded-lg p-3 text-xs animate-pulse">
                                Thinking...
                            </div>
                        </div>
                    )}
                </div>
            </ScrollArea>

            <form onSubmit={onSubmit} className="p-4 border-t bg-background">
                <div className="flex gap-2">
                    <Input
                        value={input}
                        onChange={handleInputChange}
                        placeholder="Ask AI for help..."
                        className="flex-1"
                    />
                    <Button type="submit" size="icon" disabled={isLoading}>
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </form>
        </div>
    );
}
