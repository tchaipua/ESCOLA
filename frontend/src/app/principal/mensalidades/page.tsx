'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import { getDashboardAuthContext, hasAnyDashboardPermission, hasDashboardPermission, type DashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import { clearStoredSession } from '@/app/lib/auth-storage';

const API_BASE_URL = 'http://localhost:3001/api/v1';
const SCREEN_ID = 'PRINCIPAL_MENSALIDADES_LANCAMENTO_GERAL';
const CONFIRMATION_SCREEN_ID = 'POPUP_PRINCIPAL_MENSALIDADES_CONFIRMAR_EFETUAR_LANCAMENTOS';
const ALERT_SCREEN_ID = 'POPUP_PRINCIPAL_MENSALIDADES_ALERTA_GERAL';
const COPY_FEEDBACK_TIMEOUT = 1800;

const LAUNCH_TYPE_OPTIONS = [
    { value: 'MENSALIDADE', label: 'MENSALIDADE' },
    { value: 'MATERIAL_ESCOLAR', label: 'MATERIAL ESCOLAR' },
    { value: 'FORMATURA', label: 'FORMATURA' },
    { value: 'EXTRA', label: 'GASTO EXTRA' },
] as const;

const SCOPE_OPTIONS = [
    { value: 'ALL', label: 'TODOS OS ALUNOS' },
    { value: 'SERIES', label: 'FILTRAR POR SÉRIE' },
    { value: 'SERIES_CLASS', label: 'FILTRAR POR TURMA' },
] as const;

type LaunchType = (typeof LAUNCH_TYPE_OPTIONS)[number]['value'];
type LaunchScope = (typeof SCOPE_OPTIONS)[number]['value'];

type BootstrapResponse = {
    activeSchoolYear: {
        id: string;
        year: number;
    } | null;
    series: Array<{
        id: string;
        name: string;
        sortOrder?: number | null;
    }>;
    seriesClasses: Array<{
        id: string;
        seriesId: string;
        seriesName: string;
        className: string;
        shift?: string | null;
        label: string;
    }>;
    history: Array<{
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
    }>;
};

type LaunchResponse = {
    message: string;
    batch: BootstrapResponse['history'][number] | null;
    createdStudentsCount: number;
    createdInstallmentsCount: number;
    totalAmount: number;
    skippedStudents: Array<{
        studentId: string;
        studentName: string;
        reason: string;
    }>;
};

type FormState = {
    launchType: LaunchType;
    scope: LaunchScope;
    referenceMonth: string;
    installmentCount: string;
    confirmInstallmentCount: string;
    firstDueDate: string;
    confirmFirstDueDate: string;
    seriesId: string;
    seriesClassId: string;
};

type AlertModalState = {
    type: 'warning' | 'success' | 'error';
    title: string;
    message: string;
};

function getDefaultReferenceMonth() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${month}`;
}

function getDefaultFirstDueDate() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${month}-10`;
}

function createDefaultFormState(): FormState {
    return {
        launchType: 'MENSALIDADE',
        scope: 'ALL',
        referenceMonth: getDefaultReferenceMonth(),
        installmentCount: '1',
        confirmInstallmentCount: '1',
        firstDueDate: getDefaultFirstDueDate(),
        confirmFirstDueDate: getDefaultFirstDueDate(),
        seriesId: '',
        seriesClassId: '',
    };
}

const EMPTY_AUTH_CONTEXT: DashboardAuthContext = {
    token: null,
    userId: null,
    role: null,
    permissions: [],
    tenantId: null,
    name: null,
    modelType: null,
};

const inputClass = 'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500';
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

function isUnauthorizedError(error: unknown) {
    return error instanceof Error && error.message === 'Unauthorized';
}

export default function PrincipalMensalidadesPage() {
    const [bootstrapData, setBootstrapData] = useState<BootstrapResponse | null>(null);
    const [formState, setFormState] = useState<FormState>(() => createDefaultFormState());
    const [isClientReady, setIsClientReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [bootstrapError, setBootstrapError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successStatus, setSuccessStatus] = useState<string | null>(null);
    const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
    const [screenCopyStatus, setScreenCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
    const [alertModal, setAlertModal] = useState<AlertModalState | null>(null);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const router = useRouter();

    const authContext = isClientReady ? getDashboardAuthContext() : EMPTY_AUTH_CONTEXT;
    const canViewFinancial = isClientReady && hasAnyDashboardPermission(authContext.role, authContext.permissions, ['VIEW_FINANCIAL', 'MANAGE_MONTHLY_FEES']);
    const canManageLaunches = isClientReady && hasDashboardPermission(authContext.role, authContext.permissions, 'MANAGE_MONTHLY_FEES');
    const isMonthlyType = formState.launchType === 'MENSALIDADE';
    const tenantBranding = useMemo(() => readCachedTenantBranding(authContext.tenantId), [authContext.tenantId]);
    const handleUnauthorized = useCallback(() => {
        clearStoredSession();
        router.replace('/');
    }, [router]);

    useEffect(() => {
        setIsClientReady(true);
    }, []);

    const loadBootstrap = useCallback(async () => {
        if (!isClientReady) return;
        if (!authContext.token || !canViewFinancial) {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setBootstrapError(null);

            const response = await fetch(`${API_BASE_URL}/student-financial-launches`, {
                headers: {
                    Authorization: `Bearer ${authContext.token}`,
                },
            });

            const payload = await response.json().catch(() => null);
            if (response.status === 401) {
                throw new Error('Unauthorized');
            }
            if (!response.ok) {
                throw new Error(payload?.message || 'Não foi possível carregar os dados da tela de mensalidades.');
            }

            setBootstrapData(payload);
        } catch (error) {
            if (isUnauthorizedError(error)) {
                handleUnauthorized();
                return;
            }
            setBootstrapData(null);
            setBootstrapError(getFriendlyRequestErrorMessage(error, 'Não foi possível carregar as mensalidades.'));
        } finally {
            setIsLoading(false);
        }
    }, [authContext.token, canViewFinancial, handleUnauthorized, isClientReady]);

    useEffect(() => {
        if (!isClientReady) return;
        void loadBootstrap();
    }, [isClientReady, loadBootstrap]);

    useEffect(() => {
        return () => {
            if (copyTimerRef.current) {
                clearTimeout(copyTimerRef.current);
            }
        };
    }, []);

    const submitDisabled = useMemo(() => {
        if (bootstrapError) return true;
        if (!canManageLaunches || !isMonthlyType) return true;
        if (!formState.referenceMonth || !formState.firstDueDate || !formState.installmentCount) return true;
        if (!formState.confirmFirstDueDate || !formState.confirmInstallmentCount) return true;
        if (formState.scope === 'SERIES' && !formState.seriesId) return true;
        if (formState.scope === 'SERIES_CLASS' && !formState.seriesClassId) return true;
        return false;
    }, [bootstrapError, canManageLaunches, formState.confirmFirstDueDate, formState.confirmInstallmentCount, formState.firstDueDate, formState.installmentCount, formState.referenceMonth, formState.scope, formState.seriesClassId, formState.seriesId, isMonthlyType]);

    const selectedSeriesClassLabel = useMemo(() => {
        return bootstrapData?.seriesClasses.find((item) => item.id === formState.seriesClassId)?.label || 'TURMA NÃO SELECIONADA';
    }, [bootstrapData?.seriesClasses, formState.seriesClassId]);

    const resetCopyFeedback = useCallback(() => {
        if (copyTimerRef.current) {
            clearTimeout(copyTimerRef.current);
        }

        copyTimerRef.current = setTimeout(() => setScreenCopyStatus('idle'), COPY_FEEDBACK_TIMEOUT);
    }, []);

    const handleCopyScreenName = useCallback(async () => {
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            setScreenCopyStatus('error');
            resetCopyFeedback();
            return;
        }

        try {
            await navigator.clipboard.writeText(SCREEN_ID);
            setScreenCopyStatus('copied');
        } catch (error) {
            console.error('Falha ao copiar nome da tela', error);
            setScreenCopyStatus('error');
        } finally {
            resetCopyFeedback();
        }
    }, [resetCopyFeedback]);

    const handleCopyConfirmationScreenName = useCallback(async () => {
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            setScreenCopyStatus('error');
            resetCopyFeedback();
            return;
        }

        try {
            await navigator.clipboard.writeText(CONFIRMATION_SCREEN_ID);
            setScreenCopyStatus('copied');
        } catch (error) {
            console.error('Falha ao copiar nome da tela de confirmação', error);
            setScreenCopyStatus('error');
        } finally {
            resetCopyFeedback();
        }
    }, [resetCopyFeedback]);

    const handleScopeChange = (nextScope: LaunchScope) => {
        setFormState((current) => ({
            ...current,
            scope: nextScope,
            seriesId: nextScope === 'SERIES' ? current.seriesId : '',
            seriesClassId: nextScope === 'SERIES_CLASS' ? current.seriesClassId : '',
        }));
    };

    const handleCancelConfirmation = useCallback(() => {
        if (isSubmitting) return;
        setIsConfirmationOpen(false);
        setAlertModal({
            type: 'warning',
            title: 'Lançamento não confirmado',
            message: 'O lançamento foi cancelado antes da confirmação.',
        });
    }, [isSubmitting]);

    const executeLaunch = useCallback(async () => {
        if (!authContext.token || submitDisabled) return;

        try {
            setIsSubmitting(true);
            setSuccessStatus(null);
            setIsConfirmationOpen(false);

            const payload = {
                launchType: formState.launchType,
                scope: formState.scope,
                referenceMonth: formState.referenceMonth,
                installmentCount: Number(formState.installmentCount),
                firstDueDate: formState.firstDueDate,
                seriesId: formState.scope === 'SERIES' ? formState.seriesId : undefined,
                seriesClassId: formState.scope === 'SERIES_CLASS' ? formState.seriesClassId : undefined,
            };

            const response = await fetch(`${API_BASE_URL}/student-financial-launches`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${authContext.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const result = (await response.json().catch(() => null)) as (LaunchResponse & { message?: string }) | null;
            if (response.status === 401) {
                throw new Error('Unauthorized');
            }
            if (!response.ok) {
                throw new Error(result?.message || 'Não foi possível gerar o lançamento das mensalidades.');
            }

            setSuccessStatus(result?.message || 'Mensalidades lançadas com sucesso.');
            setAlertModal({
                type: 'success',
                title: 'Lançamento realizado com sucesso',
                message: result?.message || 'Mensalidades lançadas com sucesso.',
            });
            await loadBootstrap();
        } catch (error) {
            if (isUnauthorizedError(error)) {
                handleUnauthorized();
                return;
            }
            setAlertModal({
                type: 'error',
                title: 'Erro ao efetuar lançamentos',
                message: getFriendlyRequestErrorMessage(error, 'Não foi possível gerar as mensalidades.'),
            });
        } finally {
            setIsSubmitting(false);
        }
    }, [authContext.token, formState.firstDueDate, formState.installmentCount, formState.launchType, formState.referenceMonth, formState.scope, formState.seriesClassId, formState.seriesId, handleUnauthorized, loadBootstrap, submitDisabled]);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (submitDisabled || isSubmitting) return;
        setSuccessStatus(null);

        if (formState.installmentCount !== formState.confirmInstallmentCount) {
            setAlertModal({
                type: 'error',
                title: 'Parcelas não conferem',
                message: 'A quantidade de parcelas precisa ser informada duas vezes com o mesmo valor.',
            });
            return;
        }

        if (formState.firstDueDate !== formState.confirmFirstDueDate) {
            setAlertModal({
                type: 'error',
                title: 'Vencimento não confere',
                message: 'O 1º vencimento precisa ser informado duas vezes com a mesma data.',
            });
            return;
        }

        setIsConfirmationOpen(true);
    };

    if (!isClientReady) {
        return (
            <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl items-center justify-center">
                <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Financeiro integrado</div>
                    <h1 className="mt-5 text-3xl font-extrabold text-[#153a6a]">Carregando mensalidades</h1>
                    <p className="mt-3 text-sm font-medium text-slate-500">
                        Preparando permissões e integração financeira desta escola.
                    </p>
                </div>
            </div>
        );
    }

    if (!canViewFinancial) {
        return (
            <DashboardAccessDenied
                title="Financeiro indisponível"
                message="Seu perfil não possui permissão para visualizar a rotina de lançamentos de mensalidades."
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
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                                <h1 className="text-3xl font-black tracking-tight">Efetuar Lançamentos</h1>
                                <button
                                    type="button"
                                    onClick={() => void handleCopyScreenName()}
                                    title="Copiar nome da tela"
                                    aria-label={`Copiar o identificador ${SCREEN_ID}`}
                                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                                >
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M8 7h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
                                        <path d="M9 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                </button>
                                {screenCopyStatus !== 'idle' ? (
                                    <span className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100">
                                        {screenCopyStatus === 'copied' ? 'Copiado' : 'Falha ao copiar'}
                                    </span>
                                ) : null}
                            </div>
                            <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                                Gere mensalidades por todos os alunos, por série ou por turma. Os títulos e parcelas são enviados direto para o Financeiro, com bloqueio de duplicidade na mesma competência.
                            </p>
                        </div>
                    </div>
                </div>

            </section>
            {successStatus ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-700">
                    {successStatus}
                </div>
            ) : null}

            {bootstrapError ? (
                <section className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <div className="text-xs font-black uppercase tracking-[0.18em] text-rose-700">Financeiro indisponível</div>
                            <p className="mt-1 text-sm font-semibold text-rose-700">{bootstrapError}</p>
                            <p className="mt-1 text-sm font-medium text-rose-600">
                                A tela continua acessível, mas o histórico e novos lançamentos ficam bloqueados até o Financeiro responder novamente.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void loadBootstrap()}
                            disabled={isLoading}
                            className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70"
                        >
                            {isLoading ? 'Tentando...' : 'Tentar novamente'}
                        </button>
                    </div>
                </section>
            ) : null}

            <section className={`${cardClass} p-6`}>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <label className="block">
                        <span className={labelClass}>Tipo do lançamento</span>
                        <select
                            value={formState.launchType}
                            onChange={(event) => setFormState((current) => ({ ...current, launchType: event.target.value as LaunchType }))}
                            className={inputClass}
                        >
                            {LAUNCH_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <div className="grid gap-4 xl:grid-cols-4">

                        <label>
                            <span className={labelClass}>Quantidade de parcelas</span>
                            <input
                                type="number"
                                min={1}
                                max={24}
                                value={formState.installmentCount}
                                onChange={(event) => setFormState((current) => ({ ...current, installmentCount: event.target.value }))}
                                className={inputClass}
                            />
                        </label>

                        <label>
                            <span className={labelClass}>Confirmar quantidade de parcelas</span>
                            <input
                                type="number"
                                min={1}
                                max={24}
                                value={formState.confirmInstallmentCount}
                                onChange={(event) => setFormState((current) => ({ ...current, confirmInstallmentCount: event.target.value }))}
                                className={inputClass}
                            />
                        </label>

                        <label>
                            <span className={labelClass}>1º vencimento</span>
                            <input
                                type="date"
                                value={formState.firstDueDate}
                                onChange={(event) => setFormState((current) => ({ ...current, firstDueDate: event.target.value }))}
                                className={inputClass}
                            />
                        </label>

                        <label>
                            <span className={labelClass}>Confirmar 1º vencimento</span>
                            <input
                                type="date"
                                value={formState.confirmFirstDueDate}
                                onChange={(event) => setFormState((current) => ({ ...current, confirmFirstDueDate: event.target.value }))}
                                className={inputClass}
                            />
                        </label>
                    </div>

                    {!isMonthlyType ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-700">
                            Os tipos <strong>MATERIAL ESCOLAR</strong>, <strong>FORMATURA</strong> e <strong>GASTO EXTRA</strong> já aparecem na tela para preparar o fluxo, mas nesta primeira fase somente <strong>MENSALIDADE</strong> pode ser gerada.
                        </div>
                    ) : null}

                    <div>
                        <label>
                            <span className={labelClass}>Escopo do lançamento</span>
                            <select
                                value={formState.scope}
                                onChange={(event) => handleScopeChange(event.target.value as LaunchScope)}
                                className={inputClass}
                            >
                                {SCOPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {formState.scope === 'SERIES' ? (
                        <label className="block">
                            <span className={labelClass}>Série</span>
                            <select
                                value={formState.seriesId}
                                onChange={(event) => setFormState((current) => ({ ...current, seriesId: event.target.value }))}
                                className={inputClass}
                            >
                                <option value="">Selecione a série</option>
                                {(bootstrapData?.series || []).map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : null}

                    {formState.scope === 'SERIES_CLASS' ? (
                        <label className="block">
                            <span className={labelClass}>Turma</span>
                            <select
                                value={formState.seriesClassId}
                                onChange={(event) => setFormState((current) => ({ ...current, seriesClassId: event.target.value }))}
                                className={inputClass}
                            >
                                <option value="">Selecione a turma</option>
                                {(bootstrapData?.seriesClasses || []).map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : null}

                    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 md:flex-row md:items-center md:justify-between">
                        <div className="text-sm font-medium text-slate-600">
                            O sistema bloqueia mensalidade duplicada na mesma competência e registra o pagador configurado no cadastro do aluno.
                        </div>
                        <button
                            type="submit"
                            disabled={submitDisabled || isSubmitting}
                            className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSubmitting ? 'Gerando...' : 'Efetuar Lançamentos'}
                        </button>
                    </div>

                    {!canManageLaunches ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-700">
                            Seu perfil pode consultar o histórico financeiro, mas não possui permissão para gerar novos lançamentos de mensalidade.
                        </div>
                    ) : bootstrapError ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-semibold text-rose-700">
                            Os lançamentos foram desabilitados temporariamente porque a integração com o Financeiro não respondeu.
                        </div>
                    ) : null}
                </form>
            </section>

            <section className={`${cardClass} p-6`}>
                <div className="flex flex-col gap-2 border-b border-slate-100 pb-5 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h2 className="text-xl font-black text-slate-900">Histórico de lançamentos</h2>
                        <p className="text-sm font-medium text-slate-500">
                            Consulte os lançamentos já gravados no Financeiro para esta escola. Esta tela não grava histórico local.
                        </p>
                    </div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                        {isLoading ? 'CARREGANDO...' : `${bootstrapData?.history.length || 0} REGISTRO(S)`}
                    </div>
                </div>

                <div className="mt-6 overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead>
                            <tr className="text-left text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                                <th className="px-4 py-3">Tipo</th>
                                <th className="px-4 py-3">Filtro</th>
                                <th className="px-4 py-3">Parcelas</th>
                                <th className="px-4 py-3">Alunos</th>
                                <th className="px-4 py-3">Total</th>
                                <th className="px-4 py-3">1º vencimento</th>
                                <th className="px-4 py-3">Criado em</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white text-sm font-semibold text-slate-700">
                            {(bootstrapData?.history || []).map((item) => (
                                <tr key={item.id}>
                                    <td className="px-4 py-4">{item.launchType}</td>
                                    <td className="px-4 py-4">
                                        <div>{item.targetLabel}</div>
                                        {item.schoolYear?.year ? (
                                            <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                                ANO LETIVO {item.schoolYear.year}
                                            </div>
                                        ) : null}
                                    </td>
                                    <td className="px-4 py-4">{item.totalInstallments}</td>
                                    <td className="px-4 py-4">
                                        <div>{item.totalStudents}</div>
                                        {item.skippedStudentsCount ? (
                                            <div className="mt-1 flex items-center gap-2">
                                                <div className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.12em] text-rose-600">
                                                    <svg
                                                        viewBox="0 0 24 24"
                                                        className="h-3.5 w-3.5 shrink-0"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        aria-hidden="true"
                                                    >
                                                        <path d="M12 9v4" />
                                                        <path d="M12 17h.01" />
                                                        <path d="M10.29 3.86l-8.45 14.63A2 2 0 0 0 3.58 21h16.84a2 2 0 0 0 1.74-3.01L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                                    </svg>
                                                    <span>{item.skippedStudentsCount} pendência(s)</span>
                                                </div>
                                                <Link
                                                    href={`/principal/mensalidades/detalhes/${item.id}`}
                                                    className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 transition hover:bg-blue-100"
                                                >
                                                    Ver quais
                                                </Link>
                                            </div>
                                        ) : (
                                            <div className="mt-1">
                                                <Link
                                                    href={`/principal/mensalidades/detalhes/${item.id}`}
                                                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 transition hover:bg-emerald-100"
                                                >
                                                    Ver gerados
                                                </Link>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-4">{formatCurrency(item.totalAmount)}</td>
                                    <td className="px-4 py-4">{formatDateLabel(item.firstDueDate)}</td>
                                    <td className="px-4 py-4">{formatDateLabel(item.createdAt)}</td>
                                </tr>
                            ))}
                            {!isLoading && !(bootstrapData?.history || []).length ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                                        {bootstrapError
                                            ? 'O histórico não pôde ser consultado porque o Financeiro está indisponível no momento.'
                                            : 'Nenhum lançamento foi recebido pelo Financeiro para esta escola até o momento.'}
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </section>

            {isConfirmationOpen ? (
                <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.4)]">
                        <div className="flex items-start gap-4 border-b border-slate-100 bg-slate-50 px-6 py-5">
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
                                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-600">
                                    Confirmação de lançamento
                                </div>
                                <h3 className="mt-1 text-xl font-black text-slate-900">Confirmar Efetuar Lançamentos</h3>
                                <p className="mt-2 text-sm font-medium text-slate-500">
                                Confirme para gerar os lançamentos da competência informada e enviar os alunos elegíveis direto para o Financeiro.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleCancelConfirmation}
                            disabled={isSubmitting}
                            className="rounded-full bg-white px-3 py-2 text-sm font-black text-slate-500 shadow-sm hover:text-slate-900"
                        >
                                ×
                            </button>
                        </div>

                        <div className="space-y-4 px-6 py-6 text-sm font-semibold text-slate-600">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Primeiro vencimento</div>
                                    <div className="mt-2 text-lg font-black text-slate-900">{formatDateLabel(formState.firstDueDate)}</div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
                                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">Resumo do lançamento</div>
                                <div className="mt-2 space-y-1 text-sm font-semibold text-slate-700">
                                    <div>TIPO: {LAUNCH_TYPE_OPTIONS.find((item) => item.value === formState.launchType)?.label || 'MENSALIDADE'}</div>
                                    <div>PARCELAS: {formState.installmentCount || '1'}</div>
                                    <div>
                                        ESCOPO:{' '}
                                        {formState.scope === 'ALL'
                                            ? 'TODOS OS ALUNOS'
                                            : formState.scope === 'SERIES'
                                                ? bootstrapData?.series.find((item) => item.id === formState.seriesId)?.name || 'SÉRIE NÃO SELECIONADA'
                                                : selectedSeriesClassLabel}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <div className="flex flex-col gap-3">
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={handleCancelConfirmation}
                                        disabled={isSubmitting}
                                        className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70"
                                    >
                                        Fechar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void executeLaunch()}
                                        disabled={isSubmitting}
                                        className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
                                    >
                                        {isSubmitting ? 'Processando...' : 'Confirmar'}
                                    </button>
                                </div>
                                <div className="flex justify-end">
                                    <div className="flex items-start gap-2 text-right text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">
                                        <div>
                                            <div>Tela:</div>
                                            <div className="mt-1 break-all font-normal tracking-[0.35em] text-slate-500">
                                                {CONFIRMATION_SCREEN_ID}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => void handleCopyConfirmationScreenName()}
                                            title="Copiar nome da tela"
                                            aria-label={`Copiar o identificador ${CONFIRMATION_SCREEN_ID}`}
                                            className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 active:scale-95"
                                        >
                                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M8 6h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                <path d="M12 10h3" />
                                                <path d="M12 14h3" />
                                                <path d="M12 18h3" />
                                            </svg>
                                        </button>
                                    </div>
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
                                ) : alertModal.type === 'error' ? (
                                    <svg viewBox="0 0 24 24" className="h-7 w-7 text-rose-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 9v4" />
                                        <path d="M12 17h.01" />
                                        <path d="M10.29 3.86l-8.45 14.63A2 2 0 0 0 3.58 21h16.84a2 2 0 0 0 1.74-3.01L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    </svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" className="h-7 w-7 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                                    <div className="flex items-start gap-2 text-right text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">
                                        <div>
                                            <div>Tela:</div>
                                            <div className="mt-1 break-all font-normal tracking-[0.35em] text-slate-500">
                                                {ALERT_SCREEN_ID}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => void navigator.clipboard?.writeText(ALERT_SCREEN_ID)}
                                            title="Copiar nome da tela"
                                            aria-label={`Copiar o identificador ${ALERT_SCREEN_ID}`}
                                            className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                                        >
                                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M8 6h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                <path d="M12 10h3" />
                                                <path d="M12 14h3" />
                                                <path d="M12 18h3" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

        </div>
    );
}
