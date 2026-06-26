'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PrincipalProgramHeader from '@/app/components/principal-program-header';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding, type TenantBranding } from '@/app/lib/tenant-branding-cache';
import { dispatchScreenAuditContext, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const SCREEN_ID = 'PRINCIPAL_NOTIFICACOES_CONFIGURAR_USUARIOS';

type NotificationUserRow = {
    id: string;
    sourceTypes: Array<'TEACHER' | 'STUDENT' | 'GUARDIAN' | 'PERSON'>;
    sourceLabel: string;
    name: string;
    cpf: string | null;
    email: string | null;
    emailVerified: boolean;
    emailVerifiedAt: string | null;
    telegramChatId: string | null;
    telegramUsername: string | null;
    telegramEnabled: boolean;
    telegramOptInAt: string | null;
    telegramOptOutAt: string | null;
    active: boolean;
};

type StatusFilter = 'ALL' | 'PENDING_EMAIL' | 'VALID_EMAIL' | 'TELEGRAM_ACTIVE';

type EditFormState = {
    person: NotificationUserRow;
    email: string;
    telegramChatId: string;
    telegramUsername: string;
    telegramOptInEnabled: boolean;
};

function buildAuditSql(tenantId: string | null, statusFilter: StatusFilter, searchTerm: string) {
    return `-- PARAMETROS ATUAIS DO GRID
-- :schoolId = ${toSqlLiteral(tenantId || '')}
-- :status = ${toSqlLiteral(statusFilter)}
-- :busca = ${toSqlLiteral(searchTerm)}

SELECT P.name, P.email, P.telegramChatId, P.telegramUsername, EC.emailVerified
FROM people P
LEFT JOIN email_credentials EC ON EC.email = UPPER(P.email)
WHERE P.tenantId = ${toSqlLiteral(tenantId || '')}
ORDER BY name ASC;`;
}

function buildAuditText(params: {
    tenantId: string | null;
    tenantName?: string | null;
    statusFilter: StatusFilter;
    searchTerm: string;
    displayedRowsCount: number;
}) {
    return `--- LOGICA DA TELA ---
Tela administrativa para acompanhar configuracoes de notificacao por pessoa.

TABELAS PRINCIPAIS:
- people (P) - cadastro mestre de pessoas.
- email_credentials (EC) - validacao global de e-mail.

RELACIONAMENTOS:
- teachers/students/guardians entram apenas para montar as etiquetas de papel da pessoa.

FILTROS APLICADOS AGORA:
- escola/tenant atual (:schoolId): ${formatTenantAuditValue(params.tenantId, params.tenantName)}
- status selecionado (:status): ${params.statusFilter}
- busca digitada (:busca): ${params.searchTerm || 'SEM BUSCA'}
- registros exibidos apos filtros: ${params.displayedRowsCount}
- ordenacao atual: nome ASC

OBSERVACOES:
- a validacao de e-mail usa email_credentials.emailVerified.
- o Telegram fica ativo quando existe Chat ID, opt-in preenchido e opt-out vazio.
- todas as consultas ficam restritas ao tenant logado.`;
}

function normalizeGridText(value?: string | null) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
}

export default function NotificationUserSettingsPage() {
    const router = useRouter();
    const { tenantId } = getDashboardAuthContext();
    const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);
    const [rows, setRows] = useState<NotificationUserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingEmail, setSavingEmail] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [editForm, setEditForm] = useState<EditFormState | null>(null);
    const [savingEdit, setSavingEdit] = useState(false);

    const filteredRows = useMemo(() => {
        const normalizedSearch = normalizeGridText(searchTerm);
        return rows.filter((row) => {
            const matchesSearch = !normalizedSearch || [
                row.name,
                row.email,
                row.sourceLabel,
                row.telegramChatId,
                row.telegramUsername,
            ].some((value) => normalizeGridText(value).includes(normalizedSearch));

            const matchesStatus =
                statusFilter === 'ALL' ||
                (statusFilter === 'PENDING_EMAIL' && Boolean(row.email) && !row.emailVerified) ||
                (statusFilter === 'VALID_EMAIL' && row.emailVerified) ||
                (statusFilter === 'TELEGRAM_ACTIVE' && row.telegramEnabled);

            return matchesSearch && matchesStatus;
        });
    }, [rows, searchTerm, statusFilter]);

    const loadRows = async () => {
        try {
            setLoading(true);
            setErrorMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const response = await fetch(`${API_BASE_URL}/notification-settings/users`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Não foi possível carregar os usuários.');
            setRows(Array.isArray(data) ? data : []);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar os usuários.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadRows();
    }, []);

    useEffect(() => {
        setTenantBranding(readCachedTenantBranding(tenantId));
    }, [tenantId]);

    useEffect(() => {
        dispatchScreenAuditContext({
            screenId: SCREEN_ID,
            auditText: buildAuditText({
                tenantId,
                tenantName: tenantBranding?.schoolName,
                statusFilter,
                searchTerm,
                displayedRowsCount: filteredRows.length,
            }),
            sqlText: buildAuditSql(tenantId, statusFilter, searchTerm),
        });
    }, [filteredRows.length, searchTerm, statusFilter, tenantBranding?.schoolName, tenantId]);

    const sendEmailConfirmation = async (email: string | null) => {
        if (!email) return;
        try {
            setSavingEmail(email);
            setErrorMessage(null);
            setSuccessMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const response = await fetch(`${API_BASE_URL}/notification-settings/users/send-email-confirmation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ email }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Não foi possível enviar a confirmação.');
            setSuccessMessage(data?.message || 'E-mail de confirmação enviado com sucesso.');
            await loadRows();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível enviar a confirmação.');
        } finally {
            setSavingEmail(null);
        }
    };

    const openEditModal = (row: NotificationUserRow) => {
        setErrorMessage(null);
        setSuccessMessage(null);
        setEditForm({
            person: row,
            email: row.email || '',
            telegramChatId: row.telegramChatId || '',
            telegramUsername: row.telegramUsername || '',
            telegramOptInEnabled: row.telegramEnabled,
        });
    };

    const saveEditForm = async () => {
        if (!editForm) return;
        try {
            setSavingEdit(true);
            setErrorMessage(null);
            setSuccessMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const response = await fetch(`${API_BASE_URL}/notification-settings/users/${editForm.person.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    email: editForm.email.trim().toUpperCase() || undefined,
                    telegramChatId: editForm.telegramChatId.trim(),
                    telegramUsername: editForm.telegramUsername.trim().toUpperCase(),
                    telegramOptInEnabled: editForm.telegramOptInEnabled,
                }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Não foi possível salvar os dados de notificação.');

            setSuccessMessage(data?.message || 'Dados de notificação atualizados com sucesso.');
            setEditForm(null);
            await loadRows();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível salvar os dados de notificação.');
        } finally {
            setSavingEdit(false);
        }
    };

    return (
        <div className="flex min-h-[calc(100vh-12rem)] w-full pt-0">
            <div className="flex w-full flex-col bg-transparent">
                <PrincipalProgramHeader
                    eyebrow="Centro de mensagens"
                    title="Configurações de notificações por usuário"
                    description="Acompanhe e-mail validado e dados de Telegram do cadastro central de pessoas."
                    schoolName={tenantBranding?.schoolName}
                    logoUrl={tenantBranding?.logoUrl}
                    secondaryAction={
                        <button
                            type="button"
                            onClick={() => router.push('/principal/notificacoes')}
                            className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white shadow-lg backdrop-blur-sm transition hover:bg-white/20"
                        >
                            Voltar
                        </button>
                    }
                />

                <div className="flex-1 px-5 pb-8 pt-6 sm:px-6 lg:px-8">
                    <div className="rounded-[30px] bg-[#f8fafc] p-5">
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="min-w-[260px] flex-1">
                                <label className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">Pesquisar</label>
                                <input
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value.toUpperCase())}
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    placeholder="NOME, E-MAIL OU TELEGRAM"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">Status</label>
                                <select
                                    value={statusFilter}
                                    onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                                    className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                >
                                    <option value="ALL">TODOS</option>
                                    <option value="PENDING_EMAIL">E-MAIL PENDENTE</option>
                                    <option value="VALID_EMAIL">E-MAIL VALIDADO</option>
                                    <option value="TELEGRAM_ACTIVE">TELEGRAM ATIVO</option>
                                </select>
                            </div>
                            <button
                                type="button"
                                onClick={() => void loadRows()}
                                disabled={loading}
                                className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-blue-700 disabled:opacity-60"
                            >
                                Atualizar
                            </button>
                        </div>

                        {successMessage ? (
                            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-700">
                                {successMessage}
                            </div>
                        ) : null}
                        {errorMessage ? (
                            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-bold text-red-600">
                                {errorMessage}
                            </div>
                        ) : null}

                        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            <div className="max-h-[calc(100vh-25rem)] overflow-auto">
                                <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                                    <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3">Pessoa</th>
                                            <th className="px-4 py-3">E-mail</th>
                                            <th className="px-4 py-3">Validação</th>
                                            <th className="px-4 py-3">Telegram</th>
                                            <th className="px-4 py-3 text-right">Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-10 text-center font-bold text-slate-400">
                                                    Carregando usuários...
                                                </td>
                                            </tr>
                                        ) : filteredRows.length ? (
                                            filteredRows.map((row, index) => (
                                                <tr key={`${row.sourceTypes.join('-')}-${row.id}`} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                                                    <td className="px-4 py-3">
                                                        <div className="font-black text-slate-800">{row.name}</div>
                                                        <div className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{row.sourceLabel}</div>
                                                    </td>
                                                    <td className="px-4 py-3 font-bold text-slate-700">
                                                        {row.email || ''}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex rounded-lg px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${row.emailVerified ? 'bg-emerald-100 text-emerald-700' : row.email ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                                            {row.emailVerified ? 'VALIDADO' : row.email ? 'PENDENTE' : 'SEM E-MAIL'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-bold text-slate-700">{row.telegramChatId || 'SEM CHAT ID'}</div>
                                                        <div className="mt-1 text-xs font-bold text-slate-400">{row.telegramUsername || 'SEM USUÁRIO'}</div>
                                                        <span className={`mt-2 inline-flex rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${row.telegramEnabled ? 'bg-sky-100 text-sky-700' : 'bg-red-100 text-red-700'}`}>
                                                            {row.telegramEnabled ? 'ATIVO' : 'INATIVO'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex flex-wrap justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => openEditModal(row)}
                                                                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                                                            >
                                                                Editar
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => void sendEmailConfirmation(row.email)}
                                                                disabled={!row.email || row.emailVerified || savingEmail === row.email}
                                                                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-blue-700 transition hover:border-blue-400 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                {!row.email ? 'Sem e-mail' : savingEmail === row.email ? 'Enviando...' : row.emailVerified ? 'Validado' : 'Validar e-mail'}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-10 text-center font-bold text-slate-400">
                                                    Nenhum usuário encontrado para os filtros atuais.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                <span>Registros: {filteredRows.length}</span>
                                <span>Total carregado: {rows.length}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {editForm ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
                        <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-5 text-white">
                            <div className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">PRINCIPAL_NOTIFICACOES_CONFIGURAR_USUARIOS_MODAL_EDITAR</div>
                            <h2 className="mt-2 text-2xl font-black">{editForm.person.name}</h2>
                            <p className="mt-1 text-sm font-bold text-blue-100">{editForm.person.sourceLabel}</p>
                        </div>
                        <div className="space-y-4 p-6">
                            <div>
                                <label className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">E-mail</label>
                                <input
                                    type="email"
                                    value={editForm.email}
                                    onChange={(event) => setEditForm((current) => current ? { ...current, email: event.target.value.toUpperCase() } : current)}
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">Telegram Chat ID</label>
                                    <input
                                        value={editForm.telegramChatId}
                                        onChange={(event) => setEditForm((current) => current ? { ...current, telegramChatId: event.target.value.trim() } : current)}
                                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                        placeholder="Ex.: 123456789"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">Usuário Telegram</label>
                                    <input
                                        value={editForm.telegramUsername}
                                        onChange={(event) => setEditForm((current) => current ? { ...current, telegramUsername: event.target.value.toUpperCase() } : current)}
                                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                        placeholder="Ex.: @USUARIO"
                                    />
                                </div>
                            </div>
                            <label className="flex min-h-[46px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={editForm.telegramOptInEnabled}
                                    onChange={(event) => setEditForm((current) => current ? { ...current, telegramOptInEnabled: event.target.checked } : current)}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                />
                                Telegram ativo para notificações
                            </label>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
                            <button
                                type="button"
                                onClick={() => setEditForm(null)}
                                disabled={savingEdit}
                                className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-rose-700 disabled:opacity-60"
                            >
                                Fechar
                            </button>
                            <button
                                type="button"
                                onClick={() => void saveEditForm()}
                                disabled={savingEdit}
                                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-blue-700 disabled:opacity-60"
                            >
                                {savingEdit ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
