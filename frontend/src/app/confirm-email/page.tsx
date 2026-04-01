'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function ConfirmEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Confirmando seu e-mail...');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Token de confirmação não encontrado.');
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`);
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.message || 'Não foi possível confirmar o e-mail.');
        }

        if (cancelled) return;
        setStatus('success');
        setMessage(data?.message || 'E-mail confirmado com sucesso.');

        window.setTimeout(() => {
          router.push('/');
        }, 3000);
      } catch (error) {
        if (cancelled) return;
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Não foi possível confirmar o e-mail.');
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [router, token]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="bg-[#2272c7] px-6 py-5 text-center">
          <h1 className="text-xl font-bold text-white">Confirmação de E-mail</h1>
        </div>
        <div className="px-8 py-10 text-center">
          <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full ${status === 'success' ? 'bg-emerald-100 text-emerald-600' : status === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
            {status === 'success' ? 'OK' : status === 'error' ? 'X' : '...'}
          </div>
          <p className="text-base font-semibold text-slate-700">{message}</p>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="mt-6 w-full rounded-xl bg-[#2272c7] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#1a5592]"
          >
            Voltar ao login
          </button>
        </div>
      </div>
    </main>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-500">Carregando...</div>}>
      <ConfirmEmailContent />
    </Suspense>
  );
}
