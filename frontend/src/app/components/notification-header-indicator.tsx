'use client';

import { useEffect, useState } from 'react';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';

export default function NotificationHeaderIndicator() {
    const [unreadCount, setUnreadCount] = useState<number | null>(null);

    useEffect(() => {
        let isMounted = true;

        const loadUnreadCount = async () => {
            try {
                const { token, userId } = getDashboardAuthContext();
                if (!token || !userId) {
                    if (isMounted) setUnreadCount(null);
                    return;
                }

                const response = await fetch(`${API_BASE_URL}/notifications/my/unread-summary`, { headers: {} });
                const data = await response.json().catch(() => null);
                if (!response.ok) throw new Error(data?.message || 'Não foi possível consultar as notificações.');

                if (isMounted) setUnreadCount(Number(data?.count || 0));
            } catch {
                if (isMounted) setUnreadCount(null);
            }
        };

        const refreshUnreadCount = () => {
            void loadUnreadCount();
        };
        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible') refreshUnreadCount();
        };

        void loadUnreadCount();
        window.addEventListener('notifications-updated', refreshUnreadCount);
        window.addEventListener('focus', refreshUnreadCount);
        document.addEventListener('visibilitychange', refreshWhenVisible);

        return () => {
            isMounted = false;
            window.removeEventListener('notifications-updated', refreshUnreadCount);
            window.removeEventListener('focus', refreshUnreadCount);
            document.removeEventListener('visibilitychange', refreshWhenVisible);
        };
    }, []);

    const hasUnreadNotifications = unreadCount === null || unreadCount > 0;
    const label = unreadCount === null
        ? 'VERIFICANDO NOTIFICAÇÕES'
        : hasUnreadNotifications
            ? `EXISTEM ${unreadCount} NOTIFICAÇÕES NÃO LIDAS`
            : 'SEM NOTIFICAÇÕES';

    return (
        <div
            className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-white shadow-lg backdrop-blur-sm transition-colors ${hasUnreadNotifications
                ? 'border-red-300/80 bg-red-500 shadow-red-900/35'
                : 'border-emerald-300/80 bg-emerald-500 shadow-emerald-900/35'}`}
            title={label}
            aria-label={label}
        >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
        </div>
    );
}
