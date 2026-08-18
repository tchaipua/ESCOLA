'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import ScreenNameCopy from '@/app/components/screen-name-copy';

type GridRecordPopoverItem = {
    label: string;
    value: string;
    tone?: 'danger';
};

type GridRecordPopoverSection = {
    title?: string;
    items: GridRecordPopoverItem[];
};

export type GridRecordPopoverAction = {
    id: string;
    label: string;
    onClick: () => Promise<void> | void;
    disabled?: boolean;
};

type GridRecordPopoverTab = {
    label: string;
    sectionTitles?: string[];
    showDisciplines?: boolean;
    actions?: GridRecordPopoverAction[];
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
    buttonClassName?: string;
    buttonIcon?: ReactNode;
    modalVariant?: 'default' | 'school-record-detail';
    compactFooter?: boolean;
    tabs?: GridRecordPopoverTab[];
};

function getVisibleSections(sections: GridRecordPopoverSection[]) {
    return sections
        .map((section) => ({
            ...section,
            items: section.items.filter((item) => String(item.value ?? '').trim().length > 0),
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
    buttonClassName,
    buttonIcon,
    modalVariant = 'default',
    compactFooter = false,
    tabs,
}: GridRecordPopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTabIndex, setActiveTabIndex] = useState(0);

    const visibleDisciplines = useMemo(() => (disciplines || []).filter(Boolean), [disciplines]);
    const visibleSubjectBadges = useMemo(() => (subjectBadges || []).filter(Boolean), [subjectBadges]);

    const visibleSections = useMemo(() => getVisibleSections(sections), [sections]);
    const branding = useMemo(() => {
        const { tenantId } = getDashboardAuthContext();
        return readCachedTenantBranding(tenantId);
    }, []);
    const brandingLogoUrl = branding?.logoUrl || null;
    const brandingName = branding?.schoolName || 'ESCOLA';
    const isSchoolRecordDetail = modalVariant === 'school-record-detail';
    const activeTab = tabs?.[activeTabIndex] || tabs?.[0];
    const activeTabSections = activeTab
        ? visibleSections.filter((section) => activeTab.sectionTitles?.includes(section.title || ''))
        : visibleSections;
    const shouldShowDisciplines = activeTab ? Boolean(activeTab.showDisciplines) : visibleDisciplines.length > 0;
    const activeTabActions = activeTab?.actions || [];
    const [runningActionId, setRunningActionId] = useState<string | null>(null);
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
                className={buttonClassName || `rounded-lg border px-3 py-1.5 transition-colors ${
                    isOpen
                        ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
                        : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                aria-label={buttonLabel}
                title={buttonLabel}
            >
                {buttonIcon || (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                )}
            </button>

            {isOpen ? (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-2 backdrop-blur-sm">
                    <div className={`flex max-h-[94vh] w-full flex-col overflow-hidden bg-white shadow-2xl ${isSchoolRecordDetail ? 'max-w-4xl rounded-2xl border border-blue-200' : 'max-w-6xl rounded-2xl border border-slate-200'}`}>
                        <div className={`shrink-0 px-4 ${isSchoolRecordDetail ? 'border-b border-blue-700 bg-blue-700 py-3 text-white' : 'border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-cyan-50 py-2'}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-2.5">
                                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-xs font-black shadow-sm ${isSchoolRecordDetail ? 'border border-blue-100 text-blue-700' : 'border border-cyan-100 text-cyan-800'}`}>
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
                                        <div className={`text-[10px] font-black uppercase tracking-[0.2em] ${isSchoolRecordDetail ? 'text-blue-100' : 'text-slate-400'}`}>{isSchoolRecordDetail ? `${brandingName} · DETALHES` : brandingName}</div>
                                        <div className={`truncate text-lg font-black ${isSchoolRecordDetail ? 'text-white' : 'text-slate-800'}`}>{isSchoolRecordDetail ? `Detalhes de ${title}` : title}</div>
                                        {subtitle ? (
                                            <div className={`mt-0.5 text-[11px] font-medium ${isSchoolRecordDetail ? 'text-blue-100' : 'text-slate-500'}`}>{subtitle}</div>
                                        ) : null}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className={isSchoolRecordDetail ? 'flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-red-600 text-white transition hover:bg-red-700' : 'rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white transition hover:bg-red-700'}
                                >
                                    {isSchoolRecordDetail ? (
                                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>
                                    ) : 'Fechar'}
                                </button>
                            </div>
                        </div>

                        {isSchoolRecordDetail && tabs?.length ? (
                            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-5 pt-3">
                                {tabs.map((tab, index) => (
                                    <button
                                        key={tab.label}
                                        type="button"
                                        onClick={() => setActiveTabIndex(index)}
                                        className={`shrink-0 rounded-t-lg border px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${activeTabIndex === index ? 'border-blue-600 bg-white text-blue-700' : 'border-transparent text-slate-500 hover:bg-white hover:text-slate-700'}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        {shouldShowDisciplines && visibleDisciplines.length ? (
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

                        <div className={`min-h-0 flex-1 overflow-y-auto ${isSchoolRecordDetail ? 'px-6 py-5' : 'px-3 py-2'}`}>
                            <div className={`flex min-w-0 flex-col ${isSchoolRecordDetail ? 'gap-5' : 'gap-2'}`}>
                                {shouldShowDisciplines && visibleSubjectBadges.length ? (
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
                                <div className={isSchoolRecordDetail ? 'space-y-5' : 'space-y-2'}>
                                    {activeTabSections.map((section, sectionIndex) => (
                                        <section key={`${section.title || 'section'}-${sectionIndex}`} className={isSchoolRecordDetail ? '' : 'rounded-lg border border-slate-100 bg-slate-50/60 p-2'}>
                                            {section.title ? (
                                                <div className={isSchoolRecordDetail ? 'mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500' : 'mb-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400'}>
                                                    {section.title}
                                                </div>
                                            ) : null}

                                            <div className={isSchoolRecordDetail ? 'grid grid-cols-1 gap-4 md:grid-cols-2' : 'grid grid-cols-1 gap-1.5 md:grid-cols-3 xl:grid-cols-4'}>
                                                {section.items.map((item) => (
                                                    <div key={`${sectionIndex}-${item.label}`} className={isSchoolRecordDetail ? item.tone === 'danger' ? 'rounded-lg border border-red-300 bg-red-100 px-3 py-2.5' : 'rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5' : 'rounded-lg border border-slate-100 bg-white px-2 py-1.5 shadow-sm'}>
                                                        <div className={isSchoolRecordDetail ? item.tone === 'danger' ? 'text-[10px] font-bold text-red-800' : 'text-[10px] font-bold text-slate-700' : 'text-[9px] font-black uppercase tracking-[0.1em] text-slate-400'}>
                                                            {item.label}
                                                        </div>
                                                        <div className={isSchoolRecordDetail ? item.tone === 'danger' ? 'mt-1 break-words text-sm font-bold text-red-900' : 'mt-1 break-words text-sm font-medium text-slate-800' : 'mt-0.5 break-words text-[11px] font-semibold text-slate-700'}>
                                                            {item.value}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    ))}
                                </div>
                                {activeTabActions.length ? (
                                    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                                        {activeTabActions.map((action) => {
                                            const isRunning = runningActionId === action.id;
                                            return (
                                                <button
                                                    key={action.id}
                                                    type="button"
                                                    disabled={action.disabled || runningActionId !== null}
                                                    onClick={async () => {
                                                        setRunningActionId(action.id);
                                                        try {
                                                            await action.onClick();
                                                        } finally {
                                                            setRunningActionId(null);
                                                        }
                                                    }}
                                                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                                                >
                                                    {isRunning ? 'Enviando...' : action.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                                {contextLabel && !isSchoolRecordDetail ? (
                                    <div className="text-right">
                                        <ScreenNameCopy screenId={contextLabel} className="justify-end" disableMargin compact={compactFooter} />
                                    </div>
                                ) : null}
                            </div>
                        </div>
                        {contextLabel && isSchoolRecordDetail ? (
                            <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-3">
                                <ScreenNameCopy screenId={contextLabel} className="justify-end" disableMargin compact={compactFooter} />
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </>
    );
}
