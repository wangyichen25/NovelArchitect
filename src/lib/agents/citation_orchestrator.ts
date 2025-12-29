/**
 * Citation Orchestrator Agent - Identifies sentences that need citations.
 */

import { AgentRuntime } from './runtime';
import { resolveVariables } from './variables';
import { validateKeys } from './parser';
import { CITATION_ORCHESTRATOR_SYSTEM_PROMPT, CITATION_ORCHESTRATOR_PROMPT } from './prompts';
import { AgentContext, CitationOrchestratorOutput } from './types';
import { executeWithJSONRetry } from './json_retry';

/**
 * Execute the Citation Orchestrator agent.
 * @param runtime Agent runtime instance
 * @param context Agent context
 * @returns List of citation targets
 */
export async function runCitationOrchestrator(
    runtime: AgentRuntime,
    context: AgentContext
): Promise<CitationOrchestratorOutput> {
    const overallMaxTargets = context.max_targets || 100;
    const allTargets: any[] = []; // Type verified by validation below

    // Multi-step loop
    while (allTargets.length < overallMaxTargets) {
        const remainingNeeded = overallMaxTargets - allTargets.length;
        const stepMax = Math.min(10, remainingNeeded);

        if (stepMax <= 0) break;

        // Prepare already identified list to prevent duplicates
        // Limit the context size if list gets too long (e.g., keep last 50 or just use sentence start)
        // But prompt asks for "Already identified targets" list.
        const alreadyIdentified = allTargets
            .map((t, i) => `${i + 1}. "${t.sentence_citation_target.substring(0, 100)}${t.sentence_citation_target.length > 100 ? '...' : ''}"`)
            .join('\n');

        const stepContext = {
            ...context,
            max_targets: stepMax,
            already_identified_targets: alreadyIdentified || "None yet."
        };

        // Resolve variables
        const userPrompt = resolveVariables(CITATION_ORCHESTRATOR_PROMPT, stepContext);

        // Execute agent
        const { output } = await executeWithJSONRetry<CitationOrchestratorOutput>(
            runtime,
            () => runtime.executeAgent(
                CITATION_ORCHESTRATOR_SYSTEM_PROMPT,
                userPrompt,
                false, // requiresOnline
                'CitationOrchestrator'
            ),
            'CitationOrchestrator'
        );

        // Validate output structure
        if (!output.citation_targets || !Array.isArray(output.citation_targets)) {
            // Stop if malformed
            break;
        }

        if (output.citation_targets.length === 0) {
            // Stop if no new targets found
            break;
        }

        validateKeys(output.citation_targets[0], [
            'sentence_citation_target',
            'section_title_citation_target',
            'reason_citation_target',
            'evidence_type_citation_target'
        ]);

        let newUniqueCount = 0;
        for (const target of output.citation_targets) {
            // Check for duplicates in allTargets
            const isDuplicate = allTargets.some(t => t.sentence_citation_target === target.sentence_citation_target);
            if (!isDuplicate) {
                allTargets.push(target);
                newUniqueCount++;
            }
        }

        // Access private logging via bracket notation as seen in other files
        runtime['emitLog']({
            agent: 'CitationOrchestrator',
            type: 'info',
            content: `Step identified ${newUniqueCount} new unique targets. Total so far: ${allTargets.length}`
        });

        // If we found duplicates/nothing new despite LLM returning items, break to avoid infinite loop
        if (newUniqueCount === 0) {
            break;
        }
    }

    return { citation_targets: allTargets };
}
