
"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function ProjectRootPage() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;

    useEffect(() => {
        if (!id) return;

        const lastPath = localStorage.getItem(`novel-architect-last-path-${id}`);
        // Avoid redirect loop if stored path is the root path itself
        if (lastPath && lastPath !== `/project/${id}`) {
            router.replace(lastPath);
        } else {
            router.replace(`/project/${id}/write`);
        }
    }, [id, router]);

    return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading project...
        </div>
    );
}
