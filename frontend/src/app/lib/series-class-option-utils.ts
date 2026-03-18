export type SeriesClassOptionLike = {
    id: string;
    canceledAt?: string | null;
    series?: unknown;
    class?: unknown;
};

function hasCanceledAt(value: unknown) {
    return !!(
        value
        && typeof value === 'object'
        && 'canceledAt' in value
        && (value as { canceledAt?: string | null }).canceledAt
    );
}

export function normalizeSeriesClassOptionLabel(value: string) {
    return String(value || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\u2010-\u2015\u2212]/g, '-')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s*-\s*/g, ' - ')
        .replace(/\s*\/\s*/g, ' / ')
        .replace(/\s*\(\s*/g, ' (')
        .replace(/\s*\)\s*/g, ') ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

export function dedupeSeriesClassOptions<T extends SeriesClassOptionLike>(
    items: T[],
    getLabel: (item: T) => string,
    preferredId?: string | null,
) {
    const uniqueSeriesClasses = new Map<string, T>();

    items.forEach((item) => {
        if (!item || item.canceledAt || hasCanceledAt(item.series) || hasCanceledAt(item.class)) return;

        const labelKey = normalizeSeriesClassOptionLabel(getLabel(item));
        if (!labelKey) return;

        const existingSeriesClass = uniqueSeriesClasses.get(labelKey);
        if (!existingSeriesClass || item.id === preferredId) {
            uniqueSeriesClasses.set(labelKey, item);
        }
    });

    return Array.from(uniqueSeriesClasses.entries())
        .sort(([leftLabel], [rightLabel]) => leftLabel.localeCompare(rightLabel))
        .map(([, item]) => item);
}
