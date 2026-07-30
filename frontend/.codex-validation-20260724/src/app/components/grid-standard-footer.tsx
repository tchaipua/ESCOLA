'use client';

import GridStatusFilter, { type GridStatusFilterValue } from '@/app/components/grid-status-filter';

type GridStandardFooterProps = {
    recordsCount: number;
    onOpenColumns: () => void;
    onOpenExport: () => void;
    statusFilter: GridStatusFilterValue;
    onStatusFilterChange: (value: GridStatusFilterValue) => void;
    activeLabel: string;
    allLabel: string;
    inactiveLabel: string;
    aggregateSummaries?: Array<{
        key: string;
        label: string;
        value: string;
    }>;
    pageSize: number;
    onPageSizeChange: (value: number) => void;
    currentPage: number;
    totalPages: number;
    onFirstPage: () => void;
    onPreviousPage: () => void;
    onNextPage: () => void;
    onLastPage: () => void;
};

export default function GridStandardFooter({
    recordsCount,
    onOpenColumns,
    onOpenExport,
    statusFilter,
    onStatusFilterChange,
    activeLabel,
    allLabel,
    inactiveLabel,
    aggregateSummaries = [],
    pageSize,
    onPageSizeChange,
    currentPage,
    totalPages,
    onFirstPage,
    onPreviousPage,
    onNextPage,
    onLastPage,
}: GridStandardFooterProps) {
    const formattedCount = new Intl.NumberFormat('pt-BR').format(Math.max(0, recordsCount));

    return (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">
            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={onOpenColumns}
                    title="ALTERAR COLUNAS GRID"
                    aria-label="ALTERAR COLUNAS GRID"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <rect x="4" y="5" width="16" height="14" rx="2" strokeWidth={2} />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5v14M15 5v14" />
                    </svg>
                </button>
                <button
                    type="button"
                    onClick={onOpenExport}
                    title="Abrir exportação e impressão"
                    aria-label="Abrir exportação e impressão"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V4h12v5M6 18h12v2H6v-2zm-1-8h14a2 2 0 012 2v4H3v-4a2 2 0 012-2z" />
                    </svg>
                </button>
                <GridStatusFilter
                    value={statusFilter}
                    onChange={onStatusFilterChange}
                    activeLabel={activeLabel}
                    allLabel={allLabel}
                    inactiveLabel={inactiveLabel}
                />
                <div
                    className="inline-flex h-8 items-center rounded-full border border-slate-300 bg-white px-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 shadow-sm"
                    title={`${formattedCount} registro(s) encontrado(s)`}
                >
                    Total registros: {formattedCount}
                </div>
                {aggregateSummaries.map((summary) => (
                    <div
                        key={summary.key}
                        className="inline-flex h-8 items-center rounded-full border border-slate-300 bg-white px-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 shadow-sm"
                    >
                        {summary.label}: <span className="ml-1 text-blue-700">{summary.value}</span>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
                <select
                    value={pageSize}
                    onChange={(event) => onPageSizeChange(Number(event.target.value))}
                    aria-label="Registros por página"
                    className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 outline-none transition hover:bg-slate-50 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                >
                    {[10, 20, 50, 100].map((option) => (
                        <option key={option} value={option}>{option}</option>
                    ))}
                </select>
                <button
                    type="button"
                    aria-label="Voltar para o início"
                    title="Voltar para o início"
                    onClick={onFirstPage}
                    disabled={currentPage <= 1}
                    className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {'<<'}
                </button>
                <button
                    type="button"
                    aria-label="Voltar uma página"
                    title="Voltar uma página"
                    onClick={onPreviousPage}
                    disabled={currentPage <= 1}
                    className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {'<'}
                </button>
                <div className="min-w-20 text-center text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                    {currentPage}/{totalPages}
                </div>
                <button
                    type="button"
                    aria-label="Avançar uma página"
                    title="Avançar uma página"
                    onClick={onNextPage}
                    disabled={currentPage >= totalPages}
                    className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {'>'}
                </button>
                <button
                    type="button"
                    aria-label="Ir para o fim"
                    title="Ir para o fim"
                    onClick={onLastPage}
                    disabled={currentPage >= totalPages}
                    className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {'>>'}
                </button>
            </div>
        </div>
    );
}
