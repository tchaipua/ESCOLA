'use client';

export type GridStatusFilterValue = 'ACTIVE' | 'ALL' | 'INACTIVE';

type GridStatusFilterProps = {
    value: GridStatusFilterValue;
    onChange: (value: GridStatusFilterValue) => void;
    activeLabel: string;
    allLabel: string;
    inactiveLabel: string;
};

type FilterButtonProps = {
    isSelected: boolean;
    title: string;
    tone: 'green' | 'yellow' | 'red';
    align: 'left' | 'center' | 'right';
    onClick: () => void;
};

function FilterButton({ isSelected, title, tone, align, onClick }: FilterButtonProps) {
    const toneClass =
        tone === 'green'
            ? isSelected
                ? 'border-emerald-700 bg-emerald-600 shadow-[0_0_0_3px_rgba(5,150,105,0.18)]'
                : 'border-slate-300 bg-emerald-100'
            : tone === 'yellow'
                ? isSelected
                    ? 'border-amber-600 bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.22)]'
                    : 'border-slate-300 bg-amber-100'
                : isSelected
                    ? 'border-red-800 bg-red-700 shadow-[0_0_0_3px_rgba(185,28,28,0.18)]'
                    : 'border-slate-300 bg-red-100';

    const markerClass =
        align === 'center'
            ? isSelected
                ? 'left-1/2 -translate-x-1/2 ring-2 ring-amber-900/20'
                : 'left-1 opacity-70'
            : align === 'right'
                ? isSelected
                    ? 'right-1 ring-2 ring-red-950/30'
                    : 'left-1 opacity-70'
                : isSelected
                    ? 'right-1 ring-2 ring-emerald-900/25'
                    : 'left-1 opacity-70';

    return (
        <button
            type="button"
            title={title}
            onClick={onClick}
            className={`relative h-5 w-12 rounded-full border transition-all ${toneClass}`}
        >
            <span
                className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white transition-all ${markerClass}`}
            />
        </button>
    );
}

export default function GridStatusFilter({
    value,
    onChange,
    activeLabel,
    allLabel,
    inactiveLabel,
}: GridStatusFilterProps) {
    return (
        <div className="flex items-center gap-2">
            <FilterButton
                isSelected={value === 'ACTIVE'}
                title={activeLabel}
                tone="green"
                align="left"
                onClick={() => onChange('ACTIVE')}
            />
            <FilterButton
                isSelected={value === 'ALL'}
                title={allLabel}
                tone="yellow"
                align="center"
                onClick={() => onChange('ALL')}
            />
            <FilterButton
                isSelected={value === 'INACTIVE'}
                title={inactiveLabel}
                tone="red"
                align="right"
                onClick={() => onChange('INACTIVE')}
            />
        </div>
    );
}
