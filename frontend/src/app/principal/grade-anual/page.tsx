'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import GridExportModal from '@/app/components/grid-export-modal';
import RecordStatusIndicator from '@/app/components/record-status-indicator';
import GridRecordPopover from '@/app/components/grid-record-popover';
import GridRowActionIconButton from '@/app/components/grid-row-action-icon-button';
import StatusConfirmationModal from '@/app/components/status-confirmation-modal';
import { type GridStatusFilterValue } from '@/app/components/grid-status-filter';
import { getDashboardAuthContext, hasAllDashboardPermissions, hasDashboardPermission } from '@/app/lib/dashboard-crud-utils';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { type ConfigurableGridColumn } from '@/app/lib/grid-column-config-utils';
import { buildDefaultExportColumns, buildExportColumnsFromGridColumns, exportGridRows, sortGridRows, type GridColumnDefinition, type GridExportFormat, type GridSortState } from '@/app/lib/grid-export-utils';
import { dedupeSeriesClassOptions } from '@/app/lib/series-class-option-utils';

const API_BASE_URL = 'http://localhost:3001/api/v1';
const GRADE_ANUAL_STATUS_MODAL_SCREEN_ID = 'PRINCIPAL_GRADE_ANUAL_STATUS_MODAL';
const inputClass = 'w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20';

type SchoolYearSummary = {
    id: string;
    year: number;
    isActive?: boolean;
};

type CurrentTenant = {
    id: string;
    name: string;
    logoUrl?: string | null;
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

type AnnualLessonEvent = {
    id: string;
    date: string;
    eventType: string;
    eventTypeLabel: string;
    title: string;
    description?: string | null;
    startTime?: string | null;
    endTime?: string | null;
};

type AnnualCalendarLessonItem = {
    id: string;
    lessonCalendarId: string;
    date: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    schoolYearId?: string | null;
    schoolYearLabel?: string | null;
    seriesClassId?: string | null;
    seriesClassLabel: string;
    subjectName: string;
    teacherName: string;
    events: AnnualLessonEvent[];
    classScheduleItemId?: string | null;
    teacherSubjectId?: string | null;
};

type AnnualStandaloneEvent = {
    id: string;
    date: string;
    eventType: string;
    eventTypeLabel: string;
    title: string;
    description?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    isStandaloneNotice: boolean;
    schoolYearId?: string | null;
    schoolYearLabel?: string | null;
    seriesClassId?: string | null;
    seriesClassLabel: string;
    subjectName: string;
    teacherName: string;
};

type ExpandedDayModalState = {
    date: string;
    lessonItems: AnnualCalendarLessonItem[];
    standaloneEvents: AnnualStandaloneEvent[];
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

function getGridExportConfigStorageKey(tenantId: string | null) {
    return `dashboard:grade-anual:export-config:${tenantId || 'default'}`;
}

function makeLocalPeriodId() {
    return `period-${Math.random().toString(36).slice(2, 11)}`;
}

function buildDefaultPeriods(): PeriodFormState[] {
    return [{ localId: makeLocalPeriodId(), periodType: 'AULA', startDate: '', endDate: '' }];
}

function getDefaultSchoolYearId(schoolYears: SchoolYearSummary[]) {
    const currentYear = new Date().getFullYear();
    return (
        schoolYears.find((item) => item.year === currentYear)?.id
        || schoolYears.find((item) => item.isActive)?.id
        || schoolYears[0]?.id
        || ''
    );
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

function getNetworkErrorMessage(error: unknown, endpointLabel: string, fallback: string) {
    if (error instanceof TypeError) {
        return `${fallback} Endpoint: ${endpointLabel}. Verifique se a API está acessível em ${API_BASE_URL}.`;
    }
    return error instanceof Error ? error.message : fallback;
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

function formatDateTime(value?: string | null) {
    if (!value) return 'Ainda não sincronizado';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Ainda não sincronizado';
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(parsed);
}

function parseDateOnly(value: string) {
    const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
    return new Date(year, (month || 1) - 1, day || 1);
}

function formatDateOnly(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getMonthBeforeDayLabel(value: string) {
    return new Intl.DateTimeFormat('pt-BR', { month: 'short', day: '2-digit' })
        .format(parseDateOnly(value))
        .replace('.', '')
        .toUpperCase();
}

function getFullDateLabel(value: string) {
    return new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    }).format(parseDateOnly(value));
}

function getYearMonthLabel(year: string, month: string) {
    const parsedYear = Number.parseInt(year, 10);
    const parsedMonth = Number.parseInt(month, 10);
    if (!parsedYear || !parsedMonth) return '';
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(parsedYear, parsedMonth - 1, 1));
}

function getMonthGridDays(year: string, month: string) {
    if (!year || !month) return [];
    const firstDay = new Date(Number.parseInt(year, 10), Number.parseInt(month, 10) - 1, 1);
    const lastDay = new Date(Number.parseInt(year, 10), Number.parseInt(month, 10), 0);
    const start = new Date(firstDay);
    const startOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - startOffset);

    const end = new Date(lastDay);
    const endOffset = 6 - ((end.getDay() + 6) % 7);
    end.setDate(end.getDate() + endOffset);

    const days: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
        days.push(formatDateOnly(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return days;
}

const WEEKDAY_LABELS = ['SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.', 'DOM.'];

export default function GradeAnualPage() {
    const calendarEventsRequestRef = useRef(0);
    const [records, setRecords] = useState<LessonCalendarRecord[]>([]);
    const [schoolYears, setSchoolYears] = useState<SchoolYearSummary[]>([]);
    const [seriesClasses, setSeriesClasses] = useState<SeriesClassSummary[]>([]);
    const [tenant, setTenant] = useState<CurrentTenant | null>(null);
    const [calendarLessonItems, setCalendarLessonItems] = useState<AnnualCalendarLessonItem[]>([]);
    const [standaloneCalendarEvents, setStandaloneCalendarEvents] = useState<AnnualStandaloneEvent[]>([]);
    const [teacherSubjectOptions, setTeacherSubjectOptions] = useState<{ id: string; label: string }[]>([]);
    const [editingLesson, setEditingLesson] = useState<AnnualCalendarLessonItem | null>(null);
    const [lessonEditTeacherSubjectId, setLessonEditTeacherSubjectId] = useState('');
    const [isSavingLessonEdit, setIsSavingLessonEdit] = useState(false);
    const [lessonEditError, setLessonEditError] = useState<string | null>(null);
    const [formData, setFormData] = useState<FormState>({ ...EMPTY_FORM, periods: buildDefaultPeriods() });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [weeklySource, setWeeklySource] = useState<WeeklySourceResponse | null>(null);
    const [isLoadingWeeklySource, setIsLoadingWeeklySource] = useState(false);
    const [selectedCalendarSeriesClassId, setSelectedCalendarSeriesClassId] = useState('');
    const [selectedYear, setSelectedYear] = useState('');
    const [selectedMonth, setSelectedMonth] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const [specificDateFilter, setSpecificDateFilter] = useState('');
    const [dateShortcut, setDateShortcut] = useState<'TODAY' | 'YESTERDAY' | 'TOMORROW' | 'WEEK' | null>(null);
    const [weekRange, setWeekRange] = useState<{ start: string; end: string } | null>(null);
    const [expandedDayModal, setExpandedDayModal] = useState<ExpandedDayModalState | null>(null);
    const [expandedDaySeriesClassId, setExpandedDaySeriesClassId] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [modalErrorStatus, setModalErrorStatus] = useState<string | null>(null);
    const [successStatus, setSuccessStatus] = useState<string | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
    const [exportColumns, setExportColumns] = useState<Record<AnnualExportColumnKey, boolean>>(buildDefaultExportColumns(GRID_EXPORT_COLUMNS));
    const [annualStatusToggleRecord, setAnnualStatusToggleRecord] = useState<LessonCalendarRecord | null>(null);
    const [annualStatusToggleAction, setAnnualStatusToggleAction] = useState<'activate' | 'deactivate' | null>(null);
    const [isProcessingAnnualToggle, setIsProcessingAnnualToggle] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const lastModalSelectionSyncRef = useRef<string | null>(null);
    const GRADE_ANNUAL_MODAL_LABEL = 'PRINCIPAL_GRADE_ANUAL_MODAL';
    const LESSON_EDIT_MODAL_LABEL = 'PRINCIPAL_GRADE_ANUAL_MODAL_ALTERAR_AULA';

    const canView = hasAllDashboardPermissions(currentRole, currentPermissions, [
        'VIEW_LESSON_CALENDARS',
        'VIEW_SCHOOL_YEARS',
        'VIEW_SERIES_CLASSES',
        'VIEW_CLASS_SCHEDULES',
    ]);
    const canManage = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_LESSON_CALENDARS');
    const hideCardFooter = currentRole === 'ADMIN' || currentRole === 'PROFESSOR';
    const expandedDaySeriesClassOptions = useMemo(() => {
        if (!expandedDayModal) return [];

        const seen = new Set<string>();
        return [...expandedDayModal.lessonItems, ...expandedDayModal.standaloneEvents]
            .map((item) => ({ id: item.seriesClassId || '', label: item.seriesClassLabel || 'SEM TURMA' }))
            .filter((item) => item.id)
            .filter((item) => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
            });
    }, [expandedDayModal]);

    const expandedDayLessonItems = useMemo(() => {
        if (!expandedDayModal) return [];
        if (!expandedDaySeriesClassId) return expandedDayModal.lessonItems;
        return expandedDayModal.lessonItems.filter((item) => item.seriesClassId === expandedDaySeriesClassId);
    }, [expandedDayModal, expandedDaySeriesClassId]);

    const expandedDayStandaloneEvents = useMemo(() => {
        if (!expandedDayModal) return [];
        if (!expandedDaySeriesClassId) return expandedDayModal.standaloneEvents;
        return expandedDayModal.standaloneEvents.filter((item) => item.seriesClassId === expandedDaySeriesClassId);
    }, [expandedDayModal, expandedDaySeriesClassId]);

    const filteredRecords = useMemo(() => {
        if (!selectedCalendarSeriesClassId) {
            return [];
        }

        return records.filter((record) => {
            const isActive = !record.canceledAt;
            const matchesStatus =
                statusFilter === 'ALL'
                    ? true
                    : statusFilter === 'ACTIVE'
                        ? isActive
                        : !isActive;
            const matchesYear = !selectedYear || String(record.schoolYear?.year || '') === selectedYear;

            return matchesStatus && matchesYear;
        });
    }, [records, selectedCalendarSeriesClassId, selectedYear, statusFilter]);

    const sortedRecords = useMemo(
        () => sortGridRows(filteredRecords, GRID_COLUMNS, DEFAULT_SORT),
        [filteredRecords],
    );
    const existingSelectedRecord = useMemo(
        () =>
            records.find(
                (record) =>
                    !record.canceledAt
                    && record.schoolYear?.id === formData.schoolYearId
                    && record.seriesClass?.id === formData.seriesClassId,
            ) || null,
        [formData.schoolYearId, formData.seriesClassId, records],
    );

    const hasWeeklySource = (weeklySource?.items.length || 0) > 0;
    const hasClassPeriod = formData.periods.some((period) => period.periodType === 'AULA');
    const availableYears = useMemo(() => {
        const years = Array.from(new Set(schoolYears.map((item) => String(item.year)))).sort((left, right) => Number(right) - Number(left));
        if (years.length) return years;
        if (selectedYear) return [selectedYear];
        return [String(new Date().getFullYear())];
    }, [schoolYears, selectedYear]);
    const availableMonths = useMemo(
        () => Array.from({ length: 12 }, (_, index) => {
            const value = String(index + 1).padStart(2, '0');
            return { value, label: getYearMonthLabel(selectedYear, value) };
        }),
        [selectedYear],
    );
    const monthGridDays = useMemo(() => getMonthGridDays(selectedYear, selectedMonth), [selectedMonth, selectedYear]);
    const visibleCalendarDays = useMemo(() => {
        if (weekRange) {
            return monthGridDays.filter((day) => day >= weekRange.start && day <= weekRange.end);
        }
        if (specificDateFilter) {
            return monthGridDays.filter((day) => day === specificDateFilter);
        }
        if (dateShortcut && dateShortcut !== 'WEEK') {
            return monthGridDays.filter((day) => day === selectedDate);
        }
        return monthGridDays;
    }, [dateShortcut, monthGridDays, selectedDate, specificDateFilter, weekRange]);
    const visibleDaySet = useMemo(() => new Set(visibleCalendarDays), [visibleCalendarDays]);
    const lessonItemsByDate = useMemo(() => {
        const map = new Map<string, AnnualCalendarLessonItem[]>();
        calendarLessonItems
            .filter((item) => !selectedCalendarSeriesClassId || item.seriesClassId === selectedCalendarSeriesClassId)
            .forEach((item) => {
            const current = map.get(item.date) || [];
            current.push(item);
            map.set(item.date, current);
            });
        map.forEach((items, dateKey) => {
            items.sort((left, right) => `${left.startTime}`.localeCompare(`${right.startTime}`));
            map.set(dateKey, items);
        });
        return map;
    }, [calendarLessonItems, selectedCalendarSeriesClassId]);
    const filteredLessonItems = useMemo(
        () =>
            calendarLessonItems.filter(
                (item) =>
                    visibleDaySet.has(item.date)
                    && (!selectedCalendarSeriesClassId || item.seriesClassId === selectedCalendarSeriesClassId),
            ),
        [calendarLessonItems, selectedCalendarSeriesClassId, visibleDaySet],
    );
    const standaloneEventsByDate = useMemo(() => {
        const map = new Map<string, AnnualStandaloneEvent[]>();
        standaloneCalendarEvents
            .filter((event) => !selectedCalendarSeriesClassId || event.seriesClassId === selectedCalendarSeriesClassId)
            .forEach((event) => {
            const current = map.get(event.date) || [];
            current.push(event);
            map.set(event.date, current);
            });
        return map;
    }, [selectedCalendarSeriesClassId, standaloneCalendarEvents]);
    const filteredStandaloneEvents = useMemo(
        () =>
            standaloneCalendarEvents.filter(
                (event) =>
                    visibleDaySet.has(event.date)
                    && (!selectedCalendarSeriesClassId || event.seriesClassId === selectedCalendarSeriesClassId),
            ),
        [selectedCalendarSeriesClassId, standaloneCalendarEvents, visibleDaySet],
    );
    const selectedDayLessonItems = useMemo(
        () => lessonItemsByDate.get(selectedDate) || [],
        [lessonItemsByDate, selectedDate],
    );
    const selectedDayStandaloneEvents = useMemo(
        () => standaloneEventsByDate.get(selectedDate) || [],
        [selectedDate, standaloneEventsByDate],
    );
    const selectedDayRecordSummaries = useMemo(() => {
        const uniqueRecordIds = Array.from(new Set(selectedDayLessonItems.map((entry) => entry.lessonCalendarId)));
        return uniqueRecordIds
            .map((recordId) => sortedRecords.find((record) => record.id === recordId))
            .filter((record): record is LessonCalendarRecord => !!record);
    }, [selectedDayLessonItems, sortedRecords]);
    const totalRecordsInMonth = useMemo(() => {
        const ids = new Set<string>();
        filteredLessonItems.forEach((entry) => {
            ids.add(entry.lessonCalendarId);
        });
        return ids.size;
    }, [filteredLessonItems]);
    const totalDaysWithEntries = useMemo(() => {
        const days = new Set<string>();
        filteredLessonItems.forEach((entry) => days.add(entry.date));
        filteredStandaloneEvents.forEach((event) => days.add(event.date));
        return days.size;
    }, [filteredLessonItems, filteredStandaloneEvents]);

    const buildWeekRange = (reference: Date) => {
        const start = new Date(reference);
        start.setDate(reference.getDate() - ((reference.getDay() + 6) % 7));
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return { start: formatDateOnly(start), end: formatDateOnly(end) };
    };

    const applyDateShortcut = (shortcut: 'TODAY' | 'YESTERDAY' | 'TOMORROW' | 'WEEK') => {
        const base = new Date();
        const target = new Date(base);
        let nextWeekRange: { start: string; end: string } | null = null;

        if (shortcut === 'YESTERDAY') target.setDate(base.getDate() - 1);
        if (shortcut === 'TOMORROW') target.setDate(base.getDate() + 1);
        if (shortcut === 'WEEK') {
            nextWeekRange = buildWeekRange(base);
        }

        const year = String(target.getFullYear());
        const month = String(target.getMonth() + 1).padStart(2, '0');

        setSpecificDateFilter('');
        setDateShortcut(shortcut);
        setWeekRange(nextWeekRange);
        setSelectedYear(year);
        setSelectedMonth(month);
        setSelectedDate(formatDateOnly(target));
    };

    const handleSpecificDateFilterChange = (value: string) => {
        setDateShortcut(null);
        setWeekRange(null);
        setSpecificDateFilter(value);

        if (!value) {
            return;
        }

        const [year, month] = value.split('-');
        setSelectedYear(year || '');
        setSelectedMonth(month || '');
        setSelectedDate(value);
    };

    const loadBaseData = async () => {
        try {
            setIsLoading(true);
            setErrorStatus(null);

            const { token, role, permissions, tenantId } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, faça login novamente.');

            setCurrentRole(role);
            setCurrentPermissions(permissions);
            setCurrentTenantId(tenantId);

            const lessonCalendarsUrl = `${API_BASE_URL}/lesson-calendars`;
            const schoolYearsUrl = `${API_BASE_URL}/school-years`;
            const seriesClassesUrl = `${API_BASE_URL}/series-classes`;
            const currentTenantUrl = `${API_BASE_URL}/tenants/current`;
            const [recordsResponse, schoolYearsResponse, seriesClassesResponse, tenantResponse] = await Promise.all([
                fetch(lessonCalendarsUrl, {
                    headers: { Authorization: `Bearer ${token}` },
                }).catch((error) => {
                    throw new Error(getNetworkErrorMessage(error, lessonCalendarsUrl, 'Não foi possível carregar as grades anuais.'));
                }),
                fetch(schoolYearsUrl, {
                    headers: { Authorization: `Bearer ${token}` },
                }).catch((error) => {
                    throw new Error(getNetworkErrorMessage(error, schoolYearsUrl, 'Não foi possível carregar os anos letivos.'));
                }),
                fetch(seriesClassesUrl, {
                    headers: { Authorization: `Bearer ${token}` },
                }).catch((error) => {
                    throw new Error(getNetworkErrorMessage(error, seriesClassesUrl, 'Não foi possível carregar as turmas.'));
                }),
                fetch(currentTenantUrl, {
                    headers: { Authorization: `Bearer ${token}` },
                }).catch((error) => {
                    throw new Error(getNetworkErrorMessage(error, currentTenantUrl, 'Não foi possível carregar a escola logada.'));
                }),
            ]);

            const [recordsData, schoolYearsData, seriesClassesData, tenantData] = await Promise.all([
                recordsResponse.json().catch(() => null),
                schoolYearsResponse.json().catch(() => null),
                seriesClassesResponse.json().catch(() => null),
                tenantResponse.json().catch(() => null),
            ]);

            if (!recordsResponse.ok) throw new Error(getApiErrorMessage(recordsData, 'Não foi possível carregar as grades anuais.'));
            if (!schoolYearsResponse.ok) throw new Error(getApiErrorMessage(schoolYearsData, 'Não foi possível carregar os anos letivos.'));
            if (!seriesClassesResponse.ok) throw new Error(getApiErrorMessage(seriesClassesData, 'Não foi possível carregar as turmas.'));
            if (!tenantResponse.ok) throw new Error(getApiErrorMessage(tenantData, 'Não foi possível carregar a escola logada.'));

            setRecords(Array.isArray(recordsData) ? recordsData : []);
            setSchoolYears(Array.isArray(schoolYearsData) ? schoolYearsData : []);
            setSeriesClasses(normalizeSeriesClassOptions(seriesClassesData));
            setTenant(tenantData as CurrentTenant);
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
        const currentYearValue = String(new Date().getFullYear());
        const activeYearValue = schoolYears.find((item) => item.isActive)?.year;
        const nextYear = availableYears.includes(currentYearValue)
            ? currentYearValue
            : activeYearValue
                ? String(activeYearValue)
                : availableYears[0] || '';

        if (!selectedYear && nextYear) {
            setSelectedYear(nextYear);
        }
    }, [availableYears, schoolYears, selectedYear]);

    useEffect(() => {
        if (!selectedYear) return;
        if (!selectedMonth) {
            const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
            setSelectedMonth(currentMonth);
        }
    }, [selectedMonth, selectedYear]);

    useEffect(() => {
        if (!selectedYear || !selectedMonth) return;
        const currentDate = formatDateOnly(new Date());
        const defaultDate = currentDate.startsWith(`${selectedYear}-${selectedMonth}`)
            ? currentDate
            : `${selectedYear}-${selectedMonth}-01`;

        if (!selectedDate || !selectedDate.startsWith(`${selectedYear}-${selectedMonth}`)) {
            setSelectedDate(defaultDate);
        }
    }, [selectedDate, selectedMonth, selectedYear]);

    const loadCalendarEvents = async (requestId = calendarEventsRequestRef.current) => {
        try {
            const { token } = getDashboardAuthContext();
            if (!token || !selectedYear || !selectedMonth) return;

            const referenceDate = `${selectedYear}-${selectedMonth}-01`;
            const calendarEventsUrl = `${API_BASE_URL}/lesson-calendars/school-calendar-events?referenceDate=${referenceDate}`;
            const response = await fetch(calendarEventsUrl, {
                headers: { Authorization: `Bearer ${token}` },
            }).catch((error) => {
                throw new Error(getNetworkErrorMessage(error, calendarEventsUrl, 'Não foi possível carregar aulas e eventos do calendário anual.'));
            });
            if (requestId !== calendarEventsRequestRef.current) return;
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(getApiErrorMessage(data, 'Não foi possível carregar aulas e eventos do calendário anual.'));
            if (requestId !== calendarEventsRequestRef.current) return;
            setCalendarLessonItems(Array.isArray(data?.lessonItems) ? data.lessonItems : []);
            setStandaloneCalendarEvents(Array.isArray(data?.standaloneEvents) ? data.standaloneEvents : []);
        } catch (error) {
            if (requestId !== calendarEventsRequestRef.current) return;
            setCalendarLessonItems([]);
            setStandaloneCalendarEvents([]);
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível carregar aulas e eventos do calendário anual.');
        }
    };

    useEffect(() => {
        calendarEventsRequestRef.current += 1;
        const requestId = calendarEventsRequestRef.current;
        void loadCalendarEvents(requestId);
    }, [selectedMonth, selectedYear]);

    useEffect(() => {
        if (!isModalOpen) return;
        if (!formData.schoolYearId || !formData.seriesClassId) {
            setWeeklySource(null);
            return;
        }

        void fetchWeeklySource(formData.schoolYearId, formData.seriesClassId);
    }, [formData.schoolYearId, formData.seriesClassId, isModalOpen]);

    useEffect(() => {
        if (!isModalOpen) return;

        const selectionKey = formData.schoolYearId && formData.seriesClassId
            ? `${formData.schoolYearId}:${formData.seriesClassId}`
            : null;

        if (!selectionKey) {
            lastModalSelectionSyncRef.current = null;
            return;
        }

        if (lastModalSelectionSyncRef.current === selectionKey) {
            return;
        }

        lastModalSelectionSyncRef.current = selectionKey;

        if (existingSelectedRecord) {
            setEditingId(existingSelectedRecord.id);
            setFormData((current) => ({
                ...current,
                periods: Array.isArray(existingSelectedRecord.periods) && existingSelectedRecord.periods.length > 0
                    ? existingSelectedRecord.periods.map((period) => ({
                        localId: period.id || makeLocalPeriodId(),
                        periodType: period.periodType,
                        startDate: period.startDate?.slice(0, 10) || '',
                        endDate: period.endDate?.slice(0, 10) || '',
                    }))
                    : buildDefaultPeriods(),
            }));
            return;
        }

        setEditingId(null);
        setFormData((current) => ({
            ...current,
            periods: buildDefaultPeriods(),
        }));
    }, [existingSelectedRecord, formData.schoolYearId, formData.seriesClassId, isModalOpen]);

    useEffect(() => {
        const loadTeacherSubjects = async () => {
            try {
                const { token } = getDashboardAuthContext();
                if (!token) throw new Error('Token não encontrado, faça login novamente.');
                const teacherSubjectsUrl = `${API_BASE_URL}/teacher-subjects`;
                const response = await fetch(teacherSubjectsUrl, {
                    headers: { Authorization: `Bearer ${token}` },
                }).catch((error) => {
                    throw new Error(getNetworkErrorMessage(error, teacherSubjectsUrl, 'Não foi possível carregar os vínculos professor x matéria.'));
                });
                const data = await response.json().catch(() => null);
                if (!response.ok) throw new Error(getApiErrorMessage(data, 'Não foi possível carregar os vínculos professor x matéria.'));
                if (Array.isArray(data)) {
                    setTeacherSubjectOptions(
                        data.map((item) => ({
                            id: item.id,
                            label: `${item.subject?.name || 'Matéria'} • ${item.teacher?.name || 'Professor'}`,
                        })),
                    );
                }
            } catch (error) {
                setTeacherSubjectOptions([]);
            }
        };

        void loadTeacherSubjects();
    }, []);

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
        lastModalSelectionSyncRef.current = null;
        setEditingId(null);
        setFormData({
            schoolYearId: getDefaultSchoolYearId(schoolYears),
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

            const weeklySourceUrl = `${API_BASE_URL}/lesson-calendars/weekly-source?${query.toString()}`;
            const response = await fetch(weeklySourceUrl, {
                headers: { Authorization: `Bearer ${token}` },
            }).catch((error) => {
                throw new Error(getNetworkErrorMessage(error, weeklySourceUrl, 'Não foi possível buscar novamente a grade semanal.'));
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

            const lessonCalendarUrl = `${API_BASE_URL}/lesson-calendars/${record.id}`;
            const response = await fetch(lessonCalendarUrl, {
                headers: { Authorization: `Bearer ${token}` },
            }).catch((error) => {
                throw new Error(getNetworkErrorMessage(error, lessonCalendarUrl, 'Não foi possível carregar a grade anual para edição.'));
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

            const toggleStatusUrl = `${API_BASE_URL}/lesson-calendars/${annualStatusToggleRecord.id}/status`;
            const response = await fetch(toggleStatusUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ active: willActivate }),
            }).catch((error) => {
                throw new Error(getNetworkErrorMessage(error, toggleStatusUrl, willActivate ? 'Não foi possível ativar a grade anual.' : 'Não foi possível inativar a grade anual.'));
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

            const refreshUrl = `${API_BASE_URL}/lesson-calendars/${record.id}/refresh-weekly-source`;
            const response = await fetch(refreshUrl, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            }).catch((error) => {
                throw new Error(getNetworkErrorMessage(error, refreshUrl, 'Não foi possível atualizar a grade anual.'));
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(getApiErrorMessage(data, 'Não foi possível atualizar a grade anual.'));

            setSuccessStatus('Grade semanal buscada novamente e grade anual regenerada.');
            await loadBaseData();
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível atualizar a grade anual.');
        }
    };

    const openExpandedDayModal = (date: string, lessonItems: AnnualCalendarLessonItem[], standaloneEvents: AnnualStandaloneEvent[]) => {
        setExpandedDaySeriesClassId('');
        setExpandedDayModal({
            date,
            lessonItems,
            standaloneEvents,
        });
    };

    const closeExpandedDayModal = () => {
        setExpandedDayModal(null);
        setExpandedDaySeriesClassId('');
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

            const saveUrl = editingId ? `${API_BASE_URL}/lesson-calendars/${editingId}` : `${API_BASE_URL}/lesson-calendars`;
            const response = await fetch(saveUrl, {
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
            }).catch((error) => {
                throw new Error(getNetworkErrorMessage(error, saveUrl, 'Não foi possível salvar a grade anual.'));
            });

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

    const openLessonEdit = (lesson: AnnualCalendarLessonItem) => {
        setLessonEditError(null);
        setEditingLesson(lesson);
        setLessonEditTeacherSubjectId(lesson.teacherSubjectId || '');
    };

    const closeLessonEdit = () => {
        if (isSavingLessonEdit) return;
        setEditingLesson(null);
    };

    const saveLessonEdit = async () => {
        if (!editingLesson?.id) return;
        try {
            setIsSavingLessonEdit(true);
            setLessonEditError(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, faça login novamente.');
            const payload = {
                teacherSubjectId: lessonEditTeacherSubjectId || null,
            };
            const lessonCalendarItemUrl = `${API_BASE_URL}/lesson-calendars/items/${editingLesson.id}`;
            const response = await fetch(lessonCalendarItemUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            }).catch((error) => {
                throw new Error(getNetworkErrorMessage(error, lessonCalendarItemUrl, 'Não foi possível atualizar a matéria/professor desta aula.'));
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(getApiErrorMessage(data, 'Não foi possível atualizar a matéria/professor desta aula.'));
            closeLessonEdit();
            await loadCalendarEvents();
        } catch (error) {
            setLessonEditError(error instanceof Error ? error.message : 'Não foi possível salvar a alteração.');
        } finally {
            setIsSavingLessonEdit(false);
        }
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
            {errorStatus ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorStatus}</div> : null}
            {successStatus ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{successStatus}</div> : null}

            <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
                <div className="bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.18),_transparent_45%),linear-gradient(135deg,#eff6ff_0%,#ffffff_42%,#f8fafc_100%)] px-8 py-8">
                    <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex items-center gap-5">
                            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.10)]">
                                {tenant?.logoUrl ? (
                                    <img src={tenant.logoUrl} alt={`Logotipo de ${tenant.name}`} className="h-full w-full object-contain p-3" />
                                ) : (
                                    <span className="text-lg font-black tracking-[0.25em] text-[#153a6a]">
                                        {String(tenant?.name || 'ESCOLA').slice(0, 3).toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <div>
                                <div className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">Grade Anual</div>
                                <h1 className="mt-2 text-3xl font-extrabold text-[#153a6a]">{tenant?.name || 'Visão geral da escola'}</h1>
                                <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">
                                    Acompanhe toda a grade anual da escola em cards, com visão geral por turma, períodos cadastrados e total de aulas geradas, usando o mesmo padrão visual do calendário de aulas.
                                </p>
                                <div className="mt-4">
                                    <ScreenNameCopy screenId="PRINCIPAL_GRADE_ANUAL" className="mt-0 text-[11px]" />
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                <div className="sticky top-[72px] z-30 border-b border-slate-200 bg-white/95 px-8 py-6 backdrop-blur-sm">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex flex-wrap gap-3">
                            <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                Turma
                                <select
                                    value={selectedCalendarSeriesClassId}
                                    onChange={(event) => setSelectedCalendarSeriesClassId(event.target.value)}
                                    className="mt-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400"
                                >
                                    <option value="">Todas as turmas</option>
                                    {seriesClasses.map((seriesClass) => (
                                        <option key={seriesClass.id} value={seriesClass.id}>
                                            {getSeriesClassLabel(seriesClass)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                Ano
                                <select
                                    value={selectedYear}
                                    onChange={(event) => {
                                        setSpecificDateFilter('');
                                        setDateShortcut(null);
                                        setWeekRange(null);
                                        setSelectedYear(event.target.value);
                                    }}
                                    className="mt-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400"
                                >
                                    {availableYears.map((year) => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                Mês
                                <select
                                    value={selectedMonth}
                                    onChange={(event) => {
                                        setSpecificDateFilter('');
                                        setDateShortcut(null);
                                        setWeekRange(null);
                                        setSelectedMonth(event.target.value);
                                    }}
                                    className="mt-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400"
                                    disabled={!selectedYear}
                                >
                                    {availableMonths.map((option) => (
                                        <option key={`${selectedYear}-${option.value}`} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                Data específica
                                <div className="mt-1 flex items-center gap-2">
                                    <input
                                        type="date"
                                        value={specificDateFilter}
                                        onChange={(event) => handleSpecificDateFilterChange(event.target.value)}
                                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400"
                                    />
                                    {specificDateFilter ? (
                                        <button
                                            type="button"
                                            onClick={() => handleSpecificDateFilterChange('')}
                                            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 transition hover:border-blue-200 hover:text-blue-700"
                                        >
                                            Limpar
                                        </button>
                                    ) : null}
                                </div>
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { key: 'TODAY', label: 'Hoje' },
                                    { key: 'WEEK', label: 'Semana' },
                                    { key: 'YESTERDAY', label: 'Ontem' },
                                    { key: 'TOMORROW', label: 'Amanhã' },
                                ].map((shortcut) => {
                                    const active = dateShortcut === shortcut.key;
                                    return (
                                        <button
                                            key={shortcut.key}
                                            type="button"
                                            onClick={() => applyDateShortcut(shortcut.key as 'TODAY' | 'YESTERDAY' | 'TOMORROW' | 'WEEK')}
                                            className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'}`}
                                        >
                                            {shortcut.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { value: 'ACTIVE', label: 'Ativas' },
                                    { value: 'ALL', label: 'Todas' },
                                    { value: 'INACTIVE', label: 'Inativas' },
                                ].map((option) => {
                                    const active = statusFilter === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setStatusFilter(option.value as GridStatusFilterValue)}
                                            className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'}`}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsExportModalOpen(true)}
                                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                            >
                                Exportar
                            </button>
                            {canManage ? (
                                <button
                                    type="button"
                                    onClick={openCreateModal}
                                    className="rounded-xl border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:border-emerald-500 hover:bg-emerald-500"
                                >
                                    Nova grade anual
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
                        {isLoading ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm font-medium text-slate-500">
                                Carregando visão anual da escola...
                            </div>
                        ) : null}

                        {!isLoading && sortedRecords.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm font-medium text-slate-500">
                                Nenhuma grade anual cadastrada para o ano e status selecionados.
                            </div>
                        ) : null}

                        {!isLoading && sortedRecords.length > 0 ? (
                            <div className="space-y-4">
                                <div className="sticky top-[188px] z-20 grid grid-cols-7 gap-3 bg-slate-50/95 pt-1 backdrop-blur-sm">
                                    {WEEKDAY_LABELS.map((label) => (
                                        <div key={label} className="rounded-xl bg-white px-3 py-2 text-center text-xs font-black uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                                            {label}
                                        </div>
                                    ))}
                                </div>

                                <div className="overflow-x-auto">
                                    <div className="grid min-w-[1180px] grid-cols-7 gap-3 xl:min-w-0">
                                        {visibleCalendarDays.map((day) => {
                                            const dayLessonItems = lessonItemsByDate.get(day) || [];
                                            const dayStandaloneEvents = standaloneEventsByDate.get(day) || [];
                                            const isCurrentMonth = day.startsWith(`${selectedYear}-${selectedMonth}`);
                                            const isSelected = day === selectedDate;
                                            const provaEvents = dayLessonItems.flatMap((item) => item.events).filter((event) => event.eventType === 'PROVA');
                                            const extraEvents = [
                                                ...dayStandaloneEvents,
                                                ...dayLessonItems.flatMap((item) => item.events
                                                    .filter((event) => event.eventType !== 'PROVA')
                                                    .map((event) => ({
                                                        ...event,
                                                        seriesClassLabel: item.seriesClassLabel,
                                                        subjectName: item.subjectName,
                                                    }))),
                                            ];
                                            const featuredExtraEvent = extraEvents[0] || null;

                                            return (
                                                <div
                                                    key={day}
                                                    className={`flex min-h-[210px] flex-col rounded-[24px] border p-3 text-left transition ${
                                                        isSelected
                                                            ? 'border-blue-300 bg-[#f3f8ff] shadow-sm ring-2 ring-blue-100'
                                                            : isCurrentMonth
                                                                ? 'border-slate-200 bg-white hover:border-blue-200'
                                                                : 'border-slate-200 bg-slate-100/70 text-slate-400 hover:border-blue-200'
                                                    }`}
                                                >
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setDateShortcut(null);
                                                                setWeekRange(null);
                                                                setSelectedDate(day);
                                                            }}
                                                            className="flex items-center justify-between rounded-xl text-left outline-none transition hover:opacity-90"
                                                        >
                                                        <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                                                            {getMonthBeforeDayLabel(day)}
                                                        </span>
                                                        <div className="flex flex-wrap items-center justify-end gap-1">
                                                            {dayLessonItems.length ? (
                                                                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                                                                    {dayLessonItems.length} aula(s)
                                                                </span>
                                                            ) : null}
                                                            {dayStandaloneEvents.length ? (
                                                                <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-rose-700">
                                                                    {dayStandaloneEvents.length} evento(s)
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </button>

                                                    {dayLessonItems.length > 0 ? (
                                                        <div className="mt-2 inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                                            {dayLessonItems.length} horário(s) da escola
                                                        </div>
                                                    ) : null}

                                                    {featuredExtraEvent ? (
                                                        <div className="mt-2 rounded-[18px] border border-red-300 bg-red-50 px-3 py-3 shadow-sm">
                                                            <div className="inline-flex rounded-full bg-[#ff003c] px-4 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow">
                                                                EVENTO EXTRA
                                                            </div>
                                                            <div className="mt-2 text-xs font-extrabold uppercase text-slate-800">
                                                                {featuredExtraEvent.title || featuredExtraEvent.eventTypeLabel}
                                                            </div>
                                                            <div className="mt-1 text-[11px] font-medium uppercase text-slate-500">
                                                                {featuredExtraEvent.seriesClassLabel}
                                                            </div>
                                                            <div className="text-[11px] font-medium uppercase text-slate-500">
                                                                {featuredExtraEvent.subjectName}
                                                            </div>
                                                        </div>
                                                    ) : null}

                                                    <div className="mt-3 flex flex-1 flex-col gap-2">
                                                        {dayLessonItems.slice(0, 3).map((entry) => {
                                                            const hasProva = entry.events.some((event) => event.eventType === 'PROVA');
                                                            const extraEvent = entry.events.find((event) => event.eventType !== 'PROVA');

                                                            return (
                                                                <div
                                                                    key={entry.id}
                                                                    role="button"
                                                                tabIndex={0}
                                                                onClick={() => {
                                                                    setDateShortcut(null);
                                                                    setWeekRange(null);
                                                                    setSelectedDate(day);
                                                                }}
                                                                onKeyDown={(event) => {
                                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                                        event.preventDefault();
                                                                        setDateShortcut(null);
                                                                        setWeekRange(null);
                                                                        setSelectedDate(day);
                                                                    }
                                                                }}
                                                                    className="rounded-2xl border border-blue-200 bg-[#eef5ff] text-blue-800 px-3 py-3 text-left shadow-sm transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-white"
                                                                >
                                                                    {hasProva ? (
                                                                        <span className="mb-2 inline-flex rounded-full bg-red-600 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white">
                                                                            * DIA DE PROVA
                                                                        </span>
                                                                    ) : null}
                                                                    <div className="text-[11px] font-black uppercase tracking-[0.18em]">
                                                                        {entry.startTime} - {entry.endTime}
                                                                    </div>
                                                                    <div className="mt-2 text-xs font-extrabold uppercase">
                                                                        {entry.subjectName}
                                                                    </div>
                                                                    <div className="mt-1 text-[11px] font-semibold uppercase">
                                                                        {entry.teacherName}
                                                                    </div>
                                                                    <div className="mt-1 text-[11px] font-medium uppercase">
                                                                        {entry.seriesClassLabel}
                                                                    </div>
                                                                    {extraEvent ? (
                                                                        <div className="mt-2 text-[11px] font-semibold uppercase">
                                                                            {extraEvent.title || extraEvent.eventTypeLabel}
                                                                        </div>
                                                                    ) : null}
                                                                    <div className="mt-3">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => openLessonEdit(entry)}
                                                                            className="inline-flex w-full justify-center rounded-full bg-blue-600 px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-white transition hover:bg-blue-500 disabled:bg-slate-300 disabled:text-slate-500"
                                                                        >
                                                                            Alterar aula
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                        {dayLessonItems.length > 3 ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setDateShortcut(null);
                                                                    setWeekRange(null);
                                                                    setSelectedDate(day);
                                                                    openExpandedDayModal(day, dayLessonItems, dayStandaloneEvents);
                                                                }}
                                                                className="rounded-full border border-blue-600 bg-blue-600 px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-blue-700"
                                                            >
                                                                +{dayLessonItems.length - 3} horário(s)
                                                            </button>
                                                        ) : null}
                                                        {!dayLessonItems.length && !featuredExtraEvent && !provaEvents.length ? (
                                                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                                                                Sem turmas nesse dia
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
            </section>

            {expandedDayModal ? (
                <div className="fixed inset-0 z-[56] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-5">
                            <div className="flex items-start gap-4">
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                    {tenant?.logoUrl ? (
                                        <img src={tenant.logoUrl} alt={`Logotipo de ${tenant.name}`} className="h-full w-full object-contain p-1.5" />
                                    ) : (
                                        <span className="text-sm font-black tracking-[0.25em] text-[#153a6a]">
                                            {String(tenant?.name || 'ESCOLA').slice(0, 3).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Dia expandido</div>
                                    <h2 className="mt-2 text-2xl font-extrabold text-slate-800">{getFullDateLabel(expandedDayModal.date)}</h2>
                                    <p className="mt-2 text-sm font-medium text-slate-500">
                                        {expandedDayLessonItems.length} horário(s) e {expandedDayStandaloneEvents.length} evento(s) neste dia.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={closeExpandedDayModal}
                                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                            >
                                Fechar
                            </button>
                        </div>

                        <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
                            <div className="mb-5 max-w-sm">
                                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                                    Filtrar por turma
                                </label>
                                <select
                                    value={expandedDaySeriesClassId}
                                    onChange={(event) => setExpandedDaySeriesClassId(event.target.value)}
                                    className={inputClass}
                                >
                                    <option value="">Todas as turmas</option>
                                    {expandedDaySeriesClassOptions.map((option) => (
                                        <option key={option.id} value={option.id}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {expandedDayLessonItems.length ? (
                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                    {expandedDayLessonItems.map((item) => (
                                        <div key={item.id} className="rounded-2xl border border-blue-200 bg-[#eef5ff] px-4 py-4 shadow-sm">
                                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">
                                                {item.startTime} - {item.endTime}
                                            </div>
                                            <div className="mt-2 text-sm font-extrabold uppercase text-slate-800">{item.subjectName}</div>
                                            <div className="mt-1 text-xs font-semibold uppercase text-slate-600">{item.teacherName}</div>
                                            <div className="mt-1 text-xs font-medium uppercase text-slate-500">{item.seriesClassLabel}</div>
                                            {item.events.length ? (
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {item.events.map((event) => (
                                                        <span
                                                            key={event.id}
                                                            className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                                                                event.eventType === 'PROVA'
                                                                    ? 'bg-red-100 text-red-700'
                                                                    : event.eventType === 'TRABALHO'
                                                                        ? 'bg-amber-100 text-amber-700'
                                                                        : 'bg-blue-100 text-blue-700'
                                                            }`}
                                                        >
                                                            {event.title || event.eventTypeLabel}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {expandedDayStandaloneEvents.length ? (
                                <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                                    {expandedDayStandaloneEvents.map((event) => (
                                        <div key={event.id} className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 shadow-sm">
                                            <div className="inline-flex rounded-full bg-[#ff003c] px-4 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow">
                                                EVENTO EXTRA
                                            </div>
                                            <div className="mt-2 text-sm font-extrabold uppercase text-slate-800">{event.title || event.eventTypeLabel}</div>
                                            <div className="mt-1 text-xs font-semibold uppercase text-slate-500">{event.seriesClassLabel}</div>
                                            <div className="text-xs font-semibold uppercase text-slate-500">{event.subjectName}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        <div className="border-t border-slate-100 px-6 py-4">
                            <div className="flex justify-end">
                                <ScreenNameCopy screenId="PRINCIPAL_GRADE_ANUAL_DIA_EXPANDIDO" className="mt-0 text-[11px]" />
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

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

                                    </div>

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
                                                    Incluir Novo Período
                                                </button>
                                                <button type="button" onClick={() => addPeriod('INTERVALO')} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                                                    Incluir Novo Período Férias
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

                                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm font-medium text-slate-600">
                                    Sempre que a grade semanal mudar ao longo do ano, use o botão <span className="font-bold text-slate-800">Buscar novamente grade semanal</span> antes de salvar ou use a ação da listagem para regenerar a grade anual já cadastrada.
                                </div>
                                <div className="mt-6 text-right text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">
                                    <ScreenNameCopy screenId={GRADE_ANNUAL_MODAL_LABEL} className="justify-end" />
                                </div>
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
                                    disabled={!canManage || isSaving || isLoadingWeeklySource || !hasWeeklySource || !hasClassPeriod}
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

            {editingLesson ? (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4">
                    <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                            <div>
                                <h2 className="text-xl font-bold text-[#153a6a]">Alterar matéria e professor</h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Horário e turma não mudam; apenas o vínculo professor + matéria é atualizado.
                                </p>
                            </div>
                            <button onClick={closeLessonEdit} className="text-slate-400 hover:text-red-500">
                                <svg className="h-6 w-6" viewBox="0 0 24 24" stroke="currentColor" fill="none">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="space-y-4 px-6 py-6">
                            {lessonEditError ? (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                                    {lessonEditError}
                                </div>
                            ) : null}
                            <div className="text-sm font-semibold text-slate-500">
                                {editingLesson?.startTime} - {editingLesson?.endTime} • {editingLesson?.seriesClassLabel}
                            </div>
                            <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                                Matéria e professor
                                <select
                                    value={lessonEditTeacherSubjectId}
                                    onChange={(event) => setLessonEditTeacherSubjectId(event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400"
                                >
                                    <option value="">Selecione um vínculo ativo</option>
                                    {teacherSubjectOptions.map((option) => (
                                        <option key={option.id} value={option.id}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <p className="text-xs font-medium text-slate-500">
                                Apenas o professor + matéria muda; turma e horários são imutáveis nesta tela.
                            </p>
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
                            <button
                                type="button"
                                onClick={closeLessonEdit}
                                disabled={isSavingLessonEdit}
                                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow hover:bg-rose-500 disabled:bg-rose-300"
                                style={{ minWidth: '110px' }}
                            >
                                Fechar
                            </button>
                            <button
                                type="button"
                                onClick={saveLessonEdit}
                                disabled={isSavingLessonEdit || !lessonEditTeacherSubjectId}
                                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                {isSavingLessonEdit ? 'Salvando...' : 'Salvar alteração'}
                            </button>
                        </div>
                        <div className="flex justify-end px-6 pb-4">
                            <div className="w-full max-w-sm">
                                <ScreenNameCopy screenId={LESSON_EDIT_MODAL_LABEL} label="NOME DA TELA" className="mt-0 justify-end" />
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

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
                confirmLabel={annualStatusToggleAction === 'activate' ? 'Confirmar ativação' : 'Confirmar inativação'}
                onCancel={() => closeAnnualStatusModal(true)}
                onConfirm={confirmAnnualStatusToggle}
                isProcessing={isProcessingAnnualToggle}
                statusActive={!annualStatusToggleRecord?.canceledAt}
                screenId={GRADE_ANUAL_STATUS_MODAL_SCREEN_ID}
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


