'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import {
  fetchTenantBranches,
  getDashboardAuthContext,
  hasAnyDashboardPermission,
  type TenantBranchSummary,
} from '@/app/lib/dashboard-crud-utils';
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
  'contas-a-pagar': {
    label: 'Contas a Pagar',
    path: '/contas-a-pagar',
  },
  estoque: {
    label: 'Estoque',
    path: '/estoque',
  },
  lotes: {
    label: 'Lotes',
    path: '/recebiveis/lotes',
  },
  retornos: {
    label: 'Retorno Boletos Banco',
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

type EmbeddedFinanceHeaderContent = {
  eyebrow: string;
  title: string;
  description: string;
};

type BranchStockParameterMode = 'NO' | 'YES' | 'BY_PRODUCT';

type BranchStockParameters = {
  stockControlMode: BranchStockParameterMode;
  stockIntegerQuantityMode: BranchStockParameterMode;
  stockLotControlMode: BranchStockParameterMode;
  stockExpirationControlMode: BranchStockParameterMode;
  stockGridControlMode: BranchStockParameterMode;
  stockNegativeControlMode: BranchStockParameterMode;
};

const DEFAULT_EMBEDDED_FINANCE_HEADER: EmbeddedFinanceHeaderContent = {
  eyebrow: 'Financeiro integrado',
  title: 'Contas a Pagar',
  description: 'Tela completa do Financeiro aberta dentro do sistema da Escola.',
};

const EMBEDDED_FINANCE_SCREEN_HEADER_MAP: Record<string, EmbeddedFinanceHeaderContent> = {
  PRINCIPAL_FINANCEIRO_BANCOS_EXTRATO: {
    eyebrow: 'Bancos',
    title: 'Extrato bancário',
    description:
      'Controle os lançamentos reais da conta bancária, com créditos, débitos e saldo.',
  },
  PRINCIPAL_FINANCEIRO_BANCOS_MOVIMENTOS_ABERTOS: {
    eyebrow: 'Bancos',
    title: 'Movimentos em aberto',
    description:
      'Confira os movimentos financeiros que ainda precisam de conferência bancária.',
  },
  PRINCIPAL_FINANCEIRO_BANCOS_DDAS_ABERTOS: {
    eyebrow: 'Bancos',
    title: 'DDAs em aberto',
    description:
      'Consulte os boletos DDA em aberto da conta bancária selecionada.',
  },
  PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS: {
    eyebrow: 'Contas a Pagar',
    title: 'IMPORTAÇÃO DE NOTAS',
    description:
      'Importe notas por XML manual ou consulte a SEFAZ com certificado fiscal A1.',
  },
  PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_CERTIFICADOS_DIGITAIS: {
    eyebrow: 'Contas a Pagar',
    title: 'Certificados Digitais',
    description:
      'Cadastre e mantenha os certificados A1 usados na integração fiscal do Financeiro.',
  },
};

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

function normalizeStockParameterMode(value: unknown): BranchStockParameterMode {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  return normalized === 'NO' || normalized === 'YES' || normalized === 'BY_PRODUCT'
    ? normalized
    : 'BY_PRODUCT';
}

function getBranchStockParameters(branch?: TenantBranchSummary | null): BranchStockParameters | null {
  if (!branch) return null;

  return {
    stockControlMode: normalizeStockParameterMode(branch.stockControlMode),
    stockIntegerQuantityMode: normalizeStockParameterMode(branch.stockIntegerQuantityMode),
    stockLotControlMode: normalizeStockParameterMode(branch.stockLotControlMode),
    stockExpirationControlMode: normalizeStockParameterMode(branch.stockExpirationControlMode),
    stockGridControlMode: normalizeStockParameterMode(branch.stockGridControlMode),
    stockNegativeControlMode: normalizeStockParameterMode(branch.stockNegativeControlMode),
  };
}

function buildFinanceFrameUrl(
  baseUrl: string,
  path: string,
  authContext: ReturnType<typeof getDashboardAuthContext>,
  tenantBranding?: ReturnType<typeof readCachedTenantBranding> | null,
  branchStockParameters?: BranchStockParameters | null,
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

  if (Number.isInteger(authContext.branchCode) && authContext.branchCode >= 0) {
    params.set('sourceBranchCode', String(authContext.branchCode));
  }

  if (branchStockParameters) {
    params.set('stockControlMode', branchStockParameters.stockControlMode);
    params.set('stockIntegerQuantityMode', branchStockParameters.stockIntegerQuantityMode);
    params.set('stockLotControlMode', branchStockParameters.stockLotControlMode);
    params.set('stockExpirationControlMode', branchStockParameters.stockExpirationControlMode);
    params.set('stockGridControlMode', branchStockParameters.stockGridControlMode);
    params.set('stockNegativeControlMode', branchStockParameters.stockNegativeControlMode);
  }

  if (authContext.userId) {
    params.set('cashierUserId', authContext.userId.toUpperCase());
  }

  if (authContext.name) {
    params.set(
      'cashierDisplayName',
      String(normalizeDisplayText(authContext.name) || authContext.name).toUpperCase(),
    );
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
  const [loadedFrameSrc, setLoadedFrameSrc] = useState<string | null>(null);
  const [embeddedScreenId, setEmbeddedScreenId] = useState<string | null>(null);
  const [branchStockParameters, setBranchStockParameters] =
    useState<BranchStockParameters | null>(null);
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
    return buildFinanceFrameUrl(
      FINANCEIRO_FRONTEND_URL,
      sectionConfig.path,
      authContext,
      tenantBranding,
      branchStockParameters,
    );
  }, [authContext, branchStockParameters, sectionConfig, tenantBranding]);

  useEffect(() => {
    let isActive = true;

    async function loadBranchStockParameters() {
      try {
        if (!authContext.token || !authContext.tenantId) {
          if (isActive) setBranchStockParameters(null);
          return;
        }

        const branches = await fetchTenantBranches();
        const activeBranches = branches.filter(
          (branch) => branch && branch.isActive !== false && !branch.isShared,
        );
        const currentBranch =
          activeBranches.find((branch) => branch.branchCode === authContext.branchCode) ||
          activeBranches.find((branch) => branch.branchCode === 1) ||
          activeBranches[0] ||
          null;

        if (isActive) {
          setBranchStockParameters(getBranchStockParameters(currentBranch));
        }
      } catch {
        if (isActive) setBranchStockParameters(null);
      }
    }

    void loadBranchStockParameters();

    return () => {
      isActive = false;
    };
  }, [authContext.branchCode, authContext.tenantId, authContext.token]);

  useEffect(() => {
    const timer = window.setTimeout(() => setEmbeddedScreenId(null), 0);
    return () => window.clearTimeout(timer);
  }, [section]);

  const isFrameLoading = Boolean(iframeSrc && loadedFrameSrc !== iframeSrc);

  useEffect(() => {
    const handleEmbeddedScreenContext = (
      event: MessageEvent<{ type?: string; screenId?: string }>,
    ) => {
      const data = event.data;
      if (!data || data.type !== 'MSINFOR_SCREEN_CONTEXT') {
        return;
      }

      const normalizedScreenId = String(data.screenId || '')
        .replace(/[^A-Z0-9_]/gi, '_')
        .replace(/_+/g, '_')
        .toUpperCase()
        .slice(0, 120);

      setEmbeddedScreenId(normalizedScreenId || null);
    };

    window.addEventListener('message', handleEmbeddedScreenContext);
    return () => window.removeEventListener('message', handleEmbeddedScreenContext);
  }, []);

  const headerContent = useMemo(() => {
    if (embeddedScreenId && EMBEDDED_FINANCE_SCREEN_HEADER_MAP[embeddedScreenId]) {
      return EMBEDDED_FINANCE_SCREEN_HEADER_MAP[embeddedScreenId];
    }

    if (section !== 'contas-a-pagar') {
      return {
        eyebrow: 'Financeiro integrado',
        title: sectionConfig?.label || 'Financeiro',
        description: 'Tela completa do Financeiro aberta dentro do sistema da Escola.',
      };
    }

    if (embeddedScreenId) {
      return (
        EMBEDDED_FINANCE_SCREEN_HEADER_MAP[embeddedScreenId] ||
        {
          ...DEFAULT_EMBEDDED_FINANCE_HEADER,
          title: sectionConfig?.label || DEFAULT_EMBEDDED_FINANCE_HEADER.title,
        }
      );
    }

    return {
      ...DEFAULT_EMBEDDED_FINANCE_HEADER,
      title: sectionConfig?.label || DEFAULT_EMBEDDED_FINANCE_HEADER.title,
    };
  }, [embeddedScreenId, section, sectionConfig]);

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
              <div className="flex flex-col gap-3 pt-1">
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
              </div>
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
                  {headerContent.eyebrow}
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight">{headerContent.title}</h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                  {headerContent.description}
                </p>
              </div>
            </div>

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
            onLoad={() => setLoadedFrameSrc(iframeSrc)}
            className="block h-[calc(100vh-11rem)] w-full bg-white"
          />
        </div>
      </section>
    </div>
  );
}
