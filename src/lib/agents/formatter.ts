/**
 * Formatter Agent - Analyzes instructions to determine formatting expectations.
 */

import { AgentRuntime } from './runtime';
import { resolveVariables } from './variables';
import { FORMATTER_SYSTEM_PROMPT, FORMATTER_PROMPT } from '../../../manuscript_agent_prompts';
import { AgentContext } from './types';

/**
 * Execute the Formatter agent to generate format guidance.
 * @param runtime Agent runtime instance
 * @param context Agent context with variables
 * @returns Format guidance as markdown string
 */
export async function runFormatter(
    runtime: AgentRuntime,
    context: AgentContext
): Promise<string> {
    // Resolve the prompt with variables
    const userPrompt = resolveVariables(FORMATTER_PROMPT, context);

    // Execute agent (requires online for web search)
    const response = await runtime.executeAgent(
        FORMATTER_SYSTEM_PROMPT,
        userPrompt,
        true, // requiresOnline
        'Formatter'
    );

    // Formatter returns markdown directly, not JSON
    // Just clean up any extra whitespace
    const formatGuidance = response.trim();

    // Update state
    await runtime.updateState({ formatGuidance });
    await runtime.addHistory(
        'generate_format_guidance',
        'Generated formatting blueprint',
        true
    );

    return formatGuidance;
}
