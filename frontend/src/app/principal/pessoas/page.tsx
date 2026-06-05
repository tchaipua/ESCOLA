'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import PrincipalProgramHeader from '@/app/components/principal-program-header';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import { getDashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import { dispatchScreenAuditContext, formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const PESSOAS_SCREEN_ID = 'PRINCIPAL_PESSOAS';

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  ADMINISTRADOR: { label: 'Administrador', color: 'border-violet-200 bg-violet-50 text-violet-700' },
  PROFESSOR: { label: 'Professor', color: 'border-blue-200 bg-blue-50 text-blue-700' },
  ALUNO: { label: 'Aluno', color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  RESPONSAVEL: { label: 'Responsavel', color: 'border-amber-200 bg-amber-50 text-amber-700' },
};

type PersonRole = keyof typeof ROLE_CONFIG;

type PersonRecord = {
  id: string;
  name: string;
  cpf?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  updatedAt?: string | null;
  sharedLoginEnabled?: boolean;
  guardians?: Array<{
    id: string;
    name: string;
    whatsapp?: string | null;
    phone?: string | null;
    cellphone1?: string | null;
    cellphone2?: string | null;
  }>;
  guardianAssignments?: Array<{
    guardianId: string;
    studentId: string;
    studentName: string;
    kinship: string;
    kinshipDescription?: string | null;
  }>;
  roles: Array<{
    role: PersonRole;
    roleLabel: string;
    active: boolean;
    accessProfile: string | null;
  }>;
};

type PessoasAuditParams = {
  tenantId: string | null;
  tenantName?: string | null;
  searchTerm: string;
  roleFilter: PersonRole | 'ALL';
  displayedRowsCount: number;
};

function buildPessoasAuditSql(params: PessoasAuditParams) {
  const searchTerm = params.searchTerm.trim().toUpperCase();
  const roleFilter = String(params.roleFilter || 'ALL').toUpperCase();

  return `-- PARAMETROS ATUAIS DO GRID
-- :schoolId = ${toSqlLiteral(params.tenantId || '')}
-- :searchTerm = ${toSqlLiteral(searchTerm)}
-- :roleFilter = ${toSqlLiteral(roleFilter)}

SELECT DISTINCT P.*
FROM people P
LEFT JOIN teachers T
  ON T.personId = P.id
 AND T.tenantId = P.tenantId
LEFT JOIN students ST
  ON ST.personId = P.id
 AND ST.tenantId = P.tenantId
LEFT JOIN guardians G
  ON G.personId = P.id
 AND G.tenantId = P.tenantId
WHERE P.tenantId = ${toSqlLiteral(params.tenantId || '')}
  AND (
    ${toSqlLiteral(searchTerm)} = ''
    OR UPPER(COALESCE(P.name, '')) LIKE '%' || UPPER(${toSqlLiteral(searchTerm)}) || '%'
  )
  AND (
    ${toSqlLiteral(roleFilter)} = 'ALL'
    OR (${toSqlLiteral(roleFilter)} = 'PROFESSOR' AND T.id IS NOT NULL)
    OR (${toSqlLiteral(roleFilter)} = 'ALUNO' AND ST.id IS NOT NULL)
    OR (${toSqlLiteral(roleFilter)} = 'RESPONSAVEL' AND G.id IS NOT NULL)
    OR (${toSqlLiteral(roleFilter)} = 'ADMINISTRADOR' AND EXISTS (
      SELECT 1 FROM users U WHERE U.personId = P.id AND U.tenantId = P.tenantId
    ))
  )
ORDER BY P.name ASC;`;
}

function buildPessoasAuditText(params: PessoasAuditParams) {
  const searchTerm = params.searchTerm.trim().toUpperCase();
  const roleFilter = String(params.roleFilter || 'ALL').toUpperCase();

  return `--- LOGICA DA TELA ---
Tela de consulta global de cadastros/pessoas.

TABELAS PRINCIPAIS:
- people (P) - cadastro mestre de pessoas
- teachers (T) - papel professor
- students (ST) - papel aluno
- guardians (G) - papel responsavel
- users (U) - usuarios administrativos

RELACIONAMENTOS:
- people.id = teachers.personId
- people.id = students.personId
- people.id = guardians.personId
- people.id = users.personId

FILTROS APLICADOS AGORA:
- escola/tenant atual (:schoolId): ${formatTenantAuditValue(params.tenantId, params.tenantName)}
- busca digitada (:searchTerm): ${formatAuditValue(searchTerm)}
- papel selecionado (:roleFilter): ${roleFilter}
- registros exibidos apos os filtros: ${params.displayedRowsCount}
- ordenacao atual: nome ASC

OBSERVACAO SOBRE O FILTRO DA EMPRESA / ESCOLA:
- P.tenantId e a coluna usada para isolar os dados da empresa / escola
- :schoolId acima ja esta preenchido com o tenantId real da escola logada
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

export default function PessoasPage() {
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<PersonRole | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  const canView = ['SOFTHOUSE_ADMIN', 'ADMIN', 'SECRETARIA', 'COORDENACAO'].includes(currentRole || '');

  useEffect(() => {
    const auth = getDashboardAuthContext();
    setToken(auth.token);
    setCurrentRole(auth.role);
    setCurrentTenantId(auth.tenantId);
  }, []);

  const reloadPeople = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`${API_BASE_URL}/people`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message || 'Não foi possível carregar os cadastros.');
    }
    setPeople(Array.isArray(data) ? data : []);
  }, [token]);

  useEffect(() => {
    if (!token || !canView) {
      setIsLoading(false);
      return;
    }

    const run = async () => {
      try {
        setIsLoading(true);
        setErrorStatus(null);
        await reloadPeople();
      } catch (error) {
        setErrorStatus(error instanceof Error ? error.message : 'Falha ao carregar pessoas.');
      } finally {
        setIsLoading(false);
      }
    };

    void run();
  }, [token, canView, reloadPeople]);

  const uniquePeople = useMemo(() => {
    const seenIds = new Set<string>();
    return people.filter((person) => {
      if (seenIds.has(person.id)) return false;
      seenIds.add(person.id);
      return true;
    });
  }, [people]);

  const filteredPeople = useMemo(() => {
    const term = searchTerm.trim().toUpperCase();
    return uniquePeople.filter((person) => {
      const matchesName = !term || person.name.toUpperCase().includes(term);
      const matchesRole = selectedRoleFilter === 'ALL'
        ? true
        : person.roles.some((role) => role.role === selectedRoleFilter);
      return matchesName && matchesRole;
    });
  }, [uniquePeople, searchTerm, selectedRoleFilter]);

  const metrics = useMemo(() => {
    const base = uniquePeople;
    return {
      total: base.length,
      administradores: base.filter((person) => person.roles.some((role) => role.role === 'ADMINISTRADOR')).length,
      professores: base.filter((person) => person.roles.some((role) => role.role === 'PROFESSOR')).length,
      alunos: base.filter((person) => person.roles.some((role) => role.role === 'ALUNO')).length,
      responsaveis: base.filter((person) => person.roles.some((role) => role.role === 'RESPONSAVEL')).length,
    };
  }, [uniquePeople]);

  const currentTenantBranding = useMemo(
    () => readCachedTenantBranding(currentTenantId),
    [currentTenantId],
  );
  const pessoasAuditContext = useMemo(() => {
    const auditParams: PessoasAuditParams = {
      tenantId: currentTenantId,
      tenantName: currentTenantBranding?.schoolName,
      searchTerm,
      roleFilter: selectedRoleFilter,
      displayedRowsCount: filteredPeople.length,
    };

    return {
      auditText: buildPessoasAuditText(auditParams),
      sqlText: buildPessoasAuditSql(auditParams),
    };
  }, [currentTenantBranding?.schoolName, currentTenantId, filteredPeople.length, searchTerm, selectedRoleFilter]);

  useEffect(() => {
    dispatchScreenAuditContext({
      screenId: PESSOAS_SCREEN_ID,
      auditText: pessoasAuditContext.auditText,
      sqlText: pessoasAuditContext.sqlText,
    });
  }, [pessoasAuditContext]);

  if (!isLoading && !canView) {
    return (
      <DashboardAccessDenied
        title="Acesso restrito"
        message="Você não possui autorização para visualizar a central de pessoas desta escola."
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-12rem)] w-full pt-0">
      <div className="flex w-full flex-col bg-transparent">
        <PrincipalProgramHeader
          eyebrow="Central de pessoas"
          title="Consulta global de cadastros"
          description="Esta tela é apenas de consulta. Todos os cadastros são editados nas áreas específicas de professor, aluno e responsável."
          schoolName={currentTenantBranding?.schoolName}
          logoUrl={currentTenantBranding?.logoUrl}
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

        <div className="pt-6">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div
          role="button"
          onClick={() => setSelectedRoleFilter('ALL')}
          className={`rounded-[28px] border px-5 py-6 transition ${selectedRoleFilter === 'ALL' ? 'border-blue-500 bg-blue-50/60 shadow' : 'border-slate-200 bg-white'}`}
        >
          <div className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">Total</div>
          <div className="mt-3 text-3xl font-black text-slate-900">{metrics.total}</div>
        </div>
        <div
          role="button"
          onClick={() => setSelectedRoleFilter('ADMINISTRADOR' as PersonRole)}
          className={`rounded-[28px] border px-5 py-6 transition ${selectedRoleFilter === 'ADMINISTRADOR' ? 'border-violet-500 bg-violet-50/80 shadow' : 'border-slate-200 bg-white'}`}
        >
          <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-600">Administradores</div>
          <div className="mt-3 text-3xl font-black text-slate-900">{metrics.administradores}</div>
        </div>
        <div
          role="button"
          onClick={() => setSelectedRoleFilter('PROFESSOR')}
          className={`rounded-[28px] border px-5 py-6 transition ${selectedRoleFilter === 'PROFESSOR' ? 'border-blue-500 bg-blue-50/60 shadow' : 'border-slate-200 bg-white'}`}
        >
          <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Professores</div>
          <div className="mt-3 text-3xl font-black text-slate-900">{metrics.professores}</div>
        </div>
        <div
          role="button"
          onClick={() => setSelectedRoleFilter('ALUNO')}
          className={`rounded-[28px] border px-5 py-6 transition ${selectedRoleFilter === 'ALUNO' ? 'border-emerald-500 bg-emerald-50/80 shadow' : 'border-slate-200 bg-white'}`}
        >
          <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Alunos</div>
          <div className="mt-3 text-3xl font-black text-slate-900">{metrics.alunos}</div>
        </div>
        <div
          role="button"
          onClick={() => setSelectedRoleFilter('RESPONSAVEL')}
          className={`rounded-[28px] border px-5 py-6 transition ${selectedRoleFilter === 'RESPONSAVEL' ? 'border-amber-500 bg-amber-50/80 shadow' : 'border-slate-200 bg-white'}`}
        >
          <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">Responsáveis</div>
          <div className="mt-3 text-3xl font-black text-slate-900">{metrics.responsaveis}</div>
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-800">Cadastros</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Busque por nome ou role para filtrar o conjunto exibido.</p>
          </div>
          <div className="w-full max-w-md">
            <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Filtrar pelo nome</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value.toUpperCase())}
              placeholder="Digite parte do nome"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
            />
          </div>
        </div>
        {errorStatus && (
          <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
            {errorStatus}
          </div>
        )}

        {isLoading ? (
          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-60 animate-pulse rounded-[28px] border border-slate-200 bg-slate-50" />
            ))}
          </div>
        ) : filteredPeople.length === 0 ? (
          <div className="mt-8 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
            <div className="text-xl font-black text-slate-700">Nenhuma pessoa encontrada</div>
            <p className="mt-3 text-sm font-medium text-slate-500">Refine o filtro ou atualize a tela para sincronizar os dados.</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {filteredPeople.map((person) => {
              const isAluno = person.roles.some((role) => role.role === 'ALUNO');
              const isGuardian = person.roles.some((role) => role.role === 'RESPONSAVEL');
              const guardianAssignments = person.guardianAssignments || [];

              return (
                <article key={person.id} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_45%,#eff6ff_100%)] p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="mt-2 text-xl font-black text-slate-800">{person.name}</h3>
                        <div className="mt-2 text-sm font-medium text-slate-500">
                          {person.email || 'Sem login configurado'}
                        </div>
                      </div>
                      <div className={`rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] ${person.sharedLoginEnabled ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-slate-200 bg-slate-100 text-slate-500'}`}>
                        {person.sharedLoginEnabled ? 'Login ativo' : 'Sem login'}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                      <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Origem</div>
                      <div className="flex flex-wrap gap-2">
                        {person.roles.map((role) => (
                          <span
                            key={`${person.id}-${role.role}`}
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.15em] ${ROLE_CONFIG[role.role]?.color || 'border-slate-200 bg-slate-50 text-slate-600'}`}
                          >
                            {role.roleLabel}
                          </span>
                        ))}
                      </div>
                      <div className="space-y-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {person.roles.map((role) => (
                          <div key={`${person.id}-${role.role}-info`} className="flex flex-wrap items-center gap-2">
                            <span className="text-slate-600">{role.role}</span>
                            <span className="text-slate-400">•</span>
                            <span>{role.active ? 'ATIVO' : 'INATIVO'}</span>
                            {role.accessProfile && (
                              <>
                                <span className="text-slate-400">•</span>
                                <span>{role.accessProfile}</span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    {isGuardian && guardianAssignments.length > 0 && (
                      <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-sm text-slate-700">
                        <div className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-600">Alunos vinculados</div>
                        <div className="mt-3 space-y-3 text-sm font-semibold text-slate-700">
                          {guardianAssignments.map((assignment) => (
                            <div key={`${assignment.guardianId}-${assignment.studentId}`} className="flex flex-col gap-1 rounded-xl border border-emerald-200 bg-white/80 p-3">
                              <div className="text-[13px] font-black text-emerald-700">{assignment.studentName}</div>
                              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                {assignment.kinship}
                                {assignment.kinshipDescription ? ` (${assignment.kinshipDescription})` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4 p-5 text-sm text-slate-600">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">CPF</div>
                        <div className="mt-1 font-semibold text-slate-700">{person.cpf || 'Não informado'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Telefone</div>
                        <div className="mt-1 font-semibold text-slate-700">{person.whatsapp || person.phone || 'Não informado'}</div>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Endereço base</div>
                        <div className="mt-1 font-semibold text-slate-700">{[person.street, person.number, person.neighborhood, person.city, person.state].filter(Boolean).join(', ') || 'Não informado'}</div>
                      </div>
                    </div>
                    {isAluno && person.guardians && person.guardians.length > 0 && (
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-slate-600">
                        <div className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400">Responsáveis</div>
                        <div className="mt-3 space-y-3 text-sm font-semibold text-slate-700">
                          {person.guardians.map((guardian) => {
                            const whatsappText = guardian.whatsapp || 'Não informado';
                            const phoneList = [guardian.phone, guardian.cellphone1, guardian.cellphone2].filter(Boolean);
                            const phoneText = phoneList.length ? phoneList.join(' / ') : 'Não informado';

                            return (
                              <div key={guardian.id} className="space-y-1">
                                <div className="text-sm font-bold text-slate-800">{guardian.name}</div>
                                <div className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">
                                  WhatsApp: {whatsappText}
                                  <span className="mx-2 text-slate-300">•</span>
                                  Telefone: {phoneText}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      </div>
      </div>
    </div>
  );
}
