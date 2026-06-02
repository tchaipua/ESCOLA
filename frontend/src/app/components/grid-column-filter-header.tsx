'use client';

import type { GridSortDirection } from '@/app/lib/grid-export-utils';

type GridColumnFilterHeaderProps = {
    label: string;
    align?: 'left' | 'center' | 'right';
    isOpen: boolean;
    isActive: boolean;
    filterValue: string;
    onToggle: () => void;
    onSort: (direction: GridSortDirection) => void;
    onFilterValueChange: (value: string) => void;
    onApply: () => void;
    onClear: () => void;
};

export default function GridColumnFilterHeader({
    label,
    align = 'left',
    isOpen,
    isActive,
    filterValue,
    onToggle,
    onSort,
    onFilterValueChange,
    onApply,
    onClear,
}: GridColumnFilterHeaderProps) {
    const alignClass =
        align === 'right'
            ? 'justify-end'
            : align === 'center'
                ? 'justify-center'
                : 'justify-start';

    return (
        <div className={`relative flex items-center gap-2 ${alignClass}`}>
            <span>{label}</span>
            <button
                type="button"
                onClick={onToggle}
                aria-label={`Filtrar ${label}`}
                title={`Filtrar ${label}`}
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
                    isActive || isOpen
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-400 hover:border-blue-200 hover:text-blue-600'
                }`}
            >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <circle cx="11" cy="11" r="7" strokeWidth={1.8} />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m20 20-3.5-3.5" />
                </svg>
            </button>
            {isOpen ? (
                <div className={`absolute top-full z-40 mt-2 w-[276px] rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-xl ${
                    align === 'right' ? 'right-0' : 'left-0'
                }`}>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Ordenar coluna
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => onSort('asc')}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                        >
                            Crescente
                        </button>
                        <button
                            type="button"
                            onClick={() => onSort('desc')}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                        >
                            Decrescente
                        </button>
                    </div>
                    <div className="mt-3 border-t border-slate-100 pt-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                            Filtrar {label}
                        </div>
                        <input
                            value={filterValue}
                            onChange={(event) => onFilterValueChange(event.target.value.toUpperCase())}
                            onKeyDown={(event) => {
                                if (event.key !== 'Enter') return;
                                event.preventDefault();
                                onApply();
                            }}
                            placeholder="DIGITE O FILTRO"
                            className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold uppercase text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                        />
                        <button
                            type="button"
                            onClick={onApply}
                            className="mt-2 h-9 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
                        >
                            Filtrar
                        </button>
                        <button
                            type="button"
                            onClick={onClear}
                            className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:bg-slate-100"
                        >
                            Limpar
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
