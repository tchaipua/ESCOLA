'use client';

type RecordStatusIndicatorProps = {
    active: boolean;
    className?: string;
};

export default function RecordStatusIndicator({ active, className = '' }: RecordStatusIndicatorProps) {
    const label = active ? 'ATIVO' : 'INATIVO';
    const toneClass = active
        ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
        : 'border-rose-200 bg-rose-50 text-rose-600';

    return (
        <span
            title={label}
            aria-label={label}
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full border shadow-sm ${toneClass} ${className}`.trim()}
        >
            {active ? (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M5 13l4 4L19 7" />
                </svg>
            ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M18.364 5.636l-12.728 12.728M6 6l12 12" />
                </svg>
            )}
        </span>
    );
}
