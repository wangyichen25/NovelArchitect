/**
 * Critic Agent - Reviews manuscript for quality and adherence to requirements.
 */

import { AgentRuntime } from './runtime';
import { resolveVariables } from './variables';
import { parseJSON, validateKeys, parseNumber } from './parser';
import { CRITIC_SYSTEM_PROMPT, CRITIC_PROMPT } from './prompts';
import { AgentContext, CriticOutput } from './types';

/**
 * Execute the Critic agent to review the manuscript.
 * @param runtime Agent runtime instance
 * @param context Agent context with variables
 * @returns Critic output with score, summary, and action items
 */
export async function runCritic(
    runtime: AgentRuntime,
    context: AgentContext
): Promise<CriticOutput> {
    // Resolve the prompt with variables
    const userPrompt = resolveVariables(CRITIC_PROMPT, context);

    // Execute agent (offline acceptable - reviewing existing text)
    const response = await runtime.executeAgent(
        CRITIC_SYSTEM_PROMPT,
        userPrompt,
        false, // requiresOnline
        'Critic'
    );

    // Parse JSON output
    const output = parseJSON<CriticOutput>(response);
    validateKeys(output, ['critic_summary', 'score', 'action_items']);

    // Ensure score is a number
    output.score = parseNumber(output.score, 0);

    // Ensure action_items is an array
    if (!Array.isArray(output.action_items)) {
        output.action_items = [];
    }

    // Increment pass index
    const currentPassIndex = context.pass_index || 0;
    await runtime.updateState({
        passIndex: currentPassIndex + 1
    });

    // Add to history
    await runtime.addHistory(
        'critique_manuscript',
        `Critique score: ${output.score.toFixed(2)}. ${output.action_items.length} action items identified.`,
        true
    );

    return output;
}
