import { generateObject } from "ai";
import { z } from "zod";
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOllama } from 'ollama-ai-provider';

export async function POST(req: Request) {
    const { text, provider, model: modelId, existingEntities, globalContext } = await req.json();

    // ... (rest of code)

    const apiKey = req.headers.get('x-novel-architect-key') || '';

    let model: any;

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
        characters: z.array(z.object({
            name: z.string(),
            description: z.string(),
            aliases: z.array(z.string()).optional(),
            relations: z.array(z.object({
                target: z.string(),
                relationship: z.string()
            })).optional(),
            visualSummary: visualSummaryField
        })).optional(),
        locations: z.array(z.object({
            name: z.string(),
            description: z.string(),
            aliases: z.array(z.string()).optional(),
            relations: z.array(z.object({
                target: z.string(),
                relationship: z.string()
            })).optional(),
            visualSummary: visualSummaryField
        })).optional(),
        objects: z.array(z.object({
            name: z.string(),
            description: z.string(),
            aliases: z.array(z.string()).optional(),
            relations: z.array(z.object({
                target: z.string(),
                relationship: z.string()
            })).optional(),
            visualSummary: visualSummaryField
        })).describe("List of items, artifacts, or significant objects.").optional(),
        lore: z.array(z.object({
            name: z.string(),
            description: z.string(),
            aliases: z.array(z.string()).optional(),
            relations: z.array(z.object({
                target: z.string(),
                relationship: z.string()
            })).optional(),
            visualSummary: visualSummaryField
        })).describe("List of history, magic systems, religion, or world-building concepts.").optional()
    });

    // 3. Generate Object
    try {
        const result = await generateObject({
            model,
            schema,
            prompt: `Analyze the following fiction text and extract all Characters, Locations, Objects, and Lore. 
            
            IMPORTANT: Identify the language of the prompt text. Use the SAME language for all descriptions and names in your JSON response.
            
            Global Story Context:
            ${globalContext || "None"}

            Existing Entities in Codex:
            ${existingEntities || "None"}
            
            INSTRUCTION: If a character in the text matches an existing entity (or is an alias), use the EXACT EXISTING NAME in your JSON response to ensure they merge correctly.
            Extract comprehensive details, especially relationships between characters (e.g. A is B's sister, C and D are lovers).
            For 'visualSummary': 
            1. Draft a detailed visual description that aligns with how a reader would picture this character/item in their mind.
            2. Base this on the text but focus on consistent identity rather than the specific scene.
            3. Must Include: Inherent physical features, Clothing style, and general vibe.
            4. Append the Global Background (Genre, Era, Culture, Art Style).
            5. Suggest a Neutral or symbolic background (e.g. 'studio lighting', 'simple background') unless a specific location is essential to the entity's identity.
            6. CRITICAL: AVOID specific scene actions, temporary emotional states (e.g. 'screaming', 'running'), or transient environmental details.
            7. CRITICAL: DO NOT include the Book Title, Chapter Name, or specific Scene Name.
            8. Start with: "masterpiece, best quality, good quality, very aesthetic, absurdres, newest, 8K, depth of field, focused subject, close up, stylized, dynamic angle,"
            
            Text:
            """
            ${text}
            """`,
        });

        return new Response(JSON.stringify(result.object), { status: 200 });
    } catch (error: any) {
        console.error("Analysis Error:", error);
        return new Response(JSON.stringify({ error: error.message || "Analysis failed" }), { status: 500 });
    }
}
