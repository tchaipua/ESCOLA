'use client';

import { useEffect, useMemo, useState } from 'react';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';

const API_BASE_URL = 'http://localhost:3001/api/v1';

type LessonEvent = {
    id: string;
    eventType: string;
    eventTypeLabel: string;
    title: string;
    description?: string | null;
    notifyStudents: boolean;
    notifyGuardians: boolean;
    notifyByEmail: boolean;
    lastNotifiedAt?: string | null;
};

type AgendaItem = {
    id: string;
    lessonDate: string;
    dateLabel: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    subjectName: string;
    teacherName: string;
    seriesName: string;
    className: string;
    shift?: string | null;
    events: LessonEvent[];
};

type AgendaDay = {
    date: string;
    dateLabel: string;
    items: AgendaItem[];
};

type AgendaResponse = {
    selectedDate: string;
    days: AgendaDay[];
    selectedDay: AgendaDay | null;
    totalItems: number;
};

type EventFormState = {
    title: string;
    description: string;
    notifyStudents: boolean;
    notifyGuardians: boolean;
    notifyByEmail: boolean;
};

const EVENT_TYPE_OPTIONS = [
    { value: 'PROVA', label: 'Prova', tone: 'bg-red-50 text-red-700 border-red-200' },
    { value: 'TRABALHO', label: 'Trabalho', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
    { value: 'RECADO', label: 'Recado', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
    { value: 'FALTA_PROFESSOR', label: 'Falta', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
] as const;

const DEFAULT_EVENT_FORM: EventFormState = {
    title: '',
    description: '',
    notifyStudents: true,
    notifyGuardians: true,
    notifyByEmail: true,
};

function shiftDate(value: string, days: number) {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}

function getEventTone(eventType: string) {
    return EVENT_TYPE_OPTIONS.find((option) => option.value === eventType)?.tone || 'bg-slate-100 text-slate-700 border-slate-200';
}

export default function TeacherDailyAgendaPanel() {
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [agenda, setAgenda] = useState<AgendaResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [modalState, setModalState] = useState<{
        lessonItem: AgendaItem;
        eventType: string;
        existingEvent: LessonEvent | null;
    } | null>(null);
    const [formState, setFormState] = useState<EventFormState>(DEFAULT_EVENT_FORM);

    const selectedDay = agenda?.selectedDay || null;

    const loadAgenda = async (date: string) => {
        try {
            setLoading(true);
            setErrorMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const response = await fetch(`${API_BASE_URL}/lesson-events/my-agenda?date=${date}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível carregar a agenda diária.');
            }

            setAgenda(data);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar a agenda diária.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadAgenda(selectedDate);
    }, [selectedDate]);

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

    const eventTypeLabel = useMemo(() => {
        if (!modalState) return '';
        return EVENT_TYPE_OPTIONS.find((option) => option.value === modalState.eventType)?.label || 'Evento';
    }, [modalState]);

    const handleOpenEventModal = (lessonItem: AgendaItem, eventType: string) => {
        const existingEvent = lessonItem.events.find((event) => event.eventType === eventType) || null;
        setModalState({ lessonItem, eventType, existingEvent });
    };

    const handleSaveEvent = async () => {
        if (!modalState) return;

        try {
            setSaving(true);
            setErrorMessage(null);
            setStatusMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const payload = {
                lessonCalendarItemId: modalState.lessonItem.id,
                eventType: modalState.eventType,
                title: formState.title,
                description: formState.description,
                notifyStudents: formState.notifyStudents,
                notifyGuardians: formState.notifyGuardians,
                notifyByEmail: formState.notifyByEmail,
            };

            const response = await fetch(
                modalState.existingEvent
                    ? `${API_BASE_URL}/lesson-events/${modalState.existingEvent.id}`
                    : `${API_BASE_URL}/lesson-events`,
                {
                    method: modalState.existingEvent ? 'PATCH' : 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                },
            );

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível salvar o evento da aula.');
            }

            setStatusMessage(
                modalState.existingEvent
                    ? 'Evento da aula atualizado com sucesso.'
                    : 'Evento da aula lançado com sucesso.',
            );
            setModalState(null);
            await loadAgenda(selectedDate);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível salvar o evento da aula.');
        } finally {
            setSaving(false);
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
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível remover o evento da aula.');
            }

            setStatusMessage('Evento da aula desativado com sucesso.');
            setModalState(null);
            await loadAgenda(selectedDate);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível remover o evento da aula.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="border-t border-slate-200 px-8 py-8">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Agenda do professor</div>
                    <h2 className="mt-2 text-2xl font-extrabold text-slate-800">Minhas aulas por dia</h2>
                    <p className="mt-2 text-sm font-medium text-slate-500">
                        Lance prova, trabalho, recado ou falta diretamente em cima da aula do dia. Alunos e responsáveis serão notificados.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                    >
                        Dia anterior
                    </button>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(event) => setSelectedDate(event.target.value)}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 outline-none ring-0 transition focus:border-blue-400"
                    />
                    <button
                        type="button"
                        onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                        className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
                    >
                        Hoje
                    </button>
                    <button
                        type="button"
                        onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                    >
                        Próximo dia
                    </button>
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

            <div className="mt-6 flex flex-wrap gap-3">
                {agenda?.days.map((day) => (
                    <button
                        key={day.date}
                        type="button"
                        onClick={() => setSelectedDate(day.date)}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                            day.date === selectedDate
                                ? 'border-blue-400 bg-blue-50 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-blue-200'
                        }`}
                    >
                        <div className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
                            {day.items.length} aula(s)
                        </div>
                        <div className="mt-1 text-sm font-extrabold text-slate-800">{day.dateLabel}</div>
                    </button>
                ))}
            </div>

            <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
                {loading ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm font-medium text-slate-500">
                        Carregando agenda diária...
                    </div>
                ) : selectedDay?.items?.length ? (
                    <div className="space-y-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">{selectedDay.dateLabel}</div>
                                <div className="mt-1 text-lg font-extrabold text-slate-800">
                                    {selectedDay.items.length} aula(s) lançada(s) para este dia
                                </div>
                            </div>
                            <div className="text-sm font-medium text-slate-500">
                                Os avisos desta agenda também geram notificação interna e, quando configurado, e-mail.
                            </div>
                        </div>

                        {selectedDay.items.map((item) => (
                            <div key={item.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                                            {item.startTime} - {item.endTime}
                                        </div>
                                        <div className="mt-2 text-xl font-extrabold text-slate-800">{item.subjectName}</div>
                                        <div className="mt-2 text-sm font-medium text-slate-500">
                                            {item.seriesName} - {item.className}
                                            {item.shift ? ` • ${item.shift}` : ''}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {EVENT_TYPE_OPTIONS.map((option) => {
                                            const hasEvent = item.events.some((event) => event.eventType === option.value);
                                            return (
                                                <button
                                                    key={`${item.id}-${option.value}`}
                                                    type="button"
                                                    onClick={() => handleOpenEventModal(item, option.value)}
                                                    className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${
                                                        hasEvent
                                                            ? option.tone
                                                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-200 hover:text-blue-700'
                                                    }`}
                                                >
                                                    {hasEvent ? `Editar ${option.label}` : option.label}
                                                </button>
                                            );
                                        })}
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
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-500">
                                        Nenhum evento lançado ainda para esta aula.
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm font-medium text-slate-500">
                        Nenhuma aula anual foi encontrada para esta data. Gere a grade anual da turma para disponibilizar a agenda diária do professor.
                    </div>
                )}
            </div>

            {modalState ? (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-3xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl">
                        <div className="dashboard-band border-b px-6 py-5">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div>
                                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                                        {modalState.lessonItem.dateLabel} • {modalState.lessonItem.startTime} - {modalState.lessonItem.endTime}
                                    </div>
                                    <h3 className="mt-2 text-2xl font-extrabold text-slate-800">
                                        {modalState.existingEvent ? `Editar ${eventTypeLabel}` : `Lançar ${eventTypeLabel}`}
                                    </h3>
                                    <p className="mt-2 text-sm font-medium text-slate-500">
                                        {modalState.lessonItem.subjectName} • {modalState.lessonItem.seriesName} - {modalState.lessonItem.className}
                                    </p>
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

                        <div className="max-h-[72vh] overflow-y-auto px-6 py-6">
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                    <label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Título do aviso</label>
                                    <input
                                        type="text"
                                        value={formState.title}
                                        onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
                                        className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
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
                                        placeholder="Escreva os detalhes do recado, prova, trabalho ou falta."
                                    />
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                    <div className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Entrega da notificação</div>
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
                                        Assim que salvar, o sistema cria notificação interna para os destinatários selecionados e tenta enviar e-mail quando a configuração global estiver ativa.
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="dashboard-band-footer border-t px-6 py-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                    </div>
                </div>
            ) : null}
        </div>
    );
}
