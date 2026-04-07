'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import { getDashboardAuthContext, hasAnyDashboardPermission, type DashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const API_BASE_URL = 'http://localhost:3001/api/v1';
const SCREEN_ID = 'PRINCIPAL_MENSALIDADES_DETALHES_LANCAMENTO';
const COPY_FEEDBACK_TIMEOUT = 1800;

type HistoryDetailsResponse = {
    batch: {
        id: string;
        launchType: string;
        scope: string;
        referenceMonthLabel: string;
        totalStudents: number;
        totalInstallments: number;
        totalAmount: number;
        skippedStudentsCount: number;
        createdAt: string;
        schoolYear?: {
            id: string;
            year: number;
        } | null;
    };
    items: Array<{
        status: 'OK' | 'PROBLEMA';
        studentId: string;
        studentName: string;
        classLabel: string | null;
        payerName: string | null;
        referenceMonthLabel: string;
        dueDate: string | null;
        installmentLabel: string;
        amount: number | null;
        description: string | null;
        reason: string | null;
    }>;
};

type DetailViewMode = 'all' | 'problem-only';

type StudentLaunchSummary = {
    status: 'OK' | 'PROBLEMA';
    studentId: string;
    studentName: string;
    classLabel: string | null;
    payerName: string | null;
    referenceMonthLabel: string;
    installmentCount: number;
    totalAmount: number;
    lastDueDate: string | null;
    problemReason: string | null;
};

const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const EMPTY_AUTH_CONTEXT: DashboardAuthContext = {
    token: null,
    userId: null,
    role: null,
    permissions: [],
    tenantId: null,
    name: null,
    modelType: null,
};

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

    return normalizedMessage;
}

export default function PrincipalMensalidadesDetalhesPage() {
    const params = useParams<{ batchId: string }>();
    const [details, setDetails] = useState<HistoryDetailsResponse | null>(null);
    const [isClientReady, setIsClientReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [screenCopyStatus, setScreenCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
    const [viewMode, setViewMode] = useState<DetailViewMode>('all');
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const authContext = isClientReady ? getDashboardAuthContext() : EMPTY_AUTH_CONTEXT;
    const canViewFinancial = isClientReady && hasAnyDashboardPermission(authContext.role, authContext.permissions, ['VIEW_FINANCIAL', 'MANAGE_MONTHLY_FEES']);
    const tenantBranding = useMemo(() => readCachedTenantBranding(authContext.tenantId), [authContext.tenantId]);

    useEffect(() => {
        setIsClientReady(true);
    }, []);

    useEffect(() => {
        return () => {
            if (copyTimerRef.current) {
                clearTimeout(copyTimerRef.current);
            }
        };
    }, []);

    const resetCopyFeedback = useCallback(() => {
        if (copyTimerRef.current) {
            clearTimeout(copyTimerRef.current);
        }

        copyTimerRef.current = setTimeout(() => setScreenCopyStatus('idle'), COPY_FEEDBACK_TIMEOUT);
    }, []);

    const handleCopyScreenName = useCallback(async (screenId: string) => {
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            setScreenCopyStatus('error');
            resetCopyFeedback();
            return;
        }

        try {
            await navigator.clipboard.writeText(screenId);
            setScreenCopyStatus('copied');
        } catch (error) {
            console.error('Falha ao copiar nome da tela', error);
            setScreenCopyStatus('error');
        } finally {
            resetCopyFeedback();
        }
    }, [resetCopyFeedback]);

    const loadDetails = useCallback(async () => {
        if (!isClientReady) return;
        if (!authContext.token || !canViewFinancial || !params?.batchId) {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setLoadError(null);

            const response = await fetch(`${API_BASE_URL}/student-financial-launches/${params.batchId}/details`, {
                headers: {
                    Authorization: `Bearer ${authContext.token}`,
                },
            });

            const payload = (await response.json().catch(() => null)) as HistoryDetailsResponse | { message?: string } | null;
            if (!response.ok) {
                throw new Error(payload && 'message' in payload ? payload.message || 'Não foi possível carregar o detalhamento do lançamento.' : 'Não foi possível carregar o detalhamento do lançamento.');
            }

            setDetails(payload as HistoryDetailsResponse);
        } catch (error) {
            setDetails(null);
            setLoadError(getFriendlyRequestErrorMessage(error, 'Não foi possível carregar o detalhamento do lançamento.'));
        } finally {
            setIsLoading(false);
        }
    }, [authContext.token, canViewFinancial, isClientReady, params?.batchId]);

    useEffect(() => {
        if (!isClientReady) return;
        void loadDetails();
    }, [isClientReady, loadDetails]);

    const studentSummaries = useMemo<StudentLaunchSummary[]>(() => {
        if (!details) return [];

        const grouped = new Map<string, StudentLaunchSummary>();

        details.items.forEach((entry) => {
            const key = `${entry.status}:${entry.studentId}`;
            const existing = grouped.get(key);

            if (entry.status === 'OK') {
                if (!existing) {
                    grouped.set(key, {
                        status: 'OK',
                        studentId: entry.studentId,
                        studentName: entry.studentName,
                        classLabel: entry.classLabel,
                        payerName: entry.payerName,
                        referenceMonthLabel: entry.referenceMonthLabel,
                        installmentCount: 1,
                        totalAmount: entry.amount || 0,
                        lastDueDate: entry.dueDate,
                        problemReason: null,
                    });
                    return;
                }

                const currentDueTime = entry.dueDate ? new Date(entry.dueDate).getTime() : 0;
                const existingDueTime = existing.lastDueDate ? new Date(existing.lastDueDate).getTime() : 0;

                grouped.set(key, {
                    ...existing,
                    installmentCount: existing.installmentCount + 1,
                    totalAmount: existing.totalAmount + (entry.amount || 0),
                    lastDueDate: currentDueTime > existingDueTime ? entry.dueDate : existing.lastDueDate,
                });
                return;
            }

            if (!existing) {
                grouped.set(key, {
                    status: 'PROBLEMA',
                    studentId: entry.studentId,
                    studentName: entry.studentName,
                    classLabel: entry.classLabel,
                    payerName: null,
                    referenceMonthLabel: entry.referenceMonthLabel,
                    installmentCount: 0,
                    totalAmount: 0,
                    lastDueDate: null,
                    problemReason: entry.reason,
                });
            }
        });

        return Array.from(grouped.values()).sort((left, right) => left.studentName.localeCompare(right.studentName));
    }, [details]);

    const successItems = studentSummaries.filter((entry) => entry.status === 'OK');
    const problemItems = studentSummaries.filter((entry) => entry.status === 'PROBLEMA');
    const successTotalInstallments = successItems.reduce((total, entry) => total + entry.installmentCount, 0);
    const successTotalAmount = successItems.reduce((total, entry) => total + entry.totalAmount, 0);

    if (!isClientReady) {
        return (
            <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl items-center justify-center">
                <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Financeiro integrado</div>
                    <h1 className="mt-5 text-3xl font-extrabold text-[#153a6a]">Carregando detalhamento</h1>
                    <p className="mt-3 text-sm font-medium text-slate-500">
                        Preparando permissões e dados do lote financeiro.
                    </p>
                </div>
            </div>
        );
    }

    if (!canViewFinancial) {
        return (
            <DashboardAccessDenied
                title="Financeiro indisponível"
                message="Seu perfil não possui permissão para visualizar o detalhamento dos lançamentos."
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
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                    <h1 className="text-3xl font-black tracking-tight">Detalhes dos lançamentos</h1>
                                    <button
                                        type="button"
                                        onClick={() => void handleCopyScreenName(SCREEN_ID)}
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
                                    Consulte em grid o resumo por aluno do que o Financeiro gravou e do que foi bloqueado neste lote.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Link
                                href="/principal/mensalidades"
                                className="rounded-2xl border border-white/25 bg-white/10 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/20"
                            >
                                Voltar
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {loadError ? (
                <section className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <div className="text-xs font-black uppercase tracking-[0.18em] text-rose-700">Detalhamento indisponível</div>
                            <p className="mt-1 text-sm font-semibold text-rose-700">{loadError}</p>
                            <p className="mt-1 text-sm font-medium text-rose-600">
                                O Financeiro não respondeu para este lote. Tente recarregar quando a integração estabilizar.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void loadDetails()}
                            disabled={isLoading}
                            className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70"
                        >
                            {isLoading ? 'Tentando...' : 'Tentar novamente'}
                        </button>
                    </div>
                </section>
            ) : null}

            {details ? (
                <section className={`${cardClass} p-6`}>
                    <div className="grid gap-4 md:grid-cols-4">
                        <button
                            type="button"
                            onClick={() => setViewMode('all')}
                            className={`rounded-2xl border px-4 py-4 text-left transition ${
                                viewMode === 'all'
                                    ? 'border-emerald-300 bg-emerald-100 shadow-sm'
                                    : 'border-slate-200 bg-slate-50'
                            }`}
                        >
                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Lançamentos OK</div>
                            <div className="mt-2 text-2xl font-black text-emerald-700">{successItems.length}</div>
                            <div className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                                Mostrar todos
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('problem-only')}
                            className={`rounded-2xl border px-4 py-4 text-left transition ${
                                viewMode === 'problem-only'
                                    ? 'border-rose-500 bg-rose-200 shadow-sm shadow-rose-200/60'
                                    : 'border-slate-200 bg-slate-50'
                            }`}
                        >
                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Com problema</div>
                            <div className="mt-2 text-2xl font-black text-rose-700">{problemItems.length}</div>
                            <div className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-rose-700">
                                Mostrar só problemas
                            </div>
                        </button>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Valor total</div>
                            <div className="mt-2 text-2xl font-black text-slate-900">{formatCurrency(details.batch.totalAmount)}</div>
                        </div>
                    </div>
                </section>
            ) : null}

            {viewMode === 'all' ? (
            <section className={`${cardClass} p-6`}>
                <div className="flex flex-col gap-2 border-b border-slate-100 pb-5 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h2 className="text-xl font-black text-slate-900">Lançamentos gerados</h2>
                        <p className="text-sm font-medium text-slate-500">
                            Resumo por aluno das parcelas registradas pelo Financeiro neste lote.
                        </p>
                    </div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                        {isLoading ? 'CARREGANDO...' : `${successItems.length} REGISTRO(S)`}
                    </div>
                </div>

                <div className="mt-6 overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead>
                            <tr className="text-left text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                                <th className="px-4 py-3">Aluno</th>
                                <th className="px-4 py-3">Turma</th>
                                <th className="px-4 py-3">Pagador</th>
                                <th className="px-4 py-3">Parcelas lançadas</th>
                                <th className="px-4 py-3">Último vencimento</th>
                                <th className="px-4 py-3">Total lançado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white text-sm font-semibold text-slate-700">
                            {successItems.map((entry) => (
                                <tr key={`${entry.status}-${entry.studentId}`}>
                                    <td className="px-4 py-4">{entry.studentName}</td>
                                    <td className="px-4 py-4">{entry.classLabel || '---'}</td>
                                    <td className="px-4 py-4">{entry.payerName || '---'}</td>
                                    <td className="px-4 py-4">{entry.installmentCount}</td>
                                    <td className="px-4 py-4">{formatDateLabel(entry.lastDueDate)}</td>
                                    <td className="px-4 py-4">{formatCurrency(entry.totalAmount)}</td>
                                </tr>
                            ))}
                            {!isLoading && !successItems.length ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                                        Nenhuma parcela foi registrada pelo Financeiro neste lote.
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                        {successItems.length ? (
                            <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-black text-slate-900">
                                <tr>
                                    <td className="px-4 py-4" colSpan={3}>TOTAL GERAL</td>
                                    <td className="px-4 py-4">{successTotalInstallments}</td>
                                    <td className="px-4 py-4">---</td>
                                    <td className="px-4 py-4">{formatCurrency(successTotalAmount)}</td>
                                </tr>
                            </tfoot>
                        ) : null}
                    </table>
                </div>
            </section>
            ) : null}

            <section className="rounded-3xl border border-rose-500 bg-rose-200 p-6 shadow-sm shadow-rose-200/60">
                <div className="flex flex-col gap-2 border-b border-slate-100 pb-5 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h2 className="text-xl font-black text-slate-900">Não geraram parcelas</h2>
                        <p className="text-sm font-medium text-slate-500">
                            Resumo por aluno dos registros que não geraram parcelas e o motivo do bloqueio.
                        </p>
                    </div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                        {isLoading ? 'CARREGANDO...' : `${problemItems.length} REGISTRO(S)`}
                    </div>
                </div>

                <div className="mt-6 overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead>
                            <tr className="text-left text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                                <th className="px-4 py-3">Aluno</th>
                                <th className="px-4 py-3">Turma</th>
                                <th className="px-4 py-3">Parcelas lançadas</th>
                                <th className="px-4 py-3">Problema</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-rose-100 bg-white text-sm font-semibold text-slate-700">
                            {problemItems.map((entry) => (
                                <tr key={`${entry.status}-${entry.studentId}`}>
                                    <td className="px-4 py-4">{entry.studentName}</td>
                                    <td className="px-4 py-4">{entry.classLabel || '---'}</td>
                                    <td className="px-4 py-4">{entry.installmentCount}</td>
                                    <td className="px-4 py-4 text-rose-700">{entry.problemReason || '---'}</td>
                                </tr>
                            ))}
                            {!isLoading && !problemItems.length ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                                        Nenhum problema encontrado neste lote.
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </section>

            <div className={`${cardClass} px-6 py-4`}>
                <div className="flex justify-end">
                    <div className="flex items-start gap-2 text-right text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">
                        <div>
                            <div>Tela:</div>
                            <div className="mt-1 break-all font-normal tracking-[0.35em] text-slate-500">
                                {SCREEN_ID}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => void handleCopyScreenName(SCREEN_ID)}
                            title="Copiar nome da tela"
                            aria-label={`Copiar o identificador ${SCREEN_ID}`}
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
    );
}
