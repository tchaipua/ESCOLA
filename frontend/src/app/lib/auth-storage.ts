import { getEscolaCsrfToken } from '@/app/lib/csrf-fetch';

const LEGACY_TOKEN_KEY = '@Escola-PWA-Token';
const SESSION_PROFILE_KEY = '@Escola-PWA-Session-Profile';
const REMEMBER_KEY = '@Escola-PWA-Remember';
const COOKIE_SESSION_MARKER = 'COOKIE_SESSION';

export type StoredSessionProfile = {
    userId: string | null;
    role: string | null;
    permissions: string[];
    tenantId: string | null;
    branchCode: number;
    name: string | null;
    modelType: string | null;
    cashierOnly: boolean;
    tenantName: string | null;
    tenantLogoUrl: string | null;
};

function removeLegacyBrowserTokens() {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    sessionStorage.removeItem(LEGACY_TOKEN_KEY);
}

function normalizeStoredSessionProfile(value: unknown): StoredSessionProfile | null {
    if (!value || typeof value !== 'object') return null;
    const profile = value as Record<string, unknown>;
    const userId =
        typeof profile.userId === 'string'
            ? profile.userId
            : typeof profile.id === 'string'
              ? profile.id
              : null;
    const tenantId = typeof profile.tenantId === 'string' ? profile.tenantId : null;
    const role = typeof profile.role === 'string' ? profile.role : null;
    const tenant =
        profile.tenant && typeof profile.tenant === 'object'
            ? (profile.tenant as Record<string, unknown>)
            : null;
    if (!userId || !tenantId || !role) return null;

    return {
        userId,
        tenantId,
        role,
        permissions: Array.isArray(profile.permissions)
            ? profile.permissions.filter(
                  (permission): permission is string => typeof permission === 'string',
              )
            : [],
        branchCode:
            typeof profile.branchCode === 'number' &&
            Number.isInteger(profile.branchCode) &&
            profile.branchCode >= 0
                ? profile.branchCode
                : 1,
        name: typeof profile.name === 'string' ? profile.name : null,
        modelType: typeof profile.modelType === 'string' ? profile.modelType : null,
        cashierOnly: profile.cashierOnly === true,
        tenantName:
            typeof tenant?.name === 'string' && tenant.name.trim()
                ? tenant.name.trim()
                : null,
        tenantLogoUrl:
            typeof tenant?.logoUrl === 'string' && tenant.logoUrl.trim()
                ? tenant.logoUrl.trim()
                : null,
    };
}

export function getStoredSessionProfile(): StoredSessionProfile | null {
    if (typeof window === 'undefined') return null;
    removeLegacyBrowserTokens();
    try {
        return normalizeStoredSessionProfile(
            JSON.parse(
                sessionStorage.getItem(SESSION_PROFILE_KEY) ||
                    localStorage.getItem(SESSION_PROFILE_KEY) ||
                    'null',
            ),
        );
    } catch {
        localStorage.removeItem(SESSION_PROFILE_KEY);
        sessionStorage.removeItem(SESSION_PROFILE_KEY);
        return null;
    }
}

export function setStoredSessionProfile(profile: unknown, remember: boolean) {
    if (typeof window === 'undefined') return;
    removeLegacyBrowserTokens();
    const normalized = normalizeStoredSessionProfile(profile);
    if (!normalized) {
        localStorage.removeItem(SESSION_PROFILE_KEY);
        return;
    }

    // Somente metadados não secretos para renderização da UI. A autenticação
    // continua exclusivamente no cookie de sessão HttpOnly.
    const serialized = JSON.stringify(normalized);
    if (normalized.tenantName) {
        window.localStorage.setItem(
            `tenant-branding:${normalized.tenantId}`,
            JSON.stringify({
                tenantId: normalized.tenantId,
                schoolName: normalized.tenantName,
                logoUrl: normalized.tenantLogoUrl,
            }),
        );
    }
    if (remember) {
        localStorage.setItem(SESSION_PROFILE_KEY, serialized);
        sessionStorage.removeItem(SESSION_PROFILE_KEY);
    } else {
        sessionStorage.setItem(SESSION_PROFILE_KEY, serialized);
        localStorage.removeItem(SESSION_PROFILE_KEY);
    }
    localStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false');
}

// Compatibilidade temporária das telas: este valor é apenas um marcador em
// memória e nunca contém JWT, credencial ou token reutilizável.
export function getStoredToken(): string | null {
    if (typeof window === 'undefined') return null;
    const hasCookieSession = Boolean(getEscolaCsrfToken());
    return hasCookieSession && getStoredSessionProfile()
        ? COOKIE_SESSION_MARKER
        : null;
}

export function getRememberPreference(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(REMEMBER_KEY) === 'true';
}

export function clearStoredSession() {
    if (typeof window === 'undefined') return;
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';
    const csrfToken = getEscolaCsrfToken();
    const headers = new Headers();
    if (csrfToken) headers.set('x-msinfor-csrf', csrfToken);
    void fetch(`${apiBaseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers,
        keepalive: true,
    }).catch(() => undefined);
    removeLegacyBrowserTokens();
    localStorage.removeItem(SESSION_PROFILE_KEY);
    sessionStorage.removeItem(SESSION_PROFILE_KEY);
}
