
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProjectState {
    activeSceneId: string | null;
    isSidebarOpen: boolean;
    activeAiModel: string;
    setActiveScene: (id: string | null) => void;
    toggleSidebar: () => void;
    setActiveAiModel: (model: string) => void;
}

export const useProjectStore = create<ProjectState>()(
    persist(
        (set) => ({
            activeSceneId: null,
            isSidebarOpen: true,
            activeAiModel: 'gpt-4-turbo',
            setActiveScene: (id) => set({ activeSceneId: id }),
            toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
            setActiveAiModel: (model) => set({ activeAiModel: model }),
        }),
        {
            name: 'novel-architect-storage', // unique name
            partialize: (state) => ({
                isSidebarOpen: state.isSidebarOpen,
                activeAiModel: state.activeAiModel,
                activeSceneId: state.activeSceneId
            }),
        }
    )
);
