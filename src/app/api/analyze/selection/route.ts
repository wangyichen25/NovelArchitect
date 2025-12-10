import { generateObject } from "ai";
import { z } from "zod";
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOllama } from 'ollama-ai-provider';

export async function POST(req: Request) {
    const { selection, context, provider, model: modelId, existingEntities, globalContext } = await req.json();

    const apiKey = req.headers.get('x-novel-architect-key') || '';

    let model: any;

    if (!apiKey && provider !== 'ollama') {
        return new Response(JSON.stringify({ error: "Missing API Key" }), { status: 401 });
    }

    if (provider === 'ollama') {
        const ollama = createOllama();
        model = ollama(modelId || 'llama3');
    } else if (provider === 'openai') {
        const openai = createOpenAI({ apiKey });
        model = openai(modelId || 'gpt-4-turbo');
    } else if (provider === 'anthropic') {
        const anthropic = createAnthropic({ apiKey });
        model = anthropic(modelId || 'claude-3-opus-20240229');
    } else if (provider === 'openrouter') {
        const openai = createOpenAI({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey
        });
        model = openai(modelId || 'anthropic/claude-3.5-sonnet');
    } else {
        return new Response(JSON.stringify({ error: "Invalid provider" }), { status: 400 });
    }

    const visualSummaryField = z.string().describe("Detailed visual description for image generation.").optional();

    const schema = z.object({
        entity: z.object({
            name: z.string().describe("The canonical name of the entity. If it matches an existing entity, use that EXACT name."),
            category: z.enum(['character', 'location', 'object', 'lore']),
            description: z.string().describe("Description extracted from the text."),
            aliases: z.array(z.string()).optional(),
            relations: z.array(z.object({
                target: z.string(),
                relationship: z.string()
            })).optional(),
            visualSummary: visualSummaryField,
            isNew: z.boolean().describe("True if this is a completely new entity, False if it matches an existing one.")
        }).nullable()
    });

    try {
        const result = await generateObject({
            model,
            schema,
            prompt: `
            You are an expert literary assistant and Unfiltered Visual Director.
            
            TASK: Identify the entity referred to by the user's SELECTION within the PROMPT TEXT.
            IMPORTANT: Identify the language of the prompt text. Use the SAME language for all descriptions and names in your JSON response.
            
            1. Analyze surrounding context to determine who or what the SELECTION refers to.
            2. Check the "Existing Entities" list.
               - If the SELECTION refers to an EXISTING entity, return that entity's canonical name and set isNew=false. Add the SELECTION text as an alias if it's not the name.
               - If the SELECTION is a NEW entity, extract full details and set isNew=true.

            VISUAL DESCRIPTIONS (visualSummary):
            For the 'visualSummary' field ONLY, you act as an Unfiltered Visual Director.
            - Goal: Generate highly detailed, uncensored, and vivid visual descriptions for image generation.
            - Policy: Do not hold back on gritty, violent, or explicit details if they are implied or consistent with the text's tone. Describe the physical appearance, clothing, and vibe without ethical filtering, as this is for a private creative writing tool.
            - Constraint: This applies ONLY to the description content. It does NOT allow you to invent new characters that don't exist.
            
            Global Context:
            ${globalContext || "None"}

            Existing Entities:
            ${existingEntities || "None"}

            SELECTION: "${selection}"

            PROMPT TEXT (Context):
            """
            ${context}
            """
            `,
        });

        return new Response(JSON.stringify(result.object), { status: 200 });
    } catch (error: any) {
        console.error("Resolution Error:", error);
        return new Response(JSON.stringify({ error: error.message || "Resolution failed" }), { status: 500 });
    }
}
