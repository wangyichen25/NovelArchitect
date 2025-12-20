
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOllama } from 'ollama-ai-provider';

// We need to install @ai-sdk/openai @ai-sdk/anthropic ollama-ai-provider
// I will run npm install for these next.

export class AIProviderFactory {
    static async getModel(provider: string) {
        if (provider === 'ollama') {
            const ollama = createOllama();
            return ollama('llama3'); // Default to llama3 for now, make configurable later
        }

        // Retrieve key
        const apiKey = localStorage.getItem(`novel-architect-key-${provider}`);
        if (!apiKey) throw new Error(`No API key found for ${provider}`);

        if (provider === 'openai') {
            const openai = createOpenAI({ apiKey });
            return openai('gpt-4-turbo');
        }

        if (provider === 'anthropic') {
            const anthropic = createAnthropic({ apiKey });
            return anthropic('claude-3-opus-20240229');
        }

        if (provider === 'openrouter') {
            // OpenRouter uses the OpenAI SDK with a custom baseURL
            const openrouter = createOpenAI({
                apiKey,
                baseURL: 'https://openrouter.ai/api/v1'
            });
            // Get the model from localStorage (provider-specific key) or use a default
            const model = typeof window !== 'undefined'
                ? localStorage.getItem(`novel-architect-model-${provider}`) || 'openai/gpt-4-turbo-preview'
                : 'openai/gpt-4-turbo-preview';
            return openrouter(model);
        }

        throw new Error("Unknown provider");
    }
}
