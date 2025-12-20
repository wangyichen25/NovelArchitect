
"use client";

import { useChat } from '@ai-sdk/react';
interface Message { id: string; role: string; content: string; }
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
                const key = localStorage.getItem(`novel-architect-key-${provider}`);
                if (key) setApiKey(key);
            }
        };
        init();
    }, [novelId]);

    const { messages } = useChat() as unknown as { messages: Message[] };

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
