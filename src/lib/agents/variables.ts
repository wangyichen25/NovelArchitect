/**
 * Variable resolution and transformation utilities.
 * Handles placeholder replacement in prompts and data format conversions.
 */

import { AgentContext, PlanSection } from './types';
import { countWordsExcludingCitations } from '../word-count';

/**
 * Resolve variables in a prompt template by replacing {placeholder} with actual values.
 * @param prompt Template string with {variable} placeholders
 * @param context Object containing variable values
 * @returns Resolved prompt string
 */
export function resolveVariables(prompt: string, context: Partial<AgentContext>): string {
    let resolved = prompt;

    // Replace all {variable} placeholders
    for (const [key, value] of Object.entries(context)) {
        const placeholder = `{${key}}`;
        if (resolved.includes(placeholder)) {
            // Convert value to string if it's not already
            const stringValue = value === undefined || value === null
                ? ''
                : String(value);
            resolved = resolved.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), stringValue);
        }
    }

    return resolved;
}

/**
 * Format a JSON array as a markdown bulleted list.
 * Used for converting action_items, sections_drafted, etc.
 * @param arr Array of items (strings or objects)
 * @returns Markdown bulleted list string
 */
export function formatArrayAsMarkdown(arr: any[]): string {
    if (!Array.isArray(arr) || arr.length === 0) {
        return '';
    }

    return arr.map(item => {
        // If item is an object, try to extract a meaningful string
        if (typeof item === 'object' && item !== null) {
            // For section plans, use section_title
            if ('section_title' in item) {
                return `- ${item.section_title}${item.status ? ` (${item.status})` : ''}`;
            }
            // Otherwise, stringify the whole object
            return `- ${JSON.stringify(item)}`;
        }
        // If it's a string or primitive, use it directly
        return `- ${item}`;
    }).join('\n');
}

/**
 * Format section plan array for prompt injection.
 * Creates a readable markdown list with section details.
 * @param sections Array of plan sections
 * @returns Formatted markdown string
 */
export function formatSectionPlan(sections: PlanSection[]): string {
    if (!Array.isArray(sections) || sections.length === 0) {
        return '';
    }

    return sections.map(section => {
        const { section_title, section_summary, section_word_count } = section;
        return `- **${section_title}** (~${section_word_count} words)\n  ${section_summary}`;
    }).join('\n');
}

/**
 * Create an AgentContext object from current agent state and manuscript.
 * This builds the complete variable context needed for prompt resolution.
 * @param state Agent state from database
 * @param currentManuscript Current manuscript text
 * @param ephemeralVars Optional ephemeral variables for specific agent calls
 * @returns Complete agent context
 */
export function buildAgentContext(
    state: {
        instructions?: string;
        maxPasses: number;
        minScore: number;
        maxHunks?: number;
        maxTargets?: number;
        passIndex: number;
        formatGuidance?: string;
        sectionPlan?: any;
        sectionsDrafted?: any;
        history?: any[];
        actionHistory?: any[];
    },
    currentManuscript: string,
    ephemeralVars: Partial<AgentContext> = {}
): AgentContext {
    // Get last history entry
    const lastHistory = state.actionHistory && state.actionHistory.length > 0
        ? state.actionHistory[state.actionHistory.length - 1]
        : null;

    // Format section plan if it exists
    const sectionPlanFormatted = state.sectionPlan
        ? (Array.isArray(state.sectionPlan)
            ? formatSectionPlan(state.sectionPlan)
            : formatSectionPlan(state.sectionPlan.sections || []))
        : '';

    // Format sections drafted if it exists
    const sectionsDraftedFormatted = state.sectionsDrafted
        ? formatArrayAsMarkdown(state.sectionsDrafted)
        : '';

    // Calculate word count (exclude inline citations)
    const wordCount = countWordsExcludingCitations(currentManuscript);

    // Extract existing citations (simple search for @article, @book, etc.)
    const citationMatches = currentManuscript.match(/@\w+\{[^}]+\}/g) || [];
    const existingCitations = citationMatches.join('\n');

    return {
        // User Inputs (Static)
        instructions: state.instructions || '',
        current_manuscript: currentManuscript,
        max_passes: state.maxPasses,
        min_score: state.minScore,
        max_hunks: state.maxHunks || 5,
        max_targets: state.maxTargets || 10,

        // System Inputs (Accumulating)
        pass_index: state.passIndex,
        last_history_entry: lastHistory
            ? `${lastHistory.action}: ${lastHistory.summary}`
            : 'No previous actions',
        has_format_guidance: Boolean(state.formatGuidance),
        manuscript_word_count: wordCount,
        existing_citations: existingCitations,

        // Agent Inputs (Accumulating)
        format_guidance: state.formatGuidance,
        section_plan: sectionPlanFormatted,
        sections_drafted: sectionsDraftedFormatted,

        // Ephemeral variables (passed for specific agent calls)
        ...ephemeralVars
    };
}

/**
 * Count words in a markdown text, excluding inline citations.
 * @param text Markdown text
 * @returns Word count
 */
export function countWords(text: string): number {
    return countWordsExcludingCitations(text);
}
