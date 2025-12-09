
"use client";

import { useState } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Scene } from '@/lib/db/schema';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'next/navigation';

function SortableItem({ id, scene }: { id: string, scene: Scene }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="bg-card text-card-foreground p-4 rounded-md border shadow-sm h-32 flex flex-col justify-between cursor-move hover:border-primary transition-colors"
        >
            <div className="font-bold">{scene.title}</div>
            <div className="text-xs text-muted-foreground flex justify-between">
                <span>{scene.metadata?.wordCount || 0} words</span>
                <span className={`px-2 py-0.5 rounded-full ${scene.metadata?.status === 'final' ? 'bg-green-100 text-green-800' :
                    scene.metadata?.status === 'revised' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'
                    }`}>
                    {scene.metadata?.status || 'draft'}
                </span>
            </div>
        </div>
    );
}

export default function GridView() {
    const params = useParams();
    const novelId = params.id as string;

    // Fetch and Sort Locally
    // Note: LiveQuery returns array from DB. We need local state for optimistic drag updates.
    const scenes = useLiveQuery(
        () => db.scenes.where({ novelId }).toArray().then(r => r.sort((a, b) => a.order - b.order)),
        [novelId]
    );

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = async (event: any) => {
        const { active, over } = event;

        if (active.id !== over.id && scenes) {
            const oldIndex = scenes.findIndex(s => s.id === active.id);
            const newIndex = scenes.findIndex(s => s.id === over.id);

            const newOrder = arrayMove(scenes, oldIndex, newIndex);

            // Persist Order
            // Naive approach: update all order fields. 
            // Better approach: use LexoRank or floating point numbers. 
            // For N < 1000, updating all is fast enough in IndexedDB.
            db.transaction('rw', db.scenes, async () => {
                const updates = newOrder.map((s, idx) => db.scenes.update(s.id, { order: idx }));
                await Promise.all(updates);
            });
        }
    }

    if (!scenes) return <div>Loading Grid...</div>;

    return (
        <div className="p-4 h-full overflow-auto">
            <h2 className="text-xl font-bold font-serif mb-4">The Grid</h2>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={scenes.map(s => s.id)}
                    strategy={rectSortingStrategy}
                >
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {scenes.map(scene => <SortableItem key={scene.id} id={scene.id} scene={scene} />)}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}
