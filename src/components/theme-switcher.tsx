"use client";

import * as React from "react";
import { Moon, Sun, Check, Palette, ChevronDown } from "lucide-react";
import { useThemeStore, availableThemes } from "@/lib/theme-manager";
import { Button } from "@/components/ui/button";

export function ThemeSwitcher() {
    const { activeThemeId, setTheme } = useThemeStore();
    const [isOpen, setIsOpen] = React.useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    // Close when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const activeTheme = availableThemes.find(t => t.id === activeThemeId) || availableThemes[0];

    return (
        <div className="relative" ref={dropdownRef}>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(!isOpen)}
                className="h-9 gap-2 px-3 font-normal text-muted-foreground hover:text-foreground"
            >
                <Palette className="h-4 w-4" />
                <span className="hidden sm:inline-block">{activeTheme.name}</span>
                <ChevronDown className={`h-3 w-3 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </Button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-border/50 bg-popover p-1 shadow-lg animate-in fade-in zoom-in-95 duration-200 z-50">
                    {availableThemes.map((theme) => (
                        <button
                            key={theme.id}
                            onClick={() => {
                                setTheme(theme.id);
                                setIsOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${activeThemeId === theme.id ? "bg-accent/50 text-accent-foreground font-medium" : "text-popover-foreground"
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                {theme.type === 'dark' ? <Moon className="h-3 w-3 opacity-70" /> : <Sun className="h-3 w-3 opacity-70" />}
                                {theme.name}
                            </div>
                            {activeThemeId === theme.id && <Check className="h-3 w-3 opacity-70" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
