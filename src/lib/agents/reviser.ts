/**
 * Reviser Agent - Implements improvements based on critique feedback.
 */

import { AgentRuntime } from './runtime';
import { resolveVariables, formatArrayAsMarkdown } from './variables';
import { parseJSON, validateKeys } from './parser';
import { REVISER_SYSTEM_PROMPT, REVISER_PROMPT } from '../../../manuscript_agent_prompts';
import { AgentContext, ReviserOutput } from './types';
import Fuse from 'fuse.js';

/**
 * Apply reviser operations to the manuscript using fuzzy matching.
 * @param manuscript Current manuscript text
 * @param operations Find/replace operations from reviser
 * @returns Updated manuscript
 */
function applyReviseOperations(manuscript: string, operations: ReviserOutput['operations']): string {
    let updated = manuscript;

    for (const op of operations) {
        const { find, replace, count = 1 } = op;

        // Try exact match first
        if (updated.includes(find)) {
            if (count === 'all') {
                // Replace all occurrences
                updated = updated.split(find).join(replace);
            } else {
                // Replace first N occurrences
                let replacements = 0;
                const parts = updated.split(find);
                updated = parts.reduce((acc, part, i) => {
                    if (i === 0) return part;
                    if (replacements < (count as number)) {
                        replacements++;
                        return acc + replace + part;
                    }
                    return acc + find + part;
                });
            }
        } else {
            // Fuzzy match if exact match fails
            const lines = updated.split('\n');
            const fuse = new Fuse(lines, {
                threshold: 0.2, // Stricter threshold for revisions
                includeScore: true,
                includeMatches: true
            });

            const findLines = find.split('\n');
            const searchText = findLines[0];
            const results = fuse.search(searchText);

            if (results.length > 0) {
                // Replace the best match
                const matchIndex = results[0].refIndex;

                // Try to replace just the matched portion
                const line = lines[matchIndex];
                const match = results[0].matches?.[0];

                if (match) {
                    // Simple substring replacement
                    lines[matchIndex] = line.replace(searchText, replace);
                } else {
                    lines[matchIndex] = replace;
                }

                updated = lines.join('\n');
            } else {
                console.warn('[Reviser] Could not find match for:', find.substring(0, 100));
                // Don't append - just skip this operation
            }
        }
    }

    return updated;
}

/**
 * Execute the Reviser agent to improve the manuscript.
 * @param runtime Agent runtime instance
 * @param context Agent context with variables (including critique_summary, action_items)
 * @param currentManuscript Current manuscript text
 * @returns Object with updated manuscript and whether to continue
 */
export async function runReviser(
    runtime: AgentRuntime,
    context: AgentContext,
    currentManuscript: string
): Promise<{ manuscript: string; shouldContinue: boolean }> {
    // Format action items as markdown list for prompt
    const actionItemsFormatted = context.action_items || '';

    const contextWithFormatted = {
        ...context,
        action_items: actionItemsFormatted
    };

    // Resolve the prompt with variables
    const userPrompt = resolveVariables(REVISER_PROMPT, contextWithFormatted);

    // Execute agent (offline acceptable - editing existing text)
    const response = await runtime.executeAgent(
        REVISER_SYSTEM_PROMPT,
        userPrompt,
        false, // requiresOnline
        'Reviser'
    );

    // Parse JSON output
    const output = parseJSON<ReviserOutput>(response);
    validateKeys(output, ['status', 'rationale', 'operations']);

    // Apply operations to manuscript
    const updatedManuscript = applyReviseOperations(currentManuscript, output.operations);

    // Add to history
    await runtime.addHistory(
        'revise_manuscript',
        `Applied ${output.operations.length} revisions. Status: ${output.status}. ${output.rationale}`,
        true
    );

    return {
        manuscript: updatedManuscript,
        shouldContinue: output.status === 'continue'
    };
}
