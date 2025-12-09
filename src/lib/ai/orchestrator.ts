
import { AhoCorasick } from './scanner';
import { db } from '@/lib/db';
import { Scene, CodexEntry } from '@/lib/db/schema';

export class Orchestrator {
    private scanner: AhoCorasick | null = null;
    private codex: CodexEntry[] = [];

    async initialize(novelId: string) {
        this.codex = await db.codex.where('novelId').equals(novelId).toArray();
        const keywords = this.codex.map(e => [e.name, ...e.aliases]).flat();
        this.scanner = new AhoCorasick(keywords);
    }

    async assemblePrompt(scene: Scene, history: string, instruction: string) {
        if (!this.scanner) throw new Error("Orchestrator not initialized");

        // 1. Scan for keywords in current scene content + instruction
        // In a real app we'd parse Tiptap JSON to text. For now assuming text.
        const combinedText = instruction + " " + JSON.stringify(scene.content);
        const matches = this.scanner.search(combinedText);

        // 2. Retrieve relevant Codex entries
        const relevantEntries = this.codex.filter(e =>
            matches.includes(e.name) || e.aliases.some(a => matches.includes(a))
        );

        // 3. Build Prompt
        let prompt = `You are an expert novelist helper.\n\n`;

        if (relevantEntries.length > 0) {
            prompt += `## Context (Codex)\n`;
            relevantEntries.forEach(e => {
                prompt += `- **${e.name}** (${e.category}): ${e.description}\n`;
            });
            prompt += `\n`;
        }

        if (history) {
            prompt += `## Story So Far\n${history.slice(-2000)}\n\n`; // Simple truncation
        }

        prompt += `## Current Scene Context\n`;
        prompt += `POV: ${scene.metadata.povCharacterId || 'Unknown'}\n`;
        prompt += `Time: ${scene.metadata.timeOfDay}\n\n`;

        prompt += `## Instruction\n${instruction}`;

        return prompt;
    }
}
