'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  getRememberPreference,
  getStoredSessionProfile,
  getStoredToken,
  setStoredSessionProfile,
  type StoredSessionProfile,
} from '@/app/lib/auth-storage';
import { getHomeRouteForRole, getHomeRouteForSession } from '@/app/lib/dashboard-crud-utils';
import ScreenNameCopy from '@/app/components/screen-name-copy';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';
const SCHOOL_SELECTION_SCREEN_ID = 'LOGIN_SELECAO_EMPRESA_MSINFOR';
const BRANCH_SELECTION_SCREEN_ID = 'LOGIN_SELECAO_FILIAL_MSINFOR';
const CASH_SESSION_NOTICE_SCREEN_ID = 'LOGIN_CAIXA_ABERTO_ESCOLA';

type LoginResponseData = {
  user: unknown;
  cashSessionOpened?: boolean;
  cashSessionOpeningAmount?: number | string | null;
  cashSessionNotice?: {
    openingAmount?: number | string | null;
    openedAutomatically?: boolean;
    cashClosingMode?: string | null;
    openedAt?: string | null;
    cashierDisplayName?: string | null;
    branchLogoUrl?: string | null;
    branchName?: string | null;
    companyName?: string | null;
  } | null;
};

type LoginCashSessionNotice = {
  openingAmount: number;
  openedAutomatically: boolean;
  cashClosingMode: string;
  openedAt: string;
  cashierDisplayName: string;
  branchLogoUrl: string | null;
  branchName: string | null;
  companyName: string | null;
};

function formatCashSessionOpenedAt(value?: string | null) {
  const openedAt = String(value || '').trim();
  if (!openedAt) return '—';

  const date = new Date(openedAt);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function formatCashClosingMode(value?: string | null) {
  switch (String(value || '').trim().toUpperCase()) {
    case 'DAILY_REQUIRED':
      return 'FECHAMENTO DIÁRIO OBRIGATÓRIO';
    case 'DAILY_AUTOMATIC':
      return 'FECHAMENTO DIÁRIO AUTOMÁTICO';
    case 'MANUAL':
    default:
      return 'FECHAMENTO MANUAL (MESMO CAIXA PODE FICAR VÁRIOS DIAS EM ABERTO)';
  }
}

export default function LoginPage() {
  const router = useRouter();
  const normalizeLoginErrorMessage = (message?: string) => {
    const rawMessage = String(message || '').trim();

    if (!rawMessage) {
      return 'Não foi possível concluir seu acesso agora. Tente novamente.';
    }

    if (rawMessage === 'Failed to fetch') {
      return 'Não foi possível conectar ao servidor. Isso normalmente acontece quando o backend está fechado, indisponível ou sem resposta no momento.';
    }

    if (rawMessage === 'Unauthorized') {
      return 'Seu acesso não foi autorizado no momento. Faça login novamente e tente outra vez.';
    }

    if (
      rawMessage.includes('ThrottlerException') ||
      rawMessage.toLowerCase().includes('too many requests')
    ) {
      return 'Foram feitas muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.';
    }

    if (
      rawMessage.includes('Cross-Tenant Error') ||
      rawMessage.includes('Contexto ausente para manipulação restrita de EmailCredential')
    ) {
      return 'Não foi possível preparar o acesso deste e-mail agora. Tente novamente em alguns instantes. Se for seu primeiro acesso, use "Esqueci a senha" para criar sua senha.';
    }

    return rawMessage;
  };

  const getLoginErrorTitle = (message?: string) => {
    const rawMessage = String(message || '').trim();

    if (rawMessage === 'Failed to fetch') {
      return 'Servidor Indisponível';
    }

    if (rawMessage === 'Unauthorized') {
      return 'Acesso Não Autorizado';
    }

    return 'Acesso Negado';
  };

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

  const getAccessOptionTheme = (accountType: string, role?: string) => {
    const profile = String(accountType || role || '').trim().toLowerCase();
    const normalizedRole = String(role || '').trim().toUpperCase();

    if (profile === 'teacher' || normalizedRole === 'PROFESSOR') {
      return {
        card: 'border-emerald-200 bg-emerald-50 hover:border-emerald-300 hover:bg-emerald-100/70',
        avatar: 'bg-emerald-100 text-emerald-700',
        detail: 'border-emerald-200 bg-white/85',
        label: 'text-emerald-700',
        arrow: 'group-hover:text-emerald-700',
      };
    }

    if (profile === 'student' || normalizedRole === 'ALUNO') {
      return {
        card: 'border-sky-200 bg-sky-50 hover:border-sky-300 hover:bg-sky-100/70',
        avatar: 'bg-sky-100 text-sky-700',
        detail: 'border-sky-200 bg-white/85',
        label: 'text-sky-700',
        arrow: 'group-hover:text-sky-700',
      };
    }

    if (profile === 'guardian' || normalizedRole === 'RESPONSAVEL' || normalizedRole === 'RESPONSÁVEL') {
      return {
        card: 'border-amber-200 bg-amber-50 hover:border-amber-300 hover:bg-amber-100/70',
        avatar: 'bg-amber-100 text-amber-700',
        detail: 'border-amber-200 bg-white/85',
        label: 'text-amber-700',
        arrow: 'group-hover:text-amber-700',
      };
    }

    return {
      card: 'border-indigo-200 bg-indigo-50 hover:border-indigo-300 hover:bg-indigo-100/70',
      avatar: 'bg-indigo-100 text-indigo-700',
      detail: 'border-indigo-200 bg-white/85',
      label: 'text-indigo-700',
      arrow: 'group-hover:text-indigo-700',
    };
  };
  const [email, setEmail] = useState(() =>
    process.env.NODE_ENV === 'development'
      ? process.env.NEXT_PUBLIC_MSINFOR_LOCAL_TEST_LOGIN || ''
      : '',
  );
  const [password, setPassword] = useState(() =>
    process.env.NODE_ENV === 'development'
      ? process.env.NEXT_PUBLIC_MSINFOR_LOCAL_TEST_PASSWORD || ''
      : '',
  );
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorStatus, setErrorStatus] = useState<{ message: string; detail?: string } | null>(null);
  const [successStatus, setSuccessStatus] = useState<{ message: string; devResetLink?: string; devVerificationLink?: string } | null>(null);
  const [multipleSchools, setMultipleSchools] = useState<Array<{
    id: string;
    name: string;
    logoUrl?: string | null;
    documentNumber?: string;
    city?: string;
  }> | null>(null);
  const [masterCompanySearch, setMasterCompanySearch] = useState('');
  const [multipleAccessOptions, setMultipleAccessOptions] = useState<Array<{
    accountId: string;
    accountType: string;
    role: string;
    roleLabel: string;
    name: string;
    email?: string | null;
    tenant: { id: string; name: string; logoUrl?: string | null };
  }> | null>(null);
  const [multipleBranchOptions, setMultipleBranchOptions] = useState<{
    tenant: { id: string; name: string; logoUrl?: string | null };
    account?: {
      accountId: string;
      accountType: string;
      role?: string;
      roleLabel?: string;
      name?: string;
    } | null;
    branches: Array<{ id: string; branchCode: number; name: string; logoUrl?: string | null }>;
  } | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [cashSessionNotice, setCashSessionNotice] = useState<LoginCashSessionNotice | null>(null);
  const pendingCashSessionContinue = useRef<(() => void) | null>(null);

  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [teacherAccessMode, setTeacherAccessMode] = useState<'AUTO' | 'PRINCIPAL' | 'PWA'>('AUTO');
  const [isProfessorDeviceModalOpen, setIsProfessorDeviceModalOpen] = useState(false);
  const [professorAccessSchoolName, setProfessorAccessSchoolName] = useState('SISTEMA ESCOLAR');
  const [professorAccessSchoolLogoUrl, setProfessorAccessSchoolLogoUrl] = useState<string | null>(null);
  const [pendingProfessorRouteRole, setPendingProfessorRouteRole] = useState<string | null>(null);

  useEffect(() => {
    setRememberMe(getRememberPreference());
    const storedToken = getStoredToken();
    const storedProfile = getStoredSessionProfile();
    if (storedToken && storedProfile) {
      router.replace(getHomeRouteForSession(storedProfile));
    }
  }, [router]);

  // Mágica para o Pop-up de Erro sumir em 5 segundos sozinho
  useEffect(() => {
    if (errorStatus) {
      const timer = setTimeout(() => setErrorStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorStatus]);

  const handleIntermediateAuthStatus = (data: any) => {
    if (data.status === 'MULTIPLE_TENANTS') {
      setMultipleSchools(data.tenants);
      setMasterCompanySearch('');
      return true;
    }

    if (data.status === 'MULTIPLE_ACCOUNTS') {
      setMultipleAccessOptions(data.accounts);
      return true;
    }

    if (data.status === 'MULTIPLE_BRANCHES') {
      setMultipleBranchOptions({
        tenant: data.tenant,
        account: data.account || null,
        branches: Array.isArray(data.branches) ? data.branches : [],
      });
      setMultipleSchools(null);
      setMultipleAccessOptions(null);
      return true;
    }

    if (data.status === 'EMAIL_CONFIRMATION_REQUIRED') {
      setSuccessStatus({
        message: data.message || 'Vamos enviar um e-mail de confirmação para continuar.',
        devVerificationLink: data.devVerificationLink || undefined,
      });
      return true;
    }

    return false;
  };

  const resolveHomeRoute = (
    role: string | null,
    mode: 'AUTO' | 'PRINCIPAL' | 'PWA',
    profile?: Partial<StoredSessionProfile> | null,
  ) => {
    if (profile?.cashierOnly === true) {
      return getHomeRouteForSession(profile, role);
    }

    if (role === 'PROFESSOR') {
      if (mode === 'PRINCIPAL') return '/principal';
      if (mode === 'PWA') return '/professor';
    }

    return getHomeRouteForRole(role);
  };

  const continueAfterCashSessionNotice = () => {
    const onContinue = pendingCashSessionContinue.current;
    pendingCashSessionContinue.current = null;
    setCashSessionNotice(null);
    onContinue?.();
  };

  const continueAfterSuccessfulLogin = (data: LoginResponseData, onContinue: () => void) => {
    const legacyNotice = data?.cashSessionOpened === true
      ? {
          openingAmount: data.cashSessionOpeningAmount,
          openedAutomatically: true,
          cashClosingMode: 'MANUAL',
          openedAt: '',
          cashierDisplayName: null,
          branchLogoUrl: null,
          branchName: null,
          companyName: null,
        }
      : null;
    const notice = data?.cashSessionNotice || legacyNotice;

    if (!notice) {
      onContinue();
      return;
    }

    const openingAmount = Number(notice.openingAmount ?? 0);
    pendingCashSessionContinue.current = onContinue;
    setCashSessionNotice({
      openingAmount: Number.isFinite(openingAmount) ? openingAmount : 0,
      openedAutomatically: notice.openedAutomatically !== false,
      cashClosingMode: String(notice.cashClosingMode || 'MANUAL').trim().toUpperCase(),
      openedAt: String(notice.openedAt || '').trim(),
      cashierDisplayName: String(notice.cashierDisplayName || (data.user as any)?.name || '').trim(),
      branchLogoUrl: notice.branchLogoUrl || null,
      branchName: notice.branchName || null,
      companyName: notice.companyName || null,
    });
  };

  const finishSuccessfulLogin = (data: LoginResponseData, onContinue: () => void) => {
    setStoredSessionProfile(data.user, rememberMe);
    continueAfterSuccessfulLogin(data, onContinue);
  };

  const isMasterLogin = email.trim().toUpperCase() === 'MSINFOR';
  const visibleMasterCompanies = useMemo(() => {
    const term = masterCompanySearch.trim().toLowerCase();
    const termDigits = term.replace(/\D/g, '');
    if (!term) return multipleSchools || [];
    return (multipleSchools || []).filter((company) => {
      const documentDigits = String(company.documentNumber || '').replace(/\D/g, '');
      return [company.name, company.city, company.documentNumber]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)) ||
        Boolean(termDigits && documentDigits.includes(termDigits));
    });
  }, [masterCompanySearch, multipleSchools]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorStatus(null);
    setMultipleBranchOptions(null);

    try {
      const normalizedUser = email.trim().toUpperCase();

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedUser,
          password,
          rememberMe,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Falha na Autenticação');
      }

      if (handleIntermediateAuthStatus(data)) {
        return;
      }

      finishSuccessfulLogin(data, () => {
        router.push(resolveHomeRoute(data?.user?.role || null, teacherAccessMode, data.user));
      });

    } catch (err: any) {
      const errorMsg = normalizeLoginErrorMessage(err.message || 'Erro de conexão com o servidor.');
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
    setMultipleBranchOptions(null);
    try {
      const normalizedUser = email.trim().toUpperCase();
      const passwordToSend = password;
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedUser,
          password: passwordToSend,
          rememberMe,
          tenantId // Agora mandamos o desempate pro backend!
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || 'Falha na Autenticação');

      if (handleIntermediateAuthStatus(data)) {
        return;
      }

      finishSuccessfulLogin(data, () => {
        router.push(resolveHomeRoute(data?.user?.role || null, teacherAccessMode, data.user));
      });
    } catch (err: any) {
      setErrorStatus({ message: normalizeLoginErrorMessage(err.message || 'Erro ao selecionar escola') });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAccessOption = async (option: {
    accountId: string;
    accountType: string;
    role?: string;
    tenant: { id: string; name: string };
  }) => {
    setLoading(true);

    try {
      const normalizedUser = email.trim().toUpperCase();
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedUser,
          password,
          rememberMe,
          tenantId: option.tenant.id,
          accountId: option.accountId,
          accountType: option.accountType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Falha na autenticação');
      }

      if (handleIntermediateAuthStatus(data)) {
        return;
      }

      const resolvedRole = data?.user?.role || option.role || null;

      if (resolvedRole === 'PROFESSOR') {
        const professorAccount = multipleAccessOptions?.find(
          (account) => account.accountId === option.accountId && account.accountType === option.accountType,
        ) || multipleAccessOptions?.find((account) => account.role === 'PROFESSOR');

        setProfessorAccessSchoolName(professorAccount?.tenant?.name || 'SISTEMA ESCOLAR');
        setProfessorAccessSchoolLogoUrl(professorAccount?.tenant?.logoUrl || null);
        setPendingProfessorRouteRole(resolvedRole);
        setMultipleAccessOptions(null);
        setTeacherAccessMode('AUTO');
        finishSuccessfulLogin(data, () => setIsProfessorDeviceModalOpen(true));
        return;
      }

      setMultipleAccessOptions(null);
      finishSuccessfulLogin(data, () => {
        router.push(resolveHomeRoute(resolvedRole, teacherAccessMode, data.user));
      });
    } catch (err: any) {
      setErrorStatus({ message: normalizeLoginErrorMessage(err.message || 'Erro ao selecionar o tipo de acesso.') });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBranch = async (branchCode: number) => {
    if (!multipleBranchOptions?.tenant?.id) return;
    setLoading(true);
    setMultipleBranchOptions(null);

    try {
      const normalizedUser = email.trim().toUpperCase();
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedUser,
          password,
          rememberMe,
          tenantId: multipleBranchOptions.tenant.id,
          accountId: multipleBranchOptions.account?.accountId,
          accountType: multipleBranchOptions.account?.accountType,
          branchCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Falha na autenticação');
      }

      if (handleIntermediateAuthStatus(data)) {
        return;
      }

      setMultipleBranchOptions(null);
      finishSuccessfulLogin(data, () => {
        router.push(resolveHomeRoute(data?.user?.role || null, teacherAccessMode, data.user));
      });
    } catch (err: any) {
      setErrorStatus({ message: normalizeLoginErrorMessage(err.message || 'Erro ao selecionar a filial.') });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setErrorStatus(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.toUpperCase() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Falha ao solicitar recuperação');
      }

      setIsForgotModalOpen(false);
      setSuccessStatus({
        message: data.message || 'Email de recuperação enviado com sucesso!',
        devResetLink: data.devResetLink || undefined,
        devVerificationLink: undefined,
      });
    } catch (err: any) {
      setErrorStatus({ message: normalizeLoginErrorMessage(err.message || 'Erro ao comunicar com o servidor') });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleOpenForgotPasswordModal = () => {
    setForgotEmail(email.trim());
    setIsForgotModalOpen(true);
  };

  const handleCloseForgotPasswordModal = () => {
    setIsForgotModalOpen(false);
    setForgotEmail('');
  };

  const handleOpenCentral = () => {
    window.open('/msinfor-admin', '_blank', 'noopener,noreferrer');
  };

  const handleChooseTeacherDevice = (mode: 'PRINCIPAL' | 'PWA') => {
    setTeacherAccessMode(mode);
    setIsProfessorDeviceModalOpen(false);
    router.push(resolveHomeRoute(pendingProfessorRouteRole, mode));
    setPendingProfessorRouteRole(null);
  };

  return (
    <main className="min-h-screen w-full flex bg-slate-100 font-sans">

      {/* PAINEL ESQUERDO: Intocado conforme o mestre pediu (Mantendo o luxo corporativo) */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden bg-slate-950 flex-col justify-between p-12 shadow-[10px_0_30px_rgba(0,0,0,0.5)] z-10">
        <div className="absolute -top-1/4 -left-1/4 w-full h-full bg-blue-600/20 blur-[150px] mix-blend-screen rounded-full" />
        <div className="absolute -bottom-1/4 -right-1/4 w-full h-full bg-indigo-600/10 blur-[150px] mix-blend-screen rounded-full" />

        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-8 mt-8">

          {/* Logo */}
          <button
            type="button"
            onClick={handleOpenCentral}
            className="shrink-0 bg-white p-2 text-center rounded-full shadow-2xl shadow-blue-500/30 overflow-hidden ring-4 ring-white/10 transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-indigo-300"
            aria-label="Abrir MSINFOR Central"
            title="Abrir MSINFOR Central"
          >
            <img src="/logo-msinfor.jpg" alt="Logo MSINFOR Sistemas" className="w-36 h-36 lg:w-40 lg:h-40 object-contain block" />
          </button>

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
            <form onSubmit={handleLogin} className="w-[85%] flex flex-col items-center translate-y-3">

              {/* Input Usuário */}
              <div className="flex w-full mb-4 shadow-sm bg-white rounded-md overflow-hidden h-11">
                <div className="bg-[#2272c7] w-12 flex items-center justify-center shrink-0">
                  <svg className="w-[22px] h-[22px] text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
                <input
                  type="text"
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
                  className="flex w-12 shrink-0 items-center justify-center border-l border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-[#2272c7]"
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

                  <button type="button" onClick={handleOpenForgotPasswordModal} className="flex items-center gap-1.5 focus:outline-none group">
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

            </form>
          </div>
        </div>
      </div>

      {/* MODAL MÁGICO DE ERRO NO CENTRO DA TELA (POP-UP / TOAST) */}
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
                <h3 className="text-lg font-bold text-slate-800 mb-1">{getLoginErrorTitle(errorStatus.message)}</h3>

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

      {cashSessionNotice && (
        <div
          data-system-message-ignore
          className="fixed inset-0 z-[82] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Caixa aberto"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="bg-gradient-to-br from-green-800 to-green-600 px-6 py-6 text-white">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/60 bg-white p-1 shadow-lg">
                  <img
                    src={cashSessionNotice.branchLogoUrl || '/logo-msinfor.jpg'}
                    alt={`Logotipo de ${cashSessionNotice.branchName || cashSessionNotice.companyName || 'empresa'}`}
                    className="h-full w-full object-contain"
                    onError={(event) => {
                      if (event.currentTarget.src.endsWith('/logo-msinfor.jpg')) return;
                      event.currentTarget.src = '/logo-msinfor.jpg';
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1 text-center">
                  <h2 className="text-center text-xl font-extrabold">
                    {cashSessionNotice.openedAutomatically ? 'CAIXA ABERTO' : 'CAIXA JÁ ABERTO'}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-green-100">
                    {cashSessionNotice.openedAutomatically ? 'ABERTO AUTOMATICAMENTE EM' : 'ABERTO EM'}
                  </p>
                  <div className="mt-1 text-sm font-extrabold text-white">
                    {formatCashSessionOpenedAt(cashSessionNotice.openedAt)}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-6">
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                <div className="text-xs font-extrabold uppercase tracking-[0.08em] text-green-700">
                  USUÁRIO CAIXA
                </div>
                <div className="mt-1 text-lg font-extrabold text-green-900">
                  {cashSessionNotice.cashierDisplayName || 'NÃO INFORMADO'}
                </div>
                <div className="mt-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-green-700">
                  MODELO DE FECHAMENTO
                </div>
                <div className="mt-1 text-xs font-extrabold text-green-900">
                  {formatCashClosingMode(cashSessionNotice.cashClosingMode)}
                </div>
                {cashSessionNotice.companyName || cashSessionNotice.branchName ? (
                  <div className="mt-1 text-xs font-bold text-green-700">
                    {[cashSessionNotice.companyName, cashSessionNotice.branchName]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                ) : null}
              </div>

              <div>
                <div className="text-sm font-bold text-slate-500">VALOR INICIAL DO CAIXA</div>
                <div className="mt-1 text-3xl font-extrabold text-green-700">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                    cashSessionNotice.openingAmount,
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={continueAfterCashSessionNotice}
                className="w-full rounded-xl bg-green-600 py-3 font-bold text-white shadow-md transition-colors hover:bg-green-700"
              >
                CONTINUAR PARA O SISTEMA
              </button>

              <div className="border-t border-slate-100 pt-3">
                <ScreenNameCopy
                  screenId={CASH_SESSION_NOTICE_SCREEN_ID}
                  label="Popup"
                  disableMargin
                  compact
                  className="w-full"
                  originText="Origem: Sistema Escola - caminho físico: C:\\Sistemas\\IA\\Escola\\frontend\\src\\app\\page.tsx"
                  auditText="Popup exibido após o login para informar a abertura ou a existência do caixa do operador, com empresa, filial, usuário responsável, modelo de fechamento, valor inicial e data/hora de abertura recebidos do Financeiro autenticado."
                  sqlText="A tela não consulta o banco diretamente. O backend da Escola consulta o Financeiro com contexto HMAC assinado e entrega somente os campos operacionais necessários ao login."
                />
              </div>
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

                {(successStatus.devResetLink || successStatus.devVerificationLink) && (
                  <div className="mt-3 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-left shadow-inner">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                      Link local de apoio
                    </p>
                    <a
                      href={successStatus.devResetLink || successStatus.devVerificationLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all text-xs font-semibold leading-5 text-[#2272c7] hover:text-[#1a5592] hover:underline"
                    >
                      {successStatus.devResetLink || successStatus.devVerificationLink}
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
         <div data-system-message-ignore className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200 p-4">
           <div className={`bg-white rounded-3xl shadow-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200 ${isMasterLogin ? 'max-w-5xl' : 'max-w-md'}`}>
            <div className="relative bg-[#2272c7] px-6 pb-6 pt-20 text-center sm:pt-6">
              <button
                type="button"
                onClick={() => setMultipleSchools(null)}
                aria-label="Voltar ao login"
                className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#183b73] shadow-[0_10px_20px_rgba(15,23,42,0.18)] transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Voltar ao login
              </button>
              <div className="w-16 h-16 overflow-hidden rounded-full bg-white p-1 mx-auto mb-3 border border-white/50 shadow-lg">
                <img
                  src="/logo-msinfor.jpg"
                  alt="Logotipo MSINFOR Sistemas"
                  className="h-full w-full rounded-full object-contain"
                />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">{isMasterLogin ? 'Empresas disponíveis' : 'Múltiplos Vínculos'}</h2>
              <p className="text-blue-100 text-sm font-medium opacity-90">
                {isMasterLogin
                  ? 'Selecione a empresa que deseja acessar com o usuário MSINFOR.'
                  : 'Seu usuário de acesso está associado a mais de uma instituição. Selecione onde deseja entrar:'}
              </p>
            </div>

            <div className="p-6">
              {isMasterLogin ? (
                <div className="space-y-4">
                  <input
                    value={masterCompanySearch}
                    onChange={(event) => setMasterCompanySearch(event.target.value)}
                    placeholder="Pesquisar por empresa ou CNPJ"
                    autoFocus
                    className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#2272c7] focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                  <div className="max-h-[48vh] overflow-auto rounded-2xl border border-slate-200">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="sticky top-0 bg-slate-100 text-xs font-black uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="w-20 px-4 py-4 text-center">Selecionar</th>
                          <th className="px-5 py-4">Empresa</th>
                          <th className="px-5 py-4">CNPJ</th>
                          <th className="px-5 py-4">Cidade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleMasterCompanies.map((company) => (
                          <tr key={company.id} className="bg-white transition hover:bg-blue-50/70">
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleSelectSchool(company.id)}
                                disabled={loading}
                                aria-label={`Selecionar empresa ${company.name}`}
                                title={`Selecionar ${company.name}`}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M5 12.5 9.5 17 19 7.5" />
                                </svg>
                                <span className="sr-only">Selecionar empresa</span>
                              </button>
                            </td>
                            <td className="px-5 py-3 font-bold text-slate-800">
                              <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-xs font-black text-[#2272c7] shadow-sm">
                                  {company.logoUrl ? (
                                    <img
                                      src={company.logoUrl}
                                      alt={`Logotipo de ${company.name}`}
                                      className="h-full w-full object-contain p-1"
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  ) : (
                                    <span>{company.name.substring(0, 2).toUpperCase()}</span>
                                  )}
                                </div>
                                <span>{company.name}</span>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-slate-600">{company.documentNumber || 'Não informado'}</td>
                            <td className="px-5 py-4 text-slate-600">{company.city || 'Não informada'}</td>
                          </tr>
                        ))}
                        {!visibleMasterCompanies.length && (
                          <tr>
                            <td colSpan={4} className="px-5 py-10 text-center font-semibold text-slate-500">
                              Nenhuma empresa encontrada.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
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
              )}

              <div className="mt-6 border-t border-slate-100 pt-4">
                <div>
                  <ScreenNameCopy
                    screenId={SCHOOL_SELECTION_SCREEN_ID}
                    label="Popup"
                    disableMargin
                    compact
                    className="w-full"
                    originText="Origem: Sistema Escola - caminho físico: C:\\Sistemas\\IA\\Escola\\frontend\\src\\app\\page.tsx"
                    auditText="Popup de seleção de empresa exibido após a autenticação MSINFOR quando existem múltiplos vínculos. A seleção apenas define o tenant global que será reenviado ao endpoint de login para concluir a sessão."
                    sqlText="A consulta das empresas é preparada pelo MSINFOR Central. O sistema Escola não consulta o banco de outra escola e não permite escolher tenant fora da lista retornada pela autenticação."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {multipleAccessOptions && (
        <div data-system-message-ignore className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-[#2272c7] p-6 text-center">
              <div className="w-16 h-16 bg-white/20 text-white rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm border border-white/30 shadow-inner">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Escolha Como Entrar</h2>
              <p className="text-blue-100 text-sm font-medium opacity-90">
                Este usuário de acesso está cadastrado em mais de um tipo de acesso. Selecione qual perfil deseja usar agora.
              </p>
            </div>

            <div className="p-6">
              <div className="space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
                {multipleAccessOptions.map((option) => {
                  const theme = getAccessOptionTheme(option.accountType, option.role);

                  return (
                    <button
                      key={`${option.accountType}-${option.accountId}`}
                      onClick={() => handleSelectAccessOption(option)}
                      className={`group w-full rounded-2xl border p-4 text-left transition-all active:scale-[0.99] ${theme.card}`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-full shadow-sm ${theme.avatar}`}>
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
                        <svg className={`w-5 h-5 shrink-0 text-slate-300 transition-colors ${theme.arrow}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>

                      <div className={`mt-3 rounded-xl border px-4 py-3 ${theme.detail}`}>
                        <div className="text-sm font-bold text-slate-700">{option.name}</div>
                        <div className={`mt-1 text-xs font-medium uppercase tracking-[0.12em] ${theme.label}`}>
                          Tipo de cadastro: {getAccountTypeLabel(option.accountType)}
                        </div>
                      </div>
                    </button>
                  );
                })}
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

       {multipleBranchOptions && (
         <div data-system-message-ignore className="fixed inset-0 z-[66] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200 p-4">
           <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="relative bg-[#2272c7] px-6 pb-6 pt-6 text-center">
               <div className="w-16 h-16 overflow-hidden rounded-full bg-white p-1 mx-auto mb-3 border border-white/50 shadow-lg">
                <img
                  src="/logo-msinfor.jpg"
                  alt="Logotipo MSINFOR Sistemas"
                  className="h-full w-full rounded-full object-contain"
                />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Escolha a Filial</h2>
               <p className="text-blue-100 text-sm font-medium opacity-90">
                 {multipleBranchOptions.tenant.name}
               </p>
               <button
                 type="button"
                 onClick={() => setMultipleBranchOptions(null)}
                 aria-label="Voltar ao login"
                 className="mx-auto mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#183b73] shadow-[0_10px_20px_rgba(15,23,42,0.22)] transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
               >
                 <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                   <path d="m15 18-6-6 6-6" />
                 </svg>
                 Voltar ao login
               </button>
             </div>

            <div className="p-6">
              <div className="space-y-3 max-h-[45vh] overflow-y-auto custom-scrollbar pr-1">
                {multipleBranchOptions.branches.map((branch) => (
                  <button
                    key={branch.id}
                    onClick={() => handleSelectBranch(branch.branchCode)}
                    className="w-full flex items-center justify-between gap-3 p-4 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl transition-all group active:scale-95"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                        {branch.logoUrl ? (
                          <img
                            src={branch.logoUrl}
                            alt={`Logotipo da filial ${branch.name}`}
                            className="h-full w-full object-contain p-1"
                          />
                        ) : (
                          <svg className="w-6 h-6 text-[#2272c7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9h.01M9 13h.01M9 17h.01M15 13h.01M15 17h.01" />
                          </svg>
                        )}
                      </div>
                      <div className="text-left min-w-0">
                        <div className="text-base font-extrabold text-slate-800">
                          {branch.branchCode} - {branch.name}
                        </div>
                        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">
                          Filial liberada
                        </div>
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-slate-300 group-hover:text-[#2272c7] transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <ScreenNameCopy
                  screenId={BRANCH_SELECTION_SCREEN_ID}
                  label="Popup"
                  disableMargin
                  compact
                  className="w-full"
                  originText="Origem: Sistema Escola - caminho físico: C:\\Sistemas\\IA\\Escola\\frontend\\src\\app\\page.tsx"
                  auditText="Popup de seleção de filial apresentado após a autenticação quando o acesso possui mais de uma filial liberada. A escolha é reenviada ao backend para concluir a sessão no tenant e na filial autorizados."
                  sqlText="A lista de filiais vem da configuração ativa do MSINFOR Central e é filtrada pelo vínculo do usuário. O sistema Escola não permite selecionar filial fora dos códigos autorizados."
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {isProfessorDeviceModalOpen && (
        <div data-system-message-ignore className="fixed inset-0 z-[66] flex items-center justify-center bg-black/65 backdrop-blur-md animate-in fade-in duration-200 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-[#2272c7] p-6 text-center">
              <div className="w-16 h-16 bg-white/20 text-white rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm border border-white/30 shadow-inner overflow-hidden">
                {professorAccessSchoolLogoUrl ? (
                  <img
                    src={professorAccessSchoolLogoUrl}
                    alt={`Logotipo de ${professorAccessSchoolName}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                )}
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-blue-100/90 font-bold">
                {professorAccessSchoolName}
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Como você está acessando?</h2>
              <p className="text-blue-100 text-sm font-medium opacity-90">
                Escolha se este acesso ao perfil de professor será pelo celular ou pelo computador.
              </p>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => handleChooseTeacherDevice('PWA')}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition-all hover:border-blue-300 hover:bg-blue-50 active:scale-[0.99]"
                >
                  <div className="text-base font-extrabold text-slate-800">Celular</div>
                  <div className="mt-1 text-sm font-medium text-slate-600">Abrir Sistema no Celular.</div>
                </button>

                <button
                  onClick={() => handleChooseTeacherDevice('PRINCIPAL')}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition-all hover:border-blue-300 hover:bg-blue-50 active:scale-[0.99]"
                >
                  <div className="text-base font-extrabold text-slate-800">Computador</div>
                  <div className="mt-1 text-sm font-medium text-slate-600">Abre o programa completo.</div>
                </button>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <button
                  onClick={() => {
                    setIsProfessorDeviceModalOpen(false);
                    setTeacherAccessMode('AUTO');
                    setPendingProfessorRouteRole(null);
                  }}
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
                  onClick={handleCloseForgotPasswordModal}
                  className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                  title="Fechar"
                >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              <div className="w-14 h-14 bg-slate-800 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-3 border border-slate-700 shadow-inner">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Recuperar Senha</h2>
              <p className="text-slate-400 text-sm font-medium">Enviaremos um link de acesso</p>
            </div>

            <div className="p-6">
              <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
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
            </div>
          </div>
        </div>
      )}
    </main>
  );
}








