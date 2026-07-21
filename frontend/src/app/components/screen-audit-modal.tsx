'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { copyTextToClipboard } from '@/app/lib/clipboard';

type ScreenAuditModalProps = {
  screenId: string;
  systemName: string;
  originText?: string;
  auditText?: string;
  sqlText?: string;
  onClose: () => void;
};

const COPY_FEEDBACK_TIMEOUT = 1800;

type CopyStatus = 'idle' | 'copied' | 'error';
type AuditTab = 'info' | 'sql';

const DEFAULT_AUDIT_TEXT = `--- LOGICA DA TELA ---
Mapeamento SQL especifico ainda nao cadastrado para este ponto da interface.

TABELAS PRINCIPAIS:
- Mapeamento pendente nesta chamada do componente. Consulte a tela pai/origem para identificar a consulta principal.

RELACIONAMENTOS:
- Mapeamento pendente nesta chamada do componente.

METRICAS / CAMPOS EXIBIDOS:
- Conteudo visual, navegacao, mensagens ou dados recebidos de componentes/rotas externas.

FILTROS APLICADOS AGORA:
- Mapeamento pendente nesta chamada do componente.

ORDENACAO:
- Mapeamento pendente nesta chamada do componente.

OBSERVACAO:
- Esta mensagem nao afirma ausencia de tabela fisica; apenas indica que a tela ainda nao passou auditText/sqlText especifico para este ponto.`;

function normalizeAuditText(value: string) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function removeSqlFromAuditText(auditText: string, sqlText?: string) {
  const normalizedAuditText = normalizeAuditText(auditText);
  const normalizedSqlText = normalizeAuditText(sqlText || '');

  if (!normalizedSqlText) return normalizedAuditText;

  const infoText = normalizedAuditText
    .replace(normalizedSqlText, '')
    .replace(/\n?SQL EQUIVALENTE[^\n]*:\s*\n/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return infoText || normalizedAuditText;
}

function AuditContent({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, index) => {
        const tableMatch = line.match(/^(-\s)([a-zA-Z0-9_]+)(\s\([A-Z0-9_]+\))?(\s-\s.*)$/);
        if (tableMatch) {
          return (
            <div key={`${line}-${index}`} className="text-[13px] leading-5">
              {tableMatch[1]}
              <strong className="text-[15px] font-black text-slate-950">{tableMatch[2]}</strong>
              {tableMatch[3] ? <strong className="font-black text-slate-950">{tableMatch[3]}</strong> : null}
              {tableMatch[4]}
            </div>
          );
        }

        return (
          <div key={`${line}-${index}`} className="leading-4">
            {line || '\u00A0'}
          </div>
        );
      })}
    </>
  );
}

export default function ScreenAuditModal({
  screenId,
  systemName,
  originText,
  auditText = DEFAULT_AUDIT_TEXT,
  sqlText,
  onClose,
}: ScreenAuditModalProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [activeTab, setActiveTab] = useState<AuditTab>('info');
  const [isMounted, setIsMounted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetCopyStatus = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setCopyStatus('idle'), COPY_FEEDBACK_TIMEOUT);
  }, []);

  useEffect(() => {
    setIsMounted(true);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopySql = useCallback(async () => {
    const effectiveSqlText = (sqlText && sqlText.trim()) || 'SQL ESPECIFICO PENDENTE PARA ESTA TELA.';
    try {
      const copied = await copyTextToClipboard(effectiveSqlText);
      setCopyStatus(copied ? 'copied' : 'error');
    } catch (error) {
      console.error('Falha ao copiar SQL da auditoria', error);
      setCopyStatus('error');
    } finally {
      resetCopyStatus();
    }
  }, [resetCopyStatus, sqlText]);

  const effectivePathText = originText
    ? originText
        .replace(/^Origem:\s*Sistema\s+[^-]+-\s*/i, '')
        .replace(/^Origem:\s*[^-]+-\s*/i, '')
        .replace(/^caminho\s+f[ií]sico:\s*/i, '')
        .trim()
    : 'caminho fisico nao mapeado para esta tela.';
  const effectiveInfoText = removeSqlFromAuditText(auditText, sqlText);
  const effectiveSqlText = (sqlText && sqlText.trim()) || 'SQL ESPECIFICO PENDENTE PARA ESTA TELA.';

  const modal = (
    <div data-system-message-root className="fixed inset-0 z-[999] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-md sm:p-4">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/40 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.45)]">
        <div className="grid flex-none grid-cols-1 gap-4 border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-800 to-blue-900 px-4 py-4 text-white sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_8rem] lg:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <img
              src="/logo-msinfor.jpg"
              alt="MSINFOR Sistemas"
              className="h-14 w-14 flex-none rounded-full border-2 border-white bg-white object-contain shadow-lg shadow-slate-950/20"
            />
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-200">Auditoria SQL</div>
              <div className="mt-1 truncate text-sm font-black">{screenId}</div>
              <div className="mt-2 inline-flex max-w-full items-center justify-center rounded-full border border-blue-200/60 bg-blue-50 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-blue-700 shadow-sm">
                {`ORIGEM: SISTEMA ${String(systemName || '').toUpperCase().replace(/^SISTEMA\s+/i, '')}`}
              </div>
            </div>
          </div>
          <div className="flex min-w-0 justify-center">
            <div className="inline-flex w-full rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveTab('info')}
                className={`flex-1 whitespace-nowrap rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition sm:flex-none sm:px-5 sm:text-[11px] sm:tracking-[0.16em] ${
                  activeTab === 'info'
                    ? 'bg-[#153a6a] text-white shadow-md shadow-slate-900/15'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                Outras informações
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('sql')}
                className={`flex-1 whitespace-nowrap rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition sm:flex-none sm:px-5 sm:text-[11px] sm:tracking-[0.16em] ${
                  activeTab === 'sql'
                    ? 'bg-[#153a6a] text-white shadow-md shadow-slate-900/15'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                SQL
              </button>
            </div>
          </div>
          <div className="flex w-full flex-none justify-self-stretch flex-col gap-2 sm:w-32 sm:justify-self-end">
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-full rounded-xl border border-white/20 bg-white/10 text-[11px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/20"
              aria-label="Fechar auditoria SQL"
            >
              Fechar
            </button>
            {activeTab === 'sql' ? (
              <button
                type="button"
                onClick={() => void handleCopySql()}
                className="h-9 w-full rounded-xl border border-emerald-400/20 bg-emerald-700 text-[11px] font-black uppercase tracking-[0.08em] text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-800"
              >
                {copyStatus === 'copied' ? 'SQL copiado' : copyStatus === 'error' ? 'Falha ao copiar' : 'Copiar SQL'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 px-4 py-5 sm:px-6 sm:py-6">
          <div className="mb-5 flex-none">
            <div className="mx-auto mt-3 max-w-4xl rounded-full border border-red-100 bg-red-50 px-4 py-2 text-center text-xs font-black text-red-700">
              {effectivePathText}
            </div>
          </div>

          <div className="max-h-[55vh] overflow-auto rounded-2xl border border-slate-200 bg-white px-6 py-6 font-mono text-[12px] text-slate-950 shadow-inner">
            {activeTab === 'info' ? <AuditContent text={effectiveInfoText} /> : <pre className="whitespace-pre-wrap font-mono">{effectiveSqlText}</pre>}
          </div>

          <div className="mt-6" />
        </div>
      </div>
    </div>
  );

  if (!isMounted || typeof document === 'undefined') return null;

  return createPortal(modal, document.body);
}
