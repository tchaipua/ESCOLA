'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import GridColumnConfigModal from '@/app/components/grid-column-config-modal';
import GridExportModal from '@/app/components/grid-export-modal';
import GridFooterControls from '@/app/components/grid-footer-controls';
import RecordStatusIndicator from '@/app/components/record-status-indicator';
import GridRecordPopover from '@/app/components/grid-record-popover';
import GridRowActionIconButton from '@/app/components/grid-row-action-icon-button';
import PrincipalProgramHeader from '@/app/components/principal-program-header';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import StatusConfirmationModal from '@/app/components/status-confirmation-modal';
import { type GridStatusFilterValue } from '@/app/components/grid-status-filter';
import { copyTextToClipboard } from '@/app/lib/clipboard';
import { getDashboardAuthContext, hasAllDashboardPermissions, hasDashboardPermission } from '@/app/lib/dashboard-crud-utils';
import { getAllGridColumnKeys, getDefaultVisibleGridColumnKeys, loadGridColumnConfig, type ConfigurableGridColumn, writeGridColumnConfig } from '@/app/lib/grid-column-config-utils';
import { buildDefaultExportColumns, buildExportColumnsFromGridColumns, exportGridRows, type GridColumnDefinition, type GridExportFormat } from '@/app/lib/grid-export-utils';
import { dedupeSeriesClassOptions } from '@/app/lib/series-class-option-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import { dispatchScreenAuditContext, formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const GRADE_HORARIA_SCREEN_ID = 'PRINCIPAL_GRADE';
const GRADE_HORARIA_STATUS_MODAL_SCREEN_ID = 'PRINCIPAL_GRADE_STATUS_MODAL';
const GRADE_HORARIA_NEW_MODAL_SCREEN_ID = 'PRINCIPAL_GRADE_POPUP_NOVO_HORARIO_TURMA';
const GRADE_HORARIA_EDIT_MODAL_SCREEN_ID = 'PRINCIPAL_GRADE_POPUP_EDITAR_HORARIO';
const GRADE_HORARIA_BLOCKED_DELETE_SCREEN_ID = 'PRINCIPAL_GRADE_BLOQUEIO_INATIVACAO';
const GRADE_HORARIA_BLOCKED_DELETE_MESSAGE = 'Este lançamento já foi usado no calendário anual e deve ser inativado com cuidado.';
const SCHOOL_YEAR_START = 2025;
const SCREEN_PROGRAM_NAME = 'PRINCIPAL_GRADE_TURMAS_HORARIOS_SEMANAL';
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
    branchCode?: number | null;
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

type ClassScheduleItemRecord = {
    id: string;
    branchCode?: number | null;
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
    scheduleOption: 'AULA',
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
    return `dashboard:principal-grade-turmas-horarios:grid-config:${tenantId || 'default'}`;
}

function getGridExportConfigStorageKey(tenantId: string | null) {
    return `dashboard:principal-grade-turmas-horarios:export-config:${tenantId || 'default'}`;
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
    return `principal-grade-turmas-horarios:last-selection:${tenantId || 'default'}`;
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

type GradeHorariaAuditParams = {
    tenantId: string | null;
    tenantName?: string | null;
    statusFilter: GridStatusFilterValue;
    columnFilters: ColumnFilters;
    schoolYearLabel: string;
    seriesClassLabel: string;
    dayLabel: string;
    subjectLabel: string;
    teacherLabel: string;
    displayedRowsCount: number;
};

function buildGradeHorariaAuditSql(params: GradeHorariaAuditParams) {
    const statusFilter = String(params.statusFilter || 'ACTIVE').toUpperCase();

    return `-- PARAMETROS ATUAIS DO GRID
-- :schoolId = ${toSqlLiteral(params.tenantId || '')}
-- :statusFilter = ${toSqlLiteral(statusFilter)}
-- :schoolYearId = ${toSqlLiteral(params.columnFilters.schoolYearId)}
-- :seriesClassId = ${toSqlLiteral(params.columnFilters.seriesClassId)}
-- :dayOfWeek = ${toSqlLiteral(params.columnFilters.dayOfWeek)}
-- :subjectId = ${toSqlLiteral(params.columnFilters.subjectId)}
-- :teacherId = ${toSqlLiteral(params.columnFilters.teacherId)}
-- :startTime = ${toSqlLiteral(params.columnFilters.startTime)}
-- :endTime = ${toSqlLiteral(params.columnFilters.endTime)}

SELECT CSI.*
FROM class_schedule_items CSI
LEFT JOIN school_years SY
  ON SY.id = CSI.schoolYearId
 AND SY.tenantId = CSI.tenantId
LEFT JOIN series_classes SC
  ON SC.id = CSI.seriesClassId
 AND SC.tenantId = CSI.tenantId
LEFT JOIN series SE
  ON SE.id = SC.seriesId
 AND SE.tenantId = CSI.tenantId
LEFT JOIN classes CL
  ON CL.id = SC.classId
 AND CL.tenantId = CSI.tenantId
LEFT JOIN teacher_subjects TS
  ON TS.id = CSI.teacherSubjectId
 AND TS.tenantId = CSI.tenantId
LEFT JOIN teachers T
  ON T.id = TS.teacherId
 AND T.tenantId = CSI.tenantId
LEFT JOIN subjects SU
  ON SU.id = TS.subjectId
 AND SU.tenantId = CSI.tenantId
WHERE CSI.tenantId = ${toSqlLiteral(params.tenantId || '')}
  AND (
    ${toSqlLiteral(statusFilter)} = 'ALL'
    OR (${toSqlLiteral(statusFilter)} = 'ACTIVE' AND CSI.canceledAt IS NULL)
    OR (${toSqlLiteral(statusFilter)} = 'INACTIVE' AND CSI.canceledAt IS NOT NULL)
  )
  AND (${toSqlLiteral(params.columnFilters.schoolYearId)} = '' OR CSI.schoolYearId = ${toSqlLiteral(params.columnFilters.schoolYearId)})
  AND (${toSqlLiteral(params.columnFilters.seriesClassId)} = '' OR CSI.seriesClassId = ${toSqlLiteral(params.columnFilters.seriesClassId)})
  AND (${toSqlLiteral(params.columnFilters.dayOfWeek)} = '' OR CSI.dayOfWeek = ${toSqlLiteral(params.columnFilters.dayOfWeek)})
  AND (${toSqlLiteral(params.columnFilters.subjectId)} = '' OR TS.subjectId = ${toSqlLiteral(params.columnFilters.subjectId)})
  AND (${toSqlLiteral(params.columnFilters.teacherId)} = '' OR TS.teacherId = ${toSqlLiteral(params.columnFilters.teacherId)})
  AND (${toSqlLiteral(params.columnFilters.startTime)} = '' OR CSI.startTime = ${toSqlLiteral(params.columnFilters.startTime)})
  AND (${toSqlLiteral(params.columnFilters.endTime)} = '' OR CSI.endTime = ${toSqlLiteral(params.columnFilters.endTime)})
ORDER BY CSI.dayOfWeek ASC, CSI.startTime ASC;`;
}

function buildGradeHorariaAuditText(params: GradeHorariaAuditParams) {
    const statusFilter = String(params.statusFilter || 'ACTIVE').toUpperCase();

    return `--- LOGICA DA TELA ---
Tela de grid/listagem administrativa para manutencao da grade horaria semanal.

TABELAS PRINCIPAIS:
- class_schedule_items (CSI) - lancamentos da grade semanal
- school_years (SY) - ano letivo
- series_classes (SC) - turma/serie
- teacher_subjects (TS) - vinculo professor/disciplina
- teachers (T) - professor da aula
- subjects (SU) - disciplina da aula

RELACIONAMENTOS:
- class_schedule_items.schoolYearId = school_years.id
- class_schedule_items.seriesClassId = series_classes.id
- class_schedule_items.teacherSubjectId = teacher_subjects.id
- teacher_subjects.teacherId = teachers.id
- teacher_subjects.subjectId = subjects.id

FILTROS APLICADOS AGORA:
- escola/tenant atual (:schoolId): ${formatTenantAuditValue(params.tenantId, params.tenantName)}
- status selecionado (:statusFilter): ${statusFilter}
- ano letivo (:schoolYearId): ${formatAuditValue(params.columnFilters.schoolYearId, 'TODOS')} (${params.schoolYearLabel})
- turma/serie (:seriesClassId): ${formatAuditValue(params.columnFilters.seriesClassId, 'TODAS')} (${params.seriesClassLabel})
- dia da semana (:dayOfWeek): ${formatAuditValue(params.columnFilters.dayOfWeek, 'TODOS')} (${params.dayLabel})
- disciplina (:subjectId): ${formatAuditValue(params.columnFilters.subjectId, 'TODAS')} (${params.subjectLabel})
- professor (:teacherId): ${formatAuditValue(params.columnFilters.teacherId, 'TODOS')} (${params.teacherLabel})
- horario inicial (:startTime): ${formatAuditValue(params.columnFilters.startTime, 'TODOS')}
- horario final (:endTime): ${formatAuditValue(params.columnFilters.endTime, 'TODOS')}
- registros exibidos apos os filtros: ${params.displayedRowsCount}
- ordenacao atual: dia da semana ASC, horario inicial ASC

OBSERVACAO SOBRE O FILTRO DA EMPRESA / ESCOLA:
- CSI.tenantId e a coluna usada para isolar os dados da empresa / escola
- :schoolId acima ja esta preenchido com o tenantId real da escola logada
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

export default function GradeHorariaPlanejadaPage() {
    const [items, setItems] = useState<ClassScheduleItemRecord[]>([]);
    const [schoolYears, setSchoolYears] = useState<SchoolYearSummary[]>([]);
    const [seriesClasses, setSeriesClasses] = useState<SeriesClassSummary[]>([]);
    const [teacherSubjects, setTeacherSubjects] = useState<TeacherSubjectRecord[]>([]);
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
    const [currentBranchCode, setCurrentBranchCode] = useState(1);
    const scheduleSelectRef = useRef<HTMLSelectElement | null>(null);

    const canView = hasAllDashboardPermissions(currentRole, currentPermissions, [
        'VIEW_CLASS_SCHEDULES',
        'VIEW_SCHOOL_YEARS',
        'VIEW_SERIES_CLASSES',
        'VIEW_SUBJECTS',
    ]);
    const canManage = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_CLASS_SCHEDULES');
    const hasSchoolYearOptions = schoolYears.length > 0;
    const hasSeriesClassOptions = seriesClasses.length > 0;
    const hasTeacherSubjectOptions = teacherSubjects.length > 0;
    const selectedSeriesClass = seriesClasses.find((item) => item.id === formData.seriesClassId) || null;
    const blockedDeleteBranding = readCachedTenantBranding(currentTenantId);
    const modalErrorBranding = blockedDeleteBranding;

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

    const isIntervalSchedule = formData.scheduleOption === 'INTERVALO';

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
    const gradeHorariaAuditContext = useMemo(() => {
        const selectedFilterSchoolYear = schoolYears.find((item) => item.id === columnFilters.schoolYearId);
        const selectedFilterSeriesClass = seriesClasses.find((item) => item.id === columnFilters.seriesClassId);
        const selectedFilterSubject = allSubjects.find((item) => item.id === columnFilters.subjectId);
        const selectedFilterTeacher = allTeachers.find((item) => item.id === columnFilters.teacherId);
        const auditParams: GradeHorariaAuditParams = {
            tenantId: currentTenantId,
            tenantName: currentTenant?.name,
            statusFilter,
            columnFilters,
            schoolYearLabel: selectedFilterSchoolYear ? String(selectedFilterSchoolYear.year) : 'TODOS',
            seriesClassLabel: selectedFilterSeriesClass ? getSeriesClassLabel(selectedFilterSeriesClass) : 'TODAS',
            dayLabel: columnFilters.dayOfWeek ? getDayLabel(columnFilters.dayOfWeek) : 'TODOS',
            subjectLabel: selectedFilterSubject?.name || 'TODAS',
            teacherLabel: selectedFilterTeacher?.name || 'TODOS',
            displayedRowsCount: filteredItems.length,
        };

        return {
            auditText: buildGradeHorariaAuditText(auditParams),
            sqlText: buildGradeHorariaAuditSql(auditParams),
        };
    }, [allSubjects, allTeachers, columnFilters, currentTenant?.name, currentTenantId, filteredItems.length, schoolYears, seriesClasses, statusFilter]);

    useEffect(() => {
        dispatchScreenAuditContext({
            screenId: GRADE_HORARIA_SCREEN_ID,
            auditText: gradeHorariaAuditContext.auditText,
            sqlText: gradeHorariaAuditContext.sqlText,
        });
    }, [gradeHorariaAuditContext]);

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
        && !isSaving;

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

    const ensureOperationalSchoolYears = async (token: string, role: string | null, permissions: string[], branchCode: number) => {
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
                    {
                        ...getSchoolYearPayload(
                            year,
                            shouldActivateCurrentYear && year === currentYear,
                        ),
                        branchCode,
                    },
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
                title="Acesso restrito aos horários por turma"
                message="Seu perfil não possui todas as permissões necessárias para consultar os horários planejados por turma desta escola."
            />
        );
    }

    const loadData = async () => {
        try {
            setIsLoading(true);
            setErrorStatus(null);
            setModalErrorStatus(null);

            const { token, role, permissions, tenantId, branchCode } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            setCurrentRole(role);
            setCurrentPermissions(permissions);
            setCurrentTenantId(tenantId);
            setCurrentBranchCode(branchCode);

            const yearList = await ensureOperationalSchoolYears(token, role, permissions, branchCode);

            const [itemsResponse, seriesClassesResponse, teacherSubjectsResponse, tenantResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/class-schedule-items`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/series-classes`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/teacher-subjects`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/tenants/current`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);

            const [itemsData, seriesClassesData, teacherSubjectsData, tenantData] = await Promise.all([
                itemsResponse.json().catch(() => null),
                seriesClassesResponse.json().catch(() => null),
                teacherSubjectsResponse.json().catch(() => null),
                tenantResponse.json().catch(() => null),
            ]);

            if (!itemsResponse.ok) throw new Error(getApiErrorMessage(itemsData, 'Não foi possível carregar os horários por turma.'));
            if (!seriesClassesResponse.ok) throw new Error(getApiErrorMessage(seriesClassesData, 'Não foi possível carregar as turmas.'));
            if (!teacherSubjectsResponse.ok) throw new Error(getApiErrorMessage(teacherSubjectsData, 'Não foi possível carregar professores e matérias.'));
            if (!tenantResponse.ok) throw new Error(getApiErrorMessage(tenantData, 'Não foi possível carregar a escola logada.'));

            const seriesClassList = dedupeSeriesClassOptions(
                Array.isArray(seriesClassesData) ? seriesClassesData : [],
                getSeriesClassLabel,
            );

            setItems(Array.isArray(itemsData) ? itemsData : []);
            setSchoolYears(yearList);
            setSeriesClasses(seriesClassList);
            setTeacherSubjects(Array.isArray(teacherSubjectsData) ? teacherSubjectsData : []);
            setCurrentTenant(tenantData as CurrentTenant);
            setColumnFilters((current) => ({
                ...current,
                schoolYearId: current.schoolYearId || resolveDefaultFilterSchoolYearId(yearList),
            }));

            if (!editingId && !isModalOpen) {
                setFormData(resolveDefaultForm(tenantId, yearList, seriesClassList, Array.isArray(teacherSubjectsData) ? teacherSubjectsData : []));
            }
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível carregar os horários por turma.');
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
            contextLabel="PRINCIPAL_GRADE_POPUP_DETALHE_HORARIO_TURMA"
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
                fileBaseName: 'turmas-horarios-aulas',
                branding: {
                    title: 'Turmas com horário das aulas',
                    subtitle: 'Exportação dos horários por turma com os filtros atualmente aplicados.',
                    schoolName: currentTenant?.name || 'ESCOLA LOGADA',
                    logoUrl: currentTenant?.logoUrl || null,
                },
            });
            setSuccessStatus(`Exportação ${exportFormat.toUpperCase()} preparada com ${filteredItems.length} registro(s).`);
            setIsExportModalOpen(false);
            setErrorStatus(null);
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível exportar os horários por turma.');
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
            const copied = await copyTextToClipboard(SCREEN_PROGRAM_NAME);
            setClipboardFeedback(copied ? 'success' : 'error');
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
            }));
            return;
        }

        setFormData((current) => ({
            ...current,
            scheduleOption,
        }));
    };

    const handleTimeFieldChange = (field: 'startTime' | 'endTime', value: string) => {
        setModalErrorStatus(null);
        setFormData((current) => ({
            ...current,
            [field]: value,
        }));
    };

    const handleEdit = (item: ClassScheduleItemRecord) => {
        setEditingId(item.id);
        setErrorStatus(null);
        setModalErrorStatus(null);
        setFormData({
            schoolYearId: item.schoolYear?.id || '',
            seriesClassId: item.seriesClass?.id || '',
            dayOfWeek: item.dayOfWeek,
            subjectId: item.teacherSubject?.subject?.id || '',
            teacherId: item.teacherSubject?.teacher?.id || '',
            scheduleOption: item.teacherSubject ? 'AULA' : 'INTERVALO',
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

            const response = await fetch(`${API_BASE_URL}/class-schedule-items/${scheduleStatusToggleTarget.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ active: willActivate }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                const apiMessage = getApiErrorMessage(data, willActivate ? 'Não foi possível ativar o lançamento da grade.' : 'Não foi possível inativar o lançamento da grade.');
                throw new Error(apiMessage);
            }

            setSuccessStatus(data?.message || (willActivate ? 'Lançamento da grade ativado com sucesso.' : 'Lançamento da grade inativado com sucesso.'));
            await loadData();
            closeScheduleStatusModal(true);
        } catch (error) {
            const fallbackMessage = willActivate ? 'Não foi possível ativar o lançamento da grade.' : 'Não foi possível inativar o lançamento da grade.';
            const errorMessage = error instanceof Error ? error.message : fallbackMessage;
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
            if (!formData.scheduleOption) throw new Error('Selecione se o lançamento é aula ou intervalo.');
            if (!formData.startTime) throw new Error('Informe o horário inicial.');
            if (!formData.endTime) throw new Error('Informe o horário final.');
            if (formData.startTime >= formData.endTime) throw new Error('O horário inicial deve ser menor que o horário final.');
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
                        branchCode: typeof selectedSeriesClass?.branchCode === 'number' ? selectedSeriesClass.branchCode : currentBranchCode,
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
        <div className="flex h-[calc(100vh-4.5rem)] min-h-0 w-full flex-col">
            <PrincipalProgramHeader
                eyebrow="Central acadêmica"
                title="Turmas com horário das aulas"
                description="Monte os horários planejados vinculando cada lançamento a uma turma."
                schoolName={currentTenant?.name}
                logoUrl={currentTenant?.logoUrl || null}
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

            {!isModalOpen && errorStatus ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorStatus}</div> : null}
            {successStatus ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{successStatus}</div> : null}

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="dashboard-band shrink-0 border-b px-6 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        {canManage ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setErrorStatus(null);
                                    setSuccessStatus(null);
                                    openCreateModal();
                                }}
                                title="Cadastrar novo lançamento"
                                aria-label="Cadastrar novo lançamento"
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-500 active:scale-95"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                        ) : null}
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
                <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
                    {isLoading ? (
                        <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">
                            Carregando horários por turma...
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
                        <div className="grid grid-cols-1 gap-4">
                            {DAY_OPTIONS.map((day) => {
                                const dayItems = scheduleItemsByDay[day.value];
                                return (
                                    <div key={day.value} className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 shadow-sm">
                                        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold uppercase tracking-wide text-slate-800">{day.label}</span>
                                            </div>
                                            <div className="flex items-center">
                                                {canManage ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => openCreateForDay(day.value)}
                                                        className="rounded-2xl border border-blue-500/70 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-700 shadow-sm shadow-blue-200/60 transition hover:bg-blue-100"
                                                    >
                                                        Novo lançamento
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 px-3 pb-3">
                                            {dayItems.length === 0 ? (
                                                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-3 py-4 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                                    Sem lançamentos
                                                </div>
                                            ) : (
                                                dayItems.map((item) => {
                                                    const isIntervalItem = !item.teacherSubject;

                                                    return (
                                                    <article key={`${day.value}-${item.id}`} className={`flex min-w-[120px] flex-1 flex-col space-y-2 rounded-2xl border p-2 shadow-sm ${isIntervalItem ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'} ${item.canceledAt ? 'opacity-80' : ''}`}>
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
                                                        <div className="mt-auto flex items-center justify-between gap-1">
                                                            {renderGridItemInfoButton(item)}
                                                            {canManage ? (
                                                                <div className="flex flex-nowrap items-center gap-1">
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
                    key={`principal-grade-footer-${filteredItems.length}`}
                    recordsCount={Number(filteredItems.length)}
                    onOpenColumns={() => setIsGridConfigOpen(true)}
                    onOpenExport={openExportModal}
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
                            <h2 className="text-xl font-bold text-[#153a6a]">{editingId ? 'Editar horário da turma' : 'Novo horário da turma'}</h2>
                            <button onClick={closeModal} className="text-slate-400 hover:text-red-500">
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-5 p-6">
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                                <label className="space-y-1">
                                    <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Ano letivo</span>
                                    <select value={formData.schoolYearId} onChange={(event) => { setModalErrorStatus(null); setFormData((current) => ({ ...current, schoolYearId: event.target.value })); }} className={inputClass}>
                                        <option value="">Selecione o ano letivo</option>
                                        {schoolYears.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.year}{item.isActive ? ' (ATIVO)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="space-y-1">
                                    <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Turma</span>
                                    <select value={formData.seriesClassId} onChange={(event) => handleSeriesClassChange(event.target.value)} className={inputClass}>
                                        <option value="">Selecione a turma</option>
                                        {seriesClasses.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {getSeriesClassLabel(item)}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="space-y-1">
                                    <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Dia da semana</span>
                                    <select value={formData.dayOfWeek} onChange={(event) => { setModalErrorStatus(null); setFormData((current) => ({ ...current, dayOfWeek: event.target.value as DayValue })); }} className={inputClass}>
                                        {DAY_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            <div className={`grid grid-cols-1 gap-4 ${isIntervalSchedule ? 'xl:grid-cols-[0.9fr_0.6fr_0.6fr]' : 'xl:grid-cols-[1fr_1fr_0.8fr_0.6fr_0.6fr]'}`}>
                                {!isIntervalSchedule ? (
                                    <label className="space-y-1">
                                        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Matéria</span>
                                        <select value={formData.subjectId} onChange={(event) => handleSubjectChange(event.target.value)} className={inputClass}>
                                            <option value="">Selecione a matéria</option>
                                            {allSubjects.map((item) => (
                                                <option key={item.id} value={item.id}>{item.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                ) : null}

                                {!isIntervalSchedule ? (
                                    <label className="space-y-1">
                                        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Professor</span>
                                        <select value={formData.teacherId} onChange={(event) => handleTeacherChange(event.target.value)} className={inputClass}>
                                            <option value="">Selecione o professor</option>
                                            {filteredTeachers.map((item) => (
                                                <option key={item.id} value={item.id}>{item.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                ) : null}

                                <label className="space-y-1">
                                    <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Tipo</span>
                                    <select
                                        ref={scheduleSelectRef}
                                        value={formData.scheduleOption}
                                        onChange={(event) => handleScheduleOptionChange(event.target.value)}
                                        className={inputClass}
                                        disabled={!formData.seriesClassId}
                                    >
                                        <option value="AULA">AULA</option>
                                        <option value="INTERVALO">INTERVALO</option>
                                    </select>
                                </label>

                                <label className="space-y-1">
                                    <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Horário inicial</span>
                                    <input
                                        type="time"
                                        value={formData.startTime}
                                        onChange={(event) => handleTimeFieldChange('startTime', event.currentTarget.value)}
                                        onInput={(event) => handleTimeFieldChange('startTime', event.currentTarget.value)}
                                        className={inputClass}
                                    />
                                </label>

                                <label className="space-y-1">
                                    <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Horário final</span>
                                    <input
                                        type="time"
                                        value={formData.endTime}
                                        onChange={(event) => handleTimeFieldChange('endTime', event.currentTarget.value)}
                                        onInput={(event) => handleTimeFieldChange('endTime', event.currentTarget.value)}
                                        className={inputClass}
                                    />
                                </label>
                            </div>

                            <div className="rounded-2xl border border-red-300 bg-red-600 px-4 py-4 text-sm font-bold text-white shadow-sm">
                                Para lançar intervalo, selecione o tipo INTERVALO. O intervalo fica vinculado à turma, ao dia da semana e ao horário informado, mas não exige matéria nem professor.
                            </div>

                            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm font-medium text-slate-600">
                                Os últimos valores usados de <span className="font-bold text-slate-800">ano letivo</span>, <span className="font-bold text-slate-800">turma</span>, <span className="font-bold text-slate-800">dia da semana</span>, <span className="font-bold text-slate-800">matéria</span> e <span className="font-bold text-slate-800">professor</span> ficam memorizados para agilizar os próximos lançamentos.
                            </div>

                            {selectedSeriesClass ? (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600">
                                    Turma selecionada: <span className="font-bold text-slate-800">{getSeriesClassLabel(selectedSeriesClass)}</span>. Turno cadastrado: <span className="font-bold text-slate-800">{getShiftSummary(selectedSeriesClass.class?.shift)}</span>.
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
                                    {sameDaySeriesTimeItems.length > 0
                                        ? `Esta turma já tem ${sameDaySeriesTimeItems.length} lançamento(s) ativo(s) neste dia. O sistema bloqueia horários sobrepostos.`
                                        : 'Esta turma ainda não tem lançamento ativo neste dia.'}
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
                description="Reordene, oculte ou inclua colunas dos horários por turma nesta tela."
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
                    : 'Ao inativar este lançamento, ele deixa de entrar nos horários ativos da turma, mas permanece no histórico.'}
                confirmLabel={scheduleStatusToggleAction === 'activate' ? 'Confirmar ativação' : 'Confirmar inativação'}
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
                                <p className="text-center text-2xl font-black uppercase tracking-[0.18em] text-rose-600">INATIVAÇÃO RESTRITA</p>
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
                                        screenId="PRINCIPAL_GRADE_POPUP_EDITAR_HORARIO_ERRO"
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
                title="Exportar turmas com horário das aulas"
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

