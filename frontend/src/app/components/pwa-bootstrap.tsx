'use client';

import { useEffect } from 'react';

export default function PwaBootstrap() {
    useEffect(() => {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
            return;
        }

        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            void navigator.serviceWorker.getRegistrations().then((registrations) => {
                registrations.forEach((registration) => {
                    void registration.unregister();
                });
            });
            return;
        }

        void navigator.serviceWorker.register('/sw.js').catch(() => null);
    }, []);

    return null;
}
