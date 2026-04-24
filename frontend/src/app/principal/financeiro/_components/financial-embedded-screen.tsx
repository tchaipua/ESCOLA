'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import { getStoredToken } from '@/app/lib/auth-storage';
import {
  decodeDashboardToken,
  hasAnyDashboardPermission,
  type DashboardAuthContext,
} from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const FINANCEIRO_FRONTEND_URL =
  process.env.NEXT_PUBLIC_FINANCEIRO_FRONTEND_URL || 'http://localhost:3003';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const subscribeAuthToken = () => () => {};
const getServerAuthToken = () => null;
const getClientAuthToken = () => getStoredToken();

function buildFinanceFrameUrl(
  path: string,
  authContext: DashboardAuthContext,
  companyName?: string | null,
) {
  const normalizedBaseUrl = FINANCEIRO_FRONTEND_URL.endsWith('/')
    ? FINANCEIRO_FRONTEND_URL.slice(0, -1)
    : FINANCEIRO_FRONTEND_URL;

  const params = new URLSearchParams({
    embedded: '1',
    sourceSystem: 'ESCOLA',
  });

  if (authContext.tenantId) {
    params.set('sourceTenantId', authContext.tenantId.toUpperCase());
  }

  if (companyName) {
    params.set('companyName', companyName.trim().toUpperCase());
  }

  const requiresCashierContext = path.startsWith('/caixa');

  if (requiresCashierContext && authContext.userId) {
    params.set('cashierUserId', authContext.userId.toUpperCase());
  }

  if (requiresCashierContext && authContext.name) {
    params.set('cashierDisplayName', authContext.name.toUpperCase());
  }

  return `${normalizedBaseUrl}${path}?${params.toString()}`;
}

function buildAuthContextFromToken(token: string | null): DashboardAuthContext | null {
  if (!token) return null;

  const payload = decodeDashboardToken(token);

  return {
    token,
    userId: typeof payload?.userId === 'string' ? payload.userId : null,
    role: typeof payload?.role === 'string' ? payload.role : null,
    permissions: Array.isArray(payload?.permissions)
      ? payload.permissions.filter((permission): permission is string => typeof permission === 'string')
      : [],
    tenantId: typeof payload?.tenantId === 'string' ? payload.tenantId : null,
    name: typeof payload?.name === 'string' ? payload.name : null,
    modelType: typeof payload?.modelType === 'string' ? payload.modelType : null,
  };
}

type FinancialEmbeddedScreenProps = {
  iframePath: string;
  title: string;
};

export default function FinancialEmbeddedScreen({
  iframePath,
  title,
}: FinancialEmbeddedScreenProps) {
  const authToken = useSyncExternalStore(
    subscribeAuthToken,
    getClientAuthToken,
    getServerAuthToken,
  );
  const authContext = useMemo(() => buildAuthContextFromToken(authToken), [authToken]);
  const [isFrameLoading, setIsFrameLoading] = useState(true);

  const canViewFinancial = authContext
    ? hasAnyDashboardPermission(
        authContext.role,
        authContext.permissions,
        ['VIEW_FINANCIAL', 'MANAGE_MONTHLY_FEES', 'VIEW_CASHIER', 'SETTLE_RECEIVABLES'],
      )
    : false;
  const tenantBranding = useMemo(
    () => (authContext ? readCachedTenantBranding(authContext.tenantId) : null),
    [authContext],
  );

  const iframeSrc = useMemo(
    () =>
      authContext
        ? buildFinanceFrameUrl(
            iframePath,
            authContext,
            tenantBranding?.schoolName || 'ESCOLA',
          )
        : '',
    [authContext, iframePath, tenantBranding?.schoolName],
  );

  useEffect(() => {
    setIsFrameLoading(true);
  }, [iframeSrc]);

  if (!authContext) {
    return (
      <section className={`${cardClass} p-6`}>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-600">
          Carregando o contexto da escola e do usuário...
        </div>
      </section>
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
    <section className={`${cardClass} overflow-hidden`}>
      <div className="relative h-[calc(100vh-9rem)] min-h-[980px] bg-slate-50">
        {isFrameLoading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/80 backdrop-blur-sm">
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm">
              Carregando {title.toUpperCase()}...
            </div>
          </div>
        ) : null}

        <iframe
          key={iframeSrc}
          title={title}
          src={iframeSrc}
          onLoad={() => setIsFrameLoading(false)}
          className="block h-full w-full border-0 bg-white"
        />
      </div>
    </section>
  );
}
