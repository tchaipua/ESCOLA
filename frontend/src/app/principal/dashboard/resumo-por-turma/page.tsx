'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

type SeriesClassSummary = {
  id: string;
  label: string;
  studentsCount: number;
  seriesSortOrder?: number | null;
  seriesName?: string | null;
  className?: string | null;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

export default function ResumoPorTurmaPage() {
  const [summary, setSummary] = useState<SeriesClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [canView, setCanView] = useState(true);

  const branding = tenantId ? readCachedTenantBranding(tenantId) : null;

  const totalStudents = useMemo(
    () => summary.reduce((acc, item) => acc + item.studentsCount, 0),
    [summary],
  );

  useEffect(() => {
    const auth = getDashboardAuthContext();
    setTenantId(auth.tenantId);
  }, []);

  useEffect(() => {
    const { role } = getDashboardAuthContext();
    setCanView(['SOFTHOUSE_ADMIN', 'ADMIN', 'SECRETARIA', 'COORDENACAO'].includes(role || ''));
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
              seriesName: item.series?.name ?? null,
              className: item.class?.name ?? null,
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

  if (!canView) {
    return (
      <DashboardAccessDenied
        title="Acesso restrito"
        message="Você não possui autorização para visualizar o resumo por turma desta escola."
      />
    );
  }

  return (
    <div className="space-y-6 w-full">
      <div className="w-full space-y-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm text-left">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {branding?.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={`Logo de ${branding.schoolName}`}
                className="h-full w-full object-contain p-1.5"
              />
            ) : (
              <span className="text-xs font-black uppercase tracking-[0.35em] text-[#153a6a]">
                {branding?.schoolName ? branding.schoolName.slice(0, 3).toUpperCase() : 'ESC'}
              </span>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-blue-600">Resumo por turma</p>
            <h1 className="text-3xl font-black text-[#153a6a]">Quantidade de alunos por turma</h1>
            <p className="text-sm font-medium text-slate-500">
              Um panorama rápido com o total de alunos matriculados em cada turma ativa.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4 text-left">
          <span className="text-sm font-black uppercase tracking-[0.35em] text-slate-500">Total de alunos ativos</span>
          <span className="flex h-11 w-11 items-center justify-center rounded-[28px] border border-slate-200 bg-gradient-to-r from-blue-50 to-blue-100 text-3xl font-extrabold text-[#153a6a]">
            {totalStudents}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-400">exibido(s)</span>
        </div>
      </div>

      <section className="w-full space-y-4 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
            {error}
          </div>
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
              <Link
                key={item.id}
                href={`/principal/dashboard/resumo-por-turma/${item.id}`}
                className="flex flex-col justify-between rounded-[28px] border border-slate-200 bg-slate-50 p-5 text-slate-700 shadow-sm transition hover:border-blue-400 hover:bg-white"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Turma</p>
                  <h2 className="text-2xl font-black text-slate-900">{item.label}</h2>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Matriculados</p>
                    <p className="text-3xl font-extrabold text-blue-600">{item.studentsCount}</p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.35em] text-blue-500">Ver alunos</span>
                </div>
              </Link>
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
