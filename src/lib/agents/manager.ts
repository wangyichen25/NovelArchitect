/**
 * Manager Agent - Central orchestrator that decides the next action.
 */

import { AgentRuntime } from './runtime';
import { resolveVariables, formatArrayAsMarkdown } from './variables';
import { validateKeys } from './parser';
import { MANAGER_SYSTEM_PROMPT, MANAGER_PROMPT } from './prompts';
import { AgentContext, ManagerDecision, PlanSection, CriticOutput } from './types';
import { runFormatter } from './formatter';
import { runPlanner } from './planner';
import { runWriter, getNextSectionToWrite } from './writer';
import { runCritic } from './critic';
import { runReviser } from './reviser';
import { runFigureProcessor, getUncitedImages } from './figure_processor';
import { runTableProcessor } from './table_processor';
import { db } from '@/lib/db';
import { ProjectImage } from '@/lib/db/schema';
import { executeWithJSONRetry } from './json_retry';

/**
 * Get the next action from the Manager agent.
 * @param runtime Agent runtime instance
 * @param context Agent context with current state
 * @returns Manager decision
 */
async function getNextAction(
    runtime: AgentRuntime,
    context: AgentContext
): Promise<ManagerDecision> {
    // Resolve the prompt with variables
    const userPrompt = resolveVariables(MANAGER_PROMPT, context);

    // Execute manager agent (offline acceptable - decision making) with JSON parse retry
    const { output } = await executeWithJSONRetry<ManagerDecision>(
        runtime,
        () => runtime.executeAgent(
            MANAGER_SYSTEM_PROMPT,
            userPrompt,
            false, // requiresOnline
            'Manager'
        ),
        'Manager'
    );
    validateKeys(output, ['action', 'reasoning']);

    return output;
}

/**
 * Execute the manager workflow loop.
 * @param novelId Novel ID
 * @param sceneId Scene ID (optional)
 * @param instructions User instructions
 * @param maxPasses Maximum critique/revision passes
 * @param minScore Minimum acceptable critique score
 * @param getCurrentManuscript Function to get current manuscript text
 * @param updateManuscript Function to update manuscript text
 * @param onLog Callback for log entries
 * @returns Final manuscript text
 */
export async function runManagerWorkflow(
    novelId: string,
    sceneId: string | undefined,
    instructions: string,
    maxPasses: number,
    minScore: number,
    images: ProjectImage[],
    getCurrentManuscript: () => Promise<string>,
    updateManuscript: (text: string) => Promise<void>,
    onLog?: (log: any) => void,
    samplePaper?: string // Optional sample paper for formatter
): Promise<string> {
    // Create runtime
    const runtime = new AgentRuntime(novelId, sceneId);

    // Register log callback
    if (onLog) {
        runtime.onLog(onLog);
    }

    // Get or create state
    await runtime.getOrCreateState(instructions, maxPasses, minScore);

    // Get current manuscript
    let currentManuscript = await getCurrentManuscript();

    // Variables for tracking critique/revision state
    let lastCritiqueScore: number | undefined;
    let lastCritiqueSummary: string | undefined;
    let lastActionItems: string[] = [];
    let reviserRequestedContinue = false;

    // Main loop
    let loopCount = 0;
    const MAX_LOOPS = 50; // Safety limit

    while (loopCount < MAX_LOOPS) {
        loopCount++;

        // Build context
        const context = await runtime.buildContext(currentManuscript, {
            critique_score: lastCritiqueScore,
            critique_summary: lastCritiqueSummary,
            action_items: formatArrayAsMarkdown(lastActionItems),
            images: images.map(img => img.name).join(', '),
            sample_paper: samplePaper // Pass sample paper for formatter
        });

        // Get next action from manager
        const decision = await getNextAction(runtime, context);

        runtime['emitLog']({
            agent: 'Manager',
            type: 'info',
            content: `Decision: ${decision.action} - ${decision.reasoning}`
        });

        // Execute the chosen action
        switch (decision.action) {
            case 'generate_format_guidance': {
                await runFormatter(runtime, context);
                break;
            }

            case 'generate_plan': {
                await runPlanner(runtime, context);
                break;
            }

            case 'process_images': {
                const uncited = getUncitedImages(currentManuscript, images);
                if (uncited.length === 0) {
                    runtime['emitLog']({
                        agent: 'Manager',
                        type: 'info',
                        content: 'All images are already cited in manuscript'
                    });
                    break;
                }

                // Use Manager's chosen image_filename, or fallback to first uncited
                const requestedFilename = decision.parameters?.image_filename;
                let img = requestedFilename
                    ? uncited.find(i => i.name === requestedFilename) || images.find(i => i.name === requestedFilename)
                    : uncited[0];

                if (!img) {
                    runtime['emitLog']({
                        agent: 'Manager',
                        type: 'info',
                        content: `Image "${requestedFilename}" not found. Using first uncited image.`
                    });
                    img = uncited[0];
                }

                runtime['emitLog']({
                    agent: 'FigureProcessor',
                    type: 'info',
                    content: `Processing image: ${img.name}`
                });

                const result = await runFigureProcessor(runtime, context, img);

                // Apply find/replace to manuscript
                if (result.find && result.replace) {
                    currentManuscript = currentManuscript.replace(result.find, result.replace);
                    await updateManuscript(currentManuscript);
                }
                break;
            }

            case 'process_tables': {
                const rawTable = decision.parameters?.raw_table;
                if (!rawTable || typeof rawTable !== 'string' || rawTable.trim().length === 0) {
                    runtime['emitLog']({
                        agent: 'Manager',
                        type: 'error',
                        content: 'No raw_table provided in parameters for process_tables action'
                    });
                    break;
                }

                runtime['emitLog']({
                    agent: 'TableProcessor',
                    type: 'info',
                    content: `Processing raw table (${rawTable.substring(0, 50)}...)`
                });

                const tableResult = await runTableProcessor(runtime, context, rawTable);

                // Apply find/replace to manuscript
                if (tableResult.find && tableResult.replace) {
                    currentManuscript = currentManuscript.replace(tableResult.find, tableResult.replace);
                    await updateManuscript(currentManuscript);
                }
                break;
            }

            case 'write_section': {
                // Get the section to write
                const state = await db.agent_state.get(runtime['stateId']!);
                const sectionPlan = state?.sectionPlan;

                if (!sectionPlan) {
                    throw new Error('No section plan available for writing');
                }

                const sections: PlanSection[] = Array.isArray(sectionPlan)
                    ? sectionPlan
                    : sectionPlan.sections || [];

                const normalizeTitle = (title: string) => (
                    title
                        .trim()
                        .toLowerCase()
                        .replace(/^[\d\s.\-–—)]+/, '')
                        .replace(/\s+/g, ' ')
                );

                const requestedTitle = decision.parameters?.section_title?.trim();
                let nextSection: PlanSection | null = null;

                if (requestedTitle) {
                    const requestedNormalized = normalizeTitle(requestedTitle);
                    nextSection = sections.find(section => normalizeTitle(section.section_title) === requestedNormalized)
                        || sections.find(section => {
                            const candidate = normalizeTitle(section.section_title);
                            return candidate.includes(requestedNormalized) || requestedNormalized.includes(candidate);
                        })
                        || null;
                }

                if (!nextSection) {
                    if (requestedTitle) {
                        runtime['emitLog']({
                            agent: 'Manager',
                            type: 'info',
                            content: `Requested section "${requestedTitle}" not found in plan. Falling back to next missing section.`
                        });
                    }

                    // Find next section by checking what's missing from the manuscript
                    nextSection = getNextSectionToWrite(sections, currentManuscript);
                }

                if (!nextSection) {
                    runtime['emitLog']({
                        agent: 'Manager',
                        type: 'info',
                        content: 'No more sections to write'
                    });
                    break;
                }

                // Build context with section details
                const writerContext = await runtime.buildContext(currentManuscript, {
                    section_title: nextSection.section_title,
                    section_summary: nextSection.section_summary,
                    section_word_count: nextSection.section_word_count
                });

                // Write the section
                currentManuscript = await runWriter(runtime, writerContext, currentManuscript);

                // Update manuscript in UI/DB
                await updateManuscript(currentManuscript);

                break;
            }

            case 'critique_and_improve_manuscript': {
                // Capture pass index before starting a critique cycle
                const state = await db.agent_state.get(runtime['stateId']!);
                let passIndex = state?.passIndex || 0;

                if (passIndex >= maxPasses) {
                    runtime['emitLog']({
                        agent: 'Manager',
                        type: 'info',
                        content: `Max critique-revision cycles reached (${passIndex}/${maxPasses}). Skipping critique cycle.`
                    });
                    break;
                }

                // Allow up to 3 critique-revision cycles per Manager decision, or until global max passes
                let internalLoops = 0;
                const MAX_INTERNAL_LOOPS = 3;

                while (passIndex < maxPasses && internalLoops < MAX_INTERNAL_LOOPS) {
                    runtime['emitLog']({
                        agent: 'Manager',
                        type: 'info',
                        content: `Starting critique-revision cycle ${passIndex + 1} of ${maxPasses}.`
                    });

                    // Critique the current manuscript
                    const critiqueContext = await runtime.buildContext(currentManuscript);
                    const critique = await runCritic(runtime, critiqueContext);
                    lastCritiqueScore = critique.score;
                    lastCritiqueSummary = critique.critic_summary;
                    lastActionItems = critique.action_items;

                    const needsRevision = (lastCritiqueScore < minScore) && (lastActionItems.length > 0);

                    if (needsRevision) {
                        // Revise based on critique feedback
                        const reviseContext = await runtime.buildContext(currentManuscript, {
                            critique_score: lastCritiqueScore,
                            critique_summary: lastCritiqueSummary,
                            action_items: formatArrayAsMarkdown(lastActionItems)
                        });

                        const reviseResult = await runReviser(runtime, reviseContext, currentManuscript);
                        currentManuscript = reviseResult.manuscript;
                        await updateManuscript(currentManuscript);

                        // Re-critique to capture updated score and action items within the same cycle
                        const followupContext = await runtime.buildContext(currentManuscript);
                        const followupCritique = await runCritic(runtime, followupContext);
                        lastCritiqueScore = followupCritique.score;
                        lastCritiqueSummary = followupCritique.critic_summary;
                        lastActionItems = followupCritique.action_items;
                    }

                    // Track cycle completion (critique + optional revision)
                    passIndex += 1;
                    internalLoops += 1;
                    await runtime.updateState({ passIndex });

                    if (passIndex >= maxPasses) {
                        runtime['emitLog']({
                            agent: 'Manager',
                            type: 'info',
                            content: `Max critique-revision cycles reached (${passIndex}/${maxPasses}).`
                        });
                        break;
                    }

                    // Stop if target is met or no actionable items remain
                    if ((lastCritiqueScore >= minScore) || (lastActionItems.length === 0)) {
                        break;
                    }
                }

                break;
            }

            // Keep for manual/targeted usage
            case 'revise_manuscript': {
                const rawActionItems = decision.parameters?.action_items;
                const requestedActionItems = Array.isArray(rawActionItems)
                    ? rawActionItems
                    : (typeof rawActionItems === 'string' && rawActionItems.trim().length > 0)
                        ? [rawActionItems.trim()]
                        : undefined;

                const actionItemsForReviser = requestedActionItems && requestedActionItems.length > 0
                    ? requestedActionItems
                    : lastActionItems;

                const reviseContext = await runtime.buildContext(currentManuscript, {
                    critique_score: lastCritiqueScore,
                    critique_summary: lastCritiqueSummary,
                    action_items: formatArrayAsMarkdown(actionItemsForReviser)
                });

                const result = await runReviser(runtime, reviseContext, currentManuscript);
                currentManuscript = result.manuscript;
                reviserRequestedContinue = result.shouldContinue;
                lastActionItems = actionItemsForReviser;

                // Update manuscript in UI/DB
                await updateManuscript(currentManuscript);

                break;
            }

            case 'finish': {
                runtime['emitLog']({
                    agent: 'Manager',
                    type: 'info',
                    content: 'Manuscript complete!'
                });

                await runtime.addHistory(
                    'finish',
                    `Workflow completed. Final score: ${lastCritiqueScore?.toFixed(2) || 'N/A'}`,
                    true
                );

                return currentManuscript;
            }

            default: {
                throw new Error(`Unknown action: ${decision.action}`);
            }
        }
    }

    // Safety limit reached
    runtime['emitLog']({
        agent: 'System',
        type: 'error',
        content: `Maximum loop count (${MAX_LOOPS}) reached. Stopping workflow.`
    });

    await runtime.addHistory(
        'error',
        `Workflow stopped: maximum loop count reached`,
        false
    );

    return currentManuscript;
}
