
import { streamText } from "ai";

export async function POST(req: Request) {
    const { messages, provider, context, model: modelId } = await req.json();

    // 1. Get Key from Headers
    const apiKey = req.headers.get('x-novel-architect-key');

    // 2. Instantiate Model (Simplified Factory)
    let model;
    try {
        const providerName = provider || 'openai';
        if (providerName === 'openai') {
            const { createOpenAI } = await import('@ai-sdk/openai');
            // Use the provided key or fall back to env var if we were server-side
            const openai = createOpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY || '' });
            model = openai(modelId || 'gpt-4-turbo');
        } else if (providerName === 'anthropic') {
            const { createAnthropic } = await import('@ai-sdk/anthropic');
            const anthropic = createAnthropic({ apiKey: apiKey || '' });
            model = anthropic(modelId || 'claude-3-opus-20240229');
        } else if (providerName === 'openrouter') {
            const { createOpenAI } = await import('@ai-sdk/openai');
            const openrouter = createOpenAI({
                apiKey: apiKey || '',
                baseURL: 'https://openrouter.ai/api/v1',
            });
            // Default to a good model on OpenRouter, e.g. hermes or claude
            model = openrouter(modelId || 'anthropic/claude-3.5-sonnet');
        } else if (providerName === 'ollama') {
            const { createOllama } = await import('ollama-ai-provider');
            const ollama = createOllama();
            model = ollama(modelId || 'llama3');
        }
    } catch (e) {
        return new Response("Provider Error", { status: 500 });
    }

    // 3. Inject Context
    // The 'context' string comes from the Client Orchestrator.
    // We prepend it as a System Message.
    const allMessages = [
        { role: 'system', content: context || 'You are a helpful assistant.' },
        ...messages
    ];

    const result = streamText({
        model: model as any,
        messages: allMessages,
    });

    return result.toDataStreamResponse();
}
