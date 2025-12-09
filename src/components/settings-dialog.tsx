
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjectStore } from "@/hooks/useProject";
import { KeyChain } from "@/lib/ai/keychain";
import { Settings, Lock, Key, CheckCircle } from "lucide-react";

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
    }, []);

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
    };

    return (
        <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm max-w-md">
            <h3 className="font-bold flex items-center mb-4"><Settings className="mr-2 h-4 w-4" /> AI Settings (BYOK)</h3>

            <div className="space-y-4">
                <div>
                    <label className="text-sm font-medium">Provider</label>
                    <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
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
                        <div>
                            <label className="text-sm font-medium">API Key</label>
                            <Input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="sk-..."
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Model</label>
                            <Input
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                placeholder={
                                    provider === 'openai' ? 'gpt-4-turbo' :
                                        provider === 'anthropic' ? 'claude-3-opus-20240229' :
                                            provider === 'openrouter' ? 'anthropic/claude-3.5-sonnet' : 'Model ID'
                                }
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium flex items-center">
                                <Lock className="mr-1 h-3 w-3" /> Session PIN
                            </label>
                            <Input
                                type="password"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                placeholder="Enter a PIN to encrypt your key locally"
                                maxLength={6}
                            />
                            <p className="text-xs text-muted-foreground mt-1">We don't store your key plain text.</p>
                        </div>
                    </>
                )}

                {provider === 'ollama' && (
                    <div>
                        <label className="text-sm font-medium">Model</label>
                        <Input
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            placeholder="llama3"
                        />
                    </div>
                )}

                <Button onClick={handleSave} className="w-full">
                    {isSaved ? <><CheckCircle className="mr-2 h-4 w-4" /> Saved</> : "Save Settings"}
                </Button>
            </div>
        </div>
    );
}
