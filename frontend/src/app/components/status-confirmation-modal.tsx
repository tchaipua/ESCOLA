'use client';

import { useEffect, useMemo, useState } from 'react';
import RecordStatusIndicator from '@/app/components/record-status-indicator';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import {
    isPasswordConfirmationValid,
    markPasswordConfirmed,
} from '@/app/lib/password-confirmation-cache';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

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
    screenId: string;
    requirePassword?: boolean;
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
    cancelLabel = 'Fechar',
    screenId,
    requirePassword = true,
    onCancel,
    onConfirm,
    isProcessing = false,
    statusActive = true,
}: StatusConfirmationModalProps) {
    const branding = useMemo(() => readCachedTenantBranding(tenantId), [tenantId]);
    const { token, userId } = getDashboardAuthContext();
    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setPassword('');
            setPasswordError(null);
            setIsVerifyingPassword(false);
            return;
        }

        setPassword('');
        setPasswordError(null);
    }, [isOpen, actionType, itemName]);

    const shouldRequestPassword =
        requirePassword && actionType !== 'activate' && !isPasswordConfirmationValid(userId);

    const handleConfirm = async () => {
        if (shouldRequestPassword) {
            if (!password.trim()) {
                setPasswordError('SENHA OBRIGATÓRIA.');
                return;
            }
            if (!token) {
                setPasswordError('Token de autenticação ausente.');
                return;
            }
            setIsVerifyingPassword(true);
            setPasswordError(null);
            try {
                const response = await fetch(`${API_BASE_URL}/auth/confirm-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ password }),
                });
                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(payload?.message || 'Senha inválida.');
                }
                if (userId) {
                    markPasswordConfirmed(userId);
                }
                setPassword('');
                onConfirm();
            } catch (error) {
                setPasswordError(
                    error instanceof Error ? error.message : 'Não foi possível validar a senha.',
                );
            } finally {
                setIsVerifyingPassword(false);
            }
            return;
        }
        onConfirm();
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in">
            <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
                {passwordError ? (
                    <div className="pointer-events-none absolute right-5 top-5 z-20">
                        <div
                            role="alert"
                            aria-live="assertive"
                            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.3em] text-rose-700 shadow-lg"
                        >
                            {passwordError.toUpperCase()}
                        </div>
                    </div>
                ) : null}
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
                {shouldRequestPassword ? (
                    <div className="space-y-2 border-t border-slate-100 px-6 pb-6 pt-3">
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => {
                                setPassword(event.target.value);
                                if (passwordError) {
                                    setPasswordError(null);
                                }
                            }}
                            aria-label="Senha de confirmação"
                            placeholder="Informar Senha Inativação Aqui !!!"
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-900 placeholder:text-rose-600 placeholder:font-semibold outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                            disabled={isVerifyingPassword}
                        />
                    </div>
                ) : null}
                <div className="border-t border-slate-100 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={isProcessing}
                            className="rounded-2xl border border-rose-300 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-rose-600 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-70"
                        >
                            {cancelLabel}
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={isProcessing || isVerifyingPassword}
                            className={`rounded-2xl px-6 py-3 text-sm font-bold uppercase tracking-[0.3em] text-white shadow-lg transition ${actionType === 'activate' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/40' : 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/40'} disabled:cursor-wait disabled:opacity-70`}
                        >
                            {isProcessing || isVerifyingPassword ? 'Processando...' : confirmLabel}
                        </button>
                    </div>
                    <div className="mt-3 flex justify-end">
                        <ScreenNameCopy screenId={screenId} className="mt-0" />
                    </div>
                </div>
            </div>
        </div>
    );
}

export type { StatusConfirmationModalProps };
