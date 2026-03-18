'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

type SeriesSummary = {
  id: string;
  name: string;
  studentsCount: number;
  sortOrder?: number | null;
};

const API_BASE_URL = 'http://localhost:3001/api/v1';

export default function DashboardResumoSeriePage() {
  const [seriesSummary, setSeriesSummary] = useState<SeriesSummary[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const branding = useMemo(() => (tenantId ? readCachedTenantBranding(tenantId) : null), [tenantId]);
  const canView = ['SOFTHOUSE_ADMIN', 'ADMIN', 'SECRETARIA', 'COORDENACAO'].includes(role || '');

  useEffect(() => {
    const { tenantId: currentTenantId, role: currentRole } = getDashboardAuthContext();
    setTenantId(currentTenantId);
    setRole(currentRole);
  }, []);

  useEffect(() => {
    if (!tenantId) return;

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
          throw new Error(data?.message || 'Não foi possível carregar os dados de séries.');
        }

        const grouped = new Map<string, SeriesSummary>();
        if (Array.isArray(data)) {
          data.forEach((item: any) => {
            const seriesId = item.series?.id ?? `__UNKNOWN__${item.id}`;
            const seriesName = (item.series?.name || 'SEM SÉRIE').toUpperCase();
            const current = grouped.get(seriesId);
            const studentCount =
              Array.isArray(item.enrollments) ? item.enrollments.length : item.studentsCount ?? 0;
            const sortOrder = item.series?.sortOrder ?? null;

            if (current) {
              grouped.set(seriesId, {
                ...current,
                studentsCount: current.studentsCount + studentCount,
                sortOrder: current.sortOrder ?? sortOrder,
              });
            } else {
              grouped.set(seriesId, {
                id: seriesId,
                name: seriesName,
                studentsCount: studentCount,
                sortOrder,
              });
            }

          });
        }

        const sorted = Array.from(grouped.values()).sort((a, b) => {
          const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB;
          return a.name.localeCompare(b.name);
        });

        setSeriesSummary(sorted);
      } catch (err: any) {
        setError(err.message ?? 'Falha ao carregar o resumo por série.');
      } finally {
        setLoading(false);
      }
    };

    void fetchSummary();
  }, [tenantId]);

  const totalStudents = useMemo(
    () => seriesSummary.reduce((acc, item) => acc + item.studentsCount, 0),
    [seriesSummary],
  );

  if (!canView) {
    return (
      <DashboardAccessDenied
        title="Acesso restrito"
        message="Você não possui autorização para visualizar o resumo por série desta escola."
      />
    );
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
          <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Resumo por série</p>
          <h1 className="text-3xl font-extrabold text-[#153a6a]">Total de alunos por série</h1>
          <p className="text-sm font-medium text-slate-500">
            Uma visão consolidada para identificar séries com maior volume de alunos e apoiar decisões de alocação.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Total de alunos ativos</p>
            <div className="flex items-center justify-center rounded-[28px] border border-slate-200 bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 shadow-sm">
              <span className="text-4xl font-extrabold text-[#153a6a]">{totalStudents}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-5 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-[28px] border border-slate-200 bg-slate-50" />
            ))}
          </div>
        ) : seriesSummary.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm font-medium text-slate-500">
            Nenhuma série com matrículas foi encontrada.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {seriesSummary.map((series) => (
              <Link
                key={series.id}
                href={`/dashboard/resumo-por-serie/${series.id}`}
                className="flex flex-col gap-3 rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-6 text-left transition hover:border-blue-400 hover:bg-white hover:text-slate-900"
              >
                <div className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Série</div>
                <div className="text-lg font-extrabold text-slate-900">{series.name}</div>
                <div className="text-sm font-bold uppercase tracking-[0.25em] text-slate-500">
                  Alunos matriculados
                </div>
                <div className="text-3xl font-extrabold text-blue-600">{series.studentsCount}</div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-500">Clique para ver os alunos</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
