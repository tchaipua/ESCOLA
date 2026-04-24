'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { clearStoredSession } from '@/app/lib/auth-storage';
import {
    getDashboardAuthContext,
    hasAnyDashboardPermission,
    hasDashboardPermission,
    type DashboardAuthContext,
} from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const SCREEN_ID = 'PRINCIPAL_MENSALIDADES_ENVIO_BOLETOS';

type BankDispatchResponse = {
    batch: {
        id: string;
        launchType: string;
        scope: string;
        referenceMonth: string;
        referenceMonthLabel: string;
        installmentCount: number;
        firstDueDate: string;
        totalStudents: number;
        totalInstallments: number;
        totalAmount: number;
        skippedStudentsCount: number;
        createdAt: string;
        createdBy?: string | null;
        schoolYear?: {
            id: string;
            year: number;
        } | null;
        targetLabel: string;
    };
    banks: Array<{
        id: string;
        bankCode: string;
        bankName: string;
        branchNumber: string;
        branchDigit?: string | null;
        accountNumber: string;
        accountDigit?: string | null;
        label: string;
    }>;
    installments: Array<{
        id: string;
        batchId: string;
        studentId: string;
        studentName: string;
        payerName: string;
        classLabel: string | null;
        description: string;
        installmentNumber: number;
        installmentCount: number;
        dueDate: string;
        amount: number;
        openAmount: number;
        paidAmount: number;
        status: string;
        settlementMethod?: string | null;
        settledAt?: string | null;
        bankAccountId?: string | null;
        bankAccountLabel?: string | null;
        bankAssignedAt?: string | null;
        bankAssignedBy?: string | null;
        isOverdue: boolean;
    }>;
};

type SaveBankResponse = {
    batchId: string;
    bankAccountId: string;
    bankAccountLabel: string;
    updatedCount: number;
    message: string;
};

const EMPTY_AUTH_CONTEXT: DashboardAuthContext = {
    token: null,
    userId: null,
    role: null,
    permissions: [],
    tenantId: null,
    name: null,
    modelType: null,
};

const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass = 'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';

function formatCurrency(value?: number | null) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(typeof value === 'number' ? value : 0);
}

function formatDateLabel(value?: string | null) {
    if (!value) return '---';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('pt-BR');
}

function getFriendlyRequestErrorMessage(error: unknown, fallbackMessage: string) {
    if (!(error instanceof Error)) return fallbackMessage;

    const normalizedMessage = String(error.message || '').trim();
    if (!normalizedMessage) return fallbackMessage;

    if (normalizedMessage === 'Failed to fetch') {
        return 'Não foi possível conectar ao servidor. Verifique se o backend está aberto e tente novamente.';
    }

    if (normalizedMessage === 'Unauthorized') {
        return 'Sua sessão não está autorizada no momento. Faça login novamente e tente outra vez.';
    }

    if (normalizedMessage === 'Forbidden') {
        return 'Seu usuário não tem permissão para executar esta operação.';
    }

    return normalizedMessage;
}

function isUnauthorizedError(error: unknown) {
    return error instanceof Error && error.message === 'Unauthorized';
}

function getInstallmentStatusClasses(item: BankDispatchResponse['installments'][number]) {
    if (item.status === 'PAID') {
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    }

    if (item.isOverdue) {
        return 'border-rose-200 bg-rose-50 text-rose-700';
    }

    return 'border-blue-200 bg-blue-50 text-blue-700';
}

function getInstallmentStatusLabel(item: BankDispatchResponse['installments'][number]) {
    if (item.status === 'PAID') return 'PAGO';
    if (item.isOverdue) return 'VENCIDO';
    return 'EM ABERTO';
}

export default function PrincipalMensalidadesEnvioBoletosPage() {
    const params = useParams<{ batchId: string }>();
    const router = useRouter();
    const [data, setData] = useState<BankDispatchResponse | null>(null);
    const [selectedBankId, setSelectedBankId] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isClientReady, setIsClientReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    const authContext = isClientReady ? getDashboardAuthContext() : EMPTY_AUTH_CONTEXT;
    const canViewFinancial = isClientReady && hasAnyDashboardPermission(authContext.role, authContext.permissions, ['VIEW_FINANCIAL', 'MANAGE_MONTHLY_FEES']);
    const canManageLaunches = isClientReady && hasDashboardPermission(authContext.role, authContext.permissions, 'MANAGE_MONTHLY_FEES');
    const tenantBranding = useMemo(() => readCachedTenantBranding(authContext.tenantId), [authContext.tenantId]);

    const handleUnauthorized = useCallback(() => {
        clearStoredSession();
        router.replace('/');
    }, [router]);

    useEffect(() => {
        setIsClientReady(true);
    }, []);

    const loadData = useCallback(async () => {
        if (!isClientReady) return;
        if (!authContext.token || !canViewFinancial || !params?.batchId) {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setLoadError(null);

            const response = await fetch(`${API_BASE_URL}/student-financial-launches/${params.batchId}/bank-dispatch`, {
                headers: {
                    Authorization: `Bearer ${authContext.token}`,
                },
            });

            const payload = await response.json().catch(() => null);
            if (response.status === 401) {
                throw new Error('Unauthorized');
            }
            if (!response.ok) {
                throw new Error(payload?.message || 'Não foi possível carregar as parcelas para envio de boletos.');
            }

            setData(payload as BankDispatchResponse);
        } catch (error) {
            if (isUnauthorizedError(error)) {
                handleUnauthorized();
                return;
            }
            setData(null);
            setLoadError(getFriendlyRequestErrorMessage(error, 'Não foi possível carregar as parcelas para envio de boletos.'));
        } finally {
            setIsLoading(false);
        }
    }, [authContext.token, canViewFinancial, handleUnauthorized, isClientReady, params?.batchId]);

    useEffect(() => {
        if (!isClientReady) return;
        void loadData();
    }, [isClientReady, loadData]);

    const selectableInstallments = useMemo(() => {
        return (data?.installments || []).filter((item) => item.status === 'OPEN' && item.openAmount > 0);
    }, [data?.installments]);

    const allSelectableChecked = useMemo(() => {
        return selectableInstallments.length > 0 && selectableInstallments.every((item) => selectedIds.includes(item.id));
    }, [selectableInstallments, selectedIds]);

    const selectedInstallments = useMemo(() => {
        return (data?.installments || []).filter((item) => selectedIds.includes(item.id));
    }, [data?.installments, selectedIds]);

    const selectedAmount = useMemo(() => {
        return selectedInstallments.reduce((total, item) => total + item.openAmount, 0);
    }, [selectedInstallments]);

    const selectedBankLabel = useMemo(() => {
        return data?.banks.find((item) => item.id === selectedBankId)?.label || '';
    }, [data?.banks, selectedBankId]);

    const handleToggleInstallment = useCallback((installmentId: string) => {
        setSelectedIds((current) =>
            current.includes(installmentId)
                ? current.filter((item) => item !== installmentId)
                : [...current, installmentId],
        );
    }, []);

    const handleToggleAllVisible = useCallback(() => {
        const selectableIds = selectableInstallments.map((item) => item.id);
        setSelectedIds((current) => {
            if (selectableIds.every((item) => current.includes(item))) {
                return current.filter((item) => !selectableIds.includes(item));
            }

            return Array.from(new Set([...current, ...selectableIds]));
        });
    }, [selectableInstallments]);

    const handleApplyBank = useCallback(async () => {
        if (!authContext.token || !params?.batchId || !selectedIds.length || !selectedBankId) return;

        try {
            setIsSaving(true);
            setStatusMessage(null);
            setLoadError(null);

            const response = await fetch(`${API_BASE_URL}/student-financial-launches/${params.batchId}/bank-dispatch`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${authContext.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    bankAccountId: selectedBankId,
                    installmentIds: selectedIds,
                }),
            });

            const payload = (await response.json().catch(() => null)) as SaveBankResponse | { message?: string } | null;
            if (response.status === 401) {
                throw new Error('Unauthorized');
            }
            if (!response.ok) {
                throw new Error(payload && 'message' in payload ? payload.message || 'Não foi possível vincular o banco aos boletos.' : 'Não foi possível vincular o banco aos boletos.');
            }

            setStatusMessage(payload?.message || 'Banco vinculado com sucesso às parcelas selecionadas.');
            setSelectedIds([]);
            await loadData();
        } catch (error) {
            if (isUnauthorizedError(error)) {
                handleUnauthorized();
                return;
            }
            setLoadError(getFriendlyRequestErrorMessage(error, 'Não foi possível vincular o banco aos boletos.'));
        } finally {
            setIsSaving(false);
        }
    }, [authContext.token, handleUnauthorized, loadData, params?.batchId, selectedBankId, selectedIds]);

    if (!isClientReady) {
        return (
            <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl items-center justify-center">
                <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Financeiro integrado</div>
                    <h1 className="mt-5 text-3xl font-extrabold text-[#153a6a]">Carregando envio de boletos</h1>
                    <p className="mt-3 text-sm font-medium text-slate-500">
                        Preparando permissões e parcelas do lançamento.
                    </p>
                </div>
            </div>
        );
    }

    if (!canViewFinancial) {
        return (
            <DashboardAccessDenied
                title="Financeiro indisponível"
                message="Seu perfil não possui permissão para visualizar o envio de boletos das mensalidades."
            />
        );
    }

    return (
        <div className="space-y-6">
            <section className={`${cardClass} overflow-hidden`}>
                <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-sm">
                                {tenantBranding?.logoUrl ? (
                                    <img
                                        src={tenantBranding.logoUrl}
                                        alt={`Logo de ${tenantBranding.schoolName}`}
                                        className="h-full w-full object-contain p-1.5"
                                    />
                                ) : (
                                    <span className="text-sm font-black uppercase tracking-[0.25em] text-white">
                                        {String(tenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <div>
                                <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Financeiro integrado</div>
                                <h1 className="mt-2 text-3xl font-black tracking-tight">Envio de Boletos</h1>
                                <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                                    Selecione as parcelas deste lançamento e defina qual banco será usado no próximo passo de envio dos boletos.
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <Link
                                href="/principal/mensalidades"
                                className="rounded-2xl border border-white/25 bg-white/10 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/20"
                            >
                                Voltar
                            </Link>
                            {params?.batchId ? (
                                <Link
                                    href={`/principal/mensalidades/detalhes/${params.batchId}`}
                                    className="rounded-2xl border border-white/25 bg-white/10 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/20"
                                >
                                    Ver detalhes
                                </Link>
                            ) : null}
                        </div>
                    </div>
                </div>
                <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
                    <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" />
                </div>
            </section>

            {statusMessage ? (
                <section className={`${cardClass} border-emerald-200 bg-emerald-50 px-6 py-5 text-sm font-semibold text-emerald-700`}>
                    {statusMessage}
                </section>
            ) : null}

            {loadError ? (
                <section className={`${cardClass} border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700`}>
                    {loadError}
                </section>
            ) : null}

            {data ? (
                <section className={`${cardClass} p-6`}>
                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Competência</div>
                            <div className="mt-2 text-base font-black text-slate-900">{data.batch.referenceMonthLabel}</div>
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                {data.batch.targetLabel}
                            </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Parcelas do lote</div>
                            <div className="mt-2 text-2xl font-black text-slate-900">{data.installments.length}</div>
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                {data.batch.totalInstallments} geradas
                            </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Selecionadas</div>
                            <div className="mt-2 text-2xl font-black text-slate-900">{selectedIds.length}</div>
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                {formatCurrency(selectedAmount)}
                            </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">1º vencimento</div>
                            <div className="mt-2 text-base font-black text-slate-900">{formatDateLabel(data.batch.firstDueDate)}</div>
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                Criado em {formatDateLabel(data.batch.createdAt)}
                            </div>
                        </div>
                    </div>
                </section>
            ) : null}

            <section className={`${cardClass} p-6`}>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
                    <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Banco de envio</div>
                        <select
                            value={selectedBankId}
                            onChange={(event) => setSelectedBankId(event.target.value)}
                            className={`${inputClass} mt-2`}
                            disabled={!data?.banks.length || !canManageLaunches}
                        >
                            <option value="">Selecione o banco</option>
                            {(data?.banks || []).map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.label}
                                </option>
                            ))}
                        </select>
                        {selectedBankLabel ? (
                            <div className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Banco selecionado: {selectedBankLabel}
                            </div>
                        ) : null}
                        {!data?.banks.length ? (
                            <div className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                                Nenhum banco ativo foi encontrado para esta escola no Financeiro.
                            </div>
                        ) : null}
                    </div>
                    <div className="flex items-end">
                        <button
                            type="button"
                            onClick={() => void handleApplyBank()}
                            disabled={!canManageLaunches || !selectedBankId || !selectedIds.length || isSaving}
                            className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                        >
                            {isSaving ? 'Gravando...' : 'Gravar banco nos boletos'}
                        </button>
                    </div>
                </div>

                {!canManageLaunches ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-700">
                        Seu perfil pode consultar esta tela, mas não possui permissão para gravar o banco de envio dos boletos.
                    </div>
                ) : null}
            </section>

            <section className={`${cardClass} overflow-hidden`}>
                <div className="border-b border-slate-100 px-6 py-5">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Parcelas do lançamento</div>
                            <h2 className="mt-1 text-xl font-black text-slate-900">
                                {isLoading ? 'Carregando parcelas...' : `${data?.installments.length || 0} parcela(s) encontrada(s)`}
                            </h2>
                        </div>
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Somente parcelas em aberto podem ser marcadas para envio.
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                            <tr>
                                <th className="px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={allSelectableChecked}
                                        onChange={handleToggleAllVisible}
                                        disabled={!canManageLaunches || !selectableInstallments.length || isSaving}
                                        aria-label="Selecionar todas as parcelas em aberto"
                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                </th>
                                <th className="px-4 py-3">Aluno</th>
                                <th className="px-4 py-3">Pagador</th>
                                <th className="px-4 py-3">Descrição</th>
                                <th className="px-4 py-3">Turma</th>
                                <th className="px-4 py-3">Vencimento</th>
                                <th className="px-4 py-3">Valor</th>
                                <th className="px-4 py-3">Banco</th>
                                <th className="px-4 py-3">Situação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(data?.installments || []).map((item) => {
                                const isSelectable = item.status === 'OPEN' && item.openAmount > 0;
                                const rowValue = item.status === 'PAID' ? item.paidAmount : item.openAmount;

                                return (
                                    <tr key={item.id} className="border-t border-slate-100 align-top transition hover:bg-slate-50/70">
                                        <td className="px-4 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(item.id)}
                                                onChange={() => handleToggleInstallment(item.id)}
                                                disabled={!canManageLaunches || !isSelectable || isSaving}
                                                aria-label={`Selecionar parcela de ${item.studentName}`}
                                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="font-black text-slate-900">{item.studentName}</div>
                                            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                                PARCELA {item.installmentNumber}/{item.installmentCount}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 font-semibold text-slate-700">{item.payerName || '---'}</td>
                                        <td className="px-4 py-4">
                                            <div className="font-semibold text-slate-700">{item.description}</div>
                                            {item.settledAt ? (
                                                <div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                                    BAIXADA EM {formatDateLabel(item.settledAt)}
                                                    {item.settlementMethod ? ` - ${item.settlementMethod}` : ''}
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-4 font-semibold text-slate-700">{item.classLabel || '---'}</td>
                                        <td className="px-4 py-4 font-semibold text-slate-700">{formatDateLabel(item.dueDate)}</td>
                                        <td className="px-4 py-4 font-black text-slate-900">{formatCurrency(rowValue)}</td>
                                        <td className="px-4 py-4">
                                            <div className="font-semibold text-slate-700">{item.bankAccountLabel || 'NÃO DEFINIDO'}</div>
                                            {item.bankAssignedAt ? (
                                                <div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                                    DEFINIDO EM {formatDateLabel(item.bankAssignedAt)}
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${getInstallmentStatusClasses(item)}`}>
                                                {getInstallmentStatusLabel(item)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}

                            {!isLoading && !(data?.installments || []).length ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                                        Nenhuma parcela foi encontrada para este lançamento.
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
