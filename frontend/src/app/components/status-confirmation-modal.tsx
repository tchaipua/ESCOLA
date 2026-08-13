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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';

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
    onConfirm: (reason?: string) => void;
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
    const [reason, setReason] = useState('');
    const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setPassword('');
            setPasswordError(null);
            setReason('');
            setIsVerifyingPassword(false);
            setIsPasswordVisible(false);
            return;
        }

        setPassword('');
        setPasswordError(null);
        setReason('');
        setIsPasswordVisible(false);
    }, [isOpen, actionType, itemName]);

    const shouldRequestPassword = requirePassword && actionType !== 'activate';
    const isDeactivation = actionType === 'deactivate';

    const handleConfirm = async () => {
        if (shouldRequestPassword) {
            if (!password.trim()) {
                setPasswordError('SENHA OBRIGATÓRIA.');
                return;
            }
            if (!reason.trim()) {
                setPasswordError('OBSERVAÇÃO OBRIGATÓRIA.');
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

                    },
                    body: JSON.stringify({ password }),
                });
                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(payload?.message || 'Senha inválida.');
                }
                setPassword('');
                onConfirm(reason.trim());
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

    const passwordField = (
        <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-slate-50 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
            <input
                type={isPasswordVisible ? 'text' : 'password'}
                value={password}
                onChange={(event) => {
                    setPassword(event.target.value);
                    if (passwordError) {
                        setPasswordError(null);
                    }
                }}
                aria-label="Senha de confirmação"
                placeholder="Informar Senha Inativação Aqui !!!"
                className="min-w-0 flex-1 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-900 placeholder:text-rose-600 placeholder:font-semibold outline-none"
                disabled={isVerifyingPassword}
            />
            <button
                type="button"
                onClick={() => setIsPasswordVisible((current) => !current)}
                className="flex w-12 shrink-0 items-center justify-center border-l border-slate-200 text-slate-500 transition hover:bg-white hover:text-blue-600"
                aria-label={isPasswordVisible ? 'Ocultar senha de confirmação' : 'Mostrar senha de confirmação'}
                title={isPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
            >
                {isPasswordVisible ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3l18 18" />
                        <path d="M10.58 10.58A2 2 0 0013.42 13.42" />
                        <path d="M9.88 5.09A10.94 10.94 0 0112 5c7 0 10 7 10 7a18.27 18.27 0 01-4.23 5.42" />
                        <path d="M6.61 6.61C3.61 8.79 2 12 2 12s3 7 10 7a10.9 10.9 0 005.39-1.44" />
                    </svg>
                ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                )}
            </button>
        </div>
    );

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in">
            <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
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
                <div className="flex items-center gap-4 border-b border-blue-600 bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-4 text-white">
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
                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-blue-100">
                            Confirmação de inativação
                        </p>
                        <h3 className="text-2xl font-extrabold">
                            {title}
                        </h3>
                    </div>
                    <button
                        onClick={onCancel}
                        disabled={isProcessing}
                        className="ml-auto rounded-full border border-white/70 bg-red-600 p-2 text-white transition hover:bg-red-700 disabled:cursor-wait"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="space-y-4 px-6 py-8 text-center text-sm text-slate-600">
                    <p>{description}</p>
                    <p className="text-lg font-extrabold text-blue-700">{itemName}</p>
                    {hintText ? (
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                            {hintText}
                        </p>
                    ) : null}
                </div>
                {shouldRequestPassword ? (
                    <div className="space-y-4 border-t border-slate-100 px-6 pb-6 pt-5">
                        {isDeactivation ? (
                            <div className="space-y-4 rounded-xl border-2 border-rose-500 bg-rose-50 p-4">
                                <div className="flex items-center gap-3 text-left">
                                    <svg className="h-7 w-7 shrink-0 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <rect x="5" y="10" width="14" height="11" rx="2" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10V7a4 4 0 018 0v3M12 14v3" />
                                    </svg>
                                    <div className="text-sm font-black uppercase tracking-[0.08em] text-rose-700">
                                        SENHA DE INATIVAÇÃO OBRIGATÓRIA
                                    </div>
                                </div>
                                {passwordField}
                            </div>
                        ) : passwordField}
                        <textarea value={reason} onChange={(event) => setReason(event.target.value)} aria-label="Observação do motivo" placeholder="Descreva o motivo da inativação" className="min-h-24 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white" disabled={isVerifyingPassword} />
                    </div>
                ) : null}
                <div className="border-t border-slate-100 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={isProcessing || isVerifyingPassword}
                            className="rounded-full border-2 border-emerald-600 bg-white px-6 py-3 text-sm font-extrabold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-70"
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
