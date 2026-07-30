'use client';

import GridStatusFilter, { type GridStatusFilterValue } from '@/app/components/grid-status-filter';

type GridFooterControlsProps = {
    recordsCount: number;
    onOpenColumns: () => void;
    onOpenExport?: () => void;
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
};

export default function GridFooterControls({
    recordsCount,
    onOpenColumns,
    onOpenExport,
    statusFilter,
    onStatusFilterChange,
    activeLabel,
    allLabel,
    inactiveLabel,
    aggregateSummaries = [],
}: GridFooterControlsProps) {
    const normalizedRecordsCount = Number.isFinite(recordsCount) ? Math.max(0, recordsCount) : 0;

    return (
        <div className="dashboard-band-footer border-t bg-slate-200/70 px-6 py-3 text-sm font-bold text-slate-700">
            <div className="grid items-center gap-3 lg:grid-cols-[auto_1fr_auto]">
                <div className="flex items-center gap-3 justify-self-start">
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
                    {onOpenExport ? (
                        <button
                            type="button"
                            onClick={onOpenExport}
                            title="Abrir exportação e impressão"
                            aria-label="Abrir exportação e impressão"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V4h12v5M6 18h12v2H6v-2zm-1-8h14a2 2 0 012 2v4H3v-4a2 2 0 012-2z" />
                            </svg>
                        </button>
                    ) : null}
                </div>

                <div className="flex w-full flex-col items-center gap-3 justify-self-center">
                    <GridStatusFilter
                        value={statusFilter}
                        onChange={onStatusFilterChange}
                        activeLabel={activeLabel}
                        allLabel={allLabel}
                        inactiveLabel={inactiveLabel}
                    />
                    {aggregateSummaries.length > 0 ? (
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            {aggregateSummaries.map((summary) => (
                                <div key={summary.key} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-sm">
                                    {summary.label}: <span className="text-blue-700">{summary.value}</span>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>

                <div className="justify-self-end text-sm font-extrabold text-slate-700" title={`${normalizedRecordsCount} registro(s) exibido(s)`}>
                    Registros exibidos ({new Intl.NumberFormat('pt-BR').format(normalizedRecordsCount)})
                </div>
            </div>
        </div>
    );
}
