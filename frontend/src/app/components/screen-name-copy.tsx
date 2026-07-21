'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { copyTextToClipboard } from '@/app/lib/clipboard';
import { buildFinanceiroScreenAuditMetadata } from '@/app/lib/financeiro-screen-audit-metadata';
import ScreenAuditModal from './screen-audit-modal';

const COPY_FEEDBACK_TIMEOUT = 1800;
const FINANCEIRO_CAIXA_DETALHE_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CAIXA_DETALHE';

type CopyStatus = 'idle' | 'copied' | 'error';

type ScreenNameCopyProps = {
  screenId: string;
  label?: string;
  className?: string;
  disableMargin?: boolean;
  originText?: string;
  auditText?: string;
  sqlText?: string;
};

type ScreenAuditMetadata = {
  systemName: string;
  originText?: string;
  auditText?: string;
  sqlText?: string;
};

type ScreenOriginRule = {
  screenId: string;
  match: 'exact' | 'prefix';
  systemName?: string;
  physicalPath: string;
};

const ESCOLA_APP_ROOT = 'C:\\Sistemas\\IA\\Escola\\frontend\\src\\app';
const FINANCEIRO_APP_ROOT = 'C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app';

function escolaAppPath(...segments: string[]) {
  return [ESCOLA_APP_ROOT, ...segments].join('\\');
}

function financeiroAppPath(...segments: string[]) {
  return [FINANCEIRO_APP_ROOT, ...segments].join('\\');
}

function buildOriginText(systemName: string, physicalPath: string) {
  return `Origem: ${systemName} - caminho físico: ${physicalPath}`;
}

const SCREEN_ORIGIN_RULES: ScreenOriginRule[] = [
  { screenId: 'PRINCIPAL_ROOT', match: 'exact', physicalPath: escolaAppPath('principal', 'page.tsx') },
  { screenId: 'PRINCIPAL', match: 'exact', physicalPath: escolaAppPath('principal', 'page.tsx') },
  { screenId: 'PRINCIPAL_MENU_ALTERAR_SENHA_EMAIL_GERAL', match: 'exact', physicalPath: escolaAppPath('principal', 'layout.tsx') },
  { screenId: 'PRINCIPAL_RESPONSAVEL_PWA', match: 'exact', physicalPath: escolaAppPath('responsavel', 'page.tsx') },

  { screenId: 'MSINFOR_ADMIN_CONFIGURACOES_GERAIS_MODAL', match: 'exact', physicalPath: escolaAppPath('msinfor-admin', 'components', 'global-settings-modal.tsx') },
  { screenId: 'MSINFOR_ADMIN_FILIAIS_ESCOLA', match: 'exact', physicalPath: escolaAppPath('msinfor-admin', 'components', 'tenant-branch-manager.tsx') },
  { screenId: 'MSINFOR_ADMIN_EDITAR_FILIAL_ESCOLA', match: 'exact', physicalPath: escolaAppPath('msinfor-admin', 'components', 'tenant-branch-manager.tsx') },
  { screenId: 'ACESSOS_ESPECIAIS_GESTAO_ESCOLA', match: 'prefix', physicalPath: escolaAppPath('msinfor-admin', 'components', 'tenant-access-manager.tsx') },
  { screenId: 'MSINFOR_ADMIN', match: 'prefix', physicalPath: escolaAppPath('msinfor-admin', 'page.tsx') },

  { screenId: 'PRINCIPAL_FINANCEIRO_CAIXA_DETALHE', match: 'exact', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('caixa', '[sessionId]', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_CAIXA', match: 'exact', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('caixa', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS_MANUAL', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('contas-a-pagar', 'importacao-notas', 'manual', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('contas-a-pagar', 'importacao-notas', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_NOTAS_IMPORTADAS', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('contas-a-pagar', 'notas-importadas', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_APROVACAO_NOTA', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('contas-a-pagar', 'notas-importadas', '[importId]', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_CERTIFICADOS_DIGITAIS', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('contas-a-pagar', 'certificados-digitais', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('contas-a-pagar', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_HISTORICO_BAIXAS', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('recebiveis', 'historico-baixas', 'page.tsx') },
  { screenId: 'POPUP_FINANCEIRO_RECEBIVEIS_HISTORICO_BAIXAS', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('recebiveis', 'historico-baixas', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_HISTORICO_CLIENTE', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('recebiveis', 'historico-cliente', 'page.tsx') },
  { screenId: 'POPUP_FINANCEIRO_RECEBIVEIS_HISTORICO_CLIENTE', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('recebiveis', 'historico-cliente', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_CONTAS_A_RECEBER', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('contas-a-receber', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_EMISSAO_NFE', match: 'exact', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('emissao-nfe', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_EMISSAO_NFS', match: 'exact', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('emissao-nfs', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_MSINFOR_PARAMETROS_FISCAIS_NFSE_NACIONAL', match: 'exact', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('msinfor', 'parametros-fiscais', 'nfse', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_CREDITOS', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('recebiveis', 'creditos', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_BANCOS_DDAS_ABERTOS', match: 'exact', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('bancos', 'ddas-abertos', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_BANCOS_EXTRATO', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('bancos', 'extrato', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_BANCOS_MOVIMENTOS_ABERTOS', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('bancos', 'movimentos-abertos', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_BANCOS', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('bancos', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_EMPRESA', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('empresas', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_RESUMO', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('resumo', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_ESTOQUE_IMAGENS_PRODUTOS', match: 'exact', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('estoque', 'imagens-produtos', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_ESTOQUE_HISTORICO_MOVIMENTACAO', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('estoque', 'historico-movimentacao', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_ESTOQUE', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('estoque', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_LOTES_PARCELAS', match: 'exact', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('recebiveis', 'lotes', '[batchId]', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_LOTES', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('recebiveis', 'lotes', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_RETORNOS_CONFERENCIA', match: 'exact', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('recebiveis', 'retornos', '[importId]', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_RETORNOS', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('recebiveis', 'retornos', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_PARCELAS', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('recebiveis', 'parcelas', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO_BANCOS_E_BOLETOS', match: 'exact', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('bancos-e-boletos', 'page.tsx') },
  { screenId: 'PRINCIPAL_FINANCEIRO', match: 'exact', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('page.tsx') },

  { screenId: 'POPUP_PRINCIPAL_MENSALIDADES', match: 'prefix', physicalPath: escolaAppPath('principal', 'mensalidades', 'page.tsx') },
  { screenId: 'POPUP_PRINCIPAL_PARCELAS', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('recebiveis', 'parcelas', 'page.tsx') },
  { screenId: 'PRINCIPAL_MENSALIDADES_DETALHES', match: 'prefix', physicalPath: escolaAppPath('principal', 'mensalidades', 'detalhes', '[batchId]', 'page.tsx') },
  { screenId: 'PRINCIPAL_DASHBOARD_RESUMO_POR_PERIODO_', match: 'prefix', physicalPath: escolaAppPath('principal', 'dashboard', 'resumo-por-periodo', '[shift]', 'page.tsx') },
  { screenId: 'PRINCIPAL_DASHBOARD_RESUMO_POR_SERIE_', match: 'prefix', physicalPath: escolaAppPath('principal', 'dashboard', 'resumo-por-serie', '[seriesId]', 'page.tsx') },
  { screenId: 'PRINCIPAL_DASHBOARD_RESUMO_POR_TURMA_', match: 'prefix', physicalPath: escolaAppPath('principal', 'dashboard', 'resumo-por-turma', '[seriesClassId]', 'page.tsx') },
  { screenId: 'PRINCIPAL_DASHBOARD_RESUMO_PROFESSOR_AULAS', match: 'prefix', physicalPath: escolaAppPath('principal', 'dashboard', 'resumo-professor-aulas', 'page.tsx') },
  { screenId: 'PRINCIPAL_DASHBOARD_RESUMO_POR_PERIODO', match: 'prefix', physicalPath: escolaAppPath('principal', 'dashboard', 'resumo-por-periodo', 'page.tsx') },
  { screenId: 'PRINCIPAL_DASHBOARD_RESUMO_POR_SERIE', match: 'prefix', physicalPath: escolaAppPath('principal', 'dashboard', 'resumo-por-serie', 'page.tsx') },
  { screenId: 'PRINCIPAL_DASHBOARD_RESUMO_POR_TURMA', match: 'prefix', physicalPath: escolaAppPath('principal', 'dashboard', 'resumo-por-turma', 'page.tsx') },
  { screenId: 'PRINCIPAL_DASHBOARD_RESUMO', match: 'prefix', physicalPath: escolaAppPath('principal', 'dashboard', 'resumo', 'page.tsx') },

  { screenId: 'PRINCIPAL_CALENDARIO_AULAS', match: 'prefix', physicalPath: escolaAppPath('principal', 'calendario-aulas', 'page.tsx') },
  { screenId: 'PRINCIPAL_GRADE_ANUAL', match: 'prefix', physicalPath: escolaAppPath('principal', 'grade-anual', 'page.tsx') },
  { screenId: 'PRINCIPAL_HISTORICO_NOTAS', match: 'prefix', physicalPath: escolaAppPath('principal', 'historico-notas', 'page.tsx') },
  { screenId: 'PRINCIPAL_LANCAR_NOTAS', match: 'prefix', physicalPath: escolaAppPath('principal', 'lancar-notas', 'page.tsx') },
  { screenId: 'PRINCIPAL_COMUNICACOES', match: 'prefix', physicalPath: escolaAppPath('principal', 'comunicacoes', 'page.tsx') },
  { screenId: 'PRINCIPAL_NOTIFICACOES', match: 'prefix', physicalPath: escolaAppPath('principal', 'notificacoes', 'page.tsx') },
  { screenId: 'PRINCIPAL_MENSALIDADES', match: 'prefix', physicalPath: escolaAppPath('principal', 'mensalidades', 'page.tsx') },
  { screenId: 'PRINCIPAL_RESPONSAVEIS', match: 'prefix', physicalPath: escolaAppPath('principal', 'responsaveis', 'page.tsx') },
  { screenId: 'PRINCIPAL_PROFESSORES', match: 'prefix', physicalPath: escolaAppPath('principal', 'professores', 'page.tsx') },
  { screenId: 'PRINCIPAL_DISCIPLINAS', match: 'prefix', physicalPath: escolaAppPath('principal', 'disciplinas', 'page.tsx') },
  { screenId: 'PRINCIPAL_CONFIGURA_ANO_LETIVO', match: 'prefix', physicalPath: escolaAppPath('principal', 'configura-ano-letivo', 'page.tsx') },
  { screenId: 'PRINCIPAL_DASHBOARD', match: 'prefix', physicalPath: escolaAppPath('principal', 'dashboard', 'page.tsx') },
  { screenId: 'PRINCIPAL_PARCELAS', match: 'prefix', systemName: 'Sistema Financeiro', physicalPath: financeiroAppPath('recebiveis', 'parcelas', 'page.tsx') },
  { screenId: 'PRINCIPAL_PESSOAS', match: 'prefix', physicalPath: escolaAppPath('principal', 'pessoas', 'page.tsx') },
  { screenId: 'PRINCIPAL_TURMAS', match: 'prefix', physicalPath: escolaAppPath('principal', 'turmas', 'page.tsx') },
  { screenId: 'PRINCIPAL_SERIES', match: 'prefix', physicalPath: escolaAppPath('principal', 'series', 'page.tsx') },
  { screenId: 'PRINCIPAL_ALUNOS', match: 'prefix', physicalPath: escolaAppPath('principal', 'alunos', 'page.tsx') },
  { screenId: 'PRINCIPAL_GRADE', match: 'prefix', physicalPath: escolaAppPath('principal', 'grade', 'page.tsx') },
  { screenId: 'PRINCIPAL_CAIXA', match: 'prefix', physicalPath: escolaAppPath('principal', 'caixa', 'page.tsx') },
];

function inferScreenAuditMetadata(screenId: string): ScreenAuditMetadata | null {
  const normalizedScreenId = String(screenId || '').trim().toUpperCase();
  if (!normalizedScreenId) return null;

  const exactRule = SCREEN_ORIGIN_RULES.find((rule) => rule.match === 'exact' && rule.screenId === normalizedScreenId);
  const prefixRule = SCREEN_ORIGIN_RULES
    .filter((rule) => rule.match === 'prefix' && normalizedScreenId.startsWith(rule.screenId))
    .sort((first, second) => second.screenId.length - first.screenId.length)[0];
  const matchedRule = exactRule || prefixRule;
  if (!matchedRule) return null;

  const systemName = matchedRule.systemName || 'Sistema Escola';
  return {
    systemName,
    originText: buildOriginText(systemName, matchedRule.physicalPath),
  };
}

const SCREEN_AUDIT_METADATA: Record<string, ScreenAuditMetadata> = {
  MSINFOR_ADMIN_UNIDADES_ATIVAS: {
    systemName: 'Sistema Escola',
    originText:
      'Origem: Sistema Escola - caminho físico: C:\\Sistemas\\IA\\Escola\\frontend\\src\\app\\msinfor-admin\\page.tsx',
    auditText: `--- LOGICA DA TELA ---
Tela master do MSINFOR ADMIN para listar as escolas/empresas ativas cadastradas no motor central.

TABELAS PRINCIPAIS:
- tenants (T) - cadastro principal das escolas/empresas
- users (U) - usuarios administrativos vinculados a cada escola
- tenant_branches (TB) - filiais operacionais da escola, usada aqui para dados da filial principal

RELACIONAMENTOS:
- users.tenantId = tenants.id
- tenant_branches.tenantId = tenants.id

METRICAS / CAMPOS EXIBIDOS:
- nome da escola/empresa
- id da escola/empresa
- admin titular master: primeiro usuario ADMIN retornado para a escola
- e-mail do admin titular master
- data de registro da escola
- logotipo/documento da filial principal quando disponivel

FILTROS APLICADOS AGORA:
- somente escolas sem cancelamento logico: tenants.canceledAt IS NULL
- filial principal: tenant_branches.branchCode = 1
- filial sem cancelamento logico: tenant_branches.canceledAt IS NULL
- usuarios administrativos: users.role = 'ADMIN'

ORDENACAO:
- backend retorna por tenants.createdAt DESC
- a grid pode reordenar no frontend conforme o cabecalho clicado pelo usuario

ENDPOINTS / BASE LOGICA:
- GET /tenants
- Protegido por x-msinfor-master-pass
- Backend: tenantsService.findAll()

OBSERVACAO:
- O backend remove smtpPassword antes de devolver a resposta para a tela.
- A tela tambem abre acoes relacionadas a acessos, filiais, edicao e exclusao definitiva, mas a listagem principal vem das tabelas abaixo.`,
    sqlText: `SELECT
  T.id,
  T.name,
  T.createdAt,
  U.name AS adminName,
  U.email AS adminEmail,
  TB.logoUrl,
  TB.document,
  TB.branchCode,
  TB.name AS defaultBranchName
FROM tenants T
LEFT JOIN tenant_branches TB
  ON TB.tenantId = T.id
 AND TB.branchCode = 1
 AND TB.canceledAt IS NULL
LEFT JOIN users U
  ON U.tenantId = T.id
 AND U.role = 'ADMIN'
WHERE T.canceledAt IS NULL
ORDER BY T.createdAt DESC;`,
  },
  MSINFOR_ADMIN_EXCLUSAO_DEFINITIVA_ESCOLA: {
    systemName: 'Sistema Escola',
    originText:
      'Origem: Sistema Escola - caminho físico: C:\\Sistemas\\IA\\Escola\\frontend\\src\\app\\msinfor-admin\\page.tsx',
    auditText: `--- LOGICA DA TELA ---
Modal master de exclusao definitiva de uma escola, protegido por chave admin, ID exato da escola e frase de confirmacao.

TABELAS PRINCIPAIS:
- tenants (T) - escola/empresa selecionada para exclusao definitiva
- tenant_branches (TB) - filiais da escola
- users (U) - usuarios/acessos da escola
- user_branch_accesses (UBA) - vinculos de acesso por filial
- people (P) - cadastro-base compartilhado da escola

RELACIONAMENTOS:
- tenant_branches.tenantId = tenants.id
- users.tenantId = tenants.id
- user_branch_accesses.tenantId = tenants.id
- people.tenantId = tenants.id

FILTROS APLICADOS AGORA:
- escola selecionada (:tenantId): informada pelo registro aberto no modal
- senha master obrigatoria: x-msinfor-master-pass
- confirmacao digitada: ID exato da escola
- frase obrigatoria: EXCLUIR DEFINITIVAMENTE

OBSERVACAO SOBRE O ESCOPO MASTER:
- Este modal e uma operacao excepcional de administracao master.
- Antes de executar a mutacao, a auditoria SQL exibe uma consulta de conferencia dos registros vinculados ao tenant.`,
    sqlText: `SELECT
  T.id,
  T.name,
  COUNT(DISTINCT TB.id) AS branchCount,
  COUNT(DISTINCT U.id) AS userCount,
  COUNT(DISTINCT UBA.id) AS branchAccessCount,
  COUNT(DISTINCT P.id) AS peopleCount
FROM tenants T
LEFT JOIN tenant_branches TB
  ON TB.tenantId = T.id
LEFT JOIN users U
  ON U.tenantId = T.id
LEFT JOIN user_branch_accesses UBA
  ON UBA.tenantId = T.id
LEFT JOIN people P
  ON P.tenantId = T.id
WHERE T.id = :tenantId
GROUP BY T.id, T.name;`,
  },
  PRINCIPAL_PROFESSORES: {
    systemName: 'Sistema Escola',
    originText:
      'Origem: Sistema Escola - caminho físico: C:\\Sistemas\\IA\\Escola\\frontend\\src\\app\\principal\\professores\\page.tsx',
    auditText: `--- LOGICA DA TELA ---
Tela de grid/listagem administrativa para manutenção do papel de professor.

TABELAS PRINCIPAIS:
- teachers (T) - cadastro operacional de professores
- subjects (S) - cadastro de disciplinas da escola
- teacher_subjects (TS) - vinculo entre professor e disciplina

RELACIONAMENTOS:
- teachers.id = teacher_subjects.teacherId
- subjects.id = teacher_subjects.subjectId

SQL EQUIVALENTE DOS FILTROS DA TELA:
SELECT DISTINCT T.*
FROM teachers T
LEFT JOIN teacher_subjects TS
  ON TS.teacherId = T.id
 AND TS.tenantId = T.tenantId
 AND TS.canceledAt IS NULL
LEFT JOIN subjects S
  ON S.id = TS.subjectId
 AND S.tenantId = TS.tenantId
 AND S.canceledAt IS NULL
WHERE T.tenantId = :schoolId
  AND (
    :searchTerm = ''
    OR UPPER(COALESCE(T.name, '')) LIKE '%' || UPPER(:searchTerm) || '%'
    OR UPPER(COALESCE(T.email, '')) LIKE '%' || UPPER(:searchTerm) || '%'
    OR UPPER(COALESCE(T.cpf, '')) LIKE '%' || UPPER(:searchTerm) || '%'
    OR UPPER(COALESCE(T.phone, '')) LIKE '%' || UPPER(:searchTerm) || '%'
    OR UPPER(COALESCE(T.whatsapp, '')) LIKE '%' || UPPER(:searchTerm) || '%'
  )
  AND (
    :statusFilter = 'ALL'
    OR (:statusFilter = 'ACTIVE' AND T.canceledAt IS NULL)
    OR (:statusFilter = 'INACTIVE' AND T.canceledAt IS NOT NULL)
  )
  AND (
    :subjectId = 'ALL'
    OR S.id = :subjectId
  )
ORDER BY T.canceledAt ASC, T.name ASC;

OBSERVACAO SOBRE O FILTRO DA EMPRESA / ESCOLA:
- T.tenantId e a coluna usada para isolar os dados da empresa / escola
- :schoolId e o valor da empresa / escola logada no momento
- na execucao real, :schoolId vem do contexto autenticado da sessao`,
    sqlText: `SELECT DISTINCT T.*
FROM teachers T
LEFT JOIN teacher_subjects TS
  ON TS.teacherId = T.id
 AND TS.tenantId = T.tenantId
 AND TS.canceledAt IS NULL
LEFT JOIN subjects S
  ON S.id = TS.subjectId
 AND S.tenantId = TS.tenantId
 AND S.canceledAt IS NULL
WHERE T.tenantId = :schoolId
  AND (
    :searchTerm = ''
    OR UPPER(COALESCE(T.name, '')) LIKE '%' || UPPER(:searchTerm) || '%'
    OR UPPER(COALESCE(T.email, '')) LIKE '%' || UPPER(:searchTerm) || '%'
    OR UPPER(COALESCE(T.cpf, '')) LIKE '%' || UPPER(:searchTerm) || '%'
    OR UPPER(COALESCE(T.phone, '')) LIKE '%' || UPPER(:searchTerm) || '%'
    OR UPPER(COALESCE(T.whatsapp, '')) LIKE '%' || UPPER(:searchTerm) || '%'
  )
  AND (
    :statusFilter = 'ALL'
    OR (:statusFilter = 'ACTIVE' AND T.canceledAt IS NULL)
    OR (:statusFilter = 'INACTIVE' AND T.canceledAt IS NOT NULL)
  )
  AND (
    :subjectId = 'ALL'
    OR S.id = :subjectId
  )
ORDER BY T.canceledAt ASC, T.name ASC;`,
  },
  PRINCIPAL_PROFESSORES_STATUS_MODAL: {
    systemName: 'Sistema Escola',
    originText:
      'Origem: Sistema Escola - caminho físico: C:\\Sistemas\\IA\\Escola\\frontend\\src\\app\\principal\\professores\\page.tsx',
    auditText: `--- LOGICA DA TELA ---
Modal de confirmacao de status do professor.

TABELAS PRINCIPAIS:
- teachers (T) - cadastro operacional de professores

RELACIONAMENTOS:
- Nao aplicavel neste modal.

METRICAS / CAMPOS EXIBIDOS:
- nome do professor
- status atual
- acao de ativacao/inativacao

FILTROS APLICADOS AGORA:
- professor selecionado na grid

ORDENACAO:
- Nao aplicavel.

ENDPOINTS / BASE LOGICA:
- PATCH /teachers/{id}/status

OBSERVACAO:
- o modal apenas confirma a alteracao; a persistencia acontece pela rota de status no backend.`,
  },
  PRINCIPAL_PROFESSORES_DETAIL_DOCENTE_EXCLUSIVO: {
    systemName: 'Sistema Escola',
    originText:
      'Origem: Sistema Escola - caminho físico: C:\\Sistemas\\IA\\Escola\\frontend\\src\\app\\principal\\professores\\page.tsx',
    auditText: `--- LOGICA DA TELA ---
Modal principal de cadastro/edicao de docente.

TABELAS PRINCIPAIS:
- teachers (T) - cadastro operacional de professores
- teacher_subjects (TS) - vinculo entre professor e disciplina
- subjects (S) - cadastro de disciplinas da escola

RELACIONAMENTOS:
- teachers.id = teacher_subjects.teacherId
- subjects.id = teacher_subjects.subjectId

METRICAS / CAMPOS EXIBIDOS:
- dados cadastrais do professor
- contato e endereco
- acesso PWA
- disciplinas vinculadas
- valores por aula e vigencia por disciplina

FILTROS APLICADOS AGORA:
- edicao do professor selecionado
- validacoes de CPF, e-mail e disciplina

ORDENACAO:
- Nao aplicavel.

ENDPOINTS / BASE LOGICA:
- POST /teachers
- PATCH /teachers/{id}
- POST /teachers/{id}/subjects
- PATCH /teachers/{id}/subjects/{subjectId}
- DELETE /teachers/{id}/subjects/{subjectId}

OBSERVACAO:
- a tela usa validacoes de frontend e envia a persistencia final para as rotas de professores e vinculos disciplinares.`,
  },
  PRINCIPAL_PROFESSORES_POPUP_CPF_CONFLICT: {
    systemName: 'Sistema Escola',
    originText:
      'Origem: Sistema Escola - caminho físico: C:\\Sistemas\\IA\\Escola\\frontend\\src\\app\\principal\\professores\\page.tsx',
    auditText: `--- LOGICA DA TELA ---
Popup de alerta para conflito de CPF no cadastro do docente.

TABELAS PRINCIPAIS:
- people / cadastro-base compartilhado (via servico de busca compartilhada)

RELACIONAMENTOS:
- validacao cruzada por CPF entre papeis da mesma pessoa

METRICAS / CAMPOS EXIBIDOS:
- nome encontrado
- papeis ja vinculados ao CPF
- CPF informado

FILTROS APLICADOS AGORA:
- CPF digitado no formulario do professor

ORDENACAO:
- Nao aplicavel.

ENDPOINTS / BASE LOGICA:
- validacao compartilhada de CPF antes do POST/PATCH de /teachers

OBSERVACAO:
- o popup e apenas preventivo; a logica de origem vem da consulta compartilhada usada no formulario.`,
  },
  PRINCIPAL_PROFESSORES_EMAIL_USAGE_MODAL: {
    systemName: 'Sistema Escola',
    originText:
      'Origem: Sistema Escola - caminho físico: C:\\Sistemas\\IA\\Escola\\frontend\\src\\app\\principal\\professores\\page.tsx',
    auditText: `--- LOGICA DA TELA ---
Popup de alerta para uso de e-mail ja existente.

TABELAS PRINCIPAIS:
- users / acessos vinculados
- people / cadastro-base compartilhado

RELACIONAMENTOS:
- validacao cruzada por e-mail entre registros e escolas

METRICAS / CAMPOS EXIBIDOS:
- e-mail informado
- locais onde o e-mail ja esta em uso
- escola atual ou outras escolas
- tipo de entidade vinculada

FILTROS APLICADOS AGORA:
- e-mail digitado no formulario do professor

ORDENACAO:
- Nao aplicavel.

ENDPOINTS / BASE LOGICA:
- validacao compartilhada de e-mail antes do POST/PATCH de /teachers

OBSERVACAO:
- o popup informa conflito de uso; a busca detalhada do e-mail e feita por servico auxiliar antes da gravacao.`,
  },
  PRINCIPAL_FINANCEIRO_CAIXA: {
    systemName: 'Sistema Financeiro',
    originText:
      'Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\caixa\\page.tsx',
  },
  PRINCIPAL_FINANCEIRO_CAIXA_DETALHE: {
    systemName: 'Sistema Financeiro',
    originText:
      'Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\caixa\\[sessionId]\\page.tsx',
  },
  PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR: {
    systemName: 'Sistema Financeiro',
    originText:
      'Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\contas-a-pagar\\page.tsx',
  },
  PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS: {
    systemName: 'Sistema Financeiro',
    originText:
      'Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\contas-a-pagar\\importacao-notas\\page.tsx',
  },
  PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_NOTAS_IMPORTADAS: {
    systemName: 'Sistema Financeiro',
    originText:
      'Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\contas-a-pagar\\notas-importadas\\page.tsx',
  },
  PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_APROVACAO_NOTA: {
    systemName: 'Sistema Financeiro',
    originText:
      'Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\contas-a-pagar\\notas-importadas\\[importId]\\page.tsx',
  },
  PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_CERTIFICADOS_DIGITAIS: {
    systemName: 'Sistema Financeiro',
    originText:
      'Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\contas-a-pagar\\certificados-digitais\\page.tsx',
  },
};

export function resolveScreenAuditMetadata(screenId: string): ScreenAuditMetadata {
  const normalizedScreenId = String(screenId || '').trim().toUpperCase();
  const inferredMetadata = inferScreenAuditMetadata(screenId);
  const registeredMetadata = SCREEN_AUDIT_METADATA[screenId] || SCREEN_AUDIT_METADATA[normalizedScreenId];
  const financeiroMetadata = buildFinanceiroScreenAuditMetadata(normalizedScreenId);

  return {
    systemName:
      registeredMetadata?.systemName ||
      financeiroMetadata?.systemName ||
      inferredMetadata?.systemName ||
      'Sistema Escola',
    originText:
      registeredMetadata?.originText ||
      inferredMetadata?.originText ||
      financeiroMetadata?.originText,
    auditText: registeredMetadata?.auditText || financeiroMetadata?.auditText,
    sqlText: registeredMetadata?.sqlText || financeiroMetadata?.sqlText,
  };
}

export default function ScreenNameCopy({
  screenId,
  label = 'Tela',
  className = '',
  disableMargin = false,
  originText,
  auditText,
  sqlText,
}: ScreenNameCopyProps) {
  const registeredAuditMetadata = resolveScreenAuditMetadata(screenId);
  const auditMetadata: ScreenAuditMetadata = {
    systemName: registeredAuditMetadata.systemName,
    originText: originText || registeredAuditMetadata.originText,
    auditText: auditText || registeredAuditMetadata.auditText,
    sqlText: sqlText || registeredAuditMetadata.sqlText,
  };
  const [status, setStatus] = useState<CopyStatus>('idle');
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetStatus = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setStatus('idle'), COPY_FEEDBACK_TIMEOUT);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      const copied = await copyTextToClipboard(screenId);
      setStatus(copied ? 'copied' : 'error');
      if (screenId === FINANCEIRO_CAIXA_DETALHE_SCREEN_ID && typeof window !== 'undefined') {
        for (let index = 0; index < window.frames.length; index += 1) {
          window.frames[index]?.postMessage(
            {
              type: 'MSINFOR_OPEN_SCREEN_AUDIT',
              screenId,
            },
            '*',
          );
        }
      } else {
        setIsAuditOpen(true);
      }
    } catch (error) {
      console.error('Falha ao copiar nome da tela', error);
      setStatus('error');
      setIsAuditOpen(true);
    } finally {
      resetStatus();
    }
  }, [resetStatus, screenId]);

  const statusMessage = status === 'copied' ? 'COPIADO' : status === 'error' ? 'FALHA' : null;

  const containerClasses = [
    disableMargin ? '' : 'mt-3',
    'flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.4em] text-slate-400',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
    <div className={containerClasses}>
      <span className="flex-1 truncate">
        {label}: <span className="font-normal text-[10px] tracking-[0.35em] text-slate-500">{screenId}</span>
      </span>
      <button
        type="button"
        onClick={handleCopy}
        title="Copiar nome da tela e abrir lógica usada"
        aria-label={`Copiar o identificador ${screenId}`}
        className="flex h-7 w-7 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 active:scale-95"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M12 10h3" />
          <path d="M12 14h3" />
          <path d="M12 18h3" />
        </svg>
      </button>
      <span aria-live="polite" className="min-w-[48px] text-[9px] font-semibold uppercase tracking-[0.4em] text-emerald-600">
        {statusMessage}
      </span>
    </div>

    {isAuditOpen ? (
      <ScreenAuditModal
        screenId={screenId}
        systemName={auditMetadata.systemName}
        originText={auditMetadata.originText}
        auditText={auditMetadata.auditText}
        sqlText={auditMetadata.sqlText}
        onClose={() => setIsAuditOpen(false)}
      />
    ) : null}
    </>
  );
}
