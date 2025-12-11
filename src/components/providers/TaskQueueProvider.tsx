"use client";

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskItem {
    id: string;
    type: string; // 'analysis', 'generation', etc.
    description: string;
    status: TaskStatus;
    createdAt: number;
    completedAt?: number;
    error?: string;
}

interface TaskQueueContextType {
    tasks: TaskItem[];
    addTask: <T>(
        type: string,
        description: string,
        taskFn: (signal: AbortSignal) => Promise<T>,
        onSuccess?: (result: T) => void,
        onError?: (error: any) => void
    ) => Promise<void>;
    cancelTask: (id: string) => void;
    clearCompleted: () => void;
}

const TaskQueueContext = createContext<TaskQueueContextType | null>(null);

export const useTaskQueue = () => {
    const context = useContext(TaskQueueContext);
    if (!context) {
        throw new Error("useTaskQueue must be used within a TaskQueueProvider");
    }
    return context;
};

export const TaskQueueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const abortControllers = useRef<Map<string, AbortController>>(new Map());

    const addTask = useCallback(async <T,>(
        type: string,
        description: string,
        taskFn: (signal: AbortSignal) => Promise<T>,
        onSuccess?: (result: T) => void,
        onError?: (error: any) => void
    ) => {
        const id = uuidv4();
        const controller = new AbortController();
        abortControllers.current.set(id, controller);

        // Add to queue
        setTasks(prev => [{
            id,
            type,
            description,
            status: 'running',
            createdAt: Date.now()
        }, ...prev]);

        try {
            const result = await taskFn(controller.signal);

            // Success
            if (!controller.signal.aborted) {
                setTasks(prev => prev.map(t =>
                    t.id === id ? { ...t, status: 'completed', completedAt: Date.now() } : t
                ));
                if (onSuccess) onSuccess(result);
            }
        } catch (error: any) {
            // Check if aborted
            if (controller.signal.aborted || error.name === 'AbortError') {
                setTasks(prev => prev.map(t =>
                    t.id === id ? { ...t, status: 'cancelled', completedAt: Date.now() } : t
                ));
            } else {
                // Actual Failure
                setTasks(prev => prev.map(t =>
                    t.id === id ? { ...t, status: 'failed', error: error.message || 'Unknown error', completedAt: Date.now() } : t
                ));
                if (onError) onError(error);
                console.error("Task failed:", error);
            }
        } finally {
            abortControllers.current.delete(id);
        }
    }, []);

    const cancelTask = useCallback((id: string) => {
        const controller = abortControllers.current.get(id);
        if (controller) {
            controller.abort();
            abortControllers.current.delete(id);
            // State update happens in catch block of addTask usually, 
            // but if execution hasn't reached catch (e.g. stalled), force update?
            // Actually catch block is reliable for fetch interactions if fetch supports signal.
            // If manual logic, we might need to force state update here if the promise doesn't reject immediately?
            // Fetch rejects immediately on abort.
        }
    }, []);

    const clearCompleted = useCallback(() => {
        setTasks(prev => prev.filter(t => t.status === 'running' || t.status === 'pending'));
    }, []);

    return (
        <TaskQueueContext.Provider value={{ tasks, addTask, cancelTask, clearCompleted }}>
            {children}
        </TaskQueueContext.Provider>
    );
};
