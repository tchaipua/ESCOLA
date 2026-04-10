'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import TeacherDailyAgendaPanel from '@/app/components/teacher-daily-agenda-panel';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

type CurrentTenant = {
    id: string;
    name: string;
    logoUrl?: string | null;
    city?: string | null;
    state?: string | null;
};

type EnrollmentSummary = {
    id: string;
    schoolYear?: { year?: number | null } | null;
    seriesClass?: {
        series?: { name?: string | null } | null;
        class?: { name?: string | null; shift?: string | null } | null;
    } | null;
} | null;

type TeacherMe = {
    name: string;
    email?: string | null;
    cpf?: string | null;
    whatsapp?: string | null;
    phone?: string | null;
    teacherSubjects?: Array<{
        id: string;
        subject?: {
            name?: string | null;
        } | null;
    }>;
};

type StudentMe = {
    name: string;
    email?: string | null;
    cpf?: string | null;
    whatsapp?: string | null;
    phone?: string | null;
    guardians?: Array<{
        id: string;
        kinship?: string | null;
        kinshipDescription?: string | null;
        guardian?: {
            name?: string | null;
            whatsapp?: string | null;
            phone?: string | null;
        } | null;
    }>;
    enrollments?: Array<NonNullable<EnrollmentSummary>>;
};

type GuardianMe = {
    name: string;
    email?: string | null;
    cpf?: string | null;
    whatsapp?: string | null;
    phone?: string | null;
    students?: Array<{
        id: string;
        kinship?: string | null;
        kinshipDescription?: string | null;
        student?: {
            name?: string | null;
            enrollments?: Array<NonNullable<EnrollmentSummary>>;
        } | null;
    }>;
};

type ScheduleItem = {
    id: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    schoolYear?: { year?: number | null } | null;
    seriesClass?: {
        series?: { name?: string | null } | null;
        class?: { name?: string | null; shift?: string | null } | null;
    } | null;
    teacherSubject?: {
        subject?: { name?: string | null } | null;
        teacher?: { name?: string | null } | null;
    } | null;
};

type TeacherScheduleResponse = {
    scope: 'PROFESSOR';
    items: ScheduleItem[];
};

type StudentScheduleResponse = {
    scope: 'ALUNO';
    enrollment?: EnrollmentSummary;
    items: ScheduleItem[];
};

type GuardianScheduleResponse = {
    scope: 'RESPONSAVEL';
    students: Array<{
        studentId: string;
        studentName: string;
        kinship?: string | null;
        kinshipDescription?: string | null;
        enrollment?: EnrollmentSummary;
        items: ScheduleItem[];
    }>;
};

type KinshipLink = {
    kinship?: string | null;
    kinshipDescription?: string | null;
};

type OwnProfile = TeacherMe | StudentMe | GuardianMe | null;
type OwnSchedule =
    | TeacherScheduleResponse
    | StudentScheduleResponse
    | GuardianScheduleResponse
    | null;

const DAY_LABELS: Record<string, string> = {
    SEGUNDA: 'SEGUNDA-FEIRA',
    'SEGUNDA-FEIRA': 'SEGUNDA-FEIRA',
    TERCA: 'TERÇA-FEIRA',
    'TERCA-FEIRA': 'TERÇA-FEIRA',
    QUARTA: 'QUARTA-FEIRA',
    'QUARTA-FEIRA': 'QUARTA-FEIRA',
    QUINTA: 'QUINTA-FEIRA',
    'QUINTA-FEIRA': 'QUINTA-FEIRA',
    SEXTA: 'SEXTA-FEIRA',
    'SEXTA-FEIRA': 'SEXTA-FEIRA',
    SABADO: 'SÁBADO',
    DOMINGO: 'DOMINGO',
};

function isPersonalRole(role: string | null) {
    return role === 'PROFESSOR' || role === 'ALUNO' || role === 'RESPONSAVEL';
}

function getOwnEndpoint(role: string | null) {
    switch (role) {
        case 'PROFESSOR':
            return '/teachers/me';
        case 'ALUNO':
            return '/students/me';
        case 'RESPONSAVEL':
            return '/guardians/me';
        default:
            return null;
    }
}

function getPrimaryPhone(profile: OwnProfile) {
    if (!profile) return 'NÃO INFORMADO';
    return profile.whatsapp || profile.phone || 'NÃO INFORMADO';
}

function getCurrentEnrollment(student: StudentMe) {
    return Array.isArray(student.enrollments) && student.enrollments.length > 0
        ? student.enrollments[0]
        : null;
}

function getEnrollmentLabel(enrollment?: EnrollmentSummary) {
    const seriesName = enrollment?.seriesClass?.series?.name || 'SEM SÉRIE';
    const className = enrollment?.seriesClass?.class?.name || 'SEM TURMA';
    const year = enrollment?.schoolYear?.year;
    return year ? `${seriesName} - ${className} (${year})` : `${seriesName} - ${className}`;
}

function getStudentClassLabel(student: StudentMe) {
    return getEnrollmentLabel(getCurrentEnrollment(student));
}

function getGuardianKinshipLabel(link: KinshipLink) {
    if (link.kinship === 'OUTROS' && link.kinshipDescription) {
        return link.kinshipDescription;
    }

    return link.kinship || 'VÍNCULO NÃO INFORMADO';
}

function getDayLabel(dayOfWeek?: string | null) {
    return DAY_LABELS[String(dayOfWeek || '').trim().toUpperCase()] || dayOfWeek || 'DIA NÃO INFORMADO';
}

function getRoleAreaLabel(role: string | null) {
    if (role === 'PROFESSOR') return 'Área do professor';
    if (role === 'ALUNO') return 'Área do aluno';
    return 'Área do responsável';
}

function getScheduleSectionTitle(role: string | null) {
    if (role === 'PROFESSOR') return 'Meu horário semanal';
    if (role === 'ALUNO') return 'Meu horário da turma';
    return 'Horários dos meus alunos';
}

function getSubjectLabel(item: ScheduleItem) {
    return item.teacherSubject?.subject?.name || 'DISCIPLINA NÃO INFORMADA';
}

function getTeacherLabel(item: ScheduleItem) {
    return item.teacherSubject?.teacher?.name || 'PROFESSOR NÃO INFORMADO';
}

function getClassLabel(item: ScheduleItem) {
    return getEnrollmentLabel({
        id: item.id,
        schoolYear: item.schoolYear,
        seriesClass: item.seriesClass,
    });
}

function renderScheduleCard(item: ScheduleItem, variant: 'teacher' | 'student') {
    return (
        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                        {getDayLabel(item.dayOfWeek)}
                    </div>
                    <div className="mt-2 text-lg font-extrabold text-slate-800">
                        {item.startTime} - {item.endTime}
                    </div>
                </div>
                <div className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.15em] text-blue-700">
                    {variant === 'teacher' ? 'Minha aula' : 'Aula da turma'}
                </div>
            </div>

            <div className="mt-4 text-sm font-bold text-slate-800">{getSubjectLabel(item)}</div>
            <div className="mt-2 text-sm font-medium text-slate-500">
                {variant === 'teacher' ? getClassLabel(item) : getTeacherLabel(item)}
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const [tenant, setTenant] = useState<CurrentTenant | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [ownProfile, setOwnProfile] = useState<OwnProfile>(null);
    const [ownSchedule, setOwnSchedule] = useState<OwnSchedule>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);

    useEffect(() => {
        const loadDashboard = async () => {
            try {
                setIsLoading(true);
                setErrorStatus(null);

                const { token, role } = getDashboardAuthContext();
                if (!token) {
                    throw new Error('Sessão não encontrada. Faça login novamente.');
                }

                setCurrentRole(role);

                const ownEndpoint = getOwnEndpoint(role);
                const tenantPromise = fetch(`${API_BASE_URL}/tenants/current`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const ownPromise = ownEndpoint
                    ? fetch(`${API_BASE_URL}${ownEndpoint}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                    : Promise.resolve<Response | null>(null);
                const schedulePromise = isPersonalRole(role)
                    ? fetch(`${API_BASE_URL}/class-schedule-items/me`, {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                    : Promise.resolve<Response | null>(null);

                const [tenantResponse, ownResponse, scheduleResponse] = await Promise.all([
                    tenantPromise,
                    ownPromise,
                    schedulePromise,
                ]);

                const tenantData = await tenantResponse.json().catch(() => null);
                if (!tenantResponse.ok) {
                    throw new Error(tenantData?.message || 'Não foi possível carregar a escola logada.');
                }

                setTenant(tenantData);

                if (ownResponse) {
                    const ownData = await ownResponse.json().catch(() => null);
                    if (!ownResponse.ok) {
                        throw new Error(ownData?.message || 'Não foi possível carregar seus dados.');
                    }

                    setOwnProfile(ownData);
                } else {
                    setOwnProfile(null);
                }

                if (scheduleResponse) {
                    const scheduleData = await scheduleResponse.json().catch(() => null);
                    if (!scheduleResponse.ok) {
                        throw new Error(scheduleData?.message || 'Não foi possível carregar seu horário.');
                    }

                    setOwnSchedule(scheduleData);
                } else {
                    setOwnSchedule(null);
                }
            } catch (error) {
                setErrorStatus(error instanceof Error ? error.message : 'Não foi possível carregar o painel.');
            } finally {
                setIsLoading(false);
            }
        };

        void loadDashboard();
    }, []);

    if (isPersonalRole(currentRole)) {
        const teacherProfile = currentRole === 'PROFESSOR' ? (ownProfile as TeacherMe | null) : null;
        const studentProfile = currentRole === 'ALUNO' ? (ownProfile as StudentMe | null) : null;
        const guardianProfile = currentRole === 'RESPONSAVEL' ? (ownProfile as GuardianMe | null) : null;
        const studentSchedule = ownSchedule?.scope === 'ALUNO' ? ownSchedule : null;
        const guardianSchedule = ownSchedule?.scope === 'RESPONSAVEL' ? ownSchedule : null;

        return (
            <div className="mx-auto mt-6 max-w-6xl space-y-6">
                <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
                    <div className="bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.18),_transparent_52%),linear-gradient(135deg,#eff6ff_0%,#ffffff_45%,#f8fafc_100%)] px-8 py-12">
                        <div className="flex flex-col items-center text-center">
                            <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_25px_60px_rgba(15,23,42,0.10)]">
                                {tenant?.logoUrl ? (
                                    <img src={tenant.logoUrl} alt={`Logotipo de ${tenant.name}`} className="h-full w-full object-contain p-4" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-slate-100 px-6 text-center text-xs font-bold uppercase tracking-[0.25em] text-slate-400">
                                        Escola
                                    </div>
                                )}
                            </div>

                            <h1 className="mt-6 text-3xl font-extrabold text-[#153a6a]">
                                {isLoading ? 'Carregando painel...' : ownProfile?.name || 'Meu painel'}
                            </h1>
                            <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-blue-600">
                                {getRoleAreaLabel(currentRole)}
                            </p>
                            <p className="mt-3 max-w-2xl text-base font-medium text-slate-500">
                                {tenant?.name || 'Escola logada'}
                            </p>

                            {errorStatus ? (
                                <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 px-5 py-3 text-sm font-bold text-red-600">
                                    {errorStatus}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 px-8 py-8 md:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Meu cadastro</div>
                            <div className="mt-3 text-lg font-extrabold text-slate-800">{ownProfile?.name || 'Carregando...'}</div>
                            <div className="mt-2 text-sm font-medium text-slate-500">{(ownProfile as { email?: string | null } | null)?.email || 'E-mail não informado'}</div>
                            <div className="mt-1 text-sm font-medium text-slate-500">CPF: {(ownProfile as { cpf?: string | null } | null)?.cpf || 'NÃO INFORMADO'}</div>
                            <div className="mt-1 text-sm font-medium text-slate-500">Telefone: {getPrimaryPhone(ownProfile)}</div>
                        </div>

                        {teacherProfile ? (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Minhas disciplinas</div>
                                <div className="mt-4 space-y-2">
                                    {Array.isArray(teacherProfile.teacherSubjects) && teacherProfile.teacherSubjects.length > 0 ? (
                                        teacherProfile.teacherSubjects.map((item) => (
                                            <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                                                {item.subject?.name || 'DISCIPLINA NÃO INFORMADA'}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-sm font-medium text-slate-500">Nenhuma disciplina vinculada ainda.</div>
                                    )}
                                </div>
                            </div>
                        ) : null}

                        {studentProfile ? (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Minha turma atual</div>
                                <div className="mt-3 text-lg font-extrabold text-slate-800">
                                    {ownProfile ? getStudentClassLabel(studentProfile) : 'Carregando...'}
                                </div>
                                <div className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Meus responsáveis</div>
                                <div className="mt-3 space-y-2">
                                    {Array.isArray(studentProfile.guardians) && studentProfile.guardians.length > 0 ? (
                                        studentProfile.guardians.map((item) => (
                                            <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                                <div className="text-sm font-bold text-slate-800">{item.guardian?.name || 'RESPONSÁVEL'}</div>
                                                <div className="mt-1 text-xs font-medium uppercase tracking-[0.15em] text-blue-600">{getGuardianKinshipLabel(item)}</div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-sm font-medium text-slate-500">Nenhum responsável vinculado.</div>
                                    )}
                                </div>
                            </div>
                        ) : null}

                        {guardianProfile ? (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm md:col-span-2">
                                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Meus alunos vinculados</div>
                                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                                    {Array.isArray(guardianProfile.students) && guardianProfile.students.length > 0 ? (
                                        guardianProfile.students.map((item) => (
                                            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                                <div className="text-base font-extrabold text-slate-800">{item.student?.name || 'ALUNO'}</div>
                                                <div className="mt-1 text-xs font-medium uppercase tracking-[0.15em] text-blue-600">{getGuardianKinshipLabel(item)}</div>
                                                <div className="mt-3 text-sm font-medium text-slate-500">
                                                    {getEnrollmentLabel(item.student?.enrollments?.[0] || null)}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-sm font-medium text-slate-500">Nenhum aluno vinculado a este responsável.</div>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {currentRole === 'PROFESSOR' ? (
                        <>
                            <div className="border-t border-slate-200 px-8 py-6">
                                <div className="rounded-[28px] border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-slate-50 p-5 shadow-sm">
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                        <div>
                                            <div className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Calendário expandido</div>
                                            <div className="mt-2 text-xl font-extrabold text-slate-800">Veja suas aulas em mês, semana ou dia</div>
                                            <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
                                                Abra a nova visão expandida para navegar pela sua grade anual com horários, aulas por dia e os lançamentos de prova, trabalho, recado ou falta.
                                            </p>
                                        </div>
                                        <Link
                                            href="/principal/calendario-aulas"
                                            className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                                        >
                                            Abrir calendário expandido
                                        </Link>
                                    </div>
                                </div>
                            </div>
                            <TeacherDailyAgendaPanel />
                        </>
                    ) : (
                    <div className="border-t border-slate-200 px-8 py-8">
                        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                                    {currentRole === 'RESPONSAVEL' ? 'Consulta por vínculo' : 'Consulta própria'}
                                </div>
                                <h2 className="mt-2 text-2xl font-extrabold text-slate-800">{getScheduleSectionTitle(currentRole)}</h2>
                            </div>
                            <div className="text-sm font-medium text-slate-500">
                                {currentRole === 'ALUNO' && studentSchedule?.scope === 'ALUNO'
                                    ? getEnrollmentLabel(studentSchedule.enrollment || null)
                                    : 'Horários agrupados por aluno vinculado'}
                            </div>
                        </div>

                        {currentRole === 'ALUNO' ? (
                            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {studentSchedule?.items?.length ? (
                                    studentSchedule.items.map((item) => renderScheduleCard(item, 'student'))
                                ) : (
                                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm font-medium text-slate-500 md:col-span-2 xl:col-span-3">
                                        Ainda não há aulas planejadas para a sua turma atual.
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {currentRole === 'RESPONSAVEL' ? (
                            <div className="mt-6 space-y-5">
                                {guardianSchedule?.students?.length ? (
                                    guardianSchedule.students.map((student) => (
                                        <div key={student.studentId} className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
                                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                <div>
                                                    <div className="text-lg font-extrabold text-slate-800">{student.studentName}</div>
                                                    <div className="mt-1 text-xs font-bold uppercase tracking-[0.15em] text-blue-600">
                                                        {getGuardianKinshipLabel(student)}
                                                    </div>
                                                </div>
                                                <div className="text-sm font-medium text-slate-500">
                                                    {getEnrollmentLabel(student.enrollment || null)}
                                                </div>
                                            </div>

                                            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                                {student.items.length ? (
                                                    student.items.map((item) => renderScheduleCard(item, 'student'))
                                                ) : (
                                                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-sm font-medium text-slate-500 md:col-span-2 xl:col-span-3">
                                                        Ainda não há aulas planejadas para este aluno.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm font-medium text-slate-500">
                                        Nenhum aluno vinculado foi encontrado para montar a consulta do horário.
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto mt-10 max-w-4xl">
            <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
                <div className="bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.18),_transparent_52%),linear-gradient(135deg,#eff6ff_0%,#ffffff_45%,#f8fafc_100%)] px-8 py-14 text-center">
                    <div className="mx-auto flex max-w-2xl flex-col items-center">
                        <div className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_25px_60px_rgba(15,23,42,0.10)]">
                            {tenant?.logoUrl ? (
                                <img src={tenant.logoUrl} alt={`Logotipo de ${tenant.name}`} className="h-full w-full object-contain p-4" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center bg-slate-100 px-6 text-center text-sm font-bold uppercase tracking-[0.25em] text-slate-400">
                                    Logo da escola
                                </div>
                            )}
                        </div>

                        <h1 className="mt-8 text-3xl font-extrabold text-[#153a6a]">
                            {isLoading ? 'Carregando escola...' : tenant?.name || 'Gestão Escolar'}
                        </h1>
                        <p className="mt-3 max-w-xl text-base font-medium text-slate-500">
                            {isLoading
                                ? 'Buscando os dados da escola logada.'
                                : tenant?.city && tenant?.state
                                    ? `${tenant.city} - ${tenant.state}`
                                    : 'Sistema operacional pronto para cadastrar professores, alunos, turmas e toda a rotina escolar.'}
                        </p>

                        {errorStatus ? (
                            <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 px-5 py-3 text-sm font-bold text-red-600">
                                {errorStatus}
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">Visões administrativas</div>
                <div className="grid grid-cols-1 gap-4 px-8 py-8 md:grid-cols-4">
                    <Link href="/principal/pessoas" className="dashboard-band-soft rounded-2xl border p-5 shadow-sm transition-colors hover:border-blue-300">
                        <h3 className="flex items-center justify-between font-bold text-slate-800">
                            Pessoas e Perfis
                            <span className="font-bold text-blue-500">→</span>
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">Consulta somente leitura do cadastro-base compartilhado entre professores, alunos e responsáveis.</p>
                    </Link>
                    <Link href="/principal/dashboard" className="dashboard-band-soft rounded-2xl border p-5 shadow-sm transition-colors hover:border-blue-300">
                        <h3 className="flex items-center justify-between font-bold text-slate-800">
                            Dashboard
                            <span className="font-bold text-blue-500">→</span>
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">Abra a nova tela de métricas e atalhos rápidos para tomar decisões.</p>
                    </Link>
                    <Link href="/principal/grade" className="dashboard-band-soft rounded-2xl border p-5 shadow-sm transition-colors hover:border-blue-300">
                        <h3 className="flex items-center justify-between font-bold text-slate-800">
                            Grade Escolar
                            <span className="font-bold text-blue-500">→</span>
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">Monte a grade semanal e organize os horários da escola.</p>
                    </Link>
                    <Link href="/principal/relatorios" className="dashboard-band-soft rounded-2xl border p-5 shadow-sm transition-colors hover:border-blue-300">
                        <h3 className="flex items-center justify-between font-bold text-slate-800">
                            Relatórios
                            <span className="font-bold text-blue-500">→</span>
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">Acompanhe a operação da escola com visão centralizada do sistema.</p>
                    </Link>
                </div>
            </div>
        </div>
    );
}
