
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProjectState {
    activeSceneId: string | null;
    isSidebarOpen: boolean;
    activeAiModel: string;
    // Logs State
    logs: any[]; // Using any[] for now to avoid circular dependency, but should be LogEntry[]
    isLogsOpen: boolean;

    setActiveScene: (id: string | null) => void;
    toggleSidebar: () => void;
    setActiveAiModel: (model: string) => void;

    // Logs Actions
    setLogs: (logs: any[]) => void;
    addLog: (log: any) => void;
    toggleLogs: () => void;
    setLogsOpen: (isOpen: boolean) => void;
}

export const useProjectStore = create<ProjectState>()(
    persist(
        (set) => ({
            activeSceneId: null,
            isSidebarOpen: true,
            activeAiModel: 'gpt-4-turbo',
            logs: [],
            isLogsOpen: true,

            setActiveScene: (id) => set({ activeSceneId: id }),
            toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
            setActiveAiModel: (model) => set({ activeAiModel: model }),

            setLogs: (logs) => set({ logs }),
            addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
            toggleLogs: () => set((state) => ({ isLogsOpen: !state.isLogsOpen })),
            setLogsOpen: (isOpen) => set({ isLogsOpen: isOpen }),
        }),
        {
            name: 'novel-architect-storage', // unique name
            partialize: (state) => ({
                isSidebarOpen: state.isSidebarOpen,
                activeAiModel: state.activeAiModel,
                activeSceneId: state.activeSceneId,
                isLogsOpen: state.isLogsOpen
                // Logs are NOT persisted here, they rely on DB or runtime
            }),
        }
    )
);
