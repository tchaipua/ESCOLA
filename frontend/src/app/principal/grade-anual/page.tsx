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
import GridSortableHeader from '@/app/components/grid-sortable-header';
import { type GridStatusFilterValue } from '@/app/components/grid-status-filter';
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
import { buildDefaultExportColumns, buildExportColumnsFromGridColumns, exportGridRows, sortGridRows, type GridColumnDefinition, type GridExportFormat, type GridSortState } from '@/app/lib/grid-export-utils';
import { dedupeSeriesClassOptions } from '@/app/lib/series-class-option-utils';

const API_BASE_URL = 'http://localhost:3001/api/v1';
const inputClass = 'w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20';

type SchoolYearSummary = {
    id: string;
    year: number;
    isActive?: boolean;
};

type SeriesSummary = {
    id: string;
    name: string;
};

type ClassSummary = {
    id: string;
    name: string;
};

type SeriesClassSummary = {
    id: string;
    series?: SeriesSummary | null;
    class?: ClassSummary | null;
    canceledAt?: string | null;
};

type LessonCalendarPeriodRecord = {
    id?: string;
    periodType: 'AULA' | 'INTERVALO';
    startDate: string;
    endDate: string;
};

type LessonCalendarRecord = {
    id: string;
    canceledAt?: string | null;
    lastWeeklySyncAt?: string | null;
    generatedItemsCount: number;
    classPeriodsCount: number;
    intervalPeriodsCount: number;
    classPeriodsLabel?: string;
    intervalPeriodsLabel?: string;
    schoolYear?: SchoolYearSummary | null;
    seriesClass?: {
        id: string;
        series?: SeriesSummary | null;
        class?: ClassSummary | null;
    } | null;
    periods: LessonCalendarPeriodRecord[];
};

type WeeklySourceItem = {
    id: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    teacherSubjectId: string;
    teacherSubject?: {
        id: string;
        teacher?: { id: string; name: string } | null;
        subject?: { id: string; name: string } | null;
    } | null;
};

type WeeklySourceResponse = {
    schoolYear?: SchoolYearSummary | null;
    seriesClass?: {
        id: string;
        series?: SeriesSummary | null;
        class?: ClassSummary | null;
    } | null;
    items: WeeklySourceItem[];
};

type PeriodFormState = {
    localId: string;
    periodType: 'AULA' | 'INTERVALO';
    startDate: string;
    endDate: string;
};

type FormState = {
    schoolYearId: string;
    seriesClassId: string;
    periods: PeriodFormState[];
};

type AnnualColumnKey =
    | 'schoolYear'
    | 'seriesClass'
    | 'classPeriodsCount'
    | 'intervalPeriodsCount'
    | 'generatedItemsCount'
    | 'lastWeeklySyncAt'
    | 'recordStatus';
type AnnualExportColumnKey = AnnualColumnKey;

const EMPTY_FORM: FormState = {
    schoolYearId: '',
    seriesClassId: '',
    periods: [],
};

const DEFAULT_SORT: GridSortState<AnnualColumnKey> = {
    column: 'schoolYear',
    direction: 'desc',
};

const GRID_COLUMNS: ConfigurableGridColumn<LessonCalendarRecord, AnnualColumnKey>[] = [
    { key: 'schoolYear', label: 'Ano letivo', getValue: (row) => String(row.schoolYear?.year || '---'), getSortValue: (row) => row.schoolYear?.year || 0 },
    { key: 'seriesClass', label: 'Turma', getValue: (row) => getSeriesClassLabel(row.seriesClass), getSortValue: (row) => getSeriesClassLabel(row.seriesClass) },
    {
        key: 'classPeriodsCount',
        label: 'Períodos de aula',
        getValue: (row) => String(row.classPeriodsCount),
        getSortValue: (row) => row.classPeriodsCount,
        aggregateOptions: ['sum', 'avg', 'min', 'max'],
        getAggregateValue: (row) => row.classPeriodsCount,
    },
    {
        key: 'intervalPeriodsCount',
        label: 'Férias / intervalos',
        getValue: (row) => String(row.intervalPeriodsCount),
        getSortValue: (row) => row.intervalPeriodsCount,
        aggregateOptions: ['sum', 'avg', 'min', 'max'],
        getAggregateValue: (row) => row.intervalPeriodsCount,
    },
    {
        key: 'generatedItemsCount',
        label: 'Aulas geradas',
        getValue: (row) => String(row.generatedItemsCount),
        getSortValue: (row) => row.generatedItemsCount,
        aggregateOptions: ['sum', 'avg', 'min', 'max'],
        getAggregateValue: (row) => row.generatedItemsCount,
    },
    { key: 'recordStatus', label: 'Status do cadastro', getValue: (row) => (row.canceledAt ? 'INATIVO' : 'ATIVO'), visibleByDefault: false },
];

const GRID_EXPORT_COLUMNS: GridColumnDefinition<LessonCalendarRecord, AnnualExportColumnKey>[] = buildExportColumnsFromGridColumns(
    GRID_COLUMNS,
);

const GRID_COLUMN_KEYS = getAllGridColumnKeys(GRID_COLUMNS);
const DEFAULT_VISIBLE_GRID_COLUMNS = getDefaultVisibleGridColumnKeys(GRID_COLUMNS);

function getGridConfigStorageKey(tenantId: string | null) {
    return `dashboard:grade-anual:grid-config:${tenantId || 'default'}`;
}

function getGridExportConfigStorageKey(tenantId: string | null) {
    return `dashboard:grade-anual:export-config:${tenantId || 'default'}`;
}

function makeLocalPeriodId() {
    return `period-${Math.random().toString(36).slice(2, 11)}`;
}

function buildDefaultPeriods(): PeriodFormState[] {
    return [{ localId: makeLocalPeriodId(), periodType: 'AULA', startDate: '', endDate: '' }];
}

function getApiErrorMessage(payload: unknown, fallback: string) {
    if (payload && typeof payload === 'object' && 'message' in payload) {
        const message = (payload as { message?: unknown }).message;
        if (Array.isArray(message)) {
            return message.map((item) => String(item || '').trim()).filter(Boolean).join(' ');
        }
        if (typeof message === 'string' && message.trim()) return message;
    }
    return fallback;
}

function getSeriesClassLabel(seriesClass?: SeriesClassSummary | LessonCalendarRecord['seriesClass'] | WeeklySourceResponse['seriesClass'] | null) {
    const className = seriesClass?.class?.name || 'SEM TURMA';
    const seriesName = seriesClass?.series?.name || 'SEM SÉRIE';
    return `${className} - ${seriesName}`;
}

function normalizeSeriesClassOptions(input: unknown): SeriesClassSummary[] {
    const items = Array.isArray(input) ? (input as SeriesClassSummary[]) : [];
    return dedupeSeriesClassOptions(items, getSeriesClassLabel);
}

function getDayLabel(value: string) {
    switch (value) {
        case 'SEGUNDA':
            return 'Segunda-feira';
        case 'TERCA':
            return 'Terça-feira';
        case 'QUARTA':
            return 'Quarta-feira';
        case 'QUINTA':
            return 'Quinta-feira';
        case 'SEXTA':
            return 'Sexta-feira';
        case 'SABADO':
            return 'Sábado';
        case 'DOMINGO':
            return 'Domingo';
        default:
            return value;
    }
}

export default function GradeAnualPage() {
    const [records, setRecords] = useState<LessonCalendarRecord[]>([]);
    const [schoolYears, setSchoolYears] = useState<SchoolYearSummary[]>([]);
    const [seriesClasses, setSeriesClasses] = useState<SeriesClassSummary[]>([]);
    const [formData, setFormData] = useState<FormState>({ ...EMPTY_FORM, periods: buildDefaultPeriods() });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [weeklySource, setWeeklySource] = useState<WeeklySourceResponse | null>(null);
    const [isLoadingWeeklySource, setIsLoadingWeeklySource] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [modalErrorStatus, setModalErrorStatus] = useState<string | null>(null);
    const [successStatus, setSuccessStatus] = useState<string | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
    const [sortState, setSortState] = useState<GridSortState<AnnualColumnKey>>(DEFAULT_SORT);
    const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
    const [isGridConfigOpen, setIsGridConfigOpen] = useState(false);
    const [isGridConfigReady, setIsGridConfigReady] = useState(false);
    const [columnOrder, setColumnOrder] = useState<AnnualColumnKey[]>(GRID_COLUMN_KEYS);
    const [hiddenColumns, setHiddenColumns] = useState<AnnualColumnKey[]>(
        GRID_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_GRID_COLUMNS.includes(key)),
    );
    const [columnAggregations, setColumnAggregations] = useState<GridColumnAggregations<AnnualColumnKey>>({});
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
    const [exportColumns, setExportColumns] = useState<Record<AnnualExportColumnKey, boolean>>(buildDefaultExportColumns(GRID_EXPORT_COLUMNS));
    const [annualStatusToggleRecord, setAnnualStatusToggleRecord] = useState<LessonCalendarRecord | null>(null);
    const [annualStatusToggleAction, setAnnualStatusToggleAction] = useState<'activate' | 'deactivate' | null>(null);
    const [isProcessingAnnualToggle, setIsProcessingAnnualToggle] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const GRADE_ANNUAL_MODAL_LABEL = 'PRINCIPAL_GRADE_ANUAL_MODAL';

    const canView = hasAllDashboardPermissions(currentRole, currentPermissions, [
        'VIEW_LESSON_CALENDARS',
        'VIEW_SCHOOL_YEARS',
        'VIEW_SERIES_CLASSES',
        'VIEW_CLASS_SCHEDULES',
    ]);
    const canManage = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_LESSON_CALENDARS');

    const orderedGridColumns = useMemo(
        () => columnOrder
            .map((key) => GRID_COLUMNS.find((column) => column.key === key))
            .filter((column): column is ConfigurableGridColumn<LessonCalendarRecord, AnnualColumnKey> => !!column),
        [columnOrder],
    );
    const visibleGridColumns = useMemo(
        () => orderedGridColumns.filter((column) => !hiddenColumns.includes(column.key)),
        [hiddenColumns, orderedGridColumns],
    );

    const filteredRecords = useMemo(() => {
        const term = searchTerm.trim().toUpperCase();
        return records.filter((record) => {
            const isActive = !record.canceledAt;
            const matchesStatus =
                statusFilter === 'ALL'
                    ? true
                    : statusFilter === 'ACTIVE'
                        ? isActive
                        : !isActive;
            const matchesSearch =
                !term
                || [
                    String(record.schoolYear?.year || ''),
                    getSeriesClassLabel(record.seriesClass),
                    String(record.classPeriodsCount),
                    String(record.intervalPeriodsCount),
                    String(record.generatedItemsCount),
                    record.classPeriodsLabel || '',
                    record.intervalPeriodsLabel || '',
                ].some((value) => value.toUpperCase().includes(term));

            return matchesStatus && matchesSearch;
        });
    }, [records, searchTerm, statusFilter]);

    const sortedRecords = useMemo(
        () => sortGridRows(filteredRecords, GRID_COLUMNS, sortState),
        [filteredRecords, sortState],
    );
    const aggregateSummaries = useMemo(
        () => buildGridAggregateSummaries(sortedRecords, visibleGridColumns, columnAggregations),
        [columnAggregations, sortedRecords, visibleGridColumns],
    );

    const hasWeeklySource = (weeklySource?.items.length || 0) > 0;
    const hasClassPeriod = formData.periods.some((period) => period.periodType === 'AULA');

    const loadBaseData = async () => {
        try {
            setIsLoading(true);
            setErrorStatus(null);

            const { token, role, permissions, tenantId } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, faça login novamente.');

            setCurrentRole(role);
            setCurrentPermissions(permissions);
            setCurrentTenantId(tenantId);

            const [recordsResponse, schoolYearsResponse, seriesClassesResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/lesson-calendars`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_BASE_URL}/school-years`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_BASE_URL}/series-classes`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);

            const [recordsData, schoolYearsData, seriesClassesData] = await Promise.all([
                recordsResponse.json().catch(() => null),
                schoolYearsResponse.json().catch(() => null),
                seriesClassesResponse.json().catch(() => null),
            ]);

            if (!recordsResponse.ok) throw new Error(getApiErrorMessage(recordsData, 'Não foi possível carregar as grades anuais.'));
            if (!schoolYearsResponse.ok) throw new Error(getApiErrorMessage(schoolYearsData, 'Não foi possível carregar os anos letivos.'));
            if (!seriesClassesResponse.ok) throw new Error(getApiErrorMessage(seriesClassesData, 'Não foi possível carregar as turmas.'));

            setRecords(Array.isArray(recordsData) ? recordsData : []);
            setSchoolYears(Array.isArray(schoolYearsData) ? schoolYearsData : []);
            setSeriesClasses(normalizeSeriesClassOptions(seriesClassesData));
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível carregar a grade anual.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadBaseData();
    }, []);

    useEffect(() => {
        let isMounted = true;
        setIsGridConfigReady(false);
        void loadGridColumnConfig(getGridConfigStorageKey(currentTenantId), GRID_COLUMN_KEYS, DEFAULT_VISIBLE_GRID_COLUMNS).then((config) => {
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
        writeGridColumnConfig(getGridConfigStorageKey(currentTenantId), GRID_COLUMN_KEYS, columnOrder, hiddenColumns, columnAggregations);
    }, [columnAggregations, columnOrder, currentTenantId, hiddenColumns, isGridConfigReady]);

    const normalizePeriodDate = (value: string) => (value ? new Date(`${value}T00:00:00`) : null);

    const validatePeriodsNoOverlap = (periods: PeriodFormState[]) => {
        const normalizedPeriods = periods.map((period) => {
            const start = normalizePeriodDate(period.startDate);
            const end = normalizePeriodDate(period.endDate);
            return { ...period, start, end };
        });

        for (const period of normalizedPeriods) {
            if (!period.start || !period.end) {
                throw new Error('Informe a data de início e fim para todas as faixas da grade anual.');
            }
            if (period.start > period.end) {
                throw new Error('A data de início não pode ser posterior à data de fim em uma faixa.');
            }
        }

        const sorted = [...normalizedPeriods].sort((a, b) => (a.start!.getTime() - b.start!.getTime()));
        for (let index = 1; index < sorted.length; index++) {
            const previous = sorted[index - 1];
            const current = sorted[index];
            if (current.start!.getTime() <= previous.end!.getTime()) {
                throw new Error('As faixas não podem se sobrepor. Ajuste os intervalos para evitar datas conflitantes.');
            }
        }
    };

    const resetForm = () => {
        setEditingId(null);
        setFormData({
            schoolYearId: '',
            seriesClassId: '',
            periods: buildDefaultPeriods(),
        });
        setWeeklySource(null);
        setModalErrorStatus(null);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        resetForm();
    };

    const openCreateModal = () => {
        resetForm();
        setIsModalOpen(true);
    };

    const fetchWeeklySource = async (schoolYearId: string, seriesClassId: string) => {
        try {
            setIsLoadingWeeklySource(true);
            setModalErrorStatus(null);

            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, faça login novamente.');
            if (!schoolYearId || !seriesClassId) {
                throw new Error('Selecione primeiro o ano letivo e a turma para buscar a grade semanal.');
            }

            const query = new URLSearchParams({
                schoolYearId,
                seriesClassId,
            });

            const response = await fetch(`${API_BASE_URL}/lesson-calendars/weekly-source?${query.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(getApiErrorMessage(data, 'Não foi possível buscar novamente a grade semanal.'));

            setWeeklySource(data);
        } catch (error) {
            setWeeklySource(null);
            setModalErrorStatus(error instanceof Error ? error.message : 'Não foi possível buscar novamente a grade semanal.');
        } finally {
            setIsLoadingWeeklySource(false);
        }
    };

    const handleEdit = async (record: LessonCalendarRecord) => {
        try {
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, faça login novamente.');

            const response = await fetch(`${API_BASE_URL}/lesson-calendars/${record.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(getApiErrorMessage(data, 'Não foi possível carregar a grade anual para edição.'));

            setEditingId(record.id);
            setFormData({
                schoolYearId: data.schoolYear?.id || '',
                seriesClassId: data.seriesClass?.id || '',
                periods: Array.isArray(data.periods) && data.periods.length > 0
                    ? data.periods.map((period: LessonCalendarPeriodRecord) => ({
                        localId: period.id || makeLocalPeriodId(),
                        periodType: period.periodType,
                        startDate: period.startDate?.slice(0, 10) || '',
                        endDate: period.endDate?.slice(0, 10) || '',
                    }))
                    : buildDefaultPeriods(),
            });
            setIsModalOpen(true);
            await fetchWeeklySource(data.schoolYear?.id || '', data.seriesClass?.id || '');
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível abrir a grade anual.');
        }
    };

    const openAnnualStatusModal = (record: LessonCalendarRecord) => {
        setAnnualStatusToggleRecord(record);
        setAnnualStatusToggleAction(record.canceledAt ? 'activate' : 'deactivate');
    };

    const closeAnnualStatusModal = (force = false) => {
        if (!force && isProcessingAnnualToggle) return;
        setAnnualStatusToggleRecord(null);
        setAnnualStatusToggleAction(null);
    };

    const confirmAnnualStatusToggle = async () => {
        if (!annualStatusToggleRecord || !annualStatusToggleAction) return;
        const willActivate = annualStatusToggleAction === 'activate';

        try {
            setIsProcessingAnnualToggle(true);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, faça login novamente.');

            const response = await fetch(`${API_BASE_URL}/lesson-calendars/${annualStatusToggleRecord.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ active: willActivate }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(getApiErrorMessage(data, willActivate ? 'Não foi possível ativar a grade anual.' : 'Não foi possível inativar a grade anual.'));

            setSuccessStatus(data?.message || (willActivate ? 'Grade anual ativada com sucesso.' : 'Grade anual inativada com sucesso.'));
            await loadBaseData();
            closeAnnualStatusModal(true);
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : (willActivate ? 'Não foi possível ativar a grade anual.' : 'Não foi possível inativar a grade anual.'));
        } finally {
            setIsProcessingAnnualToggle(false);
        }
    };

    const handleRefreshGeneratedCalendar = async (record: LessonCalendarRecord) => {
        try {
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, faça login novamente.');

            const response = await fetch(`${API_BASE_URL}/lesson-calendars/${record.id}/refresh-weekly-source`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(getApiErrorMessage(data, 'Não foi possível atualizar a grade anual.'));

            setSuccessStatus('Grade semanal buscada novamente e grade anual regenerada.');
            await loadBaseData();
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível atualizar a grade anual.');
        }
    };

    const handlePeriodChange = (localId: string, field: 'periodType' | 'startDate' | 'endDate', value: string) => {
        setModalErrorStatus(null);
        setFormData((current) => ({
            ...current,
            periods: current.periods.map((period) => (period.localId === localId ? { ...period, [field]: value } : period)),
        }));
    };

    const addPeriod = (periodType: 'AULA' | 'INTERVALO') => {
        setFormData((current) => ({
            ...current,
            periods: [
                ...current.periods,
                {
                    localId: makeLocalPeriodId(),
                    periodType,
                    startDate: '',
                    endDate: '',
                },
            ],
        }));
    };

    const removePeriod = (localId: string) => {
        setFormData((current) => ({
            ...current,
            periods: current.periods.length > 1 ? current.periods.filter((period) => period.localId !== localId) : current.periods,
        }));
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();

        try {
            setIsSaving(true);
            setModalErrorStatus(null);
            setSuccessStatus(null);

            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, faça login novamente.');
            if (!formData.schoolYearId || !formData.seriesClassId) {
                throw new Error('Selecione o ano letivo e a turma antes de salvar.');
            }
            if (!hasClassPeriod) {
                throw new Error('Adicione pelo menos um período de aula na grade anual.');
            }
            if (!hasWeeklySource) {
                throw new Error('Busque novamente a grade semanal antes de salvar a grade anual.');
            }
            validatePeriodsNoOverlap(formData.periods);

            const response = await fetch(
                editingId ? `${API_BASE_URL}/lesson-calendars/${editingId}` : `${API_BASE_URL}/lesson-calendars`,
                {
                    method: editingId ? 'PATCH' : 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        schoolYearId: formData.schoolYearId,
                        seriesClassId: formData.seriesClassId,
                        periods: formData.periods.map((period) => ({
                            periodType: period.periodType,
                            startDate: period.startDate,
                            endDate: period.endDate,
                        })),
                    }),
                },
            );

            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(getApiErrorMessage(data, 'Não foi possível salvar a grade anual.'));

            setSuccessStatus(editingId ? 'Grade anual atualizada com sucesso.' : 'Grade anual cadastrada com sucesso.');
            closeModal();
            await loadBaseData();
        } catch (error) {
            setModalErrorStatus(error instanceof Error ? error.message : 'Não foi possível salvar a grade anual.');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleSort = (column: AnnualColumnKey) => {
        setSortState((current) => ({
            column,
            direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const toggleExportColumn = (column: AnnualExportColumnKey) => {
        setExportColumns((current) => ({ ...current, [column]: !current[column] }));
    };

    const setAllExportColumns = (value: boolean) => {
        setExportColumns(
            GRID_EXPORT_COLUMNS.reduce<Record<AnnualExportColumnKey, boolean>>((accumulator, column) => {
                accumulator[column.key] = value;
                return accumulator;
            }, {} as Record<AnnualExportColumnKey, boolean>),
        );
    };

    const toggleGridColumnVisibility = (columnKey: AnnualColumnKey) => {
        const isHidden = hiddenColumns.includes(columnKey);
        const visibleCount = GRID_COLUMN_KEYS.length - hiddenColumns.length;
        if (!isHidden && visibleCount === 1) {
            setErrorStatus('Pelo menos uma coluna precisa continuar visível no grid.');
            return;
        }
        setHiddenColumns((current) => (isHidden ? current.filter((item) => item !== columnKey) : [...current, columnKey]));
    };

    const moveGridColumn = (columnKey: AnnualColumnKey, direction: 'up' | 'down') => {
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
        setColumnOrder(GRID_COLUMN_KEYS);
        setHiddenColumns(GRID_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_GRID_COLUMNS.includes(key)));
        setColumnAggregations({});
    };

    const handleColumnAggregationChange = (columnKey: AnnualColumnKey, aggregateType: 'sum' | 'avg' | 'min' | 'max' | 'count' | null) => {
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

    const renderInfoButton = (record: LessonCalendarRecord) => (
        <GridRecordPopover
            title={getSeriesClassLabel(record.seriesClass)}
            subtitle={`Ano letivo ${record.schoolYear?.year || '---'}`}
            buttonLabel={`Ver detalhes da grade anual de ${getSeriesClassLabel(record.seriesClass)}`}
            sections={[
                {
                    title: 'Resumo anual',
                    items: [
                        { label: 'Ano letivo', value: String(record.schoolYear?.year || '---') },
                        { label: 'Turma', value: getSeriesClassLabel(record.seriesClass) },
                        { label: 'Períodos de aula', value: String(record.classPeriodsCount) },
                        { label: 'Férias / intervalos', value: String(record.intervalPeriodsCount) },
                        { label: 'Aulas geradas', value: String(record.generatedItemsCount) },
                    ],
                },
                {
                    title: 'Faixas cadastradas',
                    items: [
                        { label: 'Períodos de aula', value: record.classPeriodsLabel || 'Não informado' },
                        { label: 'Férias / intervalos', value: record.intervalPeriodsLabel || 'Sem intervalos' },
                        { label: 'Status', value: record.canceledAt ? 'INATIVO' : 'ATIVO' },
                    ],
                },
            ]}
            contextLabel="PRINCIPAL_GRADE_ANUAL_POPUP"
        />
    );

    const renderGridCell = (record: LessonCalendarRecord, columnKey: AnnualColumnKey) => {
        const tone = record.canceledAt ? 'text-rose-700' : 'text-slate-600';
        const emphasis = record.canceledAt ? 'text-rose-800' : 'text-slate-800';

        if (columnKey === 'schoolYear') return <td key={columnKey} className={`px-6 py-4 text-sm font-semibold ${emphasis}`}>{record.schoolYear?.year || '---'}</td>;
        if (columnKey === 'seriesClass') {
            return (
                <td key={columnKey} className="px-6 py-4">
                    <div className={`flex items-center gap-2 font-semibold ${emphasis}`}>
                        <span>{record.seriesClass?.class?.name || '---'}</span>
                        <RecordStatusIndicator active={!record.canceledAt} />
                    </div>
                    <div className={`text-[13px] ${record.canceledAt ? 'text-rose-500' : 'text-slate-400'}`}>{record.seriesClass?.series?.name || 'Sem série'}</div>
                </td>
            );
        }
        if (columnKey === 'classPeriodsCount') return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${tone}`}>{record.classPeriodsCount}</td>;
        if (columnKey === 'intervalPeriodsCount') return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${tone}`}>{record.intervalPeriodsCount}</td>;
        if (columnKey === 'generatedItemsCount') return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${tone}`}>{record.generatedItemsCount}</td>;
        if (columnKey === 'recordStatus') {
            return (
                <td key={columnKey} className="px-6 py-4 text-center">
                    <RecordStatusIndicator active={!record.canceledAt} />
                </td>
            );
        }
        return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${tone}`}>---</td>;
    };

    if (!isLoading && !canView) {
        return (
            <DashboardAccessDenied
                title="Acesso restrito à grade anual"
                message="Seu perfil não possui permissão para consultar a grade anual desta escola."
            />
        );
    }

    return (
        <div className="w-full space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-[#153a6a]">Grade anual</h1>
                    <p className="mt-1 font-medium text-slate-500">Monte o calendário anual da turma a partir da grade semanal e dos intervalos de férias.</p>
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
                            type="button"
                            onClick={openCreateModal}
                            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white shadow-md shadow-blue-500/20 transition-all active:scale-95 hover:bg-blue-500"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                            Nova Grade Anual
                        </button>
                    ) : null}
                </div>
            </div>

            {errorStatus ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorStatus}</div> : null}
            {successStatus ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{successStatus}</div> : null}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="dashboard-band border-b px-6 py-4">
                    <div className="relative w-full max-w-sm">
                        <input
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Buscar por turma, ano letivo ou faixas do calendário..."
                            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />
                        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="dashboard-table-head border-b border-slate-300 text-[13px] font-bold uppercase tracking-wider">
                                {visibleGridColumns.map((column) => (
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
                            {isLoading ? (
                                <tr>
                                    <td colSpan={visibleGridColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">Carregando grades anuais...</td>
                                </tr>
                            ) : null}
                            {!isLoading && sortedRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={visibleGridColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">Nenhuma grade anual cadastrada.</td>
                                </tr>
                            ) : null}
                            {!isLoading && sortedRecords.map((record) => (
                                <tr key={record.id} className={record.canceledAt ? 'bg-rose-50/40 hover:bg-rose-50' : 'hover:bg-slate-50'}>
                                    {visibleGridColumns.map((column) => renderGridCell(record, column.key))}
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {renderInfoButton(record)}
                                            {canManage ? (
                                                <>
                                                    <GridRowActionIconButton title="Editar grade anual" onClick={() => void handleEdit(record)} tone="blue">
                                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </GridRowActionIconButton>
                                                    <GridRowActionIconButton title="Buscar novamente grade semanal" onClick={() => void handleRefreshGeneratedCalendar(record)} tone="emerald">
                                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                        </svg>
                                                    </GridRowActionIconButton>
                                                    <GridRowActionIconButton title={record.canceledAt ? 'Ativar grade anual' : 'Inativar grade anual'} onClick={() => void openAnnualStatusModal(record)} tone={record.canceledAt ? 'emerald' : 'rose'}>
                                                        {record.canceledAt ? (
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728M6 6l12 12" />
                                                            </svg>
                                                        )}
                                                    </GridRowActionIconButton>
                                                </>
                                            ) : (
                                                <span className="self-center text-xs font-semibold uppercase tracking-wide text-slate-300">Somente leitura</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <GridFooterControls
                    key={`annual-footer-${sortedRecords.length}`}
                    recordsCount={Number(sortedRecords.length)}
                    onOpenColumns={() => setIsGridConfigOpen(true)}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    activeLabel="Mostrar somente grades anuais ativas"
                    allLabel="Mostrar grades anuais ativas e inativas"
                    inactiveLabel="Mostrar somente grades anuais inativas"
                    aggregateSummaries={aggregateSummaries}
                />
            </section>

            {isModalOpen ? (
                <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
                            <div>
                                <h2 className="text-xl font-bold text-[#153a6a]">{editingId ? 'Editar grade anual' : 'Nova grade anual'}</h2>
                                <p className="mt-1 text-sm font-medium text-slate-500">Informe períodos de aula e férias para gerar o calendário anual a partir da grade semanal.</p>
                            </div>
                            <button onClick={closeModal} className="text-slate-400 hover:text-red-500">
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="flex flex-1 flex-col min-h-0">
                            <div className="flex-1 overflow-y-auto px-6">
                                <div className="space-y-5 pb-6">
                                    {modalErrorStatus ? (
                                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                                            {modalErrorStatus}
                                        </div>
                                    ) : null}

                                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
                                        <select
                                            value={formData.schoolYearId}
                                            onChange={(event) => {
                                                setModalErrorStatus(null);
                                                setWeeklySource(null);
                                                setFormData((current) => ({ ...current, schoolYearId: event.target.value }));
                                            }}
                                            className={inputClass}
                                        >
                                            <option value="">Selecione o ano letivo</option>
                                            {schoolYears.map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {item.year}
                                                    {item.isActive ? ' (ATIVO)' : ''}
                                                </option>
                                            ))}
                                        </select>

                                        <select
                                            value={formData.seriesClassId}
                                            onChange={(event) => {
                                                setModalErrorStatus(null);
                                                setWeeklySource(null);
                                                setFormData((current) => ({ ...current, seriesClassId: event.target.value }));
                                            }}
                                            className={inputClass}
                                        >
                                            <option value="">Selecione a turma</option>
                                            {seriesClasses.map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {getSeriesClassLabel(item)}
                                                </option>
                                            ))}
                                        </select>

                                        <button
                                            type="button"
                                            onClick={() => void fetchWeeklySource(formData.schoolYearId, formData.seriesClassId)}
                                            disabled={!formData.schoolYearId || !formData.seriesClassId || isLoadingWeeklySource}
                                            className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                                        >
                                            {isLoadingWeeklySource ? 'Buscando...' : 'Buscar novamente grade semanal'}
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-bold text-slate-700">Faixas da grade anual</div>
                                                    <div className="text-xs font-medium text-slate-500">
                                                        Você pode lançar vários períodos de aula e vários intervalos/férias no mesmo ano letivo.
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    <button type="button" onClick={() => addPeriod('AULA')} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">
                                                        + Período de aula
                                                    </button>
                                                    <button type="button" onClick={() => addPeriod('INTERVALO')} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                                                        + Intervalo / férias
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                {formData.periods.map((period, index) => (
                                                    <div key={period.localId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                                        <div className="mb-3 flex items-center justify-between gap-3">
                                                            <div className="text-sm font-bold text-slate-700">Faixa #{index + 1}</div>
                                                            {formData.periods.length > 1 ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removePeriod(period.localId)}
                                                                    className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100"
                                                                >
                                                                    Remover
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[0.9fr_1fr_1fr]">
                                                            <select
                                                                value={period.periodType}
                                                                onChange={(event) => handlePeriodChange(period.localId, 'periodType', event.target.value)}
                                                                className={inputClass}
                                                            >
                                                                <option value="AULA">Período de aula</option>
                                                                <option value="INTERVALO">Intervalo / férias</option>
                                                            </select>
                                                            <input type="date" value={period.startDate} onChange={(event) => handlePeriodChange(period.localId, 'startDate', event.target.value)} className={inputClass} />
                                                            <input type="date" value={period.endDate} onChange={(event) => handlePeriodChange(period.localId, 'endDate', event.target.value)} className={inputClass} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="mb-4 flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-bold text-slate-700">Grade semanal carregada</div>
                                                    <div className="text-xs font-medium text-slate-500">
                                                        A grade anual será gerada com os horários, professores e matérias já lançados.
                                                    </div>
                                                </div>
                                                <span className={`rounded-full px-3 py-1 text-xs font-bold ${hasWeeklySource ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                                                    {weeklySource?.items.length || 0} aula(s)
                                                </span>
                                            </div>

                                            {!hasWeeklySource ? (
                                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-800">
                                                    Busque novamente a grade semanal desta turma para habilitar a geração da grade anual.
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {weeklySource?.items.map((item) => (
                                                        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                                                            <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
                                                                <div>
                                                                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Dia</div>
                                                                    <div className="mt-1 text-sm font-semibold text-slate-700">{getDayLabel(item.dayOfWeek)}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Professor</div>
                                                                    <div className="mt-1 text-sm font-semibold text-slate-700">{item.teacherSubject?.teacher?.name || '---'}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Matéria</div>
                                                                    <div className="mt-1 text-sm font-semibold text-slate-700">{item.teacherSubject?.subject?.name || '---'}</div>
                                                                </div>
                                                            </div>
                                                            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
                                                                {item.startTime} às {item.endTime}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm font-medium text-slate-600">
                                    Sempre que a grade semanal mudar ao longo do ano, use o botão <span className="font-bold text-slate-800">Buscar novamente grade semanal</span> antes de salvar ou use a ação da listagem para regenerar a grade anual já cadastrada.
                                </div>
                                <div className="mt-6 text-right text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">
                                    Tela: {GRADE_ANNUAL_MODAL_LABEL}
                                </div>
                        </div>
                        <div className="sticky bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur-sm">
                            <div className="flex items-center justify-between gap-3">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold uppercase tracking-[0.25em] text-white shadow hover:bg-rose-600 transition"
                                >
                                    Sair sem Salvar
                                </button>
                                <button
                                    type="submit"
                                    disabled={!canManage || isSaving || !hasWeeklySource || !hasClassPeriod}
                                    className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                    {isSaving ? 'Salvando...' : editingId ? 'Salvar grade anual' : 'Cadastrar grade anual'}
                                </button>
                            </div>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            <GridColumnConfigModal
                isOpen={isGridConfigOpen}
                title="Configurar colunas do grid"
                description="Reordene, oculte ou inclua colunas do cadastro de grade anual nesta tela."
                columns={GRID_COLUMNS.map((column) => ({
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
                isOpen={Boolean(annualStatusToggleRecord && annualStatusToggleAction)}
                tenantId={currentTenantId}
                actionType={annualStatusToggleAction || 'activate'}
                title={annualStatusToggleAction === 'activate' ? 'Ativar grade anual' : 'Inativar grade anual'}
                itemLabel="Grade anual"
                itemName={annualStatusToggleRecord ? getSeriesClassLabel(annualStatusToggleRecord.seriesClass) : ''}
                description={annualStatusToggleAction === 'activate'
                    ? 'Ao ativar a grade anual esta turma volta a ser utilizada na próxima geração de calendário.'
                    : 'Ao inativar a grade anual, ela permanece arquivada para auditoria e sai das seleções ativas.'}
                hintText="Essa operação respeita a trilha de auditoria da escola."
                confirmLabel={annualStatusToggleAction === 'activate' ? 'Confirmar ativação' : 'Confirmar inativação'}
                onCancel={() => closeAnnualStatusModal(true)}
                onConfirm={confirmAnnualStatusToggle}
                isProcessing={isProcessingAnnualToggle}
                statusActive={!annualStatusToggleRecord?.canceledAt}
            />

            <GridExportModal
                isOpen={isExportModalOpen}
                title="Exportar grade anual"
                description={`A exportação respeita os filtros atuais da tela e inclui ${sortedRecords.length} registro(s).`}
                format={exportFormat}
                onFormatChange={setExportFormat}
                columns={GRID_EXPORT_COLUMNS.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={exportColumns}
                onToggleColumn={toggleExportColumn}
                onSelectAll={setAllExportColumns}
                storageKey={getGridExportConfigStorageKey(currentTenantId)}
                onClose={() => setIsExportModalOpen(false)}
                onExport={async (config) => {
                    try {
                        await exportGridRows({
                            rows: sortedRecords,
                            columns: config?.orderedColumns
                                ? config.orderedColumns
                                    .map((key) => GRID_EXPORT_COLUMNS.find((column) => column.key === key))
                                    .filter((column): column is GridColumnDefinition<LessonCalendarRecord, AnnualExportColumnKey> => !!column)
                                : GRID_EXPORT_COLUMNS,
                            selectedColumns: config?.selectedColumns || exportColumns,
                            format: exportFormat,
                            pdfOptions: config?.pdfOptions,
                            fileBaseName: 'grade-anual',
                            branding: {
                                title: 'Grade anual',
                                subtitle: 'Exportação com os filtros atualmente aplicados.',
                            },
                        });
                        setSuccessStatus(`Exportação ${exportFormat.toUpperCase()} preparada com ${sortedRecords.length} registro(s).`);
                        setIsExportModalOpen(false);
                    } catch (error) {
                        setErrorStatus(error instanceof Error ? error.message : 'Não foi possível exportar a grade anual.');
                    }
                }}
            />
        </div>
    );
}

