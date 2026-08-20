'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DependencyRecoveryScreen from '@/app/components/dependency-recovery-screen';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import PrincipalProgramHeader from '@/app/components/principal-program-header';
import {
  fetchTenantBranches,
  getDashboardAuthContext,
  hasAnyDashboardPermission,
  type TenantBranchSummary,
} from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import { withEscolaCsrf } from '@/app/lib/csrf-fetch';

const FINANCEIRO_FRONTEND_URL = '/financeiro-app';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';
const FINANCEIRO_PROBE_TIMEOUT_MS = 1800;
const FINANCEIRO_ERROR_MARKERS = [
  /internal server error/i,
  /application error/i,
  /server error/i,
  /err_connection_refused/i,
  /service unavailable/i,
];

function hasFinanceiroError(value: string) {
  return FINANCEIRO_ERROR_MARKERS.some((marker) => marker.test(value));
}

async function probeFinanceiroHome(url: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FINANCEIRO_PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) return false;
    const html = await response.text();
    return !hasFinanceiroError(html.slice(0, 120_000));
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function probeFinanceiro(url: string) {
  const [frontendReady, backendResponse] = await Promise.all([
    probeFinanceiroHome(url),
    fetch(`${API_BASE_URL}/financeiro/service-readiness`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    }).catch(() => null),
  ]);
  if (!frontendReady || !backendResponse?.ok) return false;
  const status = await backendResponse.json().catch(() => ({ ready: false })) as { ready?: boolean };
  return status.ready === true;
}

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
  const [iframeReloadKey, setIframeReloadKey] = useState(0);
  const [isRecoveryVisible, setIsRecoveryVisible] = useState(false);
  const financeiroFrameRef = useRef<HTMLIFrameElement>(null);
  const iframeLoadTimerRef = useRef<number | null>(null);
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
  const requestFinanceiroRecovery = useCallback(async () => {
    try {
      await fetch(
        `${API_BASE_URL}/financeiro/recover-service`,
        withEscolaCsrf(`${API_BASE_URL}/financeiro/recover-service`, {
          method: 'POST',
        }),
      );
    } catch {
      // A verificação automática permanece ativa mesmo sem o supervisor local.
    }
  }, []);
  const reopenFinanceiro = useCallback(() => {
    setIsRecoveryVisible(false);
    setLoadedFrameSrc(null);
    setIframeReloadKey((current) => current + 1);
  }, []);
  const retryFinanceiro = useCallback(() => {
    void requestFinanceiroRecovery();
    reopenFinanceiro();
  }, [reopenFinanceiro, requestFinanceiroRecovery]);
  const handleFinanceiroFrameLoad = useCallback(() => {
    setLoadedFrameSrc(iframeSrc);
    const bodyText = financeiroFrameRef.current?.contentDocument?.body?.innerText || '';
    setIsRecoveryVisible(hasFinanceiroError(bodyText));
  }, [iframeSrc]);

  useEffect(() => {
    if (!iframeSrc || isRecoveryVisible) return;

    if (iframeLoadTimerRef.current !== null) {
      window.clearTimeout(iframeLoadTimerRef.current);
    }

    iframeLoadTimerRef.current = window.setTimeout(() => {
      if (loadedFrameSrc !== iframeSrc) {
        setIsRecoveryVisible(true);
      }
    }, 5000);

    return () => {
      if (iframeLoadTimerRef.current !== null) {
        window.clearTimeout(iframeLoadTimerRef.current);
        iframeLoadTimerRef.current = null;
      }
    };
  }, [iframeSrc, isRecoveryVisible, loadedFrameSrc]);

  useEffect(() => {
    if (isRecoveryVisible) void requestFinanceiroRecovery();
  }, [isRecoveryVisible, requestFinanceiroRecovery]);

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

      <section className={`relative min-h-0 flex-1 overflow-hidden rounded-3xl border border-slate-200 shadow-sm ${isRecoveryVisible ? 'bg-white' : 'bg-slate-100'}`}>
        {isRecoveryVisible ? (
          <DependencyRecoveryScreen
            dependencyName="Portal Financeiro"
            dependencyUrl={iframeSrc}
            probe={probeFinanceiro}
            maxAttempts={5}
            fallbackTitle="Não foi possível abrir o Financeiro"
            fallbackMessage="A Escola tentou restabelecer a conexão automaticamente, mas o Financeiro continua indisponível. Verifique se o serviço está ligado e tente novamente."
            embedded
            compact
            onAvailable={reopenFinanceiro}
            onCancel={retryFinanceiro}
            cancelLabel="Tentar novamente agora"
          />
        ) : (
          <>
            {isFrameLoading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/80 backdrop-blur-sm">
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm">
                  Carregando financeiro...
                </div>
              </div>
            ) : null}

            <iframe
              ref={financeiroFrameRef}
              key={`${iframeSrc}-${iframeReloadKey}`}
              title="Financeiro - tela central"
              src={iframeSrc}
              onLoad={handleFinanceiroFrameLoad}
              onError={() => setIsRecoveryVisible(true)}
              className="block h-full w-full bg-white"
            />
          </>
        )}
      </section>
    </div>
  );
}
