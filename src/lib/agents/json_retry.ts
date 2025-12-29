/**
 * Helper utilities for resilient agent execution.
 * Retries an agent call when JSON parsing fails, to handle occasional malformed LLM output.
 */

import { parseJSON } from './parser';
import type { AgentRuntime } from './runtime';

/**
 * Execute an agent call that returns JSON and retry on parse failure.
 * @param runtime Agent runtime instance
 * @param call Function that executes the agent and returns raw text
 * @param agentName Name of the agent (for logging/history)
 * @param maxRetries Number of retry attempts on parse failure (default: 1)
 * @returns Parsed output and raw response text
 */
export async function executeWithJSONRetry<T>(
    runtime: AgentRuntime,
    call: () => Promise<string>,
    agentName: string,
    maxRetries: number = 1
): Promise<{ output: T; raw: string }> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await call();

        try {
            const parsed = parseJSON<T>(response);

            if (attempt > 0) {
                await runtime.addHistory(
                    'agent_retry',
                    `${agentName} succeeded after retry ${attempt + 1}`,
                    true
                );
            }

            return { output: parsed, raw: response };
        } catch (error) {
            lastError = error;

            await runtime.addHistory(
                'agent_parse_error',
                `${agentName} parse failed on attempt ${attempt + 1}`,
                false,
                error instanceof Error ? error.message : String(error)
            );

            if (attempt === maxRetries) {
                throw error;
            }
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error(`${agentName} failed to parse output after retries`);
}
