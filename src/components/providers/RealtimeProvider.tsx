'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { subscribeToRealtime } from '@/lib/db/realtime';

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        const fetchUser = async () => {
            const supabase = createClient();

            // Initial fetch
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.id) {
                setUserId(session.user.id);
            }

            // Listen for changes
            const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
                setUserId(session?.user?.id ?? null);
            });

            return () => {
                subscription.unsubscribe();
            };
        };
        fetchUser();
    }, []);

    useEffect(() => {
        if (!userId) return;

        console.log('[RealtimeProvider] Connecting for user:', userId);
        const unsubscribe = subscribeToRealtime(userId);

        return () => {
            console.log('[RealtimeProvider] Cleaning up subscription for user:', userId);
            if (unsubscribe) unsubscribe();
        };
    }, [userId]);

    return <>{children}</>;
}
