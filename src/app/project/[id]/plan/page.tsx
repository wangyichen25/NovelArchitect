
"use client";

import MatrixView from "@/components/plan/MatrixView";
import GridView from "@/components/plan/GridView";
import { Button } from "@/components/ui/button";
import { LayoutGrid, Table } from "lucide-react";
import { useState } from "react";

export default function PlanPage() {
    const [view, setView] = useState<'grid' | 'matrix'>('grid');

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="border-b p-2 flex justify-end gap-2 bg-muted/10">
                <Button
                    variant={view === 'grid' ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setView('grid')}
                >
                    <LayoutGrid className="mr-2 h-4 w-4" /> Grid
                </Button>
                <Button
                    variant={view === 'matrix' ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setView('matrix')}
                >
                    <Table className="mr-2 h-4 w-4" /> Matrix
                </Button>
            </div>

            <div className="flex-1 overflow-hidden">
                {view === 'grid' ? <GridView /> : <MatrixView />}
            </div>
        </div>
    );
}
