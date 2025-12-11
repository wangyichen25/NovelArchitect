
"use client";

import { useProjectStore } from "@/hooks/useProject";

import SettingsDialog from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { Book, PenTool, LayoutGrid, Settings, ChevronLeft, ChevronRight, Menu, Map } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import { useEffect } from "react";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
    const params = useParams();
    const id = params.id as string;
    const router = useRouter();
    const pathname = usePathname();


    useEffect(() => {
        if (id && pathname && pathname.startsWith(`/project/${id}`) && pathname !== `/project/${id}`) {
            localStorage.setItem(`novel-architect-last-path-${id}`, pathname);
        }
    }, [id, pathname]);

    const navItems = [
        { icon: PenTool, label: "Write", path: `/project/${id}/write` },
        { icon: Map, label: "Plan", path: `/project/${id}/plan` },
        { icon: Book, label: "Codex", path: `/project/${id}/codex` },
    ];

    return (
        <div className="flex flex-col h-screen bg-background overflow-hidden md:flex-row relative selection:bg-primary/20">

            {/* Background effects for premium feel */}
            <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-secondary/20 pointer-events-none -z-10" />

            {/* Left Navigation Bar (Desktop) */}
            <div className="hidden md:flex w-20 border-r border-white/5 flex-col items-center py-6 gap-6 glass z-30">
                <Button variant="ghost" size="icon" onClick={() => router.push('/')} title="Back to Dashboard" className="mb-2 hover:bg-primary/20 hover:text-primary transition-all duration-300 rounded-xl">
                    <LayoutGrid className="h-6 w-6" />
                </Button>

                <div className="w-8 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent mb-2" />

                {navItems.map(item => {
                    const isActive = pathname?.startsWith(item.path);
                    return (
                        <div key={item.path} className="relative group">
                            {isActive && (
                                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-10 bg-gradient-to-b from-primary to-accent rounded-r-full shadow-[0_0_15px_rgba(var(--primary),0.6)] animate-pulse" />
                            )}
                            <Button
                                variant={isActive ? "secondary" : "ghost"}
                                size="icon"
                                onClick={() => router.push(item.path)}
                                title={item.label}
                                className={`h-12 w-12 rounded-xl transition-all duration-300 relative overflow-hidden ${isActive ? 'bg-primary/20 text-primary ring-1 ring-primary/30 shadow-[0_0_20px_rgba(var(--primary),0.2)]' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
                            >
                                {isActive && <div className="absolute inset-0 bg-primary/10 blur-md" />}
                                <item.icon className={`h-5 w-5 relative z-10 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                            </Button>
                            {/* Tooltip-ish label on hover */}
                            <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 glass text-primary-foreground text-xs font-medium rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 whitespace-nowrap z-50 translate-x-2 group-hover:translate-x-0">
                                {item.label}
                            </div>
                        </div>
                    );
                })}
                <div className="flex-1" />
                <SettingsDialog />
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden relative pb-16 md:pb-0 bg-background/40 backdrop-blur-[2px]">
                {children}
            </div>

            {/* Bottom Navigation Bar (Mobile) */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-border/40 bg-background/80 backdrop-blur-xl flex items-center justify-around px-4 z-50 pb-safe">
                <Button variant="ghost" size="icon" onClick={() => router.push('/')} title="Dashboard" className="text-muted-foreground">
                    <LayoutGrid className="h-5 w-5" />
                </Button>
                {navItems.map(item => {
                    const isActive = pathname?.startsWith(item.path);
                    return (
                        <Button
                            key={item.path}
                            variant={isActive ? "secondary" : "ghost"}
                            size="icon"
                            onClick={() => router.push(item.path)}
                            title={item.label}
                            className={`rounded-xl transition-all ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                        >
                            <item.icon className="h-5 w-5" />
                        </Button>
                    );
                })}
                <SettingsDialog />
            </div>
        </div>
    );
}
