'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { clearStoredSession } from '@/app/lib/auth-storage';
import { getDashboardAuthContext, getHomeRouteForRole } from '@/app/lib/dashboard-crud-utils';
import ScreenNameCopy from '@/app/components/screen-name-copy';

const API_BASE_URL = 'http://localhost:3001/api/v1';
const CACHE_KEY = '@Escola-PWA-Guardian-Cache:v1';
const READ_QUEUE_KEY = '@Escola-PWA-Guardian-Read-Queue:v1';
const DELETE_QUEUE_KEY = '@Escola-PWA-Guardian-Delete-Queue:v1';

type NotificationItem = {
    id: string;
    title: string;
    message: string;
    category: string;
    metadata?: string | null;
    readAt?: string | null;
    createdAt: string;
};

type NotificationFilter = 'TODAS' | 'CHAMADA' | 'AVALIACAO' | 'COMUNICADO' | 'AGENDA' | 'OUTRAS';
type ReadStatusFilter = 'NAO_LIDAS' | 'LIDAS' | 'LIDAS_NAO_LIDAS';
type AttendanceFilter = 'PRESENTE' | 'FALTOU';

type GuardianSummarySubject = {
    subjectId?: string | null;
    subjectName?: string | null;
    teacherName?: string | null;
    averageScore?: number | null;
    totalReleasedGrades?: number | null;
    latestReleasedAt?: string | null;
    assessments?: Array<{
        id: string;
        title: string;
        assessmentType: string;
        score?: number | null;
        maxScore?: number | null;
        remarks?: string | null;
        releasedAt?: string | null;
        lessonDate?: string | null;
        schoolYear?: number | null;
    }> | null;
};

type GuardianStudentIdentity = {
    id?: string | null;
    name?: string | null;
};

type GuardianStudentPwaSummary = {
    student?: GuardianStudentIdentity | null;
    currentEnrollment?: {
        schoolYear?: number | null;
        seriesName?: string | null;
        className?: string | null;
        shift?: string | null;
    } | null;
    attendance?: {
        totalLessons?: number | null;
        totalPresent?: number | null;
        totalAbsent?: number | null;
        overallFrequency?: number | null;
    } | null;
    grades?: {
        totalReleasedGrades?: number | null;
        overallAverage?: number | null;
        bySubject?: GuardianSummarySubject[] | null;
    } | null;
} | null;

type GuardianSummaryStudent = {
    student?: GuardianStudentPwaSummary;
    id: string;
    kinship?: string | null;
    kinshipDescription?: string | null;
};

type GuardianSummaryPayload = {
    guardian?: {
        name?: string | null;
    } | null;
    students?: GuardianSummaryStudent[] | null;
};

type GuardianSchedulePayload = {
    students?: unknown[] | null;
} | null;

type GuardianPayload = {
    tenant: { id: string; name: string; logoUrl?: string | null } | null;
    summary: GuardianSummaryPayload | null;
    schedule: GuardianSchedulePayload;
    notifications: NotificationItem[];
    syncedAt: string;
};

function readCache() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) as GuardianPayload : null;
    } catch {
        return null;
    }
}

function saveCache(payload: GuardianPayload) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

function readQueue() {
    if (typeof window === 'undefined') return [] as string[];
    try {
        const raw = localStorage.getItem(READ_QUEUE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

function saveQueue(ids: string[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(READ_QUEUE_KEY, JSON.stringify(Array.from(new Set(ids))));
}

function readDeleteQueue() {
    if (typeof window === 'undefined') return [] as string[];
    try {
        const raw = localStorage.getItem(DELETE_QUEUE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

function saveDeleteQueue(ids: string[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(DELETE_QUEUE_KEY, JSON.stringify(Array.from(new Set(ids))));
}

function fmtDate(value?: string | null) {
    if (!value) return 'NAO INFORMADO';
    return new Date(value).toLocaleString('pt-BR');
}

function fmtScore(value?: number | null) {
    return typeof value === 'number'
        ? value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
        : 'SEM NOTA';
}

function fmtPercent(value?: number | null) {
    return `${(typeof value === 'number' ? value : 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function getKinshipLabel(item?: { kinship?: string | null; kinshipDescription?: string | null }) {
    if (!item) return 'RESPONSAVEL';
    if (item.kinship === 'OUTROS' && item.kinshipDescription) return item.kinshipDescription;
    return item.kinship || 'RESPONSAVEL';
}

function normalizeNotifications(input: unknown): NotificationItem[] {
    if (!Array.isArray(input)) return [];
    return input.map((item) => ({
        id: String(item?.id || ''),
        title: String(item?.title || 'NOTIFICACAO'),
        message: String(item?.message || ''),
        category: String(item?.category || 'GERAL'),
        metadata: typeof item?.metadata === 'string' ? item.metadata : null,
        readAt: typeof item?.readAt === 'string' ? item.readAt : null,
        createdAt: String(item?.createdAt || new Date().toISOString()),
    }));
}

function getNotificationFilter(category: string): NotificationFilter {
    switch (String(category || '').trim().toUpperCase()) {
        case 'CHAMADA':
            return 'CHAMADA';
        case 'AVALIACAO':
            return 'AVALIACAO';
        case 'COMUNICADO':
        case 'COMUNICADO_ESCOLAR':
            return 'COMUNICADO';
        case 'AGENDA_ESCOLAR':
            return 'AGENDA';
        default:
            return 'OUTRAS';
    }
}

function getNotificationFilterLabel(filter: NotificationFilter) {
    switch (filter) {
        case 'TODAS':
            return 'TODAS';
        case 'CHAMADA':
            return 'CHAMADA';
        case 'AVALIACAO':
            return 'AVALIAÇÃO';
        case 'COMUNICADO':
            return 'COMUNICADO';
        case 'AGENDA':
            return 'AGENDA';
        default:
            return 'OUTRAS';
    }
}

function getNotificationCategoryLabel(category: string) {
    return getNotificationFilterLabel(getNotificationFilter(category));
}

function isAttendancePresentNotification(notification: NotificationItem) {
    return (
        getNotificationFilter(notification.category) === 'CHAMADA' &&
        notification.title.trim().toUpperCase() === 'CHAMADA REGISTRADA: PRESENTE'
    );
}

function getAttendanceNotificationStatus(notification: NotificationItem): AttendanceFilter | null {
    if (getNotificationFilter(notification.category) !== 'CHAMADA') return null;

    const normalizedText = `${notification.title} ${notification.message}`.toUpperCase();
    if (normalizedText.includes('PRESENTE')) return 'PRESENTE';
    if (normalizedText.includes('FALTOU') || normalizedText.includes('FALTA') || normalizedText.includes('AUSENTE')) return 'FALTOU';
    return null;
}

function safeParseMetadata(value?: string | null) {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function removeGuardianNameFromMessage(message: string) {
    return message.replace(/\s*PROFESSOR RESPONS[AÁ]VEL:\s*[^.]+\.?/i, '').trim();
}

function extractTeacherNameFromMessage(message: string) {
    const match = message.match(/\s*PROFESSOR RESPONS[AÁ]VEL:\s*([^.]+)\.?/i);
    return match?.[1]?.trim() || null;
}

function removeStudentNameFromAttendanceMessage(message: string, studentName: string) {
    if (!studentName) return message;
    return message
        .replace(new RegExp(`A PRESENÇA DE\\s+${studentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+FOI REGISTRADA`, 'i'), 'A PRESENÇA FOI REGISTRADA')
        .replace(new RegExp(`A PRESENÇA DE\\s+${studentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), 'A PRESENÇA')
        .trim();
}

function formatAssessmentScore(score?: number | null, maxScore?: number | null) {
    if (typeof score !== 'number') return 'SEM NOTA';
    const scoreText = score.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    if (typeof maxScore !== 'number') return scoreText;
    return `${scoreText} / ${maxScore.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
}

function formatAssessmentDate(value?: string | null) {
    if (!value) return 'DATA NÃO INFORMADA';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'DATA NÃO INFORMADA';
    return date.toLocaleDateString('pt-BR');
}

function getCurrentRoleLabel(role?: string | null) {
    switch (role) {
        case 'PROFESSOR':
            return 'PROFESSOR';
        case 'ALUNO':
            return 'ALUNO';
        case 'RESPONSAVEL':
            return 'RESPONSAVEL';
        default:
            return role || 'PERFIL';
    }
}

function extractAssessmentText(value: string, labels: string[]) {
    const normalized = value.replace(/\r/g, '\n');
    for (const label of labels) {
        const pattern = new RegExp(`${label}\\s*:\\s*([^\\n]+)`, 'i');
        const match = normalized.match(pattern);
        if (match?.[1]) return match[1].trim();
    }
    return '';
}

export default function ResponsavelPwaPage() {
    const router = useRouter();
    const { role: currentRole } = getDashboardAuthContext();
    const [tenant, setTenant] = useState<GuardianPayload['tenant']>(null);
    const [summary, setSummary] = useState<GuardianSummaryPayload | null>(null);
    const [schedule, setSchedule] = useState<GuardianSchedulePayload>(null);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [activeTab, setActiveTab] = useState<'notificacoes' | 'alunos'>('notificacoes');
    const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>('TODAS');
    const [readStatusFilter, setReadStatusFilter] = useState<ReadStatusFilter>('LIDAS_NAO_LIDAS');
    const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter | null>(null);
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isOfflineMode, setIsOfflineMode] = useState(false);
    const [pendingReadCount, setPendingReadCount] = useState(0);
    const [pendingDeleteCount, setPendingDeleteCount] = useState(0);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [attendanceDeleteTarget, setAttendanceDeleteTarget] = useState<NotificationItem | null>(null);

    const flushReadQueue = useCallback(async () => {
        const queue = readQueue();
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

        saveQueue([]);
        setPendingReadCount(0);
    }, []);

    const flushDeleteQueue = useCallback(async () => {
        const queue = readDeleteQueue();
        setPendingDeleteCount(queue.length);
        if (!queue.length || typeof navigator === 'undefined' || !navigator.onLine) return;

        const { token } = getDashboardAuthContext();
        if (!token) return;

        const remainingIds: string[] = [];
        for (const notificationId of queue) {
            const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/remove-attendance`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
            });
            await response.json().catch(() => null);
            if (!response.ok) {
                remainingIds.push(notificationId);
                continue;
            }
        }

        saveDeleteQueue(remainingIds);
        setPendingDeleteCount(remainingIds.length);
    }, []);

    const syncData = useCallback(async (showLoader = false) => {
        const { token, role } = getDashboardAuthContext();
        if (!token) {
            router.replace('/');
            return;
        }
        if (role !== 'RESPONSAVEL') {
            router.replace(getHomeRouteForRole(role));
            return;
        }

        if (showLoader) setIsLoading(true);
        setIsSyncing(true);
        setErrorStatus(null);

        try {
            await flushReadQueue();
            await flushDeleteQueue();
            const [tenantResponse, summaryResponse, scheduleResponse, notificationsResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/tenants/current`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/guardians/me/pwa-summary`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/class-schedule-items/me`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/notifications/my?status=ALL`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);

            const [tenantData, summaryData, scheduleData, notificationsData] = await Promise.all([
                tenantResponse.json().catch(() => null),
                summaryResponse.json().catch(() => null),
                scheduleResponse.json().catch(() => null),
                notificationsResponse.json().catch(() => null),
            ]);

            if (!tenantResponse.ok) throw new Error(tenantData?.message || 'Nao foi possivel carregar a escola.');
            if (!summaryResponse.ok) throw new Error(summaryData?.message || 'Nao foi possivel carregar os dados do responsavel.');
            if (!scheduleResponse.ok) throw new Error(scheduleData?.message || 'Nao foi possivel carregar os horarios.');
            if (!notificationsResponse.ok) throw new Error(notificationsData?.message || 'Nao foi possivel carregar as notificacoes.');

            const nextNotifications = normalizeNotifications(notificationsData);
            const syncedAt = summaryData?.syncedAt || new Date().toISOString();
            setTenant(tenantData);
            setSummary(summaryData);
            setSchedule(scheduleData);
            setNotifications(nextNotifications);
            setLastSyncAt(syncedAt);
            setIsOfflineMode(false);
            saveCache({ tenant: tenantData, summary: summaryData, schedule: scheduleData, notifications: nextNotifications, syncedAt });
        } catch (error) {
            const cached = readCache();
            if (cached) {
                setTenant(cached.tenant);
                setSummary(cached.summary);
                setSchedule(cached.schedule);
                setNotifications(cached.notifications);
                setLastSyncAt(cached.syncedAt);
                setIsOfflineMode(true);
            }
            setErrorStatus(error instanceof Error ? error.message : 'Nao foi possivel sincronizar.');
        } finally {
            setPendingReadCount(readQueue().length);
            setPendingDeleteCount(readDeleteQueue().length);
            setIsLoading(false);
            setIsSyncing(false);
        }
    }, [flushDeleteQueue, flushReadQueue, router]);

    useEffect(() => {
        const { token, role } = getDashboardAuthContext();
        if (!token) {
            router.replace('/');
            return;
        }
        if (role !== 'RESPONSAVEL') {
            router.replace(getHomeRouteForRole(role));
            return;
        }

        const cached = readCache();
        if (cached) {
            setTenant(cached.tenant);
            setSummary(cached.summary);
            setSchedule(cached.schedule);
            setNotifications(cached.notifications);
            setLastSyncAt(cached.syncedAt);
        }

        setPendingReadCount(readQueue().length);
        setPendingDeleteCount(readDeleteQueue().length);
        void syncData(true);
    }, [router, syncData]);

    useEffect(() => {
        const handleOnline = () => {
            setIsOfflineMode(false);
            void syncData(false);
        };
        const handleOffline = () => setIsOfflineMode(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [syncData]);

    const markAsRead = async (notificationId: string) => {
        const target = notifications.find((notification) => notification.id === notificationId);
        if (!target || target.readAt) return;

        const now = new Date().toISOString();
        const nextNotifications = notifications.map((notification) =>
            notification.id === notificationId ? { ...notification, readAt: now } : notification,
        );

        setNotifications(nextNotifications);
        saveQueue([...readQueue(), notificationId]);
        setPendingReadCount(readQueue().length);
        if (lastSyncAt) {
            saveCache({ tenant, summary, schedule, notifications: nextNotifications, syncedAt: lastSyncAt });
        }

        try {
            await flushReadQueue();
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Leitura salva para sincronizar depois.');
        }
    };

    const markAsUnread = async (notificationId: string) => {
        const target = notifications.find((notification) => notification.id === notificationId);
        if (!target || !target.readAt) return;

        try {
            setIsSyncing(true);
            setErrorStatus(null);
            const { token } = getDashboardAuthContext();
            if (!token) {
                router.replace('/');
                return;
            }

            const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/unread`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Nao foi possivel retornar a notificacao para nao lida.');

            const nextNotifications = notifications.map((notification) =>
                notification.id === notificationId ? { ...notification, readAt: null } : notification,
            );

            setNotifications(nextNotifications);
            saveQueue(readQueue().filter((id) => id !== notificationId));
            setPendingReadCount(readQueue().length);
            if (lastSyncAt) {
                saveCache({ tenant, summary, schedule, notifications: nextNotifications, syncedAt: lastSyncAt });
            }
            window.dispatchEvent(new Event('notifications-updated'));
            void syncData(false);
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Nao foi possivel retornar a notificacao para nao lida.');
        } finally {
            setIsSyncing(false);
        }
    };

    const removeAttendanceNotification = async (notificationId: string) => {
        const target = notifications.find((notification) => notification.id === notificationId);
        if (!target || !target.readAt || getNotificationFilter(target.category) !== 'CHAMADA') return;

        const previousNotifications = notifications;
        const nextNotifications = notifications.filter((notification) => notification.id !== notificationId);
        const nextReadQueue = readQueue().filter((id) => id !== notificationId);
        const nextDeleteQueue = Array.from(new Set([...readDeleteQueue(), notificationId]));

        setNotifications(nextNotifications);
        saveQueue(nextReadQueue);
        saveDeleteQueue(nextDeleteQueue);
        setPendingReadCount(nextReadQueue.length);
        setPendingDeleteCount(nextDeleteQueue.length);
        if (lastSyncAt) {
            saveCache({ tenant, summary, schedule, notifications: nextNotifications, syncedAt: lastSyncAt });
        }

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            setErrorStatus('Exclusao salva para sincronizar depois.');
            setAttendanceDeleteTarget(null);
            return;
        }

        try {
            setIsSyncing(true);
            setErrorStatus(null);
            const { token } = getDashboardAuthContext();
            if (!token) {
                router.replace('/');
                return;
            }

            const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/remove-attendance`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Nao foi possivel excluir a notificacao de presenca.');

            const remainingDeleteQueue = readDeleteQueue().filter((id) => id !== notificationId);
            saveDeleteQueue(remainingDeleteQueue);
            setPendingDeleteCount(remainingDeleteQueue.length);
            if (lastSyncAt) {
                saveCache({ tenant, summary, schedule, notifications: nextNotifications, syncedAt: lastSyncAt });
            }
            window.dispatchEvent(new Event('notifications-updated'));
            void syncData(false);
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Nao foi possivel excluir a notificacao de presenca.');
            setNotifications(previousNotifications);
            if (lastSyncAt) {
                saveCache({ tenant, summary, schedule, notifications: previousNotifications, syncedAt: lastSyncAt });
            }
        } finally {
            setIsSyncing(false);
        }
    };

    const markAllAsRead = async () => {
        if (!notifications.some((notification) => !notification.readAt)) return;

        try {
            setIsSyncing(true);
            setErrorStatus(null);
            const { token } = getDashboardAuthContext();
            if (!token) {
                router.replace('/');
                return;
            }

            const response = await fetch(`${API_BASE_URL}/notifications/my/read-all`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Nao foi possivel marcar todas as notificacoes como lidas.');

            const now = new Date().toISOString();
            const nextNotifications = notifications.map((notification) =>
                notification.readAt ? notification : { ...notification, readAt: now },
            );
            setNotifications(nextNotifications);
            setPendingReadCount(0);
            if (lastSyncAt) {
                saveCache({ tenant, summary, schedule, notifications: nextNotifications, syncedAt: lastSyncAt });
            }
            window.dispatchEvent(new Event('notifications-updated'));
            void syncData(false);
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Nao foi possivel marcar todas as notificacoes como lidas.');
        } finally {
            setIsSyncing(false);
        }
    };

    if (isLoading && !summary) {
        return <main className="min-h-screen bg-slate-100 px-4 py-8"><div className="mx-auto max-w-md rounded-[28px] border border-slate-200 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500 shadow-sm">Carregando painel do responsavel...</div></main>;
    }

    const unreadCount = notifications.filter((notification) => !notification.readAt).length;
    const notificationCounts = notifications.reduce<Record<NotificationFilter, number>>((acc, notification) => {
        const bucket = getNotificationFilter(notification.category);
        acc[bucket] += 1;
        acc.TODAS += 1;
        return acc;
    }, {
        TODAS: 0,
        CHAMADA: 0,
        AVALIACAO: 0,
        COMUNICADO: 0,
        AGENDA: 0,
        OUTRAS: 0,
    });
    const filteredNotifications = notificationFilter === 'TODAS'
        ? notifications
        : notifications.filter((notification) => getNotificationFilter(notification.category) === notificationFilter);
    const orderedNotifications = [...filteredNotifications].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const visibleNotifications = readStatusFilter === 'LIDAS_NAO_LIDAS'
        ? orderedNotifications
        : orderedNotifications.filter((notification) =>
            readStatusFilter === 'NAO_LIDAS'
                ? !notification.readAt
                : Boolean(notification.readAt),
        );
    const attendanceVisibleNotifications = notificationFilter === 'CHAMADA' && attendanceFilter
        ? visibleNotifications.filter((notification) => getAttendanceNotificationStatus(notification) === attendanceFilter)
        : visibleNotifications;
    const readCount = notifications.filter((notification) => notification.readAt).length;
    const studentNameById = new Map(
        (summary?.students || [])
            .map((item) => [String(item?.student?.student?.id || ''), String(item?.student?.student?.name || '')] as const)
            .filter(([id, name]) => Boolean(id) && Boolean(name)),
    );

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(29,78,216,0.16),_transparent_35%),linear-gradient(180deg,#eff6ff_0%,#f8fafc_36%,#e2e8f0_100%)] px-4 py-5">
            <div className="mx-auto max-w-md space-y-4">
                <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
                    <div className="bg-[linear-gradient(135deg,#0f766e_0%,#0f172a_100%)] px-5 py-5 text-white">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-3">
                                    {tenant?.logoUrl ? (
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/10">
                                            <Image
                                                src={tenant.logoUrl}
                                                alt={tenant?.name || 'ESCOLA'}
                                                width={48}
                                                height={48}
                                                className="h-full w-full object-contain p-1"
                                            />
                                        </div>
                                    ) : null}
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium text-emerald-100">{tenant?.name || 'ESCOLA'}</div>
                                    </div>
                                </div>
                                <div className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-white/10 px-3 py-2">
                                    <div className="min-w-0 flex-1 text-sm font-extrabold leading-tight text-white">
                                        {summary?.guardian?.name || 'RESPONSAVEL'}
                                    </div>
                                    <div className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100">
                                        {getCurrentRoleLabel(currentRole)}
                                    </div>
                                </div>
                            </div>
                            <button type="button" onClick={() => { clearStoredSession(); router.replace('/'); }} className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em]">Sair</button>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.16em]">
                            <div className={`rounded-full px-3 py-1 ${isOfflineMode ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'}`}>{isOfflineMode ? 'Modo offline' : 'Online'}</div>
                            <div className="rounded-full bg-white/10 px-3 py-1">{summary?.students?.length || 0} aluno(s)</div>
                            {pendingReadCount ? <div className="rounded-full bg-yellow-300 px-3 py-1 text-slate-900">{pendingReadCount} leitura(s) pendente(s)</div> : null}
                            {pendingDeleteCount ? <div className="rounded-full bg-rose-200 px-3 py-1 text-rose-900">{pendingDeleteCount} exclusao(oes) pendente(s)</div> : null}
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2">
                            <div className="rounded-2xl bg-white/10 px-3 py-3"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-100">Nao lidas</div><div className="mt-2 text-2xl font-extrabold">{unreadCount}</div></div>
                            <div className="rounded-2xl bg-white/10 px-3 py-3"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-100">Sincronizado</div><div className="mt-2 text-sm font-extrabold">{lastSyncAt ? fmtDate(lastSyncAt) : 'AGUARDANDO'}</div></div>
                            <div className="rounded-2xl bg-white/10 px-3 py-3"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-100">Horario</div><div className="mt-2 text-sm font-extrabold">{schedule?.students?.length || 0} vinculo(s)</div></div>
                        </div>
                    </div>
                    <div className="px-5 py-4">
                        <div className="flex gap-2">
                            <button type="button" onClick={() => void syncData(false)} disabled={isSyncing} className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</button>
                        </div>
                        <div className="mt-3 flex justify-end">
                            <ScreenNameCopy screenId="PRINCIPAL_RESPONSAVEL_PWA" disableMargin className="w-auto" />
                        </div>
                        {errorStatus ? <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{errorStatus}</div> : null}
                    </div>
                </section>

                <section className="grid grid-cols-2 gap-2">
                    {['notificacoes', 'alunos'].map((tab) => (
                        <button key={tab} type="button" onClick={() => setActiveTab(tab as 'notificacoes' | 'alunos')} className={`rounded-2xl px-3 py-3 text-sm font-black uppercase tracking-[0.14em] ${activeTab === tab ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white/80 text-slate-600'}`}>
                            {tab}
                        </button>
                    ))}
                </section>

                {activeTab === 'notificacoes' ? (
                    <section className="space-y-3">
                        <div className="rounded-[28px] border border-slate-200 bg-white/85 px-5 py-4 shadow-sm">
                            <div className="flex flex-col gap-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Centro de notificações</div>
                                        <h2 className="mt-1 text-xl font-extrabold text-slate-800">Notificações</h2>
                                        <p className="mt-1 text-sm font-medium text-slate-500">Filtre por tipo sem sair desta tela.</p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 px-3 py-2 text-right">
                                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Exibindo</div>
                                        <div className="mt-1 text-lg font-extrabold text-slate-800">{filteredNotifications.length}</div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {(['TODAS', 'CHAMADA', 'AVALIACAO', 'COMUNICADO', 'AGENDA', 'OUTRAS'] as NotificationFilter[]).map((filter) => (
                                        <button
                                            key={filter}
                                            type="button"
                                            onClick={() => setNotificationFilter(filter)}
                                            className={`rounded-2xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] transition ${
                                                notificationFilter === filter
                                                    ? 'bg-slate-900 text-white'
                                                    : 'border border-slate-200 bg-white text-slate-600'
                                            }`}
                                        >
                                            {getNotificationFilterLabel(filter)} <span className="ml-1 opacity-70">{notificationCounts[filter]}</span>
                                        </button>
                                    ))}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {(['NAO_LIDAS', 'LIDAS', 'LIDAS_NAO_LIDAS'] as ReadStatusFilter[]).map((filter) => (
                                        <button
                                            key={filter}
                                            type="button"
                                            onClick={() => setReadStatusFilter(filter)}
                                            className={`rounded-2xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] transition ${
                                                readStatusFilter === filter
                                                    ? 'bg-slate-900 text-white'
                                                    : 'border border-slate-200 bg-white text-slate-600'
                                            }`}
                                        >
                                            {filter === 'NAO_LIDAS' ? 'NÃO LIDAS' : filter === 'LIDAS' ? 'VISUALIZADAS' : 'VISUALIZADAS / NÃO LIDAS'} <span className="ml-1 opacity-70">{filter === 'NAO_LIDAS' ? unreadCount : filter === 'LIDAS' ? readCount : notifications.length}</span>
                                        </button>
                                    ))}
                                </div>

                                {notificationFilter === 'CHAMADA' ? (
                                    <div className="flex flex-wrap gap-2">
                                        {(['PRESENTE', 'FALTOU'] as AttendanceFilter[]).map((filter) => (
                                            <button
                                                key={filter}
                                                type="button"
                                                onClick={() => setAttendanceFilter((current) => current === filter ? null : filter)}
                                                className={`rounded-2xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] transition ${
                                                    attendanceFilter === filter
                                                        ? filter === 'PRESENTE'
                                                            ? 'bg-emerald-700 text-white'
                                                            : 'bg-red-700 text-white'
                                                        : filter === 'PRESENTE'
                                                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                                            : 'border border-red-200 bg-red-50 text-red-700'
                                                }`}
                                            >
                                                {filter}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}

                                {notificationFilter !== 'TODAS' ? (
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => void markAllAsRead()}
                                            disabled={isSyncing || unreadCount === 0}
                                            className="rounded-2xl bg-emerald-600 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white disabled:opacity-50"
                                        >
                                            Marcar todas como lidas
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {attendanceVisibleNotifications.length ? attendanceVisibleNotifications.map((notification) => {
                            const metadata = safeParseMetadata(notification.metadata);
                            const studentId = String(metadata?.studentId || '').trim();
                            const studentName = studentId ? studentNameById.get(studentId) : null;
                            const teacherName = getNotificationFilter(notification.category) === 'CHAMADA'
                                ? extractTeacherNameFromMessage(notification.message)
                                : null;
                            const isAssessment = getNotificationFilter(notification.category) === 'AVALIACAO';
                            const assessmentStudentName = isAssessment
                                ? String(
                                    metadata?.studentName
                                    || metadata?.aluno
                                    || studentName
                                    || extractAssessmentText(notification.message, ['ALUNO', 'ALUNA'])
                                    || '',
                                ).trim()
                                : '';
                            const assessmentTeacherName = isAssessment
                                ? String(
                                    metadata?.teacherName
                                    || metadata?.professor
                                    || extractAssessmentText(notification.message, ['PROFESSOR', 'PROFESSOR RESPONSÁVEL', 'PROFESSOR RESPONSAVEL'])
                                    || '',
                                ).trim()
                                : '';
                            const subjectName = isAssessment
                                ? String(
                                    metadata?.subjectName
                                    || metadata?.materia
                                    || extractAssessmentText(notification.message, ['MATÉRIA', 'MATERIA', 'DISCIPLINA'])
                                    || '',
                                ).trim()
                                : '';
                            const assessmentDate = isAssessment
                                ? String(
                                    metadata?.lessonDate
                                    || metadata?.dataProva
                                    || extractAssessmentText(notification.message, ['DATA PROVA', 'DATA DA PROVA', 'DATA DA AULA'])
                                    || notification.createdAt
                                )
                                : '';
                            const assessmentScore = isAssessment
                                ? String(
                                    formatAssessmentScore(
                                        typeof metadata?.score === 'number'
                                            ? metadata.score
                                            : Number(extractAssessmentText(notification.message, ['NOTA LANÇADA', 'NOTA LANCADA', 'NOTA'])) || null,
                                        typeof metadata?.maxScore === 'number' ? metadata.maxScore : null,
                                    ),
                                )
                                : '';
                            const baseMessage = removeGuardianNameFromMessage(notification.message);
                            const displayMessage = studentName
                                ? removeStudentNameFromAttendanceMessage(baseMessage, studentName)
                                : baseMessage;

                            return (
                                <article key={notification.id} className={`rounded-[28px] border px-5 py-4 shadow-sm ${
                                    isAttendancePresentNotification(notification)
                                        ? notification.readAt
                                            ? 'border-emerald-200 bg-emerald-50/80'
                                            : 'border-emerald-300 bg-emerald-50'
                                        : getNotificationFilter(notification.category) === 'CHAMADA'
                                            ? notification.readAt
                                                ? 'border-red-200 bg-red-50/80'
                                                : 'border-red-300 bg-red-50'
                                            : notification.readAt
                                                ? 'border-slate-200 bg-white/75'
                                                : 'border-emerald-200 bg-white'
                                }`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className={`text-[11px] font-black uppercase tracking-[0.16em] ${
                                                isAttendancePresentNotification(notification)
                                                    ? 'text-emerald-700'
                                                    : getNotificationFilter(notification.category) === 'CHAMADA'
                                                        ? 'text-red-700'
                                                        : 'text-emerald-600'
                                            }`}>{getNotificationCategoryLabel(notification.category)}</div>
                                            <h2 className="mt-2 text-lg font-extrabold text-slate-800">{notification.title}</h2>
                                            {getNotificationFilter(notification.category) === 'AVALIACAO' ? (
                                                <div className="mt-3 space-y-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                                                    <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">ALUNO: <span className="text-slate-800">{assessmentStudentName || 'NAO INFORMADO'}</span></div>
                                                    <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">PROFESSOR: <span className="text-slate-800">{assessmentTeacherName || teacherName || 'NAO INFORMADO'}</span></div>
                                                    <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">MATÉRIA: <span className="text-slate-800">{subjectName || 'NAO INFORMADO'}</span></div>
                                                    <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">DATA PROVA: <span className="text-slate-800">{fmtDate(assessmentDate)}</span></div>
                                                    <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">NOTA LANÇADA: <span className="text-slate-800">{assessmentScore}</span></div>
                                                </div>
                                            ) : (
                                                <>
                                                    {studentName ? (
                                                        <div className="mt-2 inline-flex rounded-2xl bg-amber-50 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-amber-800">
                                                            ALUNO: {studentName}
                                                        </div>
                                                    ) : null}
                                                    {teacherName ? <div className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">PROFESSOR: {teacherName}</div> : null}
                                                    <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{displayMessage}</p>
                                                </>
                                            )}
                                            <div className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{fmtDate(notification.createdAt)}</div>
                                        </div>
                                        {!notification.readAt ? (
                                            <button type="button" onClick={() => void markAsRead(notification.id)} className="rounded-2xl bg-emerald-600 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white">Marcar como visualizada</button>
                                        ) : (
                                            <button type="button" onClick={() => void markAsUnread(notification.id)} className="rounded-2xl bg-emerald-600 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white">Visualizada</button>
                                        )}
                                    </div>
                                    {notification.readAt && getNotificationFilter(notification.category) === 'CHAMADA' ? (
                                        <div className="mt-3 flex justify-end">
                                            <button
                                                type="button"
                                                onClick={() => setAttendanceDeleteTarget(notification)}
                                                className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-rose-700"
                                                title="Excluir notificação de presença"
                                            >
                                                X
                                            </button>
                                        </div>
                                    ) : null}
                                </article>
                            );
                        }) : <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center text-sm font-semibold text-slate-500">Nenhuma notificacao encontrada.</div>}
                    </section>
                ) : null}

                {activeTab === 'alunos' ? (
                    <section className="space-y-3">
                        {summary?.students?.length ? summary.students.map((item) => {
                            const student = item.student;
                            return (
                                <article key={item.id} className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-lg font-extrabold text-slate-800">{student?.student?.name || 'ALUNO'}</div>
                                            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600">{getKinshipLabel(item)}</div>
                                            <div className="mt-2 text-sm font-medium text-slate-500">{student?.currentEnrollment?.seriesName || 'SEM SERIE'} - {student?.currentEnrollment?.className || 'SEM TURMA'}</div>
                                        </div>
                                        <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-right">
                                            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-600">Media</div>
                                            <div className="mt-1 text-lg font-extrabold text-emerald-700">{fmtScore(student?.grades?.overallAverage)}</div>
                                        </div>
                                    </div>

                                    <div className="mt-4 grid grid-cols-2 gap-3">
                                        <div className="rounded-2xl bg-slate-50 px-4 py-4"><div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Frequencia</div><div className="mt-2 text-2xl font-extrabold text-slate-800">{fmtPercent(student?.attendance?.overallFrequency)}</div></div>
                                        <div className="rounded-2xl bg-slate-50 px-4 py-4"><div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Notas</div><div className="mt-2 text-2xl font-extrabold text-slate-800">{student?.grades?.totalReleasedGrades || 0}</div></div>
                                    </div>

                                    <div className="mt-4 space-y-3">
                                        {(student?.grades?.bySubject || []).slice(0, 4).map((subject) => (
                                            <div key={`${subject.subjectId || subject.subjectName}-${subject.subjectName}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <div className="text-sm font-extrabold text-slate-800">{subject.subjectName}</div>
                                                        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">MEDIA DA MATERIA</div>
                                                    </div>
                                                    <div className="rounded-2xl bg-white px-3 py-2 text-sm font-black text-slate-800">{fmtScore(subject.averageScore)}</div>
                                                </div>

                                                <div className="mt-3 space-y-2">
                                                    {(subject.assessments || []).map((assessment) => (
                                                        <div key={assessment.id} className="rounded-2xl border border-white bg-white px-3 py-3">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="min-w-0">
                                                                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{assessment.title}</div>
                                                                    <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{formatAssessmentDate(assessment.lessonDate || assessment.releasedAt)}</div>
                                                                </div>
                                                                <div className="rounded-2xl bg-slate-100 px-3 py-2 text-right">
                                                                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">NOTA</div>
                                                                    <div className="mt-1 text-sm font-extrabold text-slate-800">{formatAssessmentScore(assessment.score, assessment.maxScore)}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            );
                        }) : <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center text-sm font-semibold text-slate-500">Nenhum aluno vinculado encontrado.</div>}
                    </section>
                ) : null}

                {attendanceDeleteTarget ? (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
                        <div className="w-full max-w-sm rounded-[30px] border border-white/70 bg-white p-5 shadow-[0_30px_90px_rgba(15,23,42,0.3)]">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-600">Excluir notificação</div>
                                    <h3 className="mt-1 text-xl font-extrabold text-slate-900">Confirmar eliminação</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setAttendanceDeleteTarget(null)}
                                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500"
                                >
                                    X
                                </button>
                            </div>

                            <p className="mt-4 text-sm leading-6 text-slate-600">
                                Essa ação vai eliminar a notificação de presença visualizada. Deseja continuar?
                            </p>

                            <div className="mt-5 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setAttendanceDeleteTarget(null)}
                                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-600"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={isSyncing}
                                    onClick={() => {
                                        const target = attendanceDeleteTarget;
                                        setAttendanceDeleteTarget(null);
                                        if (target) void removeAttendanceNotification(target.id);
                                    }}
                                    className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-white disabled:opacity-60"
                                >
                                    Excluir
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </main>
    );
}
