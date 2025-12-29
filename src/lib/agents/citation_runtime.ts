/**
 * Citation Runtime - Orchestrates the reference scanning and generation workflow.
 */

import { AgentRuntime } from './runtime';
import { runCitationOrchestrator } from './citation_orchestrator';
import { runCitationGenerator } from './citation_generator';

/**
 * Result of the citation scan/update process.
 */
export interface CitationScanResult {
    manuscript: string;
    targetsFound: number;
    citationsApplied: number;
    changes: {
        original: string;
        updated: string;
        reason: string;
    }[];
}

/**
 * Run the full citation scanning and generation pipeline.
 * @param novelId Novel ID
 * @param sceneId Scene ID (optional)
 * @param maxTargets Maximum number of targets to process
 * @param getCurrentManuscript Function to get current manuscript text
 * @param updateManuscript Function to update manuscript text
 * @param onLog Callback for log entries
 * @returns Result of the operation
 */
export async function runCitationWorkflow(
    novelId: string,
    sceneId: string | undefined,
    maxTargets: number,
    getCurrentManuscript: () => Promise<string>,
    updateManuscript: (text: string) => Promise<void>,
    onLog?: (log: any) => void
): Promise<CitationScanResult> {
    const runtime = new AgentRuntime(novelId, sceneId);
    if (onLog) {
        runtime.onLog(onLog);
    }

    // 1. Get current manuscript
    let currentManuscript = await getCurrentManuscript();
    const originalManuscript = currentManuscript; // Keep reference if needed

    // 2. Initialize Agent State
    // We need to initialize state to get stateId, even if we don't use the text instructions for citation workflow.
    // If state exists (from Write tab), it will load it. If not, it creates defaults.
    await runtime.getOrCreateState("", 1, 0.8);

    // 3. Run Orchestrator to find targets
    runtime['emitLog']({
        agent: 'System',
        type: 'info',
        content: `Starting citation scan (limit: ${maxTargets} targets)...`
    });

    const orchestratorContext = await runtime.buildContext(currentManuscript, {
        max_targets: maxTargets
    });

    const orchestratorResult = await runCitationOrchestrator(runtime, orchestratorContext);
    const targets = orchestratorResult.citation_targets;

    runtime['emitLog']({
        agent: 'CitationOrchestrator',
        type: 'info',
        content: `identified ${targets.length} targets for citation.`
    });

    // Populate existing citations from manuscript - REMOVED per requirements to start clean
    // const currentCitations = currentManuscript.match(/@\w+\{[^}]+\}/g) || [];

    // Initializes with empty list, confirmed by "Existing Citations" requirements
    const verifiedCitations: string[] = [];

    // Save state to DB so UI updates immediately (clear existing citations on start)
    await runtime.updateState({
        citationTargets: targets,
        existingCitations: []
    });

    const changes: CitationScanResult['changes'] = [];
    let citationsApplied = 0;

    // 3. Process each target with Generator
    for (const target of targets) {
        runtime['emitLog']({
            agent: 'System',
            type: 'info',
            content: `Processing target: "${target.sentence_citation_target.substring(0, 50)}..."`
        });

        // Pass accumulated verified citations to the generator context
        // This ensures later citations can see/reuse earlier *verified* ones, 
        // but NOT unverified ones from the rest of the manuscript.
        const generatorContext = await runtime.buildContext(currentManuscript, {
            sentence_citation_target: target.sentence_citation_target,
            context_before_citation_target: target.context_before_citation_target || '',
            context_after_citation_target: target.context_after_citation_target || '',
            reason_citation_target: target.reason_citation_target,
            section_title_citation_target: target.section_title_citation_target,
            evidence_type_citation_target: target.evidence_type_citation_target,
            existing_citations: verifiedCitations.join('\n') // Override with verified set
        });

        try {
            const generatorResult = await runCitationGenerator(runtime, generatorContext);

            // Extract verified citations from the result
            const newCitations = generatorResult.updated_sentence.match(/@\w+\{[^}]+\}/g) || [];
            if (newCitations.length > 0) {
                // Add unique new citations to our verified set
                for (const cit of newCitations) {
                    if (!verifiedCitations.includes(cit)) {
                        verifiedCitations.push(cit);
                    }
                }

                // Update state incrementally so UI shows progress
                await runtime.updateState({
                    existingCitations: verifiedCitations
                });
            }

            if (generatorResult.updated_sentence !== target.sentence_citation_target) {
                // Apply change
                if (currentManuscript.includes(target.sentence_citation_target)) {
                    currentManuscript = currentManuscript.replace(
                        target.sentence_citation_target,
                        generatorResult.updated_sentence
                    );

                    changes.push({
                        original: target.sentence_citation_target,
                        updated: generatorResult.updated_sentence,
                        reason: target.reason_citation_target
                    });

                    citationsApplied++;
                } else {
                    runtime['emitLog']({
                        agent: 'System',
                        type: 'error',
                        content: `Could not find original sentence in manuscript to replace: "${target.sentence_citation_target.substring(0, 30)}..."`
                    });
                }
            }
        } catch (error) {
            runtime['emitLog']({
                agent: 'CitationGenerator',
                type: 'error',
                content: `Failed to process citation: ${error}`
            });
        }
    }

    // 4. Final Update
    if (changes.length > 0) {
        await updateManuscript(currentManuscript);

        // Update state with final verified list (redundant if loop updates properly, but safe)
        await runtime.updateState({
            existingCitations: verifiedCitations
        });

        runtime['emitLog']({
            agent: 'System',
            type: 'info',
            content: `Citation scan complete. Applied ${citationsApplied} citations.`
        });
    } else {
        runtime['emitLog']({
            agent: 'System',
            type: 'info',
            content: `Citation scan complete. No changes made.`
        });
    }

    return {
        manuscript: currentManuscript,
        targetsFound: targets.length,
        citationsApplied,
        changes
    };
}
