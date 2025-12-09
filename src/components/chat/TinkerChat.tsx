
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

    const { messages } = useChat({
        api: '/api/chat',
        body: async () => {
            // ... (same logic, just confirming body is used by messages fetch? actually useChat fetches on submit. 
            // If we remove submit, useChat might just be used for initial messages? 
            // Wait, if I remove input, how do we use it? 
            // The user wanted to remove the "Ask AI" bar.
            // If they can't ask, useChat is useless unless it's just for display?
            // Yes, user likely wants a read-only log or just removed the manual input.
            // So removing input/handleSubmit is correct.

            // ... existing body code ...

            // RAG logic
            let scene: any = { content: {}, metadata: { povCharacterId: null, timeOfDay: '' }, beats: '' };
            if (activeSceneId) {
                scene = await db.scenes.get(activeSceneId) || scene;
            }

            const provider = localStorage.getItem('novel-architect-provider') || 'openai';
            const model = localStorage.getItem(`novel-architect-model-${provider}`);

            // 3. Orchestrate
            // Note: input is gone from scope if I remove it from destructuring.
            // But orchestrator uses `input`. 
            // If we are not submitting, this body function never runs for *new* messages?
            // Existing messages are loaded? useChat doesn't load history by default unless `initialMessages` passed.
            // It seems TinkerChat is just for "Ask AI". If bar is gone, TinkerChat is dead?
            // The user said "remove the whole 'ask AI for help' bar". 
            // Maybe they just want the history? Or maybe they want to hide the input?

            return {
                provider,
                model,
                context: "", // No context needed if no input?
                novelId,
                activeSceneId
            }
        },
        headers: {
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

                </div>
            </ScrollArea>


        </div>
    );
}
