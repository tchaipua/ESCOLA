'use client';

import GridStatusFilter, { type GridStatusFilterValue } from '@/app/components/grid-status-filter';

type GridFooterControlsProps = {
    recordsCount: number;
    onOpenColumns: () => void;
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
                <div className="justify-self-start">
                    <button
                        type="button"
                        onClick={onOpenColumns}
                        title="Configurar colunas do grid"
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
                        </svg>
                        Colunas
                    </button>
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
