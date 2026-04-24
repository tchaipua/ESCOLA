'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getDashboardAuthContext, hasAnyDashboardPermission } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const FINANCEIRO_FRONTEND_URL =
  process.env.NEXT_PUBLIC_FINANCEIRO_FRONTEND_URL || 'http://localhost:3003';
const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_PORTAL_INTEGRADO';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

const TABS = [
  {
    id: 'resumo',
    label: 'Resumo geral',
    path: '/',
    description: 'Visão consolidada da operação financeira desta escola.',
  },
  {
    id: 'empresas',
    label: 'Empresa',
    path: '/empresas',
    description: 'Cadastro financeiro automático da escola atual.',
  },
  {
    id: 'lotes',
    label: 'Lotes',
    path: '/recebiveis/lotes',
    description: 'Importações recebidas da Escola para o Financeiro.',
  },
  {
    id: 'parcelas',
    label: 'Parcelas',
    path: '/recebiveis/parcelas',
    description: 'Parcelas abertas, vencidas e baixadas da escola.',
  },
  {
    id: 'caixa',
    label: 'Caixa',
    path: '/caixa',
    description: 'Abertura e fechamento do caixa do usuário logado.',
  },
] as const;

function buildFinanceFrameUrl(
  baseUrl: string,
  path: string,
  authContext: ReturnType<typeof getDashboardAuthContext>,
) {
  const normalizedBaseUrl = baseUrl.endsWith('/')
    ? baseUrl.slice(0, -1)
    : baseUrl;

  const params = new URLSearchParams({
    embedded: '1',
    sourceSystem: 'ESCOLA',
  });

  if (authContext.tenantId) {
    params.set('sourceTenantId', authContext.tenantId.toUpperCase());
  }

  if (authContext.userId) {
    params.set('cashierUserId', authContext.userId.toUpperCase());
  }

  if (authContext.name) {
    params.set('cashierDisplayName', authContext.name.toUpperCase());
  }

  return `${normalizedBaseUrl}${path}?${params.toString()}`;
}

export default function PrincipalFinanceiroPage() {
  const authContext = getDashboardAuthContext();
  const canViewFinancial = hasAnyDashboardPermission(
    authContext.role,
    authContext.permissions,
    ['VIEW_FINANCIAL', 'MANAGE_MONTHLY_FEES', 'VIEW_CASHIER', 'SETTLE_RECEIVABLES'],
  );
  const tenantBranding = readCachedTenantBranding(authContext.tenantId);
  const [activeTabId, setActiveTabId] = useState<(typeof TABS)[number]['id']>('resumo');
  const [isFrameLoading, setIsFrameLoading] = useState(true);

  const activeTab = useMemo(
    () => TABS.find((tab) => tab.id === activeTabId) || TABS[0],
    [activeTabId],
  );

  const iframeSrc = useMemo(
    () => buildFinanceFrameUrl(FINANCEIRO_FRONTEND_URL, activeTab.path, authContext),
    [activeTab.path, authContext],
  );

  useEffect(() => {
    setIsFrameLoading(true);
  }, [iframeSrc]);

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
                  O financeiro abre dentro da Escola, sem autenticação separada, já filtrado pela escola e pelo usuário logados.
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
                  {authContext.name || 'USUÁRIO DO SISTEMA'}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
          <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" />
        </div>
      </section>

      <section className={`${cardClass} p-6`}>
        <div className="grid gap-3 xl:grid-cols-5">
          {TABS.map((tab) => {
            const isActive = tab.id === activeTabId;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTabId(tab.id)}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  isActive
                    ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50'
                }`}
              >
                <div className="text-xs font-black uppercase tracking-[0.18em]">
                  {tab.label}
                </div>
                <div className="mt-2 text-sm font-medium leading-5">
                  {tab.description}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
            Área embutida
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-900">
            {activeTab.label}
          </h2>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Se o quadro abaixo não carregar, confirme se o `financeiro-frontend` está ativo em `localhost:3003`.
          </p>
        </div>

        <div className="relative bg-slate-100">
          {isFrameLoading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/80 backdrop-blur-sm">
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm">
                Carregando o Financeiro desta escola...
              </div>
            </div>
          ) : null}

          <iframe
            key={iframeSrc}
            title={`Financeiro integrado - ${activeTab.label}`}
            src={iframeSrc}
            onLoad={() => setIsFrameLoading(false)}
            className="block h-[calc(100vh-18rem)] min-h-[960px] w-full bg-white"
          />
        </div>
      </section>
    </div>
  );
}
