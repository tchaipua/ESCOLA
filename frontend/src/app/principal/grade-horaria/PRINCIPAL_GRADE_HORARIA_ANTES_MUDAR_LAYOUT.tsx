'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { getAllGridColumnKeys, getDefaultVisibleGridColumnKeys, loadGridColumnConfig, type ConfigurableGridColumn, writeGridColumnConfig } from '@/app/lib/grid-column-config-utils';
import { buildDefaultExportColumns, buildExportColumnsFromGridColumns, exportGridRows, sortGridRows, type GridColumnDefinition, type GridExportFormat, type GridSortState } from '@/app/lib/grid-export-utils';
import { dedupeSeriesClassOptions } from '@/app/lib/series-class-option-utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const GRADE_HORARIA_ANTES_STATUS_MODAL_SCREEN_ID = 'PRINCIPAL_GRADE_HORARIA_ANTES_STATUS_MODAL';
const SCHOOL_YEAR_START = 2025;
const DAY_OPTIONS = [
    { value: 'SEGUNDA', label: 'Segunda-feira' },
    { value: 'TERCA', label: 'Terça-feira' },
    { value: 'QUARTA', label: 'Quarta-feira' },
    { value: 'QUINTA', label: 'Quinta-feira' },
    { value: 'SEXTA', label: 'Sexta-feira' },
    { value: 'SABADO', label: 'Sábado' },
    { value: 'DOMINGO', label: 'Domingo' },
] as const;

type DayValue = (typeof DAY_OPTIONS)[number]['value'];

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
    shift?: string | null;
};

type SeriesClassSummary = {
    id: string;
    series?: SeriesSummary | null;
    class?: ClassSummary | null;
};

type TeacherSummary = {
    id: string;
    name: string;
};

type SubjectSummary = {
    id: string;
    name: string;
};

type TeacherSubjectRecord = {
    id: string;
    teacherId: string;
    subjectId: string;
    teacher?: TeacherSummary | null;
    subject?: SubjectSummary | null;
};

type ScheduleRecord = {
    id: string;
    period: string;
    lessonNumber: number;
    startTime: string;
    endTime: string;
};

type ClassScheduleItemRecord = {
    id: string;
    canceledAt?: string | null;
    dayOfWeek: DayValue;
    startTime: string;
    endTime: string;
    schoolYear?: SchoolYearSummary | null;
    seriesClass?: {
        id: string;
        series?: SeriesSummary | null;
        class?: ClassSummary | null;
    } | null;
    teacherSubject?: {
        id: string;
        teacher?: TeacherSummary | null;
        subject?: SubjectSummary | null;
    } | null;
};

type FormState = {
    schoolYearId: string;
    seriesClassId: string;
    dayOfWeek: DayValue;
    subjectId: string;
    teacherId: string;
    scheduleOption: string;
    startTime: string;
    endTime: string;
};

type ColumnFilters = {
    schoolYearId: string;
    seriesClassId: string;
    dayOfWeek: string;
    subjectId: string;
    teacherId: string;
    startTime: string;
    endTime: string;
};

type LastSelectionStorage = {
    schoolYearId?: string;
    seriesClassId?: string;
    dayOfWeek?: DayValue;
    subjectId?: string;
    teacherId?: string;
};

type GridColumnKey = 'schoolYear' | 'seriesName' | 'className' | 'seriesClass' | 'dayOfWeek' | 'subject' | 'teacher' | 'startTime' | 'endTime' | 'recordStatus';
type GridExportColumnKey = GridColumnKey;

const EMPTY_FORM: FormState = {
    schoolYearId: '',
    seriesClassId: '',
    dayOfWeek: 'SEGUNDA',
    subjectId: '',
    teacherId: '',
    scheduleOption: '',
    startTime: '',
    endTime: '',
};

const EMPTY_COLUMN_FILTERS: ColumnFilters = {
    schoolYearId: '',
    seriesClassId: '',
    dayOfWeek: '',
    subjectId: '',
    teacherId: '',
    startTime: '',
    endTime: '',
};

const inputClass = 'w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20';
const dayOrder = DAY_OPTIONS.reduce<Record<string, number>>((accumulator, option, index) => {
    accumulator[option.value] = index;
    return accumulator;
}, {});
const GRID_COLUMNS: ConfigurableGridColumn<ClassScheduleItemRecord, GridColumnKey>[] = [
    {
        key: 'schoolYear',
        label: 'Ano letivo',
        getValue: (row) => String(row.schoolYear?.year || '---'),
        getSortValue: (row) => row.schoolYear?.year || 0,
    },
    {
        key: 'seriesName',
        label: 'Série',
        getValue: (row) => row.seriesClass?.series?.name || '---',
        getSortValue: (row) => row.seriesClass?.series?.name || '',
        visibleByDefault: false,
    },
    {
        key: 'className',
        label: 'Turma base',
        getValue: (row) => row.seriesClass?.class?.name || '---',
        getSortValue: (row) => row.seriesClass?.class?.name || '',
        visibleByDefault: false,
    },
    {
        key: 'seriesClass',
        label: 'Turma',
        getValue: (row) => getGridSeriesClassValue(row.seriesClass),
        getSortValue: (row) => getGridSeriesClassValue(row.seriesClass),
    },
    {
        key: 'dayOfWeek',
        label: 'Dia',
        getValue: (row) => getDayLabel(row.dayOfWeek),
        getSortValue: (row) => dayOrder[row.dayOfWeek] ?? 99,
    },
    {
        key: 'subject',
        label: 'Matéria',
        getValue: (row) => row.teacherSubject?.subject?.name || '---',
        getSortValue: (row) => row.teacherSubject?.subject?.name || '',
    },
    {
        key: 'teacher',
        label: 'Professor',
        getValue: (row) => row.teacherSubject?.teacher?.name || '---',
        getSortValue: (row) => row.teacherSubject?.teacher?.name || '',
    },
    {
        key: 'startTime',
        label: 'Início',
        getValue: (row) => row.startTime || '---',
        getSortValue: (row) => row.startTime || '',
    },
    {
        key: 'endTime',
        label: 'Fim',
        getValue: (row) => row.endTime || '---',
        getSortValue: (row) => row.endTime || '',
    },
    {
        key: 'recordStatus',
        label: 'Status do cadastro',
        getValue: (row) => row.canceledAt ? 'INATIVO' : 'ATIVO',
        visibleByDefault: false,
    },
];
const GRID_EXPORT_COLUMNS: GridColumnDefinition<ClassScheduleItemRecord, GridExportColumnKey>[] = buildExportColumnsFromGridColumns(
    GRID_COLUMNS,
);
const GRID_COLUMN_KEYS = getAllGridColumnKeys(GRID_COLUMNS);
const DEFAULT_VISIBLE_GRID_COLUMNS = getDefaultVisibleGridColumnKeys(GRID_COLUMNS);
const DEFAULT_SORT: GridSortState = {
    column: 'schoolYear',
    direction: 'desc',
};

function getGridConfigStorageKey(tenantId: string | null) {
    return `dashboard:grade-horaria:grid-config:${tenantId || 'default'}`;
}

function getGridExportConfigStorageKey(tenantId: string | null) {
    return `dashboard:grade-horaria:export-config:${tenantId || 'default'}`;
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

function getDayLabel(dayOfWeek?: string | null) {
    return DAY_OPTIONS.find((option) => option.value === dayOfWeek)?.label || dayOfWeek || '---';
}

function getSeriesClassLabel(seriesClass?: SeriesClassSummary | null) {
    const seriesName = seriesClass?.series?.name || 'SEM SÉRIE';
    const className = seriesClass?.class?.name || 'SEM TURMA';
    return `${seriesName} - ${className}`;
}

function getGridSeriesClassValue(seriesClass?: SeriesClassSummary | ClassScheduleItemRecord['seriesClass'] | null) {
    const className = seriesClass?.class?.name || '---';
    const seriesName = seriesClass?.series?.name || 'SEM SÉRIE';
    return `${className} - ${seriesName}`;
}

function parseShiftPeriods(shift?: string | null) {
    return String(shift || '')
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);
}

function getPeriodLabel(period: string) {
    if (period === 'MANHA') return 'MANHÃ';
    if (period === 'TARDE') return 'TARDE';
    if (period === 'NOITE') return 'NOITE';
    return period;
}

function getShiftSummary(shift?: string | null) {
    const periods = parseShiftPeriods(shift);
    return periods.length > 0 ? periods.map((period) => getPeriodLabel(period)).join(' / ') : 'Não informado';
}

function getStorageKey(tenantId: string | null) {
    return `grade-horaria:last-selection:${tenantId || 'default'}`;
}

function readLastSelection(tenantId: string | null): LastSelectionStorage {
    if (typeof window === 'undefined') return {};

    try {
        const rawValue = window.localStorage.getItem(getStorageKey(tenantId));
        if (!rawValue) return {};
        const parsed = JSON.parse(rawValue) as LastSelectionStorage;
        return typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
        return {};
    }
}

function writeLastSelection(tenantId: string | null, payload: LastSelectionStorage) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(getStorageKey(tenantId), JSON.stringify(payload));
}

function getSchoolYearPayload(year: number, isActive: boolean) {
    return {
        year,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
        isActive,
    };
}

function renderGridCell(item: ClassScheduleItemRecord, columnKey: GridColumnKey) {
    const baseTextClass = item.canceledAt ? 'text-rose-700' : 'text-slate-600';
    const emphasisClass = item.canceledAt ? 'text-rose-800' : 'text-slate-800';

    if (columnKey === 'schoolYear') {
        return <td key={columnKey} className={`px-6 py-4 text-sm font-semibold ${emphasisClass}`}>{item.schoolYear?.year || '---'}</td>;
    }

    if (columnKey === 'seriesName') {
        return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${baseTextClass}`}>{item.seriesClass?.series?.name || '---'}</td>;
    }

    if (columnKey === 'className') {
        return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${baseTextClass}`}>{item.seriesClass?.class?.name || '---'}</td>;
    }

    if (columnKey === 'seriesClass') {
        return (
            <td key={columnKey} className="px-6 py-4">
                <div className={`flex items-center gap-2 font-semibold ${emphasisClass}`}>
                    <span>{item.seriesClass?.class?.name || '---'}</span>
                    <RecordStatusIndicator active={!item.canceledAt} />
                </div>
                <div className={`text-[13px] ${item.canceledAt ? 'text-rose-500' : 'text-slate-400'}`}>{item.seriesClass?.series?.name || 'Sem série'}</div>
            </td>
        );
    }

    if (columnKey === 'dayOfWeek') {
        return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${baseTextClass}`}>{getDayLabel(item.dayOfWeek)}</td>;
    }

    if (columnKey === 'subject') {
        return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${baseTextClass}`}>{item.teacherSubject?.subject?.name || '---'}</td>;
    }

    if (columnKey === 'teacher') {
        return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${baseTextClass}`}>{item.teacherSubject?.teacher?.name || '---'}</td>;
    }

    if (columnKey === 'startTime') {
        return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${baseTextClass}`}>{item.startTime || '---'}</td>;
    }

    if (columnKey === 'recordStatus') {
        return (
            <td key={columnKey} className="px-6 py-4 text-center">
                <RecordStatusIndicator active={!item.canceledAt} />
            </td>
        );
    }

    return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${baseTextClass}`}>{item.endTime || '---'}</td>;
}

export default function GradeHorariaPlanejadaPage() {
    const [items, setItems] = useState<ClassScheduleItemRecord[]>([]);
    const [schoolYears, setSchoolYears] = useState<SchoolYearSummary[]>([]);
    const [seriesClasses, setSeriesClasses] = useState<SeriesClassSummary[]>([]);
    const [teacherSubjects, setTeacherSubjects] = useState<TeacherSubjectRecord[]>([]);
    const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
    const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [columnFilters, setColumnFilters] = useState<ColumnFilters>(EMPTY_COLUMN_FILTERS);
    const [sortState, setSortState] = useState<GridSortState>(DEFAULT_SORT);
    const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
    const [isGridConfigOpen, setIsGridConfigOpen] = useState(false);
    const [isGridConfigReady, setIsGridConfigReady] = useState(false);
    const [columnOrder, setColumnOrder] = useState<GridColumnKey[]>(GRID_COLUMN_KEYS);
    const [hiddenColumns, setHiddenColumns] = useState<GridColumnKey[]>(
        GRID_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_GRID_COLUMNS.includes(key)),
    );
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
    const [exportColumns, setExportColumns] = useState<Record<GridExportColumnKey, boolean>>(buildDefaultExportColumns(GRID_EXPORT_COLUMNS));
    const [scheduleStatusToggleTarget, setScheduleStatusToggleTarget] = useState<ClassScheduleItemRecord | null>(null);
    const [scheduleStatusToggleAction, setScheduleStatusToggleAction] = useState<'activate' | 'deactivate' | null>(null);
    const [isProcessingScheduleToggle, setIsProcessingScheduleToggle] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [modalErrorStatus, setModalErrorStatus] = useState<string | null>(null);
    const [successStatus, setSuccessStatus] = useState<string | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
    const [currentTenant, setCurrentTenant] = useState<CurrentTenant | null>(null);
    const scheduleSelectRef = useRef<HTMLSelectElement | null>(null);

    const canView = hasAllDashboardPermissions(currentRole, currentPermissions, [
        'VIEW_CLASS_SCHEDULES',
        'VIEW_SCHOOL_YEARS',
        'VIEW_SERIES_CLASSES',
        'VIEW_SUBJECTS',
        'VIEW_SCHEDULES',
    ]);
    const canManage = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_CLASS_SCHEDULES');
    const orderedGridColumns = useMemo(
        () => columnOrder.map((key) => GRID_COLUMNS.find((column) => column.key === key)).filter((column): column is ConfigurableGridColumn<ClassScheduleItemRecord, GridColumnKey> => !!column),
        [columnOrder],
    );
    const visibleGridColumns = useMemo(
        () => orderedGridColumns.filter((column) => !hiddenColumns.includes(column.key)),
        [hiddenColumns, orderedGridColumns],
    );

    const hasSchoolYearOptions = schoolYears.length > 0;
    const hasSeriesClassOptions = seriesClasses.length > 0;
    const hasTeacherSubjectOptions = teacherSubjects.length > 0;
    const selectedSeriesClass = seriesClasses.find((item) => item.id === formData.seriesClassId) || null;
    const selectedPeriods = parseShiftPeriods(selectedSeriesClass?.class?.shift);
    const periodSchedules = schedules.filter((item) =>
        selectedPeriods.includes(item.period),
    );

    const allSubjects = useMemo(() => {
        const subjectMap = new Map<string, SubjectSummary>();
        teacherSubjects.forEach((item) => {
            if (item.subject?.id && item.subject?.name) {
                subjectMap.set(item.subject.id, item.subject);
            }
        });
        return Array.from(subjectMap.values()).sort((left, right) => left.name.localeCompare(right.name));
    }, [teacherSubjects]);

    const allTeachers = useMemo(() => {
        const teacherMap = new Map<string, TeacherSummary>();
        teacherSubjects.forEach((item) => {
            if (item.teacher?.id && item.teacher?.name) {
                teacherMap.set(item.teacher.id, item.teacher);
            }
        });
        return Array.from(teacherMap.values()).sort((left, right) => left.name.localeCompare(right.name));
    }, [teacherSubjects]);

    const filteredTeachers = useMemo(() => {
        if (!formData.subjectId) return allTeachers;

        const teacherMap = new Map<string, TeacherSummary>();
        teacherSubjects.forEach((item) => {
            if (item.subjectId !== formData.subjectId) return;
            if (item.teacher?.id && item.teacher?.name) {
                teacherMap.set(item.teacher.id, item.teacher);
            }
        });

        return Array.from(teacherMap.values()).sort((left, right) => left.name.localeCompare(right.name));
    }, [allTeachers, formData.subjectId, teacherSubjects]);

    const selectedTeacherSubject = useMemo(
        () =>
            teacherSubjects.find((item) => item.subjectId === formData.subjectId && item.teacherId === formData.teacherId) || null,
        [formData.subjectId, formData.teacherId, teacherSubjects],
    );

    const duplicateTimeKeys = new Set(
        items
            .filter((item) =>
                item.id !== editingId
                && item.schoolYear?.id === formData.schoolYearId
                && item.seriesClass?.id === formData.seriesClassId
                && item.dayOfWeek === formData.dayOfWeek,
            )
            .filter((item) =>
                selectedTeacherSubject
                    ? item.teacherSubject?.id === selectedTeacherSubject.id
                    : false,
            )
            .map((item) => `${item.startTime}-${item.endTime}`),
    );
    const availableSchedules = periodSchedules.filter((item) =>
        selectedPeriods.includes(item.period)
        && !duplicateTimeKeys.has(`${item.startTime}-${item.endTime}`),
    );
    const isIntervalSchedule = formData.scheduleOption === 'INTERVALO';
    const hasPeriodSchedules = periodSchedules.length > 0;
    const hasScheduleOptions = availableSchedules.length > 0;

    const matchingTeacherSubjectItems = useMemo(() => {
        if (!formData.schoolYearId || !formData.seriesClassId || !formData.dayOfWeek || !selectedTeacherSubject) {
            return [];
        }

        return items
            .filter(
                (item) =>
                    item.id !== editingId
                    && item.schoolYear?.id === formData.schoolYearId
                    && item.seriesClass?.id === formData.seriesClassId
                    && item.dayOfWeek === formData.dayOfWeek
                    && item.teacherSubject?.id === selectedTeacherSubject.id,
            )
            .slice()
            .sort((left, right) => left.startTime.localeCompare(right.startTime));
    }, [
        editingId,
        formData.dayOfWeek,
        formData.schoolYearId,
        formData.seriesClassId,
        items,
        selectedTeacherSubject,
    ]);

    const filteredItems = useMemo(() => {
        const matchingItems = items.filter((item) =>
            (statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? !item.canceledAt : !!item.canceledAt))
            && 
            (!columnFilters.schoolYearId || item.schoolYear?.id === columnFilters.schoolYearId)
            && (!columnFilters.seriesClassId || item.seriesClass?.id === columnFilters.seriesClassId)
            && (!columnFilters.dayOfWeek || item.dayOfWeek === columnFilters.dayOfWeek)
            && (!columnFilters.subjectId || item.teacherSubject?.subject?.id === columnFilters.subjectId)
            && (!columnFilters.teacherId || item.teacherSubject?.teacher?.id === columnFilters.teacherId)
            && (!columnFilters.startTime || item.startTime === columnFilters.startTime)
            && (!columnFilters.endTime || item.endTime === columnFilters.endTime),
        );

        return sortGridRows(matchingItems, GRID_COLUMNS, sortState, (left, right) => {
            const fallbackDayDiff = (dayOrder[left.dayOfWeek] ?? 99) - (dayOrder[right.dayOfWeek] ?? 99);
            if (fallbackDayDiff !== 0) return fallbackDayDiff;

            return left.startTime.localeCompare(right.startTime);
        });
    }, [columnFilters, items, sortState, statusFilter]);

    const scheduleOptions = useMemo(() => {
        return availableSchedules
            .filter((item) => item.lessonNumber > 0)
            .slice()
            .sort((left, right) => {
                const periodDiff = left.period.localeCompare(right.period);
                if (periodDiff !== 0) return periodDiff;
                if (left.lessonNumber !== right.lessonNumber) return left.lessonNumber - right.lessonNumber;
                return left.startTime.localeCompare(right.startTime);
            })
            .map((item) => ({
                value: item.id,
                label:
                    item.lessonNumber === 0
                        ? `${getPeriodLabel(item.period)} - INTERVALO`
                        : `${getPeriodLabel(item.period)} - ${item.lessonNumber}ª AULA (${item.startTime} às ${item.endTime})`,
            }));
    }, [availableSchedules]);

    const hasSelectedTimeConflict = !!formData.startTime && !!formData.endTime && duplicateTimeKeys.has(`${formData.startTime}-${formData.endTime}`);
    const hasInvalidTeacherSubjectSelection = !!formData.subjectId && !!formData.teacherId && !selectedTeacherSubject;
    const canSubmitForm =
        canManage
        && !isSaving
        && !!formData.schoolYearId
        && !!formData.seriesClassId
        && !!formData.scheduleOption
        && !!formData.startTime
        && !!formData.endTime
        && (isIntervalSchedule || (!!formData.subjectId && !!formData.teacherId))
        && !hasSelectedTimeConflict
        && (!isIntervalSchedule && !hasInvalidTeacherSubjectSelection || isIntervalSchedule);

    const focusScheduleField = () => {
        window.setTimeout(() => {
            scheduleSelectRef.current?.focus();
        }, 0);
    };

    const resolveDefaultForm = (
        tenantId: string | null,
        years: SchoolYearSummary[],
        links: SeriesClassSummary[],
        assignments: TeacherSubjectRecord[],
    ): FormState => {
        const stored = readLastSelection(tenantId);
        const activeYear = years.find((item) => item.isActive) || years[0] || null;
        const validStoredYear = years.some((item) => item.id === stored.schoolYearId) ? stored.schoolYearId || '' : '';
        const validStoredSeriesClass = links.some((item) => item.id === stored.seriesClassId) ? stored.seriesClassId || '' : '';
        const validStoredDay = DAY_OPTIONS.some((item) => item.value === stored.dayOfWeek) ? stored.dayOfWeek || 'SEGUNDA' : 'SEGUNDA';
        const validStoredSubject = assignments.some((item) => item.subjectId === stored.subjectId) ? stored.subjectId || '' : '';
        const validStoredTeacher = assignments.some((item) => item.teacherId === stored.teacherId) ? stored.teacherId || '' : '';
        const isValidStoredPair = validStoredSubject && validStoredTeacher
            ? assignments.some((item) => item.subjectId === validStoredSubject && item.teacherId === validStoredTeacher)
            : false;

        return {
            ...EMPTY_FORM,
            schoolYearId: validStoredYear || activeYear?.id || '',
            seriesClassId: validStoredSeriesClass,
            dayOfWeek: validStoredDay,
            subjectId: isValidStoredPair ? validStoredSubject : '',
            teacherId: isValidStoredPair ? validStoredTeacher : '',
        };
    };

    const ensureOperationalSchoolYears = async (token: string, role: string | null, permissions: string[]) => {
        const response = await fetch(`${API_BASE_URL}/school-years`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(getApiErrorMessage(payload, 'Não foi possível carregar os anos letivos.'));
        }

        const yearList = Array.isArray(payload) ? payload as SchoolYearSummary[] : [];
        const currentYear = new Date().getFullYear();
        const targetYears = Array.from(
            { length: currentYear + 2 - SCHOOL_YEAR_START },
            (_, index) => SCHOOL_YEAR_START + index,
        );

        const missingYears = targetYears.filter((year) => !yearList.some((item) => item.year === year));
        const canAutoCreateYears = hasDashboardPermission(role, permissions, 'MANAGE_SCHOOL_YEARS');

        if (missingYears.length === 0 || !canAutoCreateYears) {
            return yearList;
        }

        const hasActiveYear = yearList.some((item) => item.isActive);
        let shouldActivateCurrentYear = !hasActiveYear;

        for (const year of missingYears) {
            const createResponse = await fetch(`${API_BASE_URL}/school-years`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(
                    getSchoolYearPayload(
                        year,
                        shouldActivateCurrentYear && year === currentYear,
                    ),
                ),
            });

            if (!createResponse.ok && createResponse.status !== 409) {
                const createPayload = await createResponse.json().catch(() => null);
                throw new Error(getApiErrorMessage(createPayload, `Não foi possível preparar o ano letivo ${year}.`));
            }

            if (shouldActivateCurrentYear && year === currentYear) {
                shouldActivateCurrentYear = false;
            }
        }

        const refreshedResponse = await fetch(`${API_BASE_URL}/school-years`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const refreshedPayload = await refreshedResponse.json().catch(() => null);

        if (!refreshedResponse.ok) {
            throw new Error(getApiErrorMessage(refreshedPayload, 'Não foi possível atualizar os anos letivos.'));
        }

        return Array.isArray(refreshedPayload) ? refreshedPayload as SchoolYearSummary[] : [];
    };

    if (!isLoading && !canView) {
        return (
            <DashboardAccessDenied
                title="Acesso restrito à grade horária"
                message="Seu perfil não possui todas as permissões necessárias para consultar a grade planejada desta escola."
            />
        );
    }

    const loadData = async () => {
        try {
            setIsLoading(true);
            setErrorStatus(null);
            setModalErrorStatus(null);

            const { token, role, permissions, tenantId } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            setCurrentRole(role);
            setCurrentPermissions(permissions);
            setCurrentTenantId(tenantId);

            const yearList = await ensureOperationalSchoolYears(token, role, permissions);

            const [itemsResponse, seriesClassesResponse, teacherSubjectsResponse, schedulesResponse, tenantResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/class-schedule-items`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/series-classes`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/teacher-subjects`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/schedules`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/tenants/current`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);

            const [itemsData, seriesClassesData, teacherSubjectsData, schedulesData, tenantData] = await Promise.all([
                itemsResponse.json().catch(() => null),
                seriesClassesResponse.json().catch(() => null),
                teacherSubjectsResponse.json().catch(() => null),
                schedulesResponse.json().catch(() => null),
                tenantResponse.json().catch(() => null),
            ]);

            if (!itemsResponse.ok) throw new Error(getApiErrorMessage(itemsData, 'Não foi possível carregar a grade horária.'));
            if (!seriesClassesResponse.ok) throw new Error(getApiErrorMessage(seriesClassesData, 'Não foi possível carregar as turmas.'));
            if (!teacherSubjectsResponse.ok) throw new Error(getApiErrorMessage(teacherSubjectsData, 'Não foi possível carregar professores e matérias.'));
            if (!schedulesResponse.ok) throw new Error(getApiErrorMessage(schedulesData, 'Não foi possível carregar os horários base.'));
            if (!tenantResponse.ok) throw new Error(getApiErrorMessage(tenantData, 'Não foi possível carregar a escola logada.'));

            const seriesClassList = dedupeSeriesClassOptions(
                Array.isArray(seriesClassesData) ? seriesClassesData : [],
                getSeriesClassLabel,
            );

            setItems(Array.isArray(itemsData) ? itemsData : []);
            setSchoolYears(yearList);
            setSeriesClasses(seriesClassList);
            setTeacherSubjects(Array.isArray(teacherSubjectsData) ? teacherSubjectsData : []);
            setSchedules(Array.isArray(schedulesData) ? schedulesData : []);
            setCurrentTenant(tenantData as CurrentTenant);

            if (!editingId && !isModalOpen) {
                setFormData(resolveDefaultForm(tenantId, yearList, seriesClassList, Array.isArray(teacherSubjectsData) ? teacherSubjectsData : []));
            }
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível carregar a grade horária.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

    useEffect(() => {
        let isMounted = true;
        setIsGridConfigReady(false);
        void loadGridColumnConfig(getGridConfigStorageKey(currentTenantId), GRID_COLUMN_KEYS, DEFAULT_VISIBLE_GRID_COLUMNS).then((config) => {
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
        writeGridColumnConfig(getGridConfigStorageKey(currentTenantId), GRID_COLUMN_KEYS, columnOrder, hiddenColumns);
    }, [columnOrder, currentTenantId, hiddenColumns, isGridConfigReady]);

    useEffect(() => {
        if (!currentTenantId || editingId) return;
        writeLastSelection(currentTenantId, {
            schoolYearId: formData.schoolYearId,
            seriesClassId: formData.seriesClassId,
            dayOfWeek: formData.dayOfWeek,
            subjectId: formData.subjectId,
            teacherId: formData.teacherId,
        });
    }, [currentTenantId, editingId, formData.schoolYearId, formData.seriesClassId, formData.dayOfWeek, formData.subjectId, formData.teacherId]);

    useEffect(() => {
        if (formData.scheduleOption === 'INTERVALO' || !formData.scheduleOption) return;
        const stillExists = scheduleOptions.some((item) => item.value === formData.scheduleOption);
        if (stillExists) return;

        setFormData((current) => ({
            ...current,
            scheduleOption: '',
            startTime: '',
            endTime: '',
        }));
    }, [formData.scheduleOption, scheduleOptions]);

    const resetForm = () => {
        setEditingId(null);
        setModalErrorStatus(null);
        setFormData(resolveDefaultForm(currentTenantId, schoolYears, seriesClasses, teacherSubjects));
    };

    const closeModal = () => {
        setIsModalOpen(false);
        resetForm();
    };

    const toggleSort = (column: GridColumnKey) => {
        setSortState((current) => ({
            column,
            direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const openExportModal = () => {
        setErrorStatus(null);
        setIsExportModalOpen(true);
    };

    const toggleGridColumnVisibility = (columnKey: GridColumnKey) => {
        const isHidden = hiddenColumns.includes(columnKey);
        const visibleCount = GRID_COLUMN_KEYS.length - hiddenColumns.length;
        if (!isHidden && visibleCount === 1) {
            setErrorStatus('Pelo menos uma coluna precisa continuar visível no grid.');
            return;
        }

        setHiddenColumns((current) => isHidden ? current.filter((item) => item !== columnKey) : [...current, columnKey]);
    };

    const moveGridColumn = (columnKey: GridColumnKey, direction: 'up' | 'down') => {
        setColumnOrder((current) => {
            const currentIndex = current.indexOf(columnKey);
            if (currentIndex === -1) return current;

            const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (targetIndex < 0 || targetIndex >= current.length) return current;

            const nextOrder = [...current];
            const [movedItem] = nextOrder.splice(currentIndex, 1);
            nextOrder.splice(targetIndex, 0, movedItem);
            return nextOrder;
        });
    };

    const resetGridColumns = () => {
        setColumnOrder(GRID_COLUMN_KEYS);
        setHiddenColumns(GRID_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_GRID_COLUMNS.includes(key)));
        setErrorStatus(null);
    };

    const toggleExportColumn = (column: GridExportColumnKey) => {
        setExportColumns((current) => ({
            ...current,
            [column]: !current[column],
        }));
    };

    const setAllExportColumns = (value: boolean) => {
        setExportColumns(
            GRID_EXPORT_COLUMNS.reduce<Record<GridExportColumnKey, boolean>>((accumulator, column) => {
                accumulator[column.key] = value;
                return accumulator;
            }, {} as Record<GridExportColumnKey, boolean>),
        );
    };

    const renderGridItemInfoButton = (item: ClassScheduleItemRecord) => (
        <GridRecordPopover
            title={getSeriesClassLabel(item.seriesClass)}
            subtitle={`${getDayLabel(item.dayOfWeek)} - ${item.startTime} às ${item.endTime}`}
            buttonLabel={`Ver detalhes do lançamento da grade ${getSeriesClassLabel(item.seriesClass)}`}
            badges={[
                item.canceledAt ? 'INATIVO' : 'ATIVO',
                item.schoolYear?.year ? String(item.schoolYear.year) : 'SEM ANO',
                getDayLabel(item.dayOfWeek),
            ]}
            sections={[
                {
                    title: 'Planejamento',
                    items: [
                        { label: 'Ano letivo', value: item.schoolYear?.year ? String(item.schoolYear.year) : 'Não informado' },
                        { label: 'Turma', value: item.seriesClass?.class?.name || 'Não informada' },
                        { label: 'Série', value: item.seriesClass?.series?.name || 'Não informada' },
                        { label: 'Composição', value: getSeriesClassLabel(item.seriesClass) },
                        { label: 'Turno', value: getShiftSummary(item.seriesClass?.class?.shift) },
                        { label: 'Dia', value: getDayLabel(item.dayOfWeek) },
                        { label: 'Horário', value: `${item.startTime} às ${item.endTime}` },
                    ],
                },
                {
                    title: 'Docência',
                    items: [
                        { label: 'Matéria', value: item.teacherSubject?.subject?.name || 'Não informada' },
                        { label: 'Professor', value: item.teacherSubject?.teacher?.name || 'Não informado' },
                        { label: 'Vínculo professor x matéria', value: item.teacherSubject?.id || 'Não informado' },
                        { label: 'Status', value: item.canceledAt ? 'INATIVO' : 'ATIVO' },
                    ],
                },
            ]}
            contextLabel="PRINCIPAL_GRADE_HORARIA_POPUP"
        />
    );

    const handleExport = async (config?: {
        selectedColumns: Record<GridExportColumnKey, boolean>;
        orderedColumns: GridExportColumnKey[];
        pdfOptions?: import('@/app/lib/grid-export-utils').GridPdfOptions;
    }) => {
        try {
            await exportGridRows({
                rows: filteredItems,
                columns: config?.orderedColumns
                    ? config.orderedColumns
                        .map((key) => GRID_EXPORT_COLUMNS.find((column) => column.key === key))
                        .filter((column): column is GridColumnDefinition<ClassScheduleItemRecord, GridExportColumnKey> => !!column)
                    : GRID_EXPORT_COLUMNS,
                selectedColumns: config?.selectedColumns || exportColumns,
                format: exportFormat,
                pdfOptions: config?.pdfOptions,
                fileBaseName: 'grade-horaria',
                branding: {
                    title: 'Grade horária',
                    subtitle: 'Exportação da grade com os filtros atualmente aplicados.',
                    schoolName: currentTenant?.name || 'ESCOLA LOGADA',
                    logoUrl: currentTenant?.logoUrl || null,
                },
            });
            setSuccessStatus(`Exportação ${exportFormat.toUpperCase()} preparada com ${filteredItems.length} registro(s).`);
            setIsExportModalOpen(false);
            setErrorStatus(null);
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível exportar a grade horária.');
        }
    };

    const openCreateModal = () => {
        setErrorStatus(null);
        resetForm();
        setIsModalOpen(true);
        focusScheduleField();
    };

    const handleSubjectChange = (subjectId: string) => {
        setModalErrorStatus(null);
        setFormData((current) => {
            if (current.scheduleOption === 'INTERVALO') {
                return {
                    ...current,
                    subjectId,
                    teacherId: '',
                };
            }
            const canKeepTeacher = teacherSubjects.some(
                (item) => item.subjectId === subjectId && item.teacherId === current.teacherId,
            );

            return {
                ...current,
                subjectId,
                teacherId: canKeepTeacher ? current.teacherId : '',
            };
        });
    };

    const handleTeacherChange = (teacherId: string) => {
        setModalErrorStatus(null);
        setFormData((current) => ({
            ...current,
            teacherId,
        }));
    };

    const handleSeriesClassChange = (seriesClassId: string) => {
        setModalErrorStatus(null);
        setFormData((current) => ({
            ...current,
            seriesClassId,
            scheduleOption: '',
            startTime: '',
            endTime: '',
        }));
    };

    const handleScheduleOptionChange = (scheduleOption: string) => {
        setModalErrorStatus(null);
        if (scheduleOption === 'INTERVALO') {
            setFormData((current) => ({
                ...current,
                subjectId: '',
                teacherId: '',
                scheduleOption,
                startTime: current.startTime,
                endTime: current.endTime,
            }));
            return;
        }

        const selectedSchedule = availableSchedules.find((item) => item.id === scheduleOption);
        setFormData((current) => ({
            ...current,
            scheduleOption,
            startTime: selectedSchedule?.startTime || '',
            endTime: selectedSchedule?.endTime || '',
        }));
    };

    const handleEdit = (item: ClassScheduleItemRecord) => {
        const matchedSchedule = schedules.find(
            (schedule) => schedule.startTime === item.startTime && schedule.endTime === item.endTime,
        );
        setEditingId(item.id);
        setErrorStatus(null);
        setModalErrorStatus(null);
        setFormData({
            schoolYearId: item.schoolYear?.id || '',
            seriesClassId: item.seriesClass?.id || '',
            dayOfWeek: item.dayOfWeek,
            subjectId: item.teacherSubject?.subject?.id || '',
            teacherId: item.teacherSubject?.teacher?.id || '',
            scheduleOption: matchedSchedule?.id || 'INTERVALO',
            startTime: item.startTime,
            endTime: item.endTime,
        });
        setIsModalOpen(true);
    };

    const openScheduleStatusModal = (item: ClassScheduleItemRecord) => {
        setScheduleStatusToggleTarget(item);
        setScheduleStatusToggleAction(item.canceledAt ? 'activate' : 'deactivate');
    };

    const closeScheduleStatusModal = (force = false) => {
        if (!force && isProcessingScheduleToggle) return;
        setScheduleStatusToggleTarget(null);
        setScheduleStatusToggleAction(null);
    };

    const confirmScheduleStatusToggle = async () => {
        if (!scheduleStatusToggleTarget || !scheduleStatusToggleAction) return;
        const willActivate = scheduleStatusToggleAction === 'activate';
        const summary = `${getSeriesClassLabel(scheduleStatusToggleTarget.seriesClass)} - ${getDayLabel(scheduleStatusToggleTarget.dayOfWeek)} - ${scheduleStatusToggleTarget.startTime}`;

        try {
            setIsProcessingScheduleToggle(true);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const response = await fetch(`${API_BASE_URL}/class-schedule-items/${scheduleStatusToggleTarget.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ active: willActivate }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) throw new Error(getApiErrorMessage(data, willActivate ? 'Não foi possível ativar o lançamento da grade.' : 'Não foi possível inativar o lançamento da grade.'));

            setSuccessStatus(data?.message || (willActivate ? 'Lançamento da grade ativado com sucesso.' : 'Lançamento da grade inativado com sucesso.'));
            await loadData();
            closeScheduleStatusModal(true);
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : (willActivate ? 'Não foi possível ativar o lançamento da grade.' : 'Não foi possível inativar o lançamento da grade.'));
        } finally {
            setIsProcessingScheduleToggle(false);
        }
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();

        try {
            setIsSaving(true);
            setErrorStatus(null);
            setModalErrorStatus(null);
            setSuccessStatus(null);

            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');
            if (!formData.schoolYearId) throw new Error('Selecione o ano letivo.');
            if (!formData.seriesClassId) throw new Error('Selecione a turma.');
            if (!formData.scheduleOption) throw new Error('Selecione o horário da turma ou marque INTERVALO.');
            if (!formData.startTime) throw new Error(isIntervalSchedule ? 'Informe o horário inicial do intervalo.' : 'Selecione um horário válido da turma.');
            if (!formData.endTime) throw new Error(isIntervalSchedule ? 'Informe o horário final do intervalo.' : 'Selecione um horário válido da turma.');
            if (!isIntervalSchedule && !formData.subjectId) throw new Error('Selecione a matéria.');
            if (!isIntervalSchedule && !formData.teacherId) throw new Error('Selecione o professor.');
            if (duplicateTimeKeys.has(`${formData.startTime}-${formData.endTime}`)) {
                throw new Error('Já existe um lançamento igual para ano, turma, dia, matéria, professor e horário.');
            }

            if (!isIntervalSchedule && !selectedTeacherSubject) {
                throw new Error('O professor selecionado não está vinculado a esta matéria.');
            }

            const response = await fetch(
                editingId ? `${API_BASE_URL}/class-schedule-items/${editingId}` : `${API_BASE_URL}/class-schedule-items`,
                {
                    method: editingId ? 'PATCH' : 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        schoolYearId: formData.schoolYearId,
                        seriesClassId: formData.seriesClassId,
                        dayOfWeek: formData.dayOfWeek,
                        teacherSubjectId: isIntervalSchedule ? null : selectedTeacherSubject?.id,
                        startTime: formData.startTime,
                        endTime: formData.endTime,
                    }),
                },
            );

            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(getApiErrorMessage(data, 'Não foi possível salvar o lançamento da grade.'));

            const isEditing = !!editingId;
            setSuccessStatus(isEditing ? 'Lançamento da grade atualizado com sucesso.' : 'Lançamento da grade cadastrado com sucesso.');
            if (isEditing) {
                closeModal();
            } else {
                setFormData((current) => ({
                    ...current,
                    scheduleOption: '',
                    startTime: '',
                    endTime: '',
                }));
                focusScheduleField();
            }
            await loadData();
        } catch (error) {
            setErrorStatus(null);
            setModalErrorStatus(error instanceof Error ? error.message : 'Não foi possível salvar o lançamento da grade.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="w-full space-y-8">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-[#153a6a]">Grade horária</h1>
                    <p className="mt-1 font-medium text-slate-500">Monte a grade planejada da escola por ano letivo, turma, dia e aula.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={openExportModal}
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
                            Novo lançamento
                        </button>
                    ) : null}
                </div>
            </div>

            {!isModalOpen && errorStatus ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorStatus}</div> : null}
            {successStatus ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{successStatus}</div> : null}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="dashboard-band border-b px-6 py-4">
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1.4fr_1fr_1.2fr_1.2fr_0.8fr_0.8fr_auto]">
                        <select
                            value={columnFilters.schoolYearId}
                            onChange={(event) => setColumnFilters((current) => ({ ...current, schoolYearId: event.target.value }))}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        >
                            <option value="">Ano letivo</option>
                            {schoolYears.map((item) => (
                                <option key={item.id} value={item.id}>{item.year}</option>
                            ))}
                        </select>

                        <select
                            value={columnFilters.seriesClassId}
                            onChange={(event) => setColumnFilters((current) => ({ ...current, seriesClassId: event.target.value }))}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        >
                            <option value="">Turma</option>
                            {seriesClasses.map((item) => (
                                <option key={item.id} value={item.id}>{getSeriesClassLabel(item)}</option>
                            ))}
                        </select>

                        <select
                            value={columnFilters.dayOfWeek}
                            onChange={(event) => setColumnFilters((current) => ({ ...current, dayOfWeek: event.target.value }))}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        >
                            <option value="">Dia</option>
                            {DAY_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                            ))}
                        </select>

                        <select
                            value={columnFilters.subjectId}
                            onChange={(event) => setColumnFilters((current) => ({ ...current, subjectId: event.target.value }))}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        >
                            <option value="">Matéria</option>
                            {allSubjects.map((item) => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                        </select>

                        <select
                            value={columnFilters.teacherId}
                            onChange={(event) => setColumnFilters((current) => ({ ...current, teacherId: event.target.value }))}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        >
                            <option value="">Professor</option>
                            {allTeachers.map((item) => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                        </select>

                        <input
                            type="time"
                            value={columnFilters.startTime}
                            onChange={(event) => setColumnFilters((current) => ({ ...current, startTime: event.target.value }))}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />

                        <input
                            type="time"
                            value={columnFilters.endTime}
                            onChange={(event) => setColumnFilters((current) => ({ ...current, endTime: event.target.value }))}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />

                        <button
                            type="button"
                            onClick={() => setColumnFilters(EMPTY_COLUMN_FILTERS)}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                        >
                            Limpar
                        </button>
                    </div>
                </div>
                {!isLoading && (!hasSchoolYearOptions || !hasSeriesClassOptions || !hasTeacherSubjectOptions) ? (
                    <div className="border-b border-amber-200 bg-amber-50 px-6 py-4 text-sm font-medium text-amber-800">
                        {!hasSchoolYearOptions ? 'Os anos letivos desta escola ainda estão sendo preparados.' : null}
                        {!hasSeriesClassOptions ? ' Cadastre séries e turmas para liberar o combobox de turma.' : null}
                        {!hasTeacherSubjectOptions ? ' Cadastre professores, matérias e o vínculo professor x matéria para liberar os demais comboboxes.' : null}
                    </div>
                ) : null}
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
                            {isLoading ? <tr><td colSpan={visibleGridColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">Carregando grade horária...</td></tr> : null}
                            {!isLoading && filteredItems.length === 0 ? <tr><td colSpan={visibleGridColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">Nenhum lançamento de grade encontrado.</td></tr> : null}
                            {!isLoading && filteredItems.map((item) => (
                                <tr key={item.id} className={item.canceledAt ? 'bg-rose-50/40 hover:bg-rose-50' : 'hover:bg-slate-50'}>
                                    {visibleGridColumns.map((column) => renderGridCell(item, column.key))}
                                    <td className="px-6 py-4 text-right">
                                        {canManage ? (
                                            <div className="flex justify-end gap-2">
                                                {renderGridItemInfoButton(item)}
                                                <GridRowActionIconButton title="Editar lançamento" onClick={() => handleEdit(item)} tone="blue">
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </GridRowActionIconButton>
                                                <GridRowActionIconButton title={item.canceledAt ? 'Ativar lançamento' : 'Inativar lançamento'} onClick={() => openScheduleStatusModal(item)} tone={item.canceledAt ? 'emerald' : 'rose'}>
                                                    {item.canceledAt ? (
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
                                        ) : (
                                            <div className="flex justify-end gap-2">
                                                {renderGridItemInfoButton(item)}
                                                <span className="self-center text-xs font-semibold uppercase tracking-wide text-slate-300">Somente leitura</span>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <GridFooterControls
                    key={`grade-horaria-footer-${filteredItems.length}`}
                    recordsCount={Number(filteredItems.length)}
                    onOpenColumns={() => setIsGridConfigOpen(true)}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    activeLabel="Mostrar somente lançamentos ativos"
                    allLabel="Mostrar lançamentos ativos e inativos"
                    inactiveLabel="Mostrar somente lançamentos inativos"
                />
            </section>

            {isModalOpen ? (
                <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
                            <h2 className="text-xl font-bold text-[#153a6a]">{editingId ? 'Editar grade horária' : 'Novo lançamento da grade'}</h2>
                            <button onClick={closeModal} className="text-slate-400 hover:text-red-500">
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-5 p-6">
                            {modalErrorStatus ? (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                                    {modalErrorStatus}
                                </div>
                            ) : null}

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                                <select value={formData.schoolYearId} onChange={(event) => { setModalErrorStatus(null); setFormData((current) => ({ ...current, schoolYearId: event.target.value })); }} className={inputClass}>
                                    <option value="">Selecione o ano letivo</option>
                                    {schoolYears.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.year}{item.isActive ? ' (ATIVO)' : ''}
                                        </option>
                                    ))}
                                </select>

                                <select value={formData.seriesClassId} onChange={(event) => handleSeriesClassChange(event.target.value)} className={inputClass}>
                                    <option value="">Selecione a turma</option>
                                    {seriesClasses.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {getSeriesClassLabel(item)}
                                        </option>
                                    ))}
                                </select>

                                <select value={formData.dayOfWeek} onChange={(event) => { setModalErrorStatus(null); setFormData((current) => ({ ...current, dayOfWeek: event.target.value as DayValue })); }} className={inputClass}>
                                    {DAY_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className={`grid grid-cols-1 gap-4 ${isIntervalSchedule ? 'xl:grid-cols-[1fr_1fr_1fr_0.6fr_0.6fr]' : 'xl:grid-cols-[1fr_1fr_1fr]'}`}>
                                <select value={formData.subjectId} onChange={(event) => handleSubjectChange(event.target.value)} className={inputClass} disabled={isIntervalSchedule}>
                                    <option value="">Selecione a matéria</option>
                                    {allSubjects.map((item) => (
                                        <option key={item.id} value={item.id}>{item.name}</option>
                                    ))}
                                </select>

                                <select value={formData.teacherId} onChange={(event) => handleTeacherChange(event.target.value)} className={inputClass} disabled={isIntervalSchedule}>
                                    <option value="">Selecione o professor</option>
                                    {filteredTeachers.map((item) => (
                                        <option key={item.id} value={item.id}>{item.name}</option>
                                    ))}
                                </select>

                                <select
                                    ref={scheduleSelectRef}
                                    value={formData.scheduleOption}
                                    onChange={(event) => handleScheduleOptionChange(event.target.value)}
                                    className={inputClass}
                                    disabled={!formData.seriesClassId}
                                >
                                    <option value="">
                                        {!formData.seriesClassId
                                            ? 'Selecione a turma primeiro'
                                            : hasScheduleOptions
                                                ? 'Selecione o horário da turma'
                                                : hasPeriodSchedules
                                                    ? 'Todos os horários da turma já estão ocupados'
                                                    : 'Cadastre os horários base ou use INTERVALO'}
                                    </option>
                                    {scheduleOptions.map((item) => (
                                        <option key={item.value} value={item.value}>{item.label}</option>
                                    ))}
                                    <option value="INTERVALO">INTERVALO</option>
                                </select>

                                {isIntervalSchedule ? (
                                    <input
                                        type="time"
                                        value={formData.startTime}
                                        onChange={(event) => { setModalErrorStatus(null); setFormData((current) => ({ ...current, startTime: event.target.value })); }}
                                        className={inputClass}
                                    />
                                ) : null}
                                {isIntervalSchedule ? (
                                    <input
                                        type="time"
                                        value={formData.endTime}
                                        onChange={(event) => { setModalErrorStatus(null); setFormData((current) => ({ ...current, endTime: event.target.value })); }}
                                        className={inputClass}
                                    />
                                ) : null}
                            </div>

                            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm font-medium text-slate-600">
                                Os últimos valores usados de <span className="font-bold text-slate-800">ano letivo</span>, <span className="font-bold text-slate-800">turma</span>, <span className="font-bold text-slate-800">dia da semana</span>, <span className="font-bold text-slate-800">matéria</span> e <span className="font-bold text-slate-800">professor</span> ficam memorizados para agilizar os próximos lançamentos.
                            </div>

                            {selectedSeriesClass ? (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600">
                                    {selectedPeriods.length > 0 ? (
                                        <>
                                            Esta turma tem aula no período <span className="font-bold text-slate-800">{selectedPeriods.map(getPeriodLabel).join(' / ')}</span>.
                                            {hasScheduleOptions
                                                ? ' Escolha abaixo um dos horários cadastrados para esse período ou use INTERVALO para lançar um horário manual.'
                                                : hasPeriodSchedules
                                                    ? ' Todos os horários já usados desta turma neste dia foram removidos do combobox. Use INTERVALO apenas se precisar lançar um horário diferente.'
                                                    : ' Não há horários base cadastrados para esse período; use INTERVALO para informar as horas manualmente ou cadastre os horários base.'}
                                        </>
                                    ) : (
                                        <>A turma selecionada ainda não tem período definido. Marque INTERVALO para informar horário manualmente ou ajuste o turno da turma.</>
                                    )}
                                </div>
                            ) : null}

                            {formData.subjectId && formData.teacherId && !selectedTeacherSubject && !isIntervalSchedule ? (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-800">
                                    O professor selecionado não está vinculado a esta matéria. Escolha outra combinação para continuar o lançamento.
                                </div>
                            ) : null}

                            {hasSelectedTimeConflict ? (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-medium text-red-700">
                                    Já existe um lançamento igual para ano, turma, dia, matéria, professor e horário. Escolha outro horário ou altere algum desses campos antes de salvar.
                                </div>
                            ) : null}

                            {formData.schoolYearId && formData.seriesClassId && formData.dayOfWeek && formData.subjectId && formData.teacherId && !isIntervalSchedule ? (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600">
                                    {matchingTeacherSubjectItems.length > 0
                                        ? `Já existem ${matchingTeacherSubjectItems.length} lançamento(s) para esta combinação de ano, turma, dia, matéria e professor. Horários já cadastrados: ${matchingTeacherSubjectItems.map((item) => `${item.startTime} às ${item.endTime}`).join(' | ')}.`
                                        : 'Ainda não existe lançamento para esta combinação de ano, turma, dia, matéria e professor.'}
                                </div>
                            ) : null}

                            {formData.seriesClassId && formData.schoolYearId ? (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600">
                                    {duplicateTimeKeys.size > 0
                                        ? `Somente os horários já cadastrados para esta combinação completa deixam de aparecer no combobox. Total bloqueado: ${duplicateTimeKeys.size}.`
                                        : 'Nenhum horário desta combinação completa está bloqueado até o momento.'}
                                </div>
                            ) : null}

                            {!hasSeriesClassOptions || !hasTeacherSubjectOptions ? (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-800">
                                    {!hasSeriesClassOptions ? 'Nenhuma turma disponível nesta escola. Cadastre séries e turmas antes de montar a grade.' : null}
                                    {!hasTeacherSubjectOptions ? ' Nenhum vínculo professor x matéria disponível. Cadastre professores, matérias e faça o vínculo para concluir a grade.' : null}
                                </div>
                            ) : null}

                            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                                <button type="button" onClick={closeModal} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancelar</button>
                                <button type="submit" disabled={!canSubmitForm} className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300">
                                    {isSaving ? 'Salvando...' : editingId ? 'Salvar edição' : 'Cadastrar lançamento'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            <GridColumnConfigModal
                isOpen={isGridConfigOpen}
                title="Configurar colunas do grid"
                description="Reordene, oculte ou inclua colunas da grade horária nesta tela."
                columns={GRID_COLUMNS.map((column) => ({ key: column.key, label: column.label, visibleByDefault: column.visibleByDefault }))}
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
                title={scheduleStatusToggleAction === 'activate' ? 'Ativar lançamento' : 'Inativar lançamento'}
                itemLabel="Lançamento"
                itemName={scheduleStatusToggleTarget ? `${getSeriesClassLabel(scheduleStatusToggleTarget.seriesClass)} - ${getDayLabel(scheduleStatusToggleTarget.dayOfWeek)} - ${scheduleStatusToggleTarget.startTime}` : ''}
                description={scheduleStatusToggleAction === 'activate'
                    ? 'Ao ativar este lançamento da grade ele volta a ser considerado ativo e entra nas rotas de aula.'
                    : 'Ao inativar este lançamento, ele permanece no histórico, porém sai das rotinas ativas.'}
                confirmLabel={scheduleStatusToggleAction === 'activate' ? 'Confirmar ativação' : 'Confirmar inativação'}
                onCancel={() => closeScheduleStatusModal(true)}
                onConfirm={confirmScheduleStatusToggle}
                isProcessing={isProcessingScheduleToggle}
                statusActive={!scheduleStatusToggleTarget?.canceledAt}
                screenId={GRADE_HORARIA_ANTES_STATUS_MODAL_SCREEN_ID}
            />

            <GridExportModal
                isOpen={isExportModalOpen}
                title="Exportar grade horária"
                description={`A exportação respeita os filtros atuais da tela e inclui ${filteredItems.length} registro(s).`}
                format={exportFormat}
                onFormatChange={setExportFormat}
                columns={GRID_EXPORT_COLUMNS.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={exportColumns}
                onToggleColumn={toggleExportColumn}
                onSelectAll={setAllExportColumns}
                storageKey={getGridExportConfigStorageKey(currentTenantId)}
                onClose={() => setIsExportModalOpen(false)}
                onExport={handleExport}
            />
        </div>
    );
}

