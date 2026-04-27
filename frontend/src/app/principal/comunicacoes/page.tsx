'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import { getDashboardAuthContext, hasAnyDashboardPermission } from '@/app/lib/dashboard-crud-utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

type ScopeResponse = {
    scope: 'ADMIN' | 'FINANCEIRO' | 'PROFESSOR';
    label: string;
    description: string;
    emailConfigured: boolean;
    tenant?: {
        id: string;
        name: string;
        logoUrl?: string | null;
    } | null;
    availableGroups: Array<{
        code: 'ESCOLA_GERAL' | 'FUNCIONARIOS' | 'PROFESSORES' | 'ALUNOS' | 'RESPONSAVEIS';
        label: string;
        description: string;
    }>;
};

type CampaignItem = {
    id: string;
    senderRole: string;
    senderName: string;
    title: string;
    message: string;
    sendInternal: boolean;
    sendEmail: boolean;
    totalRecipients: number;
    internalCount: number;
    emailCount: number;
    lastSentAt?: string | null;
    createdAt: string;
    recipientGroups: string[];
};

const EMPTY_FORM = {
    title: '',
    message: '',
    sendInternal: true,
    sendEmail: false,
};

function canOpenCommunicationCenter(role: string | null, permissions: string[]) {
    return (
        role === 'ADMIN' ||
        role === 'PROFESSOR' ||
        hasAnyDashboardPermission(role, permissions, ['MANAGE_COMMUNICATION_CENTER', 'MANAGE_FINANCIAL'])
    );
}

export default function CommunicationsPage() {
    const [scope, setScope] = useState<ScopeResponse | null>(null);
    const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [formState, setFormState] = useState(EMPTY_FORM);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const authContext = useMemo(() => getDashboardAuthContext(), []);
    const canAccess = canOpenCommunicationCenter(authContext.role, authContext.permissions);

    const loadPage = async () => {
        try {
            setLoading(true);
            setErrorMessage(null);
            if (!authContext.token) {
                throw new Error('Sessão não encontrada.');
            }

            const [scopeResponse, campaignsResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/communications/my-scope`, {
                    headers: {
                        Authorization: `Bearer ${authContext.token}`,
                    },
                }),
                fetch(`${API_BASE_URL}/communications`, {
                    headers: {
                        Authorization: `Bearer ${authContext.token}`,
                    },
                }),
            ]);

            const scopeData = await scopeResponse.json().catch(() => null);
            if (!scopeResponse.ok) {
                throw new Error(scopeData?.message || 'Não foi possível carregar o escopo da central de comunicações.');
            }

            const campaignsData = await campaignsResponse.json().catch(() => null);
            if (!campaignsResponse.ok) {
                throw new Error(campaignsData?.message || 'Não foi possível carregar o histórico de comunicados.');
            }

            setScope(scopeData);
            setCampaigns(Array.isArray(campaignsData) ? campaignsData : []);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar a central de comunicações.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!canAccess) return;
        void loadPage();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canAccess]);

    const toggleGroup = (groupCode: string) => {
        setSelectedGroups((current) =>
            current.includes(groupCode)
                ? current.filter((item) => item !== groupCode)
                : [...current, groupCode],
        );
    };

    const handleSend = async () => {
        try {
            setSending(true);
            setStatusMessage(null);
            setErrorMessage(null);

            if (!authContext.token) {
                throw new Error('Sessão não encontrada.');
            }

            const response = await fetch(`${API_BASE_URL}/communications`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${authContext.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: formState.title,
                    message: formState.message,
                    sendInternal: formState.sendInternal,
                    sendEmail: formState.sendEmail,
                    recipientGroups: selectedGroups,
                }),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível enviar o comunicado.');
            }

            setStatusMessage(
                `Comunicado enviado com sucesso. ${data?.delivery?.internalCount || 0} notificação(ões) interna(s) e ${data?.delivery?.emailCount || 0} e-mail(s).`,
            );
            setFormState(EMPTY_FORM);
            setSelectedGroups([]);
            await loadPage();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível enviar o comunicado.');
        } finally {
            setSending(false);
        }
    };

    if (!canAccess) {
        return (
            <DashboardAccessDenied
                title="Central de comunicações indisponível"
                message="Seu perfil não tem acesso para disparar comunicados desta escola."
            />
        );
    }

    return (
        <div className="mx-auto mt-6 max-w-7xl space-y-6">
            <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
                <div className="dashboard-band border-b px-6 py-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[24px] border border-white/70 bg-white shadow-sm">
                                {scope?.tenant?.logoUrl ? (
                                    <img
                                        src={scope.tenant.logoUrl}
                                        alt={`Logo de ${scope.tenant.name}`}
                                        className="h-full w-full object-contain p-2"
                                    />
                                ) : (
                                    <div className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-400">
                                        Escola
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Central unificada</div>
                                <h1 className="mt-2 text-3xl font-extrabold text-slate-800">Comunicações</h1>
                                <p className="mt-2 text-sm font-medium text-slate-500">
                                    {scope?.description || 'Envie comunicados por notificação interna, e-mail ou ambos.'}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.14em] text-blue-700">
                                        Escopo atual: {scope?.label || 'Carregando'}
                                    </span>
                                    <span
                                        className={`rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-[0.14em] ${
                                            scope?.emailConfigured
                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                : 'border-amber-200 bg-amber-50 text-amber-700'
                                        }`}
                                    >
                                        {scope?.emailConfigured ? 'E-mail da escola configurado' : 'E-mail da escola ainda não configurado'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 px-6 py-6 xl:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
                        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Novo disparo</div>
                                <h2 className="mt-2 text-2xl font-extrabold text-slate-800">Enviar comunicado</h2>
                            </div>
                            <div className="text-sm font-medium text-slate-500">
                                O comunicado alimenta a área web de notificações e já prepara o uso no futuro PWA.
                            </div>
                        </div>

                        {statusMessage ? (
                            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-700">
                                {statusMessage}
                            </div>
                        ) : null}

                        {errorMessage ? (
                            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-bold text-red-600">
                                {errorMessage}
                            </div>
                        ) : null}

                        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
                                <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Título do comunicado</label>
                                <input
                                    type="text"
                                    value={formState.title}
                                    onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
                                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                    placeholder="Ex.: REUNIÃO GERAL, AVISO DE PROVA, COMUNICADO FINANCEIRO"
                                />
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
                                <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Mensagem livre</label>
                                <textarea
                                    rows={8}
                                    value={formState.message}
                                    onChange={(event) => setFormState((current) => ({ ...current, message: event.target.value }))}
                                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                    placeholder="Digite o comunicado completo que será enviado por notificação interna e/ou e-mail."
                                />
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Canais de entrega</div>
                                <div className="mt-4 space-y-3">
                                    {[
                                        {
                                            key: 'sendInternal',
                                            label: 'Notificação interna',
                                            helper: 'Mostra no sistema web agora e pode abastecer o PWA depois.',
                                        },
                                        {
                                            key: 'sendEmail',
                                            label: 'E-mail',
                                            helper: 'Usa o remetente SMTP configurado na escola.',
                                        },
                                    ].map((item) => {
                                        const active = formState[item.key as keyof typeof formState] as boolean;
                                        return (
                                            <button
                                                key={item.key}
                                                type="button"
                                                onClick={() =>
                                                    setFormState((current) => ({
                                                        ...current,
                                                        [item.key]: !active,
                                                    }))
                                                }
                                                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                                                    active
                                                        ? 'border-emerald-200 bg-emerald-50'
                                                        : 'border-red-200 bg-red-50'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <div className={`text-sm font-extrabold ${active ? 'text-emerald-700' : 'text-red-700'}`}>
                                                            {item.label}
                                                        </div>
                                                        <div className="mt-1 text-xs font-medium text-slate-500">{item.helper}</div>
                                                    </div>
                                                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold ${active ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                                                        {active ? 'OK' : 'X'}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Público do envio</div>
                                <div className="mt-4 space-y-3">
                                    {scope?.availableGroups.map((group) => {
                                        const active = selectedGroups.includes(group.code);
                                        return (
                                            <button
                                                key={group.code}
                                                type="button"
                                                onClick={() => toggleGroup(group.code)}
                                                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                                                    active
                                                        ? 'border-emerald-200 bg-emerald-50'
                                                        : 'border-slate-200 bg-slate-50'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <div className={`text-sm font-extrabold ${active ? 'text-emerald-700' : 'text-slate-700'}`}>{group.label}</div>
                                                        <div className="mt-1 text-xs font-medium text-slate-500">{group.description}</div>
                                                    </div>
                                                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold ${active ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                                                        {active ? 'OK' : 'X'}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 flex justify-end">
                            <button
                                type="button"
                                onClick={handleSend}
                                disabled={sending || loading}
                                className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                            >
                                {sending ? 'Enviando comunicado...' : 'Enviar comunicado agora'}
                            </button>
                        </div>
                    </div>

                    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                            {authContext.role === 'ADMIN' ? 'Histórico da escola' : 'Meus comunicados'}
                        </div>
                        <h2 className="mt-2 text-2xl font-extrabold text-slate-800">Últimos envios</h2>

                        <div className="mt-5 space-y-4">
                            {loading ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-500">
                                    Carregando histórico...
                                </div>
                            ) : campaigns.length ? (
                                campaigns.map((campaign) => (
                                    <div key={campaign.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="text-xs font-bold uppercase tracking-[0.15em] text-blue-600">
                                                    {campaign.senderRole} • {new Date(campaign.createdAt).toLocaleString('pt-BR')}
                                                </div>
                                                <div className="mt-2 text-lg font-extrabold text-slate-800">{campaign.title}</div>
                                                <div className="mt-2 text-sm font-medium leading-6 text-slate-600">{campaign.message}</div>
                                            </div>
                                        </div>

                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {campaign.recipientGroups.map((group) => (
                                                <span key={`${campaign.id}-${group}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold uppercase tracking-[0.14em] text-slate-600">
                                                    {group.replace(/_/g, ' ')}
                                                </span>
                                            ))}
                                            {campaign.sendInternal ? (
                                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-700">
                                                    Notificação interna
                                                </span>
                                            ) : null}
                                            {campaign.sendEmail ? (
                                                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.14em] text-blue-700">
                                                    E-mail
                                                </span>
                                            ) : null}
                                        </div>

                                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                                <div className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Total de destinatários</div>
                                                <div className="mt-2 text-xl font-extrabold text-slate-800">{campaign.totalRecipients}</div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                                <div className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Notificações internas</div>
                                                <div className="mt-2 text-xl font-extrabold text-slate-800">{campaign.internalCount}</div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                                <div className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">E-mails enviados</div>
                                                <div className="mt-2 text-xl font-extrabold text-slate-800">{campaign.emailCount}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-500">
                                    Nenhum comunicado foi enviado ainda neste escopo.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
