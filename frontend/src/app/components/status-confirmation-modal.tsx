'use client';

import { useMemo } from 'react';
import RecordStatusIndicator from '@/app/components/record-status-indicator';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

type StatusConfirmationModalProps = {
    isOpen: boolean;
    tenantId: string | null;
    actionType: 'activate' | 'deactivate';
    title: string;
    itemLabel: string;
    itemName: string;
    description: string;
    hintText?: string;
    confirmLabel: string;
    cancelLabel?: string;
    onCancel: () => void;
    onConfirm: () => void;
    isProcessing?: boolean;
    statusActive?: boolean;
};

export default function StatusConfirmationModal({
    isOpen,
    tenantId,
    actionType,
    title,
    itemLabel,
    itemName,
    description,
    hintText,
    confirmLabel,
    cancelLabel = 'Cancelar',
    onCancel,
    onConfirm,
    isProcessing = false,
    statusActive = true,
}: StatusConfirmationModalProps) {
    const branding = useMemo(() => readCachedTenantBranding(tenantId), [tenantId]);

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
                <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-5 bg-slate-50">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white">
                        {branding?.logoUrl ? (
                            <img src={branding.logoUrl} alt={branding.schoolName} className="h-12 w-12 rounded-xl object-contain" />
                        ) : (
                            <span className="text-lg font-black uppercase text-slate-500">
                                {String(branding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                            </span>
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                            Confirmação visual
                        </p>
                        <h3 className="text-lg font-bold text-slate-900">
                            {title}
                        </h3>
                    </div>
                    <button
                        onClick={onCancel}
                        disabled={isProcessing}
                        className="ml-auto rounded-full border border-transparent bg-white p-2 text-slate-400 transition hover:text-slate-600 disabled:cursor-wait"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="space-y-4 px-6 py-6 text-sm text-slate-600">
                    <div className="flex items-center gap-3">
                        <RecordStatusIndicator active={statusActive} />
                        <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{itemLabel}</p>
                            <p className="text-base font-semibold text-slate-800">{itemName}</p>
                        </div>
                    </div>
                    <p>{description}</p>
                    {hintText ? (
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                            {hintText}
                        </p>
                    ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isProcessing}
                        className="rounded-2xl border border-slate-200 bg-rose-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-rose-700 transition hover:bg-rose-100 disabled:cursor-wait"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isProcessing}
                        className={`rounded-2xl px-6 py-3 text-sm font-bold uppercase tracking-[0.3em] text-white shadow-lg transition ${actionType === 'activate' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/40' : 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/40'} disabled:cursor-wait disabled:opacity-70`}
                    >
                        {isProcessing ? 'Processando...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

export type { StatusConfirmationModalProps };
