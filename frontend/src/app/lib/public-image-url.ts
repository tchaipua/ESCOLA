export function normalizePublicImageUrl(value?: string | null) {
    const normalized = String(value || '').trim();
    if (!normalized) return null;

    if (
        normalized.startsWith('/') &&
        !normalized.startsWith('//') &&
        !normalized.includes('\\') &&
        !/[\u0000-\u001f\u007f]/.test(normalized)
    ) {
        return normalized;
    }

    try {
        const url = new URL(normalized);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
    } catch {
        return null;
    }
}
