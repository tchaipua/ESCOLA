'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearStoredSession } from '@/app/lib/auth-storage';
import { getDashboardAuthContext, getHomeRouteForRole } from '@/app/lib/dashboard-crud-utils';

const API_BASE_URL = 'http://localhost:3001/api/v1';
const CACHE_KEY = '@Escola-PWA-Guardian-Cache:v1';
const READ_QUEUE_KEY = '@Escola-PWA-Guardian-Read-Queue:v1';

type NotificationItem = {
    id: string;
    title: string;
    message: string;
    category: string;
    readAt?: string | null;
    createdAt: string;
};

type GuardianPayload = {
    tenant: { id: string; name: string; logoUrl?: string | null } | null;
    summary: any;
    schedule: any;
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
        readAt: typeof item?.readAt === 'string' ? item.readAt : null,
        createdAt: String(item?.createdAt || new Date().toISOString()),
    }));
}

export default function ResponsavelPwaPage() {
    const router = useRouter();
    const [tenant, setTenant] = useState<GuardianPayload['tenant']>(null);
    const [summary, setSummary] = useState<any>(null);
    const [schedule, setSchedule] = useState<any>(null);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [activeTab, setActiveTab] = useState<'notificacoes' | 'alunos'>('notificacoes');
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isOfflineMode, setIsOfflineMode] = useState(false);
    const [pendingReadCount, setPendingReadCount] = useState(0);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);

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
            setIsLoading(false);
            setIsSyncing(false);
        }
    }, [flushReadQueue, router]);

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

    if (isLoading && !summary) {
        return <main className="min-h-screen bg-slate-100 px-4 py-8"><div className="mx-auto max-w-md rounded-[28px] border border-slate-200 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500 shadow-sm">Carregando painel do responsavel...</div></main>;
    }

    const unreadCount = notifications.filter((notification) => !notification.readAt).length;

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(29,78,216,0.16),_transparent_35%),linear-gradient(180deg,#eff6ff_0%,#f8fafc_36%,#e2e8f0_100%)] px-4 py-5">
            <div className="mx-auto max-w-md space-y-4">
                <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
                    <div className="bg-[linear-gradient(135deg,#0f766e_0%,#0f172a_100%)] px-5 py-5 text-white">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-100">PWA do responsavel</div>
                                <h1 className="mt-1 text-xl font-extrabold">{summary?.guardian?.name || 'RESPONSAVEL'}</h1>
                                <div className="mt-1 text-sm font-medium text-emerald-100">{tenant?.name || 'ESCOLA'}</div>
                            </div>
                            <button type="button" onClick={() => { clearStoredSession(); router.replace('/'); }} className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em]">Sair</button>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.16em]">
                            <div className={`rounded-full px-3 py-1 ${isOfflineMode ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'}`}>{isOfflineMode ? 'Modo offline' : 'Online'}</div>
                            <div className="rounded-full bg-white/10 px-3 py-1">{summary?.students?.length || 0} aluno(s)</div>
                            {pendingReadCount ? <div className="rounded-full bg-yellow-300 px-3 py-1 text-slate-900">{pendingReadCount} leitura(s) pendente(s)</div> : null}
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2">
                            <div className="rounded-2xl bg-white/10 px-3 py-3"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-100">Nao lidas</div><div className="mt-2 text-2xl font-extrabold">{unreadCount}</div></div>
                            <div className="rounded-2xl bg-white/10 px-3 py-3"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-100">Sincronizado</div><div className="mt-2 text-sm font-extrabold">{lastSyncAt ? fmtDate(lastSyncAt) : 'AGUARDANDO'}</div></div>
                            <div className="rounded-2xl bg-white/10 px-3 py-3"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-100">Horario</div><div className="mt-2 text-sm font-extrabold">{schedule?.students?.length || 0} vinculo(s)</div></div>
                        </div>
                    </div>
                    <div className="px-5 py-4">
                        <div className="flex gap-2">
                            <button type="button" onClick={() => void syncData(false)} disabled={isSyncing} className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{isSyncing ? 'Sincronizando...' : 'Atualizar'}</button>
                            <button type="button" onClick={() => setActiveTab((current) => current === 'notificacoes' ? 'alunos' : 'notificacoes')} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">Trocar</button>
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
                        {notifications.length ? notifications.map((notification) => (
                            <article key={notification.id} className={`rounded-[28px] border px-5 py-4 shadow-sm ${notification.readAt ? 'border-slate-200 bg-white/75' : 'border-emerald-200 bg-white'}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-600">{notification.category.replace(/_/g, ' ')}</div>
                                        <h2 className="mt-2 text-lg font-extrabold text-slate-800">{notification.title}</h2>
                                        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{notification.message}</p>
                                        <div className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{fmtDate(notification.createdAt)}</div>
                                    </div>
                                    {!notification.readAt ? <button type="button" onClick={() => void markAsRead(notification.id)} className="rounded-2xl bg-emerald-600 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white">Li</button> : <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Lida</div>}
                                </div>
                            </article>
                        )) : <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center text-sm font-semibold text-slate-500">Nenhuma notificacao encontrada.</div>}
                    </section>
                ) : null}

                {activeTab === 'alunos' ? (
                    <section className="space-y-3">
                        {summary?.students?.length ? summary.students.map((item: any) => {
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
                                        {(student?.grades?.bySubject || []).slice(0, 4).map((subject: any) => (
                                            <div key={`${subject.subjectId || subject.subjectName}-${subject.subjectName}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div><div className="text-sm font-extrabold text-slate-800">{subject.subjectName}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">MEDIA DA MATERIA</div></div>
                                                    <div className="rounded-2xl bg-white px-3 py-2 text-sm font-black text-slate-800">{fmtScore(subject.averageScore)}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            );
                        }) : <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center text-sm font-semibold text-slate-500">Nenhum aluno vinculado encontrado.</div>}
                    </section>
                ) : null}
            </div>
        </main>
    );
}
