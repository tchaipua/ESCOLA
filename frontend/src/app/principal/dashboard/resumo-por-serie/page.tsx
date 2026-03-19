'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const API_BASE_URL = 'http://localhost:3001/api/v1';

type SeriesSummary = {
  id: string;
  name: string;
  studentsCount: number;
  sortOrder?: number | null;
};

type SeriesClassApiItem = {
  id: string;
  series?: {
    id?: string;
    name?: string | null;
    sortOrder?: number | null;
  };
  enrollments?: Array<{ id: string }>;
  studentsCount?: number;
};

export default function DashboardResumoSeriePage() {
  const [seriesSummary, setSeriesSummary] = useState<SeriesSummary[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const branding = useMemo(() => (tenantId ? readCachedTenantBranding(tenantId) : null), [tenantId]);
  const canView = ['SOFTHOUSE_ADMIN', 'ADMIN', 'SECRETARIA', 'COORDENACAO'].includes(role || '');

  useEffect(() => {
    const { tenantId: currentTenantId, role: currentRole, token: currentToken } = getDashboardAuthContext();
    setTenantId(currentTenantId);
    setRole(currentRole);
    setToken(currentToken);
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(true);
      return;
    }
    if (!canView) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/series-classes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.message || 'Não foi possível carregar o resumo por série.');
        }

        const items = Array.isArray(data) ? (data as SeriesClassApiItem[]) : [];
        const grouped = new Map<string, SeriesSummary>();
        items.forEach((item) => {
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

        const sorted = Array.from(grouped.values()).sort((a, b) => {
          const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB;
          return a.name.localeCompare(b.name);
        });

        setSeriesSummary(sorted);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar as séries.');
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [token, canView]);

  const totalStudents = useMemo(
    () => seriesSummary.reduce((acc, series) => acc + series.studentsCount, 0),
    [seriesSummary],
  );

  if (!canView && !loading) {
    return (
      <DashboardAccessDenied
        title="Acesso restrito"
        message="Você não possui autorização para visualizar o resumo por série desta escola."
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl border border-slate-200 bg-white shadow-sm">
            {branding?.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={`Logo de ${branding.schoolName}`}
                className="h-full w-full object-contain p-2"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-black uppercase tracking-[0.35em] text-[#153a6a]">
                {branding?.schoolName ? branding.schoolName.slice(0, 3).toUpperCase() : 'ESC'}
              </div>
            )}
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.35em] text-blue-600">Resumo geral</p>
            <h1 className="text-3xl font-black text-[#153a6a]">Alunos por série</h1>
            <p className="text-sm font-medium text-slate-500">
              Total de alunos matriculados por série. Clique em qualquer card para abrir o detalhe desta série.
            </p>
          </div>
        </div>
        <div className="text-sm font-black uppercase tracking-[0.35em] text-slate-500">
          {totalStudents} aluno(s) ativos
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-[28px] border border-slate-200 bg-slate-50" />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {seriesSummary.map((series) => (
            <Link
              key={series.id}
              href={`/principal/dashboard/resumo-por-serie/${series.id}`}
              className="flex flex-col justify-between rounded-[28px] border border-slate-200 bg-white p-5 text-left transition hover:border-blue-400 hover:bg-blue-50"
            >
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Série</p>
                <h2 className="text-2xl font-black text-slate-900">{series.name}</h2>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Matriculados</p>
                  <p className="text-3xl font-extrabold text-blue-600">{series.studentsCount}</p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.35em] text-blue-500">Ver alunos</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
