'use client';

import { useEffect, useMemo, useState } from 'react';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

type CurrentTenant = {
    id: string;
    name: string;
    logoUrl?: string | null;
};

type AssessmentListStatus = 'ALL' | 'PENDING' | 'GRADED';

type AssessmentListItem = {
    lessonEventId: string;
    eventType: string;
    eventTypeLabel: string;
    title: string;
    description?: string | null;
    lessonDate: string;
    startTime: string;
    endTime: string;
    subjectName: string;
    teacherName: string;
    seriesName: string;
    className: string;
    shift?: string | null;
    totalStudents: number;
    gradedStudentsCount: number;
    pendingStudentsCount: number;
    hasAssessment: boolean;
    lastNotifiedAt?: string | null;
    assessmentId?: string | null;
};

type AssessmentListResponse = {
    items: AssessmentListItem[];
    totalItems: number;
    totalPending: number;
    totalWithGrades: number;
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

type AssessmentPayload = {
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

const DEFAULT_FORM: AssessmentFormState = {
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

function formatDateLabel(value: string) {
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    }).format(parseDateOnly(value));
}

function formatNumericInput(value?: number | null) {
    if (value === null || value === undefined || Number.isNaN(value)) return '';
    return String(value).replace('.', ',');
}

function formatDateTime(value?: string | null) {
    if (!value) return 'Ainda não enviado';
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

export default function LancarNotasPage() {
    const [tenant, setTenant] = useState<CurrentTenant | null>(null);
    const [statusFilter, setStatusFilter] = useState<AssessmentListStatus>('ALL');
    const [listData, setListData] = useState<AssessmentListResponse | null>(null);
    const [selectedItem, setSelectedItem] = useState<AssessmentListItem | null>(null);
    const [assessmentData, setAssessmentData] = useState<AssessmentPayload | null>(null);
    const [formState, setFormState] = useState<AssessmentFormState>(DEFAULT_FORM);
    const [loadingList, setLoadingList] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const loadList = async (nextFilter: AssessmentListStatus, preserveSelection = true) => {
        try {
            setLoadingList(true);
            setErrorMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const [tenantResponse, listResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/tenants/current`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_BASE_URL}/lesson-assessments/my-events?status=${nextFilter}`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);

            const tenantData = await tenantResponse.json().catch(() => null);
            if (!tenantResponse.ok) {
                throw new Error(tenantData?.message || 'Não foi possível carregar a escola logada.');
            }

            const listDataResponse = await listResponse.json().catch(() => null);
            if (!listResponse.ok) {
                throw new Error(listDataResponse?.message || 'Não foi possível carregar as avaliações do professor.');
            }

            const payload = listDataResponse as AssessmentListResponse;
            setTenant(tenantData);
            setListData(payload);

            const nextSelected = preserveSelection && selectedItem
                ? payload.items.find((item) => item.lessonEventId === selectedItem.lessonEventId) || payload.items[0] || null
                : payload.items[0] || null;

            setSelectedItem(nextSelected);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar as avaliações do professor.');
        } finally {
            setLoadingList(false);
        }
    };

    const loadDetail = async (lessonEventId: string) => {
        try {
            setLoadingDetail(true);
            setErrorMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const response = await fetch(`${API_BASE_URL}/lesson-assessments/by-event/${lessonEventId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível carregar os alunos da avaliação.');
            }

            const payload = data as AssessmentPayload;
            setAssessmentData(payload);
            setFormState({
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
        } catch (error) {
            setAssessmentData(null);
            setFormState(DEFAULT_FORM);
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar os alunos da avaliação.');
        } finally {
            setLoadingDetail(false);
        }
    };

    useEffect(() => {
        void loadList(statusFilter, false);
    }, [statusFilter]);

    useEffect(() => {
        if (!selectedItem) {
            setAssessmentData(null);
            setFormState(DEFAULT_FORM);
            return;
        }

        void loadDetail(selectedItem.lessonEventId);
    }, [selectedItem?.lessonEventId]);

    const summary = useMemo(() => {
        const total = listData?.totalItems || 0;
        const pending = listData?.totalPending || 0;
        const graded = listData?.totalWithGrades || 0;
        return { total, pending, graded };
    }, [listData]);

    const handleSave = async () => {
        if (!selectedItem) return;

        try {
            setSaving(true);
            setErrorMessage(null);
            setStatusMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const response = await fetch(`${API_BASE_URL}/lesson-assessments/by-event/${selectedItem.lessonEventId}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: formState.title,
                    description: formState.description,
                    maxScore: formState.maxScore,
                    notifyStudents: formState.notifyStudents,
                    notifyGuardians: formState.notifyGuardians,
                    notifyByEmail: formState.notifyByEmail,
                    grades: formState.students.map((student) => ({
                        studentId: student.studentId,
                        score: student.score,
                        remarks: student.remarks,
                    })),
                }),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível salvar as notas.');
            }

            const payload = data as AssessmentPayload;
            setStatusMessage(
                `Notas salvas com sucesso.${payload.notificationsCreated ? ` ${payload.notificationsCreated} aviso(s) criado(s).` : ''}${payload.emailSent ? ' E-mail processado.' : ''}`,
            );
            await loadList(statusFilter, true);
            await loadDetail(selectedItem.lessonEventId);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível salvar as notas.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mx-auto mt-6 max-w-[1720px] space-y-6">
            <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
                <div className="bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.15),_transparent_40%),linear-gradient(135deg,#eff6ff_0%,#ffffff_42%,#f8fafc_100%)] px-8 py-8">
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
                                <div className="text-xs font-black uppercase tracking-[0.28em] text-emerald-600">Notas de provas e trabalhos</div>
                                <h1 className="mt-2 text-3xl font-extrabold text-[#153a6a]">Lançamento de notas</h1>
                                <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">
                                    Consulte as provas e trabalhos já marcados na sua grade anual, abra a turma correta e lance as notas dos alunos com envio por notificação e/ou e-mail.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-8 py-6">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Avaliações listadas</div>
                            <div className="mt-2 text-2xl font-extrabold text-slate-800">{summary.total}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Com alunos pendentes</div>
                            <div className="mt-2 text-2xl font-extrabold text-amber-600">{summary.pending}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Já com notas lançadas</div>
                            <div className="mt-2 text-2xl font-extrabold text-emerald-600">{summary.graded}</div>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                        {([
                            { value: 'ALL', label: 'Todas' },
                            { value: 'PENDING', label: 'Pendentes' },
                            { value: 'GRADED', label: 'Com notas' },
                        ] as Array<{ value: AssessmentListStatus; label: string }>).map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setStatusFilter(option.value)}
                                className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${
                                    statusFilter === option.value
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-700'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
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

                    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
                        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Provas e trabalhos lançados</div>
                            <div className="mt-4 max-h-[72vh] space-y-3 overflow-y-auto pr-1">
                                {loadingList ? (
                                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm font-medium text-slate-500">
                                        Carregando avaliações...
                                    </div>
                                ) : listData?.items.length ? (
                                    listData.items.map((item) => {
                                        const active = selectedItem?.lessonEventId === item.lessonEventId;
                                        return (
                                            <button
                                                key={item.lessonEventId}
                                                type="button"
                                                onClick={() => setSelectedItem(item)}
                                                className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                                                    active
                                                        ? 'border-blue-300 bg-blue-50 shadow-sm ring-2 ring-blue-100'
                                                        : item.pendingStudentsCount > 0
                                                            ? 'border-amber-200 bg-amber-50/70 hover:border-blue-200'
                                                            : 'border-emerald-200 bg-emerald-50/70 hover:border-blue-200'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                                                        {item.eventTypeLabel}
                                                    </div>
                                                    <div className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] ${
                                                        item.pendingStudentsCount > 0
                                                            ? 'bg-amber-100 text-amber-700'
                                                            : 'bg-emerald-100 text-emerald-700'
                                                    }`}>
                                                        {item.pendingStudentsCount > 0 ? 'Pendente' : 'Com notas'}
                                                    </div>
                                                </div>
                                                <div className="mt-2 text-lg font-extrabold text-slate-800">{item.title}</div>
                                                <div className="mt-2 text-sm font-medium text-slate-500">
                                                    {formatDateLabel(item.lessonDate)} • {item.startTime} - {item.endTime}
                                                </div>
                                                <div className="mt-1 text-sm font-medium text-slate-500">
                                                    {item.subjectName} • {item.seriesName} - {item.className}
                                                </div>
                                                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                                    <div className="rounded-xl border border-slate-200 bg-white px-2 py-2">
                                                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Turma</div>
                                                        <div className="mt-1 text-sm font-extrabold text-slate-700">{item.totalStudents}</div>
                                                    </div>
                                                    <div className="rounded-xl border border-slate-200 bg-white px-2 py-2">
                                                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Notas</div>
                                                        <div className="mt-1 text-sm font-extrabold text-emerald-700">{item.gradedStudentsCount}</div>
                                                    </div>
                                                    <div className="rounded-xl border border-slate-200 bg-white px-2 py-2">
                                                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Pendentes</div>
                                                        <div className="mt-1 text-sm font-extrabold text-amber-600">{item.pendingStudentsCount}</div>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })
                                ) : (
                                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm font-medium text-slate-500">
                                        Nenhuma prova ou trabalho encontrado para este filtro.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
                            {!selectedItem ? (
                                <div className="px-6 py-16 text-center text-sm font-medium text-slate-500">
                                    Selecione uma prova ou trabalho para abrir os alunos da turma e lançar as notas.
                                </div>
                            ) : loadingDetail ? (
                                <div className="px-6 py-16 text-center text-sm font-medium text-slate-500">
                                    Carregando detalhamento da avaliação...
                                </div>
                            ) : assessmentData ? (
                                <>
                                    <div className="dashboard-band border-b px-6 py-5">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                            <div>
                                                <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                                                    {assessmentData.lessonEvent.eventTypeLabel} • {formatDateLabel(selectedItem.lessonDate)} • {selectedItem.startTime} - {selectedItem.endTime}
                                                </div>
                                                <h2 className="mt-2 text-2xl font-extrabold text-slate-800">{assessmentData.lessonItem.subjectName}</h2>
                                                <p className="mt-2 text-sm font-medium text-slate-500">
                                                    {assessmentData.lessonItem.seriesName} - {assessmentData.lessonItem.className}
                                                </p>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
                                                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Último envio</div>
                                                <div className="mt-1 text-sm font-bold text-slate-700">
                                                    {formatDateTime(assessmentData.assessment?.lastNotifiedAt || null)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="max-h-[76vh] overflow-y-auto px-6 py-6">
                                        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                    <div>
                                                        <label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Título da avaliação</label>
                                                        <input
                                                            type="text"
                                                            value={formState.title}
                                                            onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
                                                            className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                                            placeholder="Ex.: PROVA BIMESTRAL"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Nota máxima</label>
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={formState.maxScore}
                                                            onChange={(event) => setFormState((current) => ({ ...current, maxScore: event.target.value }))}
                                                            className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                                            placeholder="Ex.: 10 ou 8,5"
                                                        />
                                                    </div>
                                                </div>
                                                <label className="mt-5 block text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Descrição</label>
                                                <textarea
                                                    value={formState.description}
                                                    onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                                                    rows={4}
                                                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                                    placeholder="Observações da avaliação"
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
                                                        const active = formState[option.key as keyof AssessmentFormState] as boolean;
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
                                                    Os alunos e responsáveis são localizados automaticamente pela turma da aula marcada na grade anual.
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-6 rounded-[28px] border border-slate-200 bg-white shadow-sm">
                                            <div className="dashboard-band border-b px-5 py-4">
                                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                    <div>
                                                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Alunos da turma</div>
                                                        <div className="mt-1 text-lg font-extrabold text-slate-800">{formState.students.length} aluno(s)</div>
                                                    </div>
                                                    <div className="text-sm font-medium text-slate-500">
                                                        Use decimal com vírgula, por exemplo <strong>8,5</strong>.
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="max-h-[48vh] overflow-y-auto px-5 py-5">
                                                <div className="space-y-3">
                                                    {formState.students.map((student, index) => (
                                                        <div key={student.studentId} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1.3fr_0.55fr_1fr]">
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
                                                                        setFormState((current) => ({
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
                                                                        setFormState((current) => ({
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
                                    <div className="dashboard-band-footer border-t px-6 py-4">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="text-sm font-medium text-slate-500">
                                                Salve as notas para atualizar a avaliação e enviar o aviso conforme os canais escolhidos.
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleSave}
                                                disabled={saving || loadingDetail}
                                                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                                            >
                                                {saving ? 'Salvando notas...' : 'Salvar notas'}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="px-6 py-16 text-center text-sm font-medium text-slate-500">
                                    Não foi possível carregar os detalhes desta avaliação.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
