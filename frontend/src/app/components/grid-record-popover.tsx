'use client';

import { useEffect, useMemo, useState } from 'react';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

type GridRecordPopoverItem = {
    label: string;
    value: string;
};

type GridRecordPopoverSection = {
    title?: string;
    items: GridRecordPopoverItem[];
};

type GridRecordPopoverProps = {
    title: string;
    subtitle?: string;
    sections: GridRecordPopoverSection[];
    buttonLabel: string;
    avatarUrl?: string | null;
    badges?: string[];
    disciplines?: string[];
    contextLabel?: string;
};

function getVisibleSections(sections: GridRecordPopoverSection[]) {
    return sections
        .map((section) => ({
            ...section,
            items: section.items.filter((item) => item.value.trim().length > 0),
        }))
        .filter((section) => section.items.length > 0);
}

export default function GridRecordPopover({
    title,
    subtitle,
    sections,
    buttonLabel,
    avatarUrl,
    disciplines,
    contextLabel,
}: GridRecordPopoverProps) {
    const [isOpen, setIsOpen] = useState(false);

    const visibleDisciplines = useMemo(() => (disciplines || []).filter(Boolean), [disciplines]);

    const visibleSections = useMemo(() => getVisibleSections(sections), [sections]);
    const brandingLogoUrl = useMemo(() => {
        const { tenantId } = getDashboardAuthContext();
        return readCachedTenantBranding(tenantId)?.logoUrl || null;
    }, []);
    const effectiveAvatarUrl = avatarUrl || brandingLogoUrl || null;
    const useContainedAvatar = !avatarUrl && Boolean(brandingLogoUrl);
    const initials = useMemo(
        () =>
            title
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0])
                .join('')
                .toUpperCase(),
        [title],
    );

    useEffect(() => {
        if (!isOpen) return undefined;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className={`rounded-lg border px-3 py-1.5 transition-colors ${
                    isOpen
                        ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
                        : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                aria-label={buttonLabel}
                title={buttonLabel}
            >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.75 19.25h14.5A1.75 1.75 0 0 0 21 17.5v-11A1.75 1.75 0 0 0 19.25 4.75H4.75A1.75 1.75 0 0 0 3 6.5v11c0 .966.784 1.75 1.75 1.75Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 9.25h4.5m-4.5 3.5h9m-9 3.5h6" />
                    <circle cx="16.5" cy="8.5" r="1.25" />
                </svg>
            </button>

            {isOpen ? (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
                        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-cyan-50 px-5 py-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex min-w-0 items-start gap-4">
                                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-cyan-100 bg-cyan-100 text-base font-black text-cyan-800 shadow-sm">
                                        {effectiveAvatarUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={effectiveAvatarUrl}
                                                alt={title}
                                                className={`h-full w-full ${useContainedAvatar ? 'object-contain bg-white p-1.5' : 'object-cover'}`}
                                            />
                                        ) : (
                                            initials || 'ID'
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-lg font-black text-slate-800">{title}</div>
                                        {subtitle ? (
                                            <div className="mt-1 text-sm font-medium text-slate-500">{subtitle}</div>
                                        ) : null}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="rounded-full bg-red-600 px-4 py-2 text-xs font-black uppercase tracking-[0.3em] text-white transition hover:bg-red-700"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>

                        {visibleDisciplines.length ? (
                            <div className="border-b border-slate-100 bg-white px-5 py-4">
                                <div className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">
                                    DISCIPLINAS
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                {visibleDisciplines.map((item) => (
                                    <span
                                        key={item}
                                        className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white px-5 py-1.5 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-600 shadow-sm"
                                    >
                                        {item}
                                    </span>
                                ))}
                                </div>
                            </div>
                        ) : null}

                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                            <div className="flex min-h-[220px] min-w-0 flex-col gap-5">
                                <div className="space-y-5">
                                    {visibleSections.map((section, sectionIndex) => (
                                        <section key={`${section.title || 'section'}-${sectionIndex}`} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                                            {section.title ? (
                                                <div className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                                                    {section.title}
                                                </div>
                                            ) : null}

                                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                                {section.items.map((item) => (
                                                    <div key={`${sectionIndex}-${item.label}`} className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                                                        <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                                                            {item.label}
                                                        </div>
                                                        <div className="mt-1 break-words text-sm font-semibold text-slate-700">
                                                            {item.value}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    ))}
                                </div>
                                {contextLabel ? (
                                    <div className="mt-auto text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 text-right">
                                        Tela: {contextLabel}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
