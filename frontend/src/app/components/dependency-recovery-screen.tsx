'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';

const PROBE_TIMEOUT_MS = 1800;
const RETRY_INTERVAL_MS = 3000;
const SCREEN_ID = 'ESCOLA_RECUPERACAO_DEPENDENCIA';

type DependencyRecoveryScreenProps = {
  dependencyName: string;
  dependencyUrl: string;
  probe?: (url: string) => Promise<boolean>;
  maxAttempts?: number;
  fallbackTitle?: string;
  fallbackMessage?: string;
  embedded?: boolean;
  compact?: boolean;
  onAvailable: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
};

async function isDependencyAvailable(url: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.type === 'opaque' || response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function DependencyRecoveryScreen({
  dependencyName,
  dependencyUrl,
  probe,
  maxAttempts,
  fallbackTitle = 'O serviço continua indisponível',
  fallbackMessage = 'A Escola tentou restabelecer o acesso, mas o serviço ainda não respondeu. Tente novamente em alguns instantes.',
  embedded = false,
  compact = false,
  onAvailable,
  onCancel,
  cancelLabel = 'Voltar para a Escola',
}: DependencyRecoveryScreenProps) {
  const onAvailableRef = useRef(onAvailable);
  const isActiveRef = useRef(true);
  const attemptRef = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [isChecking, setIsChecking] = useState(true);
  const [hasReachedRetryLimit, setHasReachedRetryLimit] = useState(false);

  useEffect(() => {
    onAvailableRef.current = onAvailable;
  }, [onAvailable]);

  const checkDependency = useCallback(async () => {
    const nextAttempt = attemptRef.current + 1;
    attemptRef.current = nextAttempt;
    setAttempt(nextAttempt);
    setIsChecking(true);

    const isAvailable = await (probe || isDependencyAvailable)(dependencyUrl);

    if (isAvailable && isActiveRef.current) {
      onAvailableRef.current();
      return;
    }

    setIsChecking(false);
    if (maxAttempts && nextAttempt >= maxAttempts) {
      setHasReachedRetryLimit(true);
    }
  }, [dependencyUrl, maxAttempts, probe]);

  useEffect(() => {
    isActiveRef.current = true;
    let isActive = true;

    const runCheck = async () => {
      if (!isActive) return;
      await checkDependency();
    };

    void runCheck();
    const retryTimer = window.setInterval(() => {
      void runCheck();
    }, RETRY_INTERVAL_MS);

    return () => {
      isActive = false;
      isActiveRef.current = false;
      window.clearInterval(retryTimer);
    };
  }, [checkDependency]);

  return (
    <main
      className={`flex w-full items-center justify-center ${compact ? 'px-4 py-6 text-slate-700 sm:px-6' : 'px-6 py-10 text-slate-100'} ${embedded ? compact ? 'min-h-[420px] bg-red-50/40' : 'min-h-[520px] bg-white' : 'min-h-screen bg-slate-950'}`}
      aria-busy={isChecking}
      aria-live="polite"
      data-system-message-ignore="true"
    >
      <section className={`w-full overflow-hidden ${compact ? 'max-w-md rounded-2xl border-4 border-red-700 bg-red-50 shadow-lg' : `max-w-xl rounded-[32px] border shadow-2xl ${hasReachedRetryLimit ? 'border-red-800/80 bg-[#2b0b0b]/95' : 'border-slate-800 bg-[#2b0b0b]/95'}`}`}>
        <div className={`${compact ? 'px-5 py-7 sm:px-8' : 'px-7 py-10 sm:px-12'} text-center`}>
          <div className={`relative mx-auto flex items-center justify-center ${compact ? 'h-24 w-24' : 'h-32 w-32'}`}>
            <div className={`absolute inset-0 animate-spin rounded-full border-4 ${compact ? 'border-red-200 border-t-red-700' : hasReachedRetryLimit ? 'border-red-200/20 border-t-red-300' : 'border-white/20 border-t-blue-400'}`} />
            <div className={`${compact ? 'h-20 w-20' : 'h-24 w-24'} animate-[spin_1.8s_linear_infinite] overflow-hidden rounded-full border-4 border-white bg-white shadow-2xl`}>
              <img src="/logo-msinfor.jpg" alt="Logotipo MSINFOR" className="h-full w-full object-contain" />
            </div>
          </div>

          <div className={`${compact ? 'mt-5 text-red-700' : 'mt-7 text-blue-300'} text-[11px] font-black uppercase tracking-[0.24em]`}>
            Recuperação automática de conexão
          </div>
          <h1 className={`${compact ? 'text-red-950' : 'text-white'} mt-3 text-2xl font-black sm:text-3xl`}>
            {hasReachedRetryLimit ? fallbackTitle : 'Estamos tentando corrigir o acesso'}
          </h1>
          <p className={`${compact ? 'text-slate-700' : 'text-slate-300'} mx-auto mt-4 max-w-md text-sm leading-6`}>
            {hasReachedRetryLimit ? (
              fallbackMessage
            ) : (
              <>
                O serviço <strong className={compact ? 'text-red-900' : 'text-white'}>{dependencyName}</strong> parece estar parado ou iniciando.
                A Escola está verificando novamente e abrirá o acesso assim que ele voltar.
              </>
            )}
          </p>

          <div className={`mt-7 inline-flex items-center gap-3 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] ${compact ? 'border-red-400 bg-red-100 text-red-800' : hasReachedRetryLimit ? 'border-red-400/30 bg-red-400/10 text-red-200' : 'border-blue-400/30 bg-blue-400/10 text-blue-200'}`}>
            <span className={`h-2.5 w-2.5 animate-pulse rounded-full ${compact ? 'bg-red-700' : hasReachedRetryLimit ? 'bg-red-300' : 'bg-blue-300'}`} aria-hidden="true" />
            {isChecking ? 'Tentando conectar...' : hasReachedRetryLimit ? 'Serviço ainda indisponível' : 'Aguardando o serviço voltar...'}
          </div>
          <p className="mt-3 text-xs text-slate-500" aria-label={`Tentativa ${attempt || 1}`}>
            Tentativa {attempt || 1}. Nova verificação automática em alguns segundos.
          </p>

          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className={`${compact ? 'border-red-700 text-red-900 hover:bg-red-100' : 'border-slate-600 text-slate-200 hover:border-slate-400 hover:bg-slate-800'} mt-8 rounded-xl border px-5 py-2.5 text-sm font-bold transition`}
            >
              {cancelLabel}
            </button>
          ) : null}
        </div>

        <footer className={`border-t px-7 py-4 sm:px-12 ${compact ? 'border-red-700/70 bg-red-100/70' : hasReachedRetryLimit ? 'border-red-900 bg-red-950/50' : 'border-slate-800 bg-slate-950/50'}`}>
          <ScreenNameCopy
            screenId={SCREEN_ID}
            label="Tela técnica"
            disableMargin
            compact
            className="text-slate-500"
            originText="Origem: Sistema Escola - caminho físico: C:\\Sistemas\\IA\\Escola\\frontend\\src\\app\\components\\dependency-recovery-screen.tsx"
            auditText="Tela de recuperação de dependência da Escola. Faz uma verificação HTTP somente leitura no endereço informado pelo próprio fluxo, sem enviar credenciais, sem alterar dados e sem executar regras de negócio."
            sqlText="Não há consulta SQL nem mutação de dados. A tela executa somente uma verificação HTTP de disponibilidade do serviço informado pelo próprio fluxo da Escola."
          />
        </footer>
      </section>
    </main>
  );
}
