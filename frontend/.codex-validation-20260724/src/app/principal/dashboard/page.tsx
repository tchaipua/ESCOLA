'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

type TenantBranding = {
  schoolName: string;
  logoUrl?: string | null;
};

export default function DashboardOverviewPage() {
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);

  useEffect(() => {
    const { tenantId } = getDashboardAuthContext();
    if (!tenantId) return;
    const cached = readCachedTenantBranding(tenantId);
    if (cached) {
      setTenantBranding(cached);
    }
  }, []);

  const dashboardPrograms = [
    {
      href: '/principal/dashboard/resumo',
      title: 'Resumo geral',
      description: 'Visão combinada de pessoas e usuários para monitoramento rápido.',
    },
    {
      href: '/principal/dashboard/resumo-por-serie',
      title: 'Resumo por série',
      description: 'Agrupa os alunos por série com total por ciclo e alertas.',
    },
    {
      href: '/principal/dashboard/resumo-por-turma',
      title: 'Resumo por turma',
      description: 'Detalha cada turma com quantidade de alunos ativos.',
    },
    {
      href: '/principal/dashboard/resumo-por-periodo',
      title: 'Resumo por período',
      description: 'Apresenta os totais de alunos por turno (manhã, tarde e noite).',
    },
    {
      href: '/principal/dashboard/resumo-professor-aulas',
      title: 'Resumo Semanal Professor x Aulas',
      description: 'Relaciona professores ativos com o total de aulas agendadas e registradas.',
    },
  ];

  return (
    <div className="mx-auto mt-6 flex w-full max-w-6xl flex-col gap-6 px-4">
      <div className="w-full rounded-[32px] bg-gradient-to-br from-[#0c1c37] via-[#0f2f5a] to-[#153a6a] p-4 text-white shadow-lg shadow-blue-900/40">
        <div className="flex flex-row items-center justify-between gap-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-[18px] border border-white/20 bg-white/10 p-2">
            {tenantBranding?.logoUrl ? (
              <img
                src={tenantBranding.logoUrl}
                alt={`Logo de ${tenantBranding.schoolName}`}
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-lg font-black uppercase tracking-[0.4em] text-white/70">
                {tenantBranding?.schoolName ? tenantBranding.schoolName.slice(0, 3).toUpperCase() : 'ESCOLA'}
              </span>
            )}
          </div>
          <div className="flex-1 text-right text-sm font-semibold uppercase tracking-[0.4em] text-white/80">
            Central de gráficos e acompanhamentos
          </div>
        </div>
      </div>
      <section className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm shadow-slate-400/10">
        <div className="mt-1 grid gap-4 md:grid-cols-3">
          {dashboardPrograms.map((program) => (
            <Link
              key={program.href}
              href={program.href}
              className="flex flex-col gap-1 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-5 text-left shadow-sm transition hover:border-blue-300 hover:bg-white"
            >
              <div className="text-lg font-extrabold text-blue-600">{program.title}</div>
              <p className="text-sm font-medium text-slate-500">{program.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
