
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Theme, DEFAULT_THEME_ID } from '@/types/theme';
import { defaultLightTheme } from '@/themes/light';
import { premiumDarkTheme } from '@/themes/dark-premium';
import { midnightTheme } from '@/themes/midnight';
import { forestTheme } from '@/themes/forest';
import { coffeeTheme } from '@/themes/coffee';

// Registry of available themes
// In a real ecosystem, this could be dynamic or fetched from an API
export const availableThemes: Theme[] = [
    defaultLightTheme,
    premiumDarkTheme,
    midnightTheme,
    forestTheme,
    coffeeTheme,
];

interface ThemeState {
    activeThemeId: string;
    activeTheme: Theme;
    setTheme: (themeId: string) => void;
}

const applyThemeToDom = (theme: Theme) => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;

    // Apply class for tailwind dark mode
    if (theme.type === 'dark') {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }

    // Apply colors
    Object.entries(theme.colors).forEach(([key, value]) => {
        root.style.setProperty(`--${key}`, value);
    });

    // Apply variables
    Object.entries(theme.variables).forEach(([key, value]) => {
        if (value) {
            root.style.setProperty(`--${key}`, value);
        }
    });
};

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            activeThemeId: DEFAULT_THEME_ID,
            activeTheme: defaultLightTheme,
            setTheme: (themeId: string) => {
                const theme = availableThemes.find((t) => t.id === themeId) || defaultLightTheme;
                applyThemeToDom(theme);
                set({ activeThemeId: themeId, activeTheme: theme });
            },
        }),
        {
            name: 'theme-storage',
            onRehydrateStorage: () => (state) => {
                if (state) {
                    applyThemeToDom(state.activeTheme);
                }
            },
        }
    )
);
