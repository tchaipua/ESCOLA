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
import { getStoredToken } from '@/app/lib/auth-storage';
import { getDashboardAuthContext, hasAllDashboardPermissions, hasDashboardPermission } from '@/app/lib/dashboard-crud-utils';
import {
    buildGridAggregateSummaries,
    getAllGridColumnKeys,
    getDefaultVisibleGridColumnKeys,
    loadGridColumnConfig,
    type ConfigurableGridColumn,
    type GridColumnAggregations,
    writeGridColumnConfig,
} from '@/app/lib/grid-column-config-utils';
import { buildDefaultExportColumns, buildExportColumnsFromGridColumns, exportGridRows, sortGridRows, type GridColumnDefinition, type GridSortState } from '@/app/lib/grid-export-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const API_BASE_URL = 'http://localhost:3001/api/v1';
const SHIFT_OPTIONS = [
    { value: 'MANHA', label: 'Manhã' },
    { value: 'TARDE', label: 'Tarde' },
    { value: 'NOITE', label: 'Noite' },
] as const;

type ShiftValue = (typeof SHIFT_OPTIONS)[number]['value'];

type SeriesRecord = {
    id: string;
    name: string;
    canceledAt?: string | null;
    code?: string | null;
};

type ClassRecord = {
    id: string;
    name: string;
    shift: string;
    defaultMonthlyFee?: number | null;
    canceledAt?: string | null;
};

type SeriesClassRecord = {
    id: string;
    seriesId: string;
    classId: string;
    canceledAt?: string | null;
    series?: SeriesRecord | null;
    class?: ClassRecord | null;
    _count?: { enrollments?: number };
    studentCount?: number | null;
    totalMonthlyFee?: number | null;
    enrollments?: Array<{
        id: string;
        studentId: string;
        student?: {
            id: string;
            name: string;
            monthlyFee?: number | null;
        } | null;
    }>;
};

type FormData = {
    seriesId: string;
    name: string;
    shifts: ShiftValue[];
    defaultMonthlyFee: string;
};

const EMPTY_FORM: FormData = {
    seriesId: '',
    name: '',
    shifts: [],
    defaultMonthlyFee: '',
};

const normalizeShifts = (shifts: ShiftValue[]) => SHIFT_OPTIONS.filter((item) => shifts.includes(item.value)).map((item) => item.value);
const splitShiftValue = (shift: string) => shift.split(',').map((item) => item.trim()).filter(Boolean) as ShiftValue[];
const getShiftLabel = (shift: string) => splitShiftValue(shift).map((item) => SHIFT_OPTIONS.find((option) => option.value === item)?.label || item).join(' / ');
const formatMoneyValue = (value?: number | null) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '');
const parseMoneyValue = (value: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return null;

    const parsedValue = Number(trimmedValue.replace(',', '.'));
    return Number.isFinite(parsedValue) ? parsedValue : null;
};
const getShiftTone = (shift: ShiftValue) => {
    switch (shift) {
        case 'MANHA':
            return 'border-amber-200 bg-amber-50 text-amber-700';
        case 'TARDE':
            return 'border-sky-200 bg-sky-50 text-sky-700';
        case 'NOITE':
            return 'border-indigo-200 bg-indigo-50 text-indigo-700';
        default:
            return 'border-slate-200 bg-slate-50 text-slate-700';
    }
};

type SeriesClassColumnKey = 'className' | 'series' | 'seriesCode' | 'shift' | 'studentsCount' | 'defaultMonthlyFee' | 'totalMonthlyFee' | 'recordStatus';
type SeriesClassExportColumnKey = SeriesClassColumnKey;

const SERIES_CLASS_COLUMNS: ConfigurableGridColumn<SeriesClassRecord, SeriesClassColumnKey>[] = [
    { key: 'className', label: 'Turma', getValue: (row) => row.class?.name || '---' },
    { key: 'series', label: 'Série', getValue: (row) => row.series?.name || '---' },
    { key: 'seriesCode', label: 'Código da série', getValue: (row) => row.series?.code || '---', visibleByDefault: false },
    { key: 'shift', label: 'Turno', getValue: (row) => getShiftLabel(row.class?.shift || '') || '---' },
    {
        key: 'studentsCount',
        label: 'Total de alunos',
        getValue: (row) => String(row.studentCount ?? row._count?.enrollments ?? 0),
        getSortValue: (row) => row.studentCount ?? row._count?.enrollments ?? 0,
        aggregateOptions: ['sum', 'avg', 'min', 'max'],
        getAggregateValue: (row) => row.studentCount ?? row._count?.enrollments ?? 0,
    },
    {
        key: 'defaultMonthlyFee',
        label: 'Mensalidade padrão',
        getValue: (row) => {
            const value = formatMoneyValue(row.class?.defaultMonthlyFee);
            return value ? `R$ ${value}` : '---';
        },
        getSortValue: (row) => row.class?.defaultMonthlyFee ?? -1,
        visibleByDefault: false,
        aggregateOptions: ['sum', 'avg', 'min', 'max', 'count'],
        getAggregateValue: (row) => row.class?.defaultMonthlyFee ?? null,
        formatAggregateValue: (value, aggregateType) => aggregateType === 'count' ? String(value) : `R$ ${formatMoneyValue(value)}`,
    },
    {
        key: 'totalMonthlyFee',
        label: 'Total mensalidades',
        getValue: (row) => (typeof row.totalMonthlyFee === 'number' ? `R$ ${formatMoneyValue(row.totalMonthlyFee)}` : 'Dado sensível'),
        getSortValue: (row) => row.totalMonthlyFee ?? -1,
        aggregateOptions: ['sum', 'avg', 'min', 'max', 'count'],
        getAggregateValue: (row) => row.totalMonthlyFee ?? null,
        formatAggregateValue: (value, aggregateType) => aggregateType === 'count' ? String(value) : `R$ ${formatMoneyValue(value)}`,
    },
    {
        key: 'recordStatus',
        label: 'Status do cadastro',
        getValue: (row) => (!row.canceledAt && !row.class?.canceledAt && !row.series?.canceledAt) ? 'ATIVO' : 'INATIVO',
        visibleByDefault: false,
    },
];
const SERIES_CLASS_EXPORT_COLUMNS: GridColumnDefinition<SeriesClassRecord, SeriesClassExportColumnKey>[] = buildExportColumnsFromGridColumns(
    SERIES_CLASS_COLUMNS,
);
const SERIES_CLASS_COLUMN_KEYS = getAllGridColumnKeys(SERIES_CLASS_COLUMNS);
const DEFAULT_VISIBLE_SERIES_CLASS_COLUMNS = getDefaultVisibleGridColumnKeys(SERIES_CLASS_COLUMNS);

function getSeriesClassGridConfigStorageKey(tenantId: string | null) {
    return `dashboard:turmas:grid-config:${tenantId || 'default'}`;
}

function getSeriesClassExportConfigStorageKey(tenantId: string | null) {
    return `dashboard:turmas:export-config:${tenantId || 'default'}`;
}

const DEFAULT_SORT: GridSortState<SeriesClassColumnKey> = {
    column: 'className',
    direction: 'asc',
};

export default function TurmasPage() {
    const [links, setLinks] = useState<SeriesClassRecord[]>([]);
    const [series, setSeries] = useState<SeriesRecord[]>([]);
    const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [successStatus, setSuccessStatus] = useState<string | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [sortState, setSortState] = useState<GridSortState<SeriesClassColumnKey>>(DEFAULT_SORT);
    const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
    const [isGridConfigOpen, setIsGridConfigOpen] = useState(false);
    const [isGridConfigReady, setIsGridConfigReady] = useState(false);
    const [columnOrder, setColumnOrder] = useState<SeriesClassColumnKey[]>(SERIES_CLASS_COLUMN_KEYS);
    const [hiddenColumns, setHiddenColumns] = useState<SeriesClassColumnKey[]>(
        SERIES_CLASS_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_SERIES_CLASS_COLUMNS.includes(key)),
    );
    const [columnAggregations, setColumnAggregations] = useState<GridColumnAggregations<SeriesClassColumnKey>>({});
    const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFormat, setExportFormat] = useState<'excel' | 'csv' | 'pdf' | 'json' | 'txt'>('excel');
    const [exportColumns, setExportColumns] = useState<Record<SeriesClassExportColumnKey, boolean>>(buildDefaultExportColumns(SERIES_CLASS_EXPORT_COLUMNS));
    const [seriesClassStatusToggleTarget, setSeriesClassStatusToggleTarget] = useState<SeriesClassRecord | null>(null);
    const [seriesClassStatusToggleAction, setSeriesClassStatusToggleAction] = useState<'activate' | 'deactivate' | null>(null);
    const [isProcessingSeriesClassToggle, setIsProcessingSeriesClassToggle] = useState(false);
    const [selectedSeriesClassForStudents, setSelectedSeriesClassForStudents] = useState<SeriesClassRecord | null>(null);
    const [isStudentsModalLoading, setIsStudentsModalLoading] = useState(false);
    const [studentsModalError, setStudentsModalError] = useState<string | null>(null);

    const canView = hasAllDashboardPermissions(currentRole, currentPermissions, ['VIEW_SERIES', 'VIEW_SERIES_CLASSES']);
    const canManageClasses = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_CLASSES');
    const canManageSeriesClasses = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_SERIES_CLASSES');
    const canManage = canManageClasses && canManageSeriesClasses;
    const canViewStudents = hasDashboardPermission(currentRole, currentPermissions, 'VIEW_STUDENTS');
    const canViewStudentFinancialData = hasDashboardPermission(currentRole, currentPermissions, 'VIEW_STUDENT_FINANCIAL_DATA');
    const hasShiftSelected = formData.shifts.length > 0;
    const tenantBranding = useMemo(() => readCachedTenantBranding(currentTenantId), [currentTenantId]);
    const orderedSeriesClassColumns = useMemo(
        () => columnOrder.map((key) => SERIES_CLASS_COLUMNS.find((column) => column.key === key)).filter((column): column is ConfigurableGridColumn<SeriesClassRecord, SeriesClassColumnKey> => !!column),
        [columnOrder],
    );
    const visibleSeriesClassColumns = useMemo(
        () => orderedSeriesClassColumns.filter((column) => !hiddenColumns.includes(column.key)),
        [hiddenColumns, orderedSeriesClassColumns],
    );
    const filteredLinks = useMemo(() => {
        const term = searchTerm.trim().toUpperCase();
        return links.filter((item) => {
            const isActive = !item.canceledAt && !item.class?.canceledAt && !item.series?.canceledAt;
            const matchesStatus =
                statusFilter === 'ALL'
                    ? true
                    : statusFilter === 'ACTIVE'
                        ? isActive
                        : !isActive;
            const matchesSearch =
                !term ||
                [item.class?.name, item.class?.shift, item.series?.name]
                    .some((value) => String(value || '').toUpperCase().includes(term));
            return matchesStatus && matchesSearch;
        });
    }, [links, searchTerm, statusFilter]);
    const sortedFilteredLinks = useMemo(
        () => sortGridRows(filteredLinks, SERIES_CLASS_COLUMNS, sortState),
        [filteredLinks, sortState],
    );
    const aggregateSummaries = useMemo(
        () => buildGridAggregateSummaries(sortedFilteredLinks, visibleSeriesClassColumns, columnAggregations),
        [columnAggregations, sortedFilteredLinks, visibleSeriesClassColumns],
    );

    const loadData = async () => {
        try {
            setIsLoading(true);
            setErrorStatus(null);

            const { token, role, permissions, tenantId } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');
            setCurrentRole(role);
            setCurrentPermissions(permissions);
            setCurrentTenantId(tenantId);

            const [linksResponse, seriesResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/series-classes`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/series`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);

            const [linksData, seriesData] = await Promise.all([
                linksResponse.json().catch(() => null),
                seriesResponse.json().catch(() => null),
            ]);

            if (!linksResponse.ok) throw new Error(linksData?.message || 'Não foi possível carregar as turmas.');
            if (!seriesResponse.ok) throw new Error(seriesData?.message || 'Não foi possível carregar as séries.');
            setLinks(Array.isArray(linksData) ? linksData : []);
            setSeries(Array.isArray(seriesData) ? seriesData : []);
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível carregar as turmas.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { void loadData(); }, []);

    useEffect(() => {
        let isMounted = true;
        setIsGridConfigReady(false);
        void loadGridColumnConfig(getSeriesClassGridConfigStorageKey(currentTenantId), SERIES_CLASS_COLUMN_KEYS, DEFAULT_VISIBLE_SERIES_CLASS_COLUMNS).then((config) => {
            if (!isMounted) return;
            setColumnOrder(config.order);
            setHiddenColumns(config.hidden);
            setColumnAggregations(config.aggregations);
            setIsGridConfigReady(true);
        });
        return () => {
            isMounted = false;
        };
    }, [currentTenantId]);

    useEffect(() => {
        if (!isGridConfigReady) return;
        writeGridColumnConfig(getSeriesClassGridConfigStorageKey(currentTenantId), SERIES_CLASS_COLUMN_KEYS, columnOrder, hiddenColumns, columnAggregations);
    }, [columnAggregations, columnOrder, currentTenantId, hiddenColumns, isGridConfigReady]);

    if (!isLoading && !canView) {
        return (
            <DashboardAccessDenied
                title="Acesso restrito às turmas"
                message="Seu perfil não possui a combinação de permissões necessária para consultar séries e turmas desta escola."
            />
        );
    }

    const resetForm = () => {
        setEditingId(null);
        setFormData(EMPTY_FORM);
    };

    const openCreateModal = () => {
        resetForm();
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        resetForm();
    };

    const toggleShift = (shift: ShiftValue) => {
        setFormData((current) => ({
            ...current,
            shifts: current.shifts.includes(shift)
                ? current.shifts.filter((item) => item !== shift)
                : [...current.shifts, shift],
        }));
    };

    const findPotentialDuplicate = (name: string, seriesId: string) => {
        return links.find((item) =>
            item.id !== editingId
            && item.seriesId === seriesId
            && item.class?.name === name
        );
    };

    const createClassAndLink = async (token: string, payload: { seriesId: string; name: string; shifts: ShiftValue[]; defaultMonthlyFee: string }) => {
        const classResponse = await fetch(`${API_BASE_URL}/classes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                name: payload.name,
                shift: normalizeShifts(payload.shifts).join(','),
                defaultMonthlyFee: parseMoneyValue(payload.defaultMonthlyFee),
            }),
        });

        const classData = await classResponse.json().catch(() => null);
        if (!classResponse.ok) throw new Error(classData?.message || 'Não foi possível salvar a turma.');

        const linkResponse = await fetch(`${API_BASE_URL}/series-classes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                seriesId: payload.seriesId,
                classId: classData.id,
            }),
        });

        const linkData = await linkResponse.json().catch(() => null);
        if (!linkResponse.ok) {
            await fetch(`${API_BASE_URL}/classes/${classData.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            }).catch(() => null);
            throw new Error(linkData?.message || 'Não foi possível vincular a turma à série.');
        }
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();

        try {
            setIsSaving(true);
            setErrorStatus(null);
            setSuccessStatus(null);

            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const normalizedName = formData.name.trim().toUpperCase();
            if (!formData.seriesId) throw new Error('Selecione a série da turma.');
            if (!normalizedName) throw new Error('Informe o nome da turma.');
            if (formData.shifts.length === 0) throw new Error('Selecione pelo menos um turno.');

            const duplicate = findPotentialDuplicate(normalizedName, formData.seriesId);
            if (duplicate) {
                throw new Error(`Já existe uma turma ${normalizedName} para esta série.`);
            }

            if (editingId) {
                const current = links.find((item) => item.id === editingId);
                if (!current?.class?.id) throw new Error('Turma selecionada para edição não foi encontrada.');

                const classResponse = await fetch(`${API_BASE_URL}/classes/${current.class.id}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        name: normalizedName,
                        shift: normalizeShifts(formData.shifts).join(','),
                        defaultMonthlyFee: parseMoneyValue(formData.defaultMonthlyFee),
                    }),
                });

                const classData = await classResponse.json().catch(() => null);
                if (!classResponse.ok) throw new Error(classData?.message || 'Não foi possível atualizar a turma.');

                const linkResponse = await fetch(`${API_BASE_URL}/series-classes/${editingId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        seriesId: formData.seriesId,
                        classId: current.class.id,
                    }),
                });

                const linkData = await linkResponse.json().catch(() => null);
                if (!linkResponse.ok) throw new Error(linkData?.message || 'Não foi possível atualizar o vínculo da turma.');

                setSuccessStatus('Turma atualizada com sucesso.');
            } else {
                await createClassAndLink(token, {
                    seriesId: formData.seriesId,
                    name: normalizedName,
                    shifts: formData.shifts,
                    defaultMonthlyFee: formData.defaultMonthlyFee,
                });
                setSuccessStatus('Turma cadastrada com sucesso.');
            }

            closeModal();
            await loadData();
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível salvar a turma.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleEdit = (item: SeriesClassRecord) => {
        setEditingId(item.id);
        setFormData({
            seriesId: item.seriesId,
            name: item.class?.name || '',
            shifts: item.class?.shift ? splitShiftValue(item.class.shift) : [],
            defaultMonthlyFee: formatMoneyValue(item.class?.defaultMonthlyFee),
        });
        setIsModalOpen(true);
    };

    const openSeriesClassStatusModal = (item: SeriesClassRecord) => {
        setSeriesClassStatusToggleTarget(item);
        setSeriesClassStatusToggleAction(item.canceledAt || item.class?.canceledAt || item.series?.canceledAt ? 'activate' : 'deactivate');
    };

    const closeSeriesClassStatusModal = (force = false) => {
        if (!force && isProcessingSeriesClassToggle) return;
        setSeriesClassStatusToggleTarget(null);
        setSeriesClassStatusToggleAction(null);
    };

    const confirmSeriesClassStatusToggle = async () => {
        if (!seriesClassStatusToggleTarget || !seriesClassStatusToggleAction) return;
        const willActivate = seriesClassStatusToggleAction === 'activate';
        try {
            setIsProcessingSeriesClassToggle(true);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const item = seriesClassStatusToggleTarget;
            if (willActivate && item.series?.canceledAt) {
                throw new Error('Esta turma depende de uma série inativa. Ative a série primeiro.');
            }

            let partialMessage = '';
            if (willActivate) {
                if (item.class?.id && item.class?.canceledAt) {
                    const classResponse = await fetch(`${API_BASE_URL}/classes/${item.class.id}/status`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ active: true }),
                    });
                    const classData = await classResponse.json().catch(() => null);
                    if (!classResponse.ok) {
                        throw new Error(classData?.message || 'Não foi possível ativar a turma base.');
                    }
                }

                const linkResponse = await fetch(`${API_BASE_URL}/series-classes/${item.id}/status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ active: true }),
                });
                const linkData = await linkResponse.json().catch(() => null);
                if (!linkResponse.ok) throw new Error(linkData?.message || 'Não foi possível ativar a turma.');

                setSuccessStatus(`Turma ativada com sucesso.${partialMessage}`);
            } else {
                const linkResponse = await fetch(`${API_BASE_URL}/series-classes/${item.id}/status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ active: false }),
                });
                const linkData = await linkResponse.json().catch(() => null);
                if (!linkResponse.ok) throw new Error(linkData?.message || 'Não foi possível inativar o vínculo da turma.');

                if (item.class?.id && !item.class?.canceledAt) {
                    const classResponse = await fetch(`${API_BASE_URL}/classes/${item.class.id}/status`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ active: false }),
                    });
                    const classData = await classResponse.json().catch(() => null);
                    if (!classResponse.ok) {
                        partialMessage = ` ${classData?.message || 'O vínculo foi inativado, mas a turma base precisará de revisão manual.'}`;
                    }
                }

                setSuccessStatus(`Turma inativada com sucesso.${partialMessage}`);
            }
            await loadData();
            closeSeriesClassStatusModal(true);
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : (willActivate ? 'Não foi possível ativar a turma.' : 'Não foi possível inativar a turma.'));
        } finally {
            setIsProcessingSeriesClassToggle(false);
        }
    };

    const toggleSort = (column: SeriesClassColumnKey) => {
        setSortState((current) => ({
            column,
            direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const toggleExportColumn = (column: SeriesClassExportColumnKey) => {
        setExportColumns((current) => ({ ...current, [column]: !current[column] }));
    };

    const renderSeriesClassInfoButton = (item: SeriesClassRecord) => (
        <GridRecordPopover
            title={item.class?.name || 'Turma'}
            subtitle={item.series?.name ? `Série: ${item.series.name}` : 'Turma sem série vinculada'}
            buttonLabel={`Ver detalhes da turma ${item.class?.name || ''}`}
            badges={[
                (!item.canceledAt && !item.class?.canceledAt && !item.series?.canceledAt) ? 'ATIVA' : 'INATIVA',
                getShiftLabel(item.class?.shift || '') || 'SEM TURNO',
                item.series?.code || 'SEM CÓDIGO',
            ]}
            sections={[
                {
                    title: 'Cadastro',
                    items: [
                        { label: 'Turma', value: item.class?.name || 'Não informada' },
                        { label: 'Série', value: item.series?.name || 'Não informada' },
                        { label: 'Código da série', value: item.series?.code || 'Não informado' },
                        { label: 'Turno', value: getShiftLabel(item.class?.shift || '') || 'Não informado' },
                        { label: 'Composição', value: `${item.series?.name || 'Série'} + ${item.class?.name || 'Turma'}` },
                    ],
                },
                {
                    title: 'Financeiro',
                    items: [
                        { label: 'Mensalidade padrão', value: formatMoneyValue(item.class?.defaultMonthlyFee) ? `R$ ${formatMoneyValue(item.class?.defaultMonthlyFee)}` : 'Não informada' },
                        { label: 'Total de alunos', value: String(item.studentCount ?? item._count?.enrollments ?? 0) },
                        { label: 'Total das mensalidades', value: typeof item.totalMonthlyFee === 'number' ? `R$ ${formatMoneyValue(item.totalMonthlyFee)}` : 'Dado sensível' },
                        { label: 'Status', value: (!item.canceledAt && !item.class?.canceledAt && !item.series?.canceledAt) ? 'ATIVA' : 'INATIVA' },
                        { label: 'Classe base', value: item.class?.id || 'Não informada' },
                    ],
                },
            ]}
        />
    );

    const setAllExportColumns = (value: boolean) => {
        setExportColumns(
            SERIES_CLASS_EXPORT_COLUMNS.reduce<Record<SeriesClassExportColumnKey, boolean>>((accumulator, column) => {
                accumulator[column.key] = value;
                return accumulator;
            }, {} as Record<SeriesClassExportColumnKey, boolean>),
        );
    };

    const toggleGridColumnVisibility = (columnKey: SeriesClassColumnKey) => {
        const isHidden = hiddenColumns.includes(columnKey);
        const visibleCount = SERIES_CLASS_COLUMN_KEYS.length - hiddenColumns.length;
        if (!isHidden && visibleCount === 1) {
            setErrorStatus('Pelo menos uma coluna precisa continuar visível no grid.');
            return;
        }
        setHiddenColumns((current) => isHidden ? current.filter((item) => item !== columnKey) : [...current, columnKey]);
    };

    const moveGridColumn = (columnKey: SeriesClassColumnKey, direction: 'up' | 'down') => {
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
        setColumnOrder(SERIES_CLASS_COLUMN_KEYS);
        setHiddenColumns(SERIES_CLASS_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_SERIES_CLASS_COLUMNS.includes(key)));
        setColumnAggregations({});
    };

    const handleColumnAggregationChange = (columnKey: SeriesClassColumnKey, aggregateType: 'sum' | 'avg' | 'min' | 'max' | 'count' | null) => {
        setColumnAggregations((current) => {
            const next = { ...current };
            if (aggregateType) {
                next[columnKey] = aggregateType;
            } else {
                delete next[columnKey];
            }
            return next;
        });
    };

    const openStudentsModal = async (item: SeriesClassRecord) => {
        try {
            setIsStudentsModalLoading(true);
            setStudentsModalError(null);
            const token = getStoredToken();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const response = await fetch(`${API_BASE_URL}/series-classes/${item.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Não foi possível carregar os alunos da turma.');
            setSelectedSeriesClassForStudents(data);
        } catch (error) {
            setStudentsModalError(error instanceof Error ? error.message : 'Não foi possível carregar os alunos da turma.');
        } finally {
            setIsStudentsModalLoading(false);
        }
    };

    const renderSeriesClassGridCell = (item: SeriesClassRecord, columnKey: SeriesClassColumnKey) => {
        const isActive = !item.canceledAt && !item.class?.canceledAt && !item.series?.canceledAt;
        const tone = isActive ? 'text-slate-600' : 'text-rose-700';
        if (columnKey === 'className') {
            return (
                <td key={columnKey} className={`px-6 py-4 font-semibold ${isActive ? 'text-slate-800' : 'text-rose-800'}`}>
                    <div className="flex items-center gap-2">
                        <span>{item.class?.name || '---'}</span>
                        <RecordStatusIndicator active={isActive} />
                    </div>
                </td>
            );
        }
        if (columnKey === 'series') return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${tone}`}>{item.series?.name || '---'}</td>;
        if (columnKey === 'seriesCode') return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${tone}`}>{item.series?.code || '---'}</td>;
        if (columnKey === 'shift') {
            return (
                <td key={columnKey} className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                        {splitShiftValue(item.class?.shift || '').map((shift) => (
                            <span key={`${item.id}-${shift}`} className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${getShiftTone(shift)}`}>
                                {getShiftLabel(shift)}
                            </span>
                        ))}
                    </div>
                </td>
            );
        }
        if (columnKey === 'studentsCount') {
            return <td key={columnKey} className={`px-6 py-4 text-sm font-semibold ${tone}`}>{String(item.studentCount ?? item._count?.enrollments ?? 0)}</td>;
        }
        if (columnKey === 'defaultMonthlyFee') {
            const value = formatMoneyValue(item.class?.defaultMonthlyFee);
            return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${tone}`}>{value ? `R$ ${value}` : '---'}</td>;
        }
        if (columnKey === 'totalMonthlyFee') {
            return (
                <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${tone}`}>
                    {typeof item.totalMonthlyFee === 'number' ? `R$ ${formatMoneyValue(item.totalMonthlyFee)}` : 'Dado sensível'}
                </td>
            );
        }
        return (
            <td key={columnKey} className="px-6 py-4 text-center">
                <RecordStatusIndicator active={isActive} />
            </td>
        );
    };

    return (
        <div className="w-full space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-[#153a6a] tracking-tight">Turmas</h1>
                    <p className="text-slate-500 font-medium mt-1">Cadastre as turmas e consulte seus turnos e vínculos com séries.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setIsExportModalOpen(true)}
                        className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                    >
                        Exportar
                    </button>
                    {canManage ? (
                        <button
                            onClick={openCreateModal}
                            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white shadow-md shadow-blue-500/20 transition-all active:scale-95 hover:bg-blue-500"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                            Nova Turma
                        </button>
                    ) : null}
                </div>
            </div>

            {errorStatus ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorStatus}</div> : null}
            {successStatus ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{successStatus}</div> : null}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="dashboard-band border-b px-6 py-4">
                    <div className="relative w-full max-w-xs">
                        <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar turma..." className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="dashboard-table-head border-b border-slate-300 text-[13px] font-bold uppercase tracking-wider">
                                {visibleSeriesClassColumns.map((column) => (
                                    <th key={column.key} className="px-6 py-4"><GridSortableHeader label={column.label} isActive={sortState.column === column.key} direction={sortState.direction} onClick={() => toggleSort(column.key)} /></th>
                                ))}
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? <tr><td colSpan={visibleSeriesClassColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">Carregando turmas...</td></tr> : null}
                            {!isLoading && sortedFilteredLinks.length === 0 ? <tr><td colSpan={visibleSeriesClassColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">Nenhuma turma cadastrada.</td></tr> : null}
                            {!isLoading && sortedFilteredLinks.map((item) => (
                                <tr key={item.id} className={!item.canceledAt && !item.class?.canceledAt && !item.series?.canceledAt ? 'hover:bg-slate-50' : 'bg-rose-50/40 hover:bg-rose-50'}>
                                    {visibleSeriesClassColumns.map((column) => renderSeriesClassGridCell(item, column.key))}
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {canViewStudents ? (
                                                <GridRowActionIconButton title="Listar alunos da turma" onClick={() => void openStudentsModal(item)} tone="emerald">
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5V4H2v16h5m10 0v-2a4 4 0 00-4-4H11a4 4 0 00-4 4v2m10 0H7m10 0h-2m-8 0H5m6-10a4 4 0 110-8 4 4 0 010 8z" />
                                                    </svg>
                                                </GridRowActionIconButton>
                                            ) : null}
                                            {renderSeriesClassInfoButton(item)}
                                            <GridRowActionIconButton title="Editar turma" onClick={() => handleEdit(item)} tone="blue">
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </GridRowActionIconButton>
                                            <GridRowActionIconButton title={(!item.canceledAt && !item.class?.canceledAt && !item.series?.canceledAt) ? 'Inativar turma' : 'Ativar turma'} onClick={() => openSeriesClassStatusModal(item)} tone={(!item.canceledAt && !item.class?.canceledAt && !item.series?.canceledAt) ? 'rose' : 'emerald'}>
                                                {(!item.canceledAt && !item.class?.canceledAt && !item.series?.canceledAt) ? (
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728M6 6l12 12" />
                                                    </svg>
                                                ) : (
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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
                    key={`series-class-footer-${sortedFilteredLinks.length}`}
                    recordsCount={Number(sortedFilteredLinks.length)}
                    onOpenColumns={() => setIsGridConfigOpen(true)}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    activeLabel="Mostrar somente turmas ativas"
                    allLabel="Mostrar turmas ativas e inativas"
                    inactiveLabel="Mostrar somente turmas inativas"
                    aggregateSummaries={aggregateSummaries}
                />
            </section>

            <GridColumnConfigModal
                isOpen={isGridConfigOpen}
                title="Configurar colunas do grid"
                description="Reordene, oculte ou inclua colunas do cadastro de turmas nesta tela."
                columns={orderedSeriesClassColumns.map((column) => ({
                    key: column.key,
                    label: column.label,
                    visibleByDefault: column.visibleByDefault,
                    aggregateOptions: column.aggregateOptions,
                }))}
                orderedColumns={columnOrder}
                hiddenColumns={hiddenColumns}
                selectedAggregations={columnAggregations}
                onToggleColumnVisibility={toggleGridColumnVisibility}
                onMoveColumn={moveGridColumn}
                onAggregationChange={handleColumnAggregationChange}
                onReset={resetGridColumns}
                onClose={() => setIsGridConfigOpen(false)}
            />

            <StatusConfirmationModal
                isOpen={Boolean(seriesClassStatusToggleTarget && seriesClassStatusToggleAction)}
                tenantId={currentTenantId}
                actionType={seriesClassStatusToggleAction || 'activate'}
                title={seriesClassStatusToggleAction === 'activate' ? 'Ativar turma' : 'Inativar turma'}
                itemLabel="Turma"
                itemName={seriesClassStatusToggleTarget?.class?.name || 'Turma selecionada'}
                description={seriesClassStatusToggleAction === 'activate'
                    ? 'Ao ativar esta turma ela volta a ser ofertada para matrículas e o vínculo com a série é reativado.'
                    : 'Ao inativar esta turma, ela sai das listas ativas, mas o histórico financeiro permanece.'}
                hintText="Essa operação respeita a trilha de auditoria institucional."
                confirmLabel={seriesClassStatusToggleAction === 'activate' ? 'Confirmar ativação' : 'Confirmar inativação'}
                onCancel={() => closeSeriesClassStatusModal(true)}
                onConfirm={confirmSeriesClassStatusToggle}
                isProcessing={isProcessingSeriesClassToggle}
                statusActive={!seriesClassStatusToggleTarget?.canceledAt && !seriesClassStatusToggleTarget?.class?.canceledAt && !seriesClassStatusToggleTarget?.series?.canceledAt}
            />

            <GridExportModal
                isOpen={isExportModalOpen}
                title="Exportar turmas"
                description={`A exportação respeita a busca atual e inclui ${sortedFilteredLinks.length} registro(s).`}
                format={exportFormat}
                onFormatChange={setExportFormat}
                columns={SERIES_CLASS_EXPORT_COLUMNS.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={exportColumns}
                onToggleColumn={toggleExportColumn}
                onSelectAll={setAllExportColumns}
                storageKey={getSeriesClassExportConfigStorageKey(currentTenantId)}
                onClose={() => setIsExportModalOpen(false)}
                onExport={async (config) => {
                    try {
                        await exportGridRows({
                            rows: sortedFilteredLinks,
                            columns: config?.orderedColumns
                                ? config.orderedColumns
                                    .map((key) => SERIES_CLASS_EXPORT_COLUMNS.find((column) => column.key === key))
                                    .filter((column): column is GridColumnDefinition<SeriesClassRecord, SeriesClassExportColumnKey> => !!column)
                                : SERIES_CLASS_EXPORT_COLUMNS,
                            selectedColumns: config?.selectedColumns || exportColumns,
                            format: exportFormat,
                            pdfOptions: config?.pdfOptions,
                            fileBaseName: 'turmas',
                            branding: {
                                title: 'Turmas',
                                subtitle: 'Exportação com os filtros atualmente aplicados.',
                            },
                        });
                        setSuccessStatus(`Exportação ${exportFormat.toUpperCase()} preparada com ${sortedFilteredLinks.length} registro(s).`);
                        setIsExportModalOpen(false);
                    } catch (error) {
                        setErrorStatus(error instanceof Error ? error.message : 'Não foi possível exportar as turmas.');
                    }
                }}
            />

            {isModalOpen ? (
                <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-xl font-bold text-[#153a6a]">{editingId ? 'Editar turma' : 'Nova turma'}</h2>
                            <button onClick={closeModal} className="text-slate-400 hover:text-red-500">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr_0.8fr_1.2fr]">
                                <input required value={formData.name} onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value.toUpperCase() }))} placeholder="Nome da turma" className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20" />

                                <select value={formData.seriesId} onChange={(event) => setFormData((current) => ({ ...current, seriesId: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20">
                                    <option value="">Selecionar série</option>
                                    {series.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                </select>

                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={formData.defaultMonthlyFee}
                                    onChange={(event) => setFormData((current) => ({ ...current, defaultMonthlyFee: event.target.value }))}
                                    placeholder="Mensalidade padrão"
                                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                                />

                                <div className={`rounded-lg px-4 py-3 ${hasShiftSelected ? 'border border-slate-300 bg-slate-50' : 'border border-red-200 bg-red-50'}`}>
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Turnos</p>
                                    <div className="mt-3 flex flex-wrap gap-3">
                                        {SHIFT_OPTIONS.map((option) => {
                                            const checked = formData.shifts.includes(option.value);
                                            return (
                                                <label key={option.value} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${checked ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleShift(option.value)}
                                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    {option.label}
                                                </label>
                                            );
                                        })}
                                    </div>
                                    {!hasShiftSelected ? (
                                        <p className="mt-3 text-xs font-bold text-red-600">
                                            Selecione pelo menos um período para cadastrar a turma.
                                        </p>
                                    ) : null}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                                <button type="button" onClick={closeModal} className="px-5 py-2.5 text-slate-500 font-semibold hover:bg-slate-100 rounded-xl transition-colors text-sm">Cancelar</button>
                                <button type="submit" disabled={!canManage || isSaving || !hasShiftSelected} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-md shadow-blue-500/20 transition-all text-sm disabled:bg-slate-300 disabled:cursor-not-allowed">{isSaving ? 'Salvando...' : editingId ? 'Salvar edição' : 'Cadastrar turma'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {selectedSeriesClassForStudents || isStudentsModalLoading ? (
                <div className="fixed inset-0 z-[58] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95">
                        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-4">
                            <div className="flex min-w-0 items-center gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                    {tenantBranding?.logoUrl ? (
                                        <img src={tenantBranding.logoUrl} alt={tenantBranding.schoolName} className="h-full w-full object-contain" />
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
                                    <h2 className="truncate text-xl font-bold text-[#153a6a]">
                                        Alunos da turma {selectedSeriesClassForStudents?.class?.name || ''}
                                    </h2>
                                    <p className="mt-1 text-sm font-medium text-slate-500">
                                        {selectedSeriesClassForStudents?.series?.name || 'Série não informada'} | {selectedSeriesClassForStudents?.studentCount ?? selectedSeriesClassForStudents?._count?.enrollments ?? 0} aluno(s)
                                    </p>
                                </div>
                            </div>
                            <button type="button" onClick={() => { setSelectedSeriesClassForStudents(null); setStudentsModalError(null); }} className="text-slate-400 hover:text-red-500">
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-6">
                            {studentsModalError ? (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                                    {studentsModalError}
                                </div>
                            ) : isStudentsModalLoading ? (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm font-semibold text-slate-500">
                                    Carregando alunos da turma...
                                </div>
                            ) : (
                                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                    <table className="w-full border-collapse text-left">
                                        <thead>
                                            <tr className="dashboard-table-head border-b border-slate-300 text-[13px] font-bold uppercase tracking-wider">
                                                <th className="px-6 py-4">Aluno</th>
                                                <th className="px-6 py-4 text-right">Mensalidade</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(selectedSeriesClassForStudents?.enrollments || []).length === 0 ? (
                                                <tr>
                                                    <td colSpan={2} className="px-6 py-12 text-center font-medium text-slate-400">
                                                        Nenhum aluno ativo vinculado a esta turma.
                                                    </td>
                                                </tr>
                                            ) : (
                                                (selectedSeriesClassForStudents?.enrollments || []).map((enrollment) => {
                                                    const studentMonthlyFee = enrollment.student?.monthlyFee;
                                                    const fallbackMonthlyFee = selectedSeriesClassForStudents?.class?.defaultMonthlyFee;
                                                    const effectiveMonthlyFee = typeof studentMonthlyFee === 'number'
                                                        ? studentMonthlyFee
                                                        : typeof fallbackMonthlyFee === 'number'
                                                            ? fallbackMonthlyFee
                                                            : null;
                                                    return (
                                                        <tr key={enrollment.id} className="hover:bg-slate-50">
                                                            <td className="px-6 py-4 font-semibold text-slate-800">
                                                                {enrollment.student?.name || 'Aluno não informado'}
                                                            </td>
                                                            <td className="px-6 py-4 text-right text-sm font-medium text-slate-600">
                                                                {canViewStudentFinancialData && typeof effectiveMonthlyFee === 'number'
                                                                    ? `R$ ${formatMoneyValue(effectiveMonthlyFee)}`
                                                                    : canViewStudentFinancialData
                                                                        ? '---'
                                                                        : 'Dado sensível'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t border-slate-200 bg-slate-50">
                                                <td className="px-6 py-4 text-sm font-bold text-slate-700">Total de alunos</td>
                                                <td className="px-6 py-4 text-right text-sm font-bold text-slate-700">
                                                    {selectedSeriesClassForStudents?.studentCount ?? selectedSeriesClassForStudents?._count?.enrollments ?? 0}
                                                </td>
                                            </tr>
                                            <tr className="border-t border-slate-200 bg-slate-50">
                                                <td className="px-6 py-4 text-sm font-bold text-slate-700">Total das mensalidades</td>
                                                <td className="px-6 py-4 text-right text-sm font-bold text-slate-700">
                                                    {canViewStudentFinancialData && typeof selectedSeriesClassForStudents?.totalMonthlyFee === 'number'
                                                        ? `R$ ${formatMoneyValue(selectedSeriesClassForStudents.totalMonthlyFee)}`
                                                        : 'Dado sensível'}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-6 py-4 text-right">
                            <button
                                type="button"
                                onClick={() => { setSelectedSeriesClassForStudents(null); setStudentsModalError(null); }}
                                className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-white"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

