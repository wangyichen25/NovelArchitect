
"use client";

import { useState, useEffect } from "react";
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

    useEffect(() => {
        const storedProvider = localStorage.getItem('novel-architect-provider') as any;
        if (storedProvider) setProvider(storedProvider);

        // Load Model for provider
        const storedModel = localStorage.getItem(`novel-architect-model-${storedProvider || 'openai'}`);
        if (storedModel) setModel(storedModel);

        const storedPin = localStorage.getItem('novel-architect-pin-hash');
        if (storedPin) {
            setPin(storedPin);
            // Try to auto-decrypt if we have a provider set (or the one we just loaded)
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
    }, [isOpen]); // Reload when opened to ensure fresh state if changed elsewhere

    // Also update API key field when provider changes if we have a saved key for it
    useEffect(() => {
        if (provider === 'ollama') return;
        const encrypted = localStorage.getItem(`novel-architect-key-${provider}`);
        if (encrypted && pin) {
            KeyChain.decrypt(encrypted, pin).then(decrypted => {
                if (decrypted) setApiKey(decrypted);
                else setApiKey(""); // Failed to decrypt or no key
            });
        }
    }, [provider, pin]);

    // Load model when provider changes to show correct saved value
    useEffect(() => {
        const savedModel = localStorage.getItem(`novel-architect-model-${provider}`);
        setModel(savedModel || "");
    }, [provider]);

    const handleSave = async () => {
        if (provider !== 'ollama') {
            if (!apiKey || !pin) {
                alert("API Key and PIN are required for cloud providers.");
                return;
            }
            const encrypted = await KeyChain.encrypt(apiKey, pin);
            localStorage.setItem(`novel-architect-key-${provider}`, encrypted);
            localStorage.setItem(`novel-architect-pin-hash`, pin); // Insecure, just for demo matching
        }
        localStorage.setItem(`novel-architect-model-${provider}`, model);
        localStorage.setItem('novel-architect-provider', provider);
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
                    <DialogTitle>AI Settings (BYOK)</DialogTitle>
                    <DialogDescription>
                        Configure your AI provider and API keys. Keys are stored locally in your browser.
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
