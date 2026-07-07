'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import GridColumnConfigModal from '@/app/components/grid-column-config-modal';
import GridColumnFilterHeader from '@/app/components/grid-column-filter-header';
import GridExportModal from '@/app/components/grid-export-modal';
import GridStandardFooter from '@/app/components/grid-standard-footer';
import { type GridStatusFilterValue } from '@/app/components/grid-status-filter';
import PrincipalProgramHeader from '@/app/components/principal-program-header';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import {
    getDashboardAuthContext,
    hasAnyDashboardPermission,
    hasDashboardPermission,
} from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import { dispatchScreenAuditContext, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';
import { dedupeSeriesClassOptions } from '@/app/lib/series-class-option-utils';
import {
    buildDefaultExportColumns,
    exportGridRows,
    sortGridRows,
    type GridColumnDefinition,
    type GridExportFormat,
    type GridSortState,
} from '@/app/lib/grid-export-utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const SCREEN_ID = 'PRINCIPAL_CONFIGURA_ANO_LETIVO';
const HOLIDAY_MODAL_SCREEN_ID = 'PRINCIPAL_CONFIGURA_ANO_LETIVO_FERIADO_MODAL';
const STATUS_MODAL_SCREEN_ID = 'PRINCIPAL_CONFIGURA_ANO_LETIVO_MENSAGEM_MODAL';

type CalendarScope = 'TODAS_TURMAS' | 'GRUPO_TURMAS' | 'TURMA_ESPECIFICA';
type HolidayType = 'NACIONAL' | 'ESTADUAL' | 'MUNICIPAL' | 'FACULTATIVO' | 'ESCOLA';
type PeriodType = 'FERIAS' | 'RECESSO' | 'PLANEJAMENTO' | 'PONTE_FERIADO' | 'OUTRO';
type ConfigTab = 'ANOS' | 'CALENDARIO' | 'FERIADOS';
type ClassDayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

type CalendarForm = {
    year: string;
    name: string;
    startDate: string;
    endDate: string;
    scope: CalendarScope;
    classDays: Record<ClassDayKey, boolean>;
};

type HolidayDraft = {
    date: string;
    name: string;
    type: HolidayType;
};

type HolidayRecord = HolidayDraft & {
    id: string;
    branchCode?: number;
    year?: number;
    source?: string | null;
};

type ImportedHolidayResponse = {
    holidays?: Array<{
        date?: string;
        name?: string;
        type?: HolidayType;
        source?: string | null;
    }>;
};

type ApiErrorResponse = {
    message?: string | string[];
};

type SchoolYearRecord = {
    id: string;
    branchCode?: number;
    year: number;
    startDate: string;
    endDate: string;
    isActive?: boolean;
    monday?: boolean;
    tuesday?: boolean;
    wednesday?: boolean;
    thursday?: boolean;
    friday?: boolean;
    saturday?: boolean;
    sunday?: boolean;
    periods?: PeriodRecord[];
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
    canceledAt?: string | null;
    series?: SeriesSummary | null;
    class?: ClassSummary | null;
};

type SchoolYearGridRow = {
    id: string;
    schoolYear: SchoolYearRecord;
    seriesClass?: SeriesClassSummary | null;
    year: string;
    startDate: string;
    endDate: string;
    branchCode: string;
    seriesName: string;
    className: string;
    classDaysLabel: string;
    totalClassDays: number;
    recordStatus: 'ATIVO' | 'INATIVO';
};

type SchoolYearGridColumnKey = 'year' | 'startDate' | 'endDate' | 'branchCode' | 'seriesName' | 'className' | 'totalClassDays' | 'recordStatus';

type PeriodDraft = {
    startDate: string;
    endDate: string;
    type: PeriodType;
    appliesTo: string;
};

type PeriodRecord = PeriodDraft & {
    id: string;
};

const currentYear = new Date().getFullYear();

const DEFAULT_FORM: CalendarForm = {
    year: String(currentYear),
    name: `ANO LETIVO ${currentYear}`,
    startDate: `${currentYear}-02-02`,
    endDate: `${currentYear}-12-18`,
    scope: 'TODAS_TURMAS',
    classDays: {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
    },
};

const DEFAULT_HOLIDAY_DRAFT: HolidayDraft = {
    date: '',
    name: '',
    type: 'NACIONAL',
};

const DEFAULT_PERIOD_DRAFT: PeriodDraft = {
    startDate: '',
    endDate: '',
    type: 'FERIAS',
    appliesTo: 'TODAS AS TURMAS',
};

const scopeLabels: Record<CalendarScope, string> = {
    TODAS_TURMAS: 'TODAS AS TURMAS',
    GRUPO_TURMAS: 'GRUPO DE TURMAS',
    TURMA_ESPECIFICA: 'TURMA ESPECIFICA',
};

const SCHOOL_YEAR_GRID_COLUMNS: GridColumnDefinition<SchoolYearGridRow, SchoolYearGridColumnKey>[] = [
    { key: 'year', label: 'Ano', getValue: (row) => row.year, getSortValue: (row) => Number(row.year) || 0 },
    { key: 'startDate', label: 'Início', getValue: (row) => formatDate(row.startDate), getSortValue: (row) => row.startDate },
    { key: 'endDate', label: 'Fim', getValue: (row) => formatDate(row.endDate), getSortValue: (row) => row.endDate },
    { key: 'branchCode', label: 'Filial', getValue: (row) => row.branchCode, getSortValue: (row) => Number(row.branchCode) || 0 },
    { key: 'seriesName', label: 'Série', getValue: (row) => row.seriesName, getSortValue: (row) => row.seriesName },
    { key: 'className', label: 'Turma', getValue: (row) => row.className, getSortValue: (row) => row.className },
    { key: 'totalClassDays', label: 'Total dias letivos', getValue: (row) => String(row.totalClassDays), getSortValue: (row) => row.totalClassDays },
    { key: 'recordStatus', label: 'Status', getValue: (row) => row.recordStatus, getSortValue: (row) => row.recordStatus },
];

const SCHOOL_YEAR_GRID_COLUMN_KEYS = SCHOOL_YEAR_GRID_COLUMNS.map((column) => column.key);
const EMPTY_SCHOOL_YEAR_GRID_FILTERS = SCHOOL_YEAR_GRID_COLUMN_KEYS.reduce<Record<SchoolYearGridColumnKey, string>>((accumulator, key) => {
    accumulator[key] = '';
    return accumulator;
}, {} as Record<SchoolYearGridColumnKey, string>);

function getSeriesClassLabel(seriesClass?: SeriesClassSummary | null) {
    const className = seriesClass?.class?.name || 'SEM TURMA';
    const seriesName = seriesClass?.series?.name || 'SEM SÉRIE';
    return `${className} - ${seriesName}`;
}

function normalizeSeriesClassOptions(input: unknown): SeriesClassSummary[] {
    const items = Array.isArray(input) ? (input as SeriesClassSummary[]) : [];
    return dedupeSeriesClassOptions(items, getSeriesClassLabel);
}

function getSchoolYearClassDaysTotal(schoolYear: SchoolYearRecord) {
    return getClassDayTotal({
        startDate: toDateInputValue(schoolYear.startDate),
        endDate: toDateInputValue(schoolYear.endDate),
        classDays: getClassDaysFromSchoolYear(schoolYear),
        holidays: [],
        periods: [],
    });
}

function normalizeGridFilterValue(value: unknown) {
    return normalizeText(String(value || ''));
}

function matchesGridFilter(value: unknown, filter: string) {
    const normalizedFilter = normalizeGridFilterValue(filter);
    if (!normalizedFilter) return true;
    return normalizeGridFilterValue(value).includes(normalizedFilter);
}

function getClassDayTagStyle(label: string) {
    const normalizedLabel = normalizeText(label);
    if (normalizedLabel.includes('SEGUNDA')) return 'border-blue-200 bg-blue-50 text-blue-800';
    if (normalizedLabel.includes('TERCA') || normalizedLabel.includes('TERÇA')) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (normalizedLabel.includes('QUARTA')) return 'border-amber-200 bg-amber-50 text-amber-800';
    if (normalizedLabel.includes('QUINTA')) return 'border-violet-200 bg-violet-50 text-violet-800';
    if (normalizedLabel.includes('SEXTA')) return 'border-rose-200 bg-rose-50 text-rose-800';
    if (normalizedLabel.includes('SABADO') || normalizedLabel.includes('SÁBADO')) return 'border-cyan-200 bg-cyan-50 text-cyan-800';
    if (normalizedLabel.includes('DOMINGO')) return 'border-slate-300 bg-slate-100 text-slate-700';
    return 'border-slate-200 bg-slate-50 text-slate-500';
}

const holidayTypeLabels: Record<HolidayType, string> = {
    NACIONAL: 'NACIONAL',
    ESTADUAL: 'ESTADUAL',
    MUNICIPAL: 'MUNICIPAL',
    FACULTATIVO: 'FACULTATIVO',
    ESCOLA: 'ESCOLA',
};

const holidayTypeStyles: Record<HolidayType, { row: string; badge: string; dot: string }> = {
    NACIONAL: {
        row: 'border-blue-200 bg-blue-50/80',
        badge: 'border-blue-200 bg-blue-100 text-blue-800',
        dot: 'bg-blue-600',
    },
    ESTADUAL: {
        row: 'border-amber-200 bg-amber-50/85',
        badge: 'border-amber-200 bg-amber-100 text-amber-800',
        dot: 'bg-amber-500',
    },
    MUNICIPAL: {
        row: 'border-emerald-200 bg-emerald-50/85',
        badge: 'border-emerald-200 bg-emerald-100 text-emerald-800',
        dot: 'bg-emerald-600',
    },
    FACULTATIVO: {
        row: 'border-violet-200 bg-violet-50/80',
        badge: 'border-violet-200 bg-violet-100 text-violet-800',
        dot: 'bg-violet-600',
    },
    ESCOLA: {
        row: 'border-slate-200 bg-slate-50/90',
        badge: 'border-slate-200 bg-slate-100 text-slate-700',
        dot: 'bg-slate-500',
    },
};

const periodTypeLabels: Record<PeriodType, string> = {
    FERIAS: 'FERIAS',
    RECESSO: 'RECESSO',
    PLANEJAMENTO: 'PLANEJAMENTO',
    PONTE_FERIADO: 'PONTE FERIADO',
    OUTRO: 'OUTRO',
};

const configTabLabels: Record<ConfigTab, string> = {
    ANOS: 'ANOS LETIVOS',
    CALENDARIO: 'CALENDÁRIO',
    FERIADOS: 'FERIADOS',
};

const classDayLabels: Record<ClassDayKey, string> = {
    monday: 'SEGUNDA',
    tuesday: 'TERÇA',
    wednesday: 'QUARTA',
    thursday: 'QUINTA',
    friday: 'SEXTA',
    saturday: 'SÁBADO',
    sunday: 'DOMINGO',
};

const classDayCardStyles: Record<ClassDayKey, string> = {
    monday: 'border-blue-200 bg-blue-50 text-blue-800',
    tuesday: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    wednesday: 'border-amber-200 bg-amber-50 text-amber-800',
    thursday: 'border-violet-200 bg-violet-50 text-violet-800',
    friday: 'border-rose-200 bg-rose-50 text-rose-800',
    saturday: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    sunday: 'border-slate-200 bg-slate-100 text-slate-700',
};

function normalizeText(value: string) {
    return value.toUpperCase();
}

function getApiErrorMessage(data: ApiErrorResponse | null, fallback = 'NÃO FOI POSSÍVEL CONCLUIR A OPERAÇÃO.') {
    if (Array.isArray(data?.message)) return data.message.join(' ');
    return data?.message || fallback;
}

function formatDate(value: string) {
    if (!value) return '---';
    const [year, month, day] = value.split('-');
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
}

function toDateInputValue(value?: string | null) {
    return value ? value.slice(0, 10) : '';
}

function mapHolidayFromApi(holiday: Partial<HolidayRecord>, index: number, prefix = 'holiday'): HolidayRecord {
    const type = holiday.type && holidayTypeLabels[holiday.type] ? holiday.type : 'NACIONAL';
    return {
        id: holiday.id || `${prefix}-${Date.now()}-${index}`,
        branchCode: holiday.branchCode,
        year: holiday.year,
        date: String(holiday.date || ''),
        name: normalizeText(String(holiday.name || '')),
        type,
        source: holiday.source || null,
    };
}

function mergeHolidayLists(current: HolidayRecord[], incomingHolidays: HolidayRecord[]) {
    const merged = new Map<string, HolidayRecord>();

    [...current, ...incomingHolidays].forEach((holiday) => {
        if (!holiday.date || !holiday.name) return;
        const key = `${holiday.date}|${holiday.name}|${holiday.type}`;
        merged.set(key, holiday);
    });

    return Array.from(merged.values()).sort((first, second) =>
        first.date.localeCompare(second.date) || first.name.localeCompare(second.name),
    );
}

function mapHolidayForSave(holiday: HolidayRecord) {
    return {
        date: holiday.date,
        name: normalizeText(holiday.name.trim()),
        type: holiday.type,
        source: normalizeText(String(holiday.source || 'MANUAL')),
    };
}

function getClassDaysFromSchoolYear(schoolYear?: Partial<SchoolYearRecord> | null): Record<ClassDayKey, boolean> {
    return {
        monday: schoolYear?.monday ?? true,
        tuesday: schoolYear?.tuesday ?? true,
        wednesday: schoolYear?.wednesday ?? true,
        thursday: schoolYear?.thursday ?? true,
        friday: schoolYear?.friday ?? true,
        saturday: schoolYear?.saturday ?? false,
        sunday: schoolYear?.sunday ?? false,
    };
}

function getSelectedClassDayLabels(classDays: Record<ClassDayKey, boolean>) {
    return (Object.entries(classDayLabels) as Array<[ClassDayKey, string]>)
        .filter(([key]) => classDays[key])
        .map(([, label]) => label);
}

function parseDateInput(value?: string | null) {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function formatDateInputValue(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getClassDayKeyFromDate(date: Date): ClassDayKey {
    const day = date.getDay();
    if (day === 0) return 'sunday';
    if (day === 1) return 'monday';
    if (day === 2) return 'tuesday';
    if (day === 3) return 'wednesday';
    if (day === 4) return 'thursday';
    if (day === 5) return 'friday';
    return 'saturday';
}

function getClassDayTotal(params: {
    startDate: string;
    endDate: string;
    classDays: Record<ClassDayKey, boolean>;
    holidays: HolidayRecord[];
    periods: PeriodRecord[];
}) {
    const startDate = parseDateInput(params.startDate);
    const endDate = parseDateInput(params.endDate);
    if (!startDate || !endDate || startDate > endDate) return 0;

    const noClassDates = new Set<string>();
    params.holidays.forEach((holiday) => {
        if (holiday.date) noClassDates.add(holiday.date);
    });

    params.periods.forEach((period) => {
        const periodStart = parseDateInput(period.startDate);
        const periodEnd = parseDateInput(period.endDate);
        if (!periodStart || !periodEnd || periodStart > periodEnd) return;

        const cursor = new Date(periodStart);
        while (cursor <= periodEnd) {
            noClassDates.add(formatDateInputValue(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }
    });

    let total = 0;
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
        const dateValue = formatDateInputValue(cursor);
        const dayKey = getClassDayKeyFromDate(cursor);
        if (params.classDays[dayKey] && !noClassDates.has(dateValue)) {
            total += 1;
        }
        cursor.setDate(cursor.getDate() + 1);
    }

    return total;
}

function buildAuditText(params: {
    tenantId: string | null;
    tenantName?: string | null;
    branchCode: number;
    form: CalendarForm;
    classDayTotal: number;
    periodsCount: number;
    holidaysCount: number;
    activeTab: ConfigTab;
}) {
    return `--- LOGICA DA TELA ---
Tela inicial para configurar ano letivo, periodos sem aula e feriados da escola.

TABELAS PRINCIPAIS:
- school_years (SY) - ano letivo cadastrado por escola/filial.
- school_holidays (SH) - feriados cadastrados por escola/filial e ano letivo.
- lesson_calendars (LC) - calendario anual gerado a partir da grade semanal.
- series_classes (SC) - turmas que futuramente poderao usar um calendario base ou especifico.

RELACIONAMENTOS:
- school_years.tenantId = tenant da escola logada.
- school_holidays.tenantId = tenant da escola logada e school_holidays.year = ano selecionado.
- lesson_calendars.schoolYearId = school_years.id.
- lesson_calendars.seriesClassId = series_classes.id.

FILTROS APLICADOS AGORA:
- escola/tenant: ${formatTenantAuditValue(params.tenantId, params.tenantName)}
- filial da sessao: ${params.branchCode}
- ano informado na tela: ${params.form.year || 'VAZIO'}
- escopo escolhido: ${scopeLabels[params.form.scope]}
- aba ativa: ${configTabLabels[params.activeTab]}

METRICAS / CAMPOS EXIBIDOS:
- nome do calendario: ${params.form.name || 'VAZIO'}
- inicio do ano letivo: ${formatDate(params.form.startDate)}
- fim do ano letivo: ${formatDate(params.form.endDate)}
- dias com aula: ${getSelectedClassDayLabels(params.form.classDays).join(', ') || 'NENHUM'}
- total previsto de dias letivos: ${params.classDayTotal}
- periodos sem aula no rascunho: ${params.periodsCount}
- feriados salvos/carregados: ${params.holidaysCount}

OBSERVACAO:
- O botao Salvar grava ano letivo, inicio, fim e dias com aula na tabela school_years.
- A aba Feriados grava em school_holidays com tenant, branchCode, soft delete e auditoria.
- Periodos sem aula ainda ficam como rascunho visual ate existir persistencia propria para esses detalhes.`;
}

function buildAuditSql(params: {
    tenantId: string | null;
    branchCode: number;
    year: string;
}) {
    const yearNumber = Number(params.year) || currentYear;

    return `SELECT
  SY.id,
  SY.tenantId,
  SY.branchCode,
  SY.year,
  SY.startDate,
  SY.endDate,
  SY.isActive,
  SY.monday,
  SY.tuesday,
  SY.wednesday,
  SY.thursday,
  SY.friday,
  SY.saturday,
  SY.sunday,
  COUNT(DISTINCT LC.id) AS lessonCalendarCount,
  COUNT(DISTINCT SH.id) AS holidayCount,
  COUNT(DISTINCT SC.id) AS classCount
FROM school_years SY
LEFT JOIN lesson_calendars LC
  ON LC.schoolYearId = SY.id
 AND LC.tenantId = SY.tenantId
 AND LC.canceledAt IS NULL
LEFT JOIN school_holidays SH
  ON SH.tenantId = SY.tenantId
 AND SH.year = SY.year
 AND SH.branchCode IN (0, ${params.branchCode})
 AND SH.canceledAt IS NULL
LEFT JOIN series_classes SC
  ON SC.tenantId = SY.tenantId
 AND SC.canceledAt IS NULL
WHERE SY.tenantId = ${toSqlLiteral(params.tenantId || 'ESCOLA_LOGADA')}
  AND SY.branchCode IN (0, ${params.branchCode})
  AND SY.year = ${yearNumber}
  AND SY.canceledAt IS NULL
GROUP BY
  SY.id,
  SY.tenantId,
  SY.branchCode,
  SY.year,
  SY.startDate,
  SY.endDate,
  SY.isActive,
  SY.monday,
  SY.tuesday,
  SY.wednesday,
  SY.thursday,
  SY.friday,
  SY.saturday,
  SY.sunday
ORDER BY SY.year DESC;`;
}

export default function ConfiguraAnoLetivoPage() {
    const [form, setForm] = useState<CalendarForm>(DEFAULT_FORM);
    const [holidayDraft, setHolidayDraft] = useState<HolidayDraft>(DEFAULT_HOLIDAY_DRAFT);
    const [activeTab, setActiveTab] = useState<ConfigTab>('ANOS');
    const [isImportingHolidays, setIsImportingHolidays] = useState(false);
    const [isLoadingSchoolYears, setIsLoadingSchoolYears] = useState(false);
    const [isSavingSchoolYear, setIsSavingSchoolYear] = useState(false);
    const [isSavingHolidays, setIsSavingHolidays] = useState(false);
    const [periodDraft, setPeriodDraft] = useState<PeriodDraft>(DEFAULT_PERIOD_DRAFT);
    const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
    const [periods, setPeriods] = useState<PeriodRecord[]>([]);
    const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
    const [selectedSchoolYearGridId, setSelectedSchoolYearGridId] = useState<string | null>(null);
    const [schoolYearGridSearch, setSchoolYearGridSearch] = useState('');
    const [schoolYearGridFilters, setSchoolYearGridFilters] = useState<Record<SchoolYearGridColumnKey, string>>(EMPTY_SCHOOL_YEAR_GRID_FILTERS);
    const [activeSchoolYearFilterColumn, setActiveSchoolYearFilterColumn] = useState<SchoolYearGridColumnKey | null>(null);
    const [schoolYearGridSort, setSchoolYearGridSort] = useState<GridSortState<SchoolYearGridColumnKey>>({ column: 'year', direction: 'desc' });
    const [schoolYearGridPage, setSchoolYearGridPage] = useState(1);
    const [schoolYearGridPageSize, setSchoolYearGridPageSize] = useState(10);
    const [schoolYearGridStatusFilter, setSchoolYearGridStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
    const [isSchoolYearColumnModalOpen, setIsSchoolYearColumnModalOpen] = useState(false);
    const [schoolYearColumnOrder, setSchoolYearColumnOrder] = useState<SchoolYearGridColumnKey[]>(SCHOOL_YEAR_GRID_COLUMN_KEYS);
    const [hiddenSchoolYearColumns, setHiddenSchoolYearColumns] = useState<SchoolYearGridColumnKey[]>([]);
    const [isSchoolYearExportModalOpen, setIsSchoolYearExportModalOpen] = useState(false);
    const [schoolYearExportFormat, setSchoolYearExportFormat] = useState<GridExportFormat>('excel');
    const [schoolYearExportColumns, setSchoolYearExportColumns] = useState<Record<SchoolYearGridColumnKey, boolean>>(buildDefaultExportColumns(SCHOOL_YEAR_GRID_COLUMNS));
    const [seriesClasses, setSeriesClasses] = useState<SeriesClassSummary[]>([]);
    const [selectedApplicationClassIds, setSelectedApplicationClassIds] = useState<string[]>([]);
    const [applicationClassFilter, setApplicationClassFilter] = useState('');
    const [isApplicationDropdownOpen, setIsApplicationDropdownOpen] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [statusTone, setStatusTone] = useState<'info' | 'error'>('info');
    const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
    const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);
    const [selectedHolidayId, setSelectedHolidayId] = useState<string | null>(null);
    const [holidayModalMessage, setHolidayModalMessage] = useState<string | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
    const [currentBranchCode, setCurrentBranchCode] = useState(1);
    const [isReady, setIsReady] = useState(false);

    const currentTenantBranding = useMemo(() => readCachedTenantBranding(currentTenantId), [currentTenantId]);
    const canView = hasAnyDashboardPermission(currentRole, currentPermissions, ['VIEW_SCHOOL_YEARS', 'VIEW_LESSON_CALENDARS']);
    const canManage = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_SCHOOL_YEARS');
    const normalizedApplicationClassFilter = normalizeText(applicationClassFilter);
    const filteredSeriesClasses = useMemo(() => {
        if (!normalizedApplicationClassFilter) return seriesClasses;
        return seriesClasses.filter((item) => {
            const searchableText = [
                getSeriesClassLabel(item),
                item.class?.name || '',
                item.series?.name || '',
            ].join(' ');
            return normalizeText(searchableText).includes(normalizedApplicationClassFilter);
        });
    }, [normalizedApplicationClassFilter, seriesClasses]);
    const applicationScopeLabel = useMemo(() => {
        if (selectedApplicationClassIds.length === 0) return scopeLabels[form.scope];
        if (selectedApplicationClassIds.length === 1) {
            const selectedClass = seriesClasses.find((item) => item.id === selectedApplicationClassIds[0]);
            return selectedClass ? getSeriesClassLabel(selectedClass) : '1 TURMA SELECIONADA';
        }
        return `${selectedApplicationClassIds.length} TURMAS SELECIONADAS`;
    }, [form.scope, selectedApplicationClassIds, seriesClasses]);
    const schoolYearGridRows = useMemo<SchoolYearGridRow[]>(() => {
        const classOptions = seriesClasses.length > 0 ? seriesClasses : [null];
        return schoolYears.flatMap((schoolYear) => {
            const classDays = getClassDaysFromSchoolYear(schoolYear);
            const classDaysLabel = getSelectedClassDayLabels(classDays).join(', ') || 'NENHUM';
            const totalClassDays = getSchoolYearClassDaysTotal(schoolYear);

            return classOptions.map((seriesClass) => ({
                id: `${schoolYear.id}-${seriesClass?.id || 'TODAS'}`,
                schoolYear,
                seriesClass,
                year: String(schoolYear.year),
                startDate: toDateInputValue(schoolYear.startDate),
                endDate: toDateInputValue(schoolYear.endDate),
                branchCode: String(schoolYear.branchCode ?? 0),
                seriesName: seriesClass?.series?.name || 'TODAS AS SÉRIES',
                className: seriesClass?.class?.name || 'TODAS AS TURMAS',
                classDaysLabel,
                totalClassDays,
                recordStatus: schoolYear.isActive === false ? 'INATIVO' : 'ATIVO',
            }));
        });
    }, [schoolYears, seriesClasses]);
    const filteredSchoolYearGridRows = useMemo(() => {
        const normalizedSearch = normalizeText(schoolYearGridSearch);
        const filteredByStatus = schoolYearGridRows.filter((row) => {
            if (schoolYearGridStatusFilter === 'ALL') return true;
            if (schoolYearGridStatusFilter === 'ACTIVE') return row.recordStatus === 'ATIVO';
            return row.recordStatus === 'INATIVO';
        });
        const filteredBySearch = normalizedSearch
            ? filteredByStatus.filter((row) => normalizeText([
                row.year,
                row.startDate,
                row.endDate,
                row.branchCode,
                row.seriesName,
                row.className,
                row.classDaysLabel,
                row.totalClassDays,
                row.recordStatus,
            ].join(' ')).includes(normalizedSearch))
            : filteredByStatus;
        const filteredByColumns = filteredBySearch.filter((row) => (
            SCHOOL_YEAR_GRID_COLUMN_KEYS.every((key) => matchesGridFilter(row[key], schoolYearGridFilters[key]))
        ));
        return sortGridRows(filteredByColumns, SCHOOL_YEAR_GRID_COLUMNS, schoolYearGridSort);
    }, [schoolYearGridFilters, schoolYearGridRows, schoolYearGridSearch, schoolYearGridSort, schoolYearGridStatusFilter]);
    const schoolYearGridTotalPages = Math.max(1, Math.ceil(filteredSchoolYearGridRows.length / schoolYearGridPageSize));
    const currentSchoolYearGridPage = Math.min(schoolYearGridPage, schoolYearGridTotalPages);
    const paginatedSchoolYearGridRows = useMemo(() => {
        const startIndex = (currentSchoolYearGridPage - 1) * schoolYearGridPageSize;
        return filteredSchoolYearGridRows.slice(startIndex, startIndex + schoolYearGridPageSize);
    }, [currentSchoolYearGridPage, filteredSchoolYearGridRows, schoolYearGridPageSize]);
    const visibleSchoolYearColumns = useMemo(() => (
        schoolYearColumnOrder
            .filter((key) => !hiddenSchoolYearColumns.includes(key))
            .map((key) => SCHOOL_YEAR_GRID_COLUMNS.find((column) => column.key === key))
            .filter((column): column is GridColumnDefinition<SchoolYearGridRow, SchoolYearGridColumnKey> => !!column)
    ), [hiddenSchoolYearColumns, schoolYearColumnOrder]);
    const schoolYearComboFilterOptions = useMemo(() => ({
        year: Array.from(new Set(schoolYearGridRows.map((row) => row.year)))
            .sort((left, right) => (Number(right) || 0) - (Number(left) || 0)),
        seriesName: Array.from(new Set(schoolYearGridRows.map((row) => row.seriesName)))
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right)),
        className: Array.from(new Set(schoolYearGridRows.map((row) => row.className)))
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right)),
    }), [schoolYearGridRows]);
    const classDayTotal = useMemo(() => getClassDayTotal({
        startDate: form.startDate,
        endDate: form.endDate,
        classDays: form.classDays,
        holidays,
        periods,
    }), [form.classDays, form.endDate, form.startDate, holidays, periods]);

    const auditContext = useMemo(() => ({
        auditText: buildAuditText({
            tenantId: currentTenantId,
            tenantName: currentTenantBranding?.schoolName,
            branchCode: currentBranchCode,
            form,
            classDayTotal,
            periodsCount: periods.length,
            holidaysCount: holidays.length,
            activeTab,
        }),
        sqlText: buildAuditSql({
            tenantId: currentTenantId,
            branchCode: currentBranchCode,
            year: form.year,
        }),
    }), [activeTab, classDayTotal, currentBranchCode, currentTenantBranding?.schoolName, currentTenantId, form, holidays.length, periods.length]);

    const updateForm = <Field extends keyof CalendarForm>(field: Field, value: CalendarForm[Field]) => {
        setForm((current) => ({ ...current, [field]: field === 'name' ? normalizeText(String(value)) : value }));
    };

    const applySchoolYearRecordToForm = (schoolYear: SchoolYearRecord) => {
        setForm((current) => ({
            ...current,
            year: String(schoolYear.year),
            name: `ANO LETIVO ${schoolYear.year}`,
            startDate: toDateInputValue(schoolYear.startDate),
            endDate: toDateInputValue(schoolYear.endDate),
            classDays: getClassDaysFromSchoolYear(schoolYear),
        }));
        setPeriods((schoolYear.periods || []).map((period) => ({
            id: period.id,
            startDate: toDateInputValue(period.startDate),
            endDate: toDateInputValue(period.endDate),
            type: period.type,
            appliesTo: normalizeText(period.appliesTo || 'TODAS AS TURMAS'),
        })));
    };

    const handleYearInputChange = (value: string) => {
        const normalizedYear = value.replace(/\D/g, '').slice(0, 4);
        const existingSchoolYear = schoolYears.find((item) => String(item.year) === normalizedYear);
        if (existingSchoolYear) {
            applySchoolYearRecordToForm(existingSchoolYear);
            setSelectedSchoolYearGridId(null);
            return;
        }
        setForm((current) => ({
            ...current,
            year: normalizedYear,
            name: `ANO LETIVO ${normalizedYear || currentYear}`,
            startDate: normalizedYear.length === 4 ? `${normalizedYear}-01-01` : current.startDate,
            endDate: normalizedYear.length === 4 ? `${normalizedYear}-12-31` : current.endDate,
        }));
        setPeriods([]);
        setSelectedSchoolYearGridId(null);
    };

    const updateClassDay = (day: ClassDayKey, checked: boolean) => {
        setForm((current) => ({
            ...current,
            classDays: {
                ...current.classDays,
                [day]: checked,
            },
        }));
    };

    const applyAllClassesScope = () => {
        setSelectedApplicationClassIds([]);
        updateForm('scope', 'TODAS_TURMAS');
    };

    const toggleApplicationClass = (classId: string) => {
        setSelectedApplicationClassIds((current) => {
            const nextIds = current.includes(classId)
                ? current.filter((id) => id !== classId)
                : [...current, classId];

            setForm((currentForm) => ({
                ...currentForm,
                scope: nextIds.length === 0
                    ? 'TODAS_TURMAS'
                    : nextIds.length === 1
                        ? 'TURMA_ESPECIFICA'
                        : 'GRUPO_TURMAS',
            }));

            return nextIds;
        });
    };

    const selectSchoolYearForEditing = (schoolYear: SchoolYearRecord, gridRowId?: string) => {
        setSelectedSchoolYearGridId(gridRowId || null);
        applySchoolYearRecordToForm(schoolYear);
        setActiveTab('CALENDARIO');
    };

    const setSchoolYearGridFilter = (column: SchoolYearGridColumnKey, value: string) => {
        setSchoolYearGridFilters((current) => ({ ...current, [column]: normalizeText(value) }));
        setSchoolYearGridPage(1);
    };

    const clearSchoolYearGridFilter = (column: SchoolYearGridColumnKey) => {
        setSchoolYearGridFilters((current) => ({ ...current, [column]: '' }));
        setActiveSchoolYearFilterColumn(null);
        setSchoolYearGridPage(1);
    };

    const clearAllSchoolYearGridFilters = () => {
        setSchoolYearGridFilters(EMPTY_SCHOOL_YEAR_GRID_FILTERS);
        setActiveSchoolYearFilterColumn(null);
        setSchoolYearGridPage(1);
    };

    const toggleSchoolYearExportColumn = (column: SchoolYearGridColumnKey) => {
        setSchoolYearExportColumns((current) => ({ ...current, [column]: !current[column] }));
    };

    const setAllSchoolYearExportColumns = (checked: boolean) => {
        setSchoolYearExportColumns(
            SCHOOL_YEAR_GRID_COLUMNS.reduce<Record<SchoolYearGridColumnKey, boolean>>((accumulator, column) => {
                accumulator[column.key] = checked;
                return accumulator;
            }, {} as Record<SchoolYearGridColumnKey, boolean>),
        );
    };

    const handleSchoolYearExport = async (options?: {
        selectedColumns: Record<SchoolYearGridColumnKey, boolean>;
        orderedColumns: SchoolYearGridColumnKey[];
        pdfOptions?: Parameters<typeof exportGridRows<SchoolYearGridRow, SchoolYearGridColumnKey>>[0]['pdfOptions'];
    }) => {
        const selectedColumns = options?.selectedColumns || schoolYearExportColumns;
        const orderedColumns = options?.orderedColumns || SCHOOL_YEAR_GRID_COLUMN_KEYS;
        await exportGridRows({
            rows: filteredSchoolYearGridRows,
            columns: orderedColumns
                .map((key) => SCHOOL_YEAR_GRID_COLUMNS.find((column) => column.key === key))
                .filter((column): column is GridColumnDefinition<SchoolYearGridRow, SchoolYearGridColumnKey> => !!column),
            selectedColumns,
            format: schoolYearExportFormat,
            fileBaseName: 'anos-letivos-lancados',
            branding: {
                title: 'Anos letivos lançados',
                subtitle: `${currentTenantBranding?.schoolName || 'Escola'} - ${filteredSchoolYearGridRows.length} registro(s)`,
                logoUrl: currentTenantBranding?.logoUrl || undefined,
            },
            pdfOptions: options?.pdfOptions,
        });
    };

    const toggleSchoolYearColumnVisibility = (columnKey: SchoolYearGridColumnKey) => {
        setHiddenSchoolYearColumns((current) => (
            current.includes(columnKey)
                ? current.filter((key) => key !== columnKey)
                : [...current, columnKey]
        ));
    };

    const moveSchoolYearColumn = (columnKey: SchoolYearGridColumnKey, direction: 'up' | 'down') => {
        setSchoolYearColumnOrder((current) => {
            const currentIndex = current.indexOf(columnKey);
            if (currentIndex === -1) return current;
            const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (nextIndex < 0 || nextIndex >= current.length) return current;
            const next = [...current];
            [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
            return next;
        });
    };

    const resetSchoolYearColumns = () => {
        setSchoolYearColumnOrder(SCHOOL_YEAR_GRID_COLUMN_KEYS);
        setHiddenSchoolYearColumns([]);
    };

    const loadSeriesClasses = async () => {
        try {
            const { token } = getDashboardAuthContext();
            if (!token) return;

            const response = await fetch(`${API_BASE_URL}/series-classes`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => null) as SeriesClassSummary[] | ApiErrorResponse | null;
            if (!response.ok) {
                throw new Error(getApiErrorMessage(data as ApiErrorResponse | null, 'NÃO FOI POSSÍVEL CARREGAR AS TURMAS.'));
            }

            setSeriesClasses(normalizeSeriesClassOptions(data));
        } catch (error) {
            setStatusTone('error');
            setStatusMessage(error instanceof Error ? normalizeText(error.message) : 'NÃO FOI POSSÍVEL CARREGAR AS TURMAS.');
        }
    };

    const loadHolidays = async (yearValue = form.year) => {
        try {
            const year = Number(yearValue);
            if (!Number.isInteger(year)) {
                setHolidays([]);
                return;
            }

            const { token } = getDashboardAuthContext();
            if (!token) return;

            const params = new URLSearchParams({ year: String(year) });
            const response = await fetch(`${API_BASE_URL}/school-years/holidays?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => null) as HolidayRecord[] | ApiErrorResponse | null;
            if (!response.ok) {
                throw new Error(getApiErrorMessage(data as ApiErrorResponse | null, 'NÃO FOI POSSÍVEL CARREGAR OS FERIADOS.'));
            }

            setHolidays(Array.isArray(data) ? data.map((holiday, index) => mapHolidayFromApi(holiday, index)) : []);
        } catch (error) {
            setStatusTone('error');
            setStatusMessage(error instanceof Error ? normalizeText(error.message) : 'NÃO FOI POSSÍVEL CARREGAR OS FERIADOS.');
        }
    };

    const persistHolidays = async (nextHolidays: HolidayRecord[], successMessage: string | null, yearValue = form.year) => {
        try {
            setIsSavingHolidays(true);
            const year = Number(yearValue);
            if (!Number.isInteger(year)) {
                throw new Error('INFORME UM ANO LETIVO VÁLIDO.');
            }

            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('TOKEN NÃO ENCONTRADO. FAÇA LOGIN NOVAMENTE.');

            const response = await fetch(`${API_BASE_URL}/school-years/holidays`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    branchCode: currentBranchCode,
                    year,
                    holidays: nextHolidays.map(mapHolidayForSave),
                }),
            });
            const data = await response.json().catch(() => null) as HolidayRecord[] | ApiErrorResponse | null;
            if (!response.ok) {
                throw new Error(getApiErrorMessage(data as ApiErrorResponse | null, 'NÃO FOI POSSÍVEL SALVAR OS FERIADOS.'));
            }

            const savedHolidays = Array.isArray(data) ? data.map((holiday, index) => mapHolidayFromApi(holiday, index)) : [];
            setHolidays(savedHolidays);
            if (successMessage) {
                setStatusTone('info');
                setStatusMessage(successMessage);
            }
            return savedHolidays;
        } catch (error) {
            setStatusTone('error');
            setStatusMessage(error instanceof Error ? normalizeText(error.message) : 'NÃO FOI POSSÍVEL SALVAR OS FERIADOS.');
            throw error;
        } finally {
            setIsSavingHolidays(false);
        }
    };

    const loadSchoolYears = async () => {
        try {
            setIsLoadingSchoolYears(true);
            const { token } = getDashboardAuthContext();
            if (!token) return;

            const response = await fetch(`${API_BASE_URL}/school-years`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => null) as SchoolYearRecord[] | ApiErrorResponse | null;
            if (!response.ok) {
                throw new Error(getApiErrorMessage(data as ApiErrorResponse | null));
            }

            const records = Array.isArray(data) ? data : [];
            setSchoolYears(records);

            const selectedYear = records.find((item) => item.year === currentYear)
                || records.find((item) => item.isActive)
                || records[0];

            if (selectedYear) {
                applySchoolYearRecordToForm(selectedYear);
            }
        } catch (error) {
            setStatusTone('error');
            setStatusMessage(error instanceof Error ? normalizeText(error.message) : 'NÃO FOI POSSÍVEL CARREGAR OS ANOS LETIVOS.');
        } finally {
            setIsLoadingSchoolYears(false);
        }
    };

    useEffect(() => {
        const { role, permissions, tenantId, branchCode } = getDashboardAuthContext();
        setCurrentRole(role);
        setCurrentPermissions(permissions);
        setCurrentTenantId(tenantId);
        setCurrentBranchCode(branchCode);
        setIsReady(true);
        void loadSchoolYears();
        void loadSeriesClasses();
    }, []);

    useEffect(() => {
        if (!isReady || !canView) return;
        if (!/^\d{4}$/.test(form.year)) {
            setHolidays([]);
            return;
        }
        void loadHolidays(form.year);
    }, [canView, form.year, isReady]);

    useEffect(() => {
        dispatchScreenAuditContext({
            screenId: SCREEN_ID,
            auditText: auditContext.auditText,
            sqlText: auditContext.sqlText,
        });
    }, [auditContext]);

    const openHolidayModal = (holiday?: HolidayRecord) => {
        setHolidayModalMessage(null);
        if (holiday) {
            setEditingHolidayId(holiday.id);
            setSelectedHolidayId(holiday.id);
            setHolidayDraft({
                date: holiday.date,
                name: holiday.name,
                type: holiday.type,
            });
        } else {
            setEditingHolidayId(null);
            setHolidayDraft(DEFAULT_HOLIDAY_DRAFT);
        }
        setIsHolidayModalOpen(true);
    };

    const closeHolidayModal = () => {
        setIsHolidayModalOpen(false);
        setEditingHolidayId(null);
        setHolidayModalMessage(null);
        setHolidayDraft(DEFAULT_HOLIDAY_DRAFT);
    };

    const saveHolidayFromModal = async () => {
        if (!holidayDraft.date || !holidayDraft.name.trim()) {
            setHolidayModalMessage('INFORME A DATA E O NOME DO FERIADO.');
            return;
        }

        setHolidayModalMessage(null);
        const existingHoliday = editingHolidayId
            ? holidays.find((holiday) => holiday.id === editingHolidayId)
            : null;
        const nextHoliday: HolidayRecord = {
            ...existingHoliday,
            ...holidayDraft,
            id: existingHoliday?.id || `holiday-${Date.now()}`,
            name: normalizeText(holidayDraft.name.trim()),
            source: existingHoliday?.source || 'MANUAL',
        };
        const baseHolidays = editingHolidayId
            ? holidays.filter((holiday) => holiday.id !== editingHolidayId)
            : holidays;
        const nextHolidays = mergeHolidayLists(baseHolidays, [nextHoliday]);
        try {
            await persistHolidays(nextHolidays, editingHolidayId ? 'FERIADO ALTERADO.' : 'FERIADO SALVO.');
            closeHolidayModal();
        } catch {
            setHolidayModalMessage('NÃO FOI POSSÍVEL SALVAR O FERIADO.');
            return;
        }
    };

    const importHolidays = async () => {
        try {
            setIsImportingHolidays(true);
            setStatusMessage(null);

            const year = Number(form.year);
            if (!Number.isInteger(year)) {
                throw new Error('INFORME UM ANO LETIVO VÁLIDO.');
            }

            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('TOKEN NÃO ENCONTRADO. FAÇA LOGIN NOVAMENTE.');

            const params = new URLSearchParams({
                year: String(year),
            });

            const response = await fetch(`${API_BASE_URL}/school-years/import-holidays?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => null) as ImportedHolidayResponse | ApiErrorResponse | null;
            if (!response.ok) {
                throw new Error(getApiErrorMessage(data as ApiErrorResponse | null, 'NÃO FOI POSSÍVEL IMPORTAR OS FERIADOS.'));
            }

            const importedHolidays = Array.isArray((data as ImportedHolidayResponse | null)?.holidays)
                ? (data as ImportedHolidayResponse).holidays!
                    .filter((holiday) => holiday.date && holiday.name)
                    .map((holiday, index) => ({
                        id: `imported-holiday-${Date.now()}-${index}`,
                        date: String(holiday.date),
                        name: normalizeText(String(holiday.name)),
                        type: holiday.type && holidayTypeLabels[holiday.type] ? holiday.type : 'NACIONAL',
                        source: holiday.source || 'BRASIL_API',
                    }))
                : [];

            const nextHolidays = mergeHolidayLists(holidays, importedHolidays);
            await persistHolidays(nextHolidays, `${importedHolidays.length} FERIADO(S) IMPORTADO(S) E SALVO(S).`, String(year));
        } catch (error) {
            setStatusTone('error');
            setStatusMessage(error instanceof Error ? normalizeText(error.message) : 'NÃO FOI POSSÍVEL IMPORTAR OS FERIADOS.');
        } finally {
            setIsImportingHolidays(false);
        }
    };

    const removeHoliday = async (holidayId: string) => {
        const nextHolidays = holidays.filter((item) => item.id !== holidayId);
        try {
            await persistHolidays(nextHolidays, 'FERIADO REMOVIDO.');
        } catch {
            return;
        }
    };

    const addPeriod = () => {
        if (!periodDraft.startDate || !periodDraft.endDate) {
            setStatusTone('error');
            setStatusMessage('INFORME O INICIO E O FIM DO PERIODO.');
            return;
        }

        setPeriods((current) => [
            ...current,
            {
                ...periodDraft,
                id: `period-${Date.now()}`,
                appliesTo: normalizeText(periodDraft.appliesTo.trim() || 'TODAS AS TURMAS'),
            },
        ]);
        setPeriodDraft(DEFAULT_PERIOD_DRAFT);
        setStatusTone('info');
        setStatusMessage('PERIODO ADICIONADO AO RASCUNHO. PARA GRAVAR DEFINITIVAMENTE, CLIQUE NO BOTAO SALVAR ANO LETIVO.');
    };

    const saveSchoolYear = async () => {
        try {
            setIsSavingSchoolYear(true);
            setStatusMessage(null);

            const formYear = Number(form.year);
            if (!Number.isInteger(formYear)) {
                throw new Error('INFORME UM ANO LETIVO VÁLIDO.');
            }
            if (!form.startDate || !form.endDate) {
                throw new Error('INFORME O INÍCIO E O FIM DO ANO LETIVO.');
            }
            if (new Date(`${form.startDate}T00:00:00`) > new Date(`${form.endDate}T00:00:00`)) {
                throw new Error('O INÍCIO DO ANO LETIVO NÃO PODE SER POSTERIOR AO FIM.');
            }
            const periodYearCandidates = new Set(periods.flatMap((period) => [
                period.startDate.slice(0, 4),
                period.endDate.slice(0, 4),
            ]).filter((value) => /^\d{4}$/.test(value)));
            const resolvedYear = periodYearCandidates.size === 1
                ? Number(Array.from(periodYearCandidates)[0])
                : formYear;
            const existingSchoolYear = schoolYears.find((item) => String(item.year) === String(resolvedYear));
            const resolvedStartDate = existingSchoolYear ? toDateInputValue(existingSchoolYear.startDate) : form.startDate;
            const resolvedEndDate = existingSchoolYear ? toDateInputValue(existingSchoolYear.endDate) : form.endDate;
            const periodOutsideSchoolYear = periods.find((period) => (
                period.startDate < resolvedStartDate || period.endDate > resolvedEndDate
            ));
            if (periodOutsideSchoolYear) {
                throw new Error(`O PERIODO SEM AULA ${formatDate(periodOutsideSchoolYear.startDate)} A ${formatDate(periodOutsideSchoolYear.endDate)} PRECISA ESTAR DENTRO DO ANO LETIVO ${formatDate(resolvedStartDate)} A ${formatDate(resolvedEndDate)}.`);
            }

            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('TOKEN NÃO ENCONTRADO. FAÇA LOGIN NOVAMENTE.');

            const saveUrl = existingSchoolYear
                ? `${API_BASE_URL}/school-years/${existingSchoolYear.id}`
                : `${API_BASE_URL}/school-years`;
            const response = await fetch(saveUrl, {
                method: existingSchoolYear ? 'PATCH' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    branchCode: currentBranchCode,
                    year: resolvedYear,
                    startDate: resolvedStartDate,
                    endDate: resolvedEndDate,
                    isActive: true,
                    ...form.classDays,
                    periods: periods.map((period) => ({
                        type: period.type,
                        startDate: period.startDate,
                        endDate: period.endDate,
                        appliesTo: period.appliesTo,
                    })),
                }),
            });
            const data = await response.json().catch(() => null) as SchoolYearRecord | ApiErrorResponse | null;
            if (!response.ok) {
                throw new Error(getApiErrorMessage(data as ApiErrorResponse | null));
            }

            const savedSchoolYear = data as SchoolYearRecord;
            setSchoolYears((current) => {
                const others = current.filter((item) => item.id !== savedSchoolYear.id);
                return [savedSchoolYear, ...others].sort((first, second) => second.year - first.year);
            });
            if (holidays.length > 0) {
                await persistHolidays(holidays, null, String(resolvedYear));
            }
            setStatusTone('info');
            setStatusMessage('ANO LETIVO, PERIODOS SEM AULA E FERIADOS SALVOS COM SUCESSO.');
        } catch (error) {
            setStatusTone('error');
            setStatusMessage(error instanceof Error ? normalizeText(error.message) : 'NÃO FOI POSSÍVEL SALVAR O ANO LETIVO.');
        } finally {
            setIsSavingSchoolYear(false);
        }
    };

    if (isReady && !canView) {
        return (
            <DashboardAccessDenied
                title="Acesso restrito ao ano letivo"
                message="Seu perfil não possui permissão para consultar as configurações de ano letivo desta escola."
            />
        );
    }

    return (
        <div className="flex h-[calc(100vh-4.5rem)] min-h-0 w-full flex-col">
            <PrincipalProgramHeader
                eyebrow="Ano letivo"
                title="Configura Ano Letivo"
                description="Configure período letivo, férias, recessos e feriados por calendário."
                schoolName={currentTenantBranding?.schoolName}
                logoUrl={currentTenantBranding?.logoUrl}
                secondaryAction={
                    <>
                        <button
                            type="button"
                            onClick={() => window.dispatchEvent(new Event('msinfor-financeiro-toggle-sidebar'))}
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
                            onClick={() => window.dispatchEvent(new Event('msinfor-financeiro-open-notifications'))}
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

            <div className={`mt-6 grid min-h-0 flex-1 gap-5 ${activeTab === 'CALENDARIO' ? 'xl:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
                <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className={activeTab === 'FERIADOS' || activeTab === 'ANOS' ? 'flex min-h-0 flex-1 flex-col gap-6 overflow-hidden p-6' : 'max-h-full space-y-6 overflow-y-auto p-6'}>
                        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Configuração do ano letivo">
                                {Object.entries(configTabLabels).map(([value, label]) => {
                                    const isSelected = activeTab === value;
                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            role="tab"
                                            aria-selected={isSelected}
                                            onClick={() => setActiveTab(value as ConfigTab)}
                                            className={`rounded-xl px-5 py-3 text-xs font-black uppercase tracking-[0.16em] transition ${isSelected ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                            <span className={`mr-1 rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] ${canManage ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'}`}>
                                {canManage ? 'Edição liberada' : 'Somente leitura'}
                            </span>
                        </div>

                        {activeTab === 'ANOS' ? (
                            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                                <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl bg-slate-200/80 p-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setForm((current) => ({
                                                ...DEFAULT_FORM,
                                                year: current.year || DEFAULT_FORM.year,
                                                name: `ANO LETIVO ${current.year || DEFAULT_FORM.year}`,
                                            }));
                                            setSelectedSchoolYearGridId(null);
                                            setActiveTab('CALENDARIO');
                                        }}
                                        disabled={!canManage}
                                        title="Incluir novo ano letivo"
                                        aria-label="Incluir novo ano letivo"
                                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                                    >
                                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                        </svg>
                                    </button>
                                    <div className="relative w-full max-w-sm">
                                        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input
                                            value={schoolYearGridSearch}
                                            onChange={(event) => {
                                                setSchoolYearGridSearch(event.target.value);
                                                setSchoolYearGridPage(1);
                                            }}
                                            placeholder="Buscar ano letivo..."
                                            className="h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                        />
                                    </div>
                                </div>

                                <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                                    <div className="min-h-0 flex-1 overflow-auto">
                                        <table className="min-w-[86rem] table-fixed border-collapse text-left">
                                            <thead>
                                                <tr className="border-b border-slate-300 bg-slate-100 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">
                                                    <th className="sticky top-0 z-20 w-12 bg-slate-100 px-3 py-3">
                                                        <button
                                                            type="button"
                                                            onClick={clearAllSchoolYearGridFilters}
                                                            title="Limpar todos os filtros"
                                                            aria-label="Limpar todos os filtros"
                                                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-blue-700"
                                                        >
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4l16 16M5 5h14l-5 6v5l-4 2v-7L5 5z" />
                                                            </svg>
                                                        </button>
                                                    </th>
                                                    {visibleSchoolYearColumns.map((column) => (
                                                        <th key={column.key} className="sticky top-0 z-20 bg-slate-100 px-4 py-3">
                                                            {column.key === 'year' || column.key === 'seriesName' || column.key === 'className' ? (
                                                                <div className="relative flex items-center gap-2">
                                                                    <span>{column.label}</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setActiveSchoolYearFilterColumn((current) => current === column.key ? null : column.key)}
                                                                        aria-label={`Filtrar ${column.label}`}
                                                                        title={`Filtrar ${column.label}`}
                                                                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${schoolYearGridFilters[column.key] || activeSchoolYearFilterColumn === column.key ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-400 hover:border-blue-200 hover:text-blue-600'}`}
                                                                    >
                                                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <circle cx="11" cy="11" r="7" strokeWidth={1.8} />
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m20 20-3.5-3.5" />
                                                                        </svg>
                                                                    </button>
                                                                    {activeSchoolYearFilterColumn === column.key ? (
                                                                        <div className="absolute left-0 top-full z-40 mt-2 w-[276px] rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-xl">
                                                                            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                                                                                Ordenar coluna
                                                                            </div>
                                                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        setSchoolYearGridSort({ column: column.key, direction: 'asc' });
                                                                                        setActiveSchoolYearFilterColumn(null);
                                                                                    }}
                                                                                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                                                                                >
                                                                                    Crescente
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        setSchoolYearGridSort({ column: column.key, direction: 'desc' });
                                                                                        setActiveSchoolYearFilterColumn(null);
                                                                                    }}
                                                                                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                                                                                >
                                                                                    Decrescente
                                                                                </button>
                                                                            </div>
                                                                            <div className="mt-3 border-t border-slate-100 pt-3">
                                                                                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                                                                                    Filtrar {column.label}
                                                                                </div>
                                                                                <select
                                                                                    value={schoolYearGridFilters[column.key]}
                                                                                    onChange={(event) => setSchoolYearGridFilter(column.key, event.target.value)}
                                                                                    className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold uppercase text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                                                                                >
                                                                                    <option value="">TODOS</option>
                                                                                    {schoolYearComboFilterOptions[column.key].map((option) => (
                                                                                        <option key={option} value={option}>{option}</option>
                                                                                    ))}
                                                                                </select>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setActiveSchoolYearFilterColumn(null)}
                                                                                    className="mt-2 h-9 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
                                                                                >
                                                                                    Aplicar
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => clearSchoolYearGridFilter(column.key)}
                                                                                    className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:bg-slate-100"
                                                                                >
                                                                                    Limpar
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            ) : (
                                                                <GridColumnFilterHeader
                                                                    label={column.label}
                                                                    align={column.key === 'totalClassDays' ? 'right' : 'left'}
                                                                    isOpen={activeSchoolYearFilterColumn === column.key}
                                                                    isActive={Boolean(schoolYearGridFilters[column.key])}
                                                                    filterValue={schoolYearGridFilters[column.key]}
                                                                    onToggle={() => setActiveSchoolYearFilterColumn((current) => current === column.key ? null : column.key)}
                                                                    onSort={(direction) => {
                                                                        setSchoolYearGridSort({ column: column.key, direction });
                                                                        setActiveSchoolYearFilterColumn(null);
                                                                    }}
                                                                    onFilterValueChange={(value) => setSchoolYearGridFilter(column.key, value)}
                                                                    onApply={() => setActiveSchoolYearFilterColumn(null)}
                                                                    onClear={() => clearSchoolYearGridFilter(column.key)}
                                                                />
                                                            )}
                                                        </th>
                                                    ))}
                                                    <th className="sticky top-0 z-20 w-24 bg-slate-100 px-4 py-3 text-center">Ação</th>
                                                </tr>
                                                {activeSchoolYearFilterColumn ? (
                                                    <tr aria-hidden="true">
                                                        <th colSpan={visibleSchoolYearColumns.length + 2} className="h-56 bg-white p-0" />
                                                    </tr>
                                                ) : null}
                                            </thead>
                                            <tbody>
                                                {isLoadingSchoolYears ? (
                                                    <tr>
                                                        <td colSpan={visibleSchoolYearColumns.length + 2} className="px-4 py-8 text-center text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                                                            Carregando anos letivos...
                                                        </td>
                                                    </tr>
                                                ) : null}

                                                {!isLoadingSchoolYears && filteredSchoolYearGridRows.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={visibleSchoolYearColumns.length + 2} className="px-4 py-8 text-center text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                                                            Nenhum ano letivo encontrado.
                                                        </td>
                                                    </tr>
                                                ) : null}

                                                {!isLoadingSchoolYears && paginatedSchoolYearGridRows.map((row, index) => {
                                                    const isSelected = selectedSchoolYearGridId === row.id;
                                                    const dayTags = row.classDaysLabel === 'NENHUM'
                                                        ? []
                                                        : row.classDaysLabel.split(',').map((item) => item.trim()).filter(Boolean);
                                                    const rowClass = isSelected
                                                        ? 'bg-blue-100 outline outline-2 outline-blue-400 outline-offset-[-2px]'
                                                        : index % 2 === 0
                                                            ? 'bg-white hover:bg-blue-100/70'
                                                            : 'bg-slate-300/80 hover:bg-blue-100/70';
                                                    return (
                                                        <Fragment key={row.id}>
                                                            <tr
                                                                key={`${row.id}-main`}
                                                                onClick={() => setSelectedSchoolYearGridId(row.id)}
                                                                aria-selected={isSelected}
                                                                className={`cursor-pointer border-t border-slate-100 transition ${rowClass}`}
                                                            >
                                                                <td className="px-3 py-3" />
                                                                {visibleSchoolYearColumns.map((column) => {
                                                                    const rawValue = row[column.key];
                                                                    const value = column.key === 'startDate' || column.key === 'endDate'
                                                                        ? formatDate(String(rawValue))
                                                                        : String(rawValue);
                                                                    return (
                                                                        <td
                                                                            key={`${row.id}-${column.key}`}
                                                                            className={`px-4 pt-3 text-xs font-black uppercase tracking-[0.12em] text-slate-700 ${column.key === 'year' ? 'text-sm text-slate-900' : ''} ${column.key === 'totalClassDays' ? 'text-right text-slate-900' : ''}`}
                                                                        >
                                                                            <span className="block max-w-[18rem] truncate">{value}</span>
                                                                        </td>
                                                                    );
                                                                })}
                                                                <td className="px-4 pt-3">
                                                                    <div className="flex items-center justify-center">
                                                                        <button
                                                                            type="button"
                                                                            onClick={(event) => {
                                                                                event.stopPropagation();
                                                                                selectSchoolYearForEditing(row.schoolYear, row.id);
                                                                            }}
                                                                            disabled={!canManage}
                                                                            title="Abrir ano letivo"
                                                                            aria-label="Abrir ano letivo"
                                                                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                                        >
                                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.651-1.651a1.875 1.875 0 112.652 2.652L9 17.653 5.25 18.75 6.347 15 16.862 4.487z" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                            <tr
                                                                key={`${row.id}-tags`}
                                                                onClick={() => setSelectedSchoolYearGridId(row.id)}
                                                                aria-selected={isSelected}
                                                                className={`cursor-pointer border-b border-slate-100 transition ${rowClass}`}
                                                            >
                                                                <td className="px-3 pb-3" />
                                                                <td colSpan={visibleSchoolYearColumns.length + 1} className="px-4 pb-3 pt-1">
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                                                                            Dias com aula
                                                                        </span>
                                                                        {dayTags.length > 0 ? dayTags.map((day) => (
                                                                            <span
                                                                                key={`${row.id}-${day}`}
                                                                                className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${getClassDayTagStyle(day)}`}
                                                                            >
                                                                                {day}
                                                                            </span>
                                                                        )) : (
                                                                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                                                                                NENHUM
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        </Fragment>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    <GridStandardFooter
                                        recordsCount={filteredSchoolYearGridRows.length}
                                        onOpenColumns={() => setIsSchoolYearColumnModalOpen(true)}
                                        onOpenExport={() => setIsSchoolYearExportModalOpen(true)}
                                        statusFilter={schoolYearGridStatusFilter}
                                        onStatusFilterChange={(value) => {
                                            setSchoolYearGridStatusFilter(value);
                                            setSchoolYearGridPage(1);
                                        }}
                                        activeLabel="Mostrar somente anos ativos"
                                        allLabel="Mostrar anos ativos e inativos"
                                        inactiveLabel="Mostrar somente anos inativos"
                                        aggregateSummaries={[]}
                                        pageSize={schoolYearGridPageSize}
                                        onPageSizeChange={(value) => {
                                            setSchoolYearGridPageSize(value);
                                            setSchoolYearGridPage(1);
                                        }}
                                        currentPage={currentSchoolYearGridPage}
                                        totalPages={schoolYearGridTotalPages}
                                        onFirstPage={() => setSchoolYearGridPage(1)}
                                        onPreviousPage={() => setSchoolYearGridPage((current) => Math.max(1, current - 1))}
                                        onNextPage={() => setSchoolYearGridPage((current) => Math.min(schoolYearGridTotalPages, current + 1))}
                                        onLastPage={() => setSchoolYearGridPage(schoolYearGridTotalPages)}
                                    />
                                </div>
                            </section>
                        ) : activeTab === 'CALENDARIO' ? (
                            <>
                                <div className="grid gap-4 lg:grid-cols-4">
                                    <label className="block">
                                        <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">Ano</span>
                                        <input
                                            value={form.year}
                                            onChange={(event) => handleYearInputChange(event.target.value)}
                                            disabled={!canManage}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:text-slate-400"
                                        />
                                    </label>
                                    <label className="block lg:col-span-3">
                                        <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">Nome do calendário</span>
                                        <input
                                            value={form.name}
                                            onChange={(event) => updateForm('name', event.target.value)}
                                            disabled={!canManage}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold uppercase text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:text-slate-400"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">Início</span>
                                        <input
                                            type="date"
                                            value={form.startDate}
                                            onChange={(event) => updateForm('startDate', event.target.value)}
                                            disabled={!canManage}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:text-slate-400"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">Fim</span>
                                        <input
                                            type="date"
                                            value={form.endDate}
                                            onChange={(event) => updateForm('endDate', event.target.value)}
                                            disabled={!canManage}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:text-slate-400"
                                        />
                                    </label>
                                    <label className="block lg:col-span-2">
                                        <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">Aplicação</span>
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => canManage && setIsApplicationDropdownOpen((current) => !current)}
                                                disabled={!canManage}
                                                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-bold uppercase text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:text-slate-400"
                                                aria-expanded={isApplicationDropdownOpen}
                                            >
                                                <span className="min-w-0 truncate">{applicationScopeLabel}</span>
                                                <svg className={`h-4 w-4 shrink-0 transition ${isApplicationDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>

                                            {isApplicationDropdownOpen ? (
                                                <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                                                    <div className="border-b border-slate-100 p-3">
                                                        <input
                                                            value={applicationClassFilter}
                                                            onChange={(event) => setApplicationClassFilter(normalizeText(event.target.value))}
                                                            placeholder="FILTRAR TURMA OU SÉRIE"
                                                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                                                        />
                                                    </div>
                                                    <div className="max-h-64 overflow-y-auto p-2">
                                                        <button
                                                            type="button"
                                                            onClick={applyAllClassesScope}
                                                            className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${selectedApplicationClassIds.length === 0 ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}
                                                        >
                                                            <span className={`flex h-4 w-4 items-center justify-center rounded border ${selectedApplicationClassIds.length === 0 ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                                                                {selectedApplicationClassIds.length === 0 ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                                                            </span>
                                                            <span className="min-w-0 text-xs font-black uppercase tracking-[0.12em]">TODAS AS TURMAS</span>
                                                        </button>

                                                        {filteredSeriesClasses.map((seriesClass) => {
                                                            const isChecked = selectedApplicationClassIds.includes(seriesClass.id);
                                                            return (
                                                                <label
                                                                    key={seriesClass.id}
                                                                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition ${isChecked ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isChecked}
                                                                        onChange={() => toggleApplicationClass(seriesClass.id)}
                                                                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                                    />
                                                                    <span className="min-w-0 truncate text-xs font-black uppercase tracking-[0.12em]">{getSeriesClassLabel(seriesClass)}</span>
                                                                </label>
                                                            );
                                                        })}

                                                        {filteredSeriesClasses.length === 0 ? (
                                                            <div className="px-3 py-5 text-center text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                                                                Nenhuma turma encontrada.
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    </label>
                                </div>

                                <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                                    <h3 className="text-xs font-black uppercase tracking-[0.18em] text-[#153a6a]">Dias da semana com aula</h3>
                                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                        {(Object.entries(classDayLabels) as Array<[ClassDayKey, string]>).map(([day, label]) => {
                                            const isChecked = form.classDays[day];
                                            return (
                                                <label
                                                    key={day}
                                                    className={`flex items-center justify-between rounded-xl border px-4 py-3 transition ${isChecked ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600'} ${canManage ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed opacity-70'}`}
                                                >
                                                    <span className="text-xs font-black uppercase tracking-[0.14em]">{label}</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={(event) => updateClassDay(day, event.target.checked)}
                                                        disabled={!canManage}
                                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                                                    />
                                                </label>
                                            );
                                        })}
                                    </div>
                                </section>

                            <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                                <h3 className="text-xs font-black uppercase tracking-[0.18em] text-[#153a6a]">Férias e recessos</h3>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <input
                                        type="date"
                                        value={periodDraft.startDate}
                                        onChange={(event) => setPeriodDraft((current) => ({ ...current, startDate: event.target.value }))}
                                        disabled={!canManage}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:text-slate-400"
                                    />
                                    <input
                                        type="date"
                                        value={periodDraft.endDate}
                                        onChange={(event) => setPeriodDraft((current) => ({ ...current, endDate: event.target.value }))}
                                        disabled={!canManage}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:text-slate-400"
                                    />
                                    <select
                                        value={periodDraft.type}
                                        onChange={(event) => setPeriodDraft((current) => ({ ...current, type: event.target.value as PeriodType }))}
                                        disabled={!canManage}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold uppercase text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:text-slate-400"
                                    >
                                        {Object.entries(periodTypeLabels).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                    <input
                                        value={periodDraft.appliesTo}
                                        onChange={(event) => setPeriodDraft((current) => ({ ...current, appliesTo: normalizeText(event.target.value) }))}
                                        disabled={!canManage}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold uppercase text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:text-slate-400"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={addPeriod}
                                    disabled={!canManage}
                                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Adicionar período
                                </button>

                                <div className="mt-5 space-y-3">
                                    {periods.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                                            Nenhum período cadastrado.
                                        </div>
                                    ) : null}
                                    {periods.map((period) => (
                                        <div key={period.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                                            <div>
                                                <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-800">{periodTypeLabels[period.type]}</div>
                                                <div className="mt-1 text-xs font-semibold text-slate-500">{formatDate(period.startDate)} A {formatDate(period.endDate)} • {period.appliesTo}</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setPeriods((current) => current.filter((item) => item.id !== period.id))}
                                                disabled={!canManage}
                                                title="Remover período"
                                                aria-label="Remover período"
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </section>
                            </>
                        ) : (

                            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                                    <h3 className="text-xs font-black uppercase tracking-[0.18em] text-[#153a6a]">Feriados</h3>
                                    <button
                                        type="button"
                                        onClick={importHolidays}
                                        disabled={!canManage || isImportingHolidays || isSavingHolidays}
                                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-md shadow-emerald-500/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                                    >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.3} d="M4 4v6h6M20 20v-6h-6" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.3} d="M5 15a7 7 0 0012 3M19 9A7 7 0 007 6" />
                                        </svg>
                                        {isImportingHolidays ? 'Importando...' : 'Importar nacionais'}
                                    </button>
                                </div>

                                <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => openHolidayModal()}
                                                disabled={!canManage || isSavingHolidays}
                                                title="Incluir feriado"
                                                aria-label="Incluir feriado"
                                                className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                                            >
                                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                                </svg>
                                            </button>
                                            <div>
                                                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#153a6a]">Cadastro de feriados</div>
                                                <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Grid oficial • {form.year || 'ANO'}</div>
                                            </div>
                                        </div>
                                        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                                            Registros: {holidays.length}
                                        </span>
                                    </div>

                                    <div className="min-h-0 flex-1 overflow-auto">
                                        <div className="grid min-w-[48rem] grid-cols-[7.5rem_minmax(7rem,9rem)_minmax(14rem,1fr)_6rem] items-center border-b border-slate-200 bg-slate-100 px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600 sticky top-0 z-10">
                                            <span>Data</span>
                                            <span>Tipo</span>
                                            <span>Feriado</span>
                                            <span className="text-center">Ações</span>
                                        </div>

                                        {holidays.length === 0 ? (
                                            <div className="min-w-[48rem] px-4 py-8 text-center text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                                                Nenhum feriado cadastrado.
                                            </div>
                                        ) : null}

                                        {holidays.map((holiday, index) => {
                                            const style = holidayTypeStyles[holiday.type];
                                            const isSelected = selectedHolidayId === holiday.id;
                                            return (
                                                <div
                                                    key={holiday.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => setSelectedHolidayId(holiday.id)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            setSelectedHolidayId(holiday.id);
                                                        }
                                                    }}
                                                    className={`grid min-w-[48rem] grid-cols-[7.5rem_minmax(7rem,9rem)_minmax(14rem,1fr)_6rem] items-center gap-3 border-l-4 px-4 py-3 text-left transition ${style.row} ${index % 2 === 0 ? '' : 'brightness-[0.98]'} ${isSelected ? 'ring-2 ring-inset ring-blue-400' : 'hover:bg-slate-50'}`}
                                                >
                                                    <span className="text-xs font-black uppercase text-slate-800">{formatDate(holiday.date)}</span>
                                                    <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${style.badge}`}>
                                                        <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                                                        {holidayTypeLabels[holiday.type]}
                                                    </span>
                                                    <span className="min-w-0 break-words text-xs font-black uppercase tracking-[0.12em] text-slate-800">{holiday.name}</span>
                                                    <span className="flex items-center justify-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                openHolidayModal(holiday);
                                                            }}
                                                            disabled={!canManage || isSavingHolidays}
                                                            title="Alterar feriado"
                                                            aria-label="Alterar feriado"
                                                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.651-1.651a1.875 1.875 0 112.652 2.652L9 17.653 5.25 18.75 6.347 15 16.862 4.487z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                void removeHoliday(holiday.id);
                                                            }}
                                                            disabled={!canManage || isSavingHolidays}
                                                            title="Remover feriado"
                                                            aria-label="Remover feriado"
                                                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
                                        <div className="flex flex-wrap items-center gap-3">
                                            {Object.entries(holidayTypeLabels).map(([value, label]) => {
                                                const style = holidayTypeStyles[value as HolidayType];
                                                return (
                                                    <span key={value} className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
                                                        <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                                                        {label}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Registros: {holidays.length}</span>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>
                </section>

                {activeTab === 'CALENDARIO' ? (
                    <aside className="space-y-5">
                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-[#153a6a]">Resumo</h3>
                            <div className="mt-4 grid gap-3">
                                <div className="rounded-xl bg-slate-50 px-4 py-3">
                                    <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Dias com aula</span>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {(Object.entries(classDayLabels) as Array<[ClassDayKey, string]>)
                                            .filter(([day]) => form.classDays[day])
                                            .map(([day, label]) => (
                                                <span
                                                    key={day}
                                                    className={`inline-flex min-h-8 items-center rounded-lg border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] ${classDayCardStyles[day]}`}
                                                >
                                                    {label}
                                                </span>
                                            ))}
                                        {getSelectedClassDayLabels(form.classDays).length === 0 ? (
                                            <span className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
                                                ---
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                                {[
                                    ['Ano', form.year || '---'],
                                    ['Início', formatDate(form.startDate)],
                                    ['Fim', formatDate(form.endDate)],
                                    ['Total dias aula', String(classDayTotal)],
                                    ['Períodos', String(periods.length)],
                                    ['Feriados', String(holidays.length)],
                                ].map(([label, value]) => (
                                    <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                                        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</span>
                                        <span className="text-sm font-black uppercase text-slate-900">{value}</span>
                                    </div>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={saveSchoolYear}
                                disabled={!canManage || isLoadingSchoolYears || isSavingSchoolYear || isSavingHolidays}
                                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-md shadow-emerald-500/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                {isSavingSchoolYear || isSavingHolidays ? 'Salvando...' : 'Salvar ano letivo'}
                            </button>
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-[#153a6a]">Turmas vinculadas</h3>
                            <div className="mt-4 space-y-3">
                                {Object.entries(scopeLabels).map(([value, label]) => {
                                    const isSelected = form.scope === value;
                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => updateForm('scope', value as CalendarScope)}
                                            disabled={!canManage}
                                            className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed ${isSelected ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                                        >
                                            <span className="text-xs font-black uppercase tracking-[0.14em]">{label}</span>
                                            <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                                                {isSelected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    </aside>
                ) : null}
            </div>

            {statusMessage ? (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-4">
                            <div className="flex min-w-0 items-center gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                    {currentTenantBranding?.logoUrl ? (
                                        <img src={currentTenantBranding.logoUrl} alt={currentTenantBranding.schoolName || 'Escola'} className="h-full w-full object-contain" />
                                    ) : (
                                        <span className="text-sm font-black tracking-[0.25em] text-[#153a6a]">
                                            {String(currentTenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-600">
                                        {currentTenantBranding?.schoolName || 'Escola'}
                                    </div>
                                    <h2 className="truncate text-xl font-black text-[#153a6a]">
                                        {statusTone === 'error' ? 'Atenção' : 'Mensagem'}
                                    </h2>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setStatusMessage(null)}
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                                title="Fechar"
                                aria-label="Fechar popup de mensagem"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6">
                            <div className={`rounded-2xl border px-4 py-4 text-sm font-black uppercase tracking-[0.08em] ${statusTone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                                {statusMessage}
                            </div>

                            <div className="mt-5 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setStatusMessage(null)}
                                    className="rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-500"
                                >
                                    Fechar
                                </button>
                            </div>

                            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                                    Auditoria visual: exibe mensagens operacionais da tela de ano letivo.
                                </div>
                                <ScreenNameCopy
                                    screenId={STATUS_MODAL_SCREEN_ID}
                                    label="Popup"
                                    className="mt-3"
                                    auditText={`--- LOGICA DO POPUP ---
Popup de mensagens da tela PRINCIPAL_CONFIGURA_ANO_LETIVO.

REGRA:
- exibe retornos de sucesso e erro das acoes da tela.
- nao grava dados diretamente.
- fechamento apenas limpa a mensagem visual atual.`}
                                    sqlText={`-- Popup visual sem consulta propria.
-- A origem da mensagem depende da acao executada na tela ${SCREEN_ID}.`}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {isHolidayModalOpen ? (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-4">
                            <div className="flex min-w-0 items-center gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                    {currentTenantBranding?.logoUrl ? (
                                        <img src={currentTenantBranding.logoUrl} alt={currentTenantBranding.schoolName || 'Escola'} className="h-full w-full object-contain" />
                                    ) : (
                                        <span className="text-sm font-black tracking-[0.25em] text-[#153a6a]">
                                            {String(currentTenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-600">
                                        {currentTenantBranding?.schoolName || 'Escola'}
                                    </div>
                                    <h2 className="truncate text-xl font-black text-[#153a6a]">
                                        {editingHolidayId ? 'Alterar feriado' : 'Incluir feriado'}
                                    </h2>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={closeHolidayModal}
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                                title="Fechar"
                                aria-label="Fechar popup de feriado"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void saveHolidayFromModal();
                            }}
                            className="space-y-5 p-6"
                        >
                            {holidayModalMessage ? (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-red-700">
                                    {holidayModalMessage}
                                </div>
                            ) : null}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">Data</span>
                                    <input
                                        type="date"
                                        value={holidayDraft.date}
                                        onChange={(event) => setHolidayDraft((current) => ({ ...current, date: event.target.value }))}
                                        disabled={!canManage || isSavingHolidays}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:text-slate-400"
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">Tipo</span>
                                    <select
                                        value={holidayDraft.type}
                                        onChange={(event) => setHolidayDraft((current) => ({ ...current, type: event.target.value as HolidayType }))}
                                        disabled={!canManage || isSavingHolidays}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold uppercase text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:text-slate-400"
                                    >
                                        {Object.entries(holidayTypeLabels).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block sm:col-span-2">
                                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">Nome do feriado</span>
                                    <input
                                        value={holidayDraft.name}
                                        onChange={(event) => setHolidayDraft((current) => ({ ...current, name: normalizeText(event.target.value) }))}
                                        disabled={!canManage || isSavingHolidays}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold uppercase text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:text-slate-400"
                                    />
                                </label>
                            </div>

                            <div className="border-t border-slate-100 pt-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <button
                                        type="button"
                                        onClick={closeHolidayModal}
                                        className="rounded-xl bg-rose-500 px-5 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-rose-600"
                                    >
                                        Fechar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!canManage || isSavingHolidays}
                                        className="rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                                    >
                                        {isSavingHolidays ? 'Salvando...' : editingHolidayId ? 'Salvar alteração' : 'Salvar feriado'}
                                    </button>
                                </div>
                                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                                        Auditoria visual: grava em school_holidays por tenant, filial e ano letivo. Não trata turma.
                                    </div>
                                    <ScreenNameCopy
                                        screenId={HOLIDAY_MODAL_SCREEN_ID}
                                        label="Popup"
                                        className="mt-3"
                                        auditText={`--- LOGICA DO POPUP ---
Popup de inclusao e alteracao de feriados da tela PRINCIPAL_CONFIGURA_ANO_LETIVO.

TABELA PRINCIPAL:
- school_holidays (SH) - feriados cadastrados por escola, filial e ano letivo.

REGRA:
- o popup grava data, tipo e nome do feriado.
- nao trata turma.
- salvar sincroniza a lista de feriados pelo endpoint PUT /school-years/holidays.
- remocao permanece como cancelamento logico pelo mesmo fluxo de sincronizacao.`}
                                        sqlText={`SELECT
  SH.id,
  SH.tenantId,
  SH.branchCode,
  SH.year,
  SH.date,
  SH.name,
  SH.holidayType
FROM school_holidays SH
WHERE SH.tenantId = ${toSqlLiteral(currentTenantId || 'ESCOLA_LOGADA')}
  AND SH.branchCode IN (0, ${currentBranchCode})
  AND SH.year = ${Number(form.year) || currentYear}
  AND SH.canceledAt IS NULL
ORDER BY SH.date ASC, SH.name ASC;`}
                                    />
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            <GridExportModal
                isOpen={isSchoolYearExportModalOpen}
                title="Exportar anos letivos lançados"
                description={`A exportação respeita os filtros atuais e inclui ${filteredSchoolYearGridRows.length} registro(s).`}
                format={schoolYearExportFormat}
                onFormatChange={setSchoolYearExportFormat}
                columns={SCHOOL_YEAR_GRID_COLUMNS.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={schoolYearExportColumns}
                onToggleColumn={toggleSchoolYearExportColumn}
                onSelectAll={setAllSchoolYearExportColumns}
                storageKey={`principal-configura-ano-letivo:anos-letivos:export:${currentTenantId || 'default'}`}
                onClose={() => setIsSchoolYearExportModalOpen(false)}
                onExport={handleSchoolYearExport}
            />

            <GridColumnConfigModal
                isOpen={isSchoolYearColumnModalOpen}
                title="Configurar colunas do grid"
                description="Reordene ou oculte colunas da consulta de anos letivos lançados."
                columns={SCHOOL_YEAR_GRID_COLUMNS.map((column) => ({
                    key: column.key,
                    label: column.label,
                    visibleByDefault: true,
                }))}
                orderedColumns={schoolYearColumnOrder}
                hiddenColumns={hiddenSchoolYearColumns}
                onToggleColumnVisibility={toggleSchoolYearColumnVisibility}
                onMoveColumn={moveSchoolYearColumn}
                onReset={resetSchoolYearColumns}
                onClose={() => setIsSchoolYearColumnModalOpen(false)}
            />
        </div>
    );
}
