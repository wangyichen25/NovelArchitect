/**
 * Citation Generator Agent - Generates/Formats citations for a specific target.
 */

import { AgentRuntime } from './runtime';
import { resolveVariables } from './variables';
import { validateKeys } from './parser';
import { CITATION_GENERATOR_SYSTEM_PROMPT, CITATION_GENERATOR_PROMPT } from './prompts';
import { AgentContext, CitationGeneratorOutput } from './types';
import { executeWithJSONRetry } from './json_retry';

/**
 * Execute the Citation Generator agent for a single target.
 * @param runtime Agent runtime instance
 * @param context Agent context (must include target variables)
 * @returns Updated sentence with citation
 */
export async function runCitationGenerator(
    runtime: AgentRuntime,
    context: AgentContext
): Promise<CitationGeneratorOutput> {
    // Resolve variables
    const userPrompt = resolveVariables(CITATION_GENERATOR_PROMPT, context);

    // Execute agent (requires online to find citations) with JSON parse retry
    const { output } = await executeWithJSONRetry<CitationGeneratorOutput>(
        runtime,
        () => runtime.executeAgent(
            CITATION_GENERATOR_SYSTEM_PROMPT,
            userPrompt,
            true, // requiresOnline
            'CitationGenerator'
        ),
        'CitationGenerator'
    );
    validateKeys(output, ['updated_sentence']);

    return output;
}
