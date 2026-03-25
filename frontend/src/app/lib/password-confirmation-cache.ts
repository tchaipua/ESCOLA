const CACHE_KEY = 'dashboard:password-confirmation';
const VALIDITY_DURATION_MS = 5 * 60 * 1000;

type ConfirmationCache = {
    userId: string;
    timestamp: number;
};

function readCache(): ConfirmationCache | null {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
        return null;
    }

    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as ConfirmationCache;
        if (!parsed || typeof parsed.userId !== 'string' || typeof parsed.timestamp !== 'number') {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function writeCache(entry: ConfirmationCache) {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
        return;
    }

    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    } catch {
        // ignore
    }
}

export function isPasswordConfirmationValid(userId: string | null | undefined): boolean {
    if (!userId) return false;
    const entry = readCache();
    if (!entry || entry.userId !== userId) return false;
    return Date.now() - entry.timestamp < VALIDITY_DURATION_MS;
}

export function markPasswordConfirmed(userId: string) {
    if (!userId) return;
    writeCache({ userId, timestamp: Date.now() });
}
