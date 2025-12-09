
"use client";

import { useProjectStore } from "@/hooks/useProject";

import SettingsDialog from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { Book, PenTool, LayoutGrid, Settings, ChevronLeft, ChevronRight, Menu } from "lucide-react";
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
        { icon: LayoutGrid, label: "Plan", path: `/project/${id}/plan` },
        { icon: Book, label: "Codex", path: `/project/${id}/codex` },
    ];

    return (
        <div className="flex h-screen bg-background overflow-hidden">
            {/* Left Navigation Bar (Mini) */}
            <div className="w-16 border-r flex flex-col items-center py-4 gap-4 bg-muted/10 z-30">
                <Button variant="ghost" size="icon" onClick={() => router.push('/')} title="Back to Dashboard" className="mb-4">
                    <LayoutGrid className="h-6 w-6 text-primary" />
                </Button>
                {navItems.map(item => (
                    <Button
                        key={item.path}
                        variant={pathname === item.path ? "default" : "ghost"}
                        size="icon"
                        onClick={() => router.push(item.path)}
                        title={item.label}
                    >
                        <item.icon className="h-5 w-5" />
                    </Button>
                ))}
                <div className="flex-1" />
                <SettingsDialog />
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                {children}
            </div>
        </div>
    );
}
