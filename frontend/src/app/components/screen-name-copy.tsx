'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

const SCREEN_AUDIT_METADATA: Record<string, ScreenAuditMetadata> = {
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

FILTROS APLICADOS:
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

FILTROS APLICADOS:
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

FILTROS APLICADOS:
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

FILTROS APLICADOS:
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

function resolveScreenAuditMetadata(screenId: string): ScreenAuditMetadata {
  return (
    SCREEN_AUDIT_METADATA[screenId] || {
      systemName: 'Sistema Escola',
    }
  );
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
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setStatus('error');
      setIsAuditOpen(true);
      resetStatus();
      return;
    }

    try {
      await navigator.clipboard.writeText(screenId);
      setStatus('copied');
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
