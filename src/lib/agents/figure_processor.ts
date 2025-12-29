/**
 * Figure Processor Agent - Analyzes images and integrates them into manuscripts.
 */

import { AgentRuntime } from './runtime';
import { resolveVariables } from './variables';
import { validateKeys } from './parser';
import { FIGURE_PROCESSOR_SYSTEM_PROMPT, FIGURE_PROCESSOR_PROMPT } from './prompts';
import { AgentContext, FigureProcessorOutput } from './types';
import { ProjectImage } from '@/lib/db/schema';
import { executeWithJSONRetry } from './json_retry';

/**
 * Extended context for figure processor that includes image data.
 */
interface FigureProcessorContext extends Partial<AgentContext> {
    image_filename: string;
}

/**
 * Execute the Figure Processor agent to analyze an image and generate figure citation.
 * @param runtime Agent runtime instance
 * @param context Agent context with variables
 * @param image The image to process (includes base64 data)
 * @returns FigureProcessorOutput with caption and find/replace operations
 */
export async function runFigureProcessor(
    runtime: AgentRuntime,
    context: AgentContext,
    image: ProjectImage
): Promise<FigureProcessorOutput> {
    // Build the context with image-specific variables
    const figureContext: FigureProcessorContext = {
        ...context,
        image_filename: image.name
    };

    // Resolve the prompt with variables
    const userPrompt = resolveVariables(FIGURE_PROCESSOR_PROMPT, figureContext as any);

    // Execute agent with image (requires online for vision capability) with JSON parse retry
    const { output } = await executeWithJSONRetry<FigureProcessorOutput>(
        runtime,
        () => runtime.executeAgentWithImage(
            FIGURE_PROCESSOR_SYSTEM_PROMPT,
            userPrompt,
            image.data, // Base64 image data
            'FigureProcessor'
        ),
        'FigureProcessor'
    );
    validateKeys(output, ['figure_caption', 'find', 'replace']);

    runtime['emitLog']({
        agent: 'FigureProcessor',
        type: 'output',
        content: `Generated caption for ${image.name}: ${output.figure_caption.substring(0, 100)}...`
    });

    await runtime.addHistory(
        'process_figure',
        `Processed figure: ${image.name}`,
        true
    );

    return output;
}

/**
 * Check which images from the project are not yet cited in the manuscript.
 * Looks for LaTeX figure environment with \includegraphics{figures/<filename>}
 * @param currentManuscript Current manuscript text
 * @param images Array of project images
 * @returns Array of uncited images
 */
export function getUncitedImages(
    currentManuscript: string,
    images: ProjectImage[]
): ProjectImage[] {
    if (!images || images.length === 0) {
        return [];
    }

    return images.filter(image => {
        // Check if the image filename appears in a LaTeX figure environment
        // Format: \includegraphics[...]{figures/<filename>}
        const filenamePattern = new RegExp(
            `\\\\includegraphics\\[[^\\]]*\\]\\{figures/${escapeRegExp(image.name)}\\}`,
            'i'
        );
        return !filenamePattern.test(currentManuscript);
    });
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
