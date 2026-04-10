'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

type PersonRole = 'PROFESSOR' | 'ALUNO' | 'RESPONSAVEL';
type ViewOption = PersonRole | 'ALL' | 'USERS';

type PersonRoleEntry = {
  role: PersonRole;
  roleLabel: string;
  recordId: string;
};

type PersonRecord = {
  id: string;
  name: string;
  cpf?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  cellphone1?: string | null;
  roles: PersonRoleEntry[];
  photoUrl?: string | null;
  sharedLoginEnabled?: boolean;
  updatedAt?: string | null;
};
type UserRecord = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  active?: boolean;
  updatedAt?: string | null;
};

type GuardianStudentLink = {
  studentId: string;
  guardianId: string;
  kinship: string;
  kinshipDescription?: string | null;
  student?: {
    id: string;
    personId?: string | null;
    name: string;
  };
};

type GuardianRecord = {
  id: string;
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  cellphone1?: string | null;
  students?: GuardianStudentLink[];
};

type GuardianSummary = {
  id: string;
  name: string;
  phone?: string | null;
  relation?: string | null;
};

type GuardianStudentDetail = {
  studentId: string;
  studentName: string;
  kinship?: string | null;
};

type TeacherSubjectRecord = {
  id: string;
  teacherId: string;
  subjectId: string;
  subject?: {
    id: string;
    name: string;
  };
};

export default function DashboardResumoPage() {
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [guardians, setGuardians] = useState<GuardianRecord[]>([]);
  const [teacherSubjects, setTeacherSubjects] = useState<TeacherSubjectRecord[]>([]);
  const [photoLoadErrors, setPhotoLoadErrors] = useState<Record<string, boolean>>({});
  const [token, setToken] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<ViewOption>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  const canView = ['SOFTHOUSE_ADMIN', 'ADMIN', 'SECRETARIA', 'COORDENACAO'].includes(currentRole || '');

  useEffect(() => {
    const auth = getDashboardAuthContext();
    setToken(auth.token);
    setCurrentRole(auth.role);
    setCurrentTenantId(auth.tenantId);
  }, []);

  const loadData = async () => {
    if (!token) return;
    const [peopleResponse, usersResponse, guardiansResponse, teacherSubjectsResponse] =
      await Promise.all([
        fetch(`${API_BASE_URL}/people`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/users`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/guardians`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/teacher-subjects`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

    const peopleData = await peopleResponse.json().catch(() => null);
    if (!peopleResponse.ok) {
      throw new Error(peopleData?.message || 'Não foi possível carregar os cadastros.');
    }

    const usersData = await usersResponse.json().catch(() => null);
    if (!usersResponse.ok) {
      throw new Error(usersData?.message || 'Não foi possível carregar os usuários do sistema.');
    }

    const guardiansData = await guardiansResponse.json().catch(() => null);
    if (!guardiansResponse.ok) {
      throw new Error(
        guardiansData?.message || 'Não foi possível carregar os responsáveis.',
      );
    }

    const teacherSubjectsData = await teacherSubjectsResponse.json().catch(() => null);
    if (!teacherSubjectsResponse.ok) {
      throw new Error(
        teacherSubjectsData?.message || 'Não foi possível carregar os vínculos de disciplinas.',
      );
    }

    setPeople(Array.isArray(peopleData) ? peopleData : []);
    setPhotoLoadErrors({});
    const resolvedUsers = Array.isArray(usersData)
      ? usersData
      : Array.isArray(usersData?.data)
        ? usersData.data
        : [];
    setUsers(resolvedUsers);
    const resolvedGuardians = Array.isArray(guardiansData)
      ? guardiansData
      : Array.isArray(guardiansData?.data)
        ? guardiansData.data
        : [];
    setGuardians(resolvedGuardians);
    const resolvedTeacherSubjects = Array.isArray(teacherSubjectsData)
      ? teacherSubjectsData
      : Array.isArray(teacherSubjectsData?.data)
        ? teacherSubjectsData.data
        : [];
    setTeacherSubjects(resolvedTeacherSubjects);
  };

  useEffect(() => {
    if (!token || !canView) {
      setIsLoading(false);
      return;
    }

    const run = async () => {
      try {
        setIsLoading(true);
        setErrorStatus(null);
        await loadData();
      } catch (error) {
        setErrorStatus(error instanceof Error ? error.message : 'Falha ao carregar o resumo.');
      } finally {
        setIsLoading(false);
      }
    };

    void run();
  }, [token, canView]);

  const normalizedSearch = searchTerm.trim().toUpperCase();

  const filteredPeople = useMemo(() => {
    if (selectedView === 'USERS') return [];
    return people.filter((person) => {
      const matchesRole =
        selectedView === 'ALL' ? true : person.roles.some((role) => role.role === selectedView);
      const matchesName = !normalizedSearch || person.name.toUpperCase().includes(normalizedSearch);
      const matchesEmail = !normalizedSearch || (person.email || '').toUpperCase().includes(normalizedSearch);
      return matchesRole && (matchesName || matchesEmail);
    });
  }, [people, selectedView, normalizedSearch]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesText =
        !normalizedSearch ||
        user.name?.toUpperCase().includes(normalizedSearch) ||
        user.email?.toUpperCase().includes(normalizedSearch);
      return matchesText;
    });
  }, [users, normalizedSearch]);

  const metrics = useMemo(() => {
    const countByRole = (role: PersonRole) =>
      people.filter((person) => person.roles.some((entry) => entry.role === role)).length;
    return {
      total: people.length,
      professores: countByRole('PROFESSOR'),
      alunos: countByRole('ALUNO'),
      responsaveis: countByRole('RESPONSAVEL'),
      usuarios: users.length,
    };
  }, [people, users]);

  const currentTenantBranding = useMemo(() => readCachedTenantBranding(currentTenantId), [currentTenantId]);
  const guardiansByStudentId = useMemo(() => {
    const map: Record<string, GuardianSummary[]> = {};
    guardians.forEach((guardian) => {
      guardian.students?.forEach((link) => {
        const studentId = link.student?.id ?? link.studentId;
        if (!studentId) return;
        const phone = guardian.phone || guardian.cellphone1 || guardian.whatsapp || null;
        const relation =
          (link.kinshipDescription?.trim() || link.kinship?.trim() || null) ?? null;
        if (!map[studentId]) {
          map[studentId] = [];
        }
        if (!map[studentId].some((entry) => entry.id === guardian.id)) {
          map[studentId].push({ id: guardian.id, name: guardian.name, phone, relation });
        }
      });
    });
    return map;
  }, [guardians]);
  const subjectsByTeacherId = useMemo(() => {
    const map: Record<string, string[]> = {};
    teacherSubjects.forEach((assignment) => {
      const teacherId = assignment.teacherId;
      if (!teacherId) return;
      const subjectName = assignment.subject?.name || assignment.subjectId;
      if (!subjectName) return;
      if (!map[teacherId]) {
        map[teacherId] = [];
      }
      if (!map[teacherId].includes(subjectName)) {
        map[teacherId].push(subjectName);
      }
    });
    return map;
  }, [teacherSubjects]);
  const studentsByGuardianId = useMemo(() => {
    const map: Record<string, GuardianStudentDetail[]> = {};
    guardians.forEach((guardian) => {
      guardian.students?.forEach((link) => {
        const guardianId = guardian.id;
        const studentId = link.student?.id ?? link.studentId;
        const studentName = link.student?.name;
        if (!studentId || !studentName) return;
        const kinship = link.kinshipDescription?.trim() || link.kinship?.trim() || null;
        if (!map[guardianId]) {
          map[guardianId] = [];
        }
        if (!map[guardianId].some((entry) => entry.studentId === studentId)) {
          map[guardianId].push({ studentId, studentName, kinship });
        }
      });
    });
    return map;
  }, [guardians]);

  const shouldShowUsersSection = selectedView === 'USERS' || selectedView === 'ALL';
  const shouldShowPeopleSection = selectedView !== 'USERS';

  const getInitials = (name: string) => {
    const parts = name
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) {
      return '';
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 1).toUpperCase();
    }
    const firstInitial = parts[0].slice(0, 1);
    const lastInitial = parts[parts.length - 1].slice(0, 1);
    return `${firstInitial}${lastInitial}`.toUpperCase();
  };
  const formatPhoneNumber = (value?: string | null) => {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 9) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 8) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return value;
  };

  if (!isLoading && !canView) {
    return (
      <DashboardAccessDenied
        title="Acesso restrito"
        message="Você não possui autorização para visualizar o resumo geral desta escola."
      />
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {currentTenantBranding?.logoUrl ? (
                <img src={currentTenantBranding.logoUrl} alt={`Logo de ${currentTenantBranding.schoolName}`} className="h-full w-full object-contain p-2" />
              ) : (
                <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">
                  {currentTenantBranding?.schoolName ? currentTenantBranding.schoolName.slice(0, 3).toUpperCase() : 'ESC'}
                </span>
              )}
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">Resumo geral</div>
            <h1 className="text-2xl font-extrabold text-slate-900">Rotinas das pessoas e usuários</h1>
            <p className="text-sm font-medium text-slate-500">
              Visão combinada de professores, alunos, responsáveis e usuários do sistema. Clique nos cartões abaixo para aplicar o filtro desejado.
            </p>
          </div>
        </div>
            <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-5">
              {[
                { label: 'TOTAL', value: 'ALL' as ViewOption, count: metrics.total },
                { label: 'PROFESSORES', value: 'PROFESSOR' as ViewOption, count: metrics.professores },
                { label: 'ALUNOS', value: 'ALUNO' as ViewOption, count: metrics.alunos },
                { label: 'RESPONSÁVEIS', value: 'RESPONSAVEL' as ViewOption, count: metrics.responsaveis },
                { label: 'USUÁRIOS', value: 'USERS' as ViewOption, count: metrics.usuarios },
              ].map((metric) => {
                const isSelected = selectedView === metric.value;
                return (
                  <button
                    key={metric.value}
                    type="button"
                    onClick={() => setSelectedView(metric.value)}
                    className={`flex flex-col items-center justify-center rounded-2xl border px-4 py-4 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                        : 'border-slate-200 bg-white text-slate-900 hover:border-blue-400 hover:text-blue-600'
                    }`}
                    aria-pressed={isSelected}
                  >
                    <span className="text-[11px] font-black uppercase tracking-[0.3em] text-inherit">{metric.label}</span>
                    <span className="mt-2 text-2xl font-extrabold text-inherit">{metric.count}</span>
                    {metric.value === 'ALL' && (
                      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-red-600">
                        * MESMA PESSOA PODER TER MAIS DE UM PERFIL
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
      </div>
    </div>

    <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm space-y-5">

        <div className="w-full max-w-md">
          <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Buscar nome ou e-mail</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Digite parte do nome ou e-mail"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
          />
        </div>

        {errorStatus && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{errorStatus}</div>
        )}

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-48 animate-pulse rounded-[28px] border border-slate-200 bg-slate-50" />
            ))}
          </div>
        ) : (
          <>
            {shouldShowUsersSection && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                    Usuários do sistema
                  </div>
                  {selectedView !== 'USERS' && (
                    <span className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
                      Incluindo no geral
                    </span>
                  )}
                </div>
                {filteredUsers.length === 0 ? (
                  <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center text-sm font-medium text-slate-500">
                    Nenhum usuário encontrado
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {filteredUsers.map((user, index) => {
                      const fallbackKey = user.id ?? `${user.email ?? user.name ?? 'user'}-${index}`;
                      return (
                        <article key={fallbackKey} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                          <div className="text-base font-extrabold text-slate-900">{user.name}</div>
                          <div className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Usuário do sistema</div>
                          <div className="mt-2 text-sm font-medium text-slate-500">E-mail: {user.email || 'Não informado'}</div>
                          <div className="mt-2 text-sm font-medium text-slate-500">Perfil: {(user.role || 'Não definido').toUpperCase()}</div>
                          <div className="mt-2 text-xs text-slate-400">{user.active ? 'Ativo' : 'Inativo'}</div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {shouldShowPeopleSection && (
              filteredPeople.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm font-medium text-slate-500">
                  Nenhuma pessoa encontrada para o filtro atual.
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {filteredPeople.map((person) => {
                    const studentRole = person.roles.find((role) => role.role === 'ALUNO');
                    const guardianRole = person.roles.find((role) => role.role === 'RESPONSAVEL');
                    const teacherRole = person.roles.find((role) => role.role === 'PROFESSOR');
                    const guardiansList = studentRole ? guardiansByStudentId[studentRole.recordId] || [] : [];
                    const studentsForGuardian = guardianRole ? studentsByGuardianId[guardianRole.recordId] || [] : [];
                    const shouldShowGuardianStudents = Boolean(studentsForGuardian.length > 0 && !teacherRole);
                    const subjects = teacherRole ? subjectsByTeacherId[teacherRole.recordId] || [] : [];
                    const loginBadgeClass = person.sharedLoginEnabled
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border border-rose-200 bg-rose-50 text-rose-600';
                    const contactPhone = person.whatsapp || person.phone || person.cellphone1 || null;
                    const contactType = person.whatsapp ? 'WhatsApp' : 'Telefone';
                    const formattedContact = formatPhoneNumber(contactPhone);
                    const contactLine = formattedContact
                      ? `${contactType}: ${formattedContact}`
                      : 'Contato pendente';

                    const hasPhoto = Boolean(person.photoUrl && !photoLoadErrors[person.id]);
                    const initials = getInitials(person.name) || person.name.slice(0, 1).toUpperCase();
                    return (
                      <article key={person.id} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-slate-800">
                                {hasPhoto ? (
                                  <img
                                    src={person.photoUrl!}
                                    alt={`Foto de ${person.name}`}
                                    className="h-full w-full object-cover"
                                    onError={() =>
                                      setPhotoLoadErrors((prev) => ({ ...prev, [person.id]: true }))
                                    }
                                  />
                                ) : (
                                  <span className="text-lg font-black uppercase tracking-[0.1em] text-slate-700">
                                    {initials}
                                  </span>
                                )}
                              </div>
                              <div className="max-w-[260px]">
                                <h3 className="text-lg font-black text-slate-900">{person.name}</h3>
                                <p className="mt-0.5 text-sm font-medium uppercase tracking-[0.15em] text-slate-500">
                                  {contactLine}
                                </p>
                              </div>
                            </div>
                            <div className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] ${loginBadgeClass}`}>
                              {person.sharedLoginEnabled ? 'Login ativo' : 'Sem login'}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {person.roles.map((role) => (
                              <span
                                key={`${person.id}-${role.role}`}
                                className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600"
                              >
                                {role.roleLabel}
                              </span>
                            ))}
                          </div>
                          {guardiansList.length > 0 && (
                            <div className="mt-3 space-y-1">
                              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                                Responsáveis
                              </div>
                              <div className="space-y-1">
                                {guardiansList.map((guardian) => {
                                  const formattedGuardianPhone = formatPhoneNumber(guardian.phone);
                                  const relationLabel = guardian.relation ? ` - ${guardian.relation}` : '';
                                  return (
                                    <div
                                      key={guardian.id}
                                      className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600"
                                    >
                                      <div className="flex flex-col gap-1">
                                        <span className="text-slate-700">
                                          {formattedGuardianPhone
                                            ? `${formattedGuardianPhone} · ${guardian.name}${relationLabel}`
                                            : `${guardian.name}${relationLabel}`}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {shouldShowGuardianStudents && (
                            <div className="mt-3">
                              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                                Alunos vinculados
                              </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {studentsForGuardian.map((student) => (
                                    <span
                                      key={`${guardianRole?.recordId}-${student.studentId}`}
                                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-0.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500"
                                    >
                                      <span className="text-slate-700">{student.studentName}</span>
                                      {student.kinship && (
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                          {student.kinship}
                                        </span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                            </div>
                          )}
                          {teacherRole && (
                            <div className="mt-3">
                              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                                Matérias
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {subjects.length > 0 ? (
                                  subjects.map((subject) => (
                                    <span
                                      key={`${teacherRole.recordId}-${subject}`}
                                      className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700"
                                    >
                                      {subject}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                                    Sem matérias registradas
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
