
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjectStore } from "@/hooks/useProject";
import { KeyChain } from "@/lib/ai/keychain";
import { Settings, Lock, Key, CheckCircle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";

export default function SettingsDialog() {
    const [isOpen, setIsOpen] = useState(false);
    const [provider, setProvider] = useState<'openai' | 'anthropic' | 'ollama' | 'openrouter'>('openai');
    const [apiKey, setApiKey] = useState("");
    const [model, setModel] = useState("");
    const [pin, setPin] = useState("");
    const [isSaved, setIsSaved] = useState(false);

    // [NEW] Attempt to get current novel context
    const params = useParams();
    const novelId = params?.id as string | undefined;

    useEffect(() => {
        if (isOpen) {
            loadSettings();
        }
    }, [isOpen, novelId]);

    const loadSettings = async () => {
        // 1. Try to load from Novel DB first (Sync source)
        if (novelId) {
            try {
                // Dynamically import db/index to ensure no SSR issues if any (though client comp is fine)
                // actually we can import at top level if 'use client'
                const { db } = await import("@/lib/db");
                const novel = await db.novels.get(novelId);

                if (novel && novel.settings) {
                    if (novel.settings.aiProvider) setProvider(novel.settings.aiProvider);
                    if (novel.settings.activeAiModel) setModel(novel.settings.activeAiModel);
                    // For API Key, we might store the encrypted version in settings.apiKey?
                    // Schema says: apiKey?: string; // Encrypted or stored locally only
                    if (novel.settings.apiKey) {
                        // We have an encrypted key blob. We need the PIN.
                        // PIN is strictly local (localStorage) for security, we never sync the PIN.
                        const storedPin = localStorage.getItem('novel-architect-pin-hash');
                        if (storedPin) {
                            setPin(storedPin);
                            const decrypted = await KeyChain.decrypt(novel.settings.apiKey, storedPin);
                            if (decrypted) setApiKey(decrypted);
                        }
                    }
                    return; // Successfully loaded from DB
                }
            } catch (e) {
                console.error("Failed to load settings from DB", e);
            }
        }

        // 2. Fallback to LocalStorage (Global/Local-only defaults)
        const storedProvider = localStorage.getItem('novel-architect-provider') as any;
        if (storedProvider) setProvider(storedProvider);

        const storedModel = localStorage.getItem(`novel-architect-model-${storedProvider || 'openai'}`);
        if (storedModel) setModel(storedModel);

        const storedPin = localStorage.getItem('novel-architect-pin-hash');
        if (storedPin) {
            setPin(storedPin);
            const currentProvider = storedProvider || provider;
            if (currentProvider !== 'ollama') {
                const encrypted = localStorage.getItem(`novel-architect-key-${currentProvider}`);
                if (encrypted) {
                    KeyChain.decrypt(encrypted, storedPin).then(decrypted => {
                        if (decrypted) setApiKey(decrypted);
                    });
                }
            }
        }
    };

    // Update model input when provider changes
    useEffect(() => {
        // logic to reset model or load default if provider switches?
        // keep simple for now
    }, [provider]);

    const handleSave = async () => {
        let encryptedKey = "";

        // 1. Encrypt Key if needed
        if (provider !== 'ollama') {
            if (!apiKey || !pin) {
                alert("API Key and PIN are required for cloud providers.");
                return;
            }
            encryptedKey = await KeyChain.encrypt(apiKey, pin);

            // Always update local cache too for redundancy
            localStorage.setItem(`novel-architect-key-${provider}`, encryptedKey);
            localStorage.setItem(`novel-architect-pin-hash`, pin);
        }

        // Update LocalStorage (Global)
        localStorage.setItem(`novel-architect-model-${provider}`, model);
        localStorage.setItem('novel-architect-provider', provider);

        // 2. Save to Novel DB (Sync)
        if (novelId) {
            const { db } = await import("@/lib/db");
            await db.novels.update(novelId, {
                'settings.aiProvider': provider,
                'settings.activeAiModel': model,
                'settings.apiKey': encryptedKey || undefined, // Sync the encrypted blob!
                lastModified: Date.now()
            });
        }

        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
        setTimeout(() => setIsOpen(false), 1000);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" title="AI Settings">
                    <Settings className="h-5 w-5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>AI Settings {novelId ? '(Project)' : '(Global)'}</DialogTitle>
                    <DialogDescription>
                        Configure your AI provider and API keys.
                        {novelId ? " Settings will be synced to this project." : " Settings are stored locally."}
                        <br />
                        <span className="text-xs text-muted-foreground">Keys are encrypted with your PIN before syncing.</span>
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label className="text-right text-sm font-medium">Provider</label>
                        <select
                            className="col-span-3 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                            value={provider}
                            onChange={(e) => setProvider(e.target.value as any)}
                        >
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="openrouter">OpenRouter</option>
                            <option value="ollama">Ollama (Local)</option>
                        </select>
                    </div>

                    {provider !== 'ollama' && (
                        <>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <label className="text-right text-sm font-medium">API Key</label>
                                <Input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="col-span-3"
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <label className="text-right text-sm font-medium">Model</label>
                                <Input
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                    placeholder={
                                        provider === 'openai' ? 'gpt-4-turbo' :
                                            provider === 'anthropic' ? 'claude-3-opus-20240229' :
                                                provider === 'openrouter' ? 'anthropic/claude-3.5-sonnet' : 'Model ID'
                                    }
                                    className="col-span-3"
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <label className="text-right text-sm font-medium flex items-center justify-end gap-1">
                                    <Lock className="h-3 w-3" /> PIN
                                </label>
                                <div className="col-span-3">
                                    <Input
                                        type="password"
                                        value={pin}
                                        onChange={(e) => setPin(e.target.value)}
                                        placeholder="Session encryption PIN"
                                        maxLength={6}
                                    />
                                    <p className="text-[10px] text-muted-foreground mt-1">Used to encrypt your key locally.</p>
                                </div>
                            </div>
                        </>
                    )}

                    {provider === 'ollama' && (
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right text-sm font-medium">Model</label>
                            <Input
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                placeholder="llama3"
                                className="col-span-3"
                            />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button onClick={handleSave}>
                        {isSaved ? <><CheckCircle className="mr-2 h-4 w-4" /> Saved</> : "Save Settings"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
