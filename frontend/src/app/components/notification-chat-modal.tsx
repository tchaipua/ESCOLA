'use client';

import { useCallback, useEffect, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';
const SCREEN_ID = 'POPUP_PRINCIPAL_NOTIFICACOES_CHAT_ESCOLA';

type NotificationItem = {
    id: string;
    title: string;
    message: string;
};

type Participant = {
    id: string;
    participantType: string;
    participantId: string;
    participantName: string;
    joinedAt: string;
};

type Message = {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    createdAt: string;
};

type Candidate = {
    participantType: 'USER' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
    participantId: string;
    name: string;
    label: string;
};

type ChatPayload = {
    notification: NotificationItem;
    conversation: { id: string; closedAt?: string | null } | null;
    participants: Participant[];
    messages: Message[];
};

type Props = {
    notificationId: string;
    currentUserId?: string | null;
    schoolName?: string | null;
    logoUrl?: string | null;
    onClose: () => void;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
            ...init?.headers,
        },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.message || 'Não foi possível concluir a operação.');
    return data as T;
}

export default function NotificationChatModal({
    notificationId,
    currentUserId,
    schoolName,
    logoUrl,
    onClose,
}: Props) {
    const [chat, setChat] = useState<ChatPayload | null>(null);
    const [message, setMessage] = useState('');
    const [search, setSearch] = useState('');
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadChat = useCallback(async (showLoading = false) => {
        try {
            if (showLoading) setLoading(true);
            const payload = await request<ChatPayload>(`/notifications/${notificationId}/chat`);
            setChat(payload);
            if (payload.conversation) {
                await request(`/notifications/${notificationId}/chat/read`, { method: 'POST' });
            }
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Não foi possível abrir o chat.');
        } finally {
            if (showLoading) setLoading(false);
        }
    }, [notificationId]);

    useEffect(() => {
        void loadChat(true);
        const timer = window.setInterval(() => void loadChat(false), 5000);
        return () => window.clearInterval(timer);
    }, [loadChat]);

    useEffect(() => {
        if (!chat?.conversation || search.trim().length < 2) {
            setCandidates([]);
            return;
        }
        const timer = window.setTimeout(() => {
            void request<Candidate[]>(
                `/notifications/${notificationId}/chat/candidates?search=${encodeURIComponent(search.trim())}`,
            )
                .then(setCandidates)
                .catch(() => setCandidates([]));
        }, 350);
        return () => window.clearTimeout(timer);
    }, [chat?.conversation, notificationId, search]);

    const sendMessage = async () => {
        if (!message.trim()) return;
        try {
            setSaving(true);
            setError(null);
            await request(`/notifications/${notificationId}/chat/messages`, {
                method: 'POST',
                body: JSON.stringify({ message }),
            });
            setMessage('');
            await loadChat(false);
        } catch (sendError) {
            setError(sendError instanceof Error ? sendError.message : 'Não foi possível enviar a mensagem.');
        } finally {
            setSaving(false);
        }
    };

    const addParticipant = async (candidate: Candidate) => {
        try {
            setSaving(true);
            setError(null);
            await request(`/notifications/${notificationId}/chat/participants`, {
                method: 'POST',
                body: JSON.stringify({
                    participantType: candidate.participantType,
                    participantId: candidate.participantId,
                }),
            });
            setSearch('');
            setCandidates([]);
            await loadChat(false);
        } catch (addError) {
            setError(addError instanceof Error ? addError.message : 'Não foi possível adicionar o participante.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
            <section className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
                <header className="flex items-center gap-4 bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-4 text-white">
                    {logoUrl ? (
                        <img src={logoUrl} alt="Logotipo da escola" className="h-12 w-12 rounded-xl bg-white object-contain p-1" />
                    ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-sm font-black text-blue-700">ESC</div>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-100">{schoolName || 'Sistema Escola'} · Chat da notificação</div>
                        <h2 className="truncate text-xl font-black">{chat?.notification.title || 'Carregando conversa...'}</h2>
                    </div>
                    <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500 text-xl font-black hover:bg-rose-600" aria-label="Fechar chat">×</button>
                </header>

                <div className="grid min-h-0 flex-1 md:grid-cols-[1fr_260px]">
                    <div className="flex min-h-0 flex-col border-r border-slate-200">
                        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-medium text-slate-600">
                            {chat?.notification.message}
                        </div>
                        <div className="min-h-[280px] flex-1 space-y-3 overflow-y-auto bg-slate-100/70 p-5">
                            {loading ? <p className="text-center text-sm font-bold text-slate-500">Carregando chat...</p> : null}
                            {!loading && !chat?.conversation ? (
                                <div className="rounded-2xl border border-dashed border-blue-300 bg-white p-6 text-center text-sm font-medium text-slate-600">
                                    Envie sua pergunta para iniciar uma conversa privada com o responsável pela notificação.
                                </div>
                            ) : null}
                            {chat?.messages.map((item) => {
                                const own = item.senderId === currentUserId;
                                return (
                                    <div key={item.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm ${own ? 'bg-blue-600 text-white' : 'bg-white text-slate-700'}`}>
                                            <div className={`text-[10px] font-black uppercase tracking-wider ${own ? 'text-blue-100' : 'text-blue-600'}`}>{item.senderName}</div>
                                            <p className="mt-1 whitespace-pre-wrap text-sm font-medium">{item.content}</p>
                                            <div className={`mt-2 text-[10px] font-bold ${own ? 'text-blue-100' : 'text-slate-400'}`}>{new Date(item.createdAt).toLocaleString('pt-BR')}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex gap-3 border-t border-slate-200 bg-white p-4">
                            <textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} maxLength={2000} rows={2} placeholder="Escreva sua pergunta..." className="min-h-[52px] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                            <button type="button" onClick={() => void sendMessage()} disabled={saving || !message.trim()} className="rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">Enviar</button>
                        </div>
                    </div>

                    <aside className="overflow-y-auto bg-white p-4">
                        <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Participantes</h3>
                        <div className="mt-3 space-y-2">
                            {chat?.participants.map((participant) => (
                                <div key={participant.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <div className="text-xs font-black text-slate-700">{participant.participantName}</div>
                                    <div className="text-[10px] font-bold uppercase text-slate-400">{participant.participantType}</div>
                                </div>
                            ))}
                        </div>
                        {chat?.conversation ? (
                            <div className="mt-6">
                                <label className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">Adicionar pessoa</label>
                                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Digite pelo menos 2 letras" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                                <div className="mt-2 space-y-2">
                                    {candidates.map((candidate) => (
                                        <button key={`${candidate.participantType}:${candidate.participantId}`} type="button" disabled={saving} onClick={() => void addParticipant(candidate)} className="w-full rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-left hover:border-blue-300">
                                            <div className="text-xs font-black text-blue-800">{candidate.name}</div>
                                            <div className="text-[10px] font-bold uppercase text-blue-500">{candidate.label}</div>
                                        </button>
                                    ))}
                                </div>
                                <p className="mt-3 text-[11px] font-medium leading-4 text-slate-500">A pessoa adicionada verá somente as mensagens enviadas após sua entrada.</p>
                            </div>
                        ) : null}
                    </aside>
                </div>

                {error ? <div className="border-t border-red-200 bg-red-50 px-5 py-2 text-sm font-bold text-red-600">{error}</div> : null}
                <footer className="flex items-center justify-end border-t border-slate-200 bg-white px-5 py-3">
                    <ScreenNameCopy
                        screenId={SCREEN_ID}
                        disableMargin
                        compact
                        auditText="Chat privado vinculado a uma notificação. Participantes e mensagens são isolados por escola, filial e conversa, com auditoria append-only."
                        sqlText="SELECT * FROM notification_conversations WHERE tenantId = :schoolId AND notificationId = :notificationId AND canceledAt IS NULL;"
                    />
                </footer>
            </section>
        </div>
    );
}
