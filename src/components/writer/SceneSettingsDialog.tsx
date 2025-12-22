import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, X, Upload, Pencil, Check } from "lucide-react";
import { ProjectImage } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

interface SceneSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentTitle: string;
    currentImages?: ProjectImage[];
    onRename: (newTitle: string) => Promise<void>;
    onUpdateImages: (images: ProjectImage[]) => Promise<void>;
    onDelete: () => Promise<void>;
}

export function SceneSettingsDialog({
    open,
    onOpenChange,
    currentTitle,
    currentImages,
    onRename,
    onUpdateImages,
    onDelete
}: SceneSettingsDialogProps) {
    const [title, setTitle] = useState(currentTitle);
    const [images, setImages] = useState<ProjectImage[]>(currentImages || []);
    const [isDeleting, setIsDeleting] = useState(false);
    const [editingImageId, setEditingImageId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const [hoveredImage, setHoveredImage] = useState<string | null>(null);

    // Update local state when prop changes
    useEffect(() => {
        setTitle(currentTitle);
        setImages(currentImages || []);
    }, [currentTitle, currentImages]);

    const handleSave = async () => {
        await Promise.all([
            onRename(title),
            onUpdateImages(images)
        ]);
        onOpenChange(false);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            const newImages: ProjectImage[] = [];
            let processed = 0;

            Array.from(files).forEach(file => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = reader.result as string;
                    newImages.push({
                        id: uuidv4(),
                        name: file.name,
                        data: base64
                    });
                    processed++;

                    if (processed === files.length) {
                        setImages(prev => [...prev, ...newImages]);
                    }
                };
                reader.readAsDataURL(file);
            });
        }
    };

    const startEditing = (img: ProjectImage) => {
        setEditingImageId(img.id);
        setEditingName(img.name);
    };

    const saveImageName = () => {
        if (editingImageId) {
            setImages(prev => prev.map(img =>
                img.id === editingImageId ? { ...img, name: editingName } : img
            ));
            setEditingImageId(null);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this scene? This action cannot be undone.")) {
            return;
        }
        setIsDeleting(true);
        try {
            await onDelete();
        } finally {
            setIsDeleting(false);
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Scene Settings</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <label htmlFor="title" className="text-sm font-medium leading-none">
                            Scene Title
                        </label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave();
                            }}
                        />
                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm font-medium leading-none">
                            Project Images (Book Source Material)
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {images.map((img) => (
                                <div
                                    key={img.id}
                                    className="relative aspect-square rounded-md overflow-hidden border group bg-muted"
                                    onMouseEnter={() => setHoveredImage(img.data)}
                                    onMouseLeave={() => setHoveredImage(null)}
                                >
                                    <img src={img.data} alt={img.name} className="w-full h-full object-cover" />

                                    {/* Overlay Actions */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                                        <div className="flex justify-end">
                                            <button
                                                onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))}
                                                className="text-white hover:text-red-400 p-1"
                                                title="Delete"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>

                                        {/* Name Editing */}
                                        <div className="w-full">
                                            {editingImageId === img.id ? (
                                                <div className="flex items-center gap-1 bg-background rounded p-1">
                                                    <input
                                                        className="w-full text-xs bg-transparent border-none focus:outline-none min-w-0"
                                                        value={editingName}
                                                        onChange={(e) => setEditingName(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && saveImageName()}
                                                        autoFocus
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                    <button onClick={saveImageName} className="text-green-500 hover:text-green-600">
                                                        <Check className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div
                                                    className="text-white text-xs truncate cursor-pointer hover:underline flex items-center gap-1"
                                                    onClick={(e) => { e.stopPropagation(); startEditing(img); }}
                                                    title={img.name}
                                                >
                                                    <span className="truncate flex-1">{img.name}</span>
                                                    <Pencil className="h-3 w-3 opacity-50" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div className="relative aspect-square rounded-md border border-dashed flex items-center justify-center hover:bg-accent cursor-pointer transition-colors group">
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                    onChange={handleFileUpload}
                                />
                                <div className="text-center group-hover:scale-105 transition-transform">
                                    <Plus className="h-6 w-6 mx-auto text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">Add Image</span>
                                </div>
                            </div>
                        </div>

                        <div className="border-t pt-4 mt-2">
                            <h4 className="text-sm font-medium mb-3 text-destructive">Danger Zone</h4>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="w-full sm:w-auto"
                            >
                                {isDeleting ? "Deleting..." : "Delete Scene"}
                            </Button>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>

            {/* Image Preview Overlay */}
            {hoveredImage && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative max-w-[90vw] max-h-[90vh] p-2 bg-background rounded-lg shadow-2xl border">
                        <img
                            src={hoveredImage}
                            alt="Preview"
                            className="max-w-full max-h-[85vh] object-contain rounded"
                        />
                    </div>
                </div>,
                document.body
            )}
        </Dialog>
    );
}

