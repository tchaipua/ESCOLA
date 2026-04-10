'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const ALLOWED_ROLES = new Set(['SOFTHOUSE_ADMIN', 'ADMIN', 'SECRETARIA', 'COORDENACAO']);
const SHIFT_LABELS: Record<string, string> = {
  MANHA: 'Manhã',
  TARDE: 'Tarde',
  NOITE: 'Noite',
};

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

type StudentRecord = {
  id: string;
  name: string;
  email?: string | null;
};

type GuardianSummary = {
  id: string;
  name: string;
  phone?: string | null;
  relation?: string | null;
};

const formatPhoneNumber = (value?: string | null) => {
  if (!value) return '';
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

export default function DashboardPeriodStudentsPage() {
  const params = useParams();
  const rawShiftParam = params?.shift;
  const shiftParam = Array.isArray(rawShiftParam) ? rawShiftParam[0] : rawShiftParam;
  const normalizedShift = (shiftParam || 'manha').toUpperCase();
  const shiftLabel = SHIFT_LABELS[normalizedShift] || 'Período';

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [guardians, setGuardians] = useState<GuardianRecord[]>([]);
  const branding = tenantId ? readCachedTenantBranding(tenantId) : null;

  const canView = ALLOWED_ROLES.has(role || '');

  useEffect(() => {
    const { tenantId: currentTenantId, role: currentRole } = getDashboardAuthContext();
    setTenantId(currentTenantId);
    setRole(currentRole);
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const { token } = getDashboardAuthContext();
        if (!token) throw new Error('Token ausente.');

        const summaryResponse = await fetch(`${API_BASE_URL}/series-classes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const summaryData = await summaryResponse.json().catch(() => null);
        if (!summaryResponse.ok) throw new Error(summaryData?.message || 'Não foi possível carregar as turmas.');

        const items = Array.isArray(summaryData) ? (summaryData as any[]) : [];
        const matchingClasses = items.filter((item) => {
          const shift = ((item.class?.shift as string) || 'MANHA').toUpperCase();
          return shift === normalizedShift;
        });

        const seriesIds = Array.from(new Set(matchingClasses.map((item) => item.series?.id).filter(Boolean)));

        const studentResponses = await Promise.all(
          seriesIds.map((seriesId) =>
            fetch(`${API_BASE_URL}/series-classes/series/${seriesId}/students`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ),
        );

        const studentDataArrays = await Promise.all(
          studentResponses.map((response) => response.json().catch(() => null)),
        );

        const normalized: StudentRecord[] = [];
        const seen = new Set<string>();

        studentDataArrays.forEach((data) => {
          const payload = Array.isArray(data?.students) ? data.students : [];
          payload.forEach((student: any) => {
            if (seen.has(student.id)) return;
            seen.add(student.id);
            normalized.push({
              id: student.id,
              name: student.name ?? 'NOME NÃO INFORMADO',
              email: student.email ?? null,
            });
          });
        });

        setStudents(normalized);
      } catch (err: any) {
        setError(err.message ?? 'Falha ao carregar os alunos do período.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [tenantId, normalizedShift]);

  useEffect(() => {
    if (!tenantId) return;
    const loadGuardians = async () => {
      try {
        const { token } = getDashboardAuthContext();
        if (!token) return;
        const response = await fetch(`${API_BASE_URL}/guardians`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.message || 'Não foi possível carregar os responsáveis.');
        }
        const resolvedGuardians = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
          ? data.data
          : [];
        setGuardians(resolvedGuardians);
      } catch {
        // silencioso
      }
    };
    void loadGuardians();
  }, [tenantId]);

  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return students;
    return students.filter((student) => student.name.toLowerCase().includes(term));
  }, [students, searchTerm]);

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

  if (!canView) {
    return (
      <DashboardAccessDenied
        title="Acesso restrito"
        message="Você não possui autorização para visualizar os alunos deste período."
      />
    );
  }

  const visibleStudents = filteredStudents.length;

  return (
    <div className="space-y-6">
      <section className="w-full space-y-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm text-left">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt={`Logo de ${branding.schoolName}`} className="h-full w-full object-contain p-2" />
            ) : (
              <span className="text-xs font-black uppercase tracking-[0.35em] text-slate-400">
                {branding?.schoolName ? branding.schoolName.slice(0, 3).toUpperCase() : 'ESC'}
              </span>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-blue-600">Resumo por período</p>
            <h1 className="text-3xl font-black text-[#153a6a]">Alunos do período</h1>
            <p className="text-sm font-medium text-slate-500">
              Visualize os alunos do turno de <span className="font-bold">{shiftLabel}</span>. Use a pesquisa para localizar nomes rapidamente.
            </p>
          </div>
        </div>
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-4 text-left shadow-lg shadow-blue-600/30">
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-100">Período selecionado</p>
            <div className="text-4xl font-black tracking-wide text-white">{shiftLabel}</div>
          </div>
          <div className="flex flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500 flex items-center gap-3">
              Total de alunos ativos
              <span className="rounded-[28px] border border-slate-200 bg-gradient-to-r from-blue-50 to-blue-100 px-5 py-3 text-3xl font-extrabold text-[#153a6a] inline-flex items-center">
                {students.length}
              </span>
            </div>
            <div className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">{visibleStudents} exibido(s)</div>
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
            aria-label="Pesquisar aluno pela matrícula"
            placeholder="Digite o nome do aluno"
            value={searchTerm}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-72"
          />
        </div>

        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-44 animate-pulse rounded-[32px] border border-slate-200 bg-slate-50"
              />
            ))}
          </div>
        ) : visibleStudents === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center text-sm font-medium text-slate-500">
            Nenhum aluno encontrado para o período selecionado.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredStudents.map((student) => {
              const initials = student.name
                .split(/\s+/)
                .filter(Boolean)
                .map((part) => part[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();
              const loginBadgeClass = student.email
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-red-300 bg-red-50 text-red-600';
              const guardiansList = guardiansByStudentId[student.id] ?? [];
              return (
                <article
                  key={student.id}
                  className="grid w-full gap-4 divide-y divide-slate-100 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm"
                >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xl font-black uppercase tracking-[0.2em] text-slate-700">
                    {initials || student.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-[0.04em] text-slate-900">
                      {student.name}
                    </h3>
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
                      ALUNO
                    </span>
                  </div>
                </div>
                <span
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] ${loginBadgeClass}`}
                >
                  {student.email ? 'LOGIN ATIVO' : 'SEM LOGIN'}
                </span>
              </div>
              {guardiansList.length > 0 && (
                <div className="space-y-2 pt-3 text-sm">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                    RESPONSÁVEIS
                  </div>
                  <div className="space-y-1">
                    {guardiansList.map((guardian) => {
                      const formattedPhone = guardian.phone
                        ? `${formatPhoneNumber(guardian.phone)} · `
                        : '';
                      const relationLabel = guardian.relation ? ` - ${guardian.relation}` : '';
                      return (
                        <div
                          key={`${student.id}-${guardian.id}`}
                          className="overflow-hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"
                        >
                          {`${formattedPhone}${guardian.name}${relationLabel}`}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
