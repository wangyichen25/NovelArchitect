/**
 * Writer Agent - Drafts individual sections of the manuscript.
 */

import { AgentRuntime } from './runtime';
import { resolveVariables } from './variables';
import { parseJSON, validateKeys } from './parser';
import { WRITER_SYSTEM_PROMPT, WRITER_PROMPT } from '../../../manuscript_agent_prompts';
import { AgentContext, WriterOutput, PlanSection } from './types';
import Fuse from 'fuse.js';

/**
 * Apply writer operations to the manuscript using fuzzy matching.
 * @param manuscript Current manuscript text
 * @param operations Find/replace operations from writer
 * @returns Updated manuscript
 */
function applyWriteOperations(manuscript: string, operations: WriterOutput['operations']): string {
    let updated = manuscript;

    for (const op of operations) {
        const { find, replace } = op;

        // Try exact match first
        if (updated.includes(find)) {
            // For append operations (new sections), we replace once
            updated = updated.replace(find, replace);
        } else {
            // Fuzzy match if exact match fails
            // Split into lines for better matching
            const lines = updated.split('\n');
            const fuse = new Fuse(lines, {
                threshold: 0.3, // Allow some fuzzy matching
                includeScore: true
            });

            const findLines = find.split('\n');
            const searchText = findLines[0]; // Search using first line
            const results = fuse.search(searchText);

            if (results.length > 0) {
                // Replace the best match
                const matchIndex = results[0].refIndex;
                // Simple approach: replace the matched line(s)
                // More sophisticated would be to find multi-line match
                lines[matchIndex] = replace;
                updated = lines.join('\n');
            } else {
                // If fuzzy match fails, append to end
                console.warn('[Writer] Could not find match for:', find.substring(0, 100));
                updated = updated + '\n\n' + replace;
            }
        }
    }

    return updated;
}

/**
 * Execute the Writer agent to draft a section.
 * @param runtime Agent runtime instance
 * @param context Agent context with variables (including section_title, section_summary, section_word_count)
 * @param currentManuscript Current manuscript text
 * @returns Updated manuscript text
 */
export async function runWriter(
    runtime: AgentRuntime,
    context: AgentContext,
    currentManuscript: string
): Promise<string> {
    // Resolve the prompt with variables
    const userPrompt = resolveVariables(WRITER_PROMPT, context);

    // Execute agent (requires online for research/citations)
    const response = await runtime.executeAgent(
        WRITER_SYSTEM_PROMPT,
        userPrompt,
        true, // requiresOnline
        'Writer'
    );

    // Parse JSON output
    const output = parseJSON<WriterOutput>(response);
    validateKeys(output, ['rationale', 'operations']);

    // Apply operations to manuscript
    const updatedManuscript = applyWriteOperations(currentManuscript, output.operations);

    // Update sections drafted
    const state = await runtime['buildContext'](currentManuscript);
    const sectionsDrafted = state.sections_drafted
        ? state.sections_drafted.split('\n').map(s => s.replace(/^- /, ''))
        : [];

    if (context.section_title && !sectionsDrafted.includes(context.section_title)) {
        sectionsDrafted.push(context.section_title);
    }

    // Update state
    await runtime.updateState({ sectionsDrafted });

    await runtime.addHistory(
        'write_section',
        `Drafted section: ${context.section_title}. ${output.rationale}`,
        true
    );

    return updatedManuscript;
}

/**
 * Find the next section to write from the plan.
 * @param sections Section plan
 * @returns Next section to write, or null if all complete
 */
export function getNextSectionToWrite(sections: PlanSection[]): PlanSection | null {
    return sections.find(s => s.status === 'todo') || null;
}
