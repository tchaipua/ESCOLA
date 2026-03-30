'use client';

import { useEffect, useMemo, useState } from 'react';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';

const API_BASE_URL = 'http://localhost:3001/api/v1';

type CurrentTenant = {
    id: string;
    name: string;
    logoUrl?: string | null;
};

type HistoryFilterOption = {
    id: string;
    label: string;
    year?: number;
    subjectName?: string;
    isActive?: boolean;
};

type HistoryAssessment = {
    lessonEventId: string;
    lessonAssessmentId: string | null;
    title: string;
    lessonDate: string | null;
    startTime: string | null;
    endTime: string | null;
    maxScore: number | null;
};

type HistoryStudent = {
    studentId: string;
    studentName: string;
    scores: Array<{
        lessonEventId: string;
        score: number | null;
        remarks: string | null;
    }>;
    averageScore: number | null;
};

type HistoryResponse = {
    filters: {
        schoolYears: HistoryFilterOption[];
        teacherSubjects: HistoryFilterOption[];
        seriesClasses: HistoryFilterOption[];
    };
    selectedFilters: {
        schoolYearId: string | null;
        teacherSubjectId: string | null;
        seriesClassId: string | null;
    };
    header: {
        schoolYearLabel: string;
        subjectName: string;
        seriesClassLabel: string;
    } | null;
    assessments: HistoryAssessment[];
    students: HistoryStudent[];
    summary: {
        totalAssessments: number;
        totalStudents: number;
    };
};

function formatDateLabel(value?: string | null) {
    if (!value) return '';
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(new Date(value));
}

function formatScore(value?: number | null) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return value.toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}

export default function HistoricoNotasPage() {
    const [tenant, setTenant] = useState<CurrentTenant | null>(null);
    const [data, setData] = useState<HistoryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>('');
    const [selectedTeacherSubjectId, setSelectedTeacherSubjectId] = useState<string>('');
    const [selectedSeriesClassId, setSelectedSeriesClassId] = useState<string>('');
    const [initialized, setInitialized] = useState(false);

    const loadData = async (filters?: {
        schoolYearId?: string;
        teacherSubjectId?: string;
        seriesClassId?: string;
    }) => {
        try {
            setLoading(true);
            setErrorMessage(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Sessão não encontrada.');

            const query = new URLSearchParams();
            if (filters?.schoolYearId) query.set('schoolYearId', filters.schoolYearId);
            if (filters?.teacherSubjectId) query.set('teacherSubjectId', filters.teacherSubjectId);
            if (filters?.seriesClassId) query.set('seriesClassId', filters.seriesClassId);

            const [tenantResponse, historyResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/tenants/current`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_BASE_URL}/lesson-assessments/history${query.toString() ? `?${query.toString()}` : ''}`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);

            const tenantData = await tenantResponse.json().catch(() => null);
            if (!tenantResponse.ok) {
                throw new Error(tenantData?.message || 'Não foi possível carregar a escola logada.');
            }

            const historyData = await historyResponse.json().catch(() => null);
            if (!historyResponse.ok) {
                throw new Error(historyData?.message || 'Não foi possível carregar o histórico de notas.');
            }

            const payload = historyData as HistoryResponse;
            setTenant(tenantData);
            setData(payload);
            setSelectedSchoolYearId(payload.selectedFilters.schoolYearId || '');
            setSelectedTeacherSubjectId(payload.selectedFilters.teacherSubjectId || '');
            setSelectedSeriesClassId(payload.selectedFilters.seriesClassId || '');
            setInitialized(true);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar o histórico de notas.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

    useEffect(() => {
        if (!initialized) return;
        if (!selectedSchoolYearId || !selectedTeacherSubjectId || !selectedSeriesClassId) return;

        void loadData({
            schoolYearId: selectedSchoolYearId,
            teacherSubjectId: selectedTeacherSubjectId,
            seriesClassId: selectedSeriesClassId,
        });
    }, [initialized, selectedSchoolYearId, selectedTeacherSubjectId, selectedSeriesClassId]);

    const subjectOptions = useMemo(() => data?.filters.teacherSubjects || [], [data]);
    const classOptions = useMemo(() => data?.filters.seriesClasses || [], [data]);
    const yearOptions = useMemo(() => data?.filters.schoolYears || [], [data]);

    return (
        <div className="mx-auto mt-6 max-w-[1720px] space-y-6">
            <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
                <div className="bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_40%),linear-gradient(135deg,#eff6ff_0%,#ffffff_40%,#f8fafc_100%)] px-8 py-8">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <div className="text-xs font-black uppercase tracking-[0.35em] text-blue-600">Professor</div>
                            <h1 className="mt-2 text-3xl font-extrabold text-[#153a6a]">Histórico de notas</h1>
                            <p className="mt-2 text-sm font-medium text-slate-500">
                                {tenant?.name || 'Escola atual'}{data?.header?.schoolYearLabel ? ` • Ano letivo ${data.header.schoolYearLabel}` : ''}
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <label className="block">
                                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Ano letivo</span>
                                <select
                                    value={selectedSchoolYearId}
                                    onChange={(event) => setSelectedSchoolYearId(event.target.value)}
                                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                >
                                    {yearOptions.map((item) => (
                                        <option key={item.id} value={item.id}>{item.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Matéria</span>
                                <select
                                    value={selectedTeacherSubjectId}
                                    onChange={(event) => setSelectedTeacherSubjectId(event.target.value)}
                                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                >
                                    {subjectOptions.map((item) => (
                                        <option key={item.id} value={item.id}>{item.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Turma</span>
                                <select
                                    value={selectedSeriesClassId}
                                    onChange={(event) => setSelectedSeriesClassId(event.target.value)}
                                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"
                                >
                                    {classOptions.map((item) => (
                                        <option key={item.id} value={item.id}>{item.label}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="px-8 py-6">
                    {errorMessage ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
                            {errorMessage}
                        </div>
                    ) : null}

                    {loading ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-16 text-center text-sm font-medium text-slate-500">
                            Carregando histórico de notas...
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Matéria</div>
                                    <div className="mt-2 text-lg font-extrabold text-slate-800">{data?.header?.subjectName || 'Não informado'}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Turma</div>
                                    <div className="mt-2 text-lg font-extrabold text-slate-800">{data?.header?.seriesClassLabel || 'Não informado'}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Resumo</div>
                                    <div className="mt-2 text-lg font-extrabold text-slate-800">
                                        {data?.summary.totalStudents || 0} aluno(s) • {data?.summary.totalAssessments || 0} prova(s)
                                    </div>
                                </div>
                            </div>

                            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full border-collapse">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="sticky left-0 z-10 min-w-[260px] border-b border-slate-200 bg-slate-50 px-4 py-4 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                                                    Aluno
                                                </th>
                                                {(data?.assessments || []).map((assessment) => (
                                                    <th
                                                        key={assessment.lessonEventId}
                                                        className="min-w-[150px] border-b border-l border-slate-200 px-4 py-4 text-left text-[11px] font-black uppercase tracking-[0.16em] text-slate-500"
                                                    >
                                                        <div>{assessment.title}</div>
                                                        <div className="mt-1 text-[10px] font-semibold tracking-[0.08em] text-slate-400">
                                                            {formatDateLabel(assessment.lessonDate)}{assessment.startTime ? ` • ${assessment.startTime}` : ''}
                                                        </div>
                                                    </th>
                                                ))}
                                                <th className="min-w-[120px] border-b border-l border-slate-200 px-4 py-4 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                                                    Média
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(data?.students || []).length ? (
                                                (data?.students || []).map((student) => (
                                                    <tr key={student.studentId} className="odd:bg-white even:bg-slate-50/60">
                                                        <td className="sticky left-0 z-10 border-b border-slate-200 bg-inherit px-4 py-4 text-sm font-bold text-slate-800">
                                                            {student.studentName}
                                                        </td>
                                                        {student.scores.map((scoreItem) => (
                                                            <td
                                                                key={`${student.studentId}-${scoreItem.lessonEventId}`}
                                                                title={scoreItem.remarks || undefined}
                                                                className="border-b border-l border-slate-200 px-4 py-4 text-sm font-semibold text-slate-700"
                                                            >
                                                                {formatScore(scoreItem.score)}
                                                            </td>
                                                        ))}
                                                        <td className="border-b border-l border-slate-200 px-4 py-4 text-sm font-extrabold text-blue-700">
                                                            {formatScore(student.averageScore)}
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td
                                                        colSpan={(data?.assessments.length || 0) + 2}
                                                        className="px-4 py-12 text-center text-sm font-semibold text-slate-500"
                                                    >
                                                        Nenhuma nota encontrada para a combinação selecionada.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
