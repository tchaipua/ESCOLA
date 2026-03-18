'use client';

import { useEffect, useMemo, useState } from 'react';
import { getStoredToken } from '@/app/lib/auth-storage';
import { type GridAggregateType } from '@/app/lib/grid-column-config-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

type GridColumnConfigModalProps<ColumnKey extends string> = {
    isOpen: boolean;
    title: string;
    description: string;
    columns: Array<{
        key: ColumnKey;
        label: string;
        visibleByDefault?: boolean;
        aggregateOptions?: GridAggregateType[];
    }>;
    orderedColumns: ColumnKey[];
    hiddenColumns: ColumnKey[];
    selectedAggregations?: Partial<Record<ColumnKey, GridAggregateType>>;
    onToggleColumnVisibility: (columnKey: ColumnKey) => void;
    onMoveColumn: (columnKey: ColumnKey, direction: 'up' | 'down') => void;
    onAggregationChange?: (columnKey: ColumnKey, aggregateType: GridAggregateType | null) => void;
    onReset: () => void;
    onClose: () => void;
};

const AGGREGATE_OPTION_LABELS: Record<GridAggregateType, string> = {
    sum: 'Soma',
    avg: 'Média',
    min: 'Mínimo',
    max: 'Máximo',
    count: 'Contagem',
};

function decodeTokenPayload(token: string) {
    try {
        const base64 = token.split('.')[1];
        if (!base64) return null;
        const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        return JSON.parse(atob(padded)) as { tenantId?: string };
    } catch {
        return null;
    }
}

export default function GridColumnConfigModal<ColumnKey extends string>({
    isOpen,
    title,
    description,
    columns,
    orderedColumns,
    hiddenColumns,
    selectedAggregations = {},
    onToggleColumnVisibility,
    onMoveColumn,
    onAggregationChange,
    onReset,
    onClose,
}: GridColumnConfigModalProps<ColumnKey>) {
    const [draggedColumnKey, setDraggedColumnKey] = useState<ColumnKey | null>(null);
    const [activeColumnKey, setActiveColumnKey] = useState<ColumnKey | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setDraggedColumnKey(null);
            setActiveColumnKey(null);
        }
    }, [isOpen]);

    const displayOrderedColumns = useMemo(() => {
        const visibleColumns = orderedColumns.filter((columnKey) => !hiddenColumns.includes(columnKey));
        const hiddenColumnKeys = orderedColumns.filter((columnKey) => hiddenColumns.includes(columnKey));
        return [...visibleColumns, ...hiddenColumnKeys];
    }, [hiddenColumns, orderedColumns]);
    const tenantBranding = useMemo(() => {
        if (typeof window === 'undefined') return null;
        const token = getStoredToken();
        const tenantId = token ? decodeTokenPayload(token)?.tenantId : null;
        return readCachedTenantBranding(tenantId);
    }, []);

    if (!isOpen) return null;

    const visibleCount = columns.length - hiddenColumns.length;

    const moveColumnToIndex = (columnKey: ColumnKey, targetIndex: number) => {
        const currentIndex = orderedColumns.indexOf(columnKey);
        if (currentIndex === -1 || currentIndex === targetIndex) return;

        if (currentIndex < targetIndex) {
            for (let index = currentIndex; index < targetIndex; index += 1) {
                onMoveColumn(columnKey, 'down');
            }
            return;
        }

        for (let index = currentIndex; index > targetIndex; index -= 1) {
            onMoveColumn(columnKey, 'up');
        }
    };

    return (
        <div className="fixed inset-0 z-[57] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="shrink-0 flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-4">
                    <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            {tenantBranding?.logoUrl ? (
                                <img
                                    src={tenantBranding.logoUrl}
                                    alt={tenantBranding.schoolName}
                                    className="h-full w-full object-contain"
                                />
                            ) : (
                                <span className="text-sm font-black tracking-[0.25em] text-[#153a6a]">
                                    {String(tenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                </span>
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-blue-600">
                                {tenantBranding?.schoolName || 'Escola'}
                            </div>
                            <h2 className="truncate text-xl font-bold text-[#153a6a]">{title}</h2>
                            <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-red-500">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col p-6">
                    <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="text-sm font-bold text-slate-700">Colunas visíveis: {visibleCount}</div>
                                <div className="text-xs font-medium text-slate-500">A ordem e a visibilidade ficam memorizadas nesta tela.</div>
                            </div>
                            <div className="flex w-full flex-wrap items-center justify-between gap-3">
                                <button
                                    type="button"
                                    onClick={onReset}
                                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                >
                                    Restaurar padrão
                                </button>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-500"
                                >
                                    Salvar / Fechar Configuração
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
                        <div className="grid grid-cols-1 gap-3">
                        {displayOrderedColumns.map((columnKey, index) => {
                            const column = columns.find((item) => item.key === columnKey);
                            if (!column) return null;
                            const isHidden = hiddenColumns.includes(column.key);

                            return (
                                <div
                                    key={column.key}
                                    draggable
                                    onClick={() => setActiveColumnKey(column.key)}
                                    onDragStart={() => {
                                        setActiveColumnKey(column.key);
                                        setDraggedColumnKey(column.key);
                                    }}
                                    onDragEnd={() => setDraggedColumnKey(null)}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                    }}
                                    onDrop={() => {
                                        if (!draggedColumnKey) return;
                                        setActiveColumnKey(draggedColumnKey);
                                        moveColumnToIndex(draggedColumnKey, index);
                                        setDraggedColumnKey(null);
                                    }}
                                    className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-4 transition-colors ${
                                        activeColumnKey === column.key || draggedColumnKey === column.key
                                            ? 'border-emerald-300 bg-emerald-200/90 ring-2 ring-emerald-300'
                                            : 'border-slate-200 bg-white'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onToggleColumnVisibility(column.key);
                                            }}
                                            aria-pressed={!isHidden}
                                            aria-label={!isHidden ? `Ocultar coluna ${column.label}` : `Exibir coluna ${column.label}`}
                                            title={!isHidden ? 'Esta coluna esta sendo usada no grid' : 'Esta coluna nao esta sendo usada no grid'}
                                            className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 shadow-sm transition-transform hover:scale-105 ${
                                                isHidden
                                                    ? 'border-red-200 bg-red-500 text-white shadow-red-200/80'
                                                    : 'border-emerald-200 bg-emerald-500 text-white shadow-emerald-200/80'
                                            }`}
                                        >
                                            {isHidden ? (
                                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M6 6l12 12M18 6L6 18" />
                                                </svg>
                                            ) : (
                                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.8} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </button>
                                        <div>
                                            <div className="text-sm font-bold text-slate-700">{column.label}</div>
                                            <div className="text-xs font-medium text-slate-500">
                                                {column.visibleByDefault === false ? 'Coluna extra' : 'Coluna padrão'}
                                            </div>
                                            {column.aggregateOptions?.length ? (
                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                                        Resumo no rodapé
                                                    </span>
                                                    <select
                                                        value={selectedAggregations[column.key] || ''}
                                                        onClick={(event) => event.stopPropagation()}
                                                        onChange={(event) => onAggregationChange?.(column.key, event.target.value ? event.target.value as GridAggregateType : null)}
                                                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                                    >
                                                        <option value="">Sem resumo</option>
                                                        {column.aggregateOptions.map((option) => (
                                                            <option key={option} value={option}>
                                                                {AGGREGATE_OPTION_LABELS[option]}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span
                                            className="inline-flex h-10 w-10 cursor-grab items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:cursor-grabbing"
                                            title="Clique e segure para arrastar esta coluna"
                                        >
                                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
                                            </svg>
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
