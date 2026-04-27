'use client';

import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const ALLOWED_ROLES = new Set(['SOFTHOUSE_ADMIN', 'ADMIN', 'SECRETARIA', 'COORDENACAO']);

export type StudentCard = {
  id: string;
  name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  number: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  zipCode: string | null;
  updatedAt: string | null;
  photoUrl: string | null;
};

export type StudentApiRecord = {
  id: string;
  name?: string | null;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  cellphone1?: string | null;
  cellphone2?: string | null;
  street?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  zipCode?: string | null;
  updatedAt?: string | null;
  photoUrl?: string | null;
};

export const mapApiStudentToCard = (student: StudentApiRecord): StudentCard => ({
  id: student.id,
  name: student.name ?? 'NOME NÃO INFORMADO',
  cpf: student.cpf ?? null,
  email: student.email ?? null,
  phone:
    student.whatsapp ?? student.cellphone1 ?? student.phone ?? student.cellphone2 ?? null,
  street: student.street ?? null,
  number: student.number ?? null,
  city: student.city ?? null,
  state: student.state ?? null,
  neighborhood: student.neighborhood ?? null,
  zipCode: student.zipCode ?? null,
  updatedAt: student.updatedAt ?? null,
  photoUrl: student.photoUrl ?? null,
});

type GuardianStudentLink = {
  studentId: string;
  guardianId: string;
  kinship: string;
  kinshipDescription?: string | null;
};

type GuardianRecord = {
  id: string;
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  cellphone1?: string | null;
  cellphone2?: string | null;
  students?: GuardianStudentLink[];
};

type GuardianSummary = {
  id: string;
  name: string;
  phone?: string | null;
  relation?: string | null;
};

export type StudentsFetchResult = {
  entityName: string;
  students: StudentCard[];
};

type StudentsDetailPanelProps = {
  headerLabel: string;
  headerTitle: string;
  headerDescription: (entityName: string) => string;
  highlightLabel: string;
  entityFallbackLabel: string;
  emptyStateMessage?: string;
  searchAriaLabel?: string;
  actions?: ReactNode;
  fetchStudents: (token: string) => Promise<StudentsFetchResult>;
};

const defaultEmptyStateMessage = 'Nenhum aluno encontrado para o filtro atual.';

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

const formatPhone = (student: StudentCard) => {
  return formatPhoneNumber(student.phone) || 'NÃO INFORMADO';
};

const getInitials = (name: string) => {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  const firstInitial = parts[0].slice(0, 1);
  const lastInitial = parts[parts.length - 1].slice(0, 1);
  return `${firstInitial}${lastInitial}`.toUpperCase();
};

const formatContactLine = (student: StudentCard) => {
  const phone = formatPhone(student);
  if (phone === 'NÃO INFORMADO') {
    return '';
  }
  return `Telefone: ${phone}`;
};

export default function StudentsDetailPanel(props: StudentsDetailPanelProps) {
  const {
    headerDescription,
    headerLabel,
    headerTitle,
    highlightLabel,
    entityFallbackLabel,
    emptyStateMessage = defaultEmptyStateMessage,
    searchAriaLabel = 'Pesquisar aluno pelo nome',
    actions,
    fetchStudents,
  } = props;

  const [students, setStudents] = useState<StudentCard[]>([]);
  const [guardians, setGuardians] = useState<GuardianRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityName, setEntityName] = useState('');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const branding = tenantId ? readCachedTenantBranding(tenantId) : null;
  const canView = ALLOWED_ROLES.has(role || '');

  useEffect(() => {
    const { tenantId: currentTenant, role: currentRole } = getDashboardAuthContext();
    setTenantId(currentTenant);
    setRole(currentRole);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { token } = getDashboardAuthContext();
        if (!token) {
          throw new Error('Token ausente.');
        }

        const [studentsResult, guardiansResponse] = await Promise.all([
          fetchStudents(token),
          fetch(`${API_BASE_URL}/guardians`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const guardiansData = await guardiansResponse.json().catch(() => null);
        if (!guardiansResponse.ok) {
          throw new Error(
            guardiansData?.message || 'Não foi possível carregar os responsáveis.',
          );
        }

        const resolvedGuardians = Array.isArray(guardiansData)
          ? guardiansData
          : Array.isArray(guardiansData?.data)
          ? guardiansData.data
          : [];

        setStudents(studentsResult.students);
        setEntityName(studentsResult.entityName || '');
        setGuardians(resolvedGuardians);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Falha ao carregar os alunos.';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [fetchStudents]);

  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return students;
    return students.filter((student) => student.name.toLowerCase().includes(term));
  }, [searchTerm, students]);

  const guardiansByStudentId = useMemo(() => {
    const map: Record<string, GuardianSummary[]> = {};
    guardians.forEach((guardian) => {
      guardian.students?.forEach((link) => {
        const studentId = link.studentId;
        if (!studentId) return;
        const phone =
          guardian.whatsapp ||
          guardian.phone ||
          guardian.cellphone1 ||
          guardian.cellphone2 ||
          null;
        const relation =
          (link.kinshipDescription?.trim() || link.kinship?.trim() || null) ?? null;
        if (!map[studentId]) {
          map[studentId] = [];
        }
        if (!map[studentId].some((entry) => entry.id === guardian.id)) {
          map[studentId].push({
            id: guardian.id,
            name: guardian.name,
            phone,
            relation: relation ? relation.toUpperCase() : null,
          });
        }
      });
    });
    return map;
  }, [guardians]);

  const totalStudents = students.length;
  const visibleStudents = filteredStudents.length;

  if (!canView && !loading) {
    return (
      <DashboardAccessDenied
        title="Acesso restrito"
        message="Você não possui autorização para visualizar esta lista de alunos."
      />
    );
  }

  const descriptionText = headerDescription(entityName || entityFallbackLabel);

  return (
    <div className="space-y-8 w-full">
      <section className="w-full space-y-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {branding?.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={`Logo de ${branding.schoolName}`}
                className="h-full w-full object-contain p-2"
              />
            ) : (
              <span className="text-xs font-black uppercase tracking-[0.35em] text-slate-400">
                {branding?.schoolName ? branding.schoolName.slice(0, 3).toUpperCase() : 'ESC'}
              </span>
            )}
          </div>
          <div className="space-y-2 text-left">
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-blue-600">{headerLabel}</p>
            <h1 className="text-3xl font-black text-[#153a6a]">{headerTitle}</h1>
            <p className="text-sm font-medium text-slate-500">{descriptionText}</p>
          </div>
        </div>
        {actions && (
          <div className="flex flex-col gap-3 text-right">{actions}</div>
        )}
        <div className="space-y-5 border-t border-slate-100 pt-4">
          <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-4 text-left shadow-lg shadow-blue-600/30">
            <div className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-100">
              {highlightLabel}
            </div>
            <div className="text-4xl font-black tracking-wide text-white">
              {entityName || entityFallbackLabel}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-left">
            <span className="text-sm font-black uppercase tracking-[0.35em] text-slate-500">
              Total de alunos ativos
            </span>
            <span className="flex h-11 w-11 items-center justify-center rounded-[28px] border border-slate-200 bg-gradient-to-r from-blue-50 to-blue-100 text-3xl font-extrabold text-[#153a6a]">
              {totalStudents}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-400">
              {visibleStudents} exibido(s)
            </span>
          </div>
        </div>
      </section>

      <section className="w-full space-y-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Pesquisa</p>
            <h2 className="text-xl font-extrabold text-slate-900">Filtrar alunos por nome</h2>
          </div>
          <input
            type="search"
            aria-label={searchAriaLabel}
            placeholder="Digite o nome do aluno"
            value={searchTerm}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-72"
          />
        </div>

        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-44 animate-pulse rounded-[28px] border border-slate-200 bg-slate-50"
              />
            ))}
          </div>
        ) : visibleStudents === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center text-sm font-medium text-slate-500">
            {emptyStateMessage}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {filteredStudents.map((student) => {
              const initials = getInitials(student.name) || student.name.slice(0, 1).toUpperCase();
              const contactLine = formatContactLine(student);
              const loginBadgeClass = student.email
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border border-rose-200 bg-rose-50 text-rose-600';
              const guardiansList = guardiansByStudentId[student.id] || [];
              return (
                <article
                  key={student.id}
                  className="rounded-[28px] border border-slate-200 bg-slate-50 p-6 shadow-sm transition hover:border-blue-300 hover:bg-white"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-slate-800">
                          {student.photoUrl ? (
                            <img
                              src={student.photoUrl}
                              alt={`Foto de ${student.name}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-lg font-black uppercase tracking-[0.1em] text-slate-700">
                              {initials}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-lg font-black uppercase tracking-[0.08em] text-slate-900">
                            {student.name.toUpperCase()}
                          </h3>
                          {contactLine && (
                            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-500">
                              {contactLine}
                            </p>
                          )}
                        </div>
                      </div>
                      <div
                        className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] ${loginBadgeClass}`}
                      >
                        {student.email ? 'LOGIN ATIVO' : 'SEM LOGIN'}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
                        ALUNO
                      </span>
                    </div>

                    {guardiansList.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">
                          RESPONSÁVEIS
                        </div>
                        <div className="space-y-1">
                          {guardiansList.map((guardian) => {
                            const formattedGuardianPhone = formatPhoneNumber(guardian.phone);
                            const relationLabel = guardian.relation ? ` - ${guardian.relation}` : '';
                            return (
                              <div
                                key={`${student.id}-${guardian.id}`}
                                className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"
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
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
