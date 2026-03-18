'use client';

import type { ReactNode } from 'react';

type GridRowActionIconButtonProps = {
    title: string;
    onClick: () => void;
    tone?: 'slate' | 'blue' | 'violet' | 'emerald' | 'rose';
    children: ReactNode;
};

const TONE_CLASS_MAP: Record<NonNullable<GridRowActionIconButtonProps['tone']>, string> = {
    slate: 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800',
    blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-800',
    violet: 'bg-violet-50 text-violet-600 hover:bg-violet-100 hover:text-violet-800',
    emerald: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-800',
    rose: 'bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-800',
};

export default function GridRowActionIconButton({
    title,
    onClick,
    tone = 'slate',
    children,
}: GridRowActionIconButtonProps) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${TONE_CLASS_MAP[tone]}`}
        >
            {children}
        </button>
    );
}
