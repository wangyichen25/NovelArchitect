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
    main_text_word_count: number;
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
    context_before_citation_target?: string;
    context_after_citation_target?: string;
    reason_citation_target?: string;
    section_title_citation_target?: string;
    evidence_type_citation_target?: string;
    already_identified_targets?: string;

    // Figure processor (ephemeral)
    images?: string; // Comma-separated image filenames

    // Formatter only (optional sample paper for format reference)
    sample_paper?: string; // Sample paper content for format guidance extraction
}

/**
 * Manager agent decision output
 */
export interface ManagerDecision {
    action: 'generate_format_guidance' | 'process_images' | 'process_tables' | 'generate_plan' | 'write_section' | 'critique_and_improve_manuscript' | 'revise_manuscript' | 'finish';
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
    status?: 'complete' | 'todo'; // Optional - manager determines completeness from manuscript
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
    rationale?: string; // Optional - brief explanation of changes
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
    context_before_citation_target?: string;
    context_after_citation_target?: string;
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
 * Figure Processor agent output
 */
export interface FigureProcessorOutput {
    figure_caption: string;
    find: string;
    replace: string;
}

/**
 * Table Processor agent output
 */
export interface TableProcessorOutput {
    find: string;
    replace: string;
}

/**
 * Log entry for UI display
 */
export interface LogEntry {
    id: string;
    timestamp: number;
    agent: 'Manager' | 'Formatter' | 'FigureProcessor' | 'TableProcessor' | 'Planner' | 'Writer' | 'Critic' | 'Reviser' | 'CitationOrchestrator' | 'CitationGenerator' | 'System';
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
