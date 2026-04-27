'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getDashboardAuthContext, hasAnyDashboardPermission } from '@/app/lib/dashboard-crud-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const SCREEN_ID = 'PRINCIPAL_CAIXA_GRID_CONSULTA';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

type CashMovement = {
  id: string;
  movementType: string;
  direction: string;
  paymentMethod?: string | null;
  amount: number;
  description: string;
  occurredAt: string;
};

type CashSession = {
  id: string;
  cashierUserId: string;
  cashierDisplayName: string;
  status: string;
  openingAmount: number;
  totalReceivedAmount: number;
  expectedClosingAmount: number;
  declaredClosingAmount?: number | null;
  openedAt: string;
  closedAt?: string | null;
  notes?: string | null;
  movementCount?: number;
  settlementCount?: number;
  movements?: CashMovement[];
};

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(typeof value === 'number' ? value : 0);
}

function formatDateTime(value?: string | null) {
  if (!value) return '---';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
}

function getStatusLabel(status?: string | null) {
  if (!status) return 'SEM STATUS';
  if (status === 'OPEN') return 'ABERTO';
  if (status === 'CLOSED') return 'FECHADO';
  return status.toUpperCase();
}

function getStatusClasses(status?: string | null) {
  if (status === 'OPEN') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'CLOSED') return 'border-slate-200 bg-slate-100 text-slate-700';
  return 'border-blue-200 bg-blue-50 text-blue-700';
}

export default function PrincipalCaixaPage() {
  const authContext = getDashboardAuthContext();
  const canViewCashier = hasAnyDashboardPermission(authContext.role, authContext.permissions, ['VIEW_CASHIER', 'CLOSE_CASHIER', 'SETTLE_RECEIVABLES']);
  const isAdmin = authContext.role === 'ADMIN' || authContext.role === 'SOFTHOUSE_ADMIN';
  const tenantBranding = readCachedTenantBranding(authContext.tenantId);

  const [session, setSession] = useState<CashSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!authContext.token || !canViewCashier) {
      setIsLoading(false);
      return;
    }

    const run = async () => {
      try {
        setIsLoading(true);
        setErrorStatus(null);

        const response = await fetch(`${API_BASE_URL}/financial-cashier/current-session`, {
          headers: {
            Authorization: `Bearer ${authContext.token}`,
          },
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.message || 'Não foi possível carregar o caixa.');
        }

        setSession(payload || null);
      } catch (error) {
        setSession(null);
        setErrorStatus(error instanceof Error ? error.message : 'Falha ao carregar o caixa.');
      } finally {
        setIsLoading(false);
      }
    };

    void run();
  }, [authContext.token, canViewCashier]);

  const movementRows = useMemo(() => session?.movements || [], [session]);
  const totalMovements = movementRows.length;
  const totalReceived = session?.totalReceivedAmount || 0;
  const expectedClosing = session?.expectedClosingAmount || 0;
  const openingAmount = session?.openingAmount || 0;
  const movementCount = session?.movementCount ?? totalMovements;
  const settlementCount = session?.settlementCount ?? 0;

  if (!isLoading && !canViewCashier) {
    return (
      <DashboardAccessDenied
        title="Acesso restrito"
        message="Seu perfil não possui permissão para visualizar a tela de caixa."
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
                  Caixa integrado
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight">Consulta de Caixa</h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                  {isAdmin
                    ? 'Administradores visualizam a visão consolidada dos caixas da escola; usuários com perfil caixa visualizam apenas o próprio caixa.'
                    : 'Você visualiza somente o seu caixa logado, com abertura, fechamento e movimentações vinculadas ao seu usuário.'}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-blue-50">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">Escola atual</div>
                <div className="mt-1 text-base font-black">{tenantBranding?.schoolName || 'ESCOLA LOGADA'}</div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-blue-50">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">Operador</div>
                <div className="mt-1 text-base font-black">{authContext.name || 'USUÁRIO DO SISTEMA'}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
          <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" />
        </div>
      </section>

      {errorStatus ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm font-semibold text-rose-700">
          {errorStatus}
        </section>
      ) : null}

      <section className={`${cardClass} p-6`}>
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Status</div>
            <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${getStatusClasses(session?.status)}`}>
              {isLoading ? 'CARREGANDO' : getStatusLabel(session?.status)}
            </div>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Abertura</div>
            <div className="mt-3 text-3xl font-black text-slate-900">{formatCurrency(openingAmount)}</div>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Recebido</div>
            <div className="mt-3 text-3xl font-black text-slate-900">{formatCurrency(totalReceived)}</div>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Saldo esperado</div>
            <div className="mt-3 text-3xl font-black text-slate-900">{formatCurrency(expectedClosing)}</div>
          </div>
        </div>
      </section>

      <section className={`${cardClass} p-6`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Grid de caixas</div>
            <h2 className="mt-1 text-xl font-black text-slate-900">{isAdmin ? 'Caixas da escola' : 'Meu caixa'}</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">
              {isAdmin
                ? 'A tela já está preparada para a visão consolidada por usuário. Hoje ela exibe o caixa carregado para o operador logado.'
                : 'A visualização segue o caixa do usuário logado, com as informações operacionais principais.'}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
            Movimentos: <span className="font-black text-slate-900">{movementCount}</span> · Baixas: <span className="font-black text-slate-900">{settlementCount}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Caixa atual</div>
            <div className="mt-3 text-lg font-black text-slate-900">
              {session?.cashierDisplayName || authContext.name || 'CAIXA NÃO ABERTO'}
            </div>
            <p className="mt-2 text-sm font-medium text-slate-500">
              {session
                ? `Aberto em ${formatDateTime(session.openedAt)}`
                : 'Nenhum caixa ativo foi localizado para este usuário.'}
            </p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Dados operacionais</div>
            <div className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
              <div className="flex items-center justify-between">
                <span>Usuário</span>
                <span className="text-slate-900">{session?.cashierUserId || authContext.userId || '---'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Fechamento declarado</span>
                <span className="text-slate-900">{formatCurrency(session?.declaredClosingAmount || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Movimentos</span>
                <span className="text-slate-900">{movementCount}</span>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Observação</div>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-500">
              O grid foi montado no padrão de consulta. A expansão para listar todos os caixas dos usuários com perfil caixa já fica apoiada por este layout.
            </p>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-[28px] border border-slate-200">
          <div className="grid grid-cols-1 gap-px bg-slate-200 md:grid-cols-2 xl:grid-cols-4">
            {(movementRows.length > 0
              ? movementRows
              : [
                  {
                    id: 'empty',
                    movementType: 'SEM_MOVIMENTACAO',
                    direction: 'IN',
                    paymentMethod: null,
                    amount: 0,
                    description: 'Nenhuma movimentação foi encontrada para o caixa atual.',
                    occurredAt: session?.openedAt || new Date().toISOString(),
                  },
                ]
            ).map((movement, index) => (
              <div key={`${movement.id}-${index}`} className="bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">
                      {movement.movementType}
                    </div>
                    <div className="mt-2 text-lg font-black text-slate-900">
                      {formatCurrency(movement.amount)}
                    </div>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${movement.direction === 'OUT' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                    {movement.direction === 'OUT' ? 'SAÍDA' : 'ENTRADA'}
                  </div>
                </div>
                <p className="mt-4 text-sm font-medium leading-6 text-slate-500">{movement.description}</p>
                <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {formatDateTime(movement.occurredAt)}
                </div>
                {movement.paymentMethod ? (
                  <div className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                    {movement.paymentMethod}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
