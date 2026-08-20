'use client';

import { useCallback, useMemo } from 'react';
import DependencyRecoveryScreen from '@/app/components/dependency-recovery-screen';

const DEFAULT_CENTRAL_URL = 'http://localhost:3200';

function getCentralUrl(): string | null {
  const configuredUrl =
    process.env.NEXT_PUBLIC_MSINFOR_CENTRAL_FRONTEND_URL || DEFAULT_CENTRAL_URL;

  try {
    const target = new URL(configuredUrl);
    const isLocalDevelopmentTarget =
      process.env.NODE_ENV !== 'production' &&
      target.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(target.hostname);
    if (target.protocol !== 'https:' && !isLocalDevelopmentTarget) {
      throw new Error('Protocolo não permitido.');
    }
    target.username = '';
    target.password = '';
    target.search = '';
    target.hash = '';
    return target.toString();
  } catch {
    return process.env.NODE_ENV === 'production' ? null : DEFAULT_CENTRAL_URL;
  }
}

export default function MsinforAdminRedirectPage() {
  const centralUrl = useMemo(() => getCentralUrl(), []);

  const handleCentralAvailable = useCallback(() => {
    if (centralUrl) window.location.replace(centralUrl);
  }, [centralUrl]);

  const handleCancel = useCallback(() => {
    window.location.assign('/');
  }, []);

  if (centralUrl) {
    return (
      <DependencyRecoveryScreen
        dependencyName="MSINFOR Central"
        dependencyUrl={centralUrl}
        onAvailable={handleCentralAvailable}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
        <h1 className="text-xl font-semibold">Administração no MSINFOR Central</h1>
        <p className="mt-3 text-sm text-slate-300">
          O acesso administrativo foi transferido para o MSINFOR Central.
        </p>
        {centralUrl ? (
          <a
            className="mt-6 inline-flex rounded-lg bg-indigo-500 px-5 py-3 font-semibold text-white hover:bg-indigo-400"
            href={centralUrl}
            rel="noreferrer"
          >
            Abrir MSINFOR Central
          </a>
        ) : (
          <p className="mt-6 rounded-lg border border-amber-700 bg-amber-950 px-4 py-3 text-sm text-amber-100">
            A URL HTTPS do MSINFOR Central não foi configurada.
          </p>
        )}
      </section>
    </main>
  );
}
