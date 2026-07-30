import type { GridColumnDefinition } from '@/app/lib/grid-export-utils';
import { fetchUserPreference, saveUserPreference } from '@/app/lib/user-preferences';

export type GridAggregateType = 'sum' | 'avg' | 'min' | 'max' | 'count';
export type GridColumnAggregations<ColumnKey extends string> = Partial<Record<ColumnKey, GridAggregateType>>;

export type ConfigurableGridColumn<RowType, ColumnKey extends string = string> = GridColumnDefinition<RowType, ColumnKey> & {
    visibleByDefault?: boolean;
    aggregateOptions?: GridAggregateType[];
    getAggregateValue?: (row: RowType) => number | null | undefined;
    formatAggregateValue?: (value: number, aggregateType: GridAggregateType) => string;
};

const VALID_AGGREGATE_TYPES: GridAggregateType[] = ['sum', 'avg', 'min', 'max', 'count'];

function normalizeGridColumnAggregations<ColumnKey extends string>(
    aggregations: Record<string, string> | undefined,
    allKeys: ColumnKey[],
) {
    const normalized: GridColumnAggregations<ColumnKey> = {};

    allKeys.forEach((key) => {
        const value = aggregations?.[key];
        if (VALID_AGGREGATE_TYPES.includes(value as GridAggregateType)) {
            normalized[key] = value as GridAggregateType;
        }
    });

    return normalized;
}

export function getAllGridColumnKeys<ColumnKey extends string>(
    columns: Array<{ key: ColumnKey }>,
) {
    return columns.map((column) => column.key);
}

export function getDefaultVisibleGridColumnKeys<ColumnKey extends string>(
    columns: Array<{ key: ColumnKey; visibleByDefault?: boolean }>,
) {
    return columns
        .filter((column) => column.visibleByDefault !== false)
        .map((column) => column.key);
}

export function normalizeGridColumnOrder<ColumnKey extends string>(
    order: string[] | undefined,
    allKeys: ColumnKey[],
) {
    const validKeys = order?.filter((item): item is ColumnKey => allKeys.includes(item as ColumnKey)) || [];
    const missingKeys = allKeys.filter((key) => !validKeys.includes(key));
    return [...validKeys, ...missingKeys];
}

export function normalizeHiddenGridColumns<ColumnKey extends string>(
    hidden: string[] | undefined,
    allKeys: ColumnKey[],
) {
    return hidden?.filter((item): item is ColumnKey => allKeys.includes(item as ColumnKey)) || [];
}

export function readGridColumnConfig<ColumnKey extends string>(
    storageKey: string,
    allKeys: ColumnKey[],
    defaultVisibleKeys: ColumnKey[],
    defaultAggregations: GridColumnAggregations<ColumnKey> = {},
) {
    const defaultHidden = allKeys.filter((key) => !defaultVisibleKeys.includes(key));

    if (typeof window === 'undefined') {
        return {
            order: normalizeGridColumnOrder(defaultVisibleKeys, allKeys),
            hidden: defaultHidden,
            aggregations: normalizeGridColumnAggregations(defaultAggregations as Record<string, string>, allKeys),
        };
    }

    try {
        const rawValue = window.localStorage.getItem(storageKey);
        if (!rawValue) {
            return {
                order: normalizeGridColumnOrder(defaultVisibleKeys, allKeys),
                hidden: defaultHidden,
                aggregations: normalizeGridColumnAggregations(defaultAggregations as Record<string, string>, allKeys),
            };
        }

        const parsed = JSON.parse(rawValue) as { order?: string[]; hidden?: string[]; aggregations?: Record<string, string> };
        return {
            order: normalizeGridColumnOrder(parsed.order, allKeys),
            hidden: normalizeHiddenGridColumns(parsed.hidden, allKeys),
            aggregations: normalizeGridColumnAggregations(parsed.aggregations, allKeys),
        };
    } catch {
        return {
            order: normalizeGridColumnOrder(defaultVisibleKeys, allKeys),
            hidden: defaultHidden,
            aggregations: normalizeGridColumnAggregations(defaultAggregations as Record<string, string>, allKeys),
        };
    }
}

export async function loadGridColumnConfig<ColumnKey extends string>(
    storageKey: string,
    allKeys: ColumnKey[],
    defaultVisibleKeys: ColumnKey[],
    defaultAggregations: GridColumnAggregations<ColumnKey> = {},
) {
    const localConfig = readGridColumnConfig(storageKey, allKeys, defaultVisibleKeys, defaultAggregations);

    try {
        const remoteConfig = await fetchUserPreference<{ order?: string[]; hidden?: string[]; aggregations?: Record<string, string> }>(storageKey);
        if (!remoteConfig) {
            return localConfig;
        }

        const normalized = {
            order: normalizeGridColumnOrder(remoteConfig.order, allKeys),
            hidden: normalizeHiddenGridColumns(remoteConfig.hidden, allKeys),
            aggregations: normalizeGridColumnAggregations(remoteConfig.aggregations, allKeys),
        };

        if (typeof window !== 'undefined') {
            window.localStorage.setItem(storageKey, JSON.stringify(normalized));
        }

        return normalized;
    } catch {
        return localConfig;
    }
}

export function writeGridColumnConfig<ColumnKey extends string>(
    storageKey: string,
    allKeys: ColumnKey[],
    order: ColumnKey[],
    hidden: ColumnKey[],
    aggregations: GridColumnAggregations<ColumnKey> = {},
) {
    if (typeof window === 'undefined') return;

    const normalizedPayload = {
        order: normalizeGridColumnOrder(order, allKeys),
        hidden: normalizeHiddenGridColumns(hidden, allKeys),
        aggregations: normalizeGridColumnAggregations(aggregations as Record<string, string>, allKeys),
    };

    window.localStorage.setItem(
        storageKey,
        JSON.stringify(normalizedPayload),
    );

    void saveUserPreference(storageKey, normalizedPayload).catch(() => undefined);
}

export function buildGridAggregateSummaries<RowType, ColumnKey extends string>(
    rows: RowType[],
    columns: Array<ConfigurableGridColumn<RowType, ColumnKey>>,
    aggregations: GridColumnAggregations<ColumnKey>,
) {
    return columns.flatMap((column) => {
        const aggregateType = aggregations[column.key];
        if (!aggregateType) return [];

        const numericValues = rows
            .map((row) => {
                if (typeof column.getAggregateValue === 'function') {
                    return column.getAggregateValue(row);
                }

                if (typeof column.getSortValue === 'function') {
                    const sortValue = column.getSortValue(row);
                    return typeof sortValue === 'number' && Number.isFinite(sortValue) ? sortValue : null;
                }

                const parsed = Number(String(column.getValue(row)).replace(/[^\d,.-]+/g, '').replace(',', '.'));
                return Number.isFinite(parsed) ? parsed : null;
            })
            .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

        if (aggregateType !== 'count' && numericValues.length === 0) return [];

        let result = 0;
        switch (aggregateType) {
            case 'sum':
                result = numericValues.reduce((total, value) => total + value, 0);
                break;
            case 'avg':
                result = numericValues.reduce((total, value) => total + value, 0) / numericValues.length;
                break;
            case 'min':
                result = Math.min(...numericValues);
                break;
            case 'max':
                result = Math.max(...numericValues);
                break;
            case 'count':
                result = numericValues.length;
                break;
        }

        const aggregateLabelMap: Record<GridAggregateType, string> = {
            sum: 'Soma',
            avg: 'Média',
            min: 'Mínimo',
            max: 'Máximo',
            count: 'Contagem',
        };

        return [{
            key: column.key,
            label: `${aggregateLabelMap[aggregateType]} de ${column.label}`,
            value: typeof column.formatAggregateValue === 'function'
                ? column.formatAggregateValue(result, aggregateType)
                : aggregateType === 'count'
                    ? String(result)
                    : result.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        }];
    });
}
