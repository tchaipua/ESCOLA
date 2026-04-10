'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { clearStoredSession } from '@/app/lib/auth-storage';
import { getDashboardAuthContext, getHomeRouteForRole } from '@/app/lib/dashboard-crud-utils';
import TeacherDailyAgendaPanel from '@/app/components/teacher-daily-agenda-panel';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const CACHE_KEY = '@Escola-PWA-Teacher-Cache:v1';
const ACTION_QUEUE_KEY = '@Escola-PWA-Teacher-Action-Queue:v1';
const READ_QUEUE_KEY = '@Escola-PWA-Teacher-Read-Queue:v1';
const SCREEN_NAME = 'PWA DOCENTE';

type NotificationItem = {
    id: string;
    title: string;
    message: string;
    category: string;
    readAt?: string | null;
    createdAt: string;
};

type CalendarItem = {
    id: string;
    lessonDate: string;
    dateLabel: string;
    startTime: string;
    endTime: string;
    subjectName: string;
    seriesName: string;
    className: string;
    events?: Array<{ id: string; eventType: string; title: string }>;
};

type AttendanceDetail = {
    lessonItem: {
        id: string;
        lessonDate: string;
        startTime: string;
        endTime: string;
        subjectName: string;
        seriesName: string;
        className: string;
        shift?: string | null;
    };
    summary: {
        totalStudents: number;
        totalPresentes: number;
        totalFaltou: number;
    };
    students: Array<{
        studentId: string;
        studentName: string;
        status?: string | null;
        notes?: string | null;
    }>;
};

type AssessmentDetail = {
    lessonEvent: {
        id: string;
        eventType: string;
        title: string;
        description?: string | null;
    };
    lessonItem: {
        id: string;
        lessonDate: string;
        startTime: string;
        endTime: string;
        subjectName: string;
        seriesName: string;
        className: string;
    };
    assessment?: {
        title?: string | null;
        description?: string | null;
        maxScore?: number | null;
        notifyStudents?: boolean;
        notifyGuardians?: boolean;
        notifyByEmail?: boolean;
    } | null;
    students: Array<{
        studentId: string;
        studentName: string;
        score?: number | null;
        remarks?: string | null;
    }>;
};

type AssessmentEvent = {
    lessonEventId: string;
    eventType: string;
    title: string;
    lessonDate: string;
    startTime: string;
    endTime: string;
    subjectName: string;
    seriesName: string;
    className: string;
    pendingStudentsCount: number;
    gradedStudentsCount: number;
};

type TeacherPayload = {
    tenant: { id: string; name: string; logoUrl?: string | null } | null;
    teacher: { name?: string | null } | null;
    notifications: NotificationItem[];
    calendarItems: CalendarItem[];
    assessmentEvents: AssessmentEvent[];
    attendanceDetails: Record<string, AttendanceDetail>;
    assessmentDetails: Record<string, AssessmentDetail>;
    syncedAt: string;
};

type TeacherSnapshot = Omit<TeacherPayload, 'syncedAt'> & {
    syncedAt: string | null;
    selectedDate: string;
};

type QueueAction =
    | {
        type: 'ATTENDANCE';
        targetId: string;
        payload: {
            attendances: Array<{ studentId: string; status: string; notes?: string }>;
            notifyStudents: boolean;
            notifyGuardians: boolean;
        };
      }
    | {
        type: 'ASSESSMENT';
        targetId: string;
        payload: {
            title?: string;
            description?: string;
            maxScore?: string;
            notifyStudents: boolean;
            notifyGuardians: boolean;
            notifyByEmail: boolean;
            grades: Array<{ studentId: string; score?: string; remarks?: string }>;
        };
      };

function readJson<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) as T : fallback;
    } catch {
        return fallback;
    }
}

function writeJson<T>(key: string, value: T) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
}

function fmtDate(value?: string | null) {
    if (!value) return 'NAO INFORMADO';
    return new Date(value).toLocaleString('pt-BR');
}

function fmtDateOnly(value?: string | null) {
    if (!value) return 'NAO INFORMADO';
    return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

function currentDate() {
    return new Date().toISOString().slice(0, 10);
}

export default function ProfessorPwaPage() {
    const router = useRouter();
    const [tenant, setTenant] = useState<TeacherPayload['tenant']>(null);
    const [teacher, setTeacher] = useState<TeacherPayload['teacher']>(null);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
    const [assessmentEvents, setAssessmentEvents] = useState<AssessmentEvent[]>([]);
    const [attendanceDetails, setAttendanceDetails] = useState<Record<string, AttendanceDetail>>({});
    const [assessmentDetails, setAssessmentDetails] = useState<Record<string, AssessmentDetail>>({});
    const [selectedDate, setSelectedDate] = useState(currentDate());
    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedLessonId, setSelectedLessonId] = useState('');
    const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
    const [activeTab, setActiveTab] = useState<'notificacoes' | 'chamada' | 'notas' | 'agenda'>('chamada');
    const [attendanceNotifyStudents, setAttendanceNotifyStudents] = useState(false);
    const [attendanceNotifyGuardians, setAttendanceNotifyGuardians] = useState(true);
    const [gradeNotifyStudents, setGradeNotifyStudents] = useState(true);
    const [gradeNotifyGuardians, setGradeNotifyGuardians] = useState(true);
    const [gradeNotifyEmail, setGradeNotifyEmail] = useState(false);
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isOfflineMode, setIsOfflineMode] = useState(false);
    const [pendingActionCount, setPendingActionCount] = useState(0);
    const [pendingReadCount, setPendingReadCount] = useState(0);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [copiedScreenName, setCopiedScreenName] = useState(false);
    const snapshotRef = useRef<TeacherSnapshot>({
        tenant: null,
        teacher: null,
        notifications: [],
        calendarItems: [],
        assessmentEvents: [],
        attendanceDetails: {},
        assessmentDetails: {},
        syncedAt: null,
        selectedDate: currentDate(),
    });
    const hasMountedDateSyncRef = useRef(false);

    const copyScreenNameToClipboard = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(SCREEN_NAME);
            setCopiedScreenName(true);
            window.setTimeout(() => setCopiedScreenName(false), 1500);
        } catch {
            setErrorStatus('Nao foi possivel copiar o nome da tela.');
        }
    }, []);

    useEffect(() => {
        snapshotRef.current = {
            tenant,
            teacher,
            notifications,
            calendarItems,
            assessmentEvents,
            attendanceDetails,
            assessmentDetails,
            syncedAt: lastSyncAt,
            selectedDate,
        };
    }, [assessmentDetails, assessmentEvents, attendanceDetails, calendarItems, lastSyncAt, notifications, selectedDate, teacher, tenant]);

    const persistCache = useCallback((overrides: Partial<TeacherSnapshot> = {}) => {
        const nextSnapshot = {
            ...snapshotRef.current,
            ...overrides,
        };
        if (!nextSnapshot.syncedAt) return;

        writeJson<TeacherPayload>(CACHE_KEY, {
            tenant: nextSnapshot.tenant,
            teacher: nextSnapshot.teacher,
            notifications: nextSnapshot.notifications,
            calendarItems: nextSnapshot.calendarItems,
            assessmentEvents: nextSnapshot.assessmentEvents,
            attendanceDetails: nextSnapshot.attendanceDetails,
            assessmentDetails: nextSnapshot.assessmentDetails,
            syncedAt: nextSnapshot.syncedAt,
        });
    }, []);

    const flushReadQueue = useCallback(async () => {
        const queue = readJson<string[]>(READ_QUEUE_KEY, []);
        setPendingReadCount(queue.length);
        if (!queue.length || typeof navigator === 'undefined' || !navigator.onLine) return;

        const { token } = getDashboardAuthContext();
        if (!token) return;

        const response = await fetch(`${API_BASE_URL}/notifications/my/read-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ids: queue }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || 'Nao foi possivel sincronizar as leituras.');
        writeJson<string[]>(READ_QUEUE_KEY, []);
        setPendingReadCount(0);
    }, []);

    const flushActionQueue = useCallback(async () => {
        const queue = readJson<QueueAction[]>(ACTION_QUEUE_KEY, []);
        setPendingActionCount(queue.length);
        if (!queue.length || typeof navigator === 'undefined' || !navigator.onLine) return;

        const { token } = getDashboardAuthContext();
        if (!token) return;

        const remaining: QueueAction[] = [];
        const nextAttendanceDetails = { ...snapshotRef.current.attendanceDetails };
        const nextAssessmentDetails = { ...snapshotRef.current.assessmentDetails };

        for (const action of queue) {
            try {
                const endpoint = action.type === 'ATTENDANCE'
                    ? `${API_BASE_URL}/lesson-attendances/by-lesson-item/${action.targetId}`
                    : `${API_BASE_URL}/lesson-assessments/by-event/${action.targetId}`;
                const response = await fetch(endpoint, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify(action.payload),
                });
                const data = await response.json().catch(() => null);
                if (!response.ok) throw new Error(data?.message || 'Falha ao sincronizar item pendente.');

                if (action.type === 'ATTENDANCE') {
                    nextAttendanceDetails[action.targetId] = data as AttendanceDetail;
                } else {
                    nextAssessmentDetails[action.targetId] = data as AssessmentDetail;
                }
            } catch {
                remaining.push(action);
            }
        }

        writeJson<QueueAction[]>(ACTION_QUEUE_KEY, remaining);
        snapshotRef.current = {
            ...snapshotRef.current,
            attendanceDetails: nextAttendanceDetails,
            assessmentDetails: nextAssessmentDetails,
        };
        setAttendanceDetails(nextAttendanceDetails);
        setAssessmentDetails(nextAssessmentDetails);
        setPendingActionCount(remaining.length);
        persistCache({
            attendanceDetails: nextAttendanceDetails,
            assessmentDetails: nextAssessmentDetails,
        });
    }, [persistCache]);

    const syncBaseData = useCallback(async (showLoader = false, referenceDate?: string) => {
        const { token, role } = getDashboardAuthContext();
        if (!token) {
            router.replace('/');
            return;
        }
        if (role !== 'PROFESSOR') {
            router.replace(getHomeRouteForRole(role));
            return;
        }

        if (showLoader) setIsLoading(true);
        setIsSyncing(true);
        setErrorStatus(null);

        try {
            const targetDate = referenceDate || snapshotRef.current.selectedDate;
            await flushReadQueue();
            await flushActionQueue();

            const [tenantResponse, teacherResponse, notificationsResponse, calendarResponse, assessmentEventsResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/tenants/current`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/teachers/me`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/notifications/my?status=ALL`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/lesson-events/my-calendar?view=MONTH&referenceDate=${targetDate}`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/lesson-assessments/my-events?status=ALL`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);

            const [tenantData, teacherData, notificationsData, calendarData, assessmentEventsData] = await Promise.all([
                tenantResponse.json().catch(() => null),
                teacherResponse.json().catch(() => null),
                notificationsResponse.json().catch(() => null),
                calendarResponse.json().catch(() => null),
                assessmentEventsResponse.json().catch(() => null),
            ]);

            if (!tenantResponse.ok) throw new Error(tenantData?.message || 'Nao foi possivel carregar a escola.');
            if (!teacherResponse.ok) throw new Error(teacherData?.message || 'Nao foi possivel carregar o professor.');
            if (!notificationsResponse.ok) throw new Error(notificationsData?.message || 'Nao foi possivel carregar as notificacoes.');
            if (!calendarResponse.ok) throw new Error(calendarData?.message || 'Nao foi possivel carregar a agenda.');
            if (!assessmentEventsResponse.ok) throw new Error(assessmentEventsData?.message || 'Nao foi possivel carregar as avaliacoes.');

            const syncedAt = new Date().toISOString();
            const nextNotifications = Array.isArray(notificationsData) ? notificationsData as NotificationItem[] : [];
            const nextCalendarItems = Array.isArray(calendarData?.items) ? calendarData.items as CalendarItem[] : [];
            const nextAssessmentEvents = Array.isArray(assessmentEventsData?.items) ? assessmentEventsData.items as AssessmentEvent[] : [];

            snapshotRef.current = {
                ...snapshotRef.current,
                tenant: tenantData,
                teacher: teacherData,
                notifications: nextNotifications,
                calendarItems: nextCalendarItems,
                assessmentEvents: nextAssessmentEvents,
                syncedAt,
            };

            setTenant(tenantData);
            setTeacher(teacherData);
            setNotifications(nextNotifications);
            setCalendarItems(nextCalendarItems);
            setAssessmentEvents(nextAssessmentEvents);
            setLastSyncAt(syncedAt);
            setIsOfflineMode(false);

            persistCache({
                tenant: tenantData,
                teacher: teacherData,
                notifications: nextNotifications,
                calendarItems: nextCalendarItems,
                assessmentEvents: nextAssessmentEvents,
                syncedAt,
            });
        } catch (error) {
            const cached = readJson<TeacherPayload | null>(CACHE_KEY, null);
            if (cached) {
                snapshotRef.current = {
                    ...snapshotRef.current,
                    tenant: cached.tenant,
                    teacher: cached.teacher,
                    notifications: cached.notifications || [],
                    calendarItems: cached.calendarItems || [],
                    assessmentEvents: cached.assessmentEvents || [],
                    attendanceDetails: cached.attendanceDetails || {},
                    assessmentDetails: cached.assessmentDetails || {},
                    syncedAt: cached.syncedAt || null,
                };
                setTenant(cached.tenant);
                setTeacher(cached.teacher);
                setNotifications(cached.notifications || []);
                setCalendarItems(cached.calendarItems || []);
                setAssessmentEvents(cached.assessmentEvents || []);
                setAttendanceDetails(cached.attendanceDetails || {});
                setAssessmentDetails(cached.assessmentDetails || {});
                setLastSyncAt(cached.syncedAt || null);
                setIsOfflineMode(true);
            }
            setErrorStatus(error instanceof Error ? error.message : 'Nao foi possivel sincronizar.');
        } finally {
            setPendingReadCount(readJson<string[]>(READ_QUEUE_KEY, []).length);
            setPendingActionCount(readJson<QueueAction[]>(ACTION_QUEUE_KEY, []).length);
            setIsLoading(false);
            setIsSyncing(false);
        }
    }, [flushActionQueue, flushReadQueue, persistCache, router]);

    const loadAttendanceDetail = useCallback(async (lessonId: string) => {
        if (!lessonId || snapshotRef.current.attendanceDetails[lessonId]) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;

        const { token } = getDashboardAuthContext();
        if (!token) return;
        const response = await fetch(`${API_BASE_URL}/lesson-attendances/by-lesson-item/${lessonId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || 'Nao foi possivel carregar a chamada.');

        const next = { ...snapshotRef.current.attendanceDetails, [lessonId]: data as AttendanceDetail };
        snapshotRef.current = {
            ...snapshotRef.current,
            attendanceDetails: next,
        };
        setAttendanceDetails(next);
        persistCache({ attendanceDetails: next });
    }, [persistCache]);

    const loadAssessmentDetail = useCallback(async (lessonEventId: string) => {
        if (!lessonEventId || snapshotRef.current.assessmentDetails[lessonEventId]) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;

        const { token } = getDashboardAuthContext();
        if (!token) return;
        const response = await fetch(`${API_BASE_URL}/lesson-assessments/by-event/${lessonEventId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || 'Nao foi possivel carregar as notas.');

        const next = { ...snapshotRef.current.assessmentDetails, [lessonEventId]: data as AssessmentDetail };
        snapshotRef.current = {
            ...snapshotRef.current,
            assessmentDetails: next,
        };
        setAssessmentDetails(next);
        persistCache({ assessmentDetails: next });
    }, [persistCache]);

    useEffect(() => {
        const { token, role } = getDashboardAuthContext();
        if (!token) {
            router.replace('/');
            return;
        }
        if (role !== 'PROFESSOR') {
            router.replace(getHomeRouteForRole(role));
            return;
        }

        const cached = readJson<TeacherPayload | null>(CACHE_KEY, null);
        if (cached) {
            setTenant(cached.tenant);
            setTeacher(cached.teacher);
            setNotifications(cached.notifications || []);
            setCalendarItems(cached.calendarItems || []);
            setAssessmentEvents(cached.assessmentEvents || []);
            setAttendanceDetails(cached.attendanceDetails || {});
            setAssessmentDetails(cached.assessmentDetails || {});
            setLastSyncAt(cached.syncedAt || null);
        }

        setPendingReadCount(readJson<string[]>(READ_QUEUE_KEY, []).length);
        setPendingActionCount(readJson<QueueAction[]>(ACTION_QUEUE_KEY, []).length);
        void syncBaseData(true);
    }, [router, syncBaseData]);

    useEffect(() => {
        const handleOnline = () => {
            setIsOfflineMode(false);
            void syncBaseData(false, snapshotRef.current.selectedDate);
        };
        const handleOffline = () => setIsOfflineMode(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [syncBaseData]);

    useEffect(() => {
        if (!selectedLessonId) return;
        void loadAttendanceDetail(selectedLessonId).catch((error) => {
            setErrorStatus(error instanceof Error ? error.message : 'Nao foi possivel carregar a chamada.');
        });
    }, [loadAttendanceDetail, selectedLessonId]);

    useEffect(() => {
        if (!selectedAssessmentId) return;
        void loadAssessmentDetail(selectedAssessmentId).catch((error) => {
            setErrorStatus(error instanceof Error ? error.message : 'Nao foi possivel carregar as notas.');
        });
    }, [loadAssessmentDetail, selectedAssessmentId]);

    useEffect(() => {
        if (!hasMountedDateSyncRef.current) {
            hasMountedDateSyncRef.current = true;
            return;
        }

        void syncBaseData(false, selectedDate);
    }, [selectedDate, syncBaseData]);

    const lessonsForDate = useMemo(
        () => calendarItems.filter((item) => item.lessonDate === selectedDate),
        [calendarItems, selectedDate],
    );
    const subjectOptions = useMemo(
        () => Array.from(new Set(lessonsForDate.map((item) => item.subjectName))),
        [lessonsForDate],
    );
    const classOptions = useMemo(
        () => Array.from(new Set(lessonsForDate.map((item) => `${item.seriesName} - ${item.className}`))),
        [lessonsForDate],
    );
    const filteredLessons = useMemo(
        () =>
            lessonsForDate.filter((item) => {
                const classLabel = `${item.seriesName} - ${item.className}`;
                return (!selectedSubject || item.subjectName === selectedSubject) && (!selectedClass || classLabel === selectedClass);
            }),
        [lessonsForDate, selectedClass, selectedSubject],
    );
    const currentAttendance = selectedLessonId ? attendanceDetails[selectedLessonId] || null : null;
    const currentAssessment = selectedAssessmentId ? assessmentDetails[selectedAssessmentId] || null : null;

    const updateAttendanceStudent = (studentId: string, field: 'status' | 'notes', value: string) => {
        if (!currentAttendance || !selectedLessonId) return;
        const next = {
            ...currentAttendance,
            students: currentAttendance.students.map((student) =>
                student.studentId === studentId ? { ...student, [field]: value } : student,
            ),
        };
        const nextDetails = { ...attendanceDetails, [selectedLessonId]: next };
        snapshotRef.current = {
            ...snapshotRef.current,
            attendanceDetails: nextDetails,
        };
        setAttendanceDetails(nextDetails);
        persistCache({ attendanceDetails: nextDetails });
    };

    const updateAssessmentStudent = (studentId: string, field: 'score' | 'remarks', value: string) => {
        if (!currentAssessment || !selectedAssessmentId) return;
        const next = {
            ...currentAssessment,
            students: currentAssessment.students.map((student) =>
                student.studentId === studentId
                    ? { ...student, [field]: field === 'score' ? (value ? Number(value.replace(',', '.')) : null) : value }
                    : student,
            ),
        };
        const nextDetails = { ...assessmentDetails, [selectedAssessmentId]: next };
        snapshotRef.current = {
            ...snapshotRef.current,
            assessmentDetails: nextDetails,
        };
        setAssessmentDetails(nextDetails);
        persistCache({ assessmentDetails: nextDetails });
    };

    const saveAttendance = async () => {
        if (!currentAttendance || !selectedLessonId) return;
        const payload: QueueAction = {
            type: 'ATTENDANCE',
            targetId: selectedLessonId,
            payload: {
                attendances: currentAttendance.students.map((student) => ({
                    studentId: student.studentId,
                    status: student.status || 'PRESENTE',
                    notes: student.notes || '',
                })),
                notifyStudents: attendanceNotifyStudents,
                notifyGuardians: attendanceNotifyGuardians,
            },
        };

        writeJson<QueueAction[]>(ACTION_QUEUE_KEY, [...readJson<QueueAction[]>(ACTION_QUEUE_KEY, []), payload]);
        setPendingActionCount(readJson<QueueAction[]>(ACTION_QUEUE_KEY, []).length);
        await flushActionQueue().catch(() => null);
    };

    const saveAssessment = async () => {
        if (!currentAssessment || !selectedAssessmentId) return;
        const payload: QueueAction = {
            type: 'ASSESSMENT',
            targetId: selectedAssessmentId,
            payload: {
                title: currentAssessment.assessment?.title || currentAssessment.lessonEvent.title,
                description: currentAssessment.assessment?.description || currentAssessment.lessonEvent.description || '',
                maxScore: currentAssessment.assessment?.maxScore != null ? String(currentAssessment.assessment.maxScore) : '10',
                notifyStudents: gradeNotifyStudents,
                notifyGuardians: gradeNotifyGuardians,
                notifyByEmail: gradeNotifyEmail,
                grades: currentAssessment.students.map((student) => ({
                    studentId: student.studentId,
                    score: student.score != null ? String(student.score).replace('.', ',') : '',
                    remarks: student.remarks || '',
                })),
            },
        };

        writeJson<QueueAction[]>(ACTION_QUEUE_KEY, [...readJson<QueueAction[]>(ACTION_QUEUE_KEY, []), payload]);
        setPendingActionCount(readJson<QueueAction[]>(ACTION_QUEUE_KEY, []).length);
        await flushActionQueue().catch(() => null);
    };

    const markAsRead = async (notificationId: string) => {
        const target = notifications.find((notification) => notification.id === notificationId);
        if (!target || target.readAt) return;
        const now = new Date().toISOString();
        const nextNotifications = notifications.map((notification) =>
            notification.id === notificationId ? { ...notification, readAt: now } : notification,
        );
        snapshotRef.current = {
            ...snapshotRef.current,
            notifications: nextNotifications,
        };
        setNotifications(nextNotifications);
        writeJson<string[]>(READ_QUEUE_KEY, [...readJson<string[]>(READ_QUEUE_KEY, []), notificationId]);
        setPendingReadCount(readJson<string[]>(READ_QUEUE_KEY, []).length);
        persistCache({ notifications: nextNotifications });
        await flushReadQueue().catch(() => null);
    };

    if (isLoading && !teacher) {
        return <main className="min-h-screen bg-slate-100 px-4 py-8"><div className="mx-auto max-w-md rounded-[28px] border border-slate-200 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500 shadow-sm">Carregando painel do professor...</div></main>;
    }

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,116,144,0.18),_transparent_35%),linear-gradient(180deg,#ecfeff_0%,#f8fafc_36%,#e2e8f0_100%)] px-4 py-5">
            <div className="mx-auto max-w-md space-y-4">
                <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
                    <div className="bg-[linear-gradient(135deg,#0f766e_0%,#0f172a_100%)] px-5 py-5 text-white">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/10">
                                    {tenant?.logoUrl ? (
                                        <Image
                                            src={tenant.logoUrl}
                                            alt={`Logo de ${tenant?.name || 'ESCOLA'}`}
                                            width={48}
                                            height={48}
                                            className="h-full w-full object-contain p-2"
                                        />
                                    ) : (
                                        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100">
                                            {tenant?.name ? tenant.name.slice(0, 3).toUpperCase() : 'ESC'}
                                        </span>
                                    )}
                                </div>
                                <div className="pt-1">
                                    <div className="text-sm font-medium text-cyan-100">{tenant?.name || 'ESCOLA'}</div>
                                    <div className="mt-1 text-sm font-extrabold">
                                        <span className="mr-2 text-cyan-100">PROFESSOR</span>
                                        <span className="text-white">{teacher?.name || 'PROFESSOR'}</span>
                                    </div>
                                </div>
                            </div>
                            <button type="button" onClick={() => { clearStoredSession(); router.replace('/'); }} className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em]">Sair</button>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.16em]">
                            <div className={`rounded-full px-3 py-1 ${isOfflineMode ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'}`}>{isOfflineMode ? 'Modo offline' : 'Online'}</div>
                            <div className="rounded-full bg-white/10 px-3 py-1">{pendingActionCount} sincronizacao(oes) pendente(s)</div>
                            {pendingReadCount ? <div className="rounded-full bg-yellow-300 px-3 py-1 text-slate-900">{pendingReadCount} leitura(s) pendente(s)</div> : null}
                        </div>
                    </div>
                    <div className="px-5 py-4">
                        <div className="flex gap-2">
                            <button type="button" onClick={() => void syncBaseData(false)} disabled={isSyncing} className="flex-1 rounded-2xl bg-cyan-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{isSyncing ? 'Sincronizando...' : 'Atualizar'}</button>
                            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700" />
                        </div>
                        <div className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Ultima sincronizacao: {lastSyncAt ? fmtDate(lastSyncAt) : 'AGUARDANDO'}</div>
                        {errorStatus ? <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{errorStatus}</div> : null}
                    </div>

                    <div className="mt-3 border-t border-slate-100 px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">{SCREEN_NAME}</span>
                            <button
                                type="button"
                                onClick={() => void copyScreenNameToClipboard()}
                                aria-label="Copiar nome da tela"
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700"
                            >
                                {copiedScreenName ? (
                                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2.2]" aria-hidden="true">
                                        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2]" aria-hidden="true">
                                        <rect x="9" y="9" width="10" height="10" rx="2" />
                                        <path d="M7 15H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-2 gap-2">
                    {[
                        { key: 'notificacoes', label: 'notificações' },
                        { key: 'chamada', label: 'chamada' },
                        { key: 'notas', label: 'notas' },
                        { key: 'agenda', label: 'agenda' },
                    ].map((tab) => (
                        <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key as 'notificacoes' | 'chamada' | 'notas' | 'agenda')} className={`rounded-2xl px-3 py-3 text-sm font-black uppercase tracking-[0.14em] ${activeTab === tab.key ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white/80 text-slate-600'}`}>
                            {tab.label}
                        </button>
                    ))}
                </section>

                {activeTab === 'notificacoes' ? (
                    <section className="space-y-3">
                        {notifications.length ? notifications.map((notification) => (
                            <article key={notification.id} className={`rounded-[28px] border px-5 py-4 shadow-sm ${notification.readAt ? 'border-slate-200 bg-white/75' : 'border-cyan-200 bg-white'}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-700">{notification.category.replace(/_/g, ' ')}</div>
                                        <h2 className="mt-2 text-lg font-extrabold text-slate-800">{notification.title}</h2>
                                        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{notification.message}</p>
                                        <div className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{fmtDate(notification.createdAt)}</div>
                                    </div>
                                        {!notification.readAt ? (
                                            <button type="button" onClick={() => void markAsRead(notification.id)} className="rounded-2xl bg-cyan-700 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white">
                                                Marcar como visualizada
                                            </button>
                                        ) : (
                                            <button type="button" onClick={() => void markAsRead(notification.id)} className="rounded-2xl bg-emerald-600 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white">
                                                Visualizada
                                            </button>
                                        )}
                                    </div>
                                </article>
                            )) : <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center text-sm font-semibold text-slate-500">Nenhuma notificacao encontrada.</div>}
                    </section>
                ) : null}

                {activeTab === 'chamada' ? (
                    <section className="space-y-3">
                        <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
                            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Selecionar aula</div>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <select value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700">
                                    <option value="">Todas as materias</option>
                                    {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                                </select>
                                <select value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700">
                                    <option value="">Todas as turmas</option>
                                    {classOptions.map((classLabel) => <option key={classLabel} value={classLabel}>{classLabel}</option>)}
                                </select>
                            </div>
                            <div className="mt-4 space-y-2">
                                {filteredLessons.length ? filteredLessons.map((item) => (
                                    <button key={item.id} type="button" onClick={() => setSelectedLessonId(item.id)} className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left ${selectedLessonId === item.id ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-slate-50'}`}>
                                        <div><div className="text-sm font-extrabold text-slate-800">{item.subjectName}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.seriesName} - {item.className} • {item.startTime} - {item.endTime}</div></div>
                                        <div className="text-xs font-black uppercase tracking-[0.14em] text-cyan-700">{fmtDateOnly(item.lessonDate)}</div>
                                    </button>
                                )) : <div className="text-sm font-semibold text-slate-500">Nenhuma aula encontrada para o filtro escolhido.</div>}
                            </div>
                        </div>

                        {currentAttendance ? (
                            <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div><div className="text-lg font-extrabold text-slate-800">{currentAttendance.lessonItem.subjectName}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{currentAttendance.lessonItem.seriesName} - {currentAttendance.lessonItem.className} • {currentAttendance.lessonItem.startTime} - {currentAttendance.lessonItem.endTime}</div></div>
                                    <div className="rounded-2xl bg-cyan-50 px-3 py-2 text-sm font-black text-cyan-700">{currentAttendance.summary.totalStudents} aluno(s)</div>
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => setAttendanceNotifyStudents((current) => !current)} className={`rounded-2xl px-3 py-3 text-sm font-bold ${attendanceNotifyStudents ? 'bg-cyan-700 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600'}`}>Avisar alunos</button>
                                    <button type="button" onClick={() => setAttendanceNotifyGuardians((current) => !current)} className={`rounded-2xl px-3 py-3 text-sm font-bold ${attendanceNotifyGuardians ? 'bg-cyan-700 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600'}`}>Avisar responsaveis</button>
                                </div>

                                <div className="mt-4 space-y-3">
                                    {currentAttendance.students.map((student) => (
                                        <div key={student.studentId} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="text-sm font-extrabold text-slate-800">{student.studentName}</div>
                                                <div className="flex gap-2">
                                                    <button type="button" onClick={() => updateAttendanceStudent(student.studentId, 'status', 'PRESENTE')} className={`rounded-2xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] ${student.status !== 'FALTOU' ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>Presente</button>
                                                    <button type="button" onClick={() => updateAttendanceStudent(student.studentId, 'status', 'FALTOU')} className={`rounded-2xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] ${student.status === 'FALTOU' ? 'bg-rose-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>Faltou</button>
                                                </div>
                                            </div>
                                            <input type="text" value={student.notes || ''} onChange={(event) => updateAttendanceStudent(student.studentId, 'notes', event.target.value)} placeholder="Observacao da chamada" className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700" />
                                        </div>
                                    ))}
                                </div>

                                <button type="button" onClick={() => void saveAttendance()} className="mt-4 w-full rounded-2xl bg-cyan-700 px-4 py-3 text-sm font-bold text-white">Salvar chamada</button>
                            </section>
                        ) : null}
                    </section>
                ) : null}

                {activeTab === 'notas' ? (
                    <section className="space-y-3">
                        <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
                            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Avaliacoes marcadas</div>
                            <div className="mt-4 space-y-2">
                                {assessmentEvents.length ? assessmentEvents.map((event) => (
                                    <button key={event.lessonEventId} type="button" onClick={() => setSelectedAssessmentId(event.lessonEventId)} className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left ${selectedAssessmentId === event.lessonEventId ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-slate-50'}`}>
                                        <div><div className="text-sm font-extrabold text-slate-800">{event.title}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{event.subjectName} • {event.seriesName} - {event.className}</div></div>
                                        <div className="rounded-2xl bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700">{event.pendingStudentsCount} pendente(s)</div>
                                    </button>
                                )) : <div className="text-sm font-semibold text-slate-500">Nenhuma prova ou trabalho marcado ainda.</div>}
                            </div>
                        </div>

                        {currentAssessment ? (
                            <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div><div className="text-lg font-extrabold text-slate-800">{currentAssessment.lessonEvent.title}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{currentAssessment.lessonItem.subjectName} • {currentAssessment.lessonItem.seriesName} - {currentAssessment.lessonItem.className}</div></div>
                                    <div className="rounded-2xl bg-cyan-50 px-3 py-2 text-sm font-black text-cyan-700">{currentAssessment.students.length} aluno(s)</div>
                                </div>

                                <div className="mt-4 grid grid-cols-3 gap-2">
                                    <button type="button" onClick={() => setGradeNotifyStudents((current) => !current)} className={`rounded-2xl px-3 py-3 text-sm font-bold ${gradeNotifyStudents ? 'bg-cyan-700 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600'}`}>Avisar alunos</button>
                                    <button type="button" onClick={() => setGradeNotifyGuardians((current) => !current)} className={`rounded-2xl px-3 py-3 text-sm font-bold ${gradeNotifyGuardians ? 'bg-cyan-700 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600'}`}>Avisar responsaveis</button>
                                    <button type="button" onClick={() => setGradeNotifyEmail((current) => !current)} className={`rounded-2xl px-3 py-3 text-sm font-bold ${gradeNotifyEmail ? 'bg-cyan-700 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600'}`}>Enviar email</button>
                                </div>

                                <div className="mt-4 space-y-3">
                                    {currentAssessment.students.map((student) => (
                                        <div key={student.studentId} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                            <div className="text-sm font-extrabold text-slate-800">{student.studentName}</div>
                                            <div className="mt-3 grid grid-cols-[120px_1fr] gap-3">
                                                <input type="text" value={student.score ?? ''} onChange={(event) => updateAssessmentStudent(student.studentId, 'score', event.target.value)} placeholder="Nota" className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700" />
                                                <input type="text" value={student.remarks || ''} onChange={(event) => updateAssessmentStudent(student.studentId, 'remarks', event.target.value)} placeholder="Observacao" className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700" />
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <button type="button" onClick={() => void saveAssessment()} className="mt-4 w-full rounded-2xl bg-cyan-700 px-4 py-3 text-sm font-bold text-white">Salvar notas</button>
                            </section>
                        ) : null}
                    </section>
                ) : null}

                {activeTab === 'agenda' ? (
                    <section className="space-y-3 rounded-[28px] border border-slate-200 bg-white shadow-sm">
                        <TeacherDailyAgendaPanel />
                    </section>
                ) : null}
            </div>
        </main>
    );
}
