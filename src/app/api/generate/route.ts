
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOllama } from 'ollama-ai-provider';

export async function POST(req: Request) {
    try {
        const { prompt, context, model, provider, instruction, apiKey } = await req.json();

        // Configure Provider
        let modelInstance: any;

        if (provider === 'anthropic') {
            const anthropic = createAnthropic({ apiKey });
            modelInstance = anthropic(model || 'claude-3-5-sonnet-20240620');
        } else if (provider === 'ollama') {
            const ollama = createOllama();
            modelInstance = ollama(model || 'llama3');
        } else if (provider === 'openrouter') {
            const openai = createOpenAI({
                apiKey,
                baseURL: 'https://openrouter.ai/api/v1',
            });
            modelInstance = openai(model || 'anthropic/claude-3.5-sonnet');
        } else {
            const openai = createOpenAI({ apiKey });
            modelInstance = openai(model || 'gpt-4o');
        }

        // Construct System Prompt
        const systemPrompt = `You are an expert fiction co-author. 
        Your task is to write high-quality prose based on the user's instruction.
        Maintain a consistent tone and style matching the existing context.
        Do not output conversational filler (e.g. "Here is the text"). Just write the novel content.`;

        const { text } = await generateText({
            model: modelInstance,
            system: systemPrompt,
            prompt: `
            CONTEXT (Preceding text):
            "${context}"
            
            INSTRUCTION:
            ${instruction}
            
            ${prompt ? `USER INPUT: ${prompt}` : ''}
            `,
        });

        return Response.json({ text });

    } catch (error: any) {
        console.error("Generate Error:", error);
        // Extract useful error info if available
        const status = error.statusCode || 500;
        // AI SDK errors often hide the real message in `cause` or `data`, but `message` is usually decent.
        // For OpenAI 401, the message is "Incorrect API key provided..."
        const message = error.message || "Failed to generate text";

        return Response.json({ error: message }, { status });
    }
}
