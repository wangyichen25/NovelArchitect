/**
 * JSON Parsing and Validation Utilities
 */

/**
 * Clean raw LLM output to extract JSON.
 * Handles markdown code blocks and surrounding text.
 */
export function cleanJSON(text: string): string {
    let clean = text.trim();

    // Remove markdown code blocks
    if (clean.includes('```json')) {
        clean = clean.split('```json')[1];
        if (clean.includes('```')) {
            clean = clean.split('```')[0];
        }
    } else if (clean.includes('```')) {
        // Fallback for generic code blocks
        clean = clean.split('```')[1];
        if (clean.includes('```')) {
            clean = clean.split('```')[0];
        }
    }

    return clean.trim();
}

/**
 * Parse JSON from string, robustly handling common LLM formatting issues.
 */
export function parseJSON<T>(text: string): T {
    try {
        const cleaned = cleanJSON(text);
        return JSON.parse(cleaned) as T;
    } catch (error) {
        // Initial parse failed, try recovery strategies before logging error

        // Strategy 1: Find first '{' and try to find matching '}'
        const first = text.indexOf('{');
        if (first >= 0) {
            // Try to find a valid JSON by matching braces
            let depth = 0;
            let inString = false;
            let escape = false;

            for (let i = first; i < text.length; i++) {
                const char = text[i];

                if (escape) {
                    escape = false;
                    continue;
                }

                if (char === '\\' && inString) {
                    escape = true;
                    continue;
                }

                if (char === '"' && !escape) {
                    inString = !inString;
                    continue;
                }

                if (!inString) {
                    if (char === '{') depth++;
                    if (char === '}') {
                        depth--;
                        if (depth === 0) {
                            // Found complete JSON object
                            const candidate = text.substring(first, i + 1);
                            try {
                                return JSON.parse(candidate) as T;
                            } catch {
                                // Continue looking for another valid JSON
                            }
                        }
                    }
                }
            }
        }

        // Strategy 2: Fix unescaped backslashes in JSON strings (common with LaTeX)
        // This handles cases like \section, \textit, etc. that LLMs output without escaping
        try {
            const last = text.lastIndexOf('}');
            if (first >= 0 && last > first) {
                let sub = text.substring(first, last + 1);
                // Escape backslashes that are not already escaped and not valid JSON escapes
                // Valid JSON escapes: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
                sub = sub.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
                return JSON.parse(sub) as T;
            }
        } catch {
            // Ignore
        }

        // Strategy 3: Simple first '{' to last '}' fallback without escape fixing
        try {
            const last = text.lastIndexOf('}');
            if (first >= 0 && last > first) {
                const sub = text.substring(first, last + 1);
                return JSON.parse(sub) as T;
            }
        } catch {
            // Ignore
        }

        // All recovery strategies failed - log the error now
        console.error('JSON Parse Error - all recovery strategies failed. Raw text:', text);
        throw new Error(`Failed to parse JSON response: ${(error as Error).message}`);
    }
}

/**
 * Validate that an object contains required keys.
 */
export function validateKeys(obj: any, requiredKeys: string[]): void {
    if (!obj || typeof obj !== 'object') {
        throw new Error('Output is not an object');
    }

    const missing = requiredKeys.filter(key => !(key in obj));
    if (missing.length > 0) {
        throw new Error(`Missing required keys: ${missing.join(', ')}`);
    }
}

/**
 * Parse a number safely, returning default if invalid.
 */
export function parseNumber(value: any, defaultValue: number): number {
    const n = parseFloat(value);
    return isNaN(n) ? defaultValue : n;
}
