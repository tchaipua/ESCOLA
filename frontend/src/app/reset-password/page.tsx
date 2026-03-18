'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function ResetPasswordContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [successStatus, setSuccessStatus] = useState<boolean>(false);

    useEffect(() => {
        if (!token) {
            setErrorStatus('Token de segurança não encontrado. Use o link exato enviado pro seu e-mail.');
        }
    }, [token]);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorStatus(null);

        if (newPassword !== confirmPassword) {
            setErrorStatus('As senhas não coincidem. Digite com atenção.');
            return;
        }

        if (newPassword.length < 6) {
            setErrorStatus('Por segurança, a senha deve ter no mínimo 6 caracteres.');
            return;
        }

        setLoading(true);

        try {
            const response = await fetch('http://localhost:3001/api/v1/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    newPassword,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Falha ao redefinir a senha');
            }

            setSuccessStatus(true);

            setTimeout(() => {
                router.push('/');
            }, 5000);

        } catch (err: any) {
            setErrorStatus(err.message || 'Erro de comunicação com o servidor.');
        } finally {
            setLoading(false);
        }
    };

    if (!token && !errorStatus) {
        return <div className="min-h-screen bg-slate-100 flex items-center justify-center font-bold text-slate-500">Validando autenticidade...</div>;
    }

    return (
        <main className="min-h-screen w-full flex bg-slate-100 font-sans items-center justify-center p-4">
            <div className="fixed inset-0 overflow-hidden bg-slate-950 z-0">
                <div className="absolute -top-1/4 -left-1/4 w-full h-full bg-blue-600/30 blur-[150px] mix-blend-screen rounded-full animate-pulse" />
                <div className="absolute -bottom-1/4 -right-1/4 w-full h-full bg-indigo-600/20 blur-[150px] mix-blend-screen rounded-full animate-pulse" style={{ animationDelay: '1.5s' }} />
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
            </div>

            <div className="relative z-10 w-full max-w-md">
                <div className="flex justify-center mb-8">
                    <div className="shrink-0 bg-white p-2 text-center rounded-full shadow-2xl overflow-hidden ring-4 ring-white/10">
                        <img src="/logo-msinfor.jpg" alt="Logo MSINFOR Sistemas" className="w-24 h-24 object-contain block" />
                    </div>
                </div>

                <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-white/20">
                    <div className="bg-[#2272c7] p-6 text-center">
                        <h2 className="text-xl font-bold text-white mb-1">Crie sua Nova Senha</h2>
                        <p className="text-blue-100 text-sm font-medium opacity-90">Escolha uma senha forte para sua conta</p>
                    </div>

                    <div className="p-8">
                        {successStatus ? (
                            <div className="text-center py-4 animate-in fade-in zoom-in-95 duration-300">
                                <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4 ring-8 ring-green-50">
                                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h3 className="font-extrabold text-slate-800 text-2xl mb-2">Sucesso!</h3>
                                <p className="text-slate-600 font-medium leading-relaxed mb-6">
                                    Sua senha corporativa foi redefinida. <br />Use-a para voltar a controlar sua escola.
                                </p>

                                <p className="text-xs text-slate-400 font-mono mb-6">Redirecionando em instantes...</p>

                                <button
                                    onClick={() => router.push('/')}
                                    className="bg-[#2272c7] hover:bg-[#1e63ab] w-full text-white px-8 py-3 rounded-xl font-semibold tracking-wide transition-colors shadow-md"
                                >
                                    Ir para o Login Agora
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleReset} className="flex flex-col gap-5">
                                {errorStatus && (
                                    <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-r-lg text-sm font-bold shadow-sm">
                                        {errorStatus}
                                    </div>
                                )}

                                <div>
                                    <label className="text-xs font-bold text-slate-500 mb-1.5 ml-1 block uppercase tracking-wider">Nova Senha</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <svg className="h-5 w-5 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                                            </svg>
                                        </div>
                                        <input
                                            type="password"
                                            className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-bold rounded-xl pl-10 pr-4 py-3 outline-none focus:border-[#2272c7] focus:ring-4 focus:ring-[#2272c7]/20 transition-all"
                                            placeholder="Mínimo de 6 caracteres"
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            disabled={!token}
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-500 mb-1.5 ml-1 block uppercase tracking-wider">Confirme a Nova Senha</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <svg className="h-5 w-5 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H8.9V6zM18 20H6V10h12v10z" />
                                            </svg>
                                        </div>
                                        <input
                                            type="password"
                                            className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-bold rounded-xl pl-10 pr-4 py-3 outline-none focus:border-[#2272c7] focus:ring-4 focus:ring-[#2272c7]/20 transition-all"
                                            placeholder="Repita a senha digitada"
                                            value={confirmPassword}
                                            onChange={e => setConfirmPassword(e.target.value)}
                                            disabled={!token}
                                            required
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || !token}
                                    className="w-full mt-4 bg-[#2272c7] hover:bg-[#1e63ab] disabled:bg-[#729bcc] text-white font-bold py-3.5 text-[15px] rounded-xl shadow-md transition-all active:scale-95 flex justify-center uppercase tracking-wide"
                                >
                                    {loading ? (
                                        <div className="w-5 h-5 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : 'Alterar Senha de Acesso'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-100 flex items-center justify-center font-bold text-slate-500">Carregando recuperacao...</div>}>
            <ResetPasswordContent />
        </Suspense>
    );
}
