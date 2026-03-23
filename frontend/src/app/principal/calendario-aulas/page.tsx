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
    standaloneEventId?: string;
    schoolYearId?: string | null;
    seriesClassId?: string | null;
    teacherSubjectId?: string | null;
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
    standaloneEventId?: string;
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

const DEFAULT_ASSESSMENT_FORM: AssessmentFormState = {
    title: '',
    description: '',
    maxScore: '10',
    notifyStudents: true,
    notifyGuardians: true,
    notifyByEmail: true,
    students: [],
};

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

function addMonths(value: Date, amount: number) {
    const next = new Date(value);
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

function getRangeLabel(view: CalendarViewMode, referenceDate: string, rangeStart: string, rangeEnd: string) {
    if (view === 'DAY') return getFullDateLabel(referenceDate);
    if (view === 'WEEK') {
        const start = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(parseDateOnly(rangeStart));
        const end = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parseDateOnly(rangeEnd));
        return `${start} até ${end}`;
    }
    return getMonthLabel(referenceDate);
}

function getEventTone(eventType: string) {
    return EVENT_TYPE_OPTIONS.find((option) => option.value === eventType)?.tone || 'bg-slate-100 text-slate-700 border-slate-200';
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
    const [confirmationDialog, setConfirmationDialog] = useState<{
        title: string;
        message: string;
    } | null>(null);

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

    const weekDays = useMemo(() => {
        const start = startOfWeek(parseDateOnly(selectedDate));
        return Array.from({ length: 7 }, (_, index) => formatDateOnly(addDays(start, index)));
    }, [selectedDate]);

    const eventTypeLabel = useMemo(() => {
        if (!modalState) return '';
        if (modalState.mode === 'standalone') return 'Recado';
        return EVENT_TYPE_OPTIONS.find((option) => option.value === modalState.eventType)?.label || 'Evento';
    }, [modalState]);

    const handleNavigate = (direction: 'prev' | 'next') => {
        const factor = direction === 'prev' ? -1 : 1;
        const baseDate = parseDateOnly(referenceDate);

        if (viewMode === 'MONTH') {
            const nextDate = formatDateOnly(addMonths(baseDate, factor));
            setReferenceDate(nextDate);
            setSelectedDate(nextDate);
            return;
        }

        if (viewMode === 'WEEK') {
            const nextDate = formatDateOnly(addDays(baseDate, factor * 7));
            setReferenceDate(nextDate);
            setSelectedDate(nextDate);
            return;
        }

        const nextDate = formatDateOnly(addDays(baseDate, factor));
        setReferenceDate(nextDate);
        setSelectedDate(nextDate);
    };

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
            standaloneEventId: standaloneEvent?.id || item?.standaloneEventId,
            targetKey: fallbackTarget,
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
        setConfirmationDialog(null);
        setModalState(null);
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
            <div className="mt-1 font-bold text-slate-800">{item.subjectName}</div>
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
                                <div className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">Agenda expandida do professor</div>
                                <h1 className="mt-2 text-3xl font-extrabold text-[#153a6a]">Calendário das minhas aulas</h1>
                                <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">
                                    Visualize sua grade anual em calendário expandido, com horários reais da aula, eventos lançados e navegação por mês, semana ou dia.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="px-8 py-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={() => handleNavigate('prev')}
                                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                            >
                                Anterior
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const today = new Date().toISOString().slice(0, 10);
                                    setReferenceDate(today);
                                    setSelectedDate(today);
                                }}
                                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
                            >
                                Hoje
                            </button>
                            <button
                                type="button"
                                onClick={() => handleNavigate('next')}
                                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                            >
                                Próximo
                            </button>

                            {([
                                { value: 'MONTH', label: 'Mês' },
                                { value: 'WEEK', label: 'Semana' },
                                { value: 'DAY', label: 'Dia' },
                            ] as Array<{ value: CalendarViewMode; label: string }>).map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setViewMode(option.value)}
                                    className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${
                                        viewMode === option.value
                                            ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-3 text-right shadow-sm">
                                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Período em foco</div>
                                <div className="mt-1 text-xl font-extrabold text-slate-800">
                                    {calendarData ? getRangeLabel(viewMode, referenceDate, calendarData.rangeStart, calendarData.rangeEnd) : getMonthLabel(referenceDate)}
                                </div>
                            </div>
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

                    <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
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

                                                    <div className="mt-3 flex flex-1 flex-col gap-2">
                                                        {dayItems.slice(0, 4).map((item) => renderLessonChip(item, true))}
                                                        {dayItems.length > 4 ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedDate(day)}
                                                                className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-slate-500 transition hover:border-blue-300 hover:text-blue-700"
                                                            >
                                                                +{dayItems.length - 4} aula(s)
                                                            </button>
                                                        ) : null}
                                                        {!dayItems.length ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenStandaloneNoticeModal(day)}
                                                                className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-blue-50 px-3 py-4 text-center text-xs font-black uppercase tracking-[0.14em] text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                                                            >
                                                                Lançar aviso
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

                                                <div className="mt-4 space-y-2">
                                                    {dayItems.length ? (
                                                        dayItems.map((item) => renderLessonChip(item, true))
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenStandaloneNoticeModal(day)}
                                                            className="w-full rounded-2xl border border-dashed border-blue-200 bg-blue-50 px-3 py-5 text-center text-xs font-black uppercase tracking-[0.14em] text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                                                        >
                                                            Lançar aviso
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
                            <div className="rounded-[24px] border border-blue-100 bg-white px-5 py-4">
                                <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Visão detalhada do dia</div>
                                <div className="mt-2 text-2xl font-extrabold text-slate-800">{getFullDateLabel(selectedDate)}</div>
                                <div className="mt-2 text-sm font-medium text-slate-500">
                                    Clique em cada aula para lançar prova, trabalho, recado ou falta do professor.
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Dia selecionado</div>
                                <div className="mt-1 text-xl font-extrabold text-slate-800">{getFullDateLabel(selectedDate)}</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="text-sm font-medium text-slate-500">
                                    {selectedDayItems.length} aula(s) para tratar nesta data
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleOpenStandaloneNoticeModal(selectedDate)}
                                    disabled={standaloneTargetsLoading || availableStandaloneTargets.length === 0}
                                    className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Lançar aviso sem aula
                                </button>
                            </div>
                        </div>

                        <div className="mt-5 space-y-4">
                            {selectedDayItems.length ? (
                                selectedDayItems.map((item) => (
                                    <div key={item.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
                                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                            <div>
                                                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                                                    {item.displayTimeLabel || `${item.startTime} - ${item.endTime}`}
                                                </div>
                                                <div className="mt-2 text-xl font-extrabold text-slate-800">{item.subjectName}</div>
                                                <div className="mt-2 text-sm font-medium text-slate-500">
                                                    {item.seriesName} - {item.className}
                                                    {item.shift ? ` • ${item.shift}` : ''}
                                                </div>
                                                <div className="mt-2 text-xs font-medium text-slate-500">
                                                    {item.isStandaloneNotice
                                                        ? 'Aviso lançado fora do horário de aula. Você pode editar o recado e reenviar a comunicação.'
                                                        : 'Escolha prova, trabalho, recado ou falta. No modal você decide se dispara notificação interna, e-mail ou os dois.'}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {item.isStandaloneNotice ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenStandaloneNoticeModal(item.lessonDate, item)}
                                                        className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-blue-700 transition hover:bg-blue-100"
                                                    >
                                                        Editar recado
                                                    </button>
                                                ) : (
                                                    EVENT_TYPE_OPTIONS.map((option) => {
                                                        const hasEvent = item.events.some((event) => event.eventType === option.value);
                                                        return (
                                                            <button
                                                                key={`${item.id}-${option.value}`}
                                                                type="button"
                                                                onClick={() => handleOpenEventModal(item, option.value)}
                                                                className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${
                                                                    hasEvent
                                                                        ? option.tone
                                                                        : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'
                                                                }`}
                                                            >
                                                                {hasEvent ? `Editar ${option.label}` : option.label}
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>

                                        {item.events.length ? (
                                            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                                {item.events.map((event) => (
                                                    <div key={event.id} className={`rounded-2xl border px-4 py-3 ${getEventTone(event.eventType)}`}>
                                                        <div className="text-xs font-bold uppercase tracking-[0.15em]">{event.eventTypeLabel}</div>
                                                        <div className="mt-2 text-sm font-extrabold">{event.title}</div>
                                                        {event.description ? (
                                                            <div className="mt-2 text-xs font-medium leading-5">{event.description}</div>
                                                        ) : null}
                                                        {!item.isStandaloneNotice && (event.eventType === 'PROVA' || event.eventType === 'TRABALHO') ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenAssessmentModal(item, event)}
                                                                className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                                                            >
                                                                Lançar notas
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm font-medium text-slate-500">
                                                Nenhum evento lançado ainda para esta aula.
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm font-medium text-slate-500">
                                    <div>Não há aulas para a data selecionada.</div>
                                    <div className="mt-2">Você ainda pode lançar um aviso para esta data.</div>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenStandaloneNoticeModal(selectedDate)}
                                        disabled={standaloneTargetsLoading || availableStandaloneTargets.length === 0}
                                        className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        Lançar aviso neste dia
                                    </button>
                                </div>
                            )}
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
                                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                        {tenant?.logoUrl ? (
                                            <img src={tenant.logoUrl} alt={`Logo de ${tenant.name}`} className="h-full w-full object-contain p-1.5" />
                                        ) : (
                                            <span className="text-sm font-black tracking-[0.25em] text-[#153a6a]">
                                                {String(tenant?.name || 'ESCOLA').slice(0, 3).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
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
                                        <ScreenNameCopy
                                            screenId={modalState.mode === 'standalone' ? 'PRINCIPAL_CALENDARIO_AULAS_STANDALONE' : 'PRINCIPAL_CALENDARIO_AULAS'}
                                            label="Tela"
                                            className="text-[9px]"
                                        />
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
                                                className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                            >
                                                {availableStandaloneTargets.map((target) => (
                                                    <option key={target.key} value={target.key}>
                                                        {target.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-xs font-medium leading-5 text-blue-700">
                                                Use este recado para comunicar algo mesmo quando não existir aula lançada no dia selecionado.
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

            {actionPickerItem ? (
                <div className="fixed inset-0 z-[84] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-2xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-2xl">
                        <div className="dashboard-band border-b px-6 py-5">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                        {tenant?.logoUrl ? (
                                            <img src={tenant.logoUrl} alt={`Logo de ${tenant.name}`} className="h-full w-full object-contain p-1.5" />
                                        ) : (
                                            <span className="text-sm font-black tracking-[0.25em] text-[#153a6a]">
                                                {String(tenant?.name || 'ESCOLA').slice(0, 3).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                                            {actionPickerItem.dateLabel} • {actionPickerItem.startTime} - {actionPickerItem.endTime}
                                        </div>
                                        <h2 className="mt-2 text-2xl font-extrabold text-slate-800">{actionPickerItem.subjectName}</h2>
                                        <p className="mt-2 text-sm font-medium text-slate-500">
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
                                                    className="rounded-xl border border-white/70 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                                                >
                                                    {existingEvent ? 'Editar aviso' : 'Lançar aviso'}
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
                                <div className="text-sm font-medium text-slate-500">
                                    {actionPickerItem.events.length} evento(s) já lançado(s) nesta aula.
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

            {assessmentModal ? (
                <div className="fixed inset-0 z-[86] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl">
                        <div className="dashboard-band border-b px-6 py-5">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                        {tenant?.logoUrl ? (
                                            <img src={tenant.logoUrl} alt={`Logo de ${tenant.name}`} className="h-full w-full object-contain p-1.5" />
                                        ) : (
                                            <span className="text-sm font-black tracking-[0.25em] text-[#153a6a]">
                                                {String(tenant?.name || 'ESCOLA').slice(0, 3).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
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

                        <div className="max-h-[72vh] overflow-y-auto px-6 py-6">
                            {assessmentLoading ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center text-sm font-medium text-slate-500">
                                    Carregando alunos da avaliação...
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                <div>
                                                    <label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Título da avaliação</label>
                                                    <input
                                                        type="text"
                                                        value={assessmentForm.title}
                                                        onChange={(event) => setAssessmentForm((current) => ({ ...current, title: event.target.value }))}
                                                        className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
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
                                                        className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                                        placeholder="Ex.: 10 ou 8,5"
                                                    />
                                                </div>
                                            </div>
                                            <label className="mt-5 block text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Observação da avaliação</label>
                                            <textarea
                                                value={assessmentForm.description}
                                                onChange={(event) => setAssessmentForm((current) => ({ ...current, description: event.target.value }))}
                                                rows={4}
                                                className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                                placeholder="Ex.: conteúdo cobrado, recuperação, observações para a turma."
                                            />
                                        </div>

                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                            <div className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Entrega das notas</div>
                                            <div className="mt-4 space-y-3">
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
                                                A turma é localizada automaticamente pela grade anual da aula. Ao salvar, o sistema envia notificação interna e/ou e-mail conforme os canais selecionados.
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
                                        <div className="dashboard-band border-b px-5 py-4">
                                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                <div>
                                                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Alunos da avaliação</div>
                                                    <div className="mt-1 text-lg font-extrabold text-slate-800">{assessmentForm.students.length} aluno(s) encontrado(s)</div>
                                                </div>
                                                <div className="text-sm font-medium text-slate-500">
                                                    Informe nota com decimal, por exemplo <strong>8,5</strong>.
                                                </div>
                                            </div>
                                        </div>
                                        <div className="max-h-[42vh] overflow-y-auto px-5 py-5">
                                            <div className="space-y-3">
                                                {assessmentForm.students.map((student, index) => (
                                                    <div key={student.studentId} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1.3fr_0.6fr_1fr]">
                                                        <div>
                                                            <div className="text-base font-extrabold text-slate-800">{student.studentName}</div>
                                                            <div className="mt-1 text-xs font-medium text-slate-500">
                                                                {student.studentEmail || 'Aluno sem e-mail informado'} • {student.guardiansCount} responsável(is)
                                                            </div>
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
                                                                placeholder="Ex.: 8,5"
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

                        <div className="dashboard-band-footer border-t px-6 py-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-sm font-medium text-slate-500">
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
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
