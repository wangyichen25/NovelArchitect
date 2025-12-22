# Manuscript Agent Implementation Plan

This document outlines the step-by-step plan to build the Manuscript Agent system. It is divided into an actionable checklist (Part 1) and the technical design reference (Part 2).

## Part 1: Implementation Checklist

### Phase 1: Database & Persistence Layer
*Goal: Establish the storage and synchronization mechanisms for agent state.*

- [x] **1.1. Create Supabase Migration**
    - Create `supabase/migrations/20240523000000_create_agent_state.sql` to define the `agent_state` table.
    - Fields: `id`, `user_id`, `novel_id`, `scene_id`, `instructions`, `max_passes`, `min_score`, `section_plan`, `sections_drafted`, `format_guidance`, `pass_index`, `history`, `last_modified`.
- [x] **1.2. Run Migration**
    - Execute the migration against the local/remote Supabase instance.
- [x] **1.3. Update Local DB Schema**
    - Update `src/lib/db/index.ts` (Dexie) to include the `agent_state` table definition matching the SQL schema.
- [x] **1.4. Update Sync Logic**
    - Update `src/lib/db/sync.ts`:
        - Add `syncAgentState` function (debounced).
        - Add `_syncAgentStateImmediate` function (upsert to Supabase).
        - Register triggers in `src/lib/db/index.ts` to call `syncAgentState` on changes.

### Phase 2: Runtime Engine Foundation
*Goal: Build the core logic for running agents, handling variables, and parsing output.*

- [x] **2.1. Create Runtime Skeleton**
    - Create `src/lib/agents/runtime.ts` class `AgentRuntime`.
- [x] **2.2. Implement Output Parser**
    - Create `src/lib/agents/parser.ts`:
        - `cleanJSON(text: string): string` (removes code fences, sanitizes common JSON errors).
        - `parseStartTag(text: string, tag: string): string | null` (extracts content between tags if we use XML, though plan implies JSON-heavy).
- [x] **2.3. Implement Variable Manager**
    - Create `src/lib/agents/variables.ts`:
        - `resolveVariables(prompt: string, context: AgentContext): string`.
        - Handle `Accumulating` vs `Ephemeral` lifecycle rules.
        - Implement JSON array -> Markdown list converters.
- [x] **2.4. Global Settings Integration**
    - In `runtime.ts`, implement `getAIClient()` which reads `localStorage` for `novel-architect-provider` and uses `AIProviderFactory`.

### Phase 3: UI Integration
*Goal: Create the user interface for interacting with the agents.*

- [x] **3.1. Create AI Workspace Shell**
    - Create `src/components/writer/AIWorkspace.tsx`.
    - Add to `WritePage.tsx` layout (right-side drawer or panel).
- [x] **3.2. Implement AI Write Tab**
    - Inputs: `Instructions` (Textarea), `Max Passes` (Number), `Min Score` (Number).
    - State: Local component state or Context for form values.
    - Connect `Start` button to a dummy handler.
- [x] **3.3. Implement Variable Inspector**
    - Create `VariableInspector.tsx` modal.
    - Add buttons in `AIWorkspace` to open inspector for `current_manuscript`, `section_plan`.

### Phase 4: Manager Agent Logic ✅ COMPLETE
*Goal: Implement the "Brain" that loops and calls other agents.*

- [x] **4.1. Manager Orchestration**
    - Create `src/lib/agents/manager.ts`.
    - Implement `getNextAction(state)` based on:
        - Missing format guidance -> **Format**.
        - Missing plan -> **Plan**.
        - Incomplete drafts -> **Write**.
        - Score < min_score -> **Critique**.
        - Critique has action items -> **Revise**.
- [x] **4.2. Formatter Agent**
    - Create `src/lib/agents/formatter.ts` using `Formatter` prompt.
    - Update `state.formatGuidance`.
- [x] **4.3. Planner Agent**
    - Create `src/lib/agents/planner.ts` using `Planner` prompt.
    - Update `state.sectionPlan`.
- [x] **4.4. Writer Agent**
    - Create `src/lib/agents/writer.ts` using `Writer` prompt.
    - Logic: Pick first section where `status != complete`.
    - Generate text, append to manuscript, mark section done.
- [x] **4.5. Critic & Reviser Agents**
    - Create `src/lib/agents/critic.ts` & `src/lib/agents/reviser.ts`.
    - `Critic`: Updates `state.critiqueScore` and `state.lastHistoryEntry`.
    - `Reviser`: Applies search/replace patches to `current_manuscript`.
    - Update `pass_index`.
- [x] **4.6. Runtime Loop & UI**
    - Update `src/lib/agents/runtime.ts` to manage the async loop.
    - Connect `Start` button in `AIWorkspace`.

### Phase 5: Citation Agent Logic
*Goal: Implement the Reference/Citation scanning and generation workflow.*

- [ ] **5.1. Citation Runtime**
    - Create `src/lib/agents/citation_runtime.ts` (or extend `runtime.ts`).
    - Implement linear pipeline: `Orchestrator` -> `Generator` (per target).
- [ ] **5.2. Citation Orchestrator Agent**
    - Create `src/lib/agents/citation_orchestrator.ts`.
    - Hook up `CitationOrchestrator` prompt.
    - Output: List of targets.
- [ ] **5.3. Citation Generator Agent**
    - Create `src/lib/agents/citation_generator.ts`.
    - Hook up `CitationGenerator` prompt.
    - Implement search/lookup logic if needed (or pure hallucination/formatting based on prompt).
- [ ] **5.4. Comparison & UI**
    - Implement "Diff View" for citation changes.
    - Connect `Scan References` button in `AIWorkspace` (Reference Tab).

---
# Part 2: Technical Design Reference & Glossary

## 1. Workflow Entry Points

The manuscript system operates via two distinct, mutually exclusive workflows. The user chooses the entry point at the start of the session.

### 1.1. Manager Workflow (Creation & Revision)
* **Trigger**: User selects "AI Write".
* **Goal**: Orchestrate the end-to-end creation or improvement of a manuscript.
* **Mechanism**: The **Manager Agent** acts as the central brain. It continuously loops, observing the state and delegating work to "Doer" agents (Formatter, Planner, Writer, Critic, Reviser).
* **Scope**: Structure, content, style, formatting, and iterative refinement.
* **Exclusions**: Does NOT handle the specific mechanical insertion or verification of citations.

### 1.2. Citation Workflow (Reference Handling)
* **Trigger**: User selects "AI Reference" (or similar).
* **Goal**: Scan the manuscript for claims, insert BibTeX citations, and normalize existing references.
* **Mechanism**: A linear pipeline controlled by the system (not the Manager Agent):
    1. **Citation Orchestrator**: Scans the text and identifies targets (sentences).
    2. **Citation Generator**: Processes each target to insert/format citations.
* **Scope**: Citation accuracy, BibTeX formatting, and evidence linkage.
* **Exclusions**: Does NOT rewrite content, change structure, or critique style.

## 2. Agent Definitions

Detailed specifications of the agents' roles, inputs, and outputs.

### 2.1. Manager Agent (Orchestrator)
* **Role**: The central brain that loops until the manuscript is complete. It decides the next step (Write, Critique, Revise, etc.) based on the current manuscript content and critique results.
* **Intake Variables**: `{instructions}`, `{current_manuscript}`, `{manuscript_word_count}`, `{pass_index}`, `{max_passes}`, `{last_history_entry}`, `{critique_score}`, `{min_score}`, `{has_format_guidance}`.
* **Outputs**: JSON decision with `action` (e.g., `write_section`, `critique_manuscript`) and `parameters`.

### 2.2. Formatter Agent (Strategist)
* **Role**: Analyzes instructions to determines the formatting, structure, and length constraints.
* **Intake Variables**: `{instructions}`.
* **Outputs**: `{format_guidance}` (Markdown string defining blueprint, structure, citations).

### 2.3. Planner Agent (Architect)
* **Role**: Converts instructions and formatting rules into a structured section-by-section outline. Also performs "Hybrid Planning" by scanning existing text to reconstruct the state and plan remaining sections.
* **Intake Variables**: `{instructions}`, `{format_guidance}`, `{current_manuscript}`.
* **Outputs**: `{section_plan}` (JSON array of sections with titles, summaries, status, and word counts).

### 2.4. Writer Agent (Author)
* **Role**: Drafts a single section of prose.
* **Intake Variables**: `{section_title}`, `{section_summary}`, `{instructions}`, `{format_guidance}`, `{current_manuscript}`.
* **Outputs**: JSON with `rationale` and `operations` (Find/Replace/Append) to update `{current_manuscript}`.

### 2.5. Critic Agent (Reviewer)
* **Role**: Reviews the full manuscript for quality, adherence to instructions, and flow. Ignored citations/formatting details.
* **Intake Variables**: `{instructions}`, `{format_guidance}`, `{current_manuscript}`.
* **Outputs**: `{critique_score}`, `{critique_summary}`, `{action_items}` (List of specific improvements).

### 2.6. Reviser Agent (Editor)
* **Role**: Implements specific revisions based on the Critic's feedback.
* **Intake Variables**: `{instructions}`, `{format_guidance}`, `{critique_summary}`, `{action_items}`, `{current_manuscript}`.
* **Outputs**: JSON with `status` (continue/satisfied), `rationale`, and `operations` (Find/Replace) to improve `{current_manuscript}`.

### 2.7. Citation Orchestrator (Scanner)
* **Role**: Scans the manuscript to identify sentences that need citation verification, insertion, or formatting.
* **Intake Variables**: `{current_manuscript}`, `{max_targets}`.
* **Outputs**: JSON with `citation_targets` (Array of sentences and reasons).

### 2.8. Citation Generator (Researcher)
* **Role**: For a specific target sentence, finds or formats the citation.
* **Intake Variables**: `{sentence_citation_target}`, `{reason_citation_target}`, `{section_title_citation_target}`, `{evidence_type_citation_target}`, `{existing_citations}`.
* **Outputs**: JSON with `updated_sentence` (Original sentence + inline BibTeX) and `notes`.

## 3. Variable Lifecycle & Data Flow

To ensure system stability, developers must treat placeholders according to their lifecycle type:

### 3.1. Lifecycle Types

- **Static (Read-Only)**
  - *Variables*: `{instructions}`, `{max_passes}`, `{min_score}`, `{max_hunks}`, `{max_targets}`
  - *Behavior*: Defined at the start of the job. Never changes. Safe to cache.
- **Accumulating (Persistent State)**
  - *Variables*: `{current_manuscript}`, `{manuscript_word_count}`, `{existing_citations}`, `{section_plan}`, `{sections_drafted}`, `{format_guidance}`, `{has_format_guidance}`, `{pass_index}`, `{last_history_entry}`
  - *Behavior*: Content grows, changes, or persists across multiple steps of the workflow. **MUST** be refreshed or retrieved from the latest state before every prompt generation.
- **Ephemeral (Transient Arguments)**
  - *Variables*: `{section_title}`, `{section_summary}`, `{section_word_count}`, `{critique_summary}`, `{critique_score}`, `{action_items}`, `{sentence_citation_target}`, `{reason_citation_target}`, `{section_title_citation_target}`, `{evidence_type_citation_target}`
  - *Behavior*: Valid ONLY for the immediate next tool call or agent step. Generated by a producer agent specifically for a consumer agent's immediate use. **MUST NOT** be persisted or reused across unrelated steps.

### 3.2. Data Transformation Contracts

Agents often output JSON, but Prompts require clear strings.

- **JSON Arrays → Markdown Lists**: Variables like `{action_items}` or `{sections_drafted}` originating as JSON arrays must be serialized into a bulleted markdown string (e.g., `- Item 1\n- Item 2`) before injection. **DO NOT** inject raw JSON strings unless the prompt specifically requests JSON.

## 4. Runtime Handling & Implementation

### 4.1. Verbatim Prompt Usage

The prompts in `manuscript_agent_prompts.ts` are carefully engineered.

- **Do not modify** the text or structure of the prompts.
- **Do not substitute** variable names.
- Use them exactly as exported.

### 4.2. Robust Output Parsing

LLMs are non-deterministic. Even when instructed to return *only* JSON, they may occasionally wrap output in markdown code fences or add conversational filler.

- **Strip Code Fences**: The runtime executor **MUST** programmatically detect and remove ` ```json ` and ` ``` ` wrappers before parsing.
- **Sanitize Keys**: Ensure extracted JSON keys match the well-expected types (e.g., ensure `score` is a number, not a string "0.8").

### 4.3. Runtime Resilience Protocols

To mitigate LLM stochasticity, the runtime environment **MUST** implement the following:

1. **Fuzzy Search & Replace**: The `ReviserAgent` and `WriterAgent` provide a `find` string. The runtime **MUST** use a fuzzy matching algorithm (e.g., Levenshtein distance < 5% of string length) to locate the target text.

### 4.4. Global AI Settings Integration

The manuscript writing AI **MUST** use the application's global AI settings. The user has explicitly specified **OpenRouter** as the mechanism for LLM usage.

- **Source of Truth**: The `AIProviderFactory` (in `src/lib/ai/providers.ts`) and the global `SettingsDialog` state.
- **Do Not Duplicate**: Developers **MUST NOT** create a separate configuration mechanism for the manuscript agents.
- **Provider & Model**: The runtime should instantiate the LLM client using **OpenRouter** based on the user's globally selected model found in `localStorage`.
- **OpenRouter Integration**: Ensure the `AIProviderFactory` and runtime are configured to route requests through OpenRouter.

## 5. Placeholder Definitions

The following tables define the standardized placeholders used across the agent prompts.

### 5.1. User Inputs

*Data provided directly by the user, representing the user's document, OR system configuration that the user controls/overrides.*

| Placeholder | Description | Origin | Consumers | Example |
| :--- | :--- | :--- | :--- | :--- |
| `{instructions}` | The user's high-level goal, topic, and constraints for the paper. | **User Input** (Initial Prompt) | Manager, Formatter, Planner, Writer, Critic, Reviser | "Write a review on the impact of AI on clinical diagnostics, focusing on radiology." |
| `{current_manuscript}` | The full markdown content of the manuscript.**MUST be perfectly synchronized** with the content of the **Write Page Scene Text Box** at all times. Any change in one maps 1:1 to the other. | **User Input** / **System State** | Planner, Writer, Critic, Reviser, Citation Orchestrator | "# Introduction\nArtificial intelligence has revolutionized..." |
| `{max_passes}` | Maximum number of critique/revision iterations allowed. | **User Input** / **System Config** | Manager | "3" |
| `{min_score}` | Minimum critique score required to consider the manuscript finished. | **User Input** / **System Config** | Manager | "0.8" |
| `{max_hunks}` | Maximum number of search/replace operations allowed. | **User Input** / **System Config** | Reviser | "5" |
| `{max_targets}` | Maximum number of citation targets to identify. | **User Input** / **System Config** | Citation Orchestrator | "10" |

### 5.2. System Inputs

*Data derived by the system logic, configuration settings, or calculated state.*

| Placeholder | Description | Origin | Consumers | Example |
| :--- | :--- | :--- | :--- | :--- |

| `{pass_index}` | The current iteration count for the critique/revise loop. | **Manager Logic** (Internal Loop Counter) | Manager | "0" |
| `{last_history_entry}` | Description of the last action outcome. | **Manager Logic** (Action History Log) | Manager | "Writer Agent composed 'Introduction' successfully." |
| `{has_format_guidance}` | Boolean indicating if format guidance exists. | **Manager Logic** (Flag checking for guidance artifact) | Manager | "true" |
| `{manuscript_word_count}` | Total word count of the current manuscript. | **System Logic** (Calculated) | Manager | "1500" |
| `{existing_citations}` | List of BibTeX entries already present in the manuscript. | **System Parsed** (Parsed list converted to text block) | Citation Generator | "@article{smith2023...}" |

### 5.3. Agent Inputs

*Data generated by one agent to be used by another. Note: JSON outputs from agents must be formatted into readable strings before injection.*

| Placeholder | Description | Origin | Consumers | Example |
| :--- | :--- | :--- | :--- | :--- |
| `{format_guidance}` | Specific formatting rules derived from user instructions or online research. | **Formatter Agent** (Activated by Manager calling `generate_format_guidance`) | Planner, Writer, Critic, Reviser | "### Formatting Blueprint\n- Sections: Intro, Methods, Results, Discussion." |
| `{section_plan}` | **The Outline content.** Summary of the section plan/structure. | **Planner Agent** (Stored output, formatted as list) | Writer | "- Introduction (Reviewing)\n- Methods (Drafting)\n- Results (Pending)" |
| `{section_title}` | The specific title of the section to be written. | **Planner Agent** (Field `section_title` from `sections` array in JSON response) | Writer | "Introduction" |
| `{section_summary}` | The specific plan for the section to be written. | **Planner Agent** (Field `section_summary` from `sections` array in JSON response) | Writer | "Introduce the concept of convolutional neural networks and their application in image recognition." |
| `{section_word_count}` | Target word count for the specific section. | **Planner Agent** (Field `section_word_count` from `sections` array in JSON response) | Writer | "500" |
| `{critique_summary}` | High-level summary of the manuscript's strengths and weaknesses. | **Critic Agent** (Field `critique_summary` from JSON response) | Reviser | "The draft covers the basics..." |
| `{critique_score}` | The quality score (0.0 - 1.0) from the last critique. | **Critic Agent** (Field `score` from JSON response) | Manager | "0.85" |
| `{action_items}` | List of high-priority revisions suggested by the critic. | **Critic Agent** (Field `action_items` **JSON Array** converted to **bulleted list string**) | Reviser | "- Expand discussion...\n- Fix terminology..." |
| `{sentence_citation_target}` | The exact sentence text to be processed for citations. | **Citation Orchestrator** (Field `sentence_citation_target` from `citation_targets` array in JSON response) | Citation Generator | "Deep learning has achieved dermatologist-level accuracy in melanoma detection." |
| `{reason_citation_target}` | The reason why this sentence was selected. | **Citation Orchestrator** (Field `reason_citation_target` from `citation_targets` array in JSON response) | Citation Generator | "Factual claim requiring evidence." |
| `{section_title_citation_target}` | The section heading containing the target sentence. | **Citation Orchestrator** (Field `section_title_citation_target` from `citation_targets` array in JSON response) | Citation Generator | "Results" |
| `{evidence_type_citation_target}` | The type of evidence needed (e.g., "statistic", "claim"). | **Citation Orchestrator** (Field `evidence_type_citation_target` from `citation_targets` array in JSON response) | Citation Generator | "clinical_study" |

## 6. UI Integration Design

To support the two workflows defined in Section 1, the "Write" page will be enhanced with an "AI Workspace" panel.

### 6.1. Component Architecture
* **AIWorkspace**: A right-side panel component in `WritePage`.
    * **Tabs**: "AI Write" (Manager Workflow) and "AI Reference" (Citation Workflow).
    * **State Wiring**: Receives `editorContent` from `NovelEditor` via `WritePage` state lifting.

### 6.2. AI Write Tab (Manager Workflow)
* **User Inputs**:
    * `instructions` (Textarea)
    * `max_passes`, `min_score` (Number inputs with defaults)
* **System Inputs (Hidden)**:
    * `current_manuscript`: Auto-synced from Editor.
* **Variable Inspector**:
    * Button group to view raw content of variables (e.g., `section_plan`, `format_guidance`, `last_history_entry`).
    * Click opens a modal with the JSON/Markdown content.
* **Controls**:
    * "Start / Resume" button to trigger the Manager Agent loop.

### 6.3. AI Reference Tab (Citation Workflow)
* **User Inputs**:
    * `max_targets` (Number input)
* **Controls**:
    * "Scan References" button to trigger `Citation Orchestrator`.
* **Variable Inspector**:
    * Buttons for `existing_citations`, `citation_targets`.

## 7. Data Persistence & Cloud Sync

To ensure that long-running agent workflows are resilient and available across devices, we extend the project's sync architecture.

### 7.1. Schema: `AgentState`
A new entity stored in both `Dexie` (local) and `Supabase` (cloud) to persist the "Brain" of the agents.

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Unique identifier. |
| `novelId` | UUID | Foreign key to Novel. |
| `sceneId` | UUID? | Optional Foreign key to Scene (if scene-specific). |
| `instructions` | string | User's high-level goal. |
| `maxPasses` | int | Configuration. |
| `minScore` | float | Configuration. |
| `sectionPlan` | JSON | The outline generated by Planner. |
| `sectionsDrafted` | JSON | Tracking of progress. |
| `formatGuidance` | string | Generated formatting rules. |
| `passIndex` | int | Current iteration loop count. |
| `history` | JSON | Log of agent actions (timestamp, action, summary). |
| `lastModified` | timestamp | For sync conflict resolution. |

### 7.2. Sync Strategy
* **Hooks**: The local `Dexie` database will fire triggers on `creating`/`updating` of `agent_state`.
* **Sync**: The `sync.ts` module will listen to these hooks and push changes to Supabase via `upsert`.
* **Debounce**: Updates (especially logs) will be debounced to prevent API flooding.

### 7.3. Cloud Migration
A new SQL migration file is required to create the `agent_state` table in Supabase.
```sql
create table if not exists agent_state (
    id uuid primary key,
    user_id uuid references auth.users(id) not null,
    novel_id uuid references novels(id) on delete cascade not null,
    scene_id uuid references scenes(id) on delete cascade,
    instructions text,
    -- ... (other fields mapping to schema)
    history jsonb default '[]',
    last_modified bigint
);
```
