
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjectStore } from "@/hooks/useProject";
import { KeyChain } from "@/lib/ai/keychain";
import { createClient } from "@/lib/supabase/client"; // [NEW] Sync support
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
    const [isLoading, setIsLoading] = useState(false);

    // [NEW] Attempt to get current novel context just for UI labeling, not logic
    const params = useParams();
    const novelId = params?.id as string | undefined;

    useEffect(() => {
        if (isOpen) {
            loadSettings();
        }
    }, [isOpen]);

    const loadSettings = async () => {
        setIsLoading(true);
        try {
            // 1. Check Supabase (Cloud) if logged in
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                const { data: profile } = await supabase.from('profiles').select('settings').eq('id', user.id).single();
                if (profile && profile.settings) {
                    const s = profile.settings;
                    if (s.provider) setProvider(s.provider);
                    if (s.model) setModel(s.model);
                    // Encrypted Key
                    if (s.apiKey) {
                        const storedPin = localStorage.getItem('novel-architect-pin-hash');
                        if (storedPin) {
                            setPin(storedPin);
                            const decrypted = await KeyChain.decrypt(s.apiKey, storedPin);
                            if (decrypted) setApiKey(decrypted);
                        }
                    }
                    setIsLoading(false);
                    return; // Loaded from Cloud
                }
            }

            // 2. Fallback to LocalStorage (Global)
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
                        const decrypted = await KeyChain.decrypt(encrypted, storedPin);
                        if (decrypted) setApiKey(decrypted);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load settings:", e);
        } finally {
            setIsLoading(false);
        }
    };

    // Update model input when provider changes
    useEffect(() => {
        // logic to reset model or load default if provider switches?
        // keep simple for now
    }, [provider]);

    const handleSave = async () => {
        setIsLoading(true);
        try {
            let encryptedKey = "";

            // 1. Encrypt Key if needed
            if (provider !== 'ollama') {
                if (!apiKey || !pin) {
                    alert("API Key and PIN are required for cloud providers.");
                    setIsLoading(false);
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

            // Update Global Store for immediate UI reaction
            useProjectStore.getState().setActiveAiModel(model);

            // 2. Save to Supabase (Sync)
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                const settingsPayload = {
                    provider,
                    model,
                    apiKey: encryptedKey || undefined,
                    lastModified: Date.now()
                };

                const { error } = await supabase.from('profiles').upsert({
                    id: user.id,
                    settings: settingsPayload,
                    updated_at: new Date().toISOString()
                });

                if (error) {
                    console.error("Cloud Save Error:", error);
                    if (error.code === '42P01') {
                        alert("Settings saved locally! (Cloud sync failed: Profiles table missing)");
                    }
                }
            }

            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 2000);
            setTimeout(() => setIsOpen(false), 1000);
        } catch (e) {
            console.error("Save failed", e);
            alert("Failed to save settings.");
        } finally {
            setIsLoading(false);
        }
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
                    <DialogTitle>Global AI Settings</DialogTitle>
                    <DialogDescription>
                        Configure your AI provider and API keys.
                        settings are synced to your account.
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
                            disabled={isLoading}
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
                                    disabled={isLoading}
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
                                    disabled={isLoading}
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
                                        disabled={isLoading}
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
                                disabled={isLoading}
                            />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={isLoading}>
                        {isSaved ? <><CheckCircle className="mr-2 h-4 w-4" /> Saved</> : isLoading ? "Saving..." : "Save Settings"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
