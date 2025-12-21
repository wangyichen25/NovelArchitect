
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";

interface SceneSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentTitle: string;
    onRename: (newTitle: string) => Promise<void>;
    onDelete: () => Promise<void>;
}

export function SceneSettingsDialog({ open, onOpenChange, currentTitle, onRename, onDelete }: SceneSettingsDialogProps) {
    const [title, setTitle] = useState(currentTitle);
    const [isDeleting, setIsDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        setTitle(currentTitle);
        setConfirmDelete(false);
    }, [currentTitle, open]);

    const handleSave = async () => {
        if (title.trim() === "") return;
        await onRename(title);
        onOpenChange(false);
    };

    const handleDelete = async () => {
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }
        setIsDeleting(true);
        try {
            await onDelete();
            // Dialog will close due to parent unmounting/changing state calling onOpenChange(false) usually, 
            // or we should close it manually if the parent doesn't. 
            // But usually onDelete leads to scene switch.
        } catch (error) {
            console.error(error);
            setIsDeleting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Scene Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Scene Title</label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                            placeholder="Enter scene title..."
                        />
                    </div>
                    <Button onClick={handleSave} className="w-full">
                        Save Changes
                    </Button>

                    <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">
                                Danger Zone
                            </span>
                        </div>
                    </div>

                    <Button
                        variant="destructive"
                        className="w-full"
                        onClick={handleDelete}
                        disabled={isDeleting}
                    >
                        {isDeleting ? "Deleting..." : confirmDelete ? "Click again to confirm delete" : "Delete Scene"}
                        {!isDeleting && !confirmDelete && <Trash2 className="ml-2 h-4 w-4" />}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
