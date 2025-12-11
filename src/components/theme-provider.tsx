"use client";

import { useEffect, useState } from 'react';
import { useThemeStore } from '@/lib/theme-manager';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const { activeTheme } = useThemeStore();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        // The store's onRehydrateStorage handles initial application,
        // but we can also force re-application here if needed to be safe
        // preventing hydration mismatch is tricky with dynamic styles on html
        // The store persists to localStorage so it should match eventually.
    }, []);

    if (!mounted) {
        // Optional: render contents with default theme (handled by CSS fallback) or nothing
        return <>{children}</>;
    }

    return <>{children}</>;
}
