/**
 * Core runtime engine for executing manuscript agents.
 * Handles AI client integration, state management, and agent execution.
 */

import { db } from '@/lib/db';
import { AgentState } from '@/lib/db/schema';
import { AIProviderFactory } from '@/lib/ai/providers';
import { resolveVariables, buildAgentContext } from './variables';
import { parseJSON, validateKeys, parseNumber } from './parser';
import { AgentContext, LogEntry, HistoryEntry } from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Agent Runtime class - executes agents and manages workflow state.
 */
export class AgentRuntime {
    private novelId: string;
    private sceneId?: string;
    private stateId?: string;
    private logCallbacks: Array<(log: LogEntry) => void> = [];

    constructor(novelId: string, sceneId?: string) {
        this.novelId = novelId;
        this.sceneId = sceneId;
    }

    /**
     * Register a callback to receive log entries.
     */
    onLog(callback: (log: LogEntry) => void): void {
        this.logCallbacks.push(callback);
    }

    /**
     * Emit a log entry to all registered callbacks.
     */
    private emitLog(log: Omit<LogEntry, 'id' | 'timestamp'>): void {
        const entry: LogEntry = {
            id: uuidv4(),
            timestamp: Date.now(),
            ...log
        };
        this.logCallbacks.forEach(cb => cb(entry));
    }

    /**
     * Get AI model from global settings.
     * @param requiresOnline Whether the agent needs internet access (web search)
     * @returns AI model instance
     */
    private async getAIModel(requiresOnline: boolean = false) {
        // Get provider from localStorage (global settings)
        const provider = typeof window !== 'undefined'
            ? localStorage.getItem('novel-architect-provider') || 'openrouter'
            : 'openrouter';

        const model = typeof window !== 'undefined'
            ? localStorage.getItem('novel-architect-model') || 'auto'
            : 'auto';

        this.emitLog({
            agent: 'System',
            type: 'info',
            content: `Using AI provider: ${provider}, model: ${model}, online: ${requiresOnline}`
        });

        return AIProviderFactory.getModel(provider);
    }

    /**
     * Execute an agent with the given prompts.
     * @param systemPrompt System prompt for the agent
     * @param userPrompt User prompt with variables resolved
     * @param requiresOnline Whether the agent needs internet access
     * @param agentName Name of the agent for logging
     * @returns Raw LLM response text
     */
    async executeAgent(
        systemPrompt: string,
        userPrompt: string,
        requiresOnline: boolean,
        agentName: string
    ): Promise<string> {
        try {
            this.emitLog({
                agent: agentName as any,
                type: 'input',
                content: `Executing ${agentName} agent...`,
                metadata: { systemPrompt, userPrompt }
            });

            const model = await this.getAIModel(requiresOnline);

            // Use the AI SDK generateText function
            const { generateText } = await import('ai');
            const result = await generateText({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ]
            });

            const response = result.text;

            this.emitLog({
                agent: agentName as any,
                type: 'output',
                content: response.substring(0, 500) + (response.length > 500 ? '...' : ''),
                metadata: { fullResponse: response }
            });

            return response;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.emitLog({
                agent: agentName as any,
                type: 'error',
                content: `Error executing ${agentName}: ${errorMsg}`
            });
            throw error;
        }
    }

    /**
     * Load or create agent state from database.
     */
    async getOrCreateState(instructions: string, maxPasses: number, minScore: number): Promise<AgentState> {
        // Try to find existing state for this novel/scene
        const existing = await db.agent_state
            .where('novelId')
            .equals(this.novelId)
            .and(s => this.sceneId ? s.sceneId === this.sceneId : true)
            .first();

        if (existing) {
            this.stateId = existing.id;
            this.emitLog({
                agent: 'System',
                type: 'info',
                content: 'Loaded existing agent state'
            });
            return existing;
        }

        // Get userId from Supabase auth
        let userId = '';
        try {
            const { createClient } = await import('@/lib/supabase/client');
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            userId = session?.user?.id || '';
        } catch (error) {
            console.warn('[Runtime] Could not get userId from Supabase:', error);
        }

        // Create new state
        const newState: AgentState = {
            id: uuidv4(),
            userId,
            novelId: this.novelId,
            sceneId: this.sceneId,
            instructions,
            maxPasses,
            minScore,
            maxHunks: 5,
            maxTargets: 10,
            passIndex: 0,
            history: [],
            actionHistory: [],
            lastModified: Date.now()
        };

        await db.agent_state.add(newState);
        this.stateId = newState.id;

        this.emitLog({
            agent: 'System',
            type: 'info',
            content: 'Created new agent state'
        });

        return newState;
    }

    /**
     * Update agent state in database.
     */
    async updateState(updates: Partial<AgentState>): Promise<void> {
        if (!this.stateId) {
            throw new Error('No state ID - call getOrCreateState first');
        }

        await db.agent_state.update(this.stateId, {
            ...updates,
            lastModified: Date.now()
        });
    }

    /**
     * Add an entry to the history log.
     */
    async addHistory(action: string, summary: string, success: boolean, error?: string): Promise<void> {
        if (!this.stateId) return;

        const state = await db.agent_state.get(this.stateId);
        if (!state) return;

        const history = state.actionHistory || [];
        const entry: HistoryEntry = {
            timestamp: Date.now(),
            action,
            summary,
            success,
            error
        };

        history.push(entry);
        await this.updateState({ actionHistory: history });
    }

    /**
     * Build agent context from current state and manuscript.
     */
    async buildContext(currentManuscript: string, ephemeralVars: Partial<AgentContext> = {}): Promise<AgentContext> {
        if (!this.stateId) {
            throw new Error('No state ID - call getOrCreateState first');
        }

        const state = await db.agent_state.get(this.stateId);
        if (!state) {
            throw new Error('State not found');
        }

        return buildAgentContext(state, currentManuscript, ephemeralVars);
    }
}
