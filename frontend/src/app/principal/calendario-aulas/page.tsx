'use client';

import Link from 'next/link';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { useEffect, useMemo, useState } from 'react';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';

const API_BASE_URL = 'http://localhost:3001/api/v1';

type CalendarViewMode = 'MONTH' | 'WEEK' | 'DAY';

type CurrentTenant = {
    id: string;
    name: string;
    logoUrl?: string | null;
};

type TenantLogoBadgeProps = {
    tenant: CurrentTenant | null;
    wrapperClassName: string;
    imageClassName: string;
    fallbackClassName: string;
};

type LessonEvent = {
    id: string;
    eventType: string;
    eventTypeLabel: string;
    title: string;
    description?: string | null;
    notifyStudents: boolean;
    notifyGuardians: boolean;
    notifyByEmail: boolean;
    isStandaloneNotice?: boolean;
};

type AssessmentStudent = {
    studentId: string;
    enrollmentId: string;
    studentName: string;
    studentEmail?: string | null;
    guardiansCount: number;
    score: number | null;
    remarks?: string | null;
    releasedAt?: string | null;
};

type LessonAssessmentPayload = {
    lessonEvent: {
        id: string;
        eventType: string;
        eventTypeLabel: string;
        title: string;
        description?: string | null;
    };
    lessonItem: {
        id: string;
        lessonDate: string;
        startTime: string;
        endTime: string;
        subjectName: string;
        teacherName: string;
        seriesName: string;
        className: string;
        schoolYearId: string;
        seriesClassId: string;
    };
    assessment: {
        id: string;
        title: string;
        description?: string | null;
        maxScore?: number | null;
        notifyStudents: boolean;
        notifyGuardians: boolean;
        notifyByEmail: boolean;
        lastNotifiedAt?: string | null;
    } | null;
    students: AssessmentStudent[];
    notificationsCreated?: number;
    emailSent?: boolean;
};

type LessonAttendanceStudent = {
    studentId: string;
    enrollmentId: string;
    studentName: string;
    studentEmail?: string | null;
    status?: 'PRESENTE' | 'FALTOU' | null;
    notes?: string | null;
    recordedAt?: string | null;
};

type LessonAttendancePayload = {
    lessonItem: {
        id: string;
        lessonDate: string;
        startTime: string;
        endTime: string;
        subjectName: string;
        teacherName: string;
        seriesName: string;
        className: string;
        shift?: string | null;
    };
    summary: {
        totalStudents: number;
        totalPresentes: number;
        totalFaltou: number;
    };
    students: LessonAttendanceStudent[];
    notificationsCreated?: number;
    preparedNextLessonItemId?: string | null;
};

type AttendanceFeedbackState = {
    notificationsCreated: number;
    notifyStudents: boolean;
    notifyGuardians: boolean;
};

type ExpandedDayModalState = {
    date: string;
    items: CalendarAgendaItem[];
};

type CalendarAgendaItem = {
    id: string;
    lessonDate: string;
    dateLabel: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    displayTimeLabel?: string;
    subjectName: string;
    teacherName: string;
    seriesName: string;
    className: string;
    shift?: string | null;
    hasEvents: boolean;
    events: LessonEvent[];
    isStandaloneNotice?: boolean;
    schoolYearId?: string | null;
    seriesClassId?: string | null;
    teacherSubjectId?: string | null;
    hasAttendance?: boolean;
};

type CalendarAgendaResponse = {
    view: CalendarViewMode;
    selectedDate: string;
    rangeStart: string;
    rangeEnd: string;
    totalItems: number;
    totalDaysWithLessons: number;
    items: CalendarAgendaItem[];
};

type EventFormState = {
    title: string;
    description: string;
    notifyStudents: boolean;
    notifyGuardians: boolean;
    notifyByEmail: boolean;
};

type StandaloneNoticeTarget = {
    key: string;
    schoolYearId: string;
    schoolYearLabel: string;
    seriesClassId: string;
    teacherSubjectId: string;
    subjectName: string;
    seriesName: string;
    className: string;
    shift?: string | null;
    label: string;
};

type LessonEventModalState = {
    mode: 'lesson';
    lessonItem: CalendarAgendaItem;
    eventType: string;
    existingEvent: LessonEvent | null;
};

type StandaloneEventModalState = {
    mode: 'standalone';
    selectedDate: string;
    existingEvent: LessonEvent | null;
    targetKey: string;
};

type EventModalState = LessonEventModalState | StandaloneEventModalState;

const EVENT_TYPE_OPTIONS = [
    { value: 'PROVA', label: 'Prova', tone: 'bg-red-50 text-red-700 border-red-200' },
    { value: 'TRABALHO', label: 'Trabalho', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
    { value: 'RECADO', label: 'Recado', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
    { value: 'FALTA_PROFESSOR', label: 'Falta', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
] as const;

const WEEKDAY_LABELS = ['SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.', 'DOM.'];

const VIEW_MODE_OPTIONS = [
    { value: 'MONTH', label: 'Mês' },
    { value: 'WEEK', label: 'Semana' },
    { value: 'DAY', label: 'Dia' },
] as const;

const DEFAULT_EVENT_FORM: EventFormState = {
    title: '',
    description: '',
    notifyStudents: true,
    notifyGuardians: true,
    notifyByEmail: true,
};

type AssessmentFormState = {
    title: string;
    description: string;
    maxScore: string;
    notifyStudents: boolean;
    notifyGuardians: boolean;
    notifyByEmail: boolean;
    students: Array<{
        studentId: string;
        studentName: string;
        studentEmail?: string | null;
        guardiansCount: number;
        score: string;
        remarks: string;
        releasedAt?: string | null;
    }>;
};

type AttendanceFormState = {
    notifyStudents: boolean;
    notifyGuardians: boolean;
    students: Array<{
        studentId: string;
        studentName: string;
        studentEmail?: string | null;
        status: 'PRESENTE' | 'FALTOU' | null;
        notes: string;
    }>;
};

const DEFAULT_ASSESSMENT_FORM: AssessmentFormState = {
    title: '',
    description: '',
    maxScore: '10',
    notifyStudents: true,
    notifyGuardians: true,
    notifyByEmail: true,
    students: [],
};

const DEFAULT_ATTENDANCE_FORM: AttendanceFormState = {
    notifyStudents: true,
    notifyGuardians: true,
    students: [],
};

const TODAY_DATE_KEY = new Date().toISOString().slice(0, 10);

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

function addDays(value: Date, amount: number) {
    const next = new Date(value);
    next.setDate(next.getDate() + amount);
    return next;
}

function canManageAttendance(lessonDate: string) {
    return lessonDate <= TODAY_DATE_KEY;
}

function addMonths(value: Date, amount: number) {
    const next = new Date(value);
    next.setDate(1);
    next.setMonth(next.getMonth() + amount);
    return next;
}

function startOfWeek(value: Date) {
    const next = new Date(value);
    const day = next.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    next.setDate(next.getDate() + diff);
    next.setHours(0, 0, 0, 0);
    return next;
}

function isSameDate(left: string, right: string) {
    return left === right;
}

function getMonthLabel(value: string) {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(parseDateOnly(value));
}

function getDayPillLabel(value: string) {
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(parseDateOnly(value));
}

function getMonthBeforeDayLabel(value: string) {
    return new Intl.DateTimeFormat('pt-BR', { month: 'short', day: '2-digit' })
        .format(parseDateOnly(value))
        .replace('.', '')
        .toUpperCase();
}

function getFullDateLabel(value: string) {
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(parseDateOnly(value));
}

function getYearMonthLabel(year: string, month: string) {
    const parsedYear = Number.parseInt(year, 10);
    const parsedMonth = Number.parseInt(month, 10);
    const safeYear = Number.isNaN(parsedYear) ? new Date().getFullYear() : parsedYear;
    const safeMonth = Number.isNaN(parsedMonth) ? 0 : parsedMonth - 1;
    const date = new Date(safeYear, safeMonth, 1);
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
}

function hasProvaScheduled(items: CalendarAgendaItem[]) {
    return items.some((item) => item.events.some((event) => event.eventType === 'PROVA'));
}

function formatNumericInput(value?: number | null) {
    if (value === null || value === undefined || Number.isNaN(value)) return '';
    return String(value).replace('.', ',');
}

function getCardTone(item: CalendarAgendaItem) {
    if (item.isStandaloneNotice) return 'border-red-500 bg-red-100/90';
    if (item.events.some((event) => event.eventType === 'PROVA')) return 'border-red-200 bg-red-50/70';
    if (item.events.some((event) => event.eventType === 'TRABALHO')) return 'border-amber-200 bg-amber-50/70';
    if (item.events.some((event) => event.eventType === 'RECADO')) return 'border-blue-200 bg-blue-50/70';
    if (item.events.some((event) => event.eventType === 'FALTA_PROFESSOR')) return 'border-slate-300 bg-slate-100';
    return 'border-emerald-200 bg-emerald-50/60';
}

function getLabelClasses(item: CalendarAgendaItem) {
    if (item.isStandaloneNotice) {
        return 'inline-flex w-full items-center justify-center rounded-full bg-rose-600 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white shadow-[0_0_8px_rgba(220,38,38,0.60)]';
    }

    return 'inline-flex items-center justify-center rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-700';
}

function TenantLogoBadge({ tenant, wrapperClassName, imageClassName, fallbackClassName }: TenantLogoBadgeProps) {
    return (
        <div className={wrapperClassName}>
            {tenant?.logoUrl ? (
                // Tenant logos are configured dynamically per school and may come from arbitrary remote hosts.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenant.logoUrl} alt={`Logo de ${tenant.name}`} className={imageClassName} />
            ) : (
                <span className={fallbackClassName}>
                    {String(tenant?.name || 'ESCOLA').slice(0, 3).toUpperCase()}
                </span>
            )}
        </div>
    );
}

export default function CalendarioAulasPage() {
    const [tenant, setTenant] = useState<CurrentTenant | null>(null);
    const [viewMode, setViewMode] = useState<CalendarViewMode>('MONTH');
    const [referenceDate, setReferenceDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [calendarData, setCalendarData] = useState<CalendarAgendaResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [modalState, setModalState] = useState<EventModalState | null>(null);
    const [actionPickerItem, setActionPickerItem] = useState<CalendarAgendaItem | null>(null);
    const [expandedDayModal, setExpandedDayModal] = useState<ExpandedDayModalState | null>(null);
    const [formState, setFormState] = useState<EventFormState>(DEFAULT_EVENT_FORM);
    const [standaloneTargets, setStandaloneTargets] = useState<StandaloneNoticeTarget[]>([]);
    const [standaloneTargetsLoading, setStandaloneTargetsLoading] = useState(false);
    const [assessmentModal, setAssessmentModal] = useState<{
        lessonItem: CalendarAgendaItem;
        event: LessonEvent;
    } | null>(null);
    const [assessmentForm, setAssessmentForm] = useState<AssessmentFormState>(DEFAULT_ASSESSMENT_FORM);
    const [assessmentLoading, setAssessmentLoading] = useState(false);
    const [assessmentSaving, setAssessmentSaving] = useState(false);
    const [attendanceModal, setAttendanceModal] = useState<{
        lessonItem: CalendarAgendaItem;
        summary: LessonAttendancePayload['summary'];
    } | null>(null);
    const [completedAttendanceLessonIds, setCompletedAttendanceLessonIds] = useState<string[]>([]);
    const [attendanceForm, setAttendanceForm] = useState<AttendanceFormState>(DEFAULT_ATTENDANCE_FORM);
    const [attendanceLoading, setAttendanceLoading] = useState(false);
    const [attendanceSaving, setAttendanceSaving] = useState(false);
    const [attendanceFeedback, setAttendanceFeedback] = useState<AttendanceFeedbackState | null>(null);
    const [confirmationDialog, setConfirmationDialog] = useState<{
        kind: 'event' | 'attendance';
        title: string;
        message: string;
    } | null>(null);
    const today = new Date();
    const [selectedYear, setSelectedYear] = useState<string>(String(today.getFullYear()));
    const [selectedMonth, setSelectedMonth] = useState<string>(String(today.getMonth() + 1).padStart(2, '0'));
    const teacherDisplayName = useMemo(() => {
        if (!calendarData) return null;
        return calendarData.items?.[0]?.teacherName || null;
    }, [calendarData]);

    const loadCalendar = async (nextReferenceDate: string, nextViewMode: CalendarViewMode) => {
        try {
            setLoading(true);
            setErrorMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const [tenantResponse, calendarResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/tenants/current`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_BASE_URL}/lesson-events/my-calendar?referenceDate=${nextReferenceDate}&view=${nextViewMode}`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);

            const tenantData = await tenantResponse.json().catch(() => null);
            if (!tenantResponse.ok) {
                throw new Error(tenantData?.message || 'Não foi possível carregar a escola logada.');
            }

            const agendaData = await calendarResponse.json().catch(() => null);
            if (!calendarResponse.ok) {
                throw new Error(agendaData?.message || 'Não foi possível carregar o calendário do professor.');
            }

            setTenant(tenantData);
            setCalendarData(agendaData);
            setCompletedAttendanceLessonIds((current) => (
                Array.from(new Set([
                    ...current,
                    ...((agendaData?.items || [])
                        .filter((item: CalendarAgendaItem) => item.hasAttendance)
                        .map((item: CalendarAgendaItem) => item.id)),
                ]))
            ));
            setSelectedDate((current) => (
                current >= agendaData.rangeStart && current <= agendaData.rangeEnd
                    ? current
                    : agendaData.selectedDate
            ));
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar o calendário do professor.');
        } finally {
            setLoading(false);
        }
    };

    const loadStandaloneTargets = async () => {
        try {
            setStandaloneTargetsLoading(true);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const response = await fetch(`${API_BASE_URL}/lesson-events/standalone-targets`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível carregar as turmas para aviso avulso.');
            }

            setStandaloneTargets(Array.isArray(data) ? data : []);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar as turmas para aviso avulso.');
        } finally {
            setStandaloneTargetsLoading(false);
        }
    };

    useEffect(() => {
        void loadCalendar(referenceDate, viewMode);
    }, [referenceDate, viewMode]);

    useEffect(() => {
        void loadStandaloneTargets();
    }, []);

    useEffect(() => {
        if (!modalState) {
            setFormState(DEFAULT_EVENT_FORM);
            return;
        }

        setFormState({
            title: modalState.existingEvent?.title || '',
            description: modalState.existingEvent?.description || '',
            notifyStudents: modalState.existingEvent?.notifyStudents ?? true,
            notifyGuardians: modalState.existingEvent?.notifyGuardians ?? true,
            notifyByEmail: modalState.existingEvent?.notifyByEmail ?? true,
        });
    }, [modalState]);

    useEffect(() => {
        if (!assessmentModal) {
            setAssessmentForm(DEFAULT_ASSESSMENT_FORM);
        }
    }, [assessmentModal]);

    useEffect(() => {
        if (!attendanceModal) {
            setAttendanceForm(DEFAULT_ATTENDANCE_FORM);
            setAttendanceFeedback(null);
        }
    }, [attendanceModal]);

    const itemsByDate = useMemo(() => {
        const grouped = new Map<string, CalendarAgendaItem[]>();
        (calendarData?.items || []).forEach((item) => {
            const current = grouped.get(item.lessonDate) || [];
            current.push(item);
            grouped.set(item.lessonDate, current);
        });
        return grouped;
    }, [calendarData]);

    const fallbackStandaloneTargets = useMemo(() => {
        const uniqueTargets = new Map<string, StandaloneNoticeTarget>();
        (calendarData?.items || []).forEach((item) => {
            if (item.isStandaloneNotice || !item.schoolYearId || !item.seriesClassId || !item.teacherSubjectId) {
                return;
            }

            const key = `${item.schoolYearId}:${item.seriesClassId}:${item.teacherSubjectId}`;
            if (uniqueTargets.has(key)) {
                return;
            }

            uniqueTargets.set(key, {
                key,
                schoolYearId: item.schoolYearId,
                schoolYearLabel: '',
                seriesClassId: item.seriesClassId,
                teacherSubjectId: item.teacherSubjectId,
                subjectName: item.subjectName,
                seriesName: item.seriesName,
                className: item.className,
                shift: item.shift || null,
                label: `${item.seriesName} - ${item.className} • ${item.subjectName}`,
            });
        });

        return Array.from(uniqueTargets.values());
    }, [calendarData]);

    const availableStandaloneTargets = standaloneTargets.length ? standaloneTargets : fallbackStandaloneTargets;

    const selectedDayItems = useMemo(() => itemsByDate.get(selectedDate) || [], [itemsByDate, selectedDate]);
    const selectedDayHasProva = useMemo(
        () => hasProvaScheduled(selectedDayItems),
        [selectedDayItems],
    );
    const selectedStandaloneTarget = useMemo(() => {
        if (!modalState || modalState.mode !== 'standalone') return null;
        return availableStandaloneTargets.find((target) => target.key === modalState.targetKey) || null;
    }, [availableStandaloneTargets, modalState]);

const monthGridDays = useMemo(() => {
    if (!calendarData) return [] as string[];
    const start = parseDateOnly(calendarData.rangeStart);
    const end = parseDateOnly(calendarData.rangeEnd);
        const days: string[] = [];
        let cursor = new Date(start);

        while (cursor <= end) {
            days.push(formatDateOnly(cursor));
            cursor = addDays(cursor, 1);
        }

    return days;
}, [calendarData]);

const availableYears = useMemo(() => {
    if (!calendarData) return [String(new Date().getFullYear())];
    const startYear = parseDateOnly(calendarData.rangeStart).getFullYear();
    const endYear = parseDateOnly(calendarData.rangeEnd).getFullYear();
    const years: string[] = [];
    for (let year = startYear; year <= endYear; year += 1) {
        years.push(String(year));
    }
    return years.length ? years : [String(new Date().getFullYear())];
}, [calendarData]);

const monthsForSelectedYear = useMemo(() => {
    if (!selectedYear) return [];
    return Array.from({ length: 12 }, (_, index) => {
        const monthValue = String(index + 1).padStart(2, '0');
        return {
            value: monthValue,
            label: getYearMonthLabel(selectedYear, monthValue),
        };
    });
}, [selectedYear]);

useEffect(() => {
    if (!availableYears.length) return;

    const referenceYear = referenceDate.split('-')[0] || '';
    const candidateYear = referenceYear && availableYears.includes(referenceYear)
        ? referenceYear
        : availableYears[0];

    if (candidateYear && candidateYear !== selectedYear) {
        setSelectedYear(candidateYear);
        const month = selectedMonth || referenceDate.split('-')[1] || '01';
        const nextReference = `${candidateYear}-${month}-01`;
        if (referenceDate !== nextReference) {
            setReferenceDate(nextReference);
        }
    }
}, [availableYears, referenceDate, selectedMonth, selectedYear]);

useEffect(() => {
    const referenceMonth = referenceDate.split('-')[1];
    if (referenceMonth && referenceMonth !== selectedMonth) {
        setSelectedMonth(referenceMonth);
    }
}, [referenceDate, selectedMonth]);

const handleYearChange = (value: string) => {
    setSelectedYear(value);
    const month = selectedMonth || referenceDate.split('-')[1] || '01';
    const nextReference = `${value}-${month}-01`;
    if (referenceDate !== nextReference) {
        setReferenceDate(nextReference);
    }
    setSelectedDate(nextReference);
};

const handleMonthChange = (value: string) => {
    setSelectedMonth(value);
    if (selectedYear) {
        const nextReference = `${selectedYear}-${value}-01`;
        if (referenceDate !== nextReference) {
            setReferenceDate(nextReference);
        }
        setSelectedDate(nextReference);
    }
};

    const currentPeriodLabel = useMemo(() => {
        if (viewMode === 'MONTH') {
            return getMonthLabel(referenceDate);
        }

        if (viewMode === 'WEEK') {
            const rangeStart = calendarData?.rangeStart || formatDateOnly(startOfWeek(parseDateOnly(referenceDate)));
            const rangeEnd = calendarData?.rangeEnd || formatDateOnly(addDays(parseDateOnly(rangeStart), 6));
            return `${getDayPillLabel(rangeStart)} - ${getDayPillLabel(rangeEnd)}`;
        }

        return getFullDateLabel(selectedDate);
    }, [calendarData, referenceDate, selectedDate, viewMode]);

    const handleViewModeChange = (nextViewMode: CalendarViewMode) => {
        if (nextViewMode === viewMode) return;

        setViewMode(nextViewMode);

        const anchorDate = nextViewMode === 'MONTH'
            ? formatDateOnly(new Date(parseDateOnly(selectedDate).getFullYear(), parseDateOnly(selectedDate).getMonth(), 1))
            : selectedDate;

        if (referenceDate !== anchorDate) {
            setReferenceDate(anchorDate);
        }
    };

    const handleNavigatePeriod = (direction: -1 | 1) => {
        const baseDate = parseDateOnly(referenceDate);
        const nextDate = viewMode === 'MONTH'
            ? addMonths(baseDate, direction)
            : addDays(baseDate, viewMode === 'WEEK' ? direction * 7 : direction);
        const nextReferenceDate = viewMode === 'MONTH'
            ? formatDateOnly(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1))
            : formatDateOnly(nextDate);

        setReferenceDate(nextReferenceDate);
        setSelectedDate(nextReferenceDate);
    };

    const handleGoToToday = () => {
        const todayDate = new Date();
        const todayKey = formatDateOnly(todayDate);
        const nextReferenceDate = viewMode === 'MONTH'
            ? formatDateOnly(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1))
            : todayKey;

        setReferenceDate(nextReferenceDate);
        setSelectedDate(todayKey);
    };

    const weekDays = useMemo(() => {
        const start = startOfWeek(parseDateOnly(selectedDate));
        return Array.from({ length: 7 }, (_, index) => formatDateOnly(addDays(start, index)));
    }, [selectedDate]);

    const eventTypeLabel = useMemo(() => {
        if (!modalState) return '';
        if (modalState.mode === 'standalone') return 'Recado';
        return EVENT_TYPE_OPTIONS.find((option) => option.value === modalState.eventType)?.label || 'Evento';
    }, [modalState]);

    const handleOpenEventModal = (lessonItem: CalendarAgendaItem, eventType: string) => {
        const existingEvent = lessonItem.events.find((event) => event.eventType === eventType) || null;
        setActionPickerItem(null);
        setModalState({ mode: 'lesson', lessonItem, eventType, existingEvent });
    };

    const handleOpenStandaloneNoticeModal = (date: string, item?: CalendarAgendaItem) => {
        if (!availableStandaloneTargets.length && !item?.teacherSubjectId) {
            setErrorMessage('Nenhuma turma/disciplina disponível para aviso avulso.');
            return;
        }

        setActionPickerItem(null);
        setStatusMessage(null);
        setErrorMessage(null);

        const standaloneEvent = item?.events[0] || null;
        const fallbackTarget = item?.teacherSubjectId && item.seriesClassId && item.schoolYearId
            ? `${item.schoolYearId}:${item.seriesClassId}:${item.teacherSubjectId}`
            : availableStandaloneTargets[0]?.key || '';

        setModalState({
            mode: 'standalone',
            selectedDate: date,
            existingEvent: standaloneEvent,
            targetKey: fallbackTarget,
        });
    };

    const handleOpenExpandedDayModal = (date: string, items: CalendarAgendaItem[]) => {
        setExpandedDayModal({
            date,
            items,
        });
    };

    const handleOpenAssessmentModal = async (lessonItem: CalendarAgendaItem, event: LessonEvent) => {
        try {
            setAssessmentModal({ lessonItem, event });
            setAssessmentLoading(true);
            setErrorMessage(null);
            setStatusMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const response = await fetch(`${API_BASE_URL}/lesson-assessments/by-event/${event.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const data: LessonAssessmentPayload | { message?: string } | null = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error((data as { message?: string } | null)?.message || 'Não foi possível carregar os alunos da avaliação.');
            }

            const payload = data as LessonAssessmentPayload;
            setAssessmentForm({
                title: payload.assessment?.title || payload.lessonEvent.title || '',
                description: payload.assessment?.description || payload.lessonEvent.description || '',
                maxScore: formatNumericInput(payload.assessment?.maxScore ?? 10),
                notifyStudents: payload.assessment?.notifyStudents ?? true,
                notifyGuardians: payload.assessment?.notifyGuardians ?? true,
                notifyByEmail: payload.assessment?.notifyByEmail ?? true,
                students: payload.students.map((student) => ({
                    studentId: student.studentId,
                    studentName: student.studentName,
                    studentEmail: student.studentEmail,
                    guardiansCount: student.guardiansCount,
                    score: formatNumericInput(student.score),
                    remarks: student.remarks || '',
                    releasedAt: student.releasedAt || null,
                })),
            });
            setActionPickerItem(null);
        } catch (error) {
            setAssessmentModal(null);
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar os alunos da avaliação.');
        } finally {
            setAssessmentLoading(false);
        }
    };

    const handleOpenAttendanceModal = async (lessonItem: CalendarAgendaItem) => {
        if (!canManageAttendance(lessonItem.lessonDate)) {
            setErrorMessage('Não é permitido fazer chamada para aulas com data maior que hoje.');
            setActionPickerItem(null);
            return;
        }

        try {
            setAttendanceModal({
                lessonItem,
                summary: {
                    totalStudents: 0,
                    totalPresentes: 0,
                    totalFaltou: 0,
                },
            });
            setAttendanceLoading(true);
            setAttendanceFeedback(null);
            setErrorMessage(null);
            setStatusMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const response = await fetch(`${API_BASE_URL}/lesson-attendances/by-lesson-item/${lessonItem.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const data: LessonAttendancePayload | { message?: string } | null = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error((data as { message?: string } | null)?.message || 'Não foi possível carregar a chamada da aula.');
            }

            const payload = data as LessonAttendancePayload;
            setAttendanceModal({
                lessonItem,
                summary: payload.summary,
            });
            setAttendanceForm({
                notifyStudents: true,
                notifyGuardians: true,
                students: payload.students.map((student) => ({
                    studentId: student.studentId,
                    studentName: student.studentName,
                    studentEmail: student.studentEmail,
                    status: student.status || null,
                    notes: student.notes || '',
                })),
            });
            setActionPickerItem(null);
        } catch (error) {
            setAttendanceModal(null);
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar a chamada da aula.');
        } finally {
            setAttendanceLoading(false);
        }
    };

    const handleSaveEvent = async () => {
        if (!modalState) return;

        try {
            setSaving(true);
            setErrorMessage(null);
            setStatusMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const currentState = modalState;
            const isStandalone = currentState.mode === 'standalone';
            const standaloneTarget = isStandalone
                ? availableStandaloneTargets.find((target) => target.key === currentState.targetKey) || null
                : null;
            if (isStandalone && !standaloneTarget) {
                throw new Error('Selecione a turma/disciplina do aviso avulso.');
            }

            const response = await fetch(
                currentState.existingEvent
                    ? `${API_BASE_URL}/lesson-events/${currentState.existingEvent.id}`
                    : isStandalone
                        ? `${API_BASE_URL}/lesson-events/standalone-notices`
                        : `${API_BASE_URL}/lesson-events`,
                {
                    method: currentState.existingEvent ? 'PATCH' : 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(
                        isStandalone
                            ? {
                                eventDate: currentState.selectedDate,
                                schoolYearId: standaloneTarget?.schoolYearId,
                                seriesClassId: standaloneTarget?.seriesClassId,
                                teacherSubjectId: standaloneTarget?.teacherSubjectId,
                                title: formState.title,
                                description: formState.description,
                                notifyStudents: formState.notifyStudents,
                                notifyGuardians: formState.notifyGuardians,
                                notifyByEmail: formState.notifyByEmail,
                            }
                            : {
                                lessonCalendarItemId: currentState.lessonItem.id,
                                eventType: currentState.eventType,
                                title: formState.title,
                                description: formState.description,
                                notifyStudents: formState.notifyStudents,
                                notifyGuardians: formState.notifyGuardians,
                                notifyByEmail: formState.notifyByEmail,
                            },
                    ),
                },
            );

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível salvar o evento da aula.');
            }

            const eventTitleLabel = formState.title?.trim()
                || (isStandalone ? 'Recado avulso' : eventTypeLabel);
            const successText = currentState.existingEvent
                ? `${eventTitleLabel} atualizado com sucesso.`
                : `${eventTitleLabel} lançado com sucesso.`;

            setStatusMessage(successText);
            await loadCalendar(referenceDate, viewMode);

            if (!currentState.existingEvent) {
                setConfirmationDialog({
                    kind: 'event',
                    title: eventTitleLabel,
                    message: `Clique em confirmar para fechar a tela e ver "${eventTitleLabel}" na sua agenda.`,
                });
                return;
            }

            setModalState(null);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível salvar o evento.');
        } finally {
            setSaving(false);
        }
    };

    const handleConfirmDialog = () => {
        const kind = confirmationDialog?.kind;
        setConfirmationDialog(null);
        if (kind === 'attendance') {
            setAttendanceModal(null);
            setActionPickerItem(null);
            return;
        }

        setModalState(null);
    };

    const handleSaveAttendance = async () => {
        if (!attendanceModal) return;

        try {
            setAttendanceSaving(true);
            setErrorMessage(null);
            setStatusMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const attendances = attendanceForm.students
                .filter((student) => student.status)
                .map((student) => ({
                    studentId: student.studentId,
                    status: student.status,
                    notes: student.notes,
                }));

            if (!attendances.length) {
                throw new Error('Marque pelo menos um aluno como PRESENTE ou FALTOU.');
            }

            const response = await fetch(`${API_BASE_URL}/lesson-attendances/by-lesson-item/${attendanceModal.lessonItem.id}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    attendances,
                    notifyStudents: attendanceForm.notifyStudents,
                    notifyGuardians: attendanceForm.notifyGuardians,
                }),
            });

            const data: LessonAttendancePayload | { message?: string } | null = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error((data as { message?: string } | null)?.message || 'Não foi possível salvar a chamada da aula.');
            }

            const payload = data as LessonAttendancePayload;
            setCompletedAttendanceLessonIds((current) => (
                Array.from(new Set([
                    ...current,
                    attendanceModal.lessonItem.id,
                    ...(payload.preparedNextLessonItemId ? [payload.preparedNextLessonItemId] : []),
                ]))
            ));
            const nextNotifyStudents = attendanceForm.notifyStudents;
            const nextNotifyGuardians = attendanceForm.notifyGuardians;
            setAttendanceModal({
                lessonItem: attendanceModal.lessonItem,
                summary: payload.summary,
            });
            setAttendanceForm({
                notifyStudents: nextNotifyStudents,
                notifyGuardians: nextNotifyGuardians,
                students: payload.students.map((student) => ({
                    studentId: student.studentId,
                    studentName: student.studentName,
                    studentEmail: student.studentEmail,
                    status: student.status || null,
                    notes: student.notes || '',
                })),
            });
            const notificationsCreated = payload.notificationsCreated || 0;
            setAttendanceFeedback({
                notificationsCreated,
                notifyStudents: nextNotifyStudents,
                notifyGuardians: nextNotifyGuardians,
            });

            const channels: string[] = [];
            if (nextNotifyStudents) channels.push('alunos');
            if (nextNotifyGuardians) channels.push('responsáveis');

            setStatusMessage(
                !channels.length
                    ? 'Chamada da aula salva com sucesso, sem envio de notificação.'
                    : notificationsCreated > 0
                        ? `Chamada da aula salva com sucesso. ${notificationsCreated} aviso(s) criado(s) para ${channels.join(' e ')}.`
                        : `Chamada da aula salva com sucesso. Nenhuma notificação foi criada para ${channels.join(' e ')}.`,
            );
            setConfirmationDialog({
                kind: 'attendance',
                title: 'Chamada gravada com sucesso',
                message: 'Clique em confirmar para fechar esta tela e voltar para a tela anterior.',
            });
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível salvar a chamada da aula.');
        } finally {
            setAttendanceSaving(false);
        }
    };

    const handleRemoveEvent = async () => {
        if (!modalState?.existingEvent) return;

        try {
            setSaving(true);
            setErrorMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const response = await fetch(`${API_BASE_URL}/lesson-events/${modalState.existingEvent.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível remover o evento da aula.');
            }

            setStatusMessage('Evento da aula desativado com sucesso.');
            setModalState(null);
            await loadCalendar(referenceDate, viewMode);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível remover o evento da aula.');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveAssessment = async () => {
        if (!assessmentModal) return;

        try {
            setAssessmentSaving(true);
            setErrorMessage(null);
            setStatusMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const response = await fetch(`${API_BASE_URL}/lesson-assessments/by-event/${assessmentModal.event.id}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: assessmentForm.title,
                    description: assessmentForm.description,
                    maxScore: assessmentForm.maxScore,
                    notifyStudents: assessmentForm.notifyStudents,
                    notifyGuardians: assessmentForm.notifyGuardians,
                    notifyByEmail: assessmentForm.notifyByEmail,
                    grades: assessmentForm.students.map((student) => ({
                        studentId: student.studentId,
                        score: student.score,
                        remarks: student.remarks,
                    })),
                }),
            });

            const data: LessonAssessmentPayload | { message?: string } | null = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error((data as { message?: string } | null)?.message || 'Não foi possível salvar as notas.');
            }

            const payload = data as LessonAssessmentPayload;
            setStatusMessage(
                `Notas salvas com sucesso.${payload.notificationsCreated ? ` ${payload.notificationsCreated} aviso(s) criado(s).` : ''}${payload.emailSent ? ' E-mail processado.' : ''}`,
            );
            setAssessmentModal(null);
            await loadCalendar(referenceDate, viewMode);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível salvar as notas.');
        } finally {
            setAssessmentSaving(false);
        }
    };

    const renderLessonChip = (item: CalendarAgendaItem, compact = false) => (
        <button
            key={item.id}
            type="button"
            onClick={() => {
                setSelectedDate(item.lessonDate);
                if (item.isStandaloneNotice) {
                    handleOpenStandaloneNoticeModal(item.lessonDate, item);
                    return;
                }

                setActionPickerItem(item);
            }}
            className={`w-full rounded-xl border px-3 py-2 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${getCardTone(item)} ${compact ? 'text-xs' : 'text-sm'}`}
        >
            <div className="font-black uppercase tracking-[0.08em] text-slate-700">
                <span className={getLabelClasses(item)}>{item.displayTimeLabel || `${item.startTime} - ${item.endTime}`}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
                <div className="font-bold text-slate-800">{item.subjectName}</div>
                {canManageAttendance(item.lessonDate) ? (
                    (item.hasAttendance || completedAttendanceLessonIds.includes(item.id)) ? (
                        <span
                            title="Chamada já realizada nesta aula"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-sm"
                        >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M20 6 9 17l-5-5" />
                            </svg>
                        </span>
                    ) : (
                        <span
                            title="AGUARDANDO CHAMADA"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-600 shadow-sm"
                        >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 7v5l3 2" />
                            </svg>
                        </span>
                    )
                ) : null}
            </div>
            <div className="mt-1 truncate font-medium text-slate-500">
                {item.seriesName} - {item.className}
            </div>
        </button>
    );

    return (
        <div className="mx-auto mt-6 max-w-[1680px] space-y-6">
            <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
                <div className="bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.18),_transparent_45%),linear-gradient(135deg,#eff6ff_0%,#ffffff_42%,#f8fafc_100%)] px-8 py-8">
                    <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex items-center gap-5">
                            <TenantLogoBadge
                                tenant={tenant}
                                wrapperClassName="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.10)]"
                                imageClassName="h-full w-full object-contain p-3"
                                fallbackClassName="text-lg font-black tracking-[0.25em] text-[#153a6a]"
                            />
                            <div>
                                <div className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">Calendário Aulas</div>
                                <h1 className="mt-2 text-3xl font-extrabold text-[#153a6a]">{teacherDisplayName || 'Professor'}</h1>
                                <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">
                                    Visualize sua grade anual em calendário expandido, com horários reais da aula, eventos lançados e navegação por mês, semana ou dia.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="px-8 py-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                                <div className="flex flex-wrap gap-1">
                                    {VIEW_MODE_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => handleViewModeChange(option.value)}
                                            className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition ${
                                                viewMode === option.value
                                                    ? 'bg-blue-600 text-white shadow-sm'
                                                    : 'text-slate-500 hover:bg-slate-100 hover:text-blue-700'
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                                <button
                                    type="button"
                                    onClick={() => handleNavigatePeriod(-1)}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                                >
                                    Anterior
                                </button>
                                <button
                                    type="button"
                                    onClick={handleGoToToday}
                                    className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-blue-700"
                                >
                                    Hoje
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleNavigatePeriod(1)}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                                >
                                    Próximo
                                </button>
                            </div>

                            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 shadow-sm">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Período ativo</div>
                                <div className="mt-1 text-sm font-bold text-blue-900">{currentPeriodLabel}</div>
                            </div>

                            {viewMode === 'MONTH' ? (
                                <>
                                    <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                        Ano
                                        <select
                                            value={selectedYear}
                                            onChange={(event) => handleYearChange(event.target.value)}
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
                                            onChange={(event) => handleMonthChange(event.target.value)}
                                            className="mt-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400"
                                            disabled={!monthsForSelectedYear.length}
                                        >
                                            {monthsForSelectedYear.map((option) => (
                                                <option key={`${selectedYear}-${option.value}`} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </>
                            ) : null}
                        </div>

                        <div className="flex justify-end">
                            <Link
                                href="/principal"
                                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                            >
                                Voltar ao painel
                            </Link>
                        </div>
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Aulas no período</div>
                            <div className="mt-2 text-2xl font-extrabold text-slate-800">{calendarData?.totalItems || 0}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Dias com aula</div>
                            <div className="mt-2 text-2xl font-extrabold text-slate-800">{calendarData?.totalDaysWithLessons || 0}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Dia selecionado</div>
                            <div className="mt-2 text-base font-extrabold text-slate-800">{getFullDateLabel(selectedDate)}</div>
                            <div className="mt-1 text-sm font-medium text-slate-500">{selectedDayItems.length} aula(s) nesta data</div>
                            {selectedDayHasProva ? (
                                <div className="mt-3 inline-flex w-full items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-red-700">
                                    <span>* DIA DE PROVA</span>
                                    <strong className="text-[11px] font-black text-red-700">EVITE DUPLICAR</strong>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {statusMessage ? (
                        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-700">
                            {statusMessage}
                        </div>
                    ) : null}

                    {errorMessage ? (
                        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-bold text-red-600">
                            {errorMessage}
                        </div>
                    ) : null}

                    <div className="mt-6">
                        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
                            {loading ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm font-medium text-slate-500">
                                    Carregando calendário do professor...
                                </div>
                            ) : null}

                            {!loading && viewMode === 'MONTH' ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-7 gap-3">
                                        {WEEKDAY_LABELS.map((label) => (
                                            <div key={label} className="rounded-xl bg-white px-3 py-2 text-center text-xs font-black uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                                                {label}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="overflow-x-auto">
                                        <div className="grid min-w-[1180px] grid-cols-7 gap-3 xl:min-w-0">
                                            {monthGridDays.map((day) => {
                                                const dayItems = itemsByDate.get(day) || [];
                                                const isCurrentMonth = parseDateOnly(day).getMonth() === parseDateOnly(referenceDate).getMonth();
                                                const isSelected = isSameDate(day, selectedDate);
                                                const hasProvaToday = hasProvaScheduled(dayItems);

                                                return (
                                                    <div
                                                        key={day}
                                                        className={`flex min-h-[190px] flex-col rounded-[24px] border p-3 text-left transition ${
                                                            isSelected
                                                                ? 'border-blue-300 bg-blue-50 shadow-sm ring-2 ring-blue-100'
                                                                : isCurrentMonth
                                                                    ? 'border-slate-200 bg-white hover:border-blue-200'
                                                                    : 'border-slate-200 bg-slate-100/70 text-slate-400 hover:border-blue-200'
                                                        }`}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedDate(day)}
                                                            className="flex items-center justify-between rounded-xl text-left outline-none transition hover:opacity-90"
                                                        >
                                                            <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                                                                {getMonthBeforeDayLabel(day)}
                                                            </span>
                                                        {dayItems.length ? (
                                                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                                                                {dayItems.length} aula(s)
                                                            </span>
                                                        ) : null}
                                                    </button>
                                                    {hasProvaToday ? (
                                                        <div className="mt-2 inline-flex items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-red-700">
                                                            * DIA DE PROVA
                                                        </div>
                                                    ) : null}

                                                    <div className="mt-3 flex flex-1 flex-col gap-2">
                                                            {dayItems.slice(0, 4).map((item) => renderLessonChip(item, true))}
                                                            {dayItems.length > 4 ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenExpandedDayModal(day, dayItems)}
                                                                    className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-slate-500 transition hover:border-blue-300 hover:text-blue-700"
                                                                >
                                                                    +{dayItems.length - 4} aula(s)
                                                                </button>
                                                            ) : null}
                                                            {!dayItems.length ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenStandaloneNoticeModal(day)}
                                                            className="inline-flex items-center justify-center rounded-full border border-blue-600 bg-blue-600 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white shadow-sm transition hover:bg-blue-700 min-w-[120px]"
                                                        >
                                                            Lançar Aviso Extra
                                                        </button>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            {!loading && viewMode === 'WEEK' ? (
                                <div className="overflow-x-auto">
                                    <div className="grid min-w-[1180px] grid-cols-7 gap-4 xl:min-w-0">
                                        {weekDays.map((day) => {
                                            const dayItems = itemsByDate.get(day) || [];
                                            const isSelected = isSameDate(day, selectedDate);
                                            const hasProvaThisDay = hasProvaScheduled(dayItems);
                                            return (
                                                <div
                                                    key={day}
                                                    className={`rounded-[24px] border p-4 ${isSelected ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white'}`}
                                                >
                                                    <button type="button" onClick={() => setSelectedDate(day)} className="w-full text-left">
                                                        <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
                                                            {getMonthBeforeDayLabel(day)} • {getDayPillLabel(day)}
                                                        </div>
                                                        <div className="mt-1 text-sm font-bold text-slate-500">
                                                            {dayItems.length} aula(s)
                                                        </div>
                                                    </button>
                                                    {hasProvaThisDay ? (
                                                        <div className="mt-2 inline-flex items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-red-700">
                                                            * DIA DE PROVA
                                                        </div>
                                                    ) : null}

                                                    <div className="mt-4 space-y-2">
                                                        {dayItems.length ? (
                                                            dayItems.map((item) => renderLessonChip(item, true))
                                                        ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenStandaloneNoticeModal(day)}
                                                    className="w-full rounded-full border border-blue-600 bg-blue-600 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-white shadow-sm transition hover:bg-blue-700"
                                                >
                                                    Lançar Aviso Extra
                                                </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : null}

                            {!loading && viewMode === 'DAY' ? (
                                <div className="space-y-4">
                                    <div className="rounded-[24px] border border-blue-100 bg-white px-5 py-4">
                                        <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Visão detalhada do dia</div>
                                        <div className="mt-2 text-2xl font-extrabold text-slate-800">{getFullDateLabel(selectedDate)}</div>
                                        <div className="mt-2 text-sm font-medium text-slate-500">
                                            Clique em cada aula para lançar prova, trabalho, recado ou falta do professor.
                                        </div>
                                    </div>

                                    {selectedDayItems.length ? (
                                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                            {selectedDayItems.map((item) => renderLessonChip(item))}
                                        </div>
                                    ) : (
                                        <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
                                            <div className="text-sm font-bold text-slate-700">Nenhuma aula encontrada nesta data.</div>
                                            <div className="mt-2 text-sm font-medium text-slate-500">
                                                Você ainda pode lançar um aviso extra para este dia.
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleOpenStandaloneNoticeModal(selectedDate)}
                                                className="mt-5 inline-flex rounded-full border border-blue-600 bg-blue-600 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-blue-700"
                                            >
                                                Lançar Aviso Extra
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>

                </div>
            </div>
            {modalState ? (
                <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
                <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl relative">
                        <div className="dashboard-band border-b px-6 py-5">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="flex items-center gap-4">
                                    <TenantLogoBadge
                                        tenant={tenant}
                                        wrapperClassName="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                                        imageClassName="h-full w-full object-contain p-1.5"
                                        fallbackClassName="text-sm font-black tracking-[0.25em] text-[#153a6a]"
                                    />
                                    <div>
                                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                                            {modalState.mode === 'lesson'
                                                ? `${modalState.lessonItem.dateLabel} • ${modalState.lessonItem.startTime} - ${modalState.lessonItem.endTime}`
                                                : getFullDateLabel(modalState.selectedDate)}
                                        </div>
                                        <h2 className="mt-2 text-2xl font-extrabold text-slate-800">
                                            {modalState.existingEvent ? `Editar ${eventTypeLabel}` : `Lançar ${eventTypeLabel}`}
                                        </h2>
                                        <p className="mt-2 text-sm font-medium text-slate-500">
                                            {modalState.mode === 'lesson'
                                                ? `${modalState.lessonItem.subjectName} • ${modalState.lessonItem.seriesName} - ${modalState.lessonItem.className}`
                                                : selectedStandaloneTarget
                                                    ? `${selectedStandaloneTarget.subjectName} • ${selectedStandaloneTarget.seriesName} - ${selectedStandaloneTarget.className}${selectedStandaloneTarget.shift ? ` • ${selectedStandaloneTarget.shift}` : ''}`
                                                    : 'Selecione a turma e a disciplina do aviso avulso.'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setModalState(null)}
                                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                    {modalState.mode === 'standalone' ? (
                                        <>
                                            <label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Turma e disciplina</label>
                                            <select
                                                value={modalState.targetKey}
                                                onChange={(event) =>
                                                    setModalState((current) => (
                                                        current && current.mode === 'standalone'
                                                            ? { ...current, targetKey: event.target.value }
                                                            : current
                                                    ))
                                                }
                                                disabled={!availableStandaloneTargets.length}
                                                className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                            >
                                                {availableStandaloneTargets.length ? (
                                                    availableStandaloneTargets.map((target) => (
                                                        <option key={target.key} value={target.key}>
                                                            {target.label}
                                                        </option>
                                                    ))
                                                ) : (
                                                    <option value="">Nenhuma turma/disciplina disponível</option>
                                                )}
                                            </select>
                                            <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-xs font-medium leading-5 text-blue-700">
                                                {standaloneTargetsLoading
                                                    ? 'Atualizando a lista de turmas e disciplinas para aviso avulso...'
                                                    : 'Use este recado para comunicar algo mesmo quando não existir aula lançada no dia selecionado.'}
                                            </div>
                                        </>
                                    ) : null}

                                    <label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Título do aviso</label>
                                    <input
                                        type="text"
                                        value={formState.title}
                                        onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
                                        className={`w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400 ${modalState.mode === 'standalone' ? 'mt-5' : 'mt-3'}`}
                                        placeholder="Pode deixar em branco para usar o título padrão"
                                    />

                                    <label className="mt-5 block text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
                                        Descrição
                                    </label>
                                    <textarea
                                        value={formState.description}
                                        onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                                        rows={6}
                                        className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                        placeholder={modalState.mode === 'standalone' ? 'Escreva os detalhes do recado para esta data.' : 'Escreva os detalhes do recado, prova, trabalho ou falta.'}
                                    />
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                    <div className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Canal do aviso</div>
                                    <div className="mt-4 space-y-3">
                                        {[
                                            { key: 'notifyStudents', label: 'Avisar alunos' },
                                            { key: 'notifyGuardians', label: 'Avisar responsáveis' },
                                            { key: 'notifyByEmail', label: 'Enviar e-mail também' },
                                        ].map((option) => {
                                            const active = formState[option.key as keyof EventFormState] as boolean;
                                            return (
                                                <button
                                                    key={option.key}
                                                    type="button"
                                                    onClick={() =>
                                                        setFormState((current) => ({
                                                            ...current,
                                                            [option.key]: !active,
                                                        }))
                                                    }
                                                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                                                        active
                                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                            : 'border-red-200 bg-red-50 text-red-600'
                                                    }`}
                                                >
                                                    <span className="text-sm font-bold">{option.label}</span>
                                                    <span className="text-xs font-extrabold uppercase tracking-[0.12em]">
                                                        {active ? 'ATIVO' : 'INATIVO'}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm font-medium text-blue-700">
                                        Assim que salvar, o sistema cria notificação interna para os destinatários selecionados e tenta enviar e-mail quando a configuração da escola estiver ativa.
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="dashboard-band-footer border-t px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex gap-3">
                                {modalState.existingEvent ? (
                                    <button
                                        type="button"
                                        onClick={handleRemoveEvent}
                                        disabled={saving}
                                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
                                    >
                                        Remover evento
                                    </button>
                                ) : null}
                            </div>
                            <div className="flex gap-3 items-center">
                                <div className="flex justify-end">
                                    <ScreenNameCopy
                                        screenId={modalState.mode === 'standalone' ? 'PRINCIPAL_CALENDARIO_AULAS_STANDALONE' : 'PRINCIPAL_CALENDARIO_AULAS'}
                                        label="Tela"
                                        className="text-[9px]"
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setModalState(null)}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveEvent}
                                        disabled={saving}
                                        className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                                    >
                                        {saving ? 'Salvando...' : modalState.existingEvent ? 'Salvar alterações' : 'Lançar evento'}
                                    </button>
                                </div>
                            </div>
                        </div>
                        {confirmationDialog ? (
                            <div className="absolute inset-0 z-[96] flex items-center justify-center bg-slate-900/50">
                                <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-2xl">
                                    <div className="text-xs font-black uppercase tracking-[0.25em] text-blue-600">Confirmação</div>
                                    <h3 className="mt-3 text-2xl font-extrabold text-slate-800">{confirmationDialog.title}</h3>
                                    <p className="mt-2 text-sm font-medium text-slate-500">{confirmationDialog.message}</p>
                                    <button
                                        type="button"
                                        onClick={handleConfirmDialog}
                                        className="mt-6 rounded-xl bg-blue-600 px-6 py-3 text-sm font-black uppercase tracking-[0.15em] text-white transition hover:bg-blue-700"
                                    >
                                        Confirmar
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {expandedDayModal ? (
                <div className="fixed inset-0 z-[86] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl">
                        <div className="dashboard-band border-b px-6 py-5">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div>
                                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                                        Visão expandida do dia
                                    </div>
                                    <h2 className="mt-2 text-2xl font-extrabold text-slate-800">
                                        {getFullDateLabel(expandedDayModal.date)}
                                    </h2>
                                    <p className="mt-2 text-sm font-medium text-slate-500">
                                        {expandedDayModal.items.length} aula(s) exibida(s) neste dia.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setExpandedDayModal(null)}
                                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
                            {expandedDayModal.items.length ? (
                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                    {expandedDayModal.items.map((item) => renderLessonChip(item))}
                                </div>
                            ) : (
                                <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
                                    <div className="text-sm font-bold text-slate-700">Nenhuma aula encontrada nesta data.</div>
                                </div>
                            )}
                        </div>

                        <div className="border-t px-6 py-4">
                            <div className="flex justify-end">
                                <ScreenNameCopy
                                    screenId="PRINCIPAL_CALENDARIO_AULAS_DIA_EXPANDIDO"
                                    label="Tela"
                                    className="text-[11px]"
                                    disableMargin
                                />
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {actionPickerItem ? (
                <div className="fixed inset-0 z-[84] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-2xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-2xl">
                        <div className="dashboard-band border-b px-6 py-5">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="flex items-center gap-4">
                                    <TenantLogoBadge
                                        tenant={tenant}
                                        wrapperClassName="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                                        imageClassName="h-full w-full object-contain p-1.5"
                                        fallbackClassName="text-sm font-black tracking-[0.25em] text-[#153a6a]"
                                    />
                                    <div>
                                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                                            {actionPickerItem.dateLabel} • {actionPickerItem.startTime} - {actionPickerItem.endTime}
                                        </div>
                                        <h2 className="mt-2 text-2xl font-extrabold text-slate-800">{actionPickerItem.subjectName}</h2>
                                        <p className="mt-2 text-sm font-medium text-slate-500">
                                            Professor: {actionPickerItem.teacherName}
                                        </p>
                                        <p className="mt-1 text-sm font-medium text-slate-500">
                                            {actionPickerItem.seriesName} - {actionPickerItem.className}
                                            {actionPickerItem.shift ? ` • ${actionPickerItem.shift}` : ''}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setActionPickerItem(null)}
                                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>

                        <div className="px-6 py-6">
                            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm font-medium text-blue-700">
                                Clique na ação desejada. O próximo passo abre o lançamento da aula com opção de enviar <strong>notificação interna</strong>, <strong>e-mail</strong> ou <strong>os dois</strong>.
                            </div>

                            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-base font-extrabold text-emerald-900">Chamada da aula</div>
                                        <div className="mt-1 text-xs font-medium leading-5 text-emerald-700">
                                            Liste os alunos desta aula e marque quem está <strong>PRESENTE</strong> ou <strong>FALTOU</strong>.
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenAttendanceModal(actionPickerItem)}
                                        disabled={!canManageAttendance(actionPickerItem.lessonDate)}
                                        title={!canManageAttendance(actionPickerItem.lessonDate) ? 'Chamada disponível somente até a data de hoje' : undefined}
                                        className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                                    >
                                        Fazer chamada
                                    </button>
                                </div>
                            </div>

                            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                                {EVENT_TYPE_OPTIONS.map((option) => {
                                    const existingEvent = actionPickerItem.events.find((event) => event.eventType === option.value) || null;
                                    return (
                                        <div
                                            key={`${actionPickerItem.id}:${option.value}`}
                                            className={`rounded-2xl border px-4 py-4 text-left ${existingEvent ? option.tone : 'border-slate-200 bg-white text-slate-700'}`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-base font-extrabold">{option.label}</div>
                                                <div className="text-[11px] font-black uppercase tracking-[0.18em]">
                                                    {existingEvent ? 'Já lançado' : 'Novo'}
                                                </div>
                                            </div>
                                            <div className="mt-2 text-xs font-medium leading-5 text-slate-500">
                                                {existingEvent
                                                    ? `Editar "${existingEvent.title}" e reenviar por notificação e/ou e-mail.`
                                                    : `Lançar ${option.label.toLowerCase()} nesta aula e escolher quem recebe por notificação e/ou e-mail.`}
                                            </div>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEventModal(actionPickerItem, option.value)}
                                                    className="rounded-xl border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-emerald-700"
                                                >
                                                    {existingEvent
                                                        ? 'Editar aviso'
                                                        : option.value === 'PROVA'
                                                            ? 'Lançar Nova Prova'
                                                            : option.value === 'TRABALHO'
                                                                ? 'Lançar Novo Trabalho'
                                                                : option.value === 'RECADO'
                                                                    ? 'Lançar Novo Recado'
                                                                    : option.value === 'FALTA_PROFESSOR'
                                                                        ? 'Lançar Nova Falta'
                                                                        : 'Lançar aviso'}
                                                </button>
                                                {existingEvent && (option.value === 'PROVA' || option.value === 'TRABALHO') ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenAssessmentModal(actionPickerItem, existingEvent)}
                                                        className="rounded-xl border border-white/70 bg-emerald-600 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-emerald-700"
                                                    >
                                                        Lançar notas
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="dashboard-band-footer border-t px-6 py-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-col gap-2">
                                    <div className="text-sm font-medium text-slate-500">
                                        {actionPickerItem.events.length} evento(s) já lançado(s) nesta aula.
                                    </div>
                                    <ScreenNameCopy
                                        screenId="PRINCIPAL_CALENDARIO_AULAS_ACAO"
                                        label="Tela"
                                        className="mt-0 text-[11px]"
                                        disableMargin
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedDate(actionPickerItem.lessonDate);
                                            setActionPickerItem(null);
                                        }}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                                    >
                                        Ver dia completo
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {attendanceModal ? (
                <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl">
                        <div className="dashboard-band border-b px-6 py-5">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="flex items-center gap-4">
                                    <TenantLogoBadge
                                        tenant={tenant}
                                        wrapperClassName="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                                        imageClassName="h-full w-full object-contain p-1.5"
                                        fallbackClassName="text-sm font-black tracking-[0.25em] text-[#153a6a]"
                                    />
                                    <div>
                                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                                            {attendanceModal.lessonItem.dateLabel} • {attendanceModal.lessonItem.startTime} - {attendanceModal.lessonItem.endTime}
                                        </div>
                                        <h2 className="mt-2 text-2xl font-extrabold text-slate-800">Chamada da aula</h2>
                                        <p className="mt-2 text-sm font-medium text-slate-500">
                                            {attendanceModal.lessonItem.subjectName} • {attendanceModal.lessonItem.seriesName} - {attendanceModal.lessonItem.className}
                                            {attendanceModal.lessonItem.shift ? ` • ${attendanceModal.lessonItem.shift}` : ''}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setAttendanceModal(null)}
                                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[72vh] overflow-y-auto px-6 py-6">
                            {attendanceLoading ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center text-sm font-medium text-slate-500">
                                    Carregando alunos da aula...
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                                            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Alunos na aula</div>
                                            <div className="mt-2 text-2xl font-extrabold text-slate-800">{attendanceModal.summary.totalStudents}</div>
                                        </div>
                                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                                            <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Presentes</div>
                                            <div className="mt-2 text-2xl font-extrabold text-emerald-800">
                                                {attendanceForm.students.filter((student) => student.status === 'PRESENTE').length}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
                                            <div className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">Faltou</div>
                                            <div className="mt-2 text-2xl font-extrabold text-red-800">
                                                {attendanceForm.students.filter((student) => student.status === 'FALTOU').length}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Envio opcional</div>
                                        <div className="mt-4 flex flex-col gap-3 md:flex-row">
                                            <label className="flex items-center gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                                                <input
                                                    type="checkbox"
                                                    checked={attendanceForm.notifyStudents}
                                                    onChange={(event) =>
                                                        setAttendanceForm((current) => ({
                                                            ...current,
                                                            notifyStudents: event.target.checked,
                                                        }))
                                                    }
                                                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                />
                                                Notificar Alunos
                                            </label>
                                            <label className="flex items-center gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                                                <input
                                                    type="checkbox"
                                                    checked={attendanceForm.notifyGuardians}
                                                    onChange={(event) =>
                                                        setAttendanceForm((current) => ({
                                                            ...current,
                                                            notifyGuardians: event.target.checked,
                                                        }))
                                                    }
                                                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                />
                                                Notificar Responsáveis
                                            </label>
                                        </div>
                                    </div>

                                    {attendanceFeedback ? (
                                        <div className={`rounded-2xl border px-4 py-4 ${
                                            attendanceFeedback.notificationsCreated > 0
                                                ? 'border-emerald-200 bg-emerald-50'
                                                : 'border-slate-200 bg-slate-50'
                                        }`}>
                                            <div className={`text-xs font-bold uppercase tracking-[0.18em] ${
                                                attendanceFeedback.notificationsCreated > 0
                                                    ? 'text-emerald-700'
                                                    : 'text-slate-600'
                                            }`}>
                                                {attendanceFeedback.notificationsCreated > 0 ? 'Notificação enviada' : 'Status da notificação'}
                                            </div>
                                            <div className={`mt-2 text-sm font-semibold ${
                                                attendanceFeedback.notificationsCreated > 0
                                                    ? 'text-emerald-900'
                                                    : 'text-slate-700'
                                            }`}>
                                                {!attendanceFeedback.notifyStudents && !attendanceFeedback.notifyGuardians
                                                    ? 'A chamada foi salva sem disparo de notificação, porque os dois canais ficaram desmarcados.'
                                                    : attendanceFeedback.notificationsCreated > 0
                                                        ? `${attendanceFeedback.notificationsCreated} aviso(s) foram gerados com sucesso para os destinatários marcados nesta chamada.`
                                                        : 'A chamada foi salva, mas nenhum aviso foi gerado para os destinatários marcados.'}
                                            </div>
                                            <div className="mt-2 text-xs font-medium text-slate-500">
                                                {attendanceFeedback.notifyStudents ? 'ALUNO ATIVADO' : 'ALUNO DESATIVADO'} • {attendanceFeedback.notifyGuardians ? 'RESPONSÁVEIS ATIVADOS' : 'RESPONSÁVEIS DESATIVADOS'}
                                            </div>
                                        </div>
                                    ) : null}

                                    <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
                                        <div className="dashboard-band border-b px-5 py-4">
                                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                <div>
                                                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Lista da chamada</div>
                                                    <div className="mt-1 text-lg font-extrabold text-slate-800">{attendanceForm.students.length} aluno(s)</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="max-h-[44vh] overflow-y-auto px-1 py-4">
                                            <table className="min-w-full text-sm">
                                                <thead>
                                                    <tr className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                                                        <th className="px-3 py-2 text-left">Aluno</th>
                                                        <th className="px-3 py-2 text-left">Presente</th>
                                                        <th className="px-3 py-2 text-left">Faltou</th>
                                                        <th className="px-3 py-2 text-left">Observação</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {attendanceForm.students.map((student, index) => (
                                                        <tr key={student.studentId} className="bg-white even:bg-slate-50">
                                                            <td className="px-3 py-2">
                                                                <div className="text-sm font-semibold text-slate-800">{student.studentName}</div>
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setAttendanceForm((current) => ({
                                                                            ...current,
                                                                            students: current.students.map((item, itemIndex) =>
                                                                                itemIndex === index ? { ...item, status: 'PRESENTE' } : item,
                                                                            ),
                                                                        }))
                                                                    }
                                                                    className={`w-full rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
                                                                        student.status === 'PRESENTE'
                                                                            ? 'border-emerald-300 bg-emerald-600 text-white'
                                                                            : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                                                                    }`}
                                                                >
                                                                    Presente
                                                                </button>
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setAttendanceForm((current) => ({
                                                                            ...current,
                                                                            students: current.students.map((item, itemIndex) =>
                                                                                itemIndex === index ? { ...item, status: 'FALTOU' } : item,
                                                                            ),
                                                                        }))
                                                                    }
                                                                    className={`w-full rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
                                                                        student.status === 'FALTOU'
                                                                            ? 'border-red-300 bg-red-600 text-white'
                                                                            : 'border-red-200 bg-white text-red-700 hover:bg-red-50'
                                                                    }`}
                                                                >
                                                                    Faltou
                                                                </button>
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <input
                                                                    type="text"
                                                                    value={student.notes}
                                                                    onChange={(event) =>
                                                                        setAttendanceForm((current) => ({
                                                                            ...current,
                                                                            students: current.students.map((item, itemIndex) =>
                                                                                itemIndex === index ? { ...item, notes: event.target.value } : item,
                                                                            ),
                                                                        }))
                                                                    }
                                                                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400"
                                                                    placeholder="Opcional"
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="dashboard-band-footer border-t px-6 py-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <ScreenNameCopy
                                    screenId="PRINCIPAL_CALENDARIO_AULAS_CHAMADA"
                                    label="Tela"
                                    className="mt-0 text-[11px]"
                                />
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setAttendanceModal(null)}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveAttendance}
                                        disabled={attendanceSaving || attendanceLoading}
                                        className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                                    >
                                        {attendanceSaving ? 'Finalizando chamada...' : 'Finalizar chamada'}
                                    </button>
                                </div>
                            </div>
                        </div>
                        {confirmationDialog?.kind === 'attendance' ? (
                            <div className="absolute inset-0 z-[96] flex items-center justify-center bg-slate-900/50">
                                <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-2xl">
                                    <div className="text-xs font-black uppercase tracking-[0.25em] text-emerald-600">Sucesso</div>
                                    <h3 className="mt-3 text-2xl font-extrabold text-slate-800">{confirmationDialog.title}</h3>
                                    <p className="mt-2 text-sm font-medium text-slate-500">{confirmationDialog.message}</p>
                                    <button
                                        type="button"
                                        onClick={handleConfirmDialog}
                                        className="mt-6 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-black uppercase tracking-[0.15em] text-white transition hover:bg-emerald-700"
                                    >
                                        Confirmar
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {assessmentModal ? (
                <div className="fixed inset-0 z-[86] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl">
                        <div className="dashboard-band border-b px-6 py-5">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="flex items-center gap-4">
                                    <TenantLogoBadge
                                        tenant={tenant}
                                        wrapperClassName="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                                        imageClassName="h-full w-full object-contain p-1.5"
                                        fallbackClassName="text-sm font-black tracking-[0.25em] text-[#153a6a]"
                                    />
                                    <div>
                                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                                            {assessmentModal.lessonItem.dateLabel} • {assessmentModal.lessonItem.startTime} - {assessmentModal.lessonItem.endTime}
                                        </div>
                                        <h2 className="mt-2 text-2xl font-extrabold text-slate-800">
                                            Lançamento de notas • {assessmentModal.event.eventTypeLabel}
                                        </h2>
                                        <p className="mt-2 text-sm font-medium text-slate-500">
                                            {assessmentModal.lessonItem.subjectName} • {assessmentModal.lessonItem.seriesName} - {assessmentModal.lessonItem.className}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setAssessmentModal(null)}
                                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[78vh] overflow-y-auto px-5 py-4">
                            {assessmentLoading ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center text-sm font-medium text-slate-500">
                                    Carregando alunos da avaliação...
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                                <div>
                                                    <label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Título da avaliação</label>
                                                    <input
                                                        type="text"
                                                        value={assessmentForm.title}
                                                        onChange={(event) => setAssessmentForm((current) => ({ ...current, title: event.target.value }))}
                                                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                                        placeholder="Ex.: PROVA BIMESTRAL"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Nota máxima</label>
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={assessmentForm.maxScore}
                                                        onChange={(event) => setAssessmentForm((current) => ({ ...current, maxScore: event.target.value }))}
                                                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                                        placeholder="Ex.: 10 ou 8,75"
                                                    />
                                                </div>
                                            </div>
                                            <label className="mt-4 block text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Observação da avaliação</label>
                                            <textarea
                                                value={assessmentForm.description}
                                                onChange={(event) => setAssessmentForm((current) => ({ ...current, description: event.target.value }))}
                                                rows={2}
                                                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                                placeholder="Ex.: conteúdo cobrado, recuperação, observações para a turma."
                                            />
                                        </div>

                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Entrega das notas</div>
                                            <div className="mt-3 space-y-2.5">
                                                {[
                                                    { key: 'notifyStudents', label: 'Avisar alunos' },
                                                    { key: 'notifyGuardians', label: 'Avisar responsáveis' },
                                                    { key: 'notifyByEmail', label: 'Enviar e-mail também' },
                                                ].map((option) => {
                                                    const active = assessmentForm[option.key as keyof AssessmentFormState] as boolean;
                                                    return (
                                                        <button
                                                            key={option.key}
                                                            type="button"
                                                            onClick={() =>
                                                                setAssessmentForm((current) => ({
                                                                    ...current,
                                                                    [option.key]: !active,
                                                                }))
                                                            }
                                                            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-2.5 text-left transition ${
                                                                active
                                                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                    : 'border-red-200 bg-red-50 text-red-600'
                                                            }`}
                                                        >
                                                            <span className="text-sm font-bold">{option.label}</span>
                                                            <span className="text-xs font-extrabold uppercase tracking-[0.12em]">
                                                                {active ? 'ATIVO' : 'INATIVO'}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                        </div>
                                    </div>

                                    <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
                                        <div className="dashboard-band border-b px-5 py-3">
                                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                <div>
                                                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Alunos da avaliação</div>
                                                    <div className="mt-1 text-base font-extrabold text-slate-800">{assessmentForm.students.length} aluno(s) encontrado(s)</div>
                                                </div>
                                                <div className="text-xs font-medium text-slate-500">
                                                    Informe nota com até 2 casas decimais, por exemplo <strong>8,75</strong>.
                                                </div>
                                            </div>
                                        </div>
                                        <div className="max-h-[52vh] overflow-y-auto px-5 py-4">
                                            <div className="space-y-3">
                                                {assessmentForm.students.map((student, index) => (
                                                    <div key={student.studentId} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1.3fr_0.6fr_1fr]">
                                                        <div>
                                                            <div className="text-base font-extrabold text-slate-800">{student.studentName}</div>
                                                        </div>
                                                        <div>
                                                            <label className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Nota</label>
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                value={student.score}
                                                                onChange={(event) =>
                                                                    setAssessmentForm((current) => ({
                                                                        ...current,
                                                                        students: current.students.map((item, itemIndex) =>
                                                                            itemIndex === index ? { ...item, score: event.target.value } : item,
                                                                        ),
                                                                    }))
                                                                }
                                                                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                                                placeholder="Ex.: 8,75"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Observação</label>
                                                            <input
                                                                type="text"
                                                                value={student.remarks}
                                                                onChange={(event) =>
                                                                    setAssessmentForm((current) => ({
                                                                        ...current,
                                                                        students: current.students.map((item, itemIndex) =>
                                                                            itemIndex === index ? { ...item, remarks: event.target.value } : item,
                                                                        ),
                                                                    }))
                                                                }
                                                                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                                                placeholder="Opcional"
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="dashboard-band-footer border-t px-5 py-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-xs font-medium text-slate-500">
                                    Salve as notas para disponibilizar a avaliação aos alunos da turma e aos responsáveis definidos.
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setAssessmentModal(null)}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveAssessment}
                                        disabled={assessmentSaving || assessmentLoading}
                                        className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                                    >
                                        {assessmentSaving ? 'Salvando notas...' : 'Salvar notas'}
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 flex justify-end">
                                <ScreenNameCopy
                                    screenId="PRINCIPAL_CALENDARIO_AULAS_LANCAMENTO_NOTAS_PROVA"
                                    label="Tela"
                                    disableMargin
                                />
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}



