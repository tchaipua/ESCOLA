'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import GridColumnConfigModal from '@/app/components/grid-column-config-modal';
import GridExportModal from '@/app/components/grid-export-modal';
import GridFooterControls from '@/app/components/grid-footer-controls';
import RecordStatusIndicator from '@/app/components/record-status-indicator';
import GridRecordPopover from '@/app/components/grid-record-popover';
import GridRowActionIconButton from '@/app/components/grid-row-action-icon-button';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import StatusConfirmationModal from '@/app/components/status-confirmation-modal';
import { type GridStatusFilterValue } from '@/app/components/grid-status-filter';
import { getDashboardAuthContext, hasAllDashboardPermissions, hasDashboardPermission } from '@/app/lib/dashboard-crud-utils';
import { getAllGridColumnKeys, getDefaultVisibleGridColumnKeys, loadGridColumnConfig, type ConfigurableGridColumn, writeGridColumnConfig } from '@/app/lib/grid-column-config-utils';
import { buildDefaultExportColumns, buildExportColumnsFromGridColumns, exportGridRows, type GridColumnDefinition, type GridExportFormat } from '@/app/lib/grid-export-utils';
import { dedupeSeriesClassOptions } from '@/app/lib/series-class-option-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const API_BASE_URL = 'http://localhost:3001/api/v1';
const GRADE_HORARIA_STATUS_MODAL_SCREEN_ID = 'PRINCIPAL_GRADE_HORARIA_STATUS_MODAL';
const GRADE_HORARIA_NEW_MODAL_SCREEN_ID = 'PRINCIPAL_GRADE_HORARIA_NEW_MODAL';
const GRADE_HORARIA_EDIT_MODAL_SCREEN_ID = 'PRINCIPAL_GRADE_HORARIA_EDIT_MODAL';
const GRADE_HORARIA_BLOCKED_DELETE_SCREEN_ID = 'PRINCIPAL_GRADE_HORARIA_BLOQUEIO_EXCLUSAO';
const GRADE_HORARIA_BLOCKED_DELETE_MESSAGE = 'Este lançamento já foi usado no calendário anual e não pode mais ser excluído !!!';
const SCHOOL_YEAR_START = 2025;
const SCREEN_PROGRAM_NAME = 'PRINCIPAL_GRADE_HORARIA_SEMANAL_CARDS';
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
    canBePhysicallyDeleted?: boolean;
    linkedLessonCalendarItems?: number;
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

type ClipboardFeedback = 'idle' | 'success' | 'error';

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

function timeRangesOverlap(leftStartTime: string, leftEndTime: string, rightStartTime: string, rightEndTime: string) {
    return leftStartTime < rightEndTime && rightStartTime < leftEndTime;
}

function getScheduleConflictLabel(item: ClassScheduleItemRecord) {
    const subjectName = item.teacherSubject?.subject?.name || 'INTERVALO';
    const teacherName = item.teacherSubject?.teacher?.name || 'SEM PROFESSOR';
    return `${item.startTime} às ${item.endTime} - ${subjectName} / ${teacherName}`;
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

function resolveDefaultFilterSchoolYearId(years: SchoolYearSummary[]) {
    const currentYear = new Date().getFullYear();
    return years.find((item) => item.year === currentYear)?.id
        || years.find((item) => item.isActive)?.id
        || years[0]?.id
        || '';
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
    const [blockedDeleteMessage, setBlockedDeleteMessage] = useState<string | null>(null);
    const [clipboardFeedback, setClipboardFeedback] = useState<ClipboardFeedback>('idle');
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
    const hasSchoolYearOptions = schoolYears.length > 0;
    const hasSeriesClassOptions = seriesClasses.length > 0;
    const hasTeacherSubjectOptions = teacherSubjects.length > 0;
    const selectedSeriesClass = seriesClasses.find((item) => item.id === formData.seriesClassId) || null;
    const selectedPeriods = parseShiftPeriods(selectedSeriesClass?.class?.shift);
    const blockedDeleteBranding = readCachedTenantBranding(currentTenantId);
    const modalErrorBranding = blockedDeleteBranding;
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

    const sameDaySeriesTimeItems = useMemo(() => {
        return items.filter((item) =>
            item.id !== editingId
            && !item.canceledAt
            && item.schoolYear?.id === formData.schoolYearId
            && item.seriesClass?.id === formData.seriesClassId
            && item.dayOfWeek === formData.dayOfWeek,
        );
    }, [editingId, formData.dayOfWeek, formData.schoolYearId, formData.seriesClassId, items]);

    const blockedScheduleOptionsCount = periodSchedules.filter((schedule) =>
        sameDaySeriesTimeItems.some((item) =>
            timeRangesOverlap(schedule.startTime, schedule.endTime, item.startTime, item.endTime),
        ),
    );
    const availableSchedules = periodSchedules.filter((item) =>
        selectedPeriods.includes(item.period)
        && !sameDaySeriesTimeItems.some((scheduledItem) =>
            timeRangesOverlap(item.startTime, item.endTime, scheduledItem.startTime, scheduledItem.endTime),
        ),
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
                    && !item.canceledAt
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
        const matchingItems = items
            .filter((item) =>
                (statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? !item.canceledAt : !!item.canceledAt))
                && (!columnFilters.schoolYearId || item.schoolYear?.id === columnFilters.schoolYearId)
                && (!columnFilters.seriesClassId || item.seriesClass?.id === columnFilters.seriesClassId)
                && (!columnFilters.dayOfWeek || item.dayOfWeek === columnFilters.dayOfWeek)
                && (!columnFilters.subjectId || item.teacherSubject?.subject?.id === columnFilters.subjectId)
                && (!columnFilters.teacherId || item.teacherSubject?.teacher?.id === columnFilters.teacherId)
                && (!columnFilters.startTime || item.startTime === columnFilters.startTime)
                && (!columnFilters.endTime || item.endTime === columnFilters.endTime),
            )
            .slice()
            .sort((left, right) => {
                const dayDiff = (dayOrder[left.dayOfWeek] ?? 99) - (dayOrder[right.dayOfWeek] ?? 99);
                if (dayDiff !== 0) return dayDiff;
                return left.startTime.localeCompare(right.startTime);
            });

        return matchingItems;
    }, [columnFilters, items, statusFilter]);

    const hasYearSelection = Boolean(columnFilters.schoolYearId);
    const hasSeriesSelection = Boolean(columnFilters.seriesClassId);
    const shouldShowSchedule = hasYearSelection && hasSeriesSelection;

    const scheduleItemsByDay = useMemo(() => {
        const grouped = DAY_OPTIONS.reduce<Record<DayValue, ClassScheduleItemRecord[]>>((accumulator, option) => {
            accumulator[option.value] = [];
            return accumulator;
        }, {} as Record<DayValue, ClassScheduleItemRecord[]>);

        if (!shouldShowSchedule) {
            return grouped;
        }

        filteredItems.forEach((item) => {
            if (grouped[item.dayOfWeek]) {
                grouped[item.dayOfWeek].push(item);
            }
        });

        Object.values(grouped).forEach((dayItems) => {
            dayItems.sort((left, right) => left.startTime.localeCompare(right.startTime));
        });

        return grouped;
    }, [filteredItems, shouldShowSchedule]);

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

    const conflictingScheduleItems = useMemo(() => {
        if (!formData.startTime || !formData.endTime) return [];

        return sameDaySeriesTimeItems
            .filter((item) => timeRangesOverlap(formData.startTime, formData.endTime, item.startTime, item.endTime))
            .slice()
            .sort((left, right) => {
                const startDiff = left.startTime.localeCompare(right.startTime);
                if (startDiff !== 0) return startDiff;
                const subjectDiff = (left.teacherSubject?.subject?.name || '').localeCompare(right.teacherSubject?.subject?.name || '');
                if (subjectDiff !== 0) return subjectDiff;
                return (left.teacherSubject?.teacher?.name || '').localeCompare(right.teacherSubject?.teacher?.name || '');
            });
    }, [formData.endTime, formData.startTime, sameDaySeriesTimeItems]);

    const sameDayTeacherItems = useMemo(() => {
        if (!formData.schoolYearId || !formData.dayOfWeek || !formData.teacherId) {
            return [];
        }

        return items.filter((item) =>
            item.id !== editingId
            && !item.canceledAt
            && item.schoolYear?.id === formData.schoolYearId
            && item.dayOfWeek === formData.dayOfWeek
            && item.seriesClass?.id !== formData.seriesClassId
            && item.teacherSubject?.teacher?.id === formData.teacherId,
        );
    }, [editingId, formData.dayOfWeek, formData.schoolYearId, formData.seriesClassId, formData.teacherId, items]);

    const conflictingTeacherItems = useMemo(() => {
        if (!formData.startTime || !formData.endTime || !formData.teacherId || isIntervalSchedule) {
            return [];
        }

        return sameDayTeacherItems
            .filter((item) => timeRangesOverlap(formData.startTime, formData.endTime, item.startTime, item.endTime))
            .slice()
            .sort((left, right) => {
                const startDiff = left.startTime.localeCompare(right.startTime);
                if (startDiff !== 0) return startDiff;
                return getSeriesClassLabel(left.seriesClass).localeCompare(getSeriesClassLabel(right.seriesClass));
            });
    }, [formData.endTime, formData.startTime, formData.teacherId, isIntervalSchedule, sameDayTeacherItems]);

    const conflictSummary = conflictingScheduleItems
        .map((item) => getScheduleConflictLabel(item))
        .join(' | ');
    const teacherConflictSummary = conflictingTeacherItems
        .map((item) => `${getSeriesClassLabel(item.seriesClass)} - ${getScheduleConflictLabel(item)}`)
        .join(' | ');

    const hasSelectedTimeConflict = conflictingScheduleItems.length > 0;
    const hasTeacherTimeConflict = conflictingTeacherItems.length > 0;
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
        && !hasTeacherTimeConflict
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

    const prepareCreationForm = (overrides: Partial<FormState> = {}) => {
        setEditingId(null);
        setModalErrorStatus(null);
        setFormData({
            ...resolveDefaultForm(currentTenantId, schoolYears, seriesClasses, teacherSubjects),
            ...overrides,
        });
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
            setColumnFilters((current) => ({
                ...current,
                schoolYearId: current.schoolYearId || resolveDefaultFilterSchoolYearId(yearList),
            }));

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
        prepareCreationForm();
    };

    const closeModal = () => {
        setIsModalOpen(false);
        resetForm();
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

    const openCreateModal = (overrides: Partial<FormState> = {}) => {
        setErrorStatus(null);
        prepareCreationForm(overrides);
        setIsModalOpen(true);
        focusScheduleField();
    };

    const openCreateForDay = (day: DayValue) => {
        if (!columnFilters.schoolYearId || !columnFilters.seriesClassId) {
            setErrorStatus('Selecione o ano letivo e a turma antes de cadastrar um lançamento.');
            return;
        }

        openCreateModal({
            schoolYearId: columnFilters.schoolYearId,
            seriesClassId: columnFilters.seriesClassId,
            dayOfWeek: day,
        });
    };

    const handleCopyScreenProgramName = async () => {
        try {
            await navigator.clipboard.writeText(SCREEN_PROGRAM_NAME);
            setClipboardFeedback('success');
        } catch {
            setClipboardFeedback('error');
        }

        window.setTimeout(() => {
            setClipboardFeedback('idle');
        }, 2200);
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
        if (!item.canceledAt && (item.canBePhysicallyDeleted === false || (item.linkedLessonCalendarItems || 0) > 0)) {
            setBlockedDeleteMessage(GRADE_HORARIA_BLOCKED_DELETE_MESSAGE);
            return;
        }

        setScheduleStatusToggleTarget(item);
        setScheduleStatusToggleAction(item.canceledAt ? 'activate' : 'deactivate');
    };

    const closeScheduleStatusModal = (force = false) => {
        if (!force && isProcessingScheduleToggle) return;
        setScheduleStatusToggleTarget(null);
        setScheduleStatusToggleAction(null);
    };

    const closeBlockedDeletePopup = () => {
        setBlockedDeleteMessage(null);
    };

    const closeModalErrorPopup = () => {
        setModalErrorStatus(null);
    };

    const confirmScheduleStatusToggle = async () => {
        if (!scheduleStatusToggleTarget || !scheduleStatusToggleAction) return;
        const willActivate = scheduleStatusToggleAction === 'activate';

        try {
            setIsProcessingScheduleToggle(true);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const response = willActivate
                ? await fetch(`${API_BASE_URL}/class-schedule-items/${scheduleStatusToggleTarget.id}/status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ active: true }),
                })
                : await fetch(`${API_BASE_URL}/class-schedule-items/${scheduleStatusToggleTarget.id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                const apiMessage = getApiErrorMessage(data, willActivate ? 'Não foi possível ativar o lançamento da grade.' : 'Não foi possível excluir o lançamento da grade.');
                if (!willActivate && apiMessage.includes('não pode mais ser excluído fisicamente')) {
                    setErrorStatus(null);
                    setBlockedDeleteMessage(GRADE_HORARIA_BLOCKED_DELETE_MESSAGE);
                    closeScheduleStatusModal(true);
                    return;
                }
                throw new Error(apiMessage);
            }

            setSuccessStatus(data?.message || (willActivate ? 'Lançamento da grade ativado com sucesso.' : 'Lançamento da grade excluído com sucesso.'));
            await loadData();
            closeScheduleStatusModal(true);
        } catch (error) {
            const fallbackMessage = willActivate ? 'Não foi possível ativar o lançamento da grade.' : 'Não foi possível excluir o lançamento da grade.';
            const errorMessage = error instanceof Error ? error.message : fallbackMessage;
            if (!willActivate && errorMessage.includes('não pode mais ser excluído fisicamente')) {
                setErrorStatus(null);
                setBlockedDeleteMessage(GRADE_HORARIA_BLOCKED_DELETE_MESSAGE);
                closeScheduleStatusModal(true);
                return;
            }
            setErrorStatus(errorMessage);
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
            if (conflictingScheduleItems.length > 0) {
                throw new Error(`Este horário sobrepõe outro lançamento desta turma neste dia: ${conflictSummary}.`);
            }

            if (conflictingTeacherItems.length > 0) {
                throw new Error(`O professor selecionado já possui aula sobreposta neste dia: ${teacherConflictSummary}.`);
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
                </div>
            </div>

            {!isModalOpen && errorStatus ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorStatus}</div> : null}
            {successStatus ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{successStatus}</div> : null}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="dashboard-band border-b px-6 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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

                        <button
                            type="button"
                            onClick={() => setColumnFilters(EMPTY_COLUMN_FILTERS)}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                        >
                            Limpar
                        </button>
                    </div>
                    {!isLoading && (!hasSchoolYearOptions || !hasSeriesClassOptions || !hasTeacherSubjectOptions) ? (
                        <div className="mt-4 flex flex-col gap-1 border-t border-amber-200/60 px-3 pt-4 text-sm font-medium text-amber-800">
                            {!hasSchoolYearOptions ? 'Os anos letivos desta escola ainda estão sendo preparados.' : null}
                            {!hasSeriesClassOptions ? ' Cadastre séries e turmas para liberar o combobox de turma.' : null}
                            {!hasTeacherSubjectOptions ? ' Cadastre professores, matérias e o vínculo professor x matéria para liberar os demais comboboxes.' : null}
                        </div>
                    ) : null}
                </div>
                <div className="px-6 py-6">
                    {isLoading ? (
                        <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">
                            Carregando grade horária...
                        </div>
                    ) : !shouldShowSchedule ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
                            Selecione o ano letivo e a turma para visualizar a grade semanal planejada.
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
                            Nenhum lançamento encontrado para esta combinação.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
                            {DAY_OPTIONS.map((day) => {
                                const dayItems = scheduleItemsByDay[day.value];
                                return (
                                    <div key={day.value} className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 shadow-sm">
                                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {canManage ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => openCreateForDay(day.value)}
                                                        className="rounded-2xl border border-blue-500/70 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-700 shadow-sm shadow-blue-200/60 transition hover:bg-blue-100"
                                                    >
                                                        Novo lançamento
                                                    </button>
                                                ) : null}
                                                <span className="text-sm font-semibold uppercase tracking-wide text-slate-800">{day.label}</span>
                                            </div>
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{dayItems.length} registro(s)</span>
                                        </div>
                                        <div className="flex flex-col gap-3 px-4 pb-4">
                                            {dayItems.length === 0 ? (
                                                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-3 py-4 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                                    Sem lançamentos
                                                </div>
                                            ) : (
                                                dayItems.map((item) => {
                                                    const isIntervalItem = !item.teacherSubject;

                                                    return (
                                                    <article key={`${day.value}-${item.id}`} className={`space-y-3 rounded-2xl border p-3 shadow-sm ${isIntervalItem ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'} ${item.canceledAt ? 'opacity-80' : ''}`}>
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <p className="text-sm font-semibold uppercase tracking-wide text-slate-900">{item.startTime} às {item.endTime}</p>
                                                            </div>
                                                            <RecordStatusIndicator active={!item.canceledAt} />
                                                        </div>
                                                        <div className="space-y-0.5">
                                                            {isIntervalItem ? (
                                                                <div className="rounded-xl bg-emerald-500 px-3 py-2 text-center text-sm font-extrabold uppercase tracking-[0.2em] text-white">
                                                                    INTERVALO
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <p className="text-sm font-bold text-[#153a6a]">{item.teacherSubject?.subject?.name || '---'}</p>
                                                                    <p className="text-xs uppercase tracking-wide text-slate-500">{item.teacherSubject?.teacher?.name || '---'}</p>
                                                                </>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center justify-between gap-2">
                                                            {renderGridItemInfoButton(item)}
                                                            {canManage ? (
                                                                <div className="flex flex-wrap items-center gap-1">
                                                                    <GridRowActionIconButton title="Editar lançamento" onClick={() => handleEdit(item)} tone="blue">
                                                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                        </svg>
                                                                    </GridRowActionIconButton>
                                                                    <GridRowActionIconButton title={item.canceledAt ? 'Ativar lançamento' : 'Excluir lançamento'} onClick={() => openScheduleStatusModal(item)} tone={item.canceledAt ? 'emerald' : 'rose'}>
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
                                                                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">Somente leitura</span>
                                                            )}
                                                        </div>
                                                    </article>
                                                );
                                                })
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
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

                                {formData.scheduleOption === 'INTERVALO' ? (
                                    <div className="rounded-2xl border border-emerald-500 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 shadow-sm">
                                        INTERVALO
                                    </div>
                                ) : null}

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
                                    Este horário sobrepõe outro lançamento da mesma turma neste dia. Já lançado: <span className="font-bold">{conflictSummary}</span>.
                                </div>
                            ) : null}

                            {hasTeacherTimeConflict ? (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-medium text-red-700">
                                    O professor selecionado já possui aula sobreposta neste dia. Conflito encontrado: <span className="font-bold">{teacherConflictSummary}</span>.
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
                                    {blockedScheduleOptionsCount.length > 0
                                        ? `Os horários já ocupados ou sobrepostos para esta turma e este dia deixam de aparecer no combobox. Total bloqueado: ${blockedScheduleOptionsCount.length}.`
                                        : 'Nenhum horário desta turma e deste dia está bloqueado até o momento.'}
                                </div>
                            ) : null}

                            {!hasSeriesClassOptions || !hasTeacherSubjectOptions ? (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-800">
                                    {!hasSeriesClassOptions ? 'Nenhuma turma disponível nesta escola. Cadastre séries e turmas antes de montar a grade.' : null}
                                    {!hasTeacherSubjectOptions ? ' Nenhum vínculo professor x matéria disponível. Cadastre professores, matérias e faça o vínculo para concluir a grade.' : null}
                                </div>
                            ) : null}

                            <div className="space-y-3 border-t border-slate-100 pt-5">
                                  <div className="flex items-center justify-between gap-3">
                                      <button type="button" onClick={closeModal} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50">Fechar</button>
                                      <button type="submit" disabled={!canSubmitForm} className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300">
                                          {isSaving ? 'Salvando...' : 'Salvar'}
                                      </button>
                                  </div>
                                <div className="flex justify-end">
                                    <div className="w-full max-w-sm">
                                        <ScreenNameCopy
                                            screenId={editingId ? GRADE_HORARIA_EDIT_MODAL_SCREEN_ID : GRADE_HORARIA_NEW_MODAL_SCREEN_ID}
                                            label="NOME DA TELA"
                                            className="mt-0 justify-end"
                                            disableMargin
                                        />
                                    </div>
                                </div>
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
                title={scheduleStatusToggleAction === 'activate' ? 'Ativar lançamento' : 'Excluir lançamento'}
                itemLabel="Lançamento"
                itemName={scheduleStatusToggleTarget ? `${getSeriesClassLabel(scheduleStatusToggleTarget.seriesClass)} - ${getDayLabel(scheduleStatusToggleTarget.dayOfWeek)} - ${scheduleStatusToggleTarget.startTime}` : ''}
                description={scheduleStatusToggleAction === 'activate'
                    ? 'Ao ativar este lançamento da grade ele volta a ser considerado ativo e entra nas rotas de aula.'
                    : 'Ao excluir este lançamento, ele será removido definitivamente desta grade horária.'}
                confirmLabel={scheduleStatusToggleAction === 'activate' ? 'Confirmar ativação' : 'Confirmar exclusão'}
                onCancel={() => closeScheduleStatusModal(true)}
                onConfirm={confirmScheduleStatusToggle}
                isProcessing={isProcessingScheduleToggle}
                statusActive={!scheduleStatusToggleTarget?.canceledAt}
                screenId={GRADE_HORARIA_STATUS_MODAL_SCREEN_ID}
            />

            {blockedDeleteMessage ? (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-2xl">
                        <div className="flex items-start gap-4 border-b border-rose-100 bg-rose-50 px-6 py-5">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm">
                                {blockedDeleteBranding?.logoUrl ? (
                                    <img
                                        src={blockedDeleteBranding.logoUrl}
                                        alt={blockedDeleteBranding.schoolName}
                                        className="h-full w-full object-contain p-1"
                                    />
                                ) : (
                                    <span className="text-xs font-black uppercase text-rose-500">LOGO</span>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-center text-2xl font-black uppercase tracking-[0.18em] text-rose-600">NÃO PERMITIDO EXCLUIR !!!</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeBlockedDeletePopup}
                                className="rounded-full bg-white p-2 text-rose-500 transition hover:text-rose-700"
                                aria-label="Fechar popup de bloqueio"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="space-y-5 px-6 py-6 text-sm font-semibold text-slate-700">
                            <p className="text-base leading-7 text-slate-700">{blockedDeleteMessage}</p>
                            <div className="flex items-end justify-between gap-4">
                                <div className="min-w-0">
                                    <ScreenNameCopy
                                        screenId={GRADE_HORARIA_BLOCKED_DELETE_SCREEN_ID}
                                        label="Tela"
                                        className="text-[9px] text-slate-400"
                                        disableMargin
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={closeBlockedDeletePopup}
                                    className="rounded-2xl bg-rose-600 px-5 py-3 text-xs font-bold uppercase tracking-[0.3em] text-white transition hover:bg-rose-500"
                                >
                                    OK
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {isModalOpen && modalErrorStatus ? (
                <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-2xl">
                        <div className="flex items-start gap-4 border-b border-rose-100 bg-rose-50 px-6 py-5">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm">
                                {modalErrorBranding?.logoUrl ? (
                                    <img
                                        src={modalErrorBranding.logoUrl}
                                        alt={modalErrorBranding.schoolName}
                                        className="h-full w-full object-contain p-1"
                                    />
                                ) : (
                                    <span className="text-xs font-black uppercase text-rose-500">LOGO</span>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-2xl font-black uppercase tracking-[0.35em] text-rose-600">E R R O !!!</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeModalErrorPopup}
                                className="rounded-full bg-white p-2 text-rose-500 transition hover:text-rose-700"
                                aria-label="Fechar popup de erro"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="space-y-5 px-6 py-6 text-sm font-semibold text-slate-700">
                            <p className="text-base leading-7 text-slate-700">{modalErrorStatus}</p>
                            <div className="flex items-end justify-between gap-4">
                                <div className="min-w-0">
                                    <ScreenNameCopy
                                        screenId="PRINCIPAL_GRADE_HORARIA_NEW_MODAL_ERRO"
                                        label="Tela"
                                        className="text-[9px] text-slate-400"
                                        disableMargin
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={closeModalErrorPopup}
                                    className="rounded-2xl bg-rose-600 px-5 py-3 text-xs font-bold uppercase tracking-[0.3em] text-white transition hover:bg-rose-500"
                                >
                                    OK
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

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

