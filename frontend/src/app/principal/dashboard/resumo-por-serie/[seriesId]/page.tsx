'use client';

import Link from 'next/link';
import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const API_BASE_URL = 'http://localhost:3001/api/v1';
const ALLOWED_ROLES = new Set(['SOFTHOUSE_ADMIN', 'ADMIN', 'SECRETARIA', 'COORDENACAO']);

type SeriesStudentResponse = {
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
};

type SeriesStudentsResponse = {
  seriesId: string;
  seriesName?: string | null;
  students?: SeriesStudentResponse[] | null;
};

type StudentCard = {
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
};

const formatAddress = (student: StudentCard) => {
  const lineOne = [student.street, student.number].filter(Boolean).join(', ');
  const cityLine = [student.city, student.state].filter(Boolean).join(' - ');
  const extras = [student.neighborhood, student.zipCode].filter(Boolean).join(' • ');
  return [lineOne, cityLine, extras].filter(Boolean).join(' • ') || 'Não informado';
};

const formatPhone = (student: StudentCard) => {
  return student.phone || 'Não informado';
};

const formatUpdatedAt = (value: string | null) => {
  if (!value) return 'Não informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export default function DashboardSeriesStudentsPage() {
  const [students, setStudents] = useState<StudentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seriesName, setSeriesName] = useState('');
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

  const params = useParams();
  const seriesId = params?.seriesId;

  useEffect(() => {
    const fetchStudents = async () => {
      if (!seriesId) return;
      setLoading(true);
      setError(null);
      try {
        const { token } = getDashboardAuthContext();
        if (!token) throw new Error('Token ausente.');
        const response = await fetch(`${API_BASE_URL}/series-classes/series/${seriesId}/students`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.message || 'Não foi possível carregar os alunos da série.');
        }
        setSeriesName(data?.seriesName ?? '');
        const payload = data as SeriesStudentsResponse | null;
        const normalized = Array.isArray(payload?.students)
          ? payload.students.map((student) => ({
              id: student.id,
              name: student.name ?? 'NOME NÃO INFORMADO',
              cpf: student.cpf ?? null,
              email: student.email ?? null,
              phone: student.phone ?? student.whatsapp ?? student.cellphone1 ?? student.cellphone2 ?? null,
              street: student.street ?? null,
              number: student.number ?? null,
              city: student.city ?? null,
              state: student.state ?? null,
              neighborhood: student.neighborhood ?? null,
              zipCode: student.zipCode ?? null,
              updatedAt: student.updatedAt ?? null,
            }))
          : [];
        setStudents(normalized);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao buscar os alunos desta série.';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void fetchStudents();
  }, [seriesId]);

  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return students;
    return students.filter((student) => student.name.toLowerCase().includes(term));
  }, [students, searchTerm]);

  const totalStudents = students.length;
  const visibleStudents = filteredStudents.length;

  if (!canView) {
    return (
      <DashboardAccessDenied
        title="Acesso restrito"
        message="Você não possui autorização para visualizar os alunos desta série."
      />
    );
  }

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
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-blue-600">Resumo por série</p>
            <h1 className="text-3xl font-black text-[#153a6a]">Alunos da série</h1>
            <p className="text-sm font-medium text-slate-500">
              Lista completa dos alunos vinculados a {seriesName || 'esta série'}. Utilize a pesquisa para encontrar rapidamente um aluno pelo nome.
            </p>
          </div>
        </div>
        <div className="space-y-5 border-t border-slate-100 pt-4">
          <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-4 text-left shadow-lg shadow-blue-600/30">
            <div className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-100">Série selecionada</div>
            <div className="text-4xl font-black tracking-wide text-white">{seriesName || 'SÉRIE NÃO INFORMADA'}</div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-left">
            <span className="text-sm font-black uppercase tracking-[0.35em] text-slate-500">Total de alunos ativos</span>
            <span className="flex h-11 w-11 items-center justify-center rounded-[28px] border border-slate-200 bg-gradient-to-r from-blue-50 to-blue-100 text-3xl font-extrabold text-[#153a6a]">
              {totalStudents}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-400">{visibleStudents} exibido(s)</span>
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
                className="h-44 animate-pulse rounded-[28px] border border-slate-200 bg-slate-50"
              />
            ))}
          </div>
        ) : visibleStudents === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center text-sm font-medium text-slate-500">
            Nenhum aluno encontrado para o filtro atual.
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {filteredStudents.map((student) => (
              <article key={student.id} className="rounded-[28px] border border-slate-200 bg-slate-50 p-6 shadow-sm transition hover:border-blue-300 hover:bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Pessoa compartilhada</p>
                    <h3 className="text-lg font-extrabold text-slate-900">{student.name}</h3>
                    <p className="text-xs font-medium uppercase tracking-[0.25em] text-slate-500">Sem login configurado</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-slate-600">
                    ALUNO
                  </span>
                </div>
                <div className="mt-6 grid gap-4 text-sm text-slate-600 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">CPF</p>
                    <p className="text-base font-semibold text-slate-900">{student.cpf || 'Não informado'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">Telefone</p>
                    <p className="text-base font-semibold text-slate-900">{formatPhone(student)}</p>
                  </div>
                </div>
                <div className="mt-5">
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">Endereço base</p>
                  <p className="text-base font-semibold text-slate-900">{formatAddress(student)}</p>
                </div>
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-500">
                  Última atualização: <span className="text-slate-900">{formatUpdatedAt(student.updatedAt)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
