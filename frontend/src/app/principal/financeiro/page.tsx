'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import { getDashboardAuthContext, hasAnyDashboardPermission } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

const MENU_ITEMS = [
  {
    id: 'empresa',
    label: 'Empresa',
    href: '/principal/financeiro/empresa',
    description: 'Cadastro financeiro automático da escola atual.',
    image: '/principal-financeiro/empresa.svg?v=2',
  },
  {
    id: 'bancos',
    label: 'Bancos',
    href: '/principal/financeiro/bancos',
    description: 'Cadastro dos bancos usados pela escola.',
    image: '/principal-financeiro/bancos.svg?v=1',
  },
  {
    id: 'resumo',
    label: 'Resumo geral',
    href: '/principal/financeiro/resumo',
    description: 'Visão consolidada da operação financeira desta escola.',
    image: '/principal-financeiro/resumo.svg?v=2',
  },
  {
    id: 'lotes',
    label: 'Envio\\Registro Boletos',
    href: '/principal/financeiro/lotes',
    description: '',
    title: 'REGISTRAR BOLETOS NO BANCO DAS PARCELAS GERADAS',
    image: '/principal-financeiro/lotes.svg?v=2',
  },
  {
    id: 'retornos',
    label: 'Retorno Boletos',
    href: '/principal/financeiro/retornos',
    description: 'Importações e conferências de retornos bancários.',
    image: '/principal-financeiro/retornos.svg?v=2',
  },
  {
    id: 'parcelas',
    label: 'Parcelas a Receber',
    href: '/principal/financeiro/parcelas',
    description: 'Parcelas abertas, vencidas e baixadas da escola.',
    image: '/principal-financeiro/parcelas.svg?v=2',
  },
  {
    id: 'caixa',
    label: 'Controle Caixa',
    href: '/principal/financeiro/caixa',
    description: 'Abertura e fechamento do caixa do usuário logado.',
    image: '/principal-financeiro/caixa.svg?v=2',
  },
] as const;

function normalizeDisplayText(value: string | null | undefined) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  if (!/[ÃÂâ]/.test(trimmed)) {
    return trimmed;
  }

  try {
    return decodeURIComponent(escape(trimmed));
  } catch {
    return trimmed;
  }
}

export default function PrincipalFinanceiroPage() {
  const [isMounted, setIsMounted] = useState(false);
  const authContext = getDashboardAuthContext();
  const canViewFinancial = hasAnyDashboardPermission(
    authContext.role,
    authContext.permissions,
    ['VIEW_FINANCIAL', 'MANAGE_MONTHLY_FEES', 'VIEW_CASHIER', 'SETTLE_RECEIVABLES'],
  );
  const tenantBranding = readCachedTenantBranding(authContext.tenantId);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!isMounted) {
    return (
      <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl items-center justify-center">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Carregando</div>
          <div className="mt-2 text-xl font-black text-slate-900">Aguarde...</div>
        </div>
      </div>
    );
  }

  if (!canViewFinancial) {
    return (
      <DashboardAccessDenied
        title="Financeiro indisponível"
        message="Seu perfil não possui permissão para visualizar o portal financeiro integrado."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/20 bg-white/10 shadow-lg backdrop-blur-sm">
                {tenantBranding?.logoUrl ? (
                  <img
                    src={tenantBranding.logoUrl}
                    alt={`Logo de ${tenantBranding.schoolName}`}
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <span className="text-lg font-black uppercase tracking-[0.25em] text-white">
                    {String(tenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
                  Financeiro integrado
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight">Portal Financeiro</h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                  Escolha abaixo a área desejada para abrir a tela completa do Financeiro.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-blue-50">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">Escola atual</div>
                <div className="mt-1 text-base font-black">
                  {tenantBranding?.schoolName || 'ESCOLA LOGADA'}
                </div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-blue-50">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">Operador</div>
                <div className="mt-1 text-base font-black">
                  {normalizeDisplayText(authContext.name) || 'USUÁRIO DO SISTEMA'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${cardClass} p-6`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              title={'title' in item ? item.title : item.description}
              className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
            >
              <div className="flex h-20 items-center justify-center overflow-hidden bg-slate-100 p-3">
                <img
                  src={item.image}
                  alt={item.label}
                  className="max-h-full max-w-full object-contain opacity-95 transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="flex min-h-11 items-center justify-center p-2.5 text-center">
                <div className="text-sm font-black text-slate-800">
                  {item.label}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
