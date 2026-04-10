'use client';

import { useEffect, useState } from 'react';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

type NotificationItem = {
    id: string;
    title: string;
    message: string;
    actionUrl?: string | null;
    category: string;
    readAt?: string | null;
    createdAt: string;
};

type FilterStatus = 'ALL' | 'UNREAD' | 'READ';

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('UNREAD');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const loadNotifications = async (status: FilterStatus) => {
        try {
            setLoading(true);
            setErrorMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) {
                throw new Error('Sessão não encontrada.');
            }

            const response = await fetch(`${API_BASE_URL}/notifications/my?status=${status}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível carregar as notificações.');
            }

            setNotifications(Array.isArray(data) ? data : []);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar as notificações.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadNotifications(filterStatus);
    }, [filterStatus]);

    const handleMarkAsRead = async (notificationId: string) => {
        try {
            setSaving(true);
            setErrorMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) {
                throw new Error('Sessão não encontrada.');
            }

            const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível marcar a notificação como lida.');
            }

            await loadNotifications(filterStatus);
            window.dispatchEvent(new Event('notifications-updated'));
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível marcar a notificação como lida.');
        } finally {
            setSaving(false);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            setSaving(true);
            setErrorMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) {
                throw new Error('Sessão não encontrada.');
            }

            const response = await fetch(`${API_BASE_URL}/notifications/my/read-all`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível marcar todas as notificações como lidas.');
            }

            await loadNotifications(filterStatus);
            window.dispatchEvent(new Event('notifications-updated'));
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível marcar todas as notificações como lidas.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mx-auto mt-6 max-w-6xl space-y-6">
            <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
                <div className="dashboard-band border-b px-6 py-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Centro de mensagens</div>
                            <h1 className="mt-2 text-3xl font-extrabold text-slate-800">Notificações</h1>
                            <p className="mt-2 text-sm font-medium text-slate-500">
                                Aqui ficam os avisos internos do sistema. Sempre que houver algo não lido, o sistema avisa na entrada.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            {(['UNREAD', 'ALL', 'READ'] as FilterStatus[]).map((status) => (
                                <button
                                    key={status}
                                    type="button"
                                    onClick={() => setFilterStatus(status)}
                                    className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${
                                        filterStatus === status
                                            ? 'border-blue-400 bg-blue-50 text-blue-700'
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700'
                                    }`}
                                >
                                    {status === 'UNREAD' ? 'Não lidas' : status === 'READ' ? 'Lidas' : 'Todas'}
                                </button>
                            ))}

                            <button
                                type="button"
                                onClick={handleMarkAllAsRead}
                                disabled={saving}
                                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                            >
                                Marcar tudo como lida
                            </button>
                        </div>
                    </div>
                </div>

                {errorMessage ? (
                    <div className="px-6 pt-6">
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-bold text-red-600">
                            {errorMessage}
                        </div>
                    </div>
                ) : null}

                <div className="px-6 py-6">
                    {loading ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm font-medium text-slate-500">
                            Carregando notificações...
                        </div>
                    ) : notifications.length ? (
                        <div className="space-y-4">
                            {notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={`rounded-[24px] border p-5 shadow-sm ${
                                        notification.readAt
                                            ? 'border-slate-200 bg-slate-50'
                                            : 'border-blue-200 bg-blue-50/60'
                                    }`}
                                >
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                            <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                                                {notification.category.replace(/_/g, ' ')}
                                            </div>
                                            <h3 className="mt-2 text-lg font-extrabold text-slate-800">{notification.title}</h3>
                                            <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
                                                {notification.message}
                                            </p>
                                            <div className="mt-4 text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
                                                {new Date(notification.createdAt).toLocaleString('pt-BR')}
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-3">
                                            {!notification.readAt ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleMarkAsRead(notification.id)}
                                                    disabled={saving}
                                                    className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:border-blue-400 hover:bg-blue-50 disabled:opacity-60"
                                                >
                                                    Marcar como lida
                                                </button>
                                            ) : (
                                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">
                                                    Lida
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm font-medium text-slate-500">
                            Nenhuma notificação encontrada para este filtro.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
