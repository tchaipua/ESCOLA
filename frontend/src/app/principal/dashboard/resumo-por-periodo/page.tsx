 'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

type SeriesClassApiItem = {
  id: string;
  series?: { name?: string | null; sortOrder?: number | null };
  class?: { shift?: string | null };
  enrollments?: Array<{ id: string }>;
  studentsCount?: number;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

const SHIFT_LABELS: Record<string, string> = {
  MANHA: 'Manhã',
  TARDE: 'Tarde',
  NOITE: 'Noite',
};
const DEFAULT_SHIFT = 'MANHA';

export default function ResumoPorPeriodoPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shiftTotals, setShiftTotals] = useState<Record<string, number>>({});
  const [totalStudents, setTotalStudents] = useState(0);
  const branding = useMemo(() => (tenantId ? readCachedTenantBranding(tenantId) : null), [tenantId]);
  const [currentRole, setCurrentRole] = useState<string | null>(null);

  const canView = ['SOFTHOUSE_ADMIN', 'ADMIN', 'SECRETARIA', 'COORDENACAO'].includes(currentRole || '');

  useEffect(() => {
    const auth = getDashboardAuthContext();
    setTenantId(auth.tenantId);
    setCurrentRole(auth.role);
  }, []);

  useEffect(() => {
    if (!tenantId) return;

    const fetchData = async () => {
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
          throw new Error(data?.message || 'Não foi possível carregar os dados do período.');
        }

        const items = Array.isArray(data) ? (data as SeriesClassApiItem[]) : [];
        const totals: Record<string, number> = {};
        let total = 0;

        items.forEach((item) => {
          const count = Array.isArray(item.enrollments) ? item.enrollments.length : item.studentsCount ?? 0;
          const shiftRaw = (item.class?.shift || 'MANHA').toUpperCase();
          const key = SHIFT_LABELS[shiftRaw] ? shiftRaw : 'MANHA';
          totals[key] = (totals[key] || 0) + count;
          total += count;
        });

        setShiftTotals(totals);
        setTotalStudents(total);
      } catch (err: any) {
        setError(err.message ?? 'Falha ao carregar o resumo por período.');
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [tenantId]);

  if (!canView) {
    return (
      <DashboardAccessDenied
        title="Acesso restrito"
        message="Você não possui autorização para visualizar o resumo por período desta escola."
      />
    );
  }

  const periodEntries = Object.entries(shiftTotals).sort();

  return (
    <div className="space-y-6">
      <div className="w-full space-y-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm text-left">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt={`Logo de ${branding.schoolName}`} className="h-full w-full object-contain p-1.5" />
            ) : (
              <span className="text-xs font-black uppercase tracking-[0.35em] text-[#153a6a]">
                {branding?.schoolName ? branding.schoolName.slice(0, 3).toUpperCase() : 'ESC'}
              </span>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-blue-600">Resumo geral</p>
            <h1 className="text-3xl font-black text-[#153a6a]">Total de alunos por período</h1>
            <p className="text-sm font-medium text-slate-500">
              Veja a distribuição dos alunos por turno (manhã, tarde e noite) em um único painel.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">
            Total de alunos ativos{' '}
            <span className="ml-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-blue-50 to-blue-100 px-4 py-2 text-2xl font-extrabold text-[#153a6a] inline-flex items-center">
              {totalStudents}
            </span>
          </div>
        </div>
      </div>

      <div className="w-full space-y-4 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        {error && <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div>}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-[28px] border border-slate-200 bg-slate-50" />
            ))}
          </div>
        ) : periodEntries.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm font-medium text-slate-500">
            Nenhum aluno encontrado nos períodos registrados.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {periodEntries.map(([shift, count]) => {
              const slug = shift.toLowerCase();
              return (
                <Link
                  key={shift}
                  href={`/principal/dashboard/resumo-por-periodo/${slug}`}
                  className="group flex flex-col gap-3 rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-6 text-left shadow-sm transition hover:border-blue-400 hover:bg-white hover:text-slate-900"
                >
                  <div className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">{SHIFT_LABELS[shift] || shift}</div>
                  <div className="text-3xl font-extrabold text-blue-600">{count}</div>
                  <div className="text-sm font-bold uppercase tracking-[0.25em] text-slate-500">Alunos matriculados</div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-500 transition group-hover:text-blue-700">
                    Clique para ver os alunos
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
