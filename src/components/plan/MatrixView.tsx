
"use client";

import { useMemo, useState } from "react";
import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    createColumnHelper,
} from "@tanstack/react-table";
import { Scene } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLiveQuery } from "dexie-react-hooks";
import { useParams } from "next/navigation";
import { CodexEntry } from "@/lib/db/schema";

import { useProjectStore } from "@/hooks/useProject";
import { useRouter } from "next/navigation";

export default function MatrixView() {
    const params = useParams();
    const novelId = params.id as string;
    const router = useRouter();
    const { setActiveScene } = useProjectStore();

    const scenes = useLiveQuery(
        () => db.scenes.where({ novelId }).toArray().then(rows =>
            rows.sort((a, b) => a.order - b.order)
        ),
        [novelId]
    );

    // We also need characters and locations for dropdowns
    const characters = useLiveQuery(() => db.codex.where({ novelId, category: 'character' }).toArray()) || [];
    const locations = useLiveQuery(() => db.codex.where({ novelId, category: 'location' }).toArray()) || [];

    const updateScene = (id: string, field: string, value: any) => {
        db.scenes.update(id, { [field]: value });
    };

    const updateMetadata = (id: string, metaField: string, value: any) => {
        db.scenes.get(id).then(scene => {
            if (scene) {
                db.scenes.update(id, { metadata: { ...scene.metadata, [metaField]: value } });
            }
        });
    };

    const handleRowClick = (e: React.MouseEvent, sceneId: string) => {
        // Prevent navigation if clicking on an input or select
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') {
            return;
        }

        setActiveScene(sceneId);
        router.push(`/project/${novelId}/write`);
    };

    const columnHelper = createColumnHelper<Scene>();

    const columns = useMemo(() => [
        columnHelper.accessor('order', {
            header: '#',
            cell: info => info.getValue(),
            size: 50,
        }),
        columnHelper.accessor('title', {
            header: 'Scene Title',
            cell: info => (
                <Input
                    value={info.getValue()}
                    onChange={e => updateScene(info.row.original.id, 'title', e.target.value)}
                    className="h-8 border-transparent focus:border-input bg-transparent"
                />
            ),
        }),
        columnHelper.display({
            id: 'pov',
            header: 'POV Character',
            cell: info => (
                <select
                    className="w-full bg-transparent text-sm h-8 border-none focus:outline-none"
                    value={info.row.original.metadata?.povCharacterId || ''}
                    onChange={e => updateMetadata(info.row.original.id, 'povCharacterId', e.target.value || null)}
                    onClick={e => e.stopPropagation()}
                >
                    <option value="">Unknown</option>
                    {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            )
        }),
        columnHelper.display({
            id: 'location',
            header: 'Location',
            cell: info => (
                <select
                    className="w-full bg-transparent text-sm h-8 border-none focus:outline-none"
                    value={info.row.original.metadata?.locationId || ''}
                    onChange={e => updateMetadata(info.row.original.id, 'locationId', e.target.value || null)}
                    onClick={e => e.stopPropagation()}
                >
                    <option value="">Unknown</option>
                    {locations.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            )
        }),
        columnHelper.display({
            id: 'time',
            header: 'Time',
            cell: info => (
                <Input
                    value={info.row.original.metadata?.timeOfDay || ''}
                    onChange={e => updateMetadata(info.row.original.id, 'timeOfDay', e.target.value)}
                    className="h-8 border-transparent focus:border-input bg-transparent"
                    placeholder="e.g. Noon"
                />
            )
        }),
        columnHelper.display({
            id: 'status',
            header: 'Status',
            cell: info => (
                <select
                    className="w-full bg-transparent text-sm h-8 border-none focus:outline-none"
                    value={info.row.original.metadata?.status || 'draft'}
                    onChange={e => updateMetadata(info.row.original.id, 'status', e.target.value)}
                    onClick={e => e.stopPropagation()}
                >
                    <option value="draft">Draft</option>
                    <option value="revised">Revised</option>
                    <option value="final">Final</option>
                </select>
            )
        }),
    ], [characters, locations]);

    const table = useReactTable({
        data: scenes || [],
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    if (!scenes) return <div>Loading Matrix...</div>;

    return (
        <div className="p-4 overflow-auto h-full">
            <h2 className="text-xl font-bold font-serif mb-4">The Matrix</h2>
            <div className="rounded-md border">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted text-muted-foreground sticky top-0 z-10 shadow-sm">
                        {table.getHeaderGroups().map(headerGroup => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map(header => (
                                    <th key={header.id} className="h-10 px-4 font-medium align-middle">
                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {table.getRowModel().rows.map(row => (
                            <tr
                                key={row.id}
                                className="border-t hover:bg-muted/50 transition-colors cursor-pointer"
                                onClick={(e) => handleRowClick(e, row.original.id)}
                            >
                                {row.getVisibleCells().map(cell => (
                                    <td key={cell.id} className="p-2 align-middle">
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
