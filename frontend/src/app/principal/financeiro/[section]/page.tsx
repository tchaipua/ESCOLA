'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import { getDashboardAuthContext, hasAnyDashboardPermission } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const FINANCEIRO_FRONTEND_URL =
  process.env.NEXT_PUBLIC_FINANCEIRO_FRONTEND_URL || 'http://localhost:3003';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

const SECTION_CONFIG = {
  resumo: {
    label: 'Resumo geral',
    path: '/resumo',
  },
  empresa: {
    label: 'Empresa',
    path: '/empresas',
  },
  bancos: {
    label: 'Bancos',
    path: '/bancos',
  },
  lotes: {
    label: 'Lotes',
    path: '/recebiveis/lotes',
  },
  retornos: {
    label: 'Retornos',
    path: '/recebiveis/retornos',
  },
  parcelas: {
    label: 'Parcelas',
    path: '/recebiveis/parcelas',
  },
  caixa: {
    label: 'Caixa',
    path: '/caixa',
  },
} as const;

type SectionKey = keyof typeof SECTION_CONFIG;

function buildFinanceFrameUrl(
  baseUrl: string,
  path: string,
  authContext: ReturnType<typeof getDashboardAuthContext>,
  tenantBranding?: ReturnType<typeof readCachedTenantBranding> | null,
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

  if (authContext.role) {
    params.set('userRole', authContext.role.toUpperCase());
  }

  if (authContext.permissions.length) {
    params.set('permissions', authContext.permissions.join(',').toUpperCase());
  }

  if (tenantBranding?.schoolName) {
    params.set('companyName', tenantBranding.schoolName.toUpperCase());
  }

  if (tenantBranding?.logoUrl) {
    params.set('logoUrl', tenantBranding.logoUrl);
  }

  return `${normalizedBaseUrl}${path}?${params.toString()}`;
}

export default function PrincipalFinanceiroSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const [isMounted, setIsMounted] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const [isFrameLoading, setIsFrameLoading] = useState(true);
  const authContext = getDashboardAuthContext();
  const canViewFinancial = hasAnyDashboardPermission(
    authContext.role,
    authContext.permissions,
    ['VIEW_FINANCIAL', 'MANAGE_MONTHLY_FEES', 'VIEW_CASHIER', 'SETTLE_RECEIVABLES'],
  );
  const tenantBranding = readCachedTenantBranding(authContext.tenantId);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsMounted(true), 0);
    void params.then((value) => setSection(String(value.section || '').toLowerCase()));
    return () => window.clearTimeout(timer);
  }, [params]);

  const sectionConfig = useMemo(() => {
    if (!section) return null;
    return SECTION_CONFIG[section as SectionKey] || null;
  }, [section]);

  const iframeSrc = useMemo(() => {
    if (!sectionConfig) return null;
    return buildFinanceFrameUrl(FINANCEIRO_FRONTEND_URL, sectionConfig.path, authContext, tenantBranding);
  }, [authContext, sectionConfig, tenantBranding]);

  useEffect(() => {
    if (iframeSrc) {
      const timer = window.setTimeout(() => setIsFrameLoading(true), 0);
      return () => window.clearTimeout(timer);
    }
  }, [iframeSrc]);

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

  if (!sectionConfig || !iframeSrc) {
    return (
      <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl items-center justify-center">
        <div className="w-full rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-600">Financeiro</div>
          <div className="mt-2 text-xl font-black text-slate-900">Área não encontrada</div>
        </div>
      </div>
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
                <h1 className="mt-2 text-3xl font-black tracking-tight">{sectionConfig.label}</h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                  Tela completa do Financeiro aberta dentro do sistema da Escola.
                </p>
              </div>
            </div>

            {section === 'caixa' ? null : (
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-blue-50">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">Operador</div>
                <div className="mt-1 text-base font-black">
                  {authContext.name || 'USUÁRIO DO SISTEMA'}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="relative bg-slate-100">
          {isFrameLoading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/80 backdrop-blur-sm">
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm">
                Carregando {sectionConfig.label.toLowerCase()}...
              </div>
            </div>
          ) : null}

          <iframe
            key={iframeSrc}
            title={`Financeiro integrado - ${sectionConfig.label}`}
            src={iframeSrc}
            onLoad={() => setIsFrameLoading(false)}
            className="block h-[calc(100vh-11rem)] w-full bg-white"
          />
        </div>
      </section>
    </div>
  );
}
