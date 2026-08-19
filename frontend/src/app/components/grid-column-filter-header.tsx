'use client';

import { useEffect } from 'react';
import type { GridSortDirection } from '@/app/lib/grid-export-utils';

export type GridDateRange = { from: string; to: string };
type GridDatePeriodOption = GridDateRange & { value: string; label: string };

type GridColumnFilterHeaderProps = {
    label: string;
    align?: 'left' | 'center' | 'right';
    isOpen: boolean;
    isActive: boolean;
    filterValue: string;
    filterType?: 'text' | 'date-range';
    onToggle: () => void;
    onSort: (direction: GridSortDirection) => void;
    onFilterValueChange: (value: string) => void;
    onApply: () => void;
    onClear: () => void;
};

const GRID_MONTHS = [
    'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
    'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];

function toDateInputValue(value: string) {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function monthDateRange(date: Date): GridDateRange {
    const year = date.getFullYear();
    const month = date.getMonth();
    return {
        from: `${year}-${String(month + 1).padStart(2, '0')}-01`,
        to: `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`,
    };
}

function buildDatePeriodOptions(referenceDate = new Date()): GridDatePeriodOption[] {
    const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 12, 1);
    return Array.from({ length: 19 }, (_, index) => {
        const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
        const range = monthDateRange(date);
        const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return { value, label: `${GRID_MONTHS[date.getMonth()]}/${date.getFullYear()}`, ...range };
    });
}

export function serializeGridDateRange(range: GridDateRange) {
    return `${range.from}|${range.to}`;
}

export function parseGridDateRange(value: string): GridDateRange {
    const [from = '', to = ''] = String(value || '').split('|');
    return { from: toDateInputValue(from), to: toDateInputValue(to) };
}

export function matchesGridDateRange(value: unknown, rangeValue: string) {
    const range = parseGridDateRange(rangeValue);
    if (!range.from && !range.to) return true;
    const raw = String(value ?? '').trim();
    if (!raw) return false;
    const brazilianDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    const normalized = brazilianDate
        ? `${brazilianDate[3]}-${brazilianDate[2]}-${brazilianDate[1]}`
        : toDateInputValue(raw.slice(0, 10));
    if (!normalized) return false;
    return (!range.from || normalized >= range.from) && (!range.to || normalized <= range.to);
}

export default function GridColumnFilterHeader({
    label,
    align = 'left',
    isOpen,
    isActive,
    filterValue,
    filterType = 'text',
    onToggle,
    onSort,
    onFilterValueChange,
    onApply,
    onClear,
}: GridColumnFilterHeaderProps) {
    const alignClass = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

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
                <div className={`absolute top-full z-40 mt-2 ${filterType === 'date-range' ? 'w-[360px] max-w-[calc(100vw-2rem)]' : 'w-[276px]'} rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Ordenar coluna</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => onSort('asc')} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">Crescente</button>
                        <button type="button" onClick={() => onSort('desc')} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">Decrescente</button>
                    </div>
                    <div className="mt-3 border-t border-slate-100 pt-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Filtrar {label}</div>
                        {filterType === 'date-range' ? (
                            <DateRangeFilter value={filterValue} onChange={onFilterValueChange} onApply={onApply} />
                        ) : (
                            <input
                                value={filterValue}
                                onChange={(event) => onFilterValueChange(event.target.value.toUpperCase())}
                                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onApply(); } }}
                                placeholder="DIGITE O FILTRO"
                                className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold uppercase text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            />
                        )}
                        <button type="button" onClick={onApply} className="mt-2 h-9 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100">Filtrar</button>
                        <button type="button" onClick={onClear} className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:bg-slate-100">Limpar</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function DateRangeFilter({ value, onChange, onApply }: { value: string; onChange: (value: string) => void; onApply: () => void }) {
    const options = buildDatePeriodOptions();
    useEffect(() => {
        if (!value && options[12]) onChange(serializeGridDateRange(options[12]));
    }, [onChange, options, value]);
    const range = parseGridDateRange(value);
    const selectedPeriod = options.find((option) => option.from === range.from && option.to === range.to)?.value || 'CUSTOM';
    const updateRange = (nextRange: GridDateRange) => onChange(serializeGridDateRange(nextRange));

    return (
        <div className="mt-2 space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                Período
                <select value={selectedPeriod} onChange={(event) => { const option = options.find((item) => item.value === event.target.value); if (option) updateRange(option); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100">
                    <option value="CUSTOM">PERÍODO PERSONALIZADO</option>
                    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
                {(['from', 'to'] as const).map((field) => (
                    <label key={field} className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                        {field === 'from' ? 'De' : 'Até'}
                        <input type="date" value={range[field]} onChange={(event) => updateRange({ ...range, [field]: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') onApply(); }} className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
                    </label>
                ))}
            </div>
        </div>
    );
}
