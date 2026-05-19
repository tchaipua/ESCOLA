'use client';

import { useEffect, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import GridFooterControls from '@/app/components/grid-footer-controls';
import PrincipalProgramHeader from '@/app/components/principal-program-header';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import {
    getDashboardAuthContext,
    hasAnyDashboardPermission,
    hasDashboardPermission,
} from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const FINANCEIRO_FRONTEND_URL =
    process.env.NEXT_PUBLIC_FINANCEIRO_FRONTEND_URL || 'http://localhost:3003';
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

type EditInstallmentModalState = {
    installmentId: string;
    sourceEntityName: string;
    installmentLabel: string;
    originalDueDateInput: string;
    originalAmountInput: string;
    dueDateInput: string;
    amountInput: string;
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

function formatDateInputValue(value?: string | null) {
    if (!value) return '';
    const normalized = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
}

function formatCurrencyInput(value?: number | null) {
    return Number(value || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function parseCurrencyInput(value: string) {
    const normalized = String(value || '')
        .replace(/\s+/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .trim();

    if (!normalized) return 0;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
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

function mapInstallmentStatusToGridFilter(status: InstallmentListStatus) {
    if (status === 'OPEN') return 'ACTIVE' as const;
    if (status === 'ALL') return 'ALL' as const;
    return 'INACTIVE' as const;
}

export default function PrincipalParcelasPage() {
    const [isMounted, setIsMounted] = useState(false);
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
    const [financeSettlementUrl, setFinanceSettlementUrl] = useState<string | null>(null);
    const [isUpdatingInstallment, setIsUpdatingInstallment] = useState(false);
    const [editInstallmentModal, setEditInstallmentModal] = useState<EditInstallmentModalState | null>(null);
    const [alertModal, setAlertModal] = useState<AlertModalState | null>(null);
    const authContext = getDashboardAuthContext();
    const canViewCashier = hasAnyDashboardPermission(authContext.role, authContext.permissions, ['VIEW_CASHIER', 'SETTLE_RECEIVABLES']);
    const canOpenCashier = hasDashboardPermission(authContext.role, authContext.permissions, 'VIEW_CASHIER');
    const canSettleInstallments = hasDashboardPermission(authContext.role, authContext.permissions, 'SETTLE_RECEIVABLES');
    const canEditInstallments = hasDashboardPermission(authContext.role, authContext.permissions, 'MANAGE_MONTHLY_FEES');
    const tenantBranding = readCachedTenantBranding(authContext.tenantId);

    useEffect(() => {
        setIsMounted(true);
    }, []);

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

    useEffect(() => {
        function handleFinancePopupMessage(event: MessageEvent) {
            const messageType = event.data?.type;

            if (messageType === 'FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_CLOSE') {
                setFinanceSettlementUrl(null);
                return;
            }

            if (messageType === 'FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_REFRESH') {
                setFinanceSettlementUrl(null);
                void loadCurrentSession();
                void loadInstallments(appliedFilters);
            }
        }

        window.addEventListener('message', handleFinancePopupMessage);
        return () => window.removeEventListener('message', handleFinancePopupMessage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appliedFilters]);

    const selectableInstallments = installments.filter((item) => item.status !== 'PAID' && item.openAmount > 0);
    const selectedInstallments = installments.filter((item) => selectedIds.includes(item.id));
    const selectedTotalAmount = selectedInstallments.reduce((total, item) => total + Number(item.openAmount || 0), 0);
    const allSelectableChecked = selectableInstallments.length > 0 && selectableInstallments.every((item) => selectedIds.includes(item.id));
    if (!isMounted) {
        return (
            <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl items-center justify-center">
                <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Carregando</div>
                    <div className="mt-2 text-xl font-black text-slate-900">Aguarde...</div>
                </div>
            </div>
        );
    }

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

    function handleOpenEditInstallment(item: InstallmentResponse) {
        setEditInstallmentModal({
            installmentId: item.id,
            sourceEntityName: item.sourceEntityName,
            installmentLabel: `${item.installmentNumber}/${item.installmentCount}`,
            originalDueDateInput: formatDateInputValue(item.dueDate),
            originalAmountInput: formatCurrencyInput(item.amount),
            dueDateInput: formatDateInputValue(item.dueDate),
            amountInput: formatCurrencyInput(item.amount),
        });
    }

    function handleOpenColumns() {
        setAlertModal({
            type: 'warning',
            title: 'Colunas ainda indisponíveis',
            message: 'A configuração de colunas desta listagem ainda não foi liberada nesta tela.',
        });
    }

    function handleOpenExport() {
        setAlertModal({
            type: 'warning',
            title: 'Exportação ainda indisponível',
            message: 'A exportação desta listagem ainda não foi liberada nesta tela.',
        });
    }

    function handleFooterStatusShortcut(nextValue: 'ACTIVE' | 'ALL' | 'INACTIVE') {
        const nextStatus: InstallmentListStatus =
            nextValue === 'ACTIVE' ? 'OPEN' : nextValue === 'ALL' ? 'ALL' : 'PAID';

        setFilters((current) => ({ ...current, status: nextStatus }));
        setSelectedIds([]);
        setAppliedFilters((current) => ({ ...current, status: nextStatus }));
    }

    async function handleSaveInstallmentChanges() {
        if (!authContext.token || !editInstallmentModal || isUpdatingInstallment) return;

        const parsedAmount = parseCurrencyInput(editInstallmentModal.amountInput);
        if (!editInstallmentModal.dueDateInput) {
            setAlertModal({
                type: 'warning',
                title: 'Vencimento obrigatório',
                message: 'Informe a nova data de vencimento da parcela.',
            });
            return;
        }

        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            setAlertModal({
                type: 'warning',
                title: 'Valor inválido',
                message: 'Informe um valor maior que zero para a parcela.',
            });
            return;
        }

        if (
            editInstallmentModal.dueDateInput === editInstallmentModal.originalDueDateInput &&
            formatCurrencyInput(parsedAmount) === editInstallmentModal.originalAmountInput
        ) {
            setAlertModal({
                type: 'warning',
                title: 'Nenhuma alteração detectada',
                message: 'Altere o vencimento ou o valor da parcela antes de salvar.',
            });
            return;
        }

        try {
            setIsUpdatingInstallment(true);

            const response = await fetch(`${API_BASE_URL}/financial-cashier/installments/${editInstallmentModal.installmentId}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${authContext.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    dueDate: new Date(`${editInstallmentModal.dueDateInput}T00:00:00.000Z`).toISOString(),
                    amount: parsedAmount,
                }),
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.message || 'Não foi possível atualizar a parcela.');
            }

            setEditInstallmentModal(null);
            await loadInstallments(appliedFilters);
            setAlertModal({
                type: 'success',
                title: 'Parcela atualizada',
                message: 'O vencimento e o valor foram atualizados, e os administradores da escola foram notificados.',
            });
        } catch (error) {
            setAlertModal({
                type: 'error',
                title: 'Erro ao atualizar parcela',
                message: getFriendlyRequestErrorMessage(error, 'Não foi possível atualizar a parcela selecionada.'),
            });
        } finally {
            setIsUpdatingInstallment(false);
        }
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

        const params = new URLSearchParams({
            embedded: '1',
            modal: '1',
            sourceSystem: 'ESCOLA',
            installmentIds: selectedInstallments.map((item) => item.id).join(','),
        });

        if (authContext.tenantId) {
            params.set('sourceTenantId', authContext.tenantId.toUpperCase());
        }

        if (Number.isInteger(authContext.branchCode) && authContext.branchCode >= 0) {
            params.set('sourceBranchCode', String(authContext.branchCode));
        }

        if (authContext.userId) {
            params.set('cashierUserId', authContext.userId.toUpperCase());
        }

        if (authContext.name) {
            params.set('cashierDisplayName', authContext.name.toUpperCase());
        }

        if (tenantBranding?.schoolName) {
            params.set('companyName', tenantBranding.schoolName.toUpperCase());
        }

        if (tenantBranding?.logoUrl) {
            params.set('companyLogoUrl', tenantBranding.logoUrl);
        }

        const normalizedBaseUrl = FINANCEIRO_FRONTEND_URL.endsWith('/')
            ? FINANCEIRO_FRONTEND_URL.slice(0, -1)
            : FINANCEIRO_FRONTEND_URL;

        setFinanceSettlementUrl(`${normalizedBaseUrl}/recebiveis/baixa-manual?${params.toString()}`);
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
                <PrincipalProgramHeader
                    eyebrow="Financeiro integrado"
                    title="Parcelas"
                    description="Consulte parcelas abertas, fechadas ou vencidas, filtre por aluno ou responsável pagador e faça a baixa em dinheiro direto nesta tela."
                    schoolName={tenantBranding?.schoolName}
                    logoUrl={tenantBranding?.logoUrl}
                    secondaryAction={
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    window.dispatchEvent(new Event('msinfor-financeiro-toggle-sidebar'));
                                }}
                                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/20"
                                title="Recolher menu lateral"
                                aria-label="Recolher menu lateral"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    window.dispatchEvent(new Event('msinfor-financeiro-open-notifications'));
                                }}
                                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/20"
                                title="Abrir notificações"
                                aria-label="Abrir notificações"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                            </button>
                        </>
                    }
                />
            </section>

            <section className={`${cardClass} overflow-hidden`}>
                <div className="border-b border-slate-100 px-6 py-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div className="grid flex-1 gap-4 xl:grid-cols-[1.2fr_1.2fr_0.7fr]">
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
                        </div>

                        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                            <button
                                type="button"
                                onClick={handleApplyFilters}
                                className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
                            >
                                Filtrar
                            </button>

                            <button
                                type="button"
                                onClick={handleResetFilters}
                                className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-slate-600 transition hover:bg-slate-100"
                            >
                                Limpar
                            </button>
                        </div>
                    </div>
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
                            A baixa manual so e liberada para usuario com funcao de caixa e com caixa aberto nesta escola.
                        </p>
                        <button
                            type="button"
                            onClick={handleStartSettlement}
                            disabled={!canSettleInstallments || !selectedInstallments.length}
                            className="mt-4 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                        >
                            Escolher pagamento
                        </button>
                    </div>
                </div>
            </section>

            <section className={`${cardClass} overflow-hidden`}>
                <div className="border-b border-slate-100 px-6 py-5">
                    <div className="flex flex-col gap-4">
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
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                {appliedFilters.studentName.trim() ? (
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                                        Aluno: {appliedFilters.studentName}
                                    </span>
                                ) : null}
                                {appliedFilters.payerName.trim() ? (
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                                        Pagador: {appliedFilters.payerName}
                                    </span>
                                ) : null}
                                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                                    Situação: {STATUS_OPTIONS.find((option) => option.value === appliedFilters.status)?.label || 'ABERTAS'}
                                </span>
                            </div>
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
                                        disabled={!canSettleInstallments || !selectableInstallments.length}
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
                                                disabled={!canSettleInstallments || !isSelectable}
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
                                        <td className="px-4 py-4">
                                            <div className="font-black text-slate-900">{formatCurrency(rowValue)}</div>
                                            {canEditInstallments && isSelectable ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEditInstallment(item)}
                                                    className="mt-2 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-100"
                                                >
                                                    Editar
                                                </button>
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
                <GridFooterControls
                    recordsCount={installments.length}
                    onOpenColumns={handleOpenColumns}
                    onOpenExport={handleOpenExport}
                    statusFilter={mapInstallmentStatusToGridFilter(appliedFilters.status)}
                    onStatusFilterChange={handleFooterStatusShortcut}
                    activeLabel="Mostrar somente parcelas abertas"
                    allLabel="Mostrar todas as parcelas"
                    inactiveLabel="Atalho para parcelas fechadas"
                    aggregateSummaries={[
                        { key: 'selecionadas', label: 'Selecionadas', value: String(selectedInstallments.length) },
                        { key: 'valor', label: 'Valor selecionado', value: formatCurrency(selectedTotalAmount) },
                    ]}
                />
            </section>

            {editInstallmentModal ? (
                <div className="fixed inset-0 z-[92] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
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
                                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-600">Alteração de parcela</div>
                                    <h3 className="mt-1 text-xl font-black text-slate-900">
                                        {editInstallmentModal.sourceEntityName} - PARCELA {editInstallmentModal.installmentLabel}
                                    </h3>
                                    <p className="mt-2 text-sm font-medium text-slate-500">
                                        Altere o vencimento e o valor da parcela em aberto. Ao salvar, os administradores da escola serão notificados.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => !isUpdatingInstallment && setEditInstallmentModal(null)}
                                    className="rounded-full bg-white px-3 py-2 text-sm font-black text-slate-500 shadow-sm hover:text-slate-900"
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
                            <label>
                                <span className={labelClass}>Novo vencimento</span>
                                <input
                                    type="date"
                                    value={editInstallmentModal.dueDateInput}
                                    onChange={(event) => setEditInstallmentModal((current) => current ? { ...current, dueDateInput: event.target.value } : current)}
                                    className={inputClass}
                                />
                            </label>

                            <label>
                                <span className={labelClass}>Novo valor</span>
                                <input
                                    value={editInstallmentModal.amountInput}
                                    onChange={(event) => setEditInstallmentModal((current) => current ? { ...current, amountInput: event.target.value } : current)}
                                    inputMode="decimal"
                                    className={inputClass}
                                    placeholder="0,00"
                                />
                            </label>
                        </div>

                        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <div className="flex flex-wrap justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setEditInstallmentModal(null)}
                                    disabled={isUpdatingInstallment}
                                    className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleSaveInstallmentChanges()}
                                    disabled={isUpdatingInstallment}
                                    className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
                                >
                                    {isUpdatingInstallment ? 'Salvando...' : 'Salvar alteração'}
                                </button>
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

            {financeSettlementUrl ? (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
                    <div className="relative flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.4)]">
                        <div className="flex items-center justify-end border-b border-slate-100 bg-slate-50 px-4 py-3">
                            <button
                                type="button"
                                onClick={() => setFinanceSettlementUrl(null)}
                                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-600 transition hover:bg-slate-100"
                            >
                                Fechar
                            </button>
                        </div>
                        <iframe
                            src={financeSettlementUrl}
                            title="FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL"
                            className="h-full w-full border-0 bg-white"
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}
