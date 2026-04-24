'use client';

import { useEffect, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import {
    getDashboardAuthContext,
    hasAnyDashboardPermission,
    hasDashboardPermission,
} from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const SCREEN_ID = 'PRINCIPAL_PARCELAS_CAIXA_GERAL';
const CONFIRM_SCREEN_ID = 'POPUP_PRINCIPAL_PARCELAS_CONFIRMAR_BAIXA';
const ALERT_SCREEN_ID = 'POPUP_PRINCIPAL_PARCELAS_ALERTA_GERAL';

type InstallmentListStatus = 'OPEN' | 'PAID' | 'OVERDUE' | 'ALL';

type InstallmentFilters = {
    status: InstallmentListStatus;
    studentName: string;
    payerName: string;
};

type AlertModalState = {
    type: 'warning' | 'success' | 'error';
    title: string;
    message: string;
};

type CashSessionResponse = {
    id: string;
    cashierDisplayName: string;
    status: string;
    openingAmount: number;
    totalReceivedAmount: number;
    expectedClosingAmount: number;
    openedAt: string;
    movementCount: number;
    settlementCount: number;
};

type InstallmentResponse = {
    id: string;
    sourceEntityName: string;
    classLabel?: string | null;
    description: string;
    payerNameSnapshot: string;
    installmentNumber: number;
    installmentCount: number;
    dueDate: string;
    amount: number;
    openAmount: number;
    paidAmount: number;
    status: string;
    settledAt?: string | null;
    settlementMethod?: string | null;
    isOverdue: boolean;
};

const DEFAULT_FILTERS: InstallmentFilters = {
    status: 'OPEN',
    studentName: '',
    payerName: '',
};

const STATUS_OPTIONS: Array<{ value: InstallmentListStatus; label: string }> = [
    { value: 'OPEN', label: 'ABERTAS' },
    { value: 'PAID', label: 'FECHADAS' },
    { value: 'OVERDUE', label: 'VENCIDAS' },
    { value: 'ALL', label: 'TODAS' },
];

const inputClass =
    'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';
const labelClass =
    'mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

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

function getInstallmentStatusLabel(item: InstallmentResponse) {
    if (item.status === 'PAID') return 'FECHADA';
    if (item.isOverdue) return 'VENCIDA';
    return 'ABERTA';
}

function getInstallmentStatusClasses(item: InstallmentResponse) {
    if (item.status === 'PAID') {
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    }

    if (item.isOverdue) {
        return 'border-rose-200 bg-rose-50 text-rose-700';
    }

    return 'border-blue-200 bg-blue-50 text-blue-700';
}

export default function PrincipalParcelasPage() {
    const authContext = getDashboardAuthContext();
    const canViewCashier = hasAnyDashboardPermission(authContext.role, authContext.permissions, ['VIEW_CASHIER', 'SETTLE_RECEIVABLES']);
    const canOpenCashier = hasDashboardPermission(authContext.role, authContext.permissions, 'VIEW_CASHIER');
    const canSettleInstallments = hasDashboardPermission(authContext.role, authContext.permissions, 'SETTLE_RECEIVABLES');
    const tenantBranding = readCachedTenantBranding(authContext.tenantId);

    const [filters, setFilters] = useState<InstallmentFilters>(DEFAULT_FILTERS);
    const [appliedFilters, setAppliedFilters] = useState<InstallmentFilters>(DEFAULT_FILTERS);
    const [installments, setInstallments] = useState<InstallmentResponse[]>([]);
    const [currentSession, setCurrentSession] = useState<CashSessionResponse | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [openingAmount, setOpeningAmount] = useState('');
    const [openingNotes, setOpeningNotes] = useState('');
    const [isLoadingInstallments, setIsLoadingInstallments] = useState(true);
    const [isLoadingSession, setIsLoadingSession] = useState(true);
    const [isOpeningSession, setIsOpeningSession] = useState(false);
    const [isSettling, setIsSettling] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [alertModal, setAlertModal] = useState<AlertModalState | null>(null);

    async function loadCurrentSession() {
        if (!authContext.token || !canViewCashier) {
            setCurrentSession(null);
            setIsLoadingSession(false);
            return;
        }

        try {
            setIsLoadingSession(true);

            const response = await fetch(`${API_BASE_URL}/financial-cashier/current-session`, {
                headers: {
                    Authorization: `Bearer ${authContext.token}`,
                },
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.message || 'Não foi possível carregar o caixa atual.');
            }

            setCurrentSession(payload);
        } catch (error) {
            setCurrentSession(null);
            setAlertModal({
                type: 'error',
                title: 'Erro ao carregar o caixa',
                message: getFriendlyRequestErrorMessage(error, 'Não foi possível carregar o caixa atual do usuário.'),
            });
        } finally {
            setIsLoadingSession(false);
        }
    }

    async function loadInstallments(nextFilters: InstallmentFilters) {
        if (!authContext.token || !canViewCashier) {
            setInstallments([]);
            setIsLoadingInstallments(false);
            return;
        }

        try {
            setIsLoadingInstallments(true);

            const query = new URLSearchParams({
                status: nextFilters.status,
            });

            if (nextFilters.studentName.trim()) {
                query.set('studentName', nextFilters.studentName.trim());
            }

            if (nextFilters.payerName.trim()) {
                query.set('payerName', nextFilters.payerName.trim());
            }

            const response = await fetch(`${API_BASE_URL}/financial-cashier/installments?${query.toString()}`, {
                headers: {
                    Authorization: `Bearer ${authContext.token}`,
                },
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.message || 'Não foi possível carregar as parcelas.');
            }

            setInstallments(Array.isArray(payload) ? payload : []);
        } catch (error) {
            setInstallments([]);
            setAlertModal({
                type: 'error',
                title: 'Erro ao carregar parcelas',
                message: getFriendlyRequestErrorMessage(error, 'Não foi possível carregar as parcelas do Financeiro.'),
            });
        } finally {
            setIsLoadingInstallments(false);
        }
    }

    useEffect(() => {
        void loadCurrentSession();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authContext.token, canViewCashier]);

    useEffect(() => {
        void loadInstallments(appliedFilters);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authContext.token, canViewCashier, appliedFilters.status, appliedFilters.studentName, appliedFilters.payerName]);

    useEffect(() => {
        const visibleSelectableIds = new Set(
            installments
                .filter((item) => item.status !== 'PAID' && item.openAmount > 0)
                .map((item) => item.id),
        );

        setSelectedIds((current) => current.filter((id) => visibleSelectableIds.has(id)));
    }, [installments]);

    const selectableInstallments = installments.filter((item) => item.status !== 'PAID' && item.openAmount > 0);
    const selectedInstallments = installments.filter((item) => selectedIds.includes(item.id));
    const selectedTotalAmount = selectedInstallments.reduce((total, item) => total + Number(item.openAmount || 0), 0);
    const allSelectableChecked = selectableInstallments.length > 0 && selectableInstallments.every((item) => selectedIds.includes(item.id));

    async function handleOpenCashSession() {
        if (!authContext.token || !canOpenCashier || isOpeningSession) return;

        const normalizedOpeningAmount = openingAmount.trim();
        const parsedOpeningAmount = normalizedOpeningAmount ? Number(normalizedOpeningAmount.replace(',', '.')) : undefined;

        if (typeof parsedOpeningAmount === 'number' && (!Number.isFinite(parsedOpeningAmount) || parsedOpeningAmount < 0)) {
            setAlertModal({
                type: 'warning',
                title: 'Valor de abertura inválido',
                message: 'Informe um valor de abertura igual ou maior que zero.',
            });
            return;
        }

        try {
            setIsOpeningSession(true);

            const response = await fetch(`${API_BASE_URL}/financial-cashier/open-session`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${authContext.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    openingAmount: parsedOpeningAmount,
                    notes: openingNotes.trim() || undefined,
                }),
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.message || 'Não foi possível abrir o caixa.');
            }

            setCurrentSession(payload);
            setOpeningAmount('');
            setOpeningNotes('');
            setAlertModal({
                type: 'success',
                title: 'Caixa aberto com sucesso',
                message: 'O caixa do usuário foi aberto e já está pronto para receber baixas em dinheiro.',
            });
        } catch (error) {
            setAlertModal({
                type: 'error',
                title: 'Erro ao abrir o caixa',
                message: getFriendlyRequestErrorMessage(error, 'Não foi possível abrir o caixa do usuário.'),
            });
        } finally {
            setIsOpeningSession(false);
        }
    }

    async function handleConfirmSettlement() {
        if (!authContext.token || !currentSession || !selectedInstallments.length || isSettling) {
            setIsConfirmOpen(false);
            return;
        }

        try {
            setIsSettling(true);
            setIsConfirmOpen(false);

            let successCount = 0;
            const failureMessages: string[] = [];

            for (const installment of selectedInstallments) {
                try {
                    const response = await fetch(`${API_BASE_URL}/financial-cashier/installments/${installment.id}/settle-cash`, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${authContext.token}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({}),
                    });

                    const payload = await response.json().catch(() => null);
                    if (!response.ok) {
                        throw new Error(payload?.message || `Não foi possível baixar a parcela de ${installment.sourceEntityName}.`);
                    }

                    successCount += 1;
                } catch (error) {
                    failureMessages.push(
                        getFriendlyRequestErrorMessage(
                            error,
                            `Não foi possível baixar a parcela de ${installment.sourceEntityName}.`,
                        ),
                    );
                }
            }

            setSelectedIds([]);
            await Promise.all([loadCurrentSession(), loadInstallments(appliedFilters)]);

            if (failureMessages.length === 0) {
                setAlertModal({
                    type: 'success',
                    title: 'Baixa realizada com sucesso',
                    message: `${successCount} parcela(s) foram baixadas em dinheiro no Financeiro.`,
                });
                return;
            }

            if (successCount > 0) {
                setAlertModal({
                    type: 'warning',
                    title: 'Baixa concluída parcialmente',
                    message: `${successCount} parcela(s) foram baixadas. A primeira falha retornada foi: ${failureMessages[0]}`,
                });
                return;
            }

            setAlertModal({
                type: 'error',
                title: 'Nenhuma parcela foi baixada',
                message: failureMessages[0] || 'Não foi possível registrar a baixa das parcelas selecionadas.',
            });
        } finally {
            setIsSettling(false);
        }
    }

    function handleApplyFilters() {
        const nextFilters = {
            status: filters.status,
            studentName: filters.studentName,
            payerName: filters.payerName,
        };

        setSelectedIds([]);
        setAppliedFilters(nextFilters);
    }

    function handleResetFilters() {
        setFilters(DEFAULT_FILTERS);
        setSelectedIds([]);
        setAppliedFilters(DEFAULT_FILTERS);
    }

    function handleToggleInstallment(installmentId: string) {
        setSelectedIds((current) =>
            current.includes(installmentId)
                ? current.filter((currentId) => currentId !== installmentId)
                : [...current, installmentId],
        );
    }

    function handleToggleAllVisible() {
        if (allSelectableChecked) {
            setSelectedIds([]);
            return;
        }

        setSelectedIds(selectableInstallments.map((item) => item.id));
    }

    function handleStartSettlement() {
        if (!selectedInstallments.length) {
            setAlertModal({
                type: 'warning',
                title: 'Nenhuma parcela selecionada',
                message: 'Selecione pelo menos uma parcela em aberto para registrar a baixa.',
            });
            return;
        }

        if (!currentSession) {
            setAlertModal({
                type: 'warning',
                title: 'Caixa fechado',
                message: 'Antes de dar baixa, abra o caixa do usuário nesta mesma tela.',
            });
            return;
        }

        setIsConfirmOpen(true);
    }

    if (!canViewCashier) {
        return (
            <DashboardAccessDenied
                title="Caixa indisponível"
                message="Seu perfil não possui permissão para visualizar a rotina de parcelas e baixa em dinheiro."
            />
        );
    }

    return (
        <div className="space-y-6">
            <section className={`${cardClass} overflow-hidden`}>
                <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Financeiro integrado</div>
                            <h1 className="mt-2 text-3xl font-black tracking-tight">Parcelas</h1>
                            <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                                Consulte parcelas abertas, fechadas ou vencidas, filtre por aluno ou responsável pagador e faça a baixa em dinheiro direto nesta tela.
                            </p>
                        </div>
                        <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-blue-50">
                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">Filtro inicial</div>
                            <div className="mt-1 text-base font-black">ABERTAS</div>
                            <div className="mt-1 text-xs text-blue-100/85">Sempre que a tela abrir, as parcelas em aberto serão carregadas primeiro.</div>
                        </div>
                    </div>
                </div>
                <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
                    <ScreenNameCopy screenId={SCREEN_ID} className="justify-end text-slate-500" disableMargin />
                </div>
            </section>

            <section className={`${cardClass} p-6`}>
                <div className="grid gap-4 xl:grid-cols-[1.4fr_1.4fr_0.9fr_auto_auto]">
                    <label>
                        <span className={labelClass}>Aluno</span>
                        <input
                            value={filters.studentName}
                            onChange={(event) => setFilters((current) => ({ ...current, studentName: event.target.value }))}
                            className={inputClass}
                            placeholder="NOME DO ALUNO"
                        />
                    </label>

                    <label>
                        <span className={labelClass}>Responsável pelo pagamento</span>
                        <input
                            value={filters.payerName}
                            onChange={(event) => setFilters((current) => ({ ...current, payerName: event.target.value }))}
                            className={inputClass}
                            placeholder="NOME DO PAGADOR"
                        />
                    </label>

                    <label>
                        <span className={labelClass}>Situação</span>
                        <select
                            value={filters.status}
                            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as InstallmentListStatus }))}
                            className={inputClass}
                        >
                            {STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <button
                        type="button"
                        onClick={handleApplyFilters}
                        className="self-end rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
                    >
                        Filtrar
                    </button>

                    <button
                        type="button"
                        onClick={handleResetFilters}
                        className="self-end rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-slate-600 transition hover:bg-slate-100"
                    >
                        Limpar
                    </button>
                </div>
            </section>

            <section className={`${cardClass} p-6`}>
                <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Caixa do usuário</div>
                                <h2 className="mt-1 text-xl font-black text-slate-900">
                                    {isLoadingSession ? 'Carregando caixa...' : currentSession ? 'Caixa aberto' : 'Nenhum caixa aberto'}
                                </h2>
                            </div>
                            <div
                                className={`rounded-2xl border px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${
                                    currentSession
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        : 'border-amber-200 bg-amber-50 text-amber-700'
                                }`}
                            >
                                {currentSession ? 'Pronto para baixa' : 'Abertura necessária'}
                            </div>
                        </div>

                        {currentSession ? (
                            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Operador</div>
                                    <div className="mt-2 text-sm font-black text-slate-900">{currentSession.cashierDisplayName}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Abertura</div>
                                    <div className="mt-2 text-sm font-black text-slate-900">{formatCurrency(currentSession.openingAmount)}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Recebido</div>
                                    <div className="mt-2 text-sm font-black text-slate-900">{formatCurrency(currentSession.totalReceivedAmount)}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Fechamento esperado</div>
                                    <div className="mt-2 text-sm font-black text-slate-900">{formatCurrency(currentSession.expectedClosingAmount)}</div>
                                </div>
                            </div>
                        ) : canOpenCashier ? (
                            <div className="mt-4 grid gap-4 md:grid-cols-[0.7fr_1.3fr_auto]">
                                <label>
                                    <span className={labelClass}>Valor de abertura</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={openingAmount}
                                        onChange={(event) => setOpeningAmount(event.target.value)}
                                        className={inputClass}
                                        placeholder="0,00"
                                    />
                                </label>

                                <label>
                                    <span className={labelClass}>Observação da abertura</span>
                                    <input
                                        value={openingNotes}
                                        onChange={(event) => setOpeningNotes(event.target.value)}
                                        className={inputClass}
                                        placeholder="ABERTURA DO CAIXA"
                                    />
                                </label>

                                <button
                                    type="button"
                                    onClick={() => void handleOpenCashSession()}
                                    disabled={isOpeningSession}
                                    className="self-end rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-70"
                                >
                                    {isOpeningSession ? 'Abrindo...' : 'Abrir caixa'}
                                </button>
                            </div>
                        ) : (
                            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-800">
                                Seu usuário não possui permissão para abrir caixa. Para dar baixa em dinheiro, é necessário operar com acesso de caixa.
                            </div>
                        )}
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                        <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Seleção para baixa</div>
                        <h2 className="mt-1 text-xl font-black text-slate-900">
                            {selectedInstallments.length
                                ? `${selectedInstallments.length} parcela(s) selecionada(s)`
                                : 'Nenhuma parcela selecionada'}
                        </h2>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Valor selecionado</div>
                                <div className="mt-2 text-lg font-black text-slate-900">{formatCurrency(selectedTotalAmount)}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Caixa atual</div>
                                <div className="mt-2 text-sm font-black text-slate-900">
                                    {currentSession ? `${currentSession.cashierDisplayName} - ABERTO` : 'FECHADO'}
                                </div>
                            </div>
                        </div>
                        <p className="mt-4 text-sm font-medium text-slate-500">
                            A baixa em dinheiro só é liberada para usuário com função de caixa e com caixa aberto nesta escola.
                        </p>
                        <button
                            type="button"
                            onClick={handleStartSettlement}
                            disabled={!canSettleInstallments || !selectedInstallments.length || isSettling}
                            className="mt-4 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                        >
                            {isSettling ? 'Baixando...' : 'Dar baixa em dinheiro'}
                        </button>
                    </div>
                </div>
            </section>

            <section className={`${cardClass} overflow-hidden`}>
                <div className="border-b border-slate-100 px-6 py-5">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Resultado da consulta</div>
                            <h2 className="mt-1 text-xl font-black text-slate-900">
                                {isLoadingInstallments ? 'Carregando parcelas...' : `${installments.length} parcela(s) encontrada(s)`}
                            </h2>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <span>Filtro ativo:</span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                                {STATUS_OPTIONS.find((option) => option.value === appliedFilters.status)?.label || 'ABERTAS'}
                            </span>
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
                                        disabled={!canSettleInstallments || !selectableInstallments.length || isSettling}
                                        aria-label="Selecionar todas as parcelas em aberto"
                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                </th>
                                <th className="px-4 py-3">Aluno</th>
                                <th className="px-4 py-3">Responsável pagador</th>
                                <th className="px-4 py-3">Descrição</th>
                                <th className="px-4 py-3">Turma</th>
                                <th className="px-4 py-3">Vencimento</th>
                                <th className="px-4 py-3">Valor</th>
                                <th className="px-4 py-3">Situação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {installments.map((item) => {
                                const isSelectable = item.status !== 'PAID' && item.openAmount > 0;
                                const rowValue = item.status === 'PAID' ? item.paidAmount : item.openAmount;

                                return (
                                    <tr key={item.id} className="border-t border-slate-100 align-top transition hover:bg-slate-50/70">
                                        <td className="px-4 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(item.id)}
                                                onChange={() => handleToggleInstallment(item.id)}
                                                disabled={!canSettleInstallments || !isSelectable || isSettling}
                                                aria-label={`Selecionar parcela de ${item.sourceEntityName}`}
                                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="font-black text-slate-900">{item.sourceEntityName}</div>
                                            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                                PARCELA {item.installmentNumber}/{item.installmentCount}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 font-semibold text-slate-700">{item.payerNameSnapshot}</td>
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
                                            <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${getInstallmentStatusClasses(item)}`}>
                                                {getInstallmentStatusLabel(item)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}

                            {!isLoadingInstallments && !installments.length ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                                        Nenhuma parcela foi encontrada para os filtros informados.
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </section>

            {isConfirmOpen ? (
                <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.4)]">
                        <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
                            <div className="flex items-start gap-4">
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                    {tenantBranding?.logoUrl ? (
                                        <img
                                            src={tenantBranding.logoUrl}
                                            alt={`Logo de ${tenantBranding.schoolName}`}
                                            className="h-full w-full object-contain p-1.5"
                                        />
                                    ) : (
                                        <span className="text-sm font-black uppercase tracking-[0.25em] text-[#153a6a]">
                                            {String(tenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-600">Confirmação de baixa</div>
                                    <h3 className="mt-1 text-xl font-black text-slate-900">Confirmar baixa em dinheiro</h3>
                                    <p className="mt-2 text-sm font-medium text-slate-500">
                                        As parcelas selecionadas serão baixadas no Financeiro usando o caixa atualmente aberto para este usuário.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsConfirmOpen(false)}
                                    disabled={isSettling}
                                    className="rounded-full bg-white px-3 py-2 text-sm font-black text-slate-500 shadow-sm hover:text-slate-900"
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4 px-6 py-6 text-sm font-semibold text-slate-600">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Parcelas selecionadas</div>
                                    <div className="mt-2 text-lg font-black text-slate-900">{selectedInstallments.length}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Valor total</div>
                                    <div className="mt-2 text-lg font-black text-slate-900">{formatCurrency(selectedTotalAmount)}</div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
                                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">Caixa em uso</div>
                                <div className="mt-2 text-sm font-semibold text-slate-700">
                                    {currentSession?.cashierDisplayName || 'CAIXA NÃO IDENTIFICADO'}
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <div className="flex flex-col gap-3">
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsConfirmOpen(false)}
                                        disabled={isSettling}
                                        className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70"
                                    >
                                        Fechar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleConfirmSettlement()}
                                        disabled={isSettling}
                                        className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
                                    >
                                        {isSettling ? 'Processando...' : 'Confirmar'}
                                    </button>
                                </div>
                                <div className="flex justify-end">
                                    <ScreenNameCopy screenId={CONFIRM_SCREEN_ID} className="justify-end text-slate-500" disableMargin />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {alertModal ? (
                <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.4)]">
                        <div
                            className={`flex items-start gap-4 border-b border-slate-100 px-6 py-5 ${
                                alertModal.type === 'success' ? 'bg-emerald-50' : alertModal.type === 'error' ? 'bg-rose-50' : 'bg-amber-50'
                            }`}
                        >
                            <div
                                className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-white shadow-sm ${
                                    alertModal.type === 'success' ? 'border-emerald-200' : alertModal.type === 'error' ? 'border-rose-200' : 'border-amber-200'
                                }`}
                            >
                                {tenantBranding?.logoUrl ? (
                                    <img
                                        src={tenantBranding.logoUrl}
                                        alt={`Logo de ${tenantBranding.schoolName}`}
                                        className="h-full w-full object-contain p-1.5"
                                    />
                                ) : alertModal.type === 'success' ? (
                                    <svg viewBox="0 0 24 24" className="h-7 w-7 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 6L9 17l-5-5" />
                                    </svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" className={`h-7 w-7 ${alertModal.type === 'error' ? 'text-rose-600' : 'text-amber-600'}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 9v4" />
                                        <path d="M12 17h.01" />
                                        <path d="M10.29 3.86l-8.45 14.63A2 2 0 0 0 3.58 21h16.84a2 2 0 0 0 1.74-3.01L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    </svg>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div
                                    className={`text-[11px] font-black uppercase tracking-[0.24em] ${
                                        alertModal.type === 'success' ? 'text-emerald-700' : alertModal.type === 'error' ? 'text-rose-700' : 'text-amber-700'
                                    }`}
                                >
                                    {alertModal.type === 'success' ? 'Sucesso' : alertModal.type === 'error' ? 'Erro' : 'Aviso'}
                                </div>
                                <h3 className="mt-1 text-xl font-black text-slate-900">{alertModal.title}</h3>
                                <p className="mt-2 text-sm font-medium text-slate-600">{alertModal.message}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAlertModal(null)}
                                className="rounded-full bg-white px-3 py-2 text-sm font-black text-slate-500 shadow-sm hover:text-slate-900"
                            >
                                ×
                            </button>
                        </div>

                        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <div className="flex flex-col gap-3">
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setAlertModal(null)}
                                        className={`rounded-2xl px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg transition ${
                                            alertModal.type === 'success'
                                                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'
                                                : alertModal.type === 'error'
                                                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25'
                                                    : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/25'
                                        }`}
                                    >
                                        Fechar
                                    </button>
                                </div>
                                <div className="flex justify-end">
                                    <ScreenNameCopy screenId={ALERT_SCREEN_ID} className="justify-end text-slate-500" disableMargin />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
