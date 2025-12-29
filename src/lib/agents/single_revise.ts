/**
 * Single Action Revise - Direct reviser invocation for targeted manuscript edits.
 * Bypasses the manager agent to send instructions directly to the reviser once.
 */

import { AgentRuntime } from './runtime';
import { runReviser } from './reviser';
import { LogEntry } from './types';

/**
 * Execute a single targeted revision based on user instruction.
 * @param novelId Novel ID
 * @param sceneId Scene ID (optional)
 * @param instruction User's revision instruction (becomes the action item)
 * @param getCurrentManuscript Function to get current manuscript text
 * @param updateManuscript Function to update manuscript text
 * @param onLog Callback for log entries
 * @returns Final manuscript text
 */
export async function runSingleRevise(
    novelId: string,
    sceneId: string | undefined,
    instruction: string,
    getCurrentManuscript: () => Promise<string>,
    updateManuscript: (text: string) => Promise<void>,
    onLog?: (log: LogEntry) => void
): Promise<string> {
    // Create runtime
    const runtime = new AgentRuntime(novelId, sceneId);

    // Register log callback
    if (onLog) {
        runtime.onLog(onLog);
    }

    // Initialize state (required for runtime to function)
    await runtime.getOrCreateState(instruction, 1, 0.8);

    // Get current manuscript
    const currentManuscript = await getCurrentManuscript();

    runtime['emitLog']({
        agent: 'System',
        type: 'info',
        content: `Starting single action revise: "${instruction.substring(0, 100)}${instruction.length > 100 ? '...' : ''}"`
    });

    // Build minimal context for reviser
    // The instruction becomes the action item
    const context = await runtime.buildContext(currentManuscript, {
        action_items: `- ${instruction}`,
        critique_summary: 'User-directed single action revision',
        critique_score: undefined
    });

    // Run reviser once
    const result = await runReviser(runtime, context, currentManuscript);

    // Update manuscript
    await updateManuscript(result.manuscript);

    runtime['emitLog']({
        agent: 'System',
        type: 'info',
        content: 'Single action revision complete.'
    });

    return result.manuscript;
}
