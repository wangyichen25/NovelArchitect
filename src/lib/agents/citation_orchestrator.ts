/**
 * Citation Orchestrator Agent - Identifies sentences that need citations.
 */

import { AgentRuntime } from './runtime';
import { resolveVariables } from './variables';
import { parseJSON, validateKeys } from './parser';
import { CITATION_ORCHESTRATOR_SYSTEM_PROMPT, CITATION_ORCHESTRATOR_PROMPT } from './prompts';
import { AgentContext, CitationOrchestratorOutput } from './types';

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
    // Resolve variables
    const userPrompt = resolveVariables(CITATION_ORCHESTRATOR_PROMPT, context);

    // Execute agent (offline is fine for scanning text)
    const response = await runtime.executeAgent(
        CITATION_ORCHESTRATOR_SYSTEM_PROMPT,
        userPrompt,
        false, // requiresOnline
        'CitationOrchestrator'
    );

    // Parse output
    const output = parseJSON<CitationOrchestratorOutput>(response);

    // Validate output structure
    if (!output.citation_targets || !Array.isArray(output.citation_targets)) {
        throw new Error('Citation Orchestrator failed to return a list of targets.');
    }

    if (output.citation_targets.length > 0) {
        validateKeys(output.citation_targets[0], [
            'sentence_citation_target',
            'section_title_citation_target',
            'reason_citation_target',
            'evidence_type_citation_target'
        ]);
    }

    return output;
}
