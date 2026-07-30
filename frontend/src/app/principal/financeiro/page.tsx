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

const FINANCEIRO_FRONTEND_URL = '/financeiro-app';

function buildFinanceiroHomeFrameUrl(
  baseUrl: string,
) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalizedBaseUrl}/?embedded=1`;
}

export default function PrincipalFinanceiroPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [currentBranch, setCurrentBranch] = useState<TenantBranchSummary | null>(null);
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
        }
      } catch {
        if (isActive) {
          setCurrentBranch(null);
        }
      }
    }

    void loadBranchContext();
    return () => {
      isActive = false;
    };
  }, [authContext.branchCode, authContext.tenantId, authContext.token]);

  const iframeSrc = useMemo(
    () => buildFinanceiroHomeFrameUrl(FINANCEIRO_FRONTEND_URL),
    [],
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
          className="block h-full w-full bg-white"
        />
      </section>
    </div>
  );
}
