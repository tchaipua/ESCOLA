'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearStoredSession } from '@/app/lib/auth-storage';
import { getDashboardAuthContext, getHomeRouteForRole } from '@/app/lib/dashboard-crud-utils';
import {
    dequeueStudentPwaReads,
    enqueueStudentPwaRead,
    loadStudentPwaCache,
    loadStudentPwaReadQueue,
    saveStudentPwaCache,
    type StudentPwaNotification,
    type StudentPwaPayload,
} from '@/app/lib/student-pwa-cache';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

type CurrentTenant = { id: string; name: string; logoUrl?: string | null };
type Summary = NonNullable<StudentPwaPayload['studentSummary']>;
type Schedule = NonNullable<StudentPwaPayload['schedule']>;
type InstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DAY_LABELS: Record<string, string> = {
    SEGUNDA: 'SEGUNDA',
    TERCA: 'TERCA',
    QUARTA: 'QUARTA',
    QUINTA: 'QUINTA',
    SEXTA: 'SEXTA',
    SABADO: 'SABADO',
    DOMINGO: 'DOMINGO',
};

function fmtDate(value?: string | null) {
    if (!value) return 'NAO INFORMADO';
    return new Date(value).toLocaleString('pt-BR');
}

function fmtDateOnly(value?: string | null) {
    if (!value) return 'NAO INFORMADO';
    return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

function fmtScore(score?: number | null, maxScore?: number | null) {
    if (typeof score !== 'number') return 'SEM NOTA';
    const current = score.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    if (typeof maxScore !== 'number') return current;
    return `${current} / ${maxScore.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
}

function fmtPercent(value?: number | null) {
    return `${(typeof value === 'number' ? value : 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function normalizeNotifications(input: unknown): StudentPwaNotification[] {
    if (!Array.isArray(input)) return [];
    return input.map((item) => ({
        id: String(item?.id || ''),
        title: String(item?.title || 'NOTIFICACAO'),
        message: String(item?.message || ''),
        category: String(item?.category || 'GERAL'),
        actionUrl: typeof item?.actionUrl === 'string' ? item.actionUrl : null,
        readAt: typeof item?.readAt === 'string' ? item.readAt : null,
        createdAt: String(item?.createdAt || new Date().toISOString()),
    }));
}

function isIosInstall() {
    if (typeof navigator === 'undefined') return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function AlunoPwaPage() {
    const router = useRouter();
    const [tenant, setTenant] = useState<CurrentTenant | null>(null);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [schedule, setSchedule] = useState<Schedule | null>(null);
    const [notifications, setNotifications] = useState<StudentPwaNotification[]>([]);
    const [activeTab, setActiveTab] = useState<'notificacoes' | 'frequencia' | 'notas'>('notificacoes');
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isOfflineMode, setIsOfflineMode] = useState(false);
    const [pendingReadCount, setPendingReadCount] = useState(0);
    const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
    const [showIosHint, setShowIosHint] = useState(false);

    const persistCache = (
        nextTenant: CurrentTenant | null = tenant,
        nextSummary: Summary | null = summary,
        nextSchedule: Schedule | null = schedule,
        nextNotifications: StudentPwaNotification[] = notifications,
        nextSyncedAt: string | null = lastSyncAt,
    ) => {
        if (!nextSyncedAt) return;
        saveStudentPwaCache({
            tenant: nextTenant,
            studentSummary: nextSummary,
            schedule: nextSchedule,
            notifications: nextNotifications,
            syncedAt: nextSyncedAt,
        });
    };

    const applyCache = (payload: StudentPwaPayload | null) => {
        if (!payload) return false;
        setTenant(payload.tenant);
        setSummary(payload.studentSummary);
        setSchedule(payload.schedule);
        setNotifications(payload.notifications || []);
        setLastSyncAt(payload.syncedAt || null);
        return true;
    };

    const flushPendingReads = useCallback(async () => {
        const queue = loadStudentPwaReadQueue();
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

        dequeueStudentPwaReads(queue);
        setPendingReadCount(loadStudentPwaReadQueue().length);
    }, []);

    const syncData = useCallback(async (showLoader = false) => {
        const { token, role } = getDashboardAuthContext();
        if (!token) {
            router.replace('/');
            return;
        }
        if (role !== 'ALUNO') {
            router.replace(getHomeRouteForRole(role));
            return;
        }

        if (showLoader) setIsLoading(true);
        setIsSyncing(true);
        setErrorStatus(null);

        try {
            await flushPendingReads();
            const [tenantResponse, summaryResponse, scheduleResponse, notificationsResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/tenants/current`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_BASE_URL}/students/me/pwa-summary`, { headers: { Authorization: `Bearer ${token}` } }),
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
            if (!summaryResponse.ok) throw new Error(summaryData?.message || 'Nao foi possivel carregar os dados do aluno.');
            if (!scheduleResponse.ok) throw new Error(scheduleData?.message || 'Nao foi possivel carregar o horario.');
            if (!notificationsResponse.ok) throw new Error(notificationsData?.message || 'Nao foi possivel carregar as notificacoes.');

            const syncedAt = summaryData?.syncedAt || new Date().toISOString();
            const nextNotifications = normalizeNotifications(notificationsData);
            setTenant(tenantData);
            setSummary(summaryData);
            setSchedule(scheduleData);
            setNotifications(nextNotifications);
            setLastSyncAt(syncedAt);
            setIsOfflineMode(false);
            saveStudentPwaCache({ tenant: tenantData, studentSummary: summaryData, schedule: scheduleData, notifications: nextNotifications, syncedAt });
        } catch (error) {
            const hasCache = applyCache(loadStudentPwaCache());
            setIsOfflineMode(hasCache);
            setErrorStatus(error instanceof Error ? error.message : 'Nao foi possivel sincronizar.');
        } finally {
            setPendingReadCount(loadStudentPwaReadQueue().length);
            setIsLoading(false);
            setIsSyncing(false);
        }
    }, [flushPendingReads, router]);

    useEffect(() => {
        const { token, role } = getDashboardAuthContext();
        if (!token) {
            router.replace('/');
            return;
        }
        if (role !== 'ALUNO') {
            router.replace(getHomeRouteForRole(role));
            return;
        }

        applyCache(loadStudentPwaCache());
        setPendingReadCount(loadStudentPwaReadQueue().length);
        setIsOfflineMode(typeof navigator !== 'undefined' ? !navigator.onLine : false);
        void syncData(true);
    }, [router, syncData]);

    useEffect(() => {
        const handleOnline = () => {
            setIsOfflineMode(false);
            void syncData(false);
        };
        const handleOffline = () => setIsOfflineMode(true);
        const handleInstallPrompt = (event: Event) => {
            event.preventDefault();
            setInstallPrompt(event as InstallPromptEvent);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('beforeinstallprompt', handleInstallPrompt);

        if (isIosInstall()) {
            setShowIosHint(true);
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
        };
    }, [syncData]);

    const handleMarkAsRead = async (notificationId: string) => {
        const target = notifications.find((notification) => notification.id === notificationId);
        if (!target || target.readAt) return;

        const now = new Date().toISOString();
        const nextNotifications = notifications.map((notification) =>
            notification.id === notificationId ? { ...notification, readAt: now } : notification,
        );

        setNotifications(nextNotifications);
        enqueueStudentPwaRead(notificationId);
        setPendingReadCount(loadStudentPwaReadQueue().length);
        persistCache(tenant, summary, schedule, nextNotifications, lastSyncAt || now);

        try {
            await flushPendingReads();
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Leitura salva para sincronizar depois.');
        }
    };

    const handleInstall = async () => {
        if (installPrompt) {
            await installPrompt.prompt();
            await installPrompt.userChoice.catch(() => null);
            setInstallPrompt(null);
            return;
        }

        if (isIosInstall()) {
            setShowIosHint(true);
        }
    };

    const unreadCount = notifications.filter((notification) => !notification.readAt).length;

    if (isLoading && !summary) {
        return (
            <main className="min-h-screen bg-slate-100 px-4 py-8">
                <div className="mx-auto max-w-md rounded-[28px] border border-slate-200 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500 shadow-sm">
                    Carregando painel do aluno...
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(29,78,216,0.18),_transparent_35%),linear-gradient(180deg,#eff6ff_0%,#f8fafc_36%,#e2e8f0_100%)] px-4 py-5">
            <div className="mx-auto max-w-md space-y-4">
                <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
                    <div className="bg-[linear-gradient(135deg,#1d4ed8_0%,#0f172a_100%)] px-5 py-5 text-white">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/10">
                                    {tenant?.logoUrl ? <img src={tenant.logoUrl} alt={tenant.name} className="h-full w-full object-cover" /> : <span className="text-sm font-black">AL</span>}
                                </div>
                                <div>
                                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-100">PWA do aluno</div>
                                    <h1 className="mt-1 text-xl font-extrabold">{summary?.student?.name || 'ALUNO'}</h1>
                                    <div className="mt-1 text-sm font-medium text-blue-100">{tenant?.name || 'ESCOLA'}</div>
                                </div>
                            </div>
                            <button type="button" onClick={() => { clearStoredSession(); router.replace('/'); }} className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em]">
                                Sair
                            </button>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.16em]">
                            <div className={`rounded-full px-3 py-1 ${isOfflineMode ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'}`}>{isOfflineMode ? 'Modo offline' : 'Online'}</div>
                            <div className="rounded-full bg-white/10 px-3 py-1">{summary?.currentEnrollment?.seriesName || 'SEM SERIE'} - {summary?.currentEnrollment?.className || 'SEM TURMA'}</div>
                            {pendingReadCount ? <div className="rounded-full bg-yellow-300 px-3 py-1 text-slate-900">{pendingReadCount} leitura(s) pendente(s)</div> : null}
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2">
                            <div className="rounded-2xl bg-white/10 px-3 py-3"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-100">Nao lidas</div><div className="mt-2 text-2xl font-extrabold">{unreadCount}</div></div>
                            <div className="rounded-2xl bg-white/10 px-3 py-3"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-100">Frequencia</div><div className="mt-2 text-xl font-extrabold">{fmtPercent(summary?.attendance?.overallFrequency)}</div></div>
                            <div className="rounded-2xl bg-white/10 px-3 py-3"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-100">Media</div><div className="mt-2 text-xl font-extrabold">{summary?.grades?.overallAverage?.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) || '0'}</div></div>
                        </div>
                    </div>

                    <div className="px-5 py-4">
                        <div className="flex gap-2">
                            <button type="button" onClick={() => void syncData(false)} disabled={isSyncing} className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
                                {isSyncing ? 'Sincronizando...' : 'Atualizar'}
                            </button>
                            <button type="button" onClick={() => void handleInstall()} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                                Instalar
                            </button>
                        </div>
                        <div className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Ultima sincronizacao: {lastSyncAt ? fmtDate(lastSyncAt) : 'AGUARDANDO'}</div>
                        {errorStatus ? <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{errorStatus}</div> : null}
                        {showIosHint ? <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">No iPhone, abra no Safari e toque em compartilhar &gt; Adicionar a Tela de Inicio.</div> : null}
                    </div>
                </section>

                <section className="grid grid-cols-3 gap-2">
                    {['notificacoes', 'frequencia', 'notas'].map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab as 'notificacoes' | 'frequencia' | 'notas')}
                            className={`rounded-2xl px-3 py-3 text-sm font-black uppercase tracking-[0.14em] ${
                                activeTab === tab ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white/80 text-slate-600'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </section>

                {activeTab === 'notificacoes' ? (
                    <section className="space-y-3">
                        {notifications.length ? notifications.map((notification) => (
                            <article key={notification.id} className={`rounded-[28px] border px-5 py-4 shadow-sm ${notification.readAt ? 'border-slate-200 bg-white/75' : 'border-blue-200 bg-white'}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-600">{notification.category.replace(/_/g, ' ')}</div>
                                        <h2 className="mt-2 text-lg font-extrabold text-slate-800">{notification.title}</h2>
                                        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{notification.message}</p>
                                        <div className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{fmtDate(notification.createdAt)}</div>
                                    </div>
                                    {!notification.readAt ? (
                                        <button type="button" onClick={() => void handleMarkAsRead(notification.id)} className="rounded-2xl bg-blue-600 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white">
                                            Li
                                        </button>
                                    ) : (
                                        <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Lida</div>
                                    )}
                                </div>
                            </article>
                        )) : <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center text-sm font-semibold text-slate-500">Nenhuma notificacao encontrada.</div>}
                    </section>
                ) : null}

                {activeTab === 'frequencia' ? (
                    <section className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Aulas</div><div className="mt-2 text-2xl font-extrabold text-slate-800">{summary?.attendance?.totalLessons || 0}</div></div>
                            <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Presencas</div><div className="mt-2 text-2xl font-extrabold text-emerald-600">{summary?.attendance?.totalPresent || 0}</div></div>
                            <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Faltas</div><div className="mt-2 text-2xl font-extrabold text-rose-600">{summary?.attendance?.totalAbsent || 0}</div></div>
                        </div>
                        <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
                            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Frequencia por materia</div>
                            <div className="mt-4 space-y-3">
                                {summary?.attendance?.bySubject?.length ? summary.attendance.bySubject.map((subject) => (
                                    <div key={`${subject.subjectId || subject.subjectName}-${subject.subjectName}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div><div className="text-sm font-extrabold text-slate-800">{subject.subjectName}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{subject.totalPresent} presencas • {subject.totalAbsent} faltas</div></div>
                                            <div className="rounded-2xl bg-white px-3 py-2 text-sm font-black text-blue-700">{fmtPercent(subject.frequency)}</div>
                                        </div>
                                    </div>
                                )) : <div className="text-sm font-semibold text-slate-500">Sem historico de frequencia sincronizado.</div>}
                            </div>
                        </div>
                        <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
                            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Historico recente</div>
                            <div className="mt-4 space-y-3">
                                {summary?.attendance?.history?.length ? summary.attendance.history.slice(0, 15).map((item) => (
                                    <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div><div className="text-sm font-extrabold text-slate-800">{item.subjectName}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{fmtDateOnly(typeof item.lessonDate === 'string' ? item.lessonDate.slice(0, 10) : null)} • {item.startTime} - {item.endTime}</div></div>
                                            <div className={`rounded-2xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] ${item.status === 'PRESENTE' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{item.status}</div>
                                        </div>
                                    </div>
                                )) : <div className="text-sm font-semibold text-slate-500">Sem registros de frequencia.</div>}
                            </div>
                        </div>
                    </section>
                ) : null}

                {activeTab === 'notas' ? (
                    <section className="space-y-3">
                        <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
                            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Resumo de notas</div>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <div className="rounded-2xl bg-slate-50 px-4 py-4"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Lancadas</div><div className="mt-2 text-2xl font-extrabold text-slate-800">{summary?.grades?.totalReleasedGrades || 0}</div></div>
                                <div className="rounded-2xl bg-slate-50 px-4 py-4"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Media geral</div><div className="mt-2 text-2xl font-extrabold text-blue-700">{summary?.grades?.overallAverage?.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) || '0'}</div></div>
                            </div>
                        </div>
                        {summary?.grades?.bySubject?.length ? summary.grades.bySubject.map((subject) => (
                            <article key={`${subject.subjectId || subject.subjectName}-${subject.subjectName}`} className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div><div className="text-lg font-extrabold text-slate-800">{subject.subjectName}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{subject.teacherName}</div></div>
                                    <div className="rounded-2xl bg-blue-50 px-3 py-2 text-right"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-600">Media</div><div className="mt-1 text-lg font-extrabold text-blue-700">{subject.averageScore.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</div></div>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {subject.assessments.map((assessment) => (
                                        <div key={assessment.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div><div className="text-sm font-extrabold text-slate-800">{assessment.title}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{assessment.assessmentType} • {fmtDateOnly(typeof assessment.lessonDate === 'string' ? assessment.lessonDate.slice(0, 10) : null)}</div></div>
                                                <div className="rounded-2xl bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm">{fmtScore(assessment.score, assessment.maxScore)}</div>
                                            </div>
                                            {assessment.remarks ? <div className="mt-3 text-sm font-medium text-slate-600">{assessment.remarks}</div> : null}
                                        </div>
                                    ))}
                                </div>
                            </article>
                        )) : <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center text-sm font-semibold text-slate-500">Nenhuma nota sincronizada.</div>}
                    </section>
                ) : null}

                <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Horario semanal</div>
                    <div className="mt-4 space-y-2">
                        {Array.isArray(schedule?.items) && schedule.items.length ? schedule.items.slice(0, 8).map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                                <div><div className="text-sm font-extrabold text-slate-800">{item.teacherSubject?.subject?.name || 'DISCIPLINA'}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{DAY_LABELS[item.dayOfWeek] || item.dayOfWeek} • {item.startTime} - {item.endTime}</div></div>
                                <div className="text-right text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">{item.teacherSubject?.teacher?.name || 'PROFESSOR'}</div>
                            </div>
                        )) : <div className="text-sm font-semibold text-slate-500">Horario ainda nao sincronizado.</div>}
                    </div>
                </section>
            </div>
        </main>
    );
}
