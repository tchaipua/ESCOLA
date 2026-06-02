'use client';

import { useEffect, useMemo, useState } from 'react';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import ScreenNameCopy from '@/app/components/screen-name-copy';

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
    subjectBadges?: string[];
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
    subjectBadges,
}: GridRecordPopoverProps) {
    const [isOpen, setIsOpen] = useState(false);

    const visibleDisciplines = useMemo(() => (disciplines || []).filter(Boolean), [disciplines]);
    const visibleSubjectBadges = useMemo(() => (subjectBadges || []).filter(Boolean), [subjectBadges]);

    const visibleSections = useMemo(() => getVisibleSections(sections), [sections]);
    const branding = useMemo(() => {
        const { tenantId } = getDashboardAuthContext();
        return readCachedTenantBranding(tenantId);
    }, []);
    const brandingLogoUrl = branding?.logoUrl || null;
    const brandingName = branding?.schoolName || 'ESCOLA';
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
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-2 backdrop-blur-sm">
                    <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-cyan-50 px-4 py-2">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-2.5">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-cyan-100 bg-white text-xs font-black text-cyan-800 shadow-sm">
                                        {brandingLogoUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={brandingLogoUrl}
                                                alt={brandingName}
                                                className="h-full w-full object-contain p-1"
                                            />
                                        ) : (
                                            String(brandingName).slice(0, 3).toUpperCase()
                                    )}
                                    </div>
                                    {avatarUrl ? (
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-xs font-black text-slate-500 shadow-sm">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={avatarUrl}
                                                alt={title}
                                                className="h-full w-full object-cover"
                                            />
                                        </div>
                                    ) : null}
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-black text-slate-800">{title}</div>
                                        {subtitle ? (
                                            <div className="mt-0.5 text-[11px] font-medium text-slate-500">{subtitle}</div>
                                        ) : null}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white transition hover:bg-red-700"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>

                        {visibleDisciplines.length ? (
                            <div className="border-b border-slate-100 bg-white px-4 py-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                        DISCIPLINAS
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                    {visibleDisciplines.map((item) => (
                                        <span
                                            key={item}
                                            className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-600 shadow-sm"
                                        >
                                            {item}
                                        </span>
                                    ))}
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                            <div className="flex min-w-0 flex-col gap-2">
                                {visibleSubjectBadges.length ? (
                                    <section className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                                        <div className="mb-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                                            Matérias lecionadas
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {visibleSubjectBadges.map((subject) => (
                                                <span
                                                    key={`subject-${subject}`}
                                                    className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-800"
                                                >
                                                    {subject}
                                                </span>
                                            ))}
                                        </div>
                                    </section>
                                ) : null}
                                <div className="space-y-2">
                                    {visibleSections.map((section, sectionIndex) => (
                                        <section key={`${section.title || 'section'}-${sectionIndex}`} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                                            {section.title ? (
                                                <div className="mb-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                                                    {section.title}
                                                </div>
                                            ) : null}

                                            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-3 xl:grid-cols-4">
                                                {section.items.map((item) => (
                                                    <div key={`${sectionIndex}-${item.label}`} className="rounded-lg border border-slate-100 bg-white px-2 py-1.5 shadow-sm">
                                                        <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                                                            {item.label}
                                                        </div>
                                                        <div className="mt-0.5 break-words text-[11px] font-semibold text-slate-700">
                                                            {item.value}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    ))}
                                </div>
                                {contextLabel ? (
                                    <div className="text-right">
                                        <ScreenNameCopy screenId={contextLabel} className="justify-end" disableMargin />
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
