'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import PrincipalProgramHeader from '@/app/components/principal-program-header';
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
        <PrincipalProgramHeader
          eyebrow="Financeiro integrado"
          title="Portal Financeiro"
          description="Escolha abaixo a área desejada para abrir a tela completa do Financeiro."
          schoolName={tenantBranding?.schoolName}
          logoUrl={tenantBranding?.logoUrl}
          secondaryAction={
            <>
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new Event('msinfor-financeiro-toggle-sidebar'));
                }}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/20"
                title="Recolher menu lateral"
                aria-label="Recolher menu lateral"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new Event('msinfor-financeiro-open-notifications'));
                }}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/20"
                title="Abrir notificações"
                aria-label="Abrir notificações"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
            </>
          }
        />
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
