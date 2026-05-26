'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import GridColumnConfigModal from '@/app/components/grid-column-config-modal';
import GridExportModal from '@/app/components/grid-export-modal';
import GridFooterControls from '@/app/components/grid-footer-controls';
import RecordStatusIndicator from '@/app/components/record-status-indicator';
import GridRecordPopover from '@/app/components/grid-record-popover';
import GridRowActionIconButton from '@/app/components/grid-row-action-icon-button';
import StatusConfirmationModal from '@/app/components/status-confirmation-modal';
import { type GridStatusFilterValue } from '@/app/components/grid-status-filter';
import GridSortableHeader from '@/app/components/grid-sortable-header';
import PrincipalProgramHeader from '@/app/components/principal-program-header';
import { TenantBranchSelect } from '@/app/components/tenant-branch-select';
import { fetchTenantBranches, getDashboardAuthContext, hasDashboardPermission, type TenantBranchSummary } from '@/app/lib/dashboard-crud-utils';
import { getAllGridColumnKeys, getDefaultVisibleGridColumnKeys, loadGridColumnConfig, type ConfigurableGridColumn, writeGridColumnConfig } from '@/app/lib/grid-column-config-utils';
import { buildDefaultExportColumns, buildExportColumnsFromGridColumns, exportGridRows, sortGridRows, type GridColumnDefinition, type GridSortState } from '@/app/lib/grid-export-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import { dispatchScreenAuditContext, formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const GRADE_SCREEN_ID = 'PRINCIPAL_GRADE';
const GRADE_STATUS_MODAL_SCREEN_ID = 'PRINCIPAL_GRADE_STATUS_MODAL';
const PERIOD_OPTIONS = [
    { value: 'MANHA', label: 'Manhã' },
    { value: 'TARDE', label: 'Tarde' },
    { value: 'NOITE', label: 'Noite' },
] as const;

type PeriodValue = (typeof PERIOD_OPTIONS)[number]['value'];

type ScheduleRecord = {
    id: string;
    branchCode?: number | null;
    period: PeriodValue;
    lessonNumber: number;
    startTime: string;
    endTime: string;
    canceledAt?: string | null;
};

type ScheduleFormState = {
    branchCode: number;
    period: PeriodValue;
    lessonNumber: string;
    startTime: string;
    endTime: string;
};

const EMPTY_FORM: ScheduleFormState = {
    branchCode: 1,
    period: 'MANHA',
    lessonNumber: '',
    startTime: '',
    endTime: '',
};

const getPeriodLabel = (period: string) => PERIOD_OPTIONS.find((item) => item.value === period)?.label || period;
const getScheduleDescription = (lessonNumber: number) => (lessonNumber === 0 ? 'Intervalo' : `${lessonNumber}ª aula`);
const getApiErrorMessage = (payload: unknown, fallback: string) => {
    if (payload && typeof payload === 'object' && 'message' in payload) {
        const message = (payload as { message?: unknown }).message;
        if (Array.isArray(message)) {
            return message
                .map((item) => String(item || '').trim())
                .filter(Boolean)
                .join(' ');
        }
        if (typeof message === 'string' && message.trim()) {
            return message;
        }
    }

    return fallback;
};

type ScheduleColumnKey = 'period' | 'lessonNumber' | 'description' | 'startTime' | 'endTime' | 'recordStatus';
type ScheduleExportColumnKey = ScheduleColumnKey;

const SCHEDULE_COLUMNS: ConfigurableGridColumn<ScheduleRecord, ScheduleColumnKey>[] = [
    { key: 'period', label: 'Período', getValue: (row) => getPeriodLabel(row.period) },
    {
        key: 'lessonNumber',
        label: 'Nº da aula',
        getValue: (row) => String(row.lessonNumber),
        getSortValue: (row) => row.lessonNumber,
        visibleByDefault: false,
    },
    {
        key: 'description',
        label: 'Descrição',
        getValue: (row) => getScheduleDescription(row.lessonNumber),
        getSortValue: (row) => row.lessonNumber,
    },
    { key: 'startTime', label: 'Horário inicial', getValue: (row) => row.startTime || '---' },
    { key: 'endTime', label: 'Horário final', getValue: (row) => row.endTime || '---' },
    { key: 'recordStatus', label: 'Status do cadastro', getValue: (row) => row.canceledAt ? 'INATIVO' : 'ATIVO', visibleByDefault: false },
];
const SCHEDULE_EXPORT_COLUMNS: GridColumnDefinition<ScheduleRecord, ScheduleExportColumnKey>[] = buildExportColumnsFromGridColumns(
    SCHEDULE_COLUMNS,
);
const SCHEDULE_COLUMN_KEYS = getAllGridColumnKeys(SCHEDULE_COLUMNS);
const DEFAULT_VISIBLE_SCHEDULE_COLUMNS = getDefaultVisibleGridColumnKeys(SCHEDULE_COLUMNS);

function getScheduleGridConfigStorageKey(tenantId: string | null) {
    return `dashboard:horarios-aulas:grid-config:${tenantId || 'default'}`;
}

function getScheduleExportConfigStorageKey(tenantId: string | null) {
    return `dashboard:horarios-aulas:export-config:${tenantId || 'default'}`;
}

const DEFAULT_SORT: GridSortState<ScheduleColumnKey> = {
    column: 'period',
    direction: 'asc',
};

type GradeAuditParams = {
    tenantId: string | null;
    tenantName?: string | null;
    searchTerm: string;
    statusFilter: GridStatusFilterValue;
    displayedRowsCount: number;
    sortColumn: ScheduleColumnKey;
    sortDirection: 'asc' | 'desc';
};

function getGradeAuditOrderBy(column: ScheduleColumnKey) {
    const orderColumns: Record<ScheduleColumnKey, string> = {
        period: 'S.period',
        lessonNumber: 'S.lessonNumber',
        description: 'S.lessonNumber',
        startTime: 'S.startTime',
        endTime: 'S.endTime',
        recordStatus: 'S.canceledAt',
    };

    return orderColumns[column] || 'S.period';
}

function buildGradeAuditSql(params: GradeAuditParams) {
    const searchTerm = params.searchTerm.trim().toUpperCase();
    const statusFilter = String(params.statusFilter || 'ACTIVE').toUpperCase();
    const sortDirection = params.sortDirection === 'desc' ? 'DESC' : 'ASC';

    return `-- PARAMETROS ATUAIS DO GRID
-- :schoolId = ${toSqlLiteral(params.tenantId || '')}
-- :searchTerm = ${toSqlLiteral(searchTerm)}
-- :statusFilter = ${toSqlLiteral(statusFilter)}

SELECT S.*
FROM schedules S
WHERE S.tenantId = ${toSqlLiteral(params.tenantId || '')}
  AND (
    ${toSqlLiteral(searchTerm)} = ''
    OR UPPER(COALESCE(S.period, '')) LIKE '%' || UPPER(${toSqlLiteral(searchTerm)}) || '%'
    OR UPPER(CAST(S.lessonNumber AS TEXT)) LIKE '%' || UPPER(${toSqlLiteral(searchTerm)}) || '%'
    OR UPPER(COALESCE(S.startTime, '')) LIKE '%' || UPPER(${toSqlLiteral(searchTerm)}) || '%'
    OR UPPER(COALESCE(S.endTime, '')) LIKE '%' || UPPER(${toSqlLiteral(searchTerm)}) || '%'
  )
  AND (
    ${toSqlLiteral(statusFilter)} = 'ALL'
    OR (${toSqlLiteral(statusFilter)} = 'ACTIVE' AND S.canceledAt IS NULL)
    OR (${toSqlLiteral(statusFilter)} = 'INACTIVE' AND S.canceledAt IS NOT NULL)
  )
ORDER BY ${getGradeAuditOrderBy(params.sortColumn)} ${sortDirection};`;
}

function buildGradeAuditText(params: GradeAuditParams) {
    const searchTerm = params.searchTerm.trim().toUpperCase();
    const statusFilter = String(params.statusFilter || 'ACTIVE').toUpperCase();
    const sortDirection = params.sortDirection === 'desc' ? 'DESC' : 'ASC';

    return `--- LOGICA DA TELA ---
Tela de grid/listagem administrativa para manutencao dos horarios base das aulas.

TABELAS PRINCIPAIS:
- schedules (S) - cadastro dos horarios base por periodo/aula

RELACIONAMENTOS:
- Nao ha relacionamento obrigatorio para a listagem principal.

FILTROS APLICADOS AGORA:
- escola/tenant atual (:schoolId): ${formatTenantAuditValue(params.tenantId, params.tenantName)}
- busca digitada (:searchTerm): ${formatAuditValue(searchTerm)}
- status selecionado (:statusFilter): ${statusFilter}
- registros exibidos apos os filtros: ${params.displayedRowsCount}
- ordenacao atual: ${getGradeAuditOrderBy(params.sortColumn)} ${sortDirection}

OBSERVACAO SOBRE O FILTRO DA EMPRESA / ESCOLA:
- S.tenantId e a coluna usada para isolar os dados da empresa / escola
- :schoolId acima ja esta preenchido com o tenantId real da escola logada
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

export default function GradeHorariaPage() {
    const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
    const [formData, setFormData] = useState<ScheduleFormState>(EMPTY_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [successStatus, setSuccessStatus] = useState<string | null>(null);
    const [saveSuccessPopup, setSaveSuccessPopup] = useState<{ title: string; message: string } | null>(null);
    const [isExitConfirmationOpen, setIsExitConfirmationOpen] = useState(false);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [sortState, setSortState] = useState<GridSortState<ScheduleColumnKey>>(DEFAULT_SORT);
    const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
    const [isGridConfigOpen, setIsGridConfigOpen] = useState(false);
    const [isGridConfigReady, setIsGridConfigReady] = useState(false);
    const [columnOrder, setColumnOrder] = useState<ScheduleColumnKey[]>(SCHEDULE_COLUMN_KEYS);
    const [hiddenColumns, setHiddenColumns] = useState<ScheduleColumnKey[]>(
        SCHEDULE_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_SCHEDULE_COLUMNS.includes(key)),
    );
    const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFormat, setExportFormat] = useState<'excel' | 'csv' | 'pdf' | 'json' | 'txt'>('excel');
    const [exportColumns, setExportColumns] = useState<Record<ScheduleExportColumnKey, boolean>>(buildDefaultExportColumns(SCHEDULE_EXPORT_COLUMNS));
    const [scheduleStatusToggleTarget, setScheduleStatusToggleTarget] = useState<ScheduleRecord | null>(null);
    const [scheduleStatusToggleAction, setScheduleStatusToggleAction] = useState<'activate' | 'deactivate' | null>(null);
    const [isProcessingScheduleToggle, setIsProcessingScheduleToggle] = useState(false);
    const [currentBranchCode, setCurrentBranchCode] = useState(1);
    const [tenantBranches, setTenantBranches] = useState<TenantBranchSummary[]>([]);

    const canView = hasDashboardPermission(currentRole, currentPermissions, 'VIEW_SCHEDULES');
    const canManage = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_SCHEDULES');
    const orderedScheduleColumns = useMemo(
        () => columnOrder.map((key) => SCHEDULE_COLUMNS.find((column) => column.key === key)).filter((column): column is ConfigurableGridColumn<ScheduleRecord, ScheduleColumnKey> => !!column),
        [columnOrder],
    );
    const visibleScheduleColumns = useMemo(
        () => orderedScheduleColumns.filter((column) => !hiddenColumns.includes(column.key)),
        [hiddenColumns, orderedScheduleColumns],
    );
    const filteredSchedules = useMemo(() => {
        const term = searchTerm.trim().toUpperCase();
        return schedules.filter((item) => {
            const isActive = !item.canceledAt;
            const matchesStatus =
                statusFilter === 'ALL'
                    ? true
                    : statusFilter === 'ACTIVE'
                        ? isActive
                        : !isActive;
            const matchesSearch =
                !term ||
                [getPeriodLabel(item.period), getScheduleDescription(item.lessonNumber), `${item.lessonNumber}`, item.startTime, item.endTime]
                    .some((value) => String(value || '').toUpperCase().includes(term));
            return matchesStatus && matchesSearch;
        });
    }, [schedules, searchTerm, statusFilter]);
    const sortedFilteredSchedules = useMemo(
        () => sortGridRows(filteredSchedules, SCHEDULE_COLUMNS, sortState),
        [filteredSchedules, sortState],
    );
    const tenantBranding = useMemo(() => readCachedTenantBranding(currentTenantId), [currentTenantId]);
    const gradeAuditContext = useMemo(() => {
        const auditParams: GradeAuditParams = {
            tenantId: currentTenantId,
            tenantName: tenantBranding?.schoolName,
            searchTerm,
            statusFilter,
            displayedRowsCount: sortedFilteredSchedules.length,
            sortColumn: sortState.column,
            sortDirection: sortState.direction,
        };

        return {
            auditText: buildGradeAuditText(auditParams),
            sqlText: buildGradeAuditSql(auditParams),
        };
    }, [currentTenantId, searchTerm, sortState.column, sortState.direction, sortedFilteredSchedules.length, statusFilter, tenantBranding?.schoolName]);

    useEffect(() => {
        dispatchScreenAuditContext({
            screenId: GRADE_SCREEN_ID,
            auditText: gradeAuditContext.auditText,
            sqlText: gradeAuditContext.sqlText,
        });
    }, [gradeAuditContext]);

    const loadSchedules = async () => {
        try {
            setIsLoading(true);
            setErrorStatus(null);

            const { token, role, permissions, tenantId, branchCode } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            setCurrentRole(role);
            setCurrentPermissions(permissions);
            setCurrentTenantId(tenantId);
            setCurrentBranchCode(branchCode);

            const [response, branches] = await Promise.all([
                fetch(`${API_BASE_URL}/schedules`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetchTenantBranches().catch(() => []),
            ]);
            const data = await response.json().catch(() => null);

            if (!response.ok) throw new Error(getApiErrorMessage(data, 'Não foi possível carregar os horários.'));

            setSchedules(Array.isArray(data) ? data : []);
            setTenantBranches(branches);
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível carregar os horários.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { void loadSchedules(); }, []);

    useEffect(() => {
        let isMounted = true;
        setIsGridConfigReady(false);
        void loadGridColumnConfig(getScheduleGridConfigStorageKey(currentTenantId), SCHEDULE_COLUMN_KEYS, DEFAULT_VISIBLE_SCHEDULE_COLUMNS).then((config) => {
            if (!isMounted) return;
            setColumnOrder(config.order);
            setHiddenColumns(config.hidden);
            setIsGridConfigReady(true);
        });
        return () => {
            isMounted = false;
        };
    }, [currentTenantId]);

    useEffect(() => {
        if (!isGridConfigReady) return;
        writeGridColumnConfig(getScheduleGridConfigStorageKey(currentTenantId), SCHEDULE_COLUMN_KEYS, columnOrder, hiddenColumns);
    }, [columnOrder, currentTenantId, hiddenColumns, isGridConfigReady]);

    if (!isLoading && !canView) {
        return (
            <DashboardAccessDenied
                title="Acesso restrito aos horários das aulas"
                message="Seu perfil não possui permissão para consultar os horários base cadastrados nesta escola."
            />
        );
    }

    const resetForm = () => {
        setEditingId(null);
        setFormData({ ...EMPTY_FORM, branchCode: currentBranchCode });
    };

    const openCreateModal = () => {
        resetForm();
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        resetForm();
    };

    const requestCloseModal = () => {
        setIsExitConfirmationOpen(true);
    };

    const confirmExitModal = () => {
        setIsExitConfirmationOpen(false);
        closeModal();
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();

        try {
            setIsSaving(true);
            setErrorStatus(null);
            setSuccessStatus(null);

            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');
            if (formData.lessonNumber === '') throw new Error('Informe o número da aula ou 0 para intervalo.');

            const response = await fetch(editingId ? `${API_BASE_URL}/schedules/${editingId}` : `${API_BASE_URL}/schedules`, {
                method: editingId ? 'PATCH' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    period: formData.period,
                    branchCode: tenantBranches.length <= 1 ? currentBranchCode : formData.branchCode,
                    lessonNumber: Number(formData.lessonNumber),
                    startTime: formData.startTime,
                    endTime: formData.endTime,
                }),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(getApiErrorMessage(data, 'Não foi possível salvar o horário.'));

            const wasEditing = Boolean(editingId);
            closeModal();
            await loadSchedules();
            setSaveSuccessPopup({
                title: wasEditing ? 'Horário salvo com sucesso' : 'Horário inserido com sucesso',
                message: wasEditing ? 'O horário foi alterado e a lista já foi atualizada.' : 'O horário foi inserido e a lista já foi atualizada.',
            });
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível salvar o horário.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleEdit = (schedule: ScheduleRecord) => {
        setEditingId(schedule.id);
        setFormData({
            branchCode: typeof schedule.branchCode === 'number' ? schedule.branchCode : currentBranchCode,
            period: schedule.period,
            lessonNumber: String(schedule.lessonNumber),
            startTime: schedule.startTime,
            endTime: schedule.endTime,
        });
        setIsModalOpen(true);
    };

    const openScheduleStatusModal = (schedule: ScheduleRecord) => {
        setScheduleStatusToggleTarget(schedule);
        setScheduleStatusToggleAction(schedule.canceledAt ? 'activate' : 'deactivate');
    };

    const closeScheduleStatusModal = (force = false) => {
        if (!force && isProcessingScheduleToggle) return;
        setScheduleStatusToggleTarget(null);
        setScheduleStatusToggleAction(null);
    };

    const confirmScheduleStatusToggle = async () => {
        if (!scheduleStatusToggleTarget || !scheduleStatusToggleAction) return;
        const willActivate = scheduleStatusToggleAction === 'activate';

        try {
            setIsProcessingScheduleToggle(true);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const response = await fetch(`${API_BASE_URL}/schedules/${scheduleStatusToggleTarget.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ active: willActivate }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) throw new Error(getApiErrorMessage(data, willActivate ? 'Não foi possível ativar o horário.' : 'Não foi possível inativar o horário.'));

            setSuccessStatus(data?.message || (willActivate ? 'Horário ativado com sucesso.' : 'Horário inativado com sucesso.'));
            await loadSchedules();
            closeScheduleStatusModal(true);
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : (willActivate ? 'Não foi possível ativar o horário.' : 'Não foi possível inativar o horário.'));
        } finally {
            setIsProcessingScheduleToggle(false);
        }
    };

    const toggleSort = (column: ScheduleColumnKey) => {
        setSortState((current) => ({
            column,
            direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const toggleExportColumn = (column: ScheduleExportColumnKey) => {
        setExportColumns((current) => ({ ...current, [column]: !current[column] }));
    };

    const renderScheduleInfoButton = (schedule: ScheduleRecord) => (
        <GridRecordPopover
            title={`${getScheduleDescription(schedule.lessonNumber)} - ${getPeriodLabel(schedule.period)}`}
            subtitle={`${schedule.startTime} até ${schedule.endTime}`}
            buttonLabel={`Ver detalhes do horário ${getScheduleDescription(schedule.lessonNumber)}`}
            badges={[
                schedule.canceledAt ? 'INATIVO' : 'ATIVO',
                getPeriodLabel(schedule.period),
                schedule.lessonNumber === 0 ? 'INTERVALO' : `${schedule.lessonNumber}ª AULA`,
            ]}
            sections={[
                {
                    title: 'Horário base',
                    items: [
                        { label: 'Período', value: getPeriodLabel(schedule.period) },
                        { label: 'Número da aula', value: String(schedule.lessonNumber) },
                        { label: 'Descrição', value: getScheduleDescription(schedule.lessonNumber) },
                        { label: 'Faixa de horário', value: `${schedule.startTime} até ${schedule.endTime}` },
                        { label: 'Status', value: schedule.canceledAt ? 'INATIVO' : 'ATIVO' },
                        { label: 'Resumo', value: `${getPeriodLabel(schedule.period)} - ${getScheduleDescription(schedule.lessonNumber)}` },
                    ],
                },
            ]}
            contextLabel="PRINCIPAL_GRADE_POPUP"
        />
    );

    const setAllExportColumns = (value: boolean) => {
        setExportColumns(
            SCHEDULE_EXPORT_COLUMNS.reduce<Record<ScheduleExportColumnKey, boolean>>((accumulator, column) => {
                accumulator[column.key] = value;
                return accumulator;
            }, {} as Record<ScheduleExportColumnKey, boolean>),
        );
    };

    const toggleGridColumnVisibility = (columnKey: ScheduleColumnKey) => {
        const isHidden = hiddenColumns.includes(columnKey);
        const visibleCount = SCHEDULE_COLUMN_KEYS.length - hiddenColumns.length;
        if (!isHidden && visibleCount === 1) {
            setErrorStatus('Pelo menos uma coluna precisa continuar visível no grid.');
            return;
        }
        setHiddenColumns((current) => isHidden ? current.filter((item) => item !== columnKey) : [...current, columnKey]);
    };

    const moveGridColumn = (columnKey: ScheduleColumnKey, direction: 'up' | 'down') => {
        setColumnOrder((current) => {
            const currentIndex = current.indexOf(columnKey);
            if (currentIndex === -1) return current;
            const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (nextIndex < 0 || nextIndex >= current.length) return current;
            const nextOrder = [...current];
            const [removed] = nextOrder.splice(currentIndex, 1);
            nextOrder.splice(nextIndex, 0, removed);
            return nextOrder;
        });
    };

    const resetGridColumns = () => {
        setColumnOrder(SCHEDULE_COLUMN_KEYS);
        setHiddenColumns(SCHEDULE_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_SCHEDULE_COLUMNS.includes(key)));
    };

    const renderScheduleGridCell = (schedule: ScheduleRecord, columnKey: ScheduleColumnKey) => {
        const tone = schedule.canceledAt ? 'text-rose-700' : 'text-slate-600';
        if (columnKey === 'period') return <td key={columnKey} className={`px-6 py-4 font-semibold ${schedule.canceledAt ? 'text-rose-800' : 'text-slate-800'}`}>{getPeriodLabel(schedule.period)}</td>;
        if (columnKey === 'lessonNumber') return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${tone}`}>{schedule.lessonNumber}</td>;
        if (columnKey === 'description') {
            return (
                <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${tone}`}>
                    <div className="flex items-center gap-2">
                        <span>{getScheduleDescription(schedule.lessonNumber)}</span>
                        <RecordStatusIndicator active={!schedule.canceledAt} />
                    </div>
                </td>
            );
        }
        if (columnKey === 'startTime') return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${tone}`}>{schedule.startTime || '---'}</td>;
        if (columnKey === 'recordStatus') {
            return (
                <td key={columnKey} className="px-6 py-4 text-center">
                    <RecordStatusIndicator active={!schedule.canceledAt} />
                </td>
            );
        }
        return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${tone}`}>{schedule.endTime || '---'}</td>;
    };

    return (
        <div className="w-full space-y-8">
            <PrincipalProgramHeader
                eyebrow="Central acadêmica"
                title="Horário das aulas"
                description="Cadastre os horários-base da escola por período."
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

            {errorStatus ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorStatus}</div> : null}
            {successStatus ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{successStatus}</div> : null}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="dashboard-band border-b px-6 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                        {canManage ? (
                            <button
                                type="button"
                                onClick={openCreateModal}
                                title="Cadastrar novo horário"
                                aria-label="Cadastrar novo horário"
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-500 active:scale-95"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                        ) : null}
                        <div className="relative w-full max-w-xs">
                            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar horário..." className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="dashboard-table-head border-b border-slate-300 text-[13px] font-bold uppercase tracking-wider">
                                {visibleScheduleColumns.map((column) => (
                                    <th key={column.key} className="px-6 py-4">
                                        <GridSortableHeader
                                            label={column.label}
                                            isActive={sortState.column === column.key}
                                            direction={sortState.direction}
                                            onClick={() => toggleSort(column.key)}
                                        />
                                    </th>
                                ))}
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? <tr><td colSpan={visibleScheduleColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">Carregando horários...</td></tr> : null}
                            {!isLoading && sortedFilteredSchedules.length === 0 ? <tr><td colSpan={visibleScheduleColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">Nenhum horário cadastrado.</td></tr> : null}
                            {!isLoading && sortedFilteredSchedules.map((schedule) => (
                                <tr key={schedule.id} className={schedule.canceledAt ? 'bg-rose-50/40 hover:bg-rose-50' : 'hover:bg-slate-50'}>
                                    {visibleScheduleColumns.map((column) => renderScheduleGridCell(schedule, column.key))}
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {renderScheduleInfoButton(schedule)}
                                            <GridRowActionIconButton title="Editar horário" onClick={() => handleEdit(schedule)} tone="blue">
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </GridRowActionIconButton>
                                            <GridRowActionIconButton title={schedule.canceledAt ? 'Ativar horário' : 'Inativar horário'} onClick={() => openScheduleStatusModal(schedule)} tone={schedule.canceledAt ? 'emerald' : 'rose'}>
                                                {schedule.canceledAt ? (
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                ) : (
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728M6 6l12 12" />
                                                    </svg>
                                                )}
                                            </GridRowActionIconButton>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <GridFooterControls
                    key={`schedule-footer-${sortedFilteredSchedules.length}`}
                    recordsCount={Number(sortedFilteredSchedules.length)}
                    onOpenColumns={() => setIsGridConfigOpen(true)}
                    onOpenExport={() => setIsExportModalOpen(true)}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    activeLabel="Mostrar somente horários ativos"
                    allLabel="Mostrar horários ativos e inativos"
                    inactiveLabel="Mostrar somente horários inativos"
                />
            </section>

            <GridColumnConfigModal
                isOpen={isGridConfigOpen}
                title="Configurar colunas do grid"
                description="Reordene, oculte ou inclua colunas do cadastro de horários das aulas nesta tela."
                columns={orderedScheduleColumns.map((column) => ({ key: column.key, label: column.label, visibleByDefault: column.visibleByDefault }))}
                orderedColumns={columnOrder}
                hiddenColumns={hiddenColumns}
                onToggleColumnVisibility={toggleGridColumnVisibility}
                onMoveColumn={moveGridColumn}
                onReset={resetGridColumns}
                onClose={() => setIsGridConfigOpen(false)}
            />

            <StatusConfirmationModal
                isOpen={Boolean(scheduleStatusToggleTarget && scheduleStatusToggleAction)}
                tenantId={currentTenantId}
                actionType={scheduleStatusToggleAction || 'activate'}
                title={scheduleStatusToggleAction === 'activate' ? 'Ativar horário' : 'Inativar horário'}
                itemLabel="Horário"
                itemName={scheduleStatusToggleTarget ? `${getScheduleDescription(scheduleStatusToggleTarget.lessonNumber)} - ${getPeriodLabel(scheduleStatusToggleTarget.period)}` : ''}
                description={scheduleStatusToggleAction === 'activate'
                    ? 'Ao ativar este horário, ele volta a constar na grade e pode receber disciplinas e professores novamente.'
                    : 'Ao inativar este horário, ele é marcado como indisponível, mas o histórico permanece disponível.'}
                confirmLabel={scheduleStatusToggleAction === 'activate' ? 'Confirmar ativação' : 'Confirmar inativação'}
                onCancel={() => closeScheduleStatusModal(true)}
                onConfirm={confirmScheduleStatusToggle}
                isProcessing={isProcessingScheduleToggle}
                statusActive={!scheduleStatusToggleTarget?.canceledAt}
                screenId={GRADE_STATUS_MODAL_SCREEN_ID}
            />

            <GridExportModal
                isOpen={isExportModalOpen}
                title="Exportar horários das aulas"
                description={`A exportação respeita a busca atual e inclui ${sortedFilteredSchedules.length} registro(s).`}
                format={exportFormat}
                onFormatChange={setExportFormat}
                columns={SCHEDULE_EXPORT_COLUMNS.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={exportColumns}
                onToggleColumn={toggleExportColumn}
                onSelectAll={setAllExportColumns}
                storageKey={getScheduleExportConfigStorageKey(currentTenantId)}
                onClose={() => setIsExportModalOpen(false)}
                onExport={async (config) => {
                    try {
                        await exportGridRows({
                            rows: sortedFilteredSchedules,
                            columns: config?.orderedColumns
                                ? config.orderedColumns
                                    .map((key) => SCHEDULE_EXPORT_COLUMNS.find((column) => column.key === key))
                                    .filter((column): column is GridColumnDefinition<ScheduleRecord, ScheduleExportColumnKey> => !!column)
                                : SCHEDULE_EXPORT_COLUMNS,
                            selectedColumns: config?.selectedColumns || exportColumns,
                            format: exportFormat,
                            pdfOptions: config?.pdfOptions,
                            fileBaseName: 'horarios-aulas',
                            branding: {
                                title: 'Horário das aulas',
                                subtitle: 'Exportação com os filtros atualmente aplicados.',
                            },
                        });
                        setSuccessStatus(`Exportação ${exportFormat.toUpperCase()} preparada com ${sortedFilteredSchedules.length} registro(s).`);
                        setIsExportModalOpen(false);
                    } catch (error) {
                        setErrorStatus(error instanceof Error ? error.message : 'Não foi possível exportar os horários.');
                    }
                }}
            />

            {isModalOpen ? (
                <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div className="flex min-w-0 items-center gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                    {tenantBranding?.logoUrl ? (
                                        <img src={tenantBranding.logoUrl} alt={tenantBranding.schoolName || 'Escola'} className="h-full w-full object-contain" />
                                    ) : (
                                        <span className="text-sm font-black tracking-[0.25em] text-[#153a6a]">
                                            {String(tenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-blue-600">
                                        {tenantBranding?.schoolName || 'Escola'}
                                    </div>
                                    <h2 className="truncate text-xl font-bold text-[#153a6a]">{editingId ? 'Editar horário' : 'Novo horário'}</h2>
                                </div>
                            </div>
                            <button onClick={requestCloseModal} className="text-slate-400 hover:text-red-500">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                                <TenantBranchSelect
                                    branches={tenantBranches}
                                    value={formData.branchCode}
                                    onChange={(branchCode) => setFormData((current) => ({ ...current, branchCode }))}
                                    labelClassName="text-xs font-bold text-slate-600 mb-1 block"
                                    selectClassName="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                                />
                                <select value={formData.period} onChange={(event) => setFormData((current) => ({ ...current, period: event.target.value as PeriodValue }))} className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20">
                                    {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                                <input
                                    value={formData.lessonNumber}
                                    onChange={(event) => {
                                        const nextLessonNumber = event.target.value.replace(/\D/g, '');
                                        setFormData((current) => ({
                                            ...current,
                                            lessonNumber: nextLessonNumber,
                                            startTime: nextLessonNumber === '0' ? '' : current.startTime,
                                            endTime: nextLessonNumber === '0' ? '' : current.endTime,
                                        }));
                                    }}
                                    placeholder="1ª aula ou 0"
                                    className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                                />
                                <input type="time" value={formData.startTime} onChange={(event) => setFormData((current) => ({ ...current, startTime: event.target.value }))} className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20" />
                                <input type="time" value={formData.endTime} onChange={(event) => setFormData((current) => ({ ...current, endTime: event.target.value }))} className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20" />
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                                <button type="button" onClick={requestCloseModal} className="rounded-xl border border-rose-200 bg-rose-50 px-6 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100">Sair sem Gravar</button>
                                <button type="submit" disabled={!canManage || isSaving} className="rounded-xl bg-green-600 px-8 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300">{isSaving ? 'Salvando...' : editingId ? 'Salvar edição' : 'Cadastrar horário'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {isExitConfirmationOpen ? (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-2xl animate-in zoom-in-95">
                        <div className="border-b border-rose-100 bg-rose-50 px-6 py-5">
                            <div className="flex items-start gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm">
                                    {tenantBranding?.logoUrl ? (
                                        <img src={tenantBranding.logoUrl} alt={tenantBranding.schoolName || 'Escola'} className="h-full w-full object-contain" />
                                    ) : (
                                        <span className="text-sm font-black tracking-[0.25em] text-[#153a6a]">
                                            {String(tenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-700">SAIR SEM GRAVAR</div>
                                    <h3 className="mt-1 text-xl font-bold text-slate-900">Deseja sair deste cadastro?</h3>
                                    <p className="mt-2 text-sm font-medium text-slate-600">As alterações ainda não gravadas serão descartadas.</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap justify-between gap-3 px-6 py-4">
                            <button
                                type="button"
                                onClick={() => setIsExitConfirmationOpen(false)}
                                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                            >
                                Continuar editando
                            </button>
                            <button
                                type="button"
                                onClick={confirmExitModal}
                                className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                            >
                                Sair sem Gravar
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {saveSuccessPopup ? (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl animate-in zoom-in-95">
                        <div className="border-b border-emerald-100 bg-emerald-50 px-6 py-5">
                            <div className="flex items-start gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
                                    {tenantBranding?.logoUrl ? (
                                        <img src={tenantBranding.logoUrl} alt={tenantBranding.schoolName || 'Escola'} className="h-full w-full object-contain" />
                                    ) : (
                                        <span className="text-sm font-black tracking-[0.25em] text-[#153a6a]">
                                            {String(tenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">SUCESSO</div>
                                    <h3 className="mt-1 text-xl font-bold text-slate-900">{saveSuccessPopup.title}</h3>
                                    <p className="mt-2 text-sm font-medium text-slate-600">{saveSuccessPopup.message}</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end px-6 py-4">
                            <button
                                type="button"
                                onClick={() => setSaveSuccessPopup(null)}
                                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
                            >
                                Voltar para lista
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

