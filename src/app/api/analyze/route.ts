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

    const schema = z.object({
        characters: z.array(z.object({
            name: z.string(),
            description: z.string(),
            aliases: z.array(z.string()).optional(),
            relations: z.array(z.object({
                target: z.string(),
                relationship: z.string()
            })).optional(),
            visualSummary: z.string().describe("Extracted sentences from the original text that describe visual appearance.").optional()
        })).optional(),
        locations: z.array(z.object({
            name: z.string(),
            description: z.string(),
            aliases: z.array(z.string()).optional(),
            relations: z.array(z.object({
                target: z.string(),
                relationship: z.string()
            })).optional(),
            visualSummary: z.string().describe("Extracted sentences from the original text that describe visual appearance.").optional()
        })).optional(),
        objects: z.array(z.object({
            name: z.string(),
            description: z.string(),
            aliases: z.array(z.string()).optional(),
            relations: z.array(z.object({
                target: z.string(),
                relationship: z.string()
            })).optional(),
            visualSummary: z.string().describe("Extracted sentences from the original text that describe visual appearance.").optional()
        })).describe("List of items, artifacts, or significant objects.").optional(),
        lore: z.array(z.object({
            name: z.string(),
            description: z.string(),
            aliases: z.array(z.string()).optional(),
            relations: z.array(z.object({
                target: z.string(),
                relationship: z.string()
            })).optional(),
            visualSummary: z.string().describe("Extracted sentences from the original text that describe visual appearance.").optional()
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
            2. Base this firmly on the text but synthesize it into a vivid, cohesive scene.
            3. Must Include: Physical features, Clothing, Scene Environment, Lighting, and the current Act/Story Context (e.g. 'tense standoff', 'joyful reunion').
            4. Append the Global Background (Genre, Era, Culture, Art Style).
            5. CRITICAL: DO NOT include the Book Title, Chapter Name, or specific Scene Name.
            6. Start with: "Create image based on text: "
            
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
