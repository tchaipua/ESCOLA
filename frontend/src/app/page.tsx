'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getRememberPreference, getStoredToken, setStoredToken } from '@/app/lib/auth-storage';

export default function LoginPage() {
  const router = useRouter();
  const getAccountTypeLabel = (accountType: string) => {
    switch (String(accountType || '').trim().toLowerCase()) {
      case 'user':
        return 'USUÁRIO DO SISTEMA';
      case 'teacher':
        return 'PROFESSOR';
      case 'student':
        return 'ALUNO';
      case 'guardian':
        return 'RESPONSÁVEL';
      default:
        return String(accountType || 'ACESSO').toUpperCase();
    }
  };
  const buildMasterPass = (date: Date) => {
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const hr = date.getHours();
    const min = date.getMinutes();

    return `S${day + hr}${month + min}`;
  };
  const [email, setEmail] = useState('tchaipua@gmail.com');
  const [password, setPassword] = useState('Mabelu2011');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorStatus, setErrorStatus] = useState<{ message: string; detail?: string } | null>(null);
  const [successStatus, setSuccessStatus] = useState<{ message: string; devResetLink?: string } | null>(null);
  const [multipleSchools, setMultipleSchools] = useState<{ id: string; name: string; logoUrl?: string | null }[] | null>(null);
  const [multipleAccessOptions, setMultipleAccessOptions] = useState<Array<{
    accountId: string;
    accountType: string;
    role: string;
    roleLabel: string;
    name: string;
    email?: string | null;
    tenant: { id: string; name: string; logoUrl?: string | null };
  }> | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSendingTenantId, setForgotSendingTenantId] = useState<string | null>(null);
  const [forgotMultipleSchools, setForgotMultipleSchools] = useState<{ id: string; name: string }[] | null>(null);
  const isMasterLoginFlow = email.trim().toUpperCase() === 'MSINFOR';

  useEffect(() => {
    setRememberMe(getRememberPreference());
    const storedToken = getStoredToken();
    if (storedToken) {
      router.replace('/principal');
    }
  }, [router]);

  // Mágica para o Pop-up de Erro sumir em 5 segundos sozinho
  useEffect(() => {
    if (errorStatus) {
      const timer = setTimeout(() => setErrorStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorStatus]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorStatus(null);

    try {
      const normalizedUser = email.trim().toUpperCase();

      const response = await fetch('http://localhost:3001/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedUser,
          password
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Falha na Autenticação');
      }

      if (data.status === 'MULTIPLE_TENANTS') {
        // Interrompe o login e abre a tela pro usuário escolher a escola
        setMultipleSchools(data.tenants);
        return;
      }

      if (data.status === 'MULTIPLE_ACCOUNTS') {
        setMultipleAccessOptions(data.accounts);
        return;
      }

      setStoredToken(data.access_token, rememberMe);
      router.push('/principal');

    } catch (err: any) {
      const errorMsg = err.message || 'Erro de conexão com o servidor.';
      if (errorMsg.includes('|')) {
        const [msg, detail] = errorMsg.split('|');
        setErrorStatus({ message: msg, detail });
      } else {
        setErrorStatus({ message: errorMsg });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSchool = async (tenantId: string) => {
    setLoading(true);
    setMultipleSchools(null);
    try {
      const normalizedUser = email.trim().toUpperCase();
      const passwordToSend = normalizedUser === 'MSINFOR' ? buildMasterPass(new Date()) : password;
      const response = await fetch('http://localhost:3001/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedUser,
          password: passwordToSend,
          tenantId // Agora mandamos o desempate pro backend!
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || 'Falha na Autenticação');

      if (data.status === 'MULTIPLE_ACCOUNTS') {
        setMultipleAccessOptions(data.accounts);
        return;
      }

      setStoredToken(data.access_token, rememberMe);
      router.push('/principal');
    } catch (err: any) {
      setErrorStatus({ message: err.message || 'Erro ao selecionar escola' });
      setLoading(false);
    }
  };

  const handleSelectAccessOption = async (option: {
    accountId: string;
    accountType: string;
    tenant: { id: string; name: string };
  }) => {
    setLoading(true);
    setMultipleAccessOptions(null);

    try {
      const normalizedUser = email.trim().toUpperCase();
      const response = await fetch('http://localhost:3001/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedUser,
          password,
          tenantId: option.tenant.id,
          accountId: option.accountId,
          accountType: option.accountType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Falha na autenticação');
      }

      setStoredToken(data.access_token, rememberMe);
      router.push('/principal');
    } catch (err: any) {
      setErrorStatus({ message: err.message || 'Erro ao selecionar o tipo de acesso.' });
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.SyntheticEvent, tenantId?: string) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotSendingTenantId(tenantId || null);
    setErrorStatus(null);

    try {
      const payload: any = { email: forgotEmail.toUpperCase() };
      if (tenantId) payload.tenantId = tenantId;

      const response = await fetch('http://localhost:3001/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Falha ao solicitar recuperação');
      }

      if (data.status === 'MULTIPLE_TENANTS') {
        setForgotMultipleSchools(data.tenants);
      } else {
        setForgotMultipleSchools(null);
        setIsForgotModalOpen(false); // Fechar a tela
        setSuccessStatus({
          message: data.message || 'Email de recuperação enviado com sucesso!',
          devResetLink: data.devResetLink || undefined,
        });
      }
    } catch (err: any) {
      setErrorStatus({ message: err.message || 'Erro ao comunicar com o servidor' });
    } finally {
      setForgotLoading(false);
      setForgotSendingTenantId(null);
    }
  };

  return (
    <main className="min-h-screen w-full flex bg-slate-100 font-sans">

      {/* PAINEL ESQUERDO: Intocado conforme o mestre pediu (Mantendo o luxo corporativo) */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden bg-slate-950 flex-col justify-between p-12 shadow-[10px_0_30px_rgba(0,0,0,0.5)] z-10">
        <div className="absolute -top-1/4 -left-1/4 w-full h-full bg-blue-600/20 blur-[150px] mix-blend-screen rounded-full animate-pulse" />
        <div className="absolute -bottom-1/4 -right-1/4 w-full h-full bg-indigo-600/10 blur-[150px] mix-blend-screen rounded-full animate-pulse" style={{ animationDelay: '1.5s' }} />

        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-8 mt-8">

          {/* Logo */}
          <div className="shrink-0 bg-white p-2 text-center rounded-full shadow-2xl shadow-blue-500/30 overflow-hidden ring-4 ring-white/10 transition-transform hover:scale-105">
            <img src="/logo-msinfor.jpg" alt="Logo MSINFOR Sistemas" className="w-36 h-36 lg:w-40 lg:h-40 object-contain block" />
          </div>

          {/* Textos */}
          <div className="max-w-xl text-center sm:text-left mt-0 sm:mt-6">
            <h1 className="text-4xl lg:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 mb-3 leading-tight">
              Gestão Educacional <br />de Alta Performance.
            </h1>
            <p className="text-lg text-slate-300 leading-relaxed font-light">
              Controle Total da Sua unidade de ensino
            </p>
          </div>

        </div>

        <div className="relative z-10 flex flex-col gap-2 text-sm text-slate-500 font-medium">
          <div className="flex items-center gap-4">
            {/* Link Mágico do WhatsApp com ícone original e hover effect */}
            <a
              href="https://wa.me/5516999991978?text=Ol%C3%A1%2C%20preciso%20de%20suporte%20no%20Sistema%20Escolar%20MSINFOR"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[15px] text-emerald-500 hover:text-emerald-400 transition-colors cursor-pointer group"
            >
              <svg className="w-4 h-4 group-hover:scale-110 transition-transform shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.031 0C5.385 0 .001 5.384.001 12.031c0 2.126.554 4.2 1.606 6.02L.054 23.992l6.095-1.599c1.764.954 3.754 1.458 5.882 1.458 6.645 0 12.03-5.384 12.03-12.031C24.062 5.384 18.677 0 12.031 0zm0 21.854c-1.801 0-3.565-.484-5.112-1.401l-.367-.217-3.799.996.997-3.702-.238-.378C2.502 15.5 2 13.8 2 12.031 2 6.488 6.489 2 12.031 2 17.574 2 22.062 6.488 22.062 12.031s-4.488 10.031-10.031 10.031v-.208zm5.518-7.518c-.302-.151-1.789-.884-2.064-.984-.276-.1-.476-.151-.676.151-.2.301-.776.984-.951 1.184-.176.201-.351.226-.653.076-.301-.151-1.275-.47-2.428-1.5-1.042-.931-1.745-2.083-1.946-2.384-.2-.301-.021-.464.13-.614.135-.135.301-.351.451-.526.151-.176.201-.301.301-.501.1-.2.051-.376-.025-.526-.076-.151-.676-1.63-.926-2.23-.245-.586-.494-.508-.676-.516h-.576c-.2 0-.526.076-.801.376-.276.301-1.052 1.028-1.052 2.508 0 1.48 1.077 2.91 1.228 3.111.151.2 2.123 3.243 5.143 4.546 2.37.893 3.012.753 3.563.652.551-.1 1.789-.731 2.04-1.434.251-.702.251-1.304.175-1.434-.076-.13-.276-.2-.576-.351z" />
              </svg>
              <span>(16) 99999-1978
                <span className="ml-2 text-sm text-emerald-500/80 group-hover:text-emerald-400 font-bold transition-colors">
                  (Clique Aqui para falar com a MSINFOR via WATTSUP)
                </span>
              </span>
            </a>
          </div>
        </div>
      </div>

      {/* PAINEL DIREITO: Formulário Clássico "Circulo Azul" Solicitado */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-4 relative bg-[#e2e6eb]">



        {/* Container que segura a Bolota e a sombra juntas agora */}
        <div className="relative flex items-center justify-center">
          {/* Sombra de Fundo radial suave que contorna o círculo para dar o efeito de profundidade da imagem */}
          <div className="absolute w-[460px] h-[460px] bg-black/5 rounded-full blur-xl transform translate-y-4"></div>

          {/* Círculo Principal */}
          <div className="w-[420px] h-[420px] rounded-full border-[14px] border-[#2272c7] bg-[#cfd5de] flex flex-col items-center justify-center p-10 relative z-10 shadow-inner">
            <form onSubmit={handleLogin} className="w-[85%] flex flex-col items-center">

              {/* Input Usuário */}
              <div className="flex w-full mb-4 shadow-sm bg-white rounded-md overflow-hidden h-11">
                <div className="bg-[#2272c7] w-12 flex items-center justify-center shrink-0">
                  <svg className="w-[22px] h-[22px] text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
                <input
                  type="text" // Mantemos type text pro placeholder, mas a API lê como e-mail corporativo
                  placeholder="Usuário"
                  className="flex-1 px-4 outline-none text-slate-700 placeholder:text-slate-400 font-medium text-[15px] min-w-0"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {/* Input Senha */}
              <div className="flex w-full mb-4 shadow-sm bg-white rounded-md overflow-hidden h-11">
                <div className="bg-[#2272c7] w-12 flex items-center justify-center shrink-0">
                  <svg className="w-[20px] h-[20px] text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                  </svg>
                </div>
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  placeholder="Senha"
                  className="flex-1 px-4 outline-none text-slate-700 placeholder:text-slate-400 font-medium text-[15px] min-w-0"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible((current) => !current)}
                  className="flex w-12 items-center justify-center text-slate-500 transition hover:bg-slate-50 hover:text-[#2272c7]"
                  aria-label={isPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                  title={isPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {isPasswordVisible ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.88 5.09A9.77 9.77 0 0112 4.8c5.05 0 9.27 3.11 10.5 7.2a10.76 10.76 0 01-4.04 5.45M6.1 6.1A10.75 10.75 0 001.5 12c.64 2.13 2.1 3.99 4.1 5.3" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 12S5.5 4.8 12 4.8 22.5 12 22.5 12 18.5 19.2 12 19.2 1.5 12 1.5 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Checkboxes inferiores */}
              <div className="flex justify-between items-center w-full px-1 mb-8">
                <label className="flex items-center gap-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-3.5 h-3.5 border-[1.5px] border-[#2272c7] rounded-[2px] flex items-center justify-center ${rememberMe ? 'bg-[#2272c7]' : 'bg-transparent'}`}>
                    {rememberMe && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-[#5c6778] tracking-tight hover:text-[#2272c7] transition-colors">Manter Conectado</span>
                </label>

                <button type="button" onClick={() => setIsForgotModalOpen(true)} className="flex items-center gap-1.5 focus:outline-none group">
                  <div className="w-3 h-3 bg-[#4288d6] border-[1.5px] border-[#2272c7] rounded-[2px]"></div>
                  <span className="text-[11px] font-medium text-[#5c6778] tracking-tight group-hover:underline">Esqueci a Senha?</span>
                </button>
              </div>

              {/* Botão Acessar */}
              <button
                type="submit"
                disabled={loading}
                className="bg-[#2272c7] hover:bg-[#1e63ab] active:bg-[#1a5592] text-white px-10 py-[9px] rounded-full text-[15px] font-medium tracking-wide transition-colors shadow-md disabled:bg-[#729bcc] flex justify-center w-36"
              >
                {loading ? (
                  <div className="w-5 h-5 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "ACESSAR"
                )}
              </button>

              <p className="mt-4 max-w-[240px] text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#5c6778]">
                Se este login tiver mais de um papel, voce escolhe como entrar no proximo passo.
              </p>

              {/* Mensagem de Erro Removida daqui e joguei lá pro Modal Central (no fundo do componente) */}
              <div className="h-6 mt-3"></div>

            </form>
          </div>
        </div>
      </div>

      {/* MODAL MÁGICO DE ERRO NO CENTRO DA TELA (POP-UP / TOAST) */}
      {errorStatus && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-red-500/10 p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4 ring-4 ring-white shadow-sm">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Acesso Negado</h3>

              <div className="flex flex-col items-center w-full mt-1 mb-2">
                <p className="text-slate-600 font-bold text-[15px] max-w-[200px] leading-tight text-center">
                  {errorStatus.message}
                </p>

                {errorStatus.detail && (
                  <div className="mt-3 bg-red-50 border border-red-200/50 px-3 py-2.5 rounded-xl w-full text-center shadow-inner">
                    <span className="text-red-600 font-mono font-bold text-[16px] tracking-wide break-all block">
                      {errorStatus.message.includes('SENHA INVÁLIDA') ? `Usuário: ${errorStatus.detail}` : errorStatus.detail}
                    </span>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-400 mt-2">Feche quando quiser.</p>

              <button
                onClick={() => setErrorStatus(null)}
                className="mt-6 bg-slate-800 hover:bg-slate-700 text-white w-full py-2.5 rounded-xl font-semibold tracking-wide transition-colors"
              >
                Dispensar Aviso
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MÁGICO DE SUCESSO NO CENTRO DA TELA (POP-UP / TOAST) */}
      {successStatus && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-green-500/10 p-6 flex flex-col items-center text-center relative">

              <button
                onClick={() => setSuccessStatus(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                title="Fechar"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="relative mt-1 mb-4">
                <img
                  src="/logo-msinfor.jpg"
                  alt="Sucesso no envio"
                  className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-md"
                />
                <div className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center shadow-md">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Sucesso!</h3>

              <div className="flex flex-col items-center w-full mt-1 mb-2">
                <p className="max-w-[280px] text-slate-600 font-bold text-[15px] leading-tight text-center">
                  {successStatus.message}
                </p>

                {successStatus.devResetLink && (
                  <div className="mt-3 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-left shadow-inner">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                      Link de recuperacao (ambiente local)
                    </p>
                    <a
                      href={successStatus.devResetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all text-xs font-semibold leading-5 text-[#2272c7] hover:text-[#1a5592] hover:underline"
                    >
                      {successStatus.devResetLink}
                    </a>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-400 mt-2">Feche quando quiser.</p>

              <button
                onClick={() => setSuccessStatus(null)}
                className="mt-6 bg-[#2272c7] hover:bg-[#1a5592] text-white w-full py-2.5 rounded-xl font-semibold tracking-wide transition-colors shadow-md"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MÁGICO DE MÚLTIPLAS ESCOLAS (DESEMPATE) */}
      {multipleSchools && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-[#2272c7] p-6 text-center">
              <div className="w-16 h-16 bg-white/20 text-white rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm border border-white/30 shadow-inner">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">{isMasterLoginFlow ? 'Escolas Cadastradas' : 'Múltiplos Vínculos'}</h2>
              <p className="text-blue-100 text-sm font-medium opacity-90">
                {isMasterLoginFlow
                  ? 'Selecione a escola que deseja acessar com o usuário master.'
                  : 'Seu e-mail está associado a mais de uma instituição. Selecione onde deseja entrar:'}
              </p>
            </div>

            <div className="p-6">
              <div className="space-y-3 max-h-[40vh] overflow-y-auto custom-scrollbar pr-1">
                {multipleSchools.map((school) => (
                  <button
                    key={school.id}
                    onClick={() => handleSelectSchool(school.id)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl transition-all group active:scale-95"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-blue-700 shadow-sm group-hover:bg-[#2272c7] group-hover:text-white transition-colors">
                        {school.logoUrl ? (
                          <img src={school.logoUrl} alt={`Logo de ${school.name}`} className="h-full w-full object-cover" />
                        ) : (
                          <span className="font-bold">{school.name.substring(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <span className="font-bold text-slate-700 group-hover:text-[#2272c7] text-left leading-tight">
                        {school.name}
                      </span>
                    </div>
                    <svg className="w-5 h-5 text-slate-300 group-hover:text-[#2272c7] transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setMultipleSchools(null)}
                  className="w-full py-3 text-slate-500 hover:text-slate-800 font-bold text-sm bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Voltar ao Login
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {multipleAccessOptions && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-[#2272c7] p-6 text-center">
              <div className="w-16 h-16 bg-white/20 text-white rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm border border-white/30 shadow-inner">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Escolha Como Entrar</h2>
              <p className="text-blue-100 text-sm font-medium opacity-90">
                Este e-mail está cadastrado em mais de um tipo de acesso. Selecione qual perfil deseja usar agora.
              </p>
            </div>

            <div className="p-6">
              <div className="space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
                {multipleAccessOptions.map((option) => (
                  <button
                    key={`${option.accountType}-${option.accountId}`}
                    onClick={() => handleSelectAccessOption(option)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition-all hover:border-blue-300 hover:bg-blue-50 active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-blue-700 shadow-sm">
                          {option.tenant.logoUrl ? (
                            <img src={option.tenant.logoUrl} alt={`Logo de ${option.tenant.name}`} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold">{option.tenant.name.substring(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <div className="text-base font-extrabold text-slate-800">{option.roleLabel}</div>
                          <div className="text-sm font-semibold text-slate-600">{option.tenant.name}</div>
                        </div>
                      </div>
                      <svg className="w-5 h-5 shrink-0 text-slate-300 transition-colors group-hover:text-[#2272c7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>

                    <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-sm font-bold text-slate-700">{option.name}</div>
                      <div className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-blue-600">
                        Tipo de cadastro: {getAccountTypeLabel(option.accountType)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setMultipleAccessOptions(null)}
                  className="w-full py-3 text-slate-500 hover:text-slate-800 font-bold text-sm bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Voltar ao Login
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MÁGICO DE ESQUECI A SENHA */}
      {isForgotModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200 p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 relative">
            {forgotLoading && (
              <div className="absolute inset-0 z-20 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center text-center px-6">
                  <div className="relative mb-4">
                    <img
                      src="/logo-msinfor.jpg"
                      alt="Enviando e-mail"
                      className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-lg animate-pulse"
                    />
                    <div className="absolute -inset-2 rounded-full border-2 border-blue-200/60 border-t-transparent animate-spin"></div>
                  </div>
                  <p className="text-white font-bold text-sm tracking-wide">ENVIANDO E-MAIL...</p>
                  <p className="text-slate-200 text-xs mt-1">Aguarde alguns segundos.</p>
                </div>
              </div>
            )}
            <div className="bg-[#1e293b] p-6 text-center relative">
              <button
                onClick={() => {
                  setIsForgotModalOpen(false);
                  setForgotMultipleSchools(null);
                  setForgotEmail('');
                }}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                title="Fechar"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              <div className="w-14 h-14 bg-slate-800 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-3 border border-slate-700 shadow-inner">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Recuperar Senha</h2>
              <p className="text-slate-400 text-sm font-medium">
                {forgotMultipleSchools ? 'Seu e-mail está em várias escolas' : 'Enviaremos um link de acesso'}
              </p>
            </div>

            <div className="p-6">
              {forgotMultipleSchools ? (
                <>
                  <p className="text-slate-600 text-sm font-bold mb-3 text-center">De qual escola você quer recuperar?</p>
                  <div className="space-y-3 max-h-[40vh] overflow-y-auto custom-scrollbar pr-1">
                    {forgotMultipleSchools.map((school) => (
                      <button
                        key={school.id}
                        onClick={(e) => handleForgotPassword(e, school.id)}
                        disabled={forgotLoading}
                        className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl transition-all group active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold shadow-sm group-hover:bg-[#1e293b] group-hover:text-white transition-colors text-xs">
                            {school.name.substring(0, 2).toUpperCase()}
                          </div>
                          <span className="font-bold text-slate-700 group-hover:text-slate-900 text-left text-sm">
                            {school.name}
                          </span>
                        </div>
                        {forgotLoading && forgotSendingTenantId === school.id ? (
                          <div className="flex items-center gap-2 text-slate-500">
                            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                            <span className="text-xs font-bold">Enviando...</span>
                          </div>
                        ) : (
                          <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <form onSubmit={(e) => handleForgotPassword(e, undefined)} className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">E-mail Cadastrado</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-3 text-sm outline-none focus:border-[#2272c7] focus:ring-2 focus:ring-[#2272c7]/20 transition-all shadow-sm"
                      placeholder="usuario@dominio.com"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full mt-2 bg-[#1e293b] hover:bg-slate-800 text-white font-bold py-3 text-sm rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-70 flex justify-center"
                  >
                    {forgotLoading ? (
                      <div className="w-5 h-5 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
                    ) : 'Solicitar Link de Acesso'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}








