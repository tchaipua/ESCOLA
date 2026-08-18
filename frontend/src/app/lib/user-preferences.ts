import { getStoredToken } from '@/app/lib/auth-storage';
import { withEscolaCsrf } from '@/app/lib/csrf-fetch';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';

type UserPreferenceResponse = {
    key: string;
    value: string;
    updatedAt?: string;
};

export async function fetchUserPreference<T>(key: string): Promise<T | null> {
    const token = getStoredToken();
    if (!token) return null;

    const response = await fetch(
        `${API_BASE_URL}/user-preferences/${encodeURIComponent(key)}`,
        withEscolaCsrf(`${API_BASE_URL}/user-preferences/${encodeURIComponent(key)}`, { method: 'GET' }),
    );

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || 'Não foi possível carregar a preferência do usuário.');
    }

    const data = await response.json() as UserPreferenceResponse;
    if (!data?.value) return null;

    return JSON.parse(data.value) as T;
}

export async function saveUserPreference(key: string, value: unknown) {
    const token = getStoredToken();
    if (!token) return;

    const response = await fetch(
        `${API_BASE_URL}/user-preferences/${encodeURIComponent(key)}`,
        withEscolaCsrf(`${API_BASE_URL}/user-preferences/${encodeURIComponent(key)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                value: JSON.stringify(value),
            }),
        }),
    );

    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || 'Não foi possível salvar a preferência do usuário.');
    }
}
