import { getStoredToken } from '@/app/lib/auth-storage';

const API_BASE_URL = 'http://localhost:3001/api/v1';

type UserPreferenceResponse = {
    key: string;
    value: string;
    updatedAt?: string;
};

export async function fetchUserPreference<T>(key: string): Promise<T | null> {
    const token = getStoredToken();
    if (!token) return null;

    const response = await fetch(`${API_BASE_URL}/user-preferences/${encodeURIComponent(key)}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

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

    const response = await fetch(`${API_BASE_URL}/user-preferences/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            value: JSON.stringify(value),
        }),
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || 'Não foi possível salvar a preferência do usuário.');
    }
}
