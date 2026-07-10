'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import PrincipalProgramHeader from '@/app/components/principal-program-header';
import {
  fetchTenantBranches,
  getDashboardAuthContext,
  hasAnyDashboardPermission,
  type TenantBranchSummary,
} from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const FINANCEIRO_FRONTEND_URL =
  process.env.NEXT_PUBLIC_FINANCEIRO_FRONTEND_URL || 'http://localhost:3003';

type BranchStockParameterMode = 'NO' | 'YES' | 'BY_PRODUCT';

type BranchStockParameters = {
  stockControlMode: BranchStockParameterMode;
  stockIntegerQuantityMode: BranchStockParameterMode;
  stockLotControlMode: BranchStockParameterMode;
  stockExpirationControlMode: BranchStockParameterMode;
  stockGridControlMode: BranchStockParameterMode;
  stockNegativeControlMode: BranchStockParameterMode;
};

function normalizeDisplayText(value: string | null | undefined) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  if (!/[\u00c3\u00c2\u00e2]/.test(trimmed)) return trimmed;

  try {
    return decodeURIComponent(escape(trimmed));
  } catch {
    return trimmed;
  }
}

function normalizeStockParameterMode(value: unknown): BranchStockParameterMode {
  const normalized = String(value || '').trim().toUpperCase();

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

function buildFinanceiroHomeFrameUrl(
  baseUrl: string,
  authContext: ReturnType<typeof getDashboardAuthContext>,
  schoolName?: string | null,
  logoUrl?: string | null,
  branchStockParameters?: BranchStockParameters | null,
) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const params = new URLSearchParams({ embedded: '1', sourceSystem: 'ESCOLA' });

  if (authContext.tenantId) params.set('sourceTenantId', authContext.tenantId.toUpperCase());
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
  if (authContext.userId) params.set('cashierUserId', authContext.userId.toUpperCase());
  if (authContext.name) {
    params.set(
      'cashierDisplayName',
      String(normalizeDisplayText(authContext.name) || authContext.name).toUpperCase(),
    );
  }
  if (authContext.role) params.set('userRole', authContext.role.toUpperCase());
  if (authContext.permissions.length) {
    params.set('permissions', authContext.permissions.join(',').toUpperCase());
  }
  if (schoolName) params.set('companyName', schoolName.toUpperCase());
  if (logoUrl) params.set('logoUrl', logoUrl);

  return `${normalizedBaseUrl}/?${params.toString()}`;
}

export default function PrincipalFinanceiroPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [currentBranch, setCurrentBranch] = useState<TenantBranchSummary | null>(null);
  const [branchStockParameters, setBranchStockParameters] = useState<BranchStockParameters | null>(null);
  const [loadedFrameSrc, setLoadedFrameSrc] = useState<string | null>(null);
  const authContext = getDashboardAuthContext();
  const canViewFinancial = hasAnyDashboardPermission(
    authContext.role,
    authContext.permissions,
    ['VIEW_FINANCIAL', 'MANAGE_MONTHLY_FEES', 'VIEW_CASHIER', 'SETTLE_RECEIVABLES'],
  );
  const tenantBranding = readCachedTenantBranding(authContext.tenantId);
  const schoolName = tenantBranding?.schoolName || currentBranch?.name || null;
  const logoUrl = currentBranch?.logoUrl || tenantBranding?.logoUrl || null;

  useEffect(() => {
    const timer = window.setTimeout(() => setIsMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadBranchContext() {
      try {
        if (!authContext.token || !authContext.tenantId) {
          if (isActive) {
            setCurrentBranch(null);
            setBranchStockParameters(null);
          }
          return;
        }

        const branches = await fetchTenantBranches();
        const activeBranches = branches.filter(
          (branch) => branch && branch.isActive !== false && !branch.isShared,
        );
        const nextBranch =
          activeBranches.find((branch) => branch.branchCode === authContext.branchCode) ||
          activeBranches.find((branch) => branch.branchCode === 1) ||
          activeBranches[0] ||
          null;

        if (isActive) {
          setCurrentBranch(nextBranch);
          setBranchStockParameters(getBranchStockParameters(nextBranch));
        }
      } catch {
        if (isActive) {
          setCurrentBranch(null);
          setBranchStockParameters(null);
        }
      }
    }

    void loadBranchContext();
    return () => {
      isActive = false;
    };
  }, [authContext.branchCode, authContext.tenantId, authContext.token]);

  const iframeSrc = useMemo(
    () =>
      buildFinanceiroHomeFrameUrl(
        FINANCEIRO_FRONTEND_URL,
        authContext,
        schoolName,
        logoUrl,
        branchStockParameters,
      ),
    [authContext, branchStockParameters, logoUrl, schoolName],
  );
  const isFrameLoading = loadedFrameSrc !== iframeSrc;

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
        title="Financeiro indisponivel"
        message="Seu perfil nao possui permissao para visualizar o portal financeiro integrado."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PrincipalProgramHeader
        eyebrow="Financeiro integrado"
        title="Portal Financeiro"
        description="Tela central do Financeiro aberta dentro da Escola."
        schoolName={schoolName}
        logoUrl={logoUrl}
        density="compact"
        secondaryAction={
          <>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('msinfor-financeiro-toggle-sidebar'))}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/20"
              title="Recolher menu lateral"
              aria-label="Recolher menu lateral"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('msinfor-financeiro-open-notifications'))}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/20"
              title="Abrir notificacoes"
              aria-label="Abrir notificacoes"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
          </>
        }
      />

      <section className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-sm">
        {isFrameLoading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/80 backdrop-blur-sm">
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm">
              Carregando financeiro...
            </div>
          </div>
        ) : null}

        <iframe
          key={iframeSrc}
          title="Financeiro - tela central"
          src={iframeSrc}
          onLoad={() => setLoadedFrameSrc(iframeSrc)}
          className="block h-[calc(100vh-12.5rem)] w-full bg-white"
        />
      </section>
    </div>
  );
}
