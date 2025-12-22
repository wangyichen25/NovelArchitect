/**
 * Planner Agent - Creates section-by-section outline for the manuscript.
 */

import { AgentRuntime } from './runtime';
import { resolveVariables } from './variables';
import { parseJSON, validateKeys } from './parser';
import { PLANNER_SYSTEM_PROMPT, PLANNER_PROMPT } from './prompts';
import { AgentContext, PlannerOutput, PlanSection } from './types';

/**
 * Execute the Planner agent to generate a section plan.
 * Performs "hybrid planning" - if manuscript exists, marks completed sections.
 * @param runtime Agent runtime instance
 * @param context Agent context with variables
 * @returns Section plan as array of sections
 */
export async function runPlanner(
    runtime: AgentRuntime,
    context: AgentContext
): Promise<PlanSection[]> {
    // Resolve the prompt with variables
    const userPrompt = resolveVariables(PLANNER_PROMPT, context);

    // Execute agent (requires online for research)
    const response = await runtime.executeAgent(
        PLANNER_SYSTEM_PROMPT,
        userPrompt,
        true, // requiresOnline
        'Planner'
    );

    // Parse JSON output
    const output = parseJSON<PlannerOutput>(response);
    validateKeys(output, ['sections']);

    // Validate each section has required fields
    for (const section of output.sections) {
        validateKeys(section, ['section_title', 'section_summary', 'section_word_count']);
    }

    // Update state with the new plan
    // sectionsDrafted starts empty - manager will determine completion from manuscript
    await runtime.updateState({
        sectionPlan: output.sections,
        sectionsDrafted: []
    });

    await runtime.addHistory(
        'generate_plan',
        `Created plan with ${output.sections.length} sections`,
        true
    );

    return output.sections;
}
