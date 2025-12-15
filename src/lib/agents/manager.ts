/**
 * Manager Agent - Central orchestrator that decides the next action.
 */

import { AgentRuntime } from './runtime';
import { resolveVariables, formatArrayAsMarkdown } from './variables';
import { parseJSON, validateKeys } from './parser';
import { MANAGER_SYSTEM_PROMPT, MANAGER_PROMPT } from '../../../manuscript_agent_prompts';
import { AgentContext, ManagerDecision, PlanSection, CriticOutput } from './types';
import { runFormatter } from './formatter';
import { runPlanner } from './planner';
import { runWriter, getNextSectionToWrite } from './writer';
import { runCritic } from './critic';
import { runReviser } from './reviser';
import { db } from '@/lib/db';

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

    // Execute manager agent (offline acceptable - decision making)
    const response = await runtime.executeAgent(
        MANAGER_SYSTEM_PROMPT,
        userPrompt,
        false, // requiresOnline
        'Manager'
    );

    // Parse JSON output
    const output = parseJSON<ManagerDecision>(response);
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
    getCurrentManuscript: () => Promise<string>,
    updateManuscript: (text: string) => Promise<void>,
    onLog?: (log: any) => void
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
            action_items: formatArrayAsMarkdown(lastActionItems)
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

                const nextSection = getNextSectionToWrite(sections);

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

                // Update section status in plan
                nextSection.status = 'complete';
                await runtime.updateState({ sectionPlan: sections });

                // Update manuscript in UI/DB
                await updateManuscript(currentManuscript);

                break;
            }

            case 'critique_manuscript': {
                const critique = await runCritic(runtime, context);
                lastCritiqueScore = critique.score;
                lastCritiqueSummary = critique.critic_summary;
                lastActionItems = critique.action_items;
                reviserRequestedContinue = false; // Reset
                break;
            }

            case 'revise_manuscript': {
                const reviseContext = await runtime.buildContext(currentManuscript, {
                    critique_score: lastCritiqueScore,
                    critique_summary: lastCritiqueSummary,
                    action_items: formatArrayAsMarkdown(lastActionItems)
                });

                const result = await runReviser(runtime, reviseContext, currentManuscript);
                currentManuscript = result.manuscript;
                reviserRequestedContinue = result.shouldContinue;

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
