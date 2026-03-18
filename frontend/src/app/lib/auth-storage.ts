const TOKEN_KEY = '@Escola-PWA-Token';
const REMEMBER_KEY = '@Escola-PWA-Remember';
export const MSINFOR_MASTER_SESSION_KEY = '@MSINFOR-Master-Session';

export function getStoredToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string, remember: boolean) {
    if (typeof window === 'undefined') return;

    if (remember) {
        localStorage.setItem(TOKEN_KEY, token);
        sessionStorage.removeItem(TOKEN_KEY);
    } else {
        sessionStorage.setItem(TOKEN_KEY, token);
        localStorage.removeItem(TOKEN_KEY);
    }

    localStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false');
}

export function getRememberPreference(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(REMEMBER_KEY) === 'true';
}

export function clearStoredSession() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    sessionStorage.removeItem(MSINFOR_MASTER_SESSION_KEY);
}
