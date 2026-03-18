'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

type SeriesClassSummary = {
  id: string;
  label: string;
  studentsCount: number;
  seriesSortOrder?: number | null;
};

type TenantBranding = {
  schoolName: string;
  logoUrl?: string | null;
};

const API_BASE_URL = 'http://localhost:3001/api/v1';

export default function ResumoPorTurmaPage() {
const [summary, setSummary] = useState<SeriesClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const branding = readCachedTenantBranding(tenantId);
  const totalStudents = useMemo(
    () => summary.reduce((acc, item) => acc + item.studentsCount, 0),
    [summary],
  );

  useEffect(() => {
    const auth = getDashboardAuthContext();
    setTenantId(auth.tenantId);
  }, []);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true);
        setError(null);
        const { token } = getDashboardAuthContext();
        if (!token) return;

        const response = await fetch(`${API_BASE_URL}/series-classes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.message || 'Não foi possível carregar as turmas.');
        }

        const mapped = Array.isArray(data)
          ? data.map((item: any) => ({
              id: item.id,
              label: `${item.series?.name ?? 'SEM SÉRIE'} • ${item.class?.name ?? 'SEM TURMA'}`,
              studentsCount:
                Array.isArray(item.enrollments) ? item.enrollments.length : item.studentsCount ?? 0,
              seriesSortOrder: item.series?.sortOrder ?? null,
            }))
          : [];

        const sorted = [...mapped].sort((a, b) => {
          const orderA = a.seriesSortOrder ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.seriesSortOrder ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return a.label.localeCompare(b.label);
        });

        setSummary(sorted);
      } catch (err: any) {
        setError(err.message ?? 'Falha ao carregar resumo por turma.');
      } finally {
        setLoading(false);
      }
    };

    void fetchSummary();
  }, []);

  if (!tenantId) {
    return null;
  }

  if (!loading && !branding) {
    // still show even without branding
  }

  return (
    <div className="space-y-8">
      <section className="mx-auto max-w-5xl rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt={`Logo de ${branding.schoolName}`} className="h-full w-full object-contain p-2" />
            ) : (
              <span className="text-xs font-black uppercase tracking-[0.35em] text-slate-400">
                {branding?.schoolName ? branding.schoolName.slice(0, 3).toUpperCase() : 'ESC'}
              </span>
            )}
          </div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Resumo por turma</p>
          <h1 className="text-3xl font-extrabold text-[#153a6a]">Quantidade de alunos por turma</h1>
          <p className="text-sm font-medium text-slate-500">
            Um panorama rápido com o total de alunos matriculados em cada turma ativa.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Total de alunos ativos</p>
            <div className="flex items-center justify-center rounded-[28px] border border-slate-200 bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 shadow-sm">
              <span className="text-4xl font-extrabold text-[#153a6a]">{totalStudents}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-[28px] border border-slate-200 bg-slate-50" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {summary.map((item) => (
              <article key={item.id} className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 text-slate-700 shadow-sm">
                <div className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Turma</div>
                <div className="mt-2 text-lg font-extrabold text-slate-900">{item.label}</div>
                <div className="mt-4 text-sm font-bold uppercase tracking-[0.25em] text-slate-500">Alunos matriculados</div>
                <div className="text-3xl font-extrabold text-blue-600">{item.studentsCount}</div>
              </article>
            ))}
            {summary.length === 0 && (
              <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm font-medium text-slate-500">
                Nenhuma turma encontrada no momento.
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
