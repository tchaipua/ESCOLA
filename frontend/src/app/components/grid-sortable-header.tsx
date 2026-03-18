'use client';

import type { GridSortDirection } from '@/app/lib/grid-export-utils';

type GridSortableHeaderProps = {
    label: string;
    isActive: boolean;
    direction: GridSortDirection;
    onClick: () => void;
    align?: 'left' | 'center' | 'right';
};

export default function GridSortableHeader({
    label,
    isActive,
    direction,
    onClick,
    align = 'left',
}: GridSortableHeaderProps) {
    const justifyClass =
        align === 'right'
            ? 'justify-end'
            : align === 'center'
                ? 'justify-center'
                : 'justify-start';

    const directionLabel = isActive
        ? direction === 'asc'
            ? '↑'
            : '↓'
        : '↕';

    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex w-full items-center gap-2 ${justifyClass} text-left hover:text-blue-700`}
        >
            <span>{label}</span>
            <span className={`text-xs ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>{directionLabel}</span>
        </button>
    );
}
