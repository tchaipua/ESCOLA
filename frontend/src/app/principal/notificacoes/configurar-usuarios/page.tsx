'use client';

import { useEffect, useMemo, useState } from 'react';
import GridColumnConfigModal from '@/app/components/grid-column-config-modal';
import GridExportModal from '@/app/components/grid-export-modal';
import GridSortableHeader from '@/app/components/grid-sortable-header';
import GridStandardFooter from '@/app/components/grid-standard-footer';
import GridStatusFilter, { type GridStatusFilterValue } from '@/app/components/grid-status-filter';
import NotificationHeaderIndicator from '@/app/components/notification-header-indicator';
import PrincipalProgramHeader from '@/app/components/principal-program-header';
import MaintenanceModalFooter from '@/app/components/maintenance-modal-footer';
import MaintenanceModalHeader from '@/app/components/maintenance-modal-header';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import {
    buildDefaultExportColumns,
    buildExportColumnsFromGridColumns,
    exportGridRows,
    sortGridRows,
    type GridColumnDefinition,
    type GridExportFormat,
    type GridSortState,
} from '@/app/lib/grid-export-utils';
import { readCachedTenantBranding, type TenantBranding } from '@/app/lib/tenant-branding-cache';
import { dispatchScreenAuditContext, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';
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
type NotificationGridColumnKey = 'person' | 'email' | 'telegram';
type NotificationExportColumnKey = NotificationGridColumnKey | 'recordStatus';

type NotificationPreference = {
    eventType: string;
    label: string;
    group: string;
    enabled: boolean;
    sendInternal: boolean;
    sendEmail: boolean;
    sendTelegram: boolean;
};

type EditFormState = {
    person: NotificationUserRow;
    email: string;
    telegramChatId: string;
    telegramUsername: string;
    telegramOptInEnabled: boolean;
    preferences: NotificationPreference[];
};

function isTelegramConfigured(form: EditFormState | null) {
    return Boolean(
        form?.telegramOptInEnabled
        && /^[1-9]\d{0,15}$/.test(form.telegramChatId.trim()),
    );
}

type EditModalTab = 'PRINCIPAL' | 'EVENTOS';

const EVENT_CARD_TONES = [
    'border-sky-300 bg-sky-100',
    'border-emerald-300 bg-emerald-100',
    'border-amber-300 bg-amber-100',
] as const;

const NOTIFICATION_GRID_COLUMNS: Array<GridColumnDefinition<NotificationUserRow, NotificationGridColumnKey>> = [
    {
        key: 'person',
        label: 'Pessoa',
        getValue: (row) => `${row.name} (${row.sourceLabel})`,
        getSortValue: (row) => row.name,
    },
    {
        key: 'email',
        label: 'E-mail',
        getValue: (row) => row.email || 'SEM E-MAIL',
        getSortValue: (row) => row.email || '',
    },
    {
        key: 'telegram',
        label: 'Telegram',
        getValue: (row) => `${row.telegramChatId || 'SEM CHAT ID'} | ${row.telegramUsername || 'SEM USUÁRIO'} | ${row.telegramEnabled ? 'ATIVO' : 'INATIVO'}`,
        getSortValue: (row) => row.telegramUsername || row.telegramChatId || '',
    },
];

const NOTIFICATION_EXPORT_COLUMNS = buildExportColumnsFromGridColumns<NotificationUserRow, NotificationGridColumnKey, 'recordStatus'>(
    NOTIFICATION_GRID_COLUMNS,
    [{
        key: 'recordStatus',
        label: 'Situação do registro',
        getValue: (row) => row.active ? 'ATIVO' : 'INATIVO',
        getSortValue: (row) => row.active ? 1 : 0,
    }],
);

const NOTIFICATION_GRID_COLUMN_KEYS = NOTIFICATION_GRID_COLUMNS.map((column) => column.key);
const DEFAULT_NOTIFICATION_SORT: GridSortState<NotificationGridColumnKey> = { column: 'person', direction: 'asc' };

function getNotificationAuditOrderBy(sortState: GridSortState<NotificationGridColumnKey>) {
    const column = sortState.column === 'email'
        ? 'P.email'
        : sortState.column === 'telegram'
            ? 'P.telegramUsername'
            : 'P.name';
    return `${column} ${sortState.direction.toUpperCase()}`;
}

function buildAuditSql(
    tenantId: string | null,
    statusFilter: StatusFilter,
    recordStatusFilter: GridStatusFilterValue,
    searchTerm: string,
    sortState: GridSortState<NotificationGridColumnKey>,
) {
    return `-- PARAMETROS ATUAIS DO GRID
-- :schoolId = ${toSqlLiteral(tenantId || '')}
-- :status = ${toSqlLiteral(statusFilter)}
-- :situacaoRegistro = ${toSqlLiteral(recordStatusFilter)}
-- :busca = ${toSqlLiteral(searchTerm)}

SELECT P.name, P.email, P.telegramChatId, P.telegramUsername, EC.emailVerified
FROM people P
LEFT JOIN email_credentials EC ON EC.email = UPPER(P.email)
LEFT JOIN notification_preferences NP ON NP.personId = P.id AND NP.tenantId = P.tenantId AND NP.canceledAt IS NULL
WHERE P.tenantId = ${toSqlLiteral(tenantId || '')}
ORDER BY ${getNotificationAuditOrderBy(sortState)}, P.name ASC;`;
}

function buildAuditText(params: {
    tenantId: string | null;
    tenantName?: string | null;
    statusFilter: StatusFilter;
    recordStatusFilter: GridStatusFilterValue;
    searchTerm: string;
    displayedRowsCount: number;
    sortState: GridSortState<NotificationGridColumnKey>;
}) {
    return `--- LOGICA DA TELA ---
Tela administrativa para acompanhar configuracoes de notificacao por pessoa.

TABELAS PRINCIPAIS:
- people (P) - cadastro mestre de pessoas.
- email_credentials (EC) - validacao global de e-mail.
- notification_preferences (NP) - preferências individuais por evento e canal.

RELACIONAMENTOS:
- teachers/students/guardians entram apenas para montar as etiquetas de papel da pessoa.

FILTROS APLICADOS AGORA:
- escola/tenant atual (:schoolId): ${formatTenantAuditValue(params.tenantId, params.tenantName)}
- status selecionado (:status): ${params.statusFilter}
- situação do registro (:situacaoRegistro): ${params.recordStatusFilter}
- busca digitada (:busca): ${params.searchTerm || 'SEM BUSCA'}
- registros exibidos apos filtros: ${params.displayedRowsCount}
- ordenacao atual: ${getNotificationAuditOrderBy(params.sortState)}

OBSERVACOES:
- a validacao de e-mail usa email_credentials.emailVerified.
- o Telegram fica ativo quando existe Chat ID, opt-in preenchido e opt-out vazio.
- eventos de inativação/cancelamento são configurados individualmente por pessoa.
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
    const { tenantId } = getDashboardAuthContext();
    const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);
    const [rows, setRows] = useState<NotificationUserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingEmail, setSavingEmail] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [recordStatusFilter, setRecordStatusFilter] = useState<GridStatusFilterValue>('ALL');
    const [sortState, setSortState] = useState<GridSortState<NotificationGridColumnKey>>(DEFAULT_NOTIFICATION_SORT);
    const [pageSize, setPageSize] = useState(10);
    const [page, setPage] = useState(1);
    const [columnOrder, setColumnOrder] = useState<NotificationGridColumnKey[]>(NOTIFICATION_GRID_COLUMN_KEYS);
    const [hiddenColumns, setHiddenColumns] = useState<NotificationGridColumnKey[]>([]);
    const [isGridConfigOpen, setIsGridConfigOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
    const [exportColumns, setExportColumns] = useState<Record<NotificationExportColumnKey, boolean>>(
        () => buildDefaultExportColumns(NOTIFICATION_EXPORT_COLUMNS),
    );
    const [editForm, setEditForm] = useState<EditFormState | null>(null);
    const [editModalTab, setEditModalTab] = useState<EditModalTab>('PRINCIPAL');
    const [savingEdit, setSavingEdit] = useState(false);
    const [loadingPreferences, setLoadingPreferences] = useState(false);
    const [telegramActionLoading, setTelegramActionLoading] = useState<string | null>(null);

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

            const matchesRecordStatus =
                recordStatusFilter === 'ALL' ||
                (recordStatusFilter === 'ACTIVE' && row.active) ||
                (recordStatusFilter === 'INACTIVE' && !row.active);

            return matchesSearch && matchesStatus && matchesRecordStatus;
        });
    }, [recordStatusFilter, rows, searchTerm, statusFilter]);

    const sortedFilteredRows = useMemo(
        () => sortGridRows(filteredRows, NOTIFICATION_GRID_COLUMNS, sortState, (left, right) => left.name.localeCompare(right.name, 'pt-BR')),
        [filteredRows, sortState],
    );
    const visibleColumnKeys = useMemo(
        () => columnOrder.filter((columnKey) => !hiddenColumns.includes(columnKey)),
        [columnOrder, hiddenColumns],
    );
    const totalPages = Math.max(1, Math.ceil(sortedFilteredRows.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const paginatedRows = useMemo(
        () => sortedFilteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        [currentPage, pageSize, sortedFilteredRows],
    );

    useEffect(() => {
        setPage(1);
    }, [pageSize, recordStatusFilter, searchTerm, sortState, statusFilter]);

    useEffect(() => {
        setPage((value) => Math.min(Math.max(value, 1), totalPages));
    }, [totalPages]);

    const loadRows = async () => {
        try {
            setLoading(true);
            setErrorMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const response = await fetch(`${API_BASE_URL}/notification-settings/users`, {
                headers: { },
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
                recordStatusFilter,
                searchTerm,
                displayedRowsCount: sortedFilteredRows.length,
                sortState,
            }),
            sqlText: buildAuditSql(tenantId, statusFilter, recordStatusFilter, searchTerm, sortState),
        });
    }, [recordStatusFilter, searchTerm, sortState, sortedFilteredRows.length, statusFilter, tenantBranding?.schoolName, tenantId]);

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

    const configureTelegramWebhook = async () => {
        try {
            setTelegramActionLoading('configure');
            setErrorMessage(null);
            setSuccessMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const response = await fetch(`${API_BASE_URL}/telegram/configure-webhook`, {
                method: 'POST',
                headers: { },
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Não foi possível configurar o webhook do Telegram.');
            setSuccessMessage(data?.localOnly
                ? 'Webhook configurado, mas a URL está local. Na VPS configure BACKEND_PUBLIC_URL com o endereço público da API.'
                : data?.message || 'Webhook do Telegram configurado com sucesso.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível configurar o webhook do Telegram.');
        } finally {
            setTelegramActionLoading(null);
        }
    };

    const checkTelegramWebhook = async () => {
        try {
            setTelegramActionLoading('status');
            setErrorMessage(null);
            setSuccessMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const response = await fetch(`${API_BASE_URL}/telegram/webhook-status`, {
                headers: { },
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Não foi possível consultar o webhook do Telegram.');
            const url = data?.url ? ` URL: ${data.url}` : '';
            const pending = data?.pending_update_count !== undefined ? ` Pendentes: ${data.pending_update_count}.` : '';
            setSuccessMessage(`Webhook consultado com sucesso.${pending}${url}`);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível consultar o webhook do Telegram.');
        } finally {
            setTelegramActionLoading(null);
        }
    };

    const pollTelegramUpdates = async () => {
        try {
            setTelegramActionLoading('poll');
            setErrorMessage(null);
            setSuccessMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const response = await fetch(`${API_BASE_URL}/telegram/poll-updates`, {
                method: 'POST',
                headers: { },
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Não foi possível buscar mensagens do Telegram.');
            const total = Array.isArray(data?.results)
                ? data.results.reduce((sum: number, item: { processed?: number }) => sum + Number(item.processed || 0), 0)
                : 0;
            setSuccessMessage(`Busca do Telegram concluída. Mensagens processadas: ${total}.`);
            await loadRows();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível buscar mensagens do Telegram.');
        } finally {
            setTelegramActionLoading(null);
        }
    };

    const openEditModal = async (row: NotificationUserRow) => {
        setErrorMessage(null);
        setSuccessMessage(null);
        setEditModalTab('PRINCIPAL');
        setEditForm({
            person: row,
            email: row.email || '',
            telegramChatId: row.telegramChatId || '',
            telegramUsername: row.telegramUsername || '',
            telegramOptInEnabled: row.telegramEnabled,
            preferences: [],
        });
        try {
            setLoadingPreferences(true);
            const response = await fetch(`${API_BASE_URL}/notification-settings/users/${row.id}/preferences`);
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Não foi possível carregar as preferências de eventos.');
            setEditForm((current) => current ? { ...current, preferences: Array.isArray(data) ? data : [] } : current);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar as preferências de eventos.');
        } finally {
            setLoadingPreferences(false);
        }
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

            const preferencesResponse = await fetch(`${API_BASE_URL}/notification-settings/users/${editForm.person.id}/preferences`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preferences: editForm.preferences.map(({ eventType, enabled, sendInternal, sendEmail, sendTelegram }) => ({
                    eventType,
                    enabled,
                    sendInternal: enabled ? sendInternal : false,
                    sendEmail: enabled ? sendEmail : false,
                    sendTelegram: enabled && isTelegramConfigured(editForm) ? sendTelegram : false,
                })) }),
            });
            const preferencesData = await preferencesResponse.json().catch(() => null);
            if (!preferencesResponse.ok) throw new Error(preferencesData?.message || 'Não foi possível salvar as preferências de eventos.');

            setSuccessMessage('Dados de contato e preferências de eventos atualizados com sucesso.');
            setEditForm(null);
            await loadRows();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível salvar os dados de notificação.');
        } finally {
            setSavingEdit(false);
        }
    };

    const allEventsEnabled = Boolean(
        editForm?.preferences.length && editForm.preferences.every((preference) => preference.enabled),
    );
    const allEmailEnabled = Boolean(
        editForm?.preferences.length && editForm.preferences.every((preference) => preference.enabled && preference.sendEmail),
    );
    const telegramConfigured = isTelegramConfigured(editForm);
    const allTelegramEnabled = Boolean(
        telegramConfigured
        && editForm?.preferences.length
        && editForm.preferences.every((preference) => preference.enabled && preference.sendTelegram),
    );
    const bulkPreferenceOptions: ReadonlyArray<readonly ['EVENTS' | 'EMAIL' | 'TELEGRAM', string, boolean]> = [
        ['EVENTS', 'Todos os eventos', allEventsEnabled],
        ['EMAIL', 'Todos por e-mail', allEmailEnabled],
        ...(telegramConfigured ? [['TELEGRAM', 'Todos por Telegram', allTelegramEnabled] as const] : []),
    ];
    const eventChannelOptions: ReadonlyArray<readonly ['sendInternal' | 'sendEmail' | 'sendTelegram', string]> = [
        ['sendInternal', 'Sistema'],
        ['sendEmail', 'E-mail'],
        ...(telegramConfigured ? [['sendTelegram', 'Telegram'] as const] : []),
    ];

    const updateAllEventPreferences = (kind: 'EVENTS' | 'EMAIL' | 'TELEGRAM', checked: boolean) => {
        setEditForm((current) => {
            if (!current) return current;
            if (kind === 'TELEGRAM' && !isTelegramConfigured(current)) return current;

            return {
                ...current,
                preferences: current.preferences.map((preference) => {
                    if (kind === 'EVENTS') {
                        return checked
                            ? { ...preference, enabled: true }
                            : {
                                ...preference,
                                enabled: false,
                                sendInternal: false,
                                sendEmail: false,
                                sendTelegram: false,
                            };
                    }

                    return {
                        ...preference,
                        enabled: checked ? true : preference.enabled,
                        ...(kind === 'EMAIL' ? { sendEmail: checked } : { sendTelegram: checked }),
                    };
                }),
            };
        });
    };

    const toggleGridColumnVisibility = (columnKey: NotificationGridColumnKey) => {
        setHiddenColumns((current) => current.includes(columnKey)
            ? current.filter((item) => item !== columnKey)
            : [...current, columnKey]);
    };

    const moveGridColumn = (columnKey: NotificationGridColumnKey, direction: 'up' | 'down') => {
        setColumnOrder((current) => {
            const index = current.indexOf(columnKey);
            const nextIndex = direction === 'up' ? index - 1 : index + 1;
            if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;

            const next = [...current];
            [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
            return next;
        });
    };

    const resetGridColumns = () => {
        setColumnOrder(NOTIFICATION_GRID_COLUMN_KEYS);
        setHiddenColumns([]);
    };

    const toggleExportColumn = (columnKey: NotificationExportColumnKey) => {
        setExportColumns((current) => ({ ...current, [columnKey]: !current[columnKey] }));
    };

    const setAllExportColumns = (value: boolean) => {
        setExportColumns(NOTIFICATION_EXPORT_COLUMNS.reduce<Record<NotificationExportColumnKey, boolean>>((accumulator, column) => {
            accumulator[column.key] = value;
            return accumulator;
        }, {} as Record<NotificationExportColumnKey, boolean>));
    };

    const toggleSort = (column: NotificationGridColumnKey) => {
        setSortState((current) => current.column === column
            ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
            : { column, direction: 'asc' });
    };

    return (
        <div className="flex h-[calc(100vh-4.5rem)] min-h-0 w-full pt-0">
            <div className="flex w-full flex-col bg-transparent">
                <PrincipalProgramHeader
                    eyebrow="Centro de mensagens"
                    title="Configurações de notificações por usuário"
                    description="Acompanhe e-mail validado e dados de Telegram do cadastro central de pessoas."
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
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                            <NotificationHeaderIndicator />
                        </>
                    }
                />

                <div className="flex min-h-0 flex-1 px-5 pb-8 pt-6 sm:px-6 lg:px-8">
                    <div className="flex min-h-0 flex-1 flex-col rounded-[30px] bg-[#f8fafc] p-5">
                        <div className="flex shrink-0 flex-wrap items-end gap-3">
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
                                onClick={() => void configureTelegramWebhook()}
                                disabled={telegramActionLoading !== null}
                                className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-emerald-700 disabled:opacity-60"
                            >
                                {telegramActionLoading === 'configure' ? 'Configurando...' : 'Configurar webhook'}
                            </button>
                            <button
                                type="button"
                                onClick={() => void checkTelegramWebhook()}
                                disabled={telegramActionLoading !== null}
                                className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black uppercase tracking-[0.14em] text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60"
                            >
                                {telegramActionLoading === 'status' ? 'Consultando...' : 'Consultar webhook'}
                            </button>
                            <button
                                type="button"
                                onClick={() => void pollTelegramUpdates()}
                                disabled={telegramActionLoading !== null}
                                className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black uppercase tracking-[0.14em] text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-60"
                            >
                                {telegramActionLoading === 'poll' ? 'Buscando...' : 'Buscar mensagens'}
                            </button>
                        </div>

                        {successMessage ? (
                            <div className="mt-5 shrink-0 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-700">
                                {successMessage}
                            </div>
                        ) : null}
                        {errorMessage ? (
                            <div className="mt-5 shrink-0 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-bold text-red-600">
                                {errorMessage}
                            </div>
                        ) : null}

                        <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            <div className="min-h-0 flex-1 overflow-auto">
                                <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                                    <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                        <tr>
                                            {visibleColumnKeys.map((columnKey) => {
                                                const column = NOTIFICATION_GRID_COLUMNS.find((item) => item.key === columnKey);
                                                if (!column) return null;

                                                return (
                                                    <th key={column.key} className="px-4 py-3">
                                                        <GridSortableHeader
                                                            label={column.label}
                                                            isActive={sortState.column === column.key}
                                                            direction={sortState.direction}
                                                            onClick={() => toggleSort(column.key)}
                                                        />
                                                    </th>
                                                );
                                            })}
                                            <th className="px-4 py-3 text-right">Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr>
                                                <td colSpan={Math.max(1, visibleColumnKeys.length + 1)} className="px-4 py-10 text-center font-bold text-slate-400">
                                                    Carregando usuários...
                                                </td>
                                            </tr>
                                        ) : paginatedRows.length ? (
                                            paginatedRows.map((row, index) => (
                                                <tr key={`${row.sourceTypes.join('-')}-${row.id}`} className={`${row.active ? (index % 2 === 0 ? 'bg-white' : 'bg-slate-200/70') : (index % 2 === 0 ? 'bg-rose-100/80' : 'bg-rose-200/70')}`}>
                                                    {visibleColumnKeys.map((columnKey) => {
                                                        if (columnKey === 'person') {
                                                            return (
                                                                <td key={columnKey} className="px-4 py-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <span
                                                                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.active ? 'bg-emerald-500' : 'bg-red-500'}`}
                                                                            title={row.active ? 'ATIVO' : 'INATIVO'}
                                                                            aria-label={row.active ? 'ATIVO' : 'INATIVO'}
                                                                        />
                                                                        <div>
                                                                            <div className="font-black text-slate-800">{row.name}</div>
                                                                            <div className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{row.sourceLabel}</div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            );
                                                        }

                                                        if (columnKey === 'email') {
                                                            return (
                                                                <td key={columnKey} className="px-4 py-3">
                                                                    <div className="font-bold text-slate-700">{row.email || 'SEM E-MAIL'}</div>
                                                                    <span className={`mt-2 inline-flex rounded-lg px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${row.emailVerified ? 'bg-emerald-100 text-emerald-700' : row.email ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                                                        {row.emailVerified ? 'VALIDADO' : row.email ? 'PENDENTE' : 'SEM E-MAIL'}
                                                                    </span>
                                                                </td>
                                                            );
                                                        }

                                                        return (
                                                            <td key={columnKey} className="px-4 py-3">
                                                                <div className="font-bold text-slate-700">{row.telegramChatId || 'SEM CHAT ID'}</div>
                                                                <div className="mt-1 text-xs font-bold text-slate-400">{row.telegramUsername || 'SEM USUÁRIO'}</div>
                                                                <span className={`mt-2 inline-flex rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${row.telegramEnabled ? 'bg-sky-100 text-sky-700' : 'bg-red-100 text-red-700'}`}>
                                                                    {row.telegramEnabled ? 'ATIVO' : 'INATIVO'}
                                                                </span>
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex flex-wrap justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => openEditModal(row)}
                                                                title="Editar usuário"
                                                                aria-label="Editar usuário"
                                                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                                                            >
                                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => void sendEmailConfirmation(row.email)}
                                                                disabled={!row.email || row.emailVerified || savingEmail === row.email}
                                                                title={!row.email ? 'Sem e-mail' : savingEmail === row.email ? 'Enviando confirmação' : row.emailVerified ? 'E-mail validado' : 'Enviar Email para Validação'}
                                                                aria-label={!row.email ? 'Sem e-mail' : savingEmail === row.email ? 'Enviando confirmação' : row.emailVerified ? 'E-mail validado' : 'Enviar Email para Validação'}
                                                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 transition hover:border-blue-400 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                {row.emailVerified ? (
                                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={Math.max(1, visibleColumnKeys.length + 1)} className="px-4 py-10 text-center font-bold text-slate-400">
                                                    Nenhum usuário encontrado para os filtros atuais.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <GridStandardFooter
                                recordsCount={sortedFilteredRows.length}
                                onOpenColumns={() => setIsGridConfigOpen(true)}
                                onOpenExport={() => setIsExportModalOpen(true)}
                                statusFilter={recordStatusFilter}
                                onStatusFilterChange={setRecordStatusFilter}
                                activeLabel="Mostrar somente usuários ativos"
                                allLabel="Mostrar usuários ativos e inativos"
                                inactiveLabel="Mostrar somente usuários inativos"
                                pageSize={pageSize}
                                onPageSizeChange={setPageSize}
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onFirstPage={() => setPage(1)}
                                onPreviousPage={() => setPage((value) => Math.max(1, value - 1))}
                                onNextPage={() => setPage((value) => Math.min(totalPages, value + 1))}
                                onLastPage={() => setPage(totalPages)}
                            />
                        </div>
                    </div>
                </div>
            </div>
            <GridColumnConfigModal
                isOpen={isGridConfigOpen}
                title="Configurar colunas do grid"
                description="Reordene, oculte ou inclua colunas da configuração de notificações por usuário."
                columns={NOTIFICATION_GRID_COLUMNS.map((column) => ({
                    key: column.key,
                    label: column.label,
                    visibleByDefault: true,
                }))}
                orderedColumns={columnOrder}
                hiddenColumns={hiddenColumns}
                onToggleColumnVisibility={toggleGridColumnVisibility}
                onMoveColumn={moveGridColumn}
                onReset={resetGridColumns}
                onClose={() => setIsGridConfigOpen(false)}
            />
            <GridExportModal
                isOpen={isExportModalOpen}
                title="Exportar configurações de notificações"
                description={`A exportação respeita os filtros atuais e inclui ${sortedFilteredRows.length} registro(s).`}
                format={exportFormat}
                onFormatChange={setExportFormat}
                columns={NOTIFICATION_EXPORT_COLUMNS.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={exportColumns}
                onToggleColumn={toggleExportColumn}
                onSelectAll={setAllExportColumns}
                storageKey={`PRINCIPAL_NOTIFICACOES_CONFIGURAR_USUARIOS_EXPORT:${tenantId || 'global'}`}
                onClose={() => setIsExportModalOpen(false)}
                onExport={async (config) => {
                    try {
                        await exportGridRows({
                            rows: sortedFilteredRows,
                            columns: config?.orderedColumns
                                ? config.orderedColumns.map((key) => NOTIFICATION_EXPORT_COLUMNS.find((column) => column.key === key)).filter((column): column is GridColumnDefinition<NotificationUserRow, NotificationExportColumnKey> => Boolean(column))
                                : NOTIFICATION_EXPORT_COLUMNS,
                            selectedColumns: config?.selectedColumns || exportColumns,
                            format: exportFormat,
                            pdfOptions: config?.pdfOptions,
                            fileBaseName: 'configuracoes-notificacoes-usuarios',
                            branding: {
                                title: 'Configurações de notificações por usuário',
                                subtitle: 'Exportação com os filtros atualmente aplicados.',
                                schoolName: tenantBranding?.schoolName,
                                logoUrl: tenantBranding?.logoUrl,
                            },
                        });
                        setIsExportModalOpen(false);
                        setSuccessMessage(`Exportação ${exportFormat.toUpperCase()} preparada com ${sortedFilteredRows.length} registro(s).`);
                    } catch (error) {
                        setErrorMessage(error instanceof Error ? error.message : 'Não foi possível exportar as configurações de notificações.');
                    }
                }}
            />
            {editForm ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
                    <div className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
                        <MaintenanceModalHeader
                            title={`Editar ${editForm.person.name}`}
                            eyebrow="Notificações • Usuário"
                            description={editForm.person.sourceLabel}
                            tenantId={tenantId}
                            schoolName={tenantBranding?.schoolName}
                            logoUrl={tenantBranding?.logoUrl}
                            onClose={() => setEditForm(null)}
                        />
                        <div className="border-b border-slate-200 bg-slate-50 px-6 pt-4">
                            <div className="flex gap-2" role="tablist" aria-label="Abas de configuração de notificações">
                                {([
                                    ['PRINCIPAL', 'Principal'],
                                    ['EVENTOS', 'Eventos individuais'],
                                ] as const).map(([tab, label]) => (
                                    <button
                                        key={tab}
                                        type="button"
                                        role="tab"
                                        aria-selected={editModalTab === tab}
                                        onClick={() => setEditModalTab(tab)}
                                        className={`rounded-t-xl border border-b-0 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] transition ${editModalTab === tab
                                            ? 'border-slate-200 bg-white text-blue-700'
                                            : 'border-transparent bg-transparent text-slate-500 hover:bg-white/70 hover:text-slate-700'}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="max-h-[calc(92vh-222px)] overflow-y-auto p-6">
                            {editModalTab === 'PRINCIPAL' ? (
                                <div className="space-y-4">
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
                            ) : (
                                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Eventos individuais</div>
                                            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">Marque os tipos de inativação ou cancelamento que esta pessoa deverá receber e escolha os canais.</p>
                                        </div>
                                        {loadingPreferences ? <span className="text-xs font-black uppercase tracking-[0.12em] text-blue-600">Carregando...</span> : null}
                                    </div>
                                    <div className={`mt-4 grid grid-cols-1 gap-2 ${telegramConfigured ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                                        {bulkPreferenceOptions.map(([kind, label, checked]) => (
                                            <label key={kind} className="flex min-h-[42px] items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-blue-800 shadow-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    disabled={loadingPreferences || editForm.preferences.length === 0}
                                                    onChange={(event) => updateAllEventPreferences(kind, event.target.checked)}
                                                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600"
                                                />
                                                {label}
                                            </label>
                                        ))}
                                    </div>
                                    {!loadingPreferences && editForm.preferences.length === 0 ? (
                                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-amber-700">
                                            Nenhum evento disponível para configuração.
                                        </div>
                                    ) : null}
                                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                        {editForm.preferences.map((preference, preferenceIndex) => (
                                            <div key={preference.eventType} className={`rounded-xl border p-3 shadow-sm ${EVENT_CARD_TONES[preferenceIndex % EVENT_CARD_TONES.length]}`}>
                                                <label className="flex min-h-[54px] items-start gap-3 text-xs font-black uppercase tracking-[0.08em] text-slate-700">
                                                    <input
                                                        type="checkbox"
                                                        checked={preference.enabled}
                                                        onChange={(event) => setEditForm((current) => current ? {
                                                            ...current,
                                                            preferences: current.preferences.map((item) => {
                                                                if (item.eventType !== preference.eventType) return item;
                                                                return event.target.checked
                                                                    ? { ...item, enabled: true }
                                                                    : {
                                                                        ...item,
                                                                        enabled: false,
                                                                        sendInternal: false,
                                                                        sendEmail: false,
                                                                        sendTelegram: false,
                                                                    };
                                                            }),
                                                        } : current)}
                                                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600"
                                                    />
                                                    <span>{preference.label}</span>
                                                </label>
                                                <div className="mt-3 space-y-2">
                                                    {eventChannelOptions.map(([field, label]) => (
                                                        <label key={field} className="flex items-center gap-2 rounded-lg border border-white/80 bg-white/70 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">
                                                            <input
                                                                type="checkbox"
                                                                checked={preference[field]}
                                                                disabled={!preference.enabled}
                                                                onChange={(event) => setEditForm((current) => current ? { ...current, preferences: current.preferences.map((item) => item.eventType === preference.eventType ? { ...item, [field]: event.target.checked } : item) } : current)}
                                                                className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-blue-600"
                                                            />
                                                            {label}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <MaintenanceModalFooter
                            screenId="PRINCIPAL_NOTIFICACOES_CONFIGURAR_USUARIOS_MODAL_EDITAR"
                            isSaving={savingEdit}
                            onSave={() => void saveEditForm()}
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}
