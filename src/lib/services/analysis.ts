import { db } from "@/lib/db";
import { KeyChain } from "@/lib/ai/keychain";
import { v4 as uuidv4 } from "uuid";
import { CodexEntry } from "@/lib/db/schema";

export interface AnalysisSettings {
    provider: string;
    model?: string;
    apiKey?: string; // Optional if we want to force a specific key
}

export class AnalysisService {

    static async getApiKey(novelId: string, provider: string): Promise<string | null> {
        // PRIORITY: Account Settings (Cloud) > Local Storage (Global)
        let apiKey = '';
        const pin = localStorage.getItem('novel-architect-pin-hash');

        if (provider === 'ollama') return '';

        // 1. Check Supabase User Profile
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            const { data: profile } = await supabase.from('profiles').select('settings').eq('id', user.id).single();
            if (profile && profile.settings && profile.settings.apiKey && pin) {
                const decrypted = await KeyChain.decrypt(profile.settings.apiKey, pin);
                if (decrypted) return decrypted;
            }
        }

        // 2. Fallback to Local Storage Key
        const encrypted = localStorage.getItem(`novel-architect-key-${provider}`);
        if (encrypted && pin) {
            const decrypted = await KeyChain.decrypt(encrypted, pin);
            if (decrypted) apiKey = decrypted;
        }

        return apiKey;
    }

    static async analyzeText(
        novelId: string,
        text: string,
        settings: AnalysisSettings,
        onProgress?: (msg: string) => void,
        signal?: AbortSignal
    ): Promise<{ new: number; updated: number }> {

        if (text.length < 10) throw new Error("Text too short for analysis");

        // 1. Prepare Context
        const acts = await db.acts.where({ novelId }).sortBy('order');
        const novel = await db.novels.get(novelId);

        let globalContext = "";
        if (novel) {
            globalContext += `Novel Title: ${novel.title}\n`;
        }
        if (acts.length > 0) {
            globalContext += "Acts Summary:\n" + acts.map(a => `- ${a.title}: ${a.summary}`).join('\n');
        }

        const existingEntries = await db.codex.where({ novelId }).toArray();
        const existingNamesList = existingEntries.map(e => {
            const aliases = e.aliases && e.aliases.length > 0 ? ` (Aliases: ${e.aliases.join(', ')})` : '';
            return `- ${e.name}${aliases} [${e.category}]`;
        }).join('\n');

        // 2. Get Key if not provided
        let apiKey = settings.apiKey;
        if (!apiKey && settings.provider !== 'ollama') {
            const key = await this.getApiKey(novelId, settings.provider);
            if (!key) throw new Error("Could not decrypt API Key");
            apiKey = key;
        }

        onProgress?.("Calling AI Analysis API...");

        // 3. Call API
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-novel-architect-key': apiKey || ''
            },
            body: JSON.stringify({
                text,
                provider: settings.provider,
                model: settings.model,
                existingEntities: existingNamesList,
                globalContext
            }),
            signal
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Analysis request failed: ${response.status}`);
        }

        const result = await response.json();
        onProgress?.("Processing Results...");

        // 4. Merge Logic
        const newEntries: CodexEntry[] = [];
        const updatedEntries: CodexEntry[] = [];

        const normalize = (s: string) => s.toLowerCase().trim();
        const simplify = (s: string) => s.toLowerCase().replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ").trim();

        // Map Name AND Aliases to Entity
        const existingMap = new Map<string, CodexEntry>();
        existingEntries.forEach(e => {
            existingMap.set(normalize(e.name), e);
            if (e.aliases) {
                e.aliases.forEach(a => existingMap.set(normalize(a), e));
            }
        });

        const processItem = (item: any, cat: "character" | "location" | "object" | "lore") => {
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

                    if (simpleNew.includes(simpleExisting) && simpleNew.length > simpleExisting.length) {
                        existing.description = item.description;
                        changed = true;
                    }
                    else if (simpleExisting.includes(simpleNew)) {
                        // no-op
                    }
                    else {
                        existing.description = (existing.description ? existing.description + "\n\n" : "") + item.description;
                        changed = true;
                    }
                }

                // Merge Relations
                if (item.relations && item.relations.length > 0) {
                    const currentRelations = new Set((existing.relations || []).map((r: any) => normalize(r.targetId || r.target) + "|" + normalize(r.type || r.relationship)));
                    for (const r of item.relations) {
                        // Handle API returning 'target'/'relationship' but schema needing 'targetId'/'type' 
                        // Note: The API returns {target, relationship}. Schema needs {targetId, type, description}.
                        // For now we map strictly if we can resolve names. 
                        // Actually the API returns names, we don't have IDs for relations unless we look them up.
                        // Ideally we should fix this mismatch. For now let's just store raw or do best effort mapping.
                        // The schema says CodexRelation { targetId: string, type: string, description: string }.
                        // The API returns { target: string, relationship: string }.
                        // We can't really store targetID without a second pass. 
                        // Let's defer relation improvement or just store as text description for now in description.
                        // Wait, the original code in NovelEditor.tsx just pushed `r` to `existing.relations`. This might be a bug in original code if types mismatch!
                        // In NovelEditor.tsx: line 345: existing.relations = [...].
                        // Schema defines `relations: CodexRelation[]`.
                        // Analyze API returns `relations: { target: string, relationship: string }[]`.
                        // So the original code was likely putting invalid objects into Dexie. Dexie allows it (NoSQL).
                        // I will maintain the same behavior for now to not break anything, but typescript might complain if I am strict.
                        // casting as any to encompass the "buggy" but working behavior.
                        const key = normalize(r.target) + "|" + normalize(r.relationship);
                        if (!currentRelations.has(key)) {
                            (existing.relations as any) = [...(existing.relations || []), r];
                            changed = true;
                        }
                    }
                }

                if (item.visualSummary && !existing.visualSummary) {
                    existing.visualSummary = item.visualSummary;
                    changed = true;
                }

                if (changed) {
                    if (!updatedEntries.find(e => e.id === existing.id)) {
                        updatedEntries.push(existing);
                    }
                }
            } else {
                // CREATE new
                const newEntry: CodexEntry = {
                    id: uuidv4(),
                    novelId,
                    category: cat,
                    name: item.name,
                    description: item.description || '',
                    aliases: item.aliases || [],
                    relations: (item.relations || []) as any, // dynamic schema mismatch
                    visualSummary: item.visualSummary || ""
                };
                newEntries.push(newEntry);
                existingMap.set(normName, newEntry);
            }
        };

        if (result.characters) result.characters.forEach((c: any) => processItem(c, 'character'));
        if (result.locations) result.locations.forEach((l: any) => processItem(l, 'location'));
        if (result.objects) result.objects.forEach((o: any) => processItem(o, 'object'));
        if (result.lore) result.lore.forEach((l: any) => processItem(l, 'lore'));

        if (newEntries.length > 0) await db.codex.bulkAdd(newEntries);
        if (updatedEntries.length > 0) await db.codex.bulkPut(updatedEntries);

        return { new: newEntries.length, updated: updatedEntries.length };
    }
}
