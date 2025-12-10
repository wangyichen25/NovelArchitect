
export interface Novel {
    id: string; // UUID
    title: string;
    author: string;
    createdAt: number;
    lastModified: number;
    settings: ProjectSettings;
}

export interface ProjectSettings {
    theme: 'light' | 'dark' | 'system';
    /** @deprecated Moved to Global/Profile Settings */
    aiProvider?: 'openai' | 'anthropic' | 'ollama' | 'openrouter';
    /** @deprecated Moved to Global/Profile Settings */
    apiKey?: string;
    imageStyles?: string[]; // Custom presets for image generation
    lastActiveSceneId?: string | null; // Syncs cursor position
    activeAiModel?: string; // Syncs model selection (Can still be per-project if desired, but currently we made it global. Leaving optional)
}

export interface Act {
    id: string; // UUID
    novelId: string;
    title: string;
    order: number;
    summary: string; // Used for global context injection
}

export interface Chapter {
    id: string;
    actId: string;
    title: string;
    order: number;
    summary: string; // Used for previous-chapter context
}

export interface Scene {
    id: string;
    novelId: string;
    chapterId: string;
    title: string;
    content: any; // ProseMirror JSON Object
    beats: string; // The directional instructions for AI
    order: number;
    lastModified?: number;
    metadata: {
        povCharacterId: string | null;
        locationId: string | null;
        timeOfDay: string;
        wordCount: number;
        status: 'draft' | 'revised' | 'final';
        lastAnalyzed?: number; // Timestamp of last auto-extraction
    };
    // Cache for detected codex mentions to speed up rendering
    cachedMentions: string[];
}

export interface CodexEntry {
    id: string;
    novelId: string;
    category: 'character' | 'location' | 'object' | 'lore';
    name: string;
    aliases: string[];
    description: string;
    visualSummary?: string; // For image generation prompts (e.g. Stable Diffusion)
    image?: string; // URL or Base64 of generated image
    gallery?: string[]; // History of generated images
    relations: CodexRelation[];
}

export interface CodexRelation {
    targetId: string;
    type: string;
    description: string;
}

export interface PromptPreset {
    id: string; // UUID
    name: string;
    prompt: string;
    lastUsed?: number;
}
