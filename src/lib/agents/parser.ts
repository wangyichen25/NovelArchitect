/**
 * Utility functions for parsing LLM outputs.
 * LLMs are non-deterministic and may wrap JSON in markdown code fences or add conversational text.
 */

/**
 * Clean JSON text by removing markdown code fences and common formatting issues.
 * @param text Raw text output from LLM
 * @returns Cleaned text ready for JSON.parse
 */
export function cleanJSON(text: string): string {
    let cleaned = text.trim();

    // Remove markdown code fences (```json ... ``` or ``` ... ```)
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/i, '');

    // Try to extract JSON if there's conversational text before/after
    // Look for { ... } or [ ... ] patterns
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
        cleaned = jsonMatch[1];
    }

    // Fix invalid escape sequences (common in LLM output like \cite, \textbf, etc.)
    // Replace \ followed by a character that isn't a valid escape char with \\ (escaped backslash)
    // Valid JSON escapes: ", \, /, b, f, n, r, t, u
    cleaned = cleaned.replace(/\\(?![/\\bfnrtu"])/g, '\\\\');

    return cleaned.trim();
}

/**
 * Parse JSON with cleaning and error handling.
 * @param text Raw text output from LLM
 * @returns Parsed JSON object
 * @throws Error with helpful message if parsing fails
 */
export function parseJSON<T>(text: string): T {
    try {
        const cleaned = cleanJSON(text);
        return JSON.parse(cleaned) as T;
    } catch (error) {
        console.error('[Parser] Failed to parse JSON:', text);
        throw new Error(`Failed to parse LLM output as JSON: ${error instanceof Error ? error.message : String(error)}\n\nRaw output:\n${text.substring(0, 500)}...`);
    }
}

/**
 * Extract content between XML-style tags.
 * Example: extractContent(text, 'manuscript') extracts content from <manuscript>...</manuscript>
 * @param text Raw text
 * @param tag Tag name (without angle brackets)
 * @returns Extracted content or null if tag not found
 */
export function extractContent(text: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
}

/**
 * Safely extract a number from LLM output.
 * LLMs sometimes return "0.85" as a string instead of a number.
 * @param value Value from LLM output
 * @param defaultValue Default to return if parsing fails
 * @returns Number value
 */
export function parseNumber(value: any, defaultValue: number = 0): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }
    return defaultValue;
}

/**
 * Validate that a JSON object has required keys.
 * @param obj Object to validate
 * @param requiredKeys Array of required key names
 * @throws Error if any required key is missing
 */
export function validateKeys(obj: any, requiredKeys: string[]): void {
    const missing = requiredKeys.filter(key => !(key in obj));
    if (missing.length > 0) {
        throw new Error(`Missing required keys in LLM output: ${missing.join(', ')}. Got: ${JSON.stringify(Object.keys(obj))}`);
    }
}
