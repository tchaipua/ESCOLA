'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

type SalesScreenParameters = {
    allowSaleUnitPriceEdit: boolean;
    allowSaleItemDiscount: boolean;
    groupSameProduct: boolean;
};

type SalesScreenParametersModalProps = {
    isOpen: boolean;
    tenantId: string | null;
    initialParameters: SalesScreenParameters;
    onClose: () => void;
    onSave: (parameters: SalesScreenParameters) => Promise<void>;
};

const SCREEN_ID = 'POPUP_PRINCIPAL_FINANCEIRO_VENDAS_PARAMETROS_TELA';

export default function SalesScreenParametersModal({
    isOpen,
    tenantId,
    initialParameters,
    onClose,
    onSave,
}: SalesScreenParametersModalProps) {
    const branding = useMemo(() => readCachedTenantBranding(tenantId), [tenantId]);
    const { token } = getDashboardAuthContext();
    const [password, setPassword] = useState('');
    const [parameters, setParameters] = useState(initialParameters);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const wasOpenRef = useRef(false);

    useEffect(() => {
        if (!isOpen) {
            wasOpenRef.current = false;
            return;
        }
        if (wasOpenRef.current) return;

        wasOpenRef.current = true;
        setParameters(initialParameters);
        setPassword('');
        setErrorMessage(null);
        setSuccessMessage(null);
    }, [initialParameters, isOpen]);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!password.trim()) {
            setErrorMessage('INFORME A SENHA DE UM ADMINISTRADOR.');
            return;
        }
        if (!token) {
            setErrorMessage('TOKEN DE AUTENTICAÇÃO AUSENTE.');
            return;
        }

        setIsSaving(true);
        setErrorMessage(null);
        try {
            const response = await fetch(`${API_BASE_URL}/auth/confirm-administrator-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ password }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.message || 'SENHA DE ADMINISTRADOR INVÁLIDA.');
            }

            await onSave(parameters);
            setSuccessMessage('OS PARÂMETROS DA TELA FORAM SALVOS COM SUCESSO.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'NÃO FOI POSSÍVEL SALVAR OS PARÂMETROS.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/30 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.45)]">
                <div className="flex items-center gap-4 bg-gradient-to-r from-slate-950 via-slate-800 to-blue-900 px-6 py-5 text-white">
                    <img
                        src={branding?.logoUrl || '/logo-msinfor.jpg'}
                        alt={branding?.schoolName || 'MSINFOR Sistemas'}
                        className="h-14 w-14 rounded-full border-2 border-white bg-white object-contain"
                    />
                    <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-200">Parâmetros da tela</div>
                        <div className="mt-1 truncate text-sm font-black">PRINCIPAL_FINANCEIRO_VENDAS</div>
                    </div>
                    <button type="button" onClick={onClose} disabled={isSaving} className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] hover:bg-white/20">
                        Fechar
                    </button>
                </div>

                <div className="space-y-5 px-6 py-6">
                    <div>
                        <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Senha do administrador</label>
                        <input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setErrorMessage(null); }} placeholder="Informe a senha do administrador" autoFocus className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20" disabled={isSaving} />
                    </div>

                    <p className="text-sm text-slate-600">Informe a senha de um usuário da empresa com a função ADMINISTRADOR para liberar a alteração destes parâmetros.</p>

                    <div className="space-y-3">
                        <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <span className="pr-4 text-sm font-bold text-slate-800">Permitir alterar valor unitário</span>
                            <input type="checkbox" checked={parameters.allowSaleUnitPriceEdit} onChange={(event) => setParameters((current) => ({ ...current, allowSaleUnitPriceEdit: event.target.checked }))} className="h-5 w-5 accent-blue-700" />
                        </label>
                        <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <span className="pr-4 text-sm font-bold text-slate-800">Permitir informar desconto por item</span>
                            <input type="checkbox" checked={parameters.allowSaleItemDiscount} onChange={(event) => setParameters((current) => ({ ...current, allowSaleItemDiscount: event.target.checked }))} className="h-5 w-5 accent-blue-700" />
                        </label>
                        <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <span className="pr-4 text-sm font-bold text-slate-800">Agrupar mesmo produto</span>
                            <input type="checkbox" checked={parameters.groupSameProduct} onChange={(event) => setParameters((current) => ({ ...current, groupSameProduct: event.target.checked }))} className="h-5 w-5 accent-blue-700" />
                        </label>
                    </div>

                    <div className="flex justify-end border-t border-slate-100 pt-4">
                        <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="rounded-xl bg-blue-700 px-6 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-blue-700/20 hover:bg-blue-800 disabled:opacity-60">
                            {isSaving ? 'Validando...' : 'Salvar parâmetros'}
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
                    <ScreenNameCopy screenId={SCREEN_ID} className="mt-0" />
                </div>
            </div>

            {errorMessage ? (
                <div
                    className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
                    onClick={() => setErrorMessage(null)}
                    role="presentation"
                >
                    <div
                        className="w-full max-w-md overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-[0_25px_80px_rgba(127,29,29,0.35)]"
                        onClick={(event) => event.stopPropagation()}
                        role="alertdialog"
                        aria-modal="true"
                        aria-label="Erro nos parâmetros da tela"
                    >
                        <div className="flex items-center gap-4 border-b border-rose-100 bg-rose-50 px-5 py-4">
                            <img
                                src={branding?.logoUrl || '/logo-msinfor.jpg'}
                                alt={branding?.schoolName || 'MSINFOR Sistemas'}
                                className="h-12 w-12 rounded-full border-2 border-white bg-white object-contain shadow-sm"
                            />
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500">Mensagem do sistema</div>
                                <div className="mt-1 text-lg font-black text-rose-700">Não foi possível continuar</div>
                            </div>
                        </div>
                        <div className="px-5 py-6">
                            <p className="text-center text-sm font-bold uppercase leading-6 text-slate-700">{errorMessage}</p>
                        </div>
                        <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-5 py-4">
                            <button
                                type="button"
                                onClick={() => setErrorMessage(null)}
                                className="rounded-xl bg-rose-600 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-rose-600/20 hover:bg-rose-700"
                            >
                                Fechar mensagem
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {successMessage ? (
                <div
                    className="fixed inset-0 z-[1101] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
                    onClick={() => {
                        setSuccessMessage(null);
                        onClose();
                    }}
                    role="presentation"
                >
                    <div
                        className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-[0_25px_80px_rgba(6,78,59,0.35)]"
                        onClick={(event) => event.stopPropagation()}
                        role="alertdialog"
                        aria-modal="true"
                        aria-label="Parâmetros salvos com sucesso"
                    >
                        <div className="flex items-center gap-4 border-b border-emerald-100 bg-emerald-50 px-5 py-4">
                            <img
                                src={branding?.logoUrl || '/logo-msinfor.jpg'}
                                alt={branding?.schoolName || 'MSINFOR Sistemas'}
                                className="h-12 w-12 rounded-full border-2 border-white bg-white object-contain shadow-sm"
                            />
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Mensagem do sistema</div>
                                <div className="mt-1 text-lg font-black text-emerald-700">Salvamento concluído</div>
                            </div>
                        </div>
                        <div className="px-5 py-6">
                            <p className="text-center text-sm font-bold uppercase leading-6 text-slate-700">{successMessage}</p>
                        </div>
                        <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-5 py-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setSuccessMessage(null);
                                    onClose();
                                }}
                                className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export type { SalesScreenParameters };
