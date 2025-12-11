
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjectStore } from "@/hooks/useProject";
import { KeyChain } from "@/lib/ai/keychain";
import { createClient } from "@/lib/supabase/client"; // [NEW] Sync support
import { Settings, Lock, Key, CheckCircle, Star, Trash2, ChevronDown } from "lucide-react";
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
    const [savedModels, setSavedModels] = useState<Record<string, string>>({}); // [NEW] Map of provider -> modelID
    const [modelPresets, setModelPresets] = useState<Record<string, string[]>>({}); // [NEW] Map of provider -> list of saved models
    const [isPresetOpen, setIsPresetOpen] = useState(false); // Helper for custom dropdown
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

                    // Load models map if exists
                    const loadedModels = s.models || {};
                    setSavedModels(loadedModels);

                    // Load presets
                    if (s.saved_models) {
                        setModelPresets(s.saved_models);
                    }

                    // Set current model based on provider preference
                    if (loadedModels[s.provider]) {
                        setModel(loadedModels[s.provider]);
                    } else if (s.model) {
                        // Legacy fallback
                        setModel(s.model);
                        setSavedModels(prev => ({ ...prev, [s.provider]: s.model }));
                    }

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
        // If we have a saved model for this provider, switch to it explicitly
        if (savedModels[provider]) {
            setModel(savedModels[provider]);
        } else {
            // Try to load from local storage if not in memory (for first load fallback scenarios)
            const local = localStorage.getItem(`novel-architect-model-${provider}`);
            if (local) {
                setModel(local);
                setSavedModels(prev => ({ ...prev, [provider]: local }));
            } else {
                setModel(""); // Or set default?
            }
        }
    }, [provider, savedModels]);

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
                // Merge current model into saved map
                const updatedModels = { ...savedModels, [provider]: model };
                setSavedModels(updatedModels); // Update state

                const settingsPayload = {
                    provider,
                    models: updatedModels, // Persist map
                    saved_models: modelPresets, // Persist bookmarks
                    model, // Keep legacy field for now
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
                                <div className="col-span-3 flex gap-2 relative">
                                    <div className="relative flex-1">
                                        <Input
                                            value={model}
                                            onChange={(e) => setModel(e.target.value)}
                                            placeholder={
                                                provider === 'openai' ? 'gpt-4-turbo' :
                                                    provider === 'anthropic' ? 'claude-3-opus-20240229' :
                                                        provider === 'openrouter' ? 'anthropic/claude-3.5-sonnet' : 'Model ID'
                                            }
                                            className="w-full pr-8"
                                            disabled={isLoading}
                                        />
                                        <div className="absolute right-1 top-1/2 -translate-y-1/2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => setIsPresetOpen(!isPresetOpen)}
                                                tabIndex={-1}
                                            >
                                                <ChevronDown className="h-4 w-4 opacity-50" />
                                            </Button>
                                        </div>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        title={modelPresets[provider]?.includes(model) ? "Remove from bookmarks" : "Bookmark this model"}
                                        onClick={() => {
                                            const currentList = modelPresets[provider] || [];
                                            let newList;
                                            if (currentList.includes(model)) {
                                                newList = currentList.filter(m => m !== model);
                                            } else {
                                                if (!model) return;
                                                newList = [...currentList, model];
                                            }
                                            setModelPresets({ ...modelPresets, [provider]: newList });
                                        }}
                                        disabled={!model}
                                    >
                                        <Star className={`h-4 w-4 ${modelPresets[provider]?.includes(model) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                                    </Button>

                                    {/* Presets Dropdown */}
                                    {isPresetOpen && (
                                        <div className="absolute top-full left-0 w-[calc(100%-3rem)] mt-1 z-50 bg-popover border rounded-md shadow-lg p-1 animate-in fade-in zoom-in-95">
                                            <div className="text-xs font-semibold px-2 py-1 text-muted-foreground">Saved Models</div>
                                            {(!modelPresets[provider] || modelPresets[provider].length === 0) && (
                                                <div className="px-2 py-2 text-sm text-muted-foreground italic">No bookmarks yet.</div>
                                            )}
                                            {modelPresets[provider]?.map((m) => (
                                                <div key={m} className="flex items-center justify-between hover:bg-accent rounded px-2 py-1 cursor-pointer group">
                                                    <span
                                                        className="text-sm truncate flex-1"
                                                        onClick={() => {
                                                            setModel(m);
                                                            setIsPresetOpen(false);
                                                        }}
                                                    >
                                                        {m}
                                                    </span>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const newList = (modelPresets[provider] || []).filter(x => x !== m);
                                                            setModelPresets({ ...modelPresets, [provider]: newList });
                                                        }}
                                                    >
                                                        <Trash2 className="h-3 w-3 text-destructive" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
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
