'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import GridColumnFilterHeader from '@/app/components/grid-column-filter-header';
import GridColumnConfigModal from '@/app/components/grid-column-config-modal';
import GridExportModal from '@/app/components/grid-export-modal';
import GridStandardFooter from '@/app/components/grid-standard-footer';
import GridRecordPopover from '@/app/components/grid-record-popover';
import GridRowActionIconButton from '@/app/components/grid-row-action-icon-button';
import StatusConfirmationModal from '@/app/components/status-confirmation-modal';
import { type GridStatusFilterValue } from '@/app/components/grid-status-filter';
import PrincipalProgramHeader from '@/app/components/principal-program-header';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { TenantBranchSelect } from '@/app/components/tenant-branch-select';
import { fetchTenantBranches, getDashboardAuthContext, hasAllDashboardPermissions, hasDashboardPermission, type TenantBranchSummary } from '@/app/lib/dashboard-crud-utils';
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
import { dispatchScreenAuditContext, formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const TURMAS_SCREEN_ID = 'PRINCIPAL_TURMAS';
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
    sortOrder?: number | null;
};

type ClassRecord = {
    id: string;
    branchCode?: number | null;
    name: string;
    shift: string;
    defaultMonthlyFee?: number | null;
    canceledAt?: string | null;
};

type SeriesClassRecord = {
    id: string;
    branchCode?: number | null;
    seriesId: string;
    classId: string;
    smtpEnabled?: boolean | null;
    smtpHost?: string | null;
    smtpPort?: number | null;
    smtpTimeout?: number | null;
    smtpAuthenticate?: boolean | null;
    smtpSecure?: boolean | null;
    smtpAuthType?: string | null;
    smtpEmail?: string | null;
    smtpPassword?: string | null;
    smtpSenderName?: string | null;
    smtpReplyTo?: string | null;
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
    branchCode: number;
    seriesId: string;
    name: string;
    shifts: ShiftValue[];
    defaultMonthlyFee: string;
    smtpEnabled: boolean;
    smtpHost: string;
    smtpPort: string;
    smtpTimeout: string;
    smtpAuthenticate: boolean;
    smtpSecure: boolean;
    smtpAuthType: string;
    smtpEmail: string;
    smtpPassword: string;
    smtpSenderName: string;
    smtpReplyTo: string;
};

const EMPTY_FORM: FormData = {
    branchCode: 1,
    seriesId: '',
    name: '',
    shifts: [],
    defaultMonthlyFee: '',
    smtpEnabled: false,
    smtpHost: '',
    smtpPort: '465',
    smtpTimeout: '60',
    smtpAuthenticate: true,
    smtpSecure: true,
    smtpAuthType: 'SSL',
    smtpEmail: '',
    smtpPassword: '',
    smtpSenderName: '',
    smtpReplyTo: '',
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

type ClassStudent = {
    id: string;
    name: string;
    cpf: string | null;
    email: string | null;
    phone: string | null;
    street: string | null;
    number: string | null;
    city: string | null;
    state: string | null;
    neighborhood: string | null;
    zipCode: string | null;
    updatedAt: string | null;
    photoUrl: string | null;
};

const formatPhoneNumber = (value?: string | null) => {
    if (!value) return '';
    const digits = value.replace(/\D/g, '');
    if (digits.length === 11) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return value;
};

type SeriesClassColumnKey = 'className' | 'series' | 'seriesSortOrder' | 'seriesCode' | 'shift' | 'studentsCount' | 'defaultMonthlyFee' | 'totalMonthlyFee' | 'recordStatus';
type SeriesClassExportColumnKey = SeriesClassColumnKey;
type SeriesClassColumnFilters = Record<SeriesClassColumnKey, string>;

const SERIES_CLASS_COLUMNS: ConfigurableGridColumn<SeriesClassRecord, SeriesClassColumnKey>[] = [
    { key: 'className', label: 'Turma', getValue: (row) => row.class?.name || '---' },
    { key: 'series', label: 'Série', getValue: (row) => row.series?.name || '---' },
    {
        key: 'seriesSortOrder',
        label: 'Ordem de aprendizado',
        getValue: (row) => row.series?.sortOrder !== null && row.series?.sortOrder !== undefined ? String(row.series.sortOrder) : '---',
        getSortValue: (row) => row.series?.sortOrder ?? -1,
        visibleByDefault: true,
    },
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
const SERIES_CLASS_GRID_COLUMNS = SERIES_CLASS_COLUMNS.filter((column) => column.key !== 'recordStatus');
const SERIES_CLASS_COLUMN_KEYS = getAllGridColumnKeys(SERIES_CLASS_COLUMNS);
const SERIES_CLASS_GRID_COLUMN_KEYS = getAllGridColumnKeys(SERIES_CLASS_GRID_COLUMNS);
const DEFAULT_VISIBLE_SERIES_CLASS_GRID_COLUMNS = getDefaultVisibleGridColumnKeys(SERIES_CLASS_GRID_COLUMNS);
const SERIES_CLASS_PRIMARY_GRID_COLUMN_KEYS: SeriesClassColumnKey[] = ['className', 'series', 'shift'];
const EMPTY_SERIES_CLASS_COLUMN_FILTERS = SERIES_CLASS_COLUMN_KEYS.reduce<SeriesClassColumnFilters>((accumulator, key) => {
    accumulator[key] = '';
    return accumulator;
}, {} as SeriesClassColumnFilters);

function normalizeSeriesClassGridFilterValue(value: unknown) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
}

function normalizeSeriesClassGridDigits(value: unknown) {
    return String(value ?? '').replace(/\D/g, '');
}

function matchesSeriesClassGridFilter(values: unknown[], filter: string) {
    const normalizedFilter = normalizeSeriesClassGridFilterValue(filter);
    const filterDigits = normalizeSeriesClassGridDigits(filter);

    if (!normalizedFilter) {
        return true;
    }

    return values.some((value) => {
        const normalizedValue = normalizeSeriesClassGridFilterValue(value);

        if (normalizedValue.includes(normalizedFilter)) {
            return true;
        }

        return Boolean(filterDigits && normalizeSeriesClassGridDigits(value).includes(filterDigits));
    });
}

function getSeriesClassColumnFilterValues(row: SeriesClassRecord, columnKey: SeriesClassColumnKey) {
    const column = SERIES_CLASS_COLUMNS.find((item) => item.key === columnKey);
    const baseValue = column?.getValue(row) || '';
    const isActive = !row.canceledAt && !row.class?.canceledAt && !row.series?.canceledAt;
    return [
        baseValue,
        row.class?.name,
        row.series?.name,
        row.series?.sortOrder,
        row.series?.code,
        row.class?.shift,
        getShiftLabel(row.class?.shift || ''),
        row.studentCount ?? row._count?.enrollments ?? 0,
        row.class?.defaultMonthlyFee,
        row.totalMonthlyFee,
        isActive ? 'ATIVO' : 'INATIVO',
    ];
}

function getSeriesClassGridConfigStorageKey(tenantId: string | null) {
    return `dashboard:turmas:grid-config:${tenantId || 'default'}`;
}

function getSeriesClassExportConfigStorageKey(tenantId: string | null) {
    return `dashboard:turmas:export-config:${tenantId || 'default'}`;
}

const DEFAULT_SORT: GridSortState<SeriesClassColumnKey> = {
    column: 'seriesSortOrder',
    direction: 'asc',
};
const TURMAS_STUDENTS_MODAL_SCREEN_ID = 'PRINCIPAL_TURMAS_STUDENTS_MODAL';
const TURMAS_NEW_CLASS_MODAL_SCREEN_ID = 'PRINCIPAL_TURMAS_NEW_CLASS_MODAL';
const TURMAS_STATUS_MODAL_SCREEN_ID = 'PRINCIPAL_TURMAS_STATUS_MODAL';

type TurmasAuditParams = {
    tenantId: string | null;
    tenantName?: string | null;
    searchTerm: string;
    statusFilter: GridStatusFilterValue;
    seriesFilter: string;
    seriesFilterLabel: string;
    displayedRowsCount: number;
    sortColumn: SeriesClassColumnKey;
    sortDirection: 'asc' | 'desc';
};
const parseOptionalInteger = (value: string) => {
    const parsedValue = Number(String(value || '').trim());
    return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

function getTurmasAuditOrderBy(column: SeriesClassColumnKey) {
    const orderColumns: Record<SeriesClassColumnKey, string> = {
        className: 'CL.name',
        series: 'SE.name',
        seriesSortOrder: 'SE.sortOrder',
        seriesCode: 'SE.code',
        shift: 'CL.shift',
        studentsCount: 'studentCount',
        defaultMonthlyFee: 'CL.defaultMonthlyFee',
        totalMonthlyFee: 'totalMonthlyFee',
        recordStatus: 'SC.canceledAt',
    };

    return orderColumns[column] || 'SE.sortOrder';
}

function buildTurmasAuditSql(params: TurmasAuditParams) {
    const searchTerm = params.searchTerm.trim().toUpperCase();
    const statusFilter = String(params.statusFilter || 'ACTIVE').toUpperCase();
    const seriesFilter = String(params.seriesFilter || '').trim();
    const sortDirection = params.sortDirection === 'desc' ? 'DESC' : 'ASC';

    return `-- PARAMETROS ATUAIS DO GRID
-- :schoolId = ${toSqlLiteral(params.tenantId || '')}
-- :searchTerm = ${toSqlLiteral(searchTerm)}
-- :statusFilter = ${toSqlLiteral(statusFilter)}
-- :seriesId = ${toSqlLiteral(seriesFilter)}

SELECT
  SC.*,
  COUNT(DISTINCT EN.studentId) AS studentCount,
  SUM(COALESCE(ST.monthlyFee, 0)) AS totalMonthlyFee
FROM series_classes SC
LEFT JOIN series SE
  ON SE.id = SC.seriesId
 AND SE.tenantId = SC.tenantId
LEFT JOIN classes CL
  ON CL.id = SC.classId
 AND CL.tenantId = SC.tenantId
LEFT JOIN enrollments EN
  ON EN.seriesClassId = SC.id
 AND EN.tenantId = SC.tenantId
 AND EN.canceledAt IS NULL
LEFT JOIN students ST
  ON ST.id = EN.studentId
 AND ST.tenantId = SC.tenantId
 AND ST.canceledAt IS NULL
WHERE SC.tenantId = ${toSqlLiteral(params.tenantId || '')}
  AND (
    ${toSqlLiteral(searchTerm)} = ''
    OR UPPER(COALESCE(CL.name, '')) LIKE '%' || UPPER(${toSqlLiteral(searchTerm)}) || '%'
    OR UPPER(COALESCE(CL.shift, '')) LIKE '%' || UPPER(${toSqlLiteral(searchTerm)}) || '%'
    OR UPPER(COALESCE(SE.name, '')) LIKE '%' || UPPER(${toSqlLiteral(searchTerm)}) || '%'
  )
  AND (
    ${toSqlLiteral(statusFilter)} = 'ALL'
    OR (${toSqlLiteral(statusFilter)} = 'ACTIVE' AND SC.canceledAt IS NULL AND CL.canceledAt IS NULL AND SE.canceledAt IS NULL)
    OR (${toSqlLiteral(statusFilter)} = 'INACTIVE' AND (SC.canceledAt IS NOT NULL OR CL.canceledAt IS NOT NULL OR SE.canceledAt IS NOT NULL))
  )
  AND (
    ${toSqlLiteral(seriesFilter)} = ''
    OR SC.seriesId = ${toSqlLiteral(seriesFilter)}
  )
GROUP BY SC.id, SE.id, CL.id
ORDER BY ${getTurmasAuditOrderBy(params.sortColumn)} ${sortDirection};`;
}

function buildTurmasAuditText(params: TurmasAuditParams) {
    const searchTerm = params.searchTerm.trim().toUpperCase();
    const statusFilter = String(params.statusFilter || 'ACTIVE').toUpperCase();
    const seriesFilter = params.seriesFilter ? `${params.seriesFilter} (${params.seriesFilterLabel})` : 'TODAS';
    const sortDirection = params.sortDirection === 'desc' ? 'DESC' : 'ASC';

    return `--- LOGICA DA TELA ---
Tela de grid/listagem administrativa para manutencao das turmas da escola.

TABELAS PRINCIPAIS:
- series_classes (SC) - vinculo entre serie e turma
- series (SE) - cadastro de series
- classes (CL) - cadastro de turmas
- enrollments (EN) - matriculas vinculadas a turma
- students (ST) - alunos contabilizados na turma

RELACIONAMENTOS:
- series_classes.seriesId = series.id
- series_classes.classId = classes.id
- series_classes.id = enrollments.seriesClassId
- students.id = enrollments.studentId

FILTROS APLICADOS AGORA:
- escola/tenant atual (:schoolId): ${formatTenantAuditValue(params.tenantId, params.tenantName)}
- busca digitada (:searchTerm): ${formatAuditValue(searchTerm)}
- status selecionado (:statusFilter): ${statusFilter}
- serie selecionada (:seriesId): ${seriesFilter}
- registros exibidos apos os filtros: ${params.displayedRowsCount}
- ordenacao atual: ${getTurmasAuditOrderBy(params.sortColumn)} ${sortDirection}

OBSERVACAO SOBRE O FILTRO DA EMPRESA / ESCOLA:
- SC.tenantId e a coluna usada para isolar os dados da empresa / escola
- :schoolId acima ja esta preenchido com o tenantId real da escola logada
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

export default function TurmasPage() {
    const [links, setLinks] = useState<SeriesClassRecord[]>([]);
    const [series, setSeries] = useState<SeriesRecord[]>([]);
    const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
    const [searchTerm, setSearchTerm] = useState('');
    const [seriesFilter, setSeriesFilter] = useState<string>('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [successStatus, setSuccessStatus] = useState<string | null>(null);
    const [saveSuccessPopup, setSaveSuccessPopup] = useState<{ title: string; message: string } | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [currentBranchCode, setCurrentBranchCode] = useState(1);
    const [tenantBranches, setTenantBranches] = useState<TenantBranchSummary[]>([]);
    const [sortState, setSortState] = useState<GridSortState<SeriesClassColumnKey>>(DEFAULT_SORT);
    const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
    const [isGridConfigOpen, setIsGridConfigOpen] = useState(false);
    const [isGridConfigReady, setIsGridConfigReady] = useState(false);
    const [columnOrder, setColumnOrder] = useState<SeriesClassColumnKey[]>(SERIES_CLASS_GRID_COLUMN_KEYS);
    const [hiddenColumns, setHiddenColumns] = useState<SeriesClassColumnKey[]>(
        SERIES_CLASS_GRID_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_SERIES_CLASS_GRID_COLUMNS.includes(key)),
    );
    const [columnAggregations, setColumnAggregations] = useState<GridColumnAggregations<SeriesClassColumnKey>>({});
    const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
    const [seriesClassColumnFilters, setSeriesClassColumnFilters] = useState<SeriesClassColumnFilters>(EMPTY_SERIES_CLASS_COLUMN_FILTERS);
    const [seriesClassColumnFilterDrafts, setSeriesClassColumnFilterDrafts] = useState<SeriesClassColumnFilters>(EMPTY_SERIES_CLASS_COLUMN_FILTERS);
    const [activeSeriesClassFilterColumn, setActiveSeriesClassFilterColumn] = useState<SeriesClassColumnKey | null>(null);
    const [seriesClassPageSize, setSeriesClassPageSize] = useState(10);
    const [seriesClassPage, setSeriesClassPage] = useState(1);
    const [selectedSeriesClassGridRowId, setSelectedSeriesClassGridRowId] = useState<string | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFormat, setExportFormat] = useState<'excel' | 'csv' | 'pdf' | 'json' | 'txt'>('excel');
    const [exportColumns, setExportColumns] = useState<Record<SeriesClassExportColumnKey, boolean>>(buildDefaultExportColumns(SERIES_CLASS_EXPORT_COLUMNS));
    const [seriesClassStatusToggleTarget, setSeriesClassStatusToggleTarget] = useState<SeriesClassRecord | null>(null);
    const [seriesClassStatusToggleAction, setSeriesClassStatusToggleAction] = useState<'activate' | 'deactivate' | null>(null);
    const [isProcessingSeriesClassToggle, setIsProcessingSeriesClassToggle] = useState(false);
    const [classStudentsModalOpen, setClassStudentsModalOpen] = useState(false);
    const [classStudentsLoading, setClassStudentsLoading] = useState(false);
    const [classStudentsError, setClassStudentsError] = useState<string | null>(null);
    const [classStudentsData, setClassStudentsData] = useState<{ className: string; seriesName: string; students: ClassStudent[] } | null>(null);

    const canView = hasAllDashboardPermissions(currentRole, currentPermissions, ['VIEW_SERIES', 'VIEW_SERIES_CLASSES']);
    const canManageClasses = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_CLASSES');
    const canManageSeriesClasses = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_SERIES_CLASSES');
    const canManage = canManageClasses && canManageSeriesClasses;
    const canViewStudents = hasDashboardPermission(currentRole, currentPermissions, 'VIEW_STUDENTS');
    const canViewStudentFinancialData = hasDashboardPermission(currentRole, currentPermissions, 'VIEW_STUDENT_FINANCIAL_DATA');
    const hasShiftSelected = formData.shifts.length > 0;
    const tenantBranding = useMemo(() => readCachedTenantBranding(currentTenantId), [currentTenantId]);
    const orderedSeriesClassColumns = useMemo(
        () => columnOrder.map((key) => SERIES_CLASS_GRID_COLUMNS.find((column) => column.key === key)).filter((column): column is ConfigurableGridColumn<SeriesClassRecord, SeriesClassColumnKey> => !!column),
        [columnOrder],
    );
    const visibleSeriesClassColumns = useMemo(
        () => orderedSeriesClassColumns.filter((column) => !hiddenColumns.includes(column.key)),
        [hiddenColumns, orderedSeriesClassColumns],
    );
    const primarySeriesClassColumns = useMemo(() => {
        const primaryColumns = visibleSeriesClassColumns.filter((column) =>
            SERIES_CLASS_PRIMARY_GRID_COLUMN_KEYS.includes(column.key),
        );
        return primaryColumns.length > 0 ? primaryColumns : visibleSeriesClassColumns.slice(0, 1);
    }, [visibleSeriesClassColumns]);
    const secondarySeriesClassColumns = useMemo(() => {
        const primaryKeys = new Set(primarySeriesClassColumns.map((column) => column.key));
        return visibleSeriesClassColumns.filter((column) => !primaryKeys.has(column.key));
    }, [primarySeriesClassColumns, visibleSeriesClassColumns]);
    const filteredLinks = useMemo(() => {
        const term = searchTerm.trim().toUpperCase();
        const activeColumnFilters = (Object.entries(seriesClassColumnFilters) as Array<[SeriesClassColumnKey, string]>)
            .filter(([, value]) => value.trim());

        return links.filter((item) => {
            const matchesSeries = !seriesFilter || item.seriesId === seriesFilter;
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
            const matchesColumnFilters = activeColumnFilters.every(([columnKey, filter]) =>
                matchesSeriesClassGridFilter(getSeriesClassColumnFilterValues(item, columnKey), filter),
            );
            return matchesStatus && matchesSearch && matchesSeries && matchesColumnFilters;
        });
    }, [links, searchTerm, seriesClassColumnFilters, statusFilter, seriesFilter]);
    const sortedFilteredLinks = useMemo(
        () => sortGridRows(filteredLinks, SERIES_CLASS_COLUMNS, sortState),
        [filteredLinks, sortState],
    );
    const seriesClassTotalPages = Math.max(1, Math.ceil(sortedFilteredLinks.length / seriesClassPageSize));
    const currentSeriesClassPage = Math.min(Math.max(seriesClassPage, 1), seriesClassTotalPages);
    const paginatedSeriesClasses = useMemo(() => {
        const startIndex = (currentSeriesClassPage - 1) * seriesClassPageSize;
        return sortedFilteredLinks.slice(startIndex, startIndex + seriesClassPageSize);
    }, [currentSeriesClassPage, seriesClassPageSize, sortedFilteredLinks]);
    const hasSeriesClassGridFilters = useMemo(
        () =>
            Boolean(searchTerm.trim())
            || Boolean(seriesFilter)
            || statusFilter !== 'ACTIVE'
            || sortState.column !== DEFAULT_SORT.column
            || sortState.direction !== DEFAULT_SORT.direction
            || Object.values(seriesClassColumnFilters).some((value) => value.trim()),
        [searchTerm, seriesClassColumnFilters, seriesFilter, sortState.column, sortState.direction, statusFilter],
    );
    const aggregateSummaries = useMemo(
        () => buildGridAggregateSummaries(sortedFilteredLinks, visibleSeriesClassColumns, columnAggregations),
        [columnAggregations, sortedFilteredLinks, visibleSeriesClassColumns],
    );
    const turmasAuditContext = useMemo(() => {
        const selectedSeries = series.find((item) => item.id === seriesFilter);
        const auditParams: TurmasAuditParams = {
            tenantId: currentTenantId,
            tenantName: tenantBranding?.schoolName,
            searchTerm,
            statusFilter,
            seriesFilter,
            seriesFilterLabel: selectedSeries?.name || 'TODAS',
            displayedRowsCount: sortedFilteredLinks.length,
            sortColumn: sortState.column,
            sortDirection: sortState.direction,
        };

        return {
            auditText: buildTurmasAuditText(auditParams),
            sqlText: buildTurmasAuditSql(auditParams),
        };
    }, [currentTenantId, searchTerm, series, seriesFilter, sortState.column, sortState.direction, sortedFilteredLinks.length, statusFilter, tenantBranding?.schoolName]);

    useEffect(() => {
        dispatchScreenAuditContext({
            screenId: TURMAS_SCREEN_ID,
            auditText: turmasAuditContext.auditText,
            sqlText: turmasAuditContext.sqlText,
        });
    }, [turmasAuditContext]);

    const loadData = async () => {
        try {
            setIsLoading(true);
            setErrorStatus(null);

            const { token, role, permissions, tenantId, branchCode } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');
            setCurrentRole(role);
            setCurrentPermissions(permissions);
            setCurrentTenantId(tenantId);
            setCurrentBranchCode(branchCode);

            const [linksResponse, seriesResponse, branchesData] = await Promise.all([
                fetch(`${API_BASE_URL}/series-classes`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/series`, { headers: { Authorization: `Bearer ${token}` } }),
                fetchTenantBranches().catch(() => []),
            ]);

            const [linksData, seriesData] = await Promise.all([
                linksResponse.json().catch(() => null),
                seriesResponse.json().catch(() => null),
            ]);

            if (!linksResponse.ok) throw new Error(linksData?.message || 'Não foi possível carregar as turmas.');
            if (!seriesResponse.ok) throw new Error(seriesData?.message || 'Não foi possível carregar as séries.');
            setLinks(Array.isArray(linksData) ? linksData : []);
            setSeries(Array.isArray(seriesData) ? seriesData : []);
            setTenantBranches(Array.isArray(branchesData) ? branchesData : []);
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
        void loadGridColumnConfig(getSeriesClassGridConfigStorageKey(currentTenantId), SERIES_CLASS_GRID_COLUMN_KEYS, DEFAULT_VISIBLE_SERIES_CLASS_GRID_COLUMNS).then((config) => {
            if (!isMounted) return;
            setColumnOrder(config.order.filter((key) => SERIES_CLASS_GRID_COLUMN_KEYS.includes(key)));
            setHiddenColumns(config.hidden.filter((key) => SERIES_CLASS_GRID_COLUMN_KEYS.includes(key)));
            setColumnAggregations(config.aggregations);
            setIsGridConfigReady(true);
        });
        return () => {
            isMounted = false;
        };
    }, [currentTenantId]);

    useEffect(() => {
        if (!isGridConfigReady) return;
        writeGridColumnConfig(getSeriesClassGridConfigStorageKey(currentTenantId), SERIES_CLASS_GRID_COLUMN_KEYS, columnOrder, hiddenColumns, columnAggregations);
    }, [columnAggregations, columnOrder, currentTenantId, hiddenColumns, isGridConfigReady]);

    useEffect(() => {
        setSeriesClassPage(1);
    }, [searchTerm, seriesClassColumnFilters, seriesClassPageSize, seriesFilter, sortState.column, sortState.direction, statusFilter]);

    useEffect(() => {
        setSeriesClassPage((current) => Math.min(Math.max(current, 1), seriesClassTotalPages));
    }, [seriesClassTotalPages]);

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

    const returnFromSaveSuccessPopup = () => {
        setSaveSuccessPopup(null);
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
            && !item.canceledAt
            && !item.class?.canceledAt
            && !item.series?.canceledAt
        );
    };

    const buildSmtpPayload = () => {
        const payload: Record<string, unknown> = {
            smtpEnabled: formData.smtpEnabled,
            smtpAuthenticate: formData.smtpAuthenticate,
            smtpSecure: formData.smtpSecure,
        };

        const smtpHost = formData.smtpHost.trim();
        const smtpPort = parseOptionalInteger(formData.smtpPort);
        const smtpTimeout = parseOptionalInteger(formData.smtpTimeout);
        const smtpAuthType = formData.smtpAuthType.trim().toUpperCase();
        const smtpEmail = formData.smtpEmail.trim().toUpperCase();
        const smtpSenderName = formData.smtpSenderName.trim();
        const smtpReplyTo = formData.smtpReplyTo.trim().toUpperCase();

        if (smtpHost) payload.smtpHost = smtpHost;
        if (smtpPort) payload.smtpPort = smtpPort;
        if (smtpTimeout) payload.smtpTimeout = smtpTimeout;
        if (smtpAuthType) payload.smtpAuthType = smtpAuthType;
        if (smtpEmail) payload.smtpEmail = smtpEmail;
        if (smtpSenderName) payload.smtpSenderName = smtpSenderName;
        if (smtpReplyTo) payload.smtpReplyTo = smtpReplyTo;
        if (formData.smtpPassword.trim()) {
            payload.smtpPassword = formData.smtpPassword.trim();
        }

        return payload;
    };

    const createClassAndLink = async (token: string, payload: { branchCode: number; seriesId: string; name: string; shifts: ShiftValue[]; defaultMonthlyFee: string }) => {
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
                branchCode: payload.branchCode,
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
                branchCode: payload.branchCode,
                ...buildSmtpPayload(),
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

            const wasEditing = Boolean(editingId);
            if (wasEditing && editingId) {
                const current = links.find((item) => item.id === editingId);
                if (!current?.class?.id) throw new Error('Turma selecionada para edição não foi encontrada.');
                const targetBranchCode = tenantBranches.length <= 1 ? currentBranchCode : formData.branchCode;

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
                        branchCode: targetBranchCode,
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
                        branchCode: targetBranchCode,
                        ...buildSmtpPayload(),
                    }),
                });

                const linkData = await linkResponse.json().catch(() => null);
                if (!linkResponse.ok) throw new Error(linkData?.message || 'Não foi possível atualizar o vínculo da turma.');
            } else {
                await createClassAndLink(token, {
                    branchCode: tenantBranches.length <= 1 ? currentBranchCode : formData.branchCode,
                    seriesId: formData.seriesId,
                    name: normalizedName,
                    shifts: formData.shifts,
                    defaultMonthlyFee: formData.defaultMonthlyFee,
                });
            }

            closeModal();
            setSaveSuccessPopup({
                title: wasEditing ? 'Turma salva com sucesso' : 'Turma inserida com sucesso',
                message: wasEditing ? 'A turma foi alterada e a lista já foi atualizada.' : 'A turma foi inserida e a lista já foi atualizada.',
            });
            void loadData();
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível salvar a turma.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleEdit = (item: SeriesClassRecord) => {
        setEditingId(item.id);
        setFormData({
            branchCode: typeof item.branchCode === 'number' ? item.branchCode : (typeof item.class?.branchCode === 'number' ? item.class.branchCode : currentBranchCode),
            seriesId: item.seriesId,
            name: item.class?.name || '',
            shifts: item.class?.shift ? splitShiftValue(item.class.shift) : [],
            defaultMonthlyFee: formatMoneyValue(item.class?.defaultMonthlyFee),
            smtpEnabled: Boolean(item.smtpEnabled),
            smtpHost: item.smtpHost || '',
            smtpPort: item.smtpPort ? String(item.smtpPort) : '465',
            smtpTimeout: item.smtpTimeout ? String(item.smtpTimeout) : '60',
            smtpAuthenticate: item.smtpAuthenticate ?? true,
            smtpSecure: item.smtpSecure ?? true,
            smtpAuthType: item.smtpAuthType || 'SSL',
            smtpEmail: item.smtpEmail || '',
            smtpPassword: '',
            smtpSenderName: item.smtpSenderName || '',
            smtpReplyTo: item.smtpReplyTo || '',
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
            contextLabel="PRINCIPAL_TURMAS_POPUP"
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
        const visibleCount = SERIES_CLASS_GRID_COLUMN_KEYS.length - hiddenColumns.length;
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
        setColumnOrder(SERIES_CLASS_GRID_COLUMN_KEYS);
        setHiddenColumns(SERIES_CLASS_GRID_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_SERIES_CLASS_GRID_COLUMNS.includes(key)));
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

    const clearAllSeriesClassGridFilters = () => {
        setSearchTerm('');
        setSeriesFilter('');
        setStatusFilter('ACTIVE');
        setSortState(DEFAULT_SORT);
        setSeriesClassColumnFilters(EMPTY_SERIES_CLASS_COLUMN_FILTERS);
        setSeriesClassColumnFilterDrafts(EMPTY_SERIES_CLASS_COLUMN_FILTERS);
        setActiveSeriesClassFilterColumn(null);
        setSeriesClassPage(1);
    };

    const openSeriesClassColumnFilter = (columnKey: SeriesClassColumnKey | null) => {
        setActiveSeriesClassFilterColumn(columnKey);
        if (!columnKey) return;
        setSeriesClassColumnFilterDrafts((current) => ({
            ...current,
            [columnKey]: seriesClassColumnFilters[columnKey] || '',
        }));
    };

    const applySeriesClassColumnFilter = (columnKey: SeriesClassColumnKey) => {
        setSeriesClassColumnFilters((current) => ({
            ...current,
            [columnKey]: seriesClassColumnFilterDrafts[columnKey] || '',
        }));
        setActiveSeriesClassFilterColumn(null);
    };

    const clearSeriesClassColumnFilter = (columnKey: SeriesClassColumnKey) => {
        setSeriesClassColumnFilters((current) => ({ ...current, [columnKey]: '' }));
        setSeriesClassColumnFilterDrafts((current) => ({ ...current, [columnKey]: '' }));
        setActiveSeriesClassFilterColumn(null);
    };

    const renderSeriesClassClearAllButton = () => (
        <button
            type="button"
            onClick={clearAllSeriesClassGridFilters}
            title="Limpar todos os filtros"
            aria-label="Limpar todos os filtros"
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
                hasSeriesClassGridFilters
                    ? 'border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100'
                    : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
            }`}
        >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 7h14M10 11v6m4-6v6M9 7V5h6v2m-9 0 1 14h10l1-14" />
            </svg>
        </button>
    );

    const renderSeriesClassColumnHeader = (column: ConfigurableGridColumn<SeriesClassRecord, SeriesClassColumnKey>) => (
        <GridColumnFilterHeader
            label={column.label}
            align={column.align}
            isOpen={activeSeriesClassFilterColumn === column.key}
            isActive={Boolean(seriesClassColumnFilters[column.key]?.trim()) || sortState.column === column.key}
            filterValue={seriesClassColumnFilterDrafts[column.key] || ''}
            onToggle={() => openSeriesClassColumnFilter(activeSeriesClassFilterColumn === column.key ? null : column.key)}
            onSort={(direction) => {
                setSortState({ column: column.key, direction });
                setActiveSeriesClassFilterColumn(null);
            }}
            onFilterValueChange={(value) =>
                setSeriesClassColumnFilterDrafts((current) => ({
                    ...current,
                    [column.key]: value,
                }))
            }
            onApply={() => applySeriesClassColumnFilter(column.key)}
            onClear={() => clearSeriesClassColumnFilter(column.key)}
        />
    );

    const openStudentsModal = async (item: SeriesClassRecord) => {
        setClassStudentsModalOpen(true);
        setClassStudentsLoading(true);
        setClassStudentsError(null);
        setClassStudentsData(null);
        try {
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const response = await fetch(`${API_BASE_URL}/series-classes/${item.id}/students`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Não foi possível carregar os alunos da turma.');

            setClassStudentsData({
                className: item.class?.name || 'Turma',
                seriesName: item.series?.name || 'Série não informada',
                students: Array.isArray(data.students) ? data.students.map((student: ClassStudent) => ({
                    ...student,
                    updatedAt: student.updatedAt ? student.updatedAt : null,
                })) : [],
            });
        } catch (error) {
            setClassStudentsError(error instanceof Error ? error.message : 'Não foi possível carregar os alunos da turma.');
        } finally {
            setClassStudentsLoading(false);
        }
    };

    const closeClassStudentsModal = () => {
        setClassStudentsModalOpen(false);
        setClassStudentsData(null);
        setClassStudentsError(null);
    };

    const renderSeriesClassGridCell = (item: SeriesClassRecord, columnKey: SeriesClassColumnKey) => {
        const isActive = !item.canceledAt && !item.class?.canceledAt && !item.series?.canceledAt;
        const tone = isActive ? 'text-slate-600' : 'text-rose-700';
        const statusLabel = isActive ? 'ATIVO' : 'INATIVO';
        if (columnKey === 'className') {
            return (
                <td key={columnKey} className={`px-6 py-4 font-semibold ${isActive ? 'text-slate-800' : 'text-rose-800'}`}>
                    <div className="flex items-center gap-2">
                        <span
                            className={`h-3 w-3 shrink-0 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                            title={statusLabel}
                            aria-label={statusLabel}
                        />
                        <span>{item.class?.name || '---'}</span>
                    </div>
                </td>
            );
        }
        if (columnKey === 'series') return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${tone}`}>{item.series?.name || '---'}</td>;
        if (columnKey === 'seriesSortOrder') return <td key={columnKey} className={`px-6 py-4 text-sm font-semibold ${tone}`}>{item.series?.sortOrder !== null && item.series?.sortOrder !== undefined ? String(item.series.sortOrder) : '---'}</td>;
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
                <span
                    className={`inline-flex h-3 w-3 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    title={statusLabel}
                    aria-label={statusLabel}
                />
            </td>
        );
    };

    const renderSeriesClassGridDetailValue = (item: SeriesClassRecord, columnKey: SeriesClassColumnKey) => {
        const isActive = !item.canceledAt && !item.class?.canceledAt && !item.series?.canceledAt;
        const tone = isActive ? 'text-slate-700' : 'text-rose-700';
        const statusLabel = isActive ? 'ATIVO' : 'INATIVO';

        if (columnKey === 'className') {
            return (
                <div className={`flex min-w-0 items-center gap-2 font-semibold ${isActive ? 'text-slate-800' : 'text-rose-800'}`}>
                    <span
                        className={`h-3 w-3 shrink-0 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                        title={statusLabel}
                        aria-label={statusLabel}
                    />
                    <span className="truncate">{item.class?.name || '---'}</span>
                </div>
            );
        }

        if (columnKey === 'series') return <span className={tone}>{item.series?.name || '---'}</span>;
        if (columnKey === 'seriesSortOrder') return <span className={tone}>{item.series?.sortOrder !== null && item.series?.sortOrder !== undefined ? String(item.series.sortOrder) : '---'}</span>;
        if (columnKey === 'seriesCode') return <span className={tone}>{item.series?.code || '---'}</span>;

        if (columnKey === 'shift') {
            return (
                <div className="flex flex-wrap gap-2">
                    {splitShiftValue(item.class?.shift || '').map((shift) => (
                        <span key={`${item.id}-detail-${shift}`} className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${getShiftTone(shift)}`}>
                            {getShiftLabel(shift)}
                        </span>
                    ))}
                </div>
            );
        }

        if (columnKey === 'studentsCount') return <span className={tone}>{String(item.studentCount ?? item._count?.enrollments ?? 0)}</span>;

        if (columnKey === 'defaultMonthlyFee') {
            const value = formatMoneyValue(item.class?.defaultMonthlyFee);
            return <span className={tone}>{value ? `R$ ${value}` : '---'}</span>;
        }

        if (columnKey === 'totalMonthlyFee') {
            return <span className={tone}>{typeof item.totalMonthlyFee === 'number' ? `R$ ${formatMoneyValue(item.totalMonthlyFee)}` : 'Dado sensível'}</span>;
        }

        return (
            <span
                className={`inline-flex h-3 w-3 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                title={statusLabel}
                aria-label={statusLabel}
            />
        );
    };

    const renderSeriesClassGridDetailItem = (
        item: SeriesClassRecord,
        column: ConfigurableGridColumn<SeriesClassRecord, SeriesClassColumnKey>,
    ) => (
        <div key={column.key} className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{column.label}</div>
            <div className="mt-1 min-w-0 text-sm font-semibold">
                {renderSeriesClassGridDetailValue(item, column.key)}
            </div>
        </div>
    );

    return (
        <div className="flex h-[calc(100vh-4.5rem)] min-h-0 w-full flex-col">
            <PrincipalProgramHeader
                eyebrow="Central acadêmica"
                title="Turmas"
                description="Cadastre as turmas e consulte seus turnos e vínculos com séries."
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

            <section className="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="dashboard-band shrink-0 border-b px-6 py-4">
                    <div className="flex flex-wrap items-center gap-4">
                        {canManage ? (
                            <button
                                type="button"
                                onClick={openCreateModal}
                                title="Cadastrar nova turma"
                                aria-label="Cadastrar nova turma"
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-500 active:scale-95"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                        ) : null}
                        <div className="relative w-full max-w-xs">
                            <input
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Buscar turma..."
                                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <select
                            value={seriesFilter}
                            onChange={(event) => setSeriesFilter(event.target.value)}
                            className="w-full max-w-xs rounded-lg border border-slate-200 bg-white py-2.5 px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                        >
                            <option value="">Todas as séries</option>
                            {series.map((item) => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-auto">
                    <table className="min-w-full table-fixed border-collapse text-left">
                        <colgroup>
                            <col className="w-12" />
                            {primarySeriesClassColumns.map((column) => (
                                <col key={column.key} />
                            ))}
                            <col className="w-56" />
                        </colgroup>
                        <thead>
                            <tr className="dashboard-table-head border-b border-slate-300 text-[13px] font-bold uppercase tracking-wider">
                                <th rowSpan={secondarySeriesClassColumns.length > 0 ? 2 : 1} className="sticky top-0 z-20 w-12 bg-slate-50 px-3 py-3 text-left">
                                    {renderSeriesClassClearAllButton()}
                                </th>
                                {primarySeriesClassColumns.map((column) => (
                                    <th key={column.key} className="sticky top-0 z-20 bg-slate-50 px-6 py-3">
                                        {renderSeriesClassColumnHeader(column)}
                                    </th>
                                ))}
                                <th rowSpan={secondarySeriesClassColumns.length > 0 ? 2 : 1} className="sticky top-0 z-20 w-56 bg-slate-50 px-6 py-3 text-right">Ação</th>
                            </tr>
                            {secondarySeriesClassColumns.length > 0 ? (
                                <tr className="dashboard-table-head border-b border-slate-300 text-[12px] font-bold uppercase tracking-wider">
                                    <th colSpan={primarySeriesClassColumns.length} className="sticky top-[45px] z-20 bg-slate-50 px-6 py-2">
                                        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${secondarySeriesClassColumns.length}, minmax(0, 1fr))` }}>
                                            {secondarySeriesClassColumns.map((column) => (
                                                <div key={column.key} className="min-w-0">
                                                    {renderSeriesClassColumnHeader(column)}
                                                </div>
                                            ))}
                                        </div>
                                    </th>
                                </tr>
                            ) : null}
                            {activeSeriesClassFilterColumn ? (
                                <tr aria-hidden="true">
                                    <th colSpan={primarySeriesClassColumns.length + 2} className="h-56 bg-white p-0" />
                                </tr>
                            ) : null}
                        </thead>
                        <tbody>
                            {isLoading ? <tr><td colSpan={primarySeriesClassColumns.length + 2} className="px-6 py-12 text-center font-medium text-slate-400">Carregando turmas...</td></tr> : null}
                            {!isLoading && sortedFilteredLinks.length === 0 ? <tr><td colSpan={primarySeriesClassColumns.length + 2} className="px-6 py-12 text-center font-medium text-slate-400">Nenhuma turma cadastrada.</td></tr> : null}
                            {!isLoading && paginatedSeriesClasses.map((item, rowIndex) => {
                                const isActive = !item.canceledAt && !item.class?.canceledAt && !item.series?.canceledAt;
                                const zebraClass = rowIndex % 2 === 0
                                    ? isActive
                                        ? 'bg-white hover:bg-slate-50'
                                        : 'bg-rose-100/80 hover:bg-rose-200/80'
                                    : isActive
                                        ? 'bg-slate-200/70 hover:bg-slate-300/60'
                                        : 'bg-rose-200/70 hover:bg-rose-300/70';
                                const isSelectedRow = selectedSeriesClassGridRowId === item.id;
                                const rowClass = isSelectedRow
                                    ? 'bg-blue-100 outline outline-2 outline-blue-400 outline-offset-[-2px] hover:bg-blue-100'
                                    : zebraClass;
                                const hasSecondLine = secondarySeriesClassColumns.length > 0;

                                return (
                                    <Fragment key={item.id}>
                                        <tr
                                            onClick={() => setSelectedSeriesClassGridRowId(item.id)}
                                            aria-selected={isSelectedRow}
                                            className={`group cursor-pointer border-t border-slate-100 transition-colors ${rowClass}`}
                                        >
                                            <td rowSpan={hasSecondLine ? 2 : 1} className="px-3 py-4" />
                                            {primarySeriesClassColumns.map((column) => renderSeriesClassGridCell(item, column.key))}
                                            <td rowSpan={hasSecondLine ? 2 : 1} className="w-56 px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    {canViewStudents ? (
                                                        <GridRowActionIconButton title="Listar alunos da turma" onClick={() => void openStudentsModal(item)} tone="emerald">
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" fill="none" />
                                                                <circle cx="17" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" fill="none" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 20v-1a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v1" />
                                                            </svg>
                                                        </GridRowActionIconButton>
                                                    ) : null}
                                                    {renderSeriesClassInfoButton(item)}
                                                    <GridRowActionIconButton title="Editar turma" onClick={() => handleEdit(item)} tone="blue">
                                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </GridRowActionIconButton>
                                                    <GridRowActionIconButton title={isActive ? 'Inativar turma' : 'Ativar turma'} onClick={() => openSeriesClassStatusModal(item)} tone={isActive ? 'rose' : 'emerald'}>
                                                        {isActive ? (
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
                                        {hasSecondLine ? (
                                            <tr
                                                onClick={() => setSelectedSeriesClassGridRowId(item.id)}
                                                aria-selected={isSelectedRow}
                                                className={`group cursor-pointer transition-colors ${rowClass}`}
                                            >
                                                <td colSpan={primarySeriesClassColumns.length} className="px-6 pb-4 pt-0">
                                                    <div className="grid gap-x-5 gap-y-2 border-t border-slate-300/50 pt-3" style={{ gridTemplateColumns: `repeat(${secondarySeriesClassColumns.length}, minmax(0, 1fr))` }}>
                                                        {secondarySeriesClassColumns.map((column) => renderSeriesClassGridDetailItem(item, column))}
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : null}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <GridStandardFooter
                    recordsCount={sortedFilteredLinks.length}
                    onOpenColumns={() => setIsGridConfigOpen(true)}
                    onOpenExport={() => setIsExportModalOpen(true)}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    activeLabel="Mostrar somente turmas ativas"
                    allLabel="Mostrar turmas ativas e inativas"
                    inactiveLabel="Mostrar somente turmas inativas"
                    aggregateSummaries={aggregateSummaries}
                    pageSize={seriesClassPageSize}
                    onPageSizeChange={setSeriesClassPageSize}
                    currentPage={currentSeriesClassPage}
                    totalPages={seriesClassTotalPages}
                    onFirstPage={() => setSeriesClassPage(1)}
                    onPreviousPage={() => setSeriesClassPage((current) => Math.max(1, current - 1))}
                    onNextPage={() => setSeriesClassPage((current) => Math.min(seriesClassTotalPages, current + 1))}
                    onLastPage={() => setSeriesClassPage(seriesClassTotalPages)}
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
                confirmLabel={seriesClassStatusToggleAction === 'activate' ? 'Confirmar ativação' : 'Confirmar inativação'}
                screenId={TURMAS_STATUS_MODAL_SCREEN_ID}
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
                                    <h2 className="truncate text-xl font-bold text-[#153a6a]">{editingId ? 'Editar turma' : 'Nova turma'}</h2>
                                </div>
                            </div>
                            <button onClick={closeModal} className="text-slate-400 hover:text-red-500">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr_0.9fr]">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-600">Nome da turma</label>
                                    <input
                                        required
                                        value={formData.name}
                                        onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value.toUpperCase() }))}
                                        placeholder="Informe o nome da turma"
                                        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-600">Série</label>
                                    <select
                                        value={formData.seriesId}
                                        onChange={(event) => setFormData((current) => ({ ...current, seriesId: event.target.value }))}
                                        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                                    >
                                        <option value="">Selecionar série</option>
                                        {series.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-600">Mensalidade padrão</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.defaultMonthlyFee}
                                        onChange={(event) => setFormData((current) => ({ ...current, defaultMonthlyFee: event.target.value }))}
                                        placeholder="Informe o valor"
                                        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                                    />
                                </div>
                                <TenantBranchSelect
                                    branches={tenantBranches}
                                    value={formData.branchCode}
                                    onChange={(branchCode) => setFormData((current) => ({ ...current, branchCode }))}
                                    variant="pills"
                                    label="Filiais"
                                    containerClassName="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 md:col-span-3"
                                />
                            </div>
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

                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-600">E-mail da turma</p>
                                        <p className="mt-1 text-xs font-semibold text-slate-500">Quando ativo, este SMTP será usado antes da filial e da empresa.</p>
                                    </div>
                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={formData.smtpEnabled}
                                            onChange={(event) => setFormData((current) => ({ ...current, smtpEnabled: event.target.checked }))}
                                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        Usar SMTP da turma
                                    </label>
                                </div>
                                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <input
                                        value={formData.smtpHost}
                                        onChange={(event) => setFormData((current) => ({ ...current, smtpHost: event.target.value }))}
                                        placeholder="Servidor SMTP"
                                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    />
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.smtpPort}
                                        onChange={(event) => setFormData((current) => ({ ...current, smtpPort: event.target.value }))}
                                        placeholder="Porta"
                                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    />
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.smtpTimeout}
                                        onChange={(event) => setFormData((current) => ({ ...current, smtpTimeout: event.target.value }))}
                                        placeholder="Timeout"
                                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    />
                                    <select
                                        value={formData.smtpAuthType}
                                        onChange={(event) => setFormData((current) => ({ ...current, smtpAuthType: event.target.value }))}
                                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    >
                                        <option value="SSL">SSL</option>
                                        <option value="TLS">TLS</option>
                                        <option value="STARTTLS">STARTTLS</option>
                                    </select>
                                    <input
                                        value={formData.smtpEmail}
                                        onChange={(event) => setFormData((current) => ({ ...current, smtpEmail: event.target.value.toUpperCase() }))}
                                        placeholder="E-mail remetente"
                                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 md:col-span-2"
                                    />
                                    <input
                                        type="password"
                                        value={formData.smtpPassword}
                                        onChange={(event) => setFormData((current) => ({ ...current, smtpPassword: event.target.value }))}
                                        placeholder={editingId ? 'Nova senha SMTP, se quiser alterar' : 'Senha SMTP / App Password'}
                                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 md:col-span-2"
                                    />
                                    <input
                                        value={formData.smtpSenderName}
                                        onChange={(event) => setFormData((current) => ({ ...current, smtpSenderName: event.target.value }))}
                                        placeholder="Nome do remetente"
                                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 md:col-span-2"
                                    />
                                    <input
                                        value={formData.smtpReplyTo}
                                        onChange={(event) => setFormData((current) => ({ ...current, smtpReplyTo: event.target.value.toUpperCase() }))}
                                        placeholder="Responder para"
                                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 md:col-span-2"
                                    />
                                </div>
                                <div className="mt-3 flex flex-wrap gap-3">
                                    <label className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                                        <input type="checkbox" checked={formData.smtpAuthenticate} onChange={(event) => setFormData((current) => ({ ...current, smtpAuthenticate: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                        Autenticação
                                    </label>
                                    <label className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                                        <input type="checkbox" checked={formData.smtpSecure} onChange={(event) => setFormData((current) => ({ ...current, smtpSecure: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                        Conexão segura
                                    </label>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 border-t border-slate-100 pt-5">
                                <div className="flex items-center justify-between gap-3">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        className="rounded-xl bg-rose-500 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-rose-600"
                                    >
                                        Fechar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!canManage || isSaving || !hasShiftSelected}
                                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-md shadow-blue-500/20 transition-all text-sm disabled:bg-slate-300 disabled:cursor-not-allowed"
                                    >
                                        {isSaving ? 'Salvando...' : editingId ? 'Salvar edição' : 'Cadastrar turma'}
                                    </button>
                                </div>
                                <div className="flex justify-end">
                                    <ScreenNameCopy
                                        screenId={TURMAS_NEW_CLASS_MODAL_SCREEN_ID}
                                        className="mt-0"
                                    />
                                </div>
                            </div>
                        </form>
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
                                onClick={returnFromSaveSuccessPopup}
                                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
                            >
                                Voltar para lista
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {classStudentsModalOpen ? (
                <div className="fixed inset-0 z-[58] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-4xl overflow-hidden rounded-[32px] bg-white shadow-2xl">
                        <div className="dashboard-band border-b px-6 py-5">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Alunos da turma</div>
                                <h3 className="mt-1 text-2xl font-black text-slate-800">{classStudentsData?.className || 'Turma'}</h3>
                                <p className="text-sm font-semibold text-slate-500">{classStudentsData?.seriesName || 'Série não informada'}</p>
                            </div>
                        </div>
                        <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
                            {classStudentsLoading ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center text-sm font-medium text-slate-500">
                                    Carregando alunos da turma...
                                </div>
                            ) : classStudentsError ? (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-12 text-center text-sm font-medium text-red-700">
                                    {classStudentsError}
                                </div>
                            ) : classStudentsData && classStudentsData.students.length === 0 ? (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-12 text-center text-sm font-medium text-slate-500">
                                    Nenhum aluno encontrado para esta turma.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                                                <th className="px-3 py-2">Aluno</th>
                                                <th className="px-3 py-2">CPF</th>
                                                <th className="px-3 py-2">E-mail</th>
                                                <th className="px-3 py-2">Telefone</th>
                                                <th className="px-3 py-2">Atualização</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {classStudentsData?.students.map((student) => (
                                                <tr key={student.id} className="bg-white">
                                                    <td className="px-3 py-3 font-semibold text-slate-700">{student.name}</td>
                                                    <td className="px-3 py-3 text-slate-500">{student.cpf || '-'}</td>
                                                    <td className="px-3 py-3 text-slate-500">{student.email || '-'}</td>
                                                    <td className="px-3 py-3 text-slate-500">{formatPhoneNumber(student.phone) || '-'}</td>
                                                    <td className="px-3 py-3 text-slate-500">
                                                        {student.updatedAt ? new Date(student.updatedAt).toLocaleDateString('pt-BR') : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                        <div className="dashboard-band-footer flex items-center justify-between border-t px-6 py-3 gap-4">
                            <button
                                type="button"
                                onClick={closeClassStudentsModal}
                                className="rounded-xl border border-rose-500 bg-rose-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-600"
                            >
                                Fechar
                            </button>
                            <div className="text-xs font-semibold text-slate-600">
                                Total de alunos: {classStudentsData?.students.length ?? 0}
                            </div>
                            <ScreenNameCopy screenId={TURMAS_STUDENTS_MODAL_SCREEN_ID} />
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

