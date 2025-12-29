/**
 * Writer Agent - Drafts individual sections of the manuscript.
 */

import { AgentRuntime } from './runtime';
import { resolveVariables } from './variables';
import { validateKeys } from './parser';
import { WRITER_SYSTEM_PROMPT, WRITER_PROMPT } from './prompts';
import { AgentContext, WriterOutput, PlanSection } from './types';
import { executeWithJSONRetry } from './json_retry';

/**
 * Escape regex special characters.
 */
function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tokenize text into lowercase words (alphanumeric only).
 */
function tokenize(text: string): Set<string> {
    return new Set(
        text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 0)
    );
}

/**
 * Calculate Jaccard similarity between two word sets.
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Apply writer operations to the manuscript using multi-tier matching.
 * Tier 1: Exact match
 * Tier 2: Normalized regex match (case-insensitive, whitespace-agnostic)
 * Tier 3: Sliding window fuzzy match (Jaccard similarity >= 0.9)
 * Tier 4: Append fallback
 * @param manuscript Current manuscript text
 * @param operations Find/replace operations from writer
 * @returns Updated manuscript
 */
function applyWriteOperations(manuscript: string, operations: WriterOutput['operations']): string {
    let updated = manuscript;

    for (const op of operations) {
        const { find, replace } = op;
        if (!find || !replace) continue;

        // Tier 1: Exact Match
        if (updated.includes(find)) {
            updated = updated.replace(find, replace);
            continue;
        }

        // Tier 2: Normalized Regex Match (case-insensitive, whitespace-agnostic)
        const escapedFind = escapeRegExp(find.trim());
        const regexPattern = escapedFind.replace(/\s+/g, '\\s+');
        const regex = new RegExp(regexPattern, 'i');

        if (regex.test(updated)) {
            updated = updated.replace(regex, replace);
            continue;
        }

        // Tier 3: Sliding Window Fuzzy Match
        const findTokens = tokenize(find);
        const windowSize = find.length;
        const stepSize = Math.max(50, Math.floor(windowSize / 10));
        const SIMILARITY_THRESHOLD = 0.9;

        let bestScore = 0;
        let bestStart = -1;
        let bestEnd = -1;

        for (let start = 0; start <= updated.length - windowSize; start += stepSize) {
            const end = start + windowSize;
            const windowText = updated.substring(start, end);
            const windowTokens = tokenize(windowText);
            const similarity = jaccardSimilarity(findTokens, windowTokens);

            if (similarity > bestScore) {
                bestScore = similarity;
                bestStart = start;
                bestEnd = end;
            }
        }

        // Also check final window if step didn't land on it
        if (updated.length >= windowSize && (updated.length - windowSize) % stepSize !== 0) {
            const start = updated.length - windowSize;
            const windowText = updated.substring(start);
            const windowTokens = tokenize(windowText);
            const similarity = jaccardSimilarity(findTokens, windowTokens);
            if (similarity > bestScore) {
                bestScore = similarity;
                bestStart = start;
                bestEnd = updated.length;
            }
        }

        if (bestScore >= SIMILARITY_THRESHOLD && bestStart >= 0) {
            console.log(`[Writer] Fuzzy matched with score ${bestScore.toFixed(2)} at [${bestStart}:${bestEnd}]`);
            updated = updated.substring(0, bestStart) + replace + updated.substring(bestEnd);
            continue;
        }

        // Tier 4: Fallback - Append
        console.warn('[Writer] Could not find match for block, appending.');
        updated = updated + '\n\n' + replace;
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

    // Execute agent (requires online for research/citations) with JSON parse retry
    const { output } = await executeWithJSONRetry<WriterOutput>(
        runtime,
        () => runtime.executeAgent(
            WRITER_SYSTEM_PROMPT,
            userPrompt,
            true, // requiresOnline
            'Writer'
        ),
        'Writer'
    );
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
 * Find the next section to write from the plan by checking the manuscript.
 * A section is considered complete if its heading exists in the manuscript.
 * @param sections Section plan
 * @param manuscript Current manuscript text
 * @returns Next section to write, or null if all complete
 */
export function getNextSectionToWrite(sections: PlanSection[], manuscript: string): PlanSection | null {
    const manuscriptLower = manuscript.toLowerCase();

    for (const section of sections) {
        // Check if section heading exists in manuscript (any heading level)
        const titleLower = section.section_title.toLowerCase();
        const headingPatterns = [
            `# ${titleLower}`,      // H1
            `## ${titleLower}`,     // H2
            `### ${titleLower}`,    // H3
            `#### ${titleLower}`,   // H4
        ];

        const exists = headingPatterns.some(pattern => manuscriptLower.includes(pattern));

        if (!exists) {
            return section; // Found a section that doesn't exist in manuscript
        }
    }

    return null; // All sections exist in manuscript
}
