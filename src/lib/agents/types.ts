/**
 * TypeScript interfaces for the Manuscript Agent system.
 */

import { AgentState } from '@/lib/db/schema';

/**
 * Context object containing all variables available for prompt resolution.
 */
export interface AgentContext {
    // User Inputs (Static)
    instructions: string;
    current_manuscript: string;
    max_passes: number;
    min_score: number;
    max_hunks: number;
    max_targets: number;

    // System Inputs (Accumulating)
    pass_index: number;
    last_history_entry: string;
    has_format_guidance: boolean;
    manuscript_word_count: number;
    existing_citations: string;

    // Agent Inputs (Accumulating or Ephemeral)
    format_guidance?: string;
    section_plan?: string; // Formatted as markdown list
    sections_drafted?: string; // Formatted as markdown list

    // Ephemeral (passed to specific agents)
    section_title?: string;
    section_summary?: string;
    section_word_count?: number;
    critique_summary?: string;
    critique_score?: number;
    action_items?: string; // Formatted as markdown list

    // Citation workflow (ephemeral)
    sentence_citation_target?: string;
    reason_citation_target?: string;
    section_title_citation_target?: string;
    evidence_type_citation_target?: string;
}

/**
 * Manager agent decision output
 */
export interface ManagerDecision {
    action: 'generate_format_guidance' | 'generate_plan' | 'write_section' | 'critique_manuscript' | 'revise_manuscript' | 'finish';
    parameters?: {
        section_title?: string;
        [key: string]: any;
    };
    reasoning: string;
}

/**
 * Planner agent output
 */
export interface PlannerOutput {
    sections: PlanSection[];
}

export interface PlanSection {
    section_title: string;
    status: 'complete' | 'todo';
    section_summary: string;
    section_word_count: number;
}

/**
 * Writer agent output
 */
export interface WriterOutput {
    rationale: string;
    operations: WriteOperation[];
}

export interface WriteOperation {
    find: string;
    replace: string;
    section_title: string;
}

/**
 * Critic agent output
 */
export interface CriticOutput {
    critic_summary: string;
    score: number;
    action_items: string[];
}

/**
 * Reviser agent output
 */
export interface ReviserOutput {
    status: 'continue' | 'satisfied';
    rationale: string;
    operations: ReviseOperation[];
}

export interface ReviseOperation {
    find: string;
    replace: string;
    count?: number | 'all';
    reason?: string;
}

/**
 * Citation Orchestrator output
 */
export interface CitationOrchestratorOutput {
    citation_targets: CitationTarget[];
}

export interface CitationTarget {
    sentence_citation_target: string;
    section_title_citation_target: string;
    reason_citation_target: string;
    evidence_type_citation_target: string;
}

/**
 * Citation Generator output
 */
export interface CitationGeneratorOutput {
    updated_sentence: string;
    notes?: string;
}

/**
 * Log entry for UI display
 */
export interface LogEntry {
    id: string;
    timestamp: number;
    agent: 'Manager' | 'Formatter' | 'Planner' | 'Writer' | 'Critic' | 'Reviser' | 'CitationOrchestrator' | 'CitationGenerator' | 'System';
    type: 'input' | 'output' | 'error' | 'info';
    content: string;
    metadata?: any;
}

/**
 * History entry stored in agent state
 */
export interface HistoryEntry {
    timestamp: number;
    action: string;
    summary: string;
    success: boolean;
    error?: string;
}
