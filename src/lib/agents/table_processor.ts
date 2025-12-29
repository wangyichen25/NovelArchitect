/**
 * Table Processor Agent - Converts raw tables into LaTeX longtable format.
 */

import { AgentRuntime } from './runtime';
import { resolveVariables } from './variables';
import { validateKeys } from './parser';
import { TABLE_PROCESSOR_SYSTEM_PROMPT, TABLE_PROCESSOR_PROMPT } from './prompts';
import { AgentContext, TableProcessorOutput } from './types';
import { executeWithJSONRetry } from './json_retry';

/**
 * Extended context for table processor that includes raw table data.
 */
interface TableProcessorContext extends Partial<AgentContext> {
    raw_table: string;
}

/**
 * Execute the Table Processor agent to convert a raw table into LaTeX format.
 * @param runtime Agent runtime instance
 * @param context Agent context with variables
 * @param rawTable The raw table text to process
 * @returns TableProcessorOutput with find/replace operations
 */
export async function runTableProcessor(
    runtime: AgentRuntime,
    context: AgentContext,
    rawTable: string
): Promise<TableProcessorOutput> {
    // Build the context with table-specific variables
    const tableContext: TableProcessorContext = {
        ...context,
        raw_table: rawTable
    };

    // Resolve the prompt with variables
    const userPrompt = resolveVariables(TABLE_PROCESSOR_PROMPT, tableContext as any);

    // Execute agent (offline - no vision required) with JSON parse retry
    const { output } = await executeWithJSONRetry<TableProcessorOutput>(
        runtime,
        () => runtime.executeAgent(
            TABLE_PROCESSOR_SYSTEM_PROMPT,
            userPrompt,
            false, // requiresOnline
            'TableProcessor'
        ),
        'TableProcessor'
    );
    validateKeys(output, ['find', 'replace']);

    runtime['emitLog']({
        agent: 'TableProcessor',
        type: 'output',
        content: `Generated LaTeX table from raw data (${rawTable.substring(0, 50)}...)`
    });

    await runtime.addHistory(
        'process_table',
        `Processed raw table into LaTeX longtable format`,
        true
    );

    return output;
}
