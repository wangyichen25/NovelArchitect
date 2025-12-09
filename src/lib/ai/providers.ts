
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOllama } from 'ollama-ai-provider';
import { KeyChain } from './keychain';

// We need to install @ai-sdk/openai @ai-sdk/anthropic ollama-ai-provider
// I will run npm install for these next.

export class AIProviderFactory {
    static async getModel(provider: string, pin: string) {
        if (provider === 'ollama') {
            const ollama = createOllama();
            return ollama('llama3'); // Default to llama3 for now, make configurable later
        }

        // Retrieve key
        const encryptedKey = localStorage.getItem(`novel-architect-key-${provider}`);
        if (!encryptedKey) throw new Error(`No API key found for ${provider}`);

        const apiKey = await KeyChain.decrypt(encryptedKey, pin);
        if (!apiKey) throw new Error("Failed to decrypt API key. Invalid PIN?");

        if (provider === 'openai') {
            const openai = createOpenAI({ apiKey });
            return openai('gpt-4-turbo');
        }

        if (provider === 'anthropic') {
            const anthropic = createAnthropic({ apiKey });
            return anthropic('claude-3-opus-20240229');
        }

        throw new Error("Unknown provider");
    }
}
