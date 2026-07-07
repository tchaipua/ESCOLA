'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { clearStoredSession, getStoredToken } from '@/app/lib/auth-storage';
import { CASHIER_ONLY_HOME_ROUTE, getDashboardAuthContext, hasAllDashboardPermissions, hasAnyDashboardPermission, hasDashboardPermission } from '@/app/lib/dashboard-crud-utils';
import { cacheTenantBranding } from '@/app/lib/tenant-branding-cache';
import { PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS } from '@/app/components/principal-program-header';
import ScreenNameCopy from '@/app/components/screen-name-copy';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

type CurrentTenant = {
    id: string;
    name: string;
    logoUrl?: string | null;
};

type UnreadNotificationSummary = {
    count: number;
    preview: Array<{
        id: string;
        title: string;
        createdAt: string;
    }>;
};

type CurrentBranchSummary = {
    branchCode: number;
    name: string;
    isActive?: boolean;
    isShared?: boolean;
};

type NavItem = {
    href: string;
    label: string;
    allowWhen: boolean;
    icon: React.ReactNode;
    requiresDashboardBase?: boolean;
    showAfterDashboardBase?: boolean;
};

type ChangePasswordErrorVariant = 'blank' | 'mismatch' | 'invalid-current' | 'generic';

type ScreenAuditOverride = {
    screenId: string;
    originText?: string;
    auditText?: string;
    sqlText?: string;
};

type EmbeddedScreenContextMessage = {
    type?: string;
    screenId?: string;
    originText?: unknown;
    auditText?: unknown;
    sqlText?: unknown;
};

function normalizeScreenContextText(value: unknown) {
    if (typeof value !== 'string') return undefined;

    const text = value.trim();
    return text ? text.slice(0, 30000) : undefined;
}

function parseCssColor(value: string) {
    const match = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/i);
    if (!match) return null;

    return {
        red: Number(match[1]),
        green: Number(match[2]),
        blue: Number(match[3]),
        alpha: match[4] ? Number(match[4]) : 1,
    };
}

function isBackdropLikeElement(element: HTMLElement) {
    const styles = window.getComputedStyle(element);
    if (styles.position !== 'fixed' || styles.display === 'none' || styles.visibility === 'hidden') {
        return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < window.innerWidth * 0.95 || rect.height < window.innerHeight * 0.95) {
        return false;
    }

    const background = parseCssColor(styles.backgroundColor);
    if (!background) return false;

    const isDarkBackdrop = background.alpha >= 0.2 && background.red < 80 && background.green < 80 && background.blue < 80;
    return isDarkBackdrop;
}

function hasVisibleDialogContent(element: HTMLElement) {
    const descendants = [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))];

    return descendants.some((node) => {
        const styles = window.getComputedStyle(node);
        if (styles.display === 'none' || styles.visibility === 'hidden' || Number(styles.opacity || '1') === 0) {
            return false;
        }

        const rect = node.getBoundingClientRect();
        if (rect.width < 180 || rect.height < 80) {
            return false;
        }

        const background = parseCssColor(styles.backgroundColor);
        if (!background) return false;

        const isPanelLike = background.alpha >= 0.85 && background.red >= 230 && background.green >= 230 && background.blue >= 230;
        return isPanelLike;
    });
}

function clearOrphanBackdrops() {
    const elements = Array.from(document.body.querySelectorAll<HTMLElement>('div'));

    elements.forEach((element) => {
        if (element.dataset.codexBackdropGuard === 'ignore') return;
        if (!isBackdropLikeElement(element)) return;
        if (hasVisibleDialogContent(element)) return;

        element.style.display = 'none';
        element.style.pointerEvents = 'none';
        element.dataset.codexBackdropGuard = 'ignore';
    });
}

function deriveScreenContextLabel(pathnameValue: string | null) {
    if (!pathnameValue) return 'PRINCIPAL_ROOT';
    const segments = pathnameValue.split('/').filter(Boolean);
    if (!segments.length) return 'PRINCIPAL_ROOT';
    const label = segments
        .map((segment) =>
            segment
                .replace(/\[(.*?)\]/g, '$1')
                .replace(/[^a-z0-9]+/gi, '_')
                .replace(/_+/g, '_')
                .trim(),
        )
        .filter(Boolean)
        .join('_')
        .toUpperCase();
    return label || 'PRINCIPAL_ROOT';
}

function normalizeDisplayText(value: string | null | undefined) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;

    if (!/[ÃÂâ]/.test(trimmed)) {
        return trimmed;
    }

    try {
        return decodeURIComponent(escape(trimmed));
    } catch {
        return trimmed;
    }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [isSidebarOpen, setSidebarOpen] = useState(true);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [isCashierOnlyAccess, setIsCashierOnlyAccess] = useState(false);
    const [currentUserName, setCurrentUserName] = useState<string | null>(null);
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
    const [currentTenant, setCurrentTenant] = useState<CurrentTenant | null>(null);
    const [currentBranchFooterLabel, setCurrentBranchFooterLabel] = useState<string | null>(null);
    const [unreadSummary, setUnreadSummary] = useState<UnreadNotificationSummary | null>(null);
    const [embeddedScreenContextLabel, setEmbeddedScreenContextLabel] = useState<string | null>(null);
    const [screenAuditOverride, setScreenAuditOverride] = useState<ScreenAuditOverride | null>(null);
    const [isUserMenuOpen, setUserMenuOpen] = useState(false);
    const [isExitConfirmationOpen, setIsExitConfirmationOpen] = useState(false);
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
    const [changePasswordStatus, setChangePasswordStatus] = useState<string | null>(null);
    const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
    const [changePasswordErrorVariant, setChangePasswordErrorVariant] = useState<ChangePasswordErrorVariant | null>(null);
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [changePasswordAlertType, setChangePasswordAlertType] = useState<'error' | 'success' | null>(null);
    const userMenuRef = useRef<HTMLDivElement>(null);
    const hasInvalidatedSessionRef = useRef(false);
    const EXIT_CONFIRMATION_SCREEN_ID = 'PRINCIPAL_SOMENTE_CAIXA_SAIR_SISTEMA';
    const CHANGE_PASSWORD_SCREEN_ID = 'PRINCIPAL_MENU_ALTERAR_SENHA_EMAIL_GERAL';

    const isPersonalRole = currentRole === 'PROFESSOR' || currentRole === 'ALUNO' || currentRole === 'RESPONSAVEL';

    const getRoleLabel = (role: string | null) => {
        switch (role) {
            case 'SOFTHOUSE_ADMIN':
                return 'Master MSINFOR';
            case 'ADMIN':
                return 'Administrador';
            case 'SECRETARIA':
                return 'Secretaria';
            case 'COORDENACAO':
                return 'Coordenação';
            case 'PROFESSOR':
                return 'Professor';
            case 'ALUNO':
                return 'Aluno';
            case 'RESPONSAVEL':
                return 'Responsável';
            default:
                return 'Perfil';
        }
    };

    const getRoleInitials = (role: string | null) => {
        switch (role) {
            case 'SOFTHOUSE_ADMIN':
                return 'MS';
            case 'ADMIN':
                return 'AD';
            case 'SECRETARIA':
                return 'SC';
            case 'COORDENACAO':
                return 'CD';
            case 'PROFESSOR':
                return 'PR';
            case 'ALUNO':
                return 'AL';
            case 'RESPONSAVEL':
                return 'RP';
            default:
                return 'PF';
        }
    };

    const invalidateSession = useCallback(() => {
        if (hasInvalidatedSessionRef.current) return;
        hasInvalidatedSessionRef.current = true;
        clearStoredSession();
        setCurrentRole(null);
        setCurrentPermissions([]);
        setIsCashierOnlyAccess(false);
        setCurrentUserName(null);
        setCurrentUserEmail(null);
        setCurrentTenant(null);
        setCurrentBranchFooterLabel(null);
        setUnreadSummary(null);
        setIsExitConfirmationOpen(false);
        router.replace('/');
    }, [router]);

    useEffect(() => {
        const token = getStoredToken();
        if (!token) {
            router.replace('/');
            return;
        }

        hasInvalidatedSessionRef.current = false;

        const { role, permissions, name, cashierOnly } = getDashboardAuthContext();
        setCurrentRole(role);
        setCurrentPermissions(permissions);
        setIsCashierOnlyAccess(cashierOnly);
        setCurrentUserName(normalizeDisplayText(name));
    }, [router]);

    useEffect(() => {
        const { token, cashierOnly } = getDashboardAuthContext();
        if (!token || !cashierOnly) return;
        if (pathname !== CASHIER_ONLY_HOME_ROUTE) {
            router.replace(CASHIER_ONLY_HOME_ROUTE);
        }
    }, [pathname, router]);

    useEffect(() => {
        setEmbeddedScreenContextLabel(null);
        setScreenAuditOverride(null);
    }, [pathname]);

    useEffect(() => {
        if (pathname === '/principal/financeiro/parcelas') {
            setSidebarOpen(true);
        }
    }, [pathname]);

    useEffect(() => {
        const handleEmbeddedScreenContext = (event: MessageEvent) => {
            const data = event.data as EmbeddedScreenContextMessage | null;
            if (!data || typeof data !== 'object' || data.type !== 'MSINFOR_SCREEN_CONTEXT') return;

            const screenId = String(data.screenId || '')
                .replace(/[^A-Z0-9_]/gi, '_')
                .replace(/_+/g, '_')
                .toUpperCase()
                .slice(0, 120);

            if (screenId) {
                setEmbeddedScreenContextLabel(screenId);

                const originText = normalizeScreenContextText(data.originText);
                const auditText = normalizeScreenContextText(data.auditText);
                const sqlText = normalizeScreenContextText(data.sqlText);

                if (originText || auditText || sqlText) {
                    setScreenAuditOverride({
                        screenId,
                        originText,
                        auditText,
                        sqlText,
                    });
                    return;
                }
            }

            setScreenAuditOverride(null);
        };

        window.addEventListener('message', handleEmbeddedScreenContext);
        return () => window.removeEventListener('message', handleEmbeddedScreenContext);
    }, []);

    useEffect(() => {
        const handleScreenAuditContext = (event: Event) => {
            const detail = (event as CustomEvent<Partial<ScreenAuditOverride>>).detail;
            if (!detail) return;

            const screenId = String(detail.screenId || '')
                .replace(/[^A-Z0-9_]/gi, '_')
                .replace(/_+/g, '_')
                .toUpperCase()
                .slice(0, 120);

            if (!screenId) return;

            if (!detail.auditText && !detail.sqlText && !detail.originText) {
                setScreenAuditOverride((current) => (current?.screenId === screenId ? null : current));
                return;
            }

            setScreenAuditOverride({
                screenId,
                originText: detail.originText,
                auditText: detail.auditText,
                sqlText: detail.sqlText,
            });
        };

        window.addEventListener('MSINFOR_SCREEN_AUDIT_CONTEXT', handleScreenAuditContext);
        return () => window.removeEventListener('MSINFOR_SCREEN_AUDIT_CONTEXT', handleScreenAuditContext);
    }, []);

    useEffect(() => {
        const handleFinanceiroToggleSidebar = () => {
            setSidebarOpen((current) => !current);
        };

        const handleFinanceiroOpenNotifications = () => {
            if (getDashboardAuthContext().cashierOnly) return;
            router.push('/principal/notificacoes');
        };

        const handleFinanceiroToggleUserMenu = () => {
            setUserMenuOpen((current) => !current);
        };

        window.addEventListener('msinfor-financeiro-toggle-sidebar', handleFinanceiroToggleSidebar as EventListener);
        window.addEventListener('msinfor-financeiro-open-notifications', handleFinanceiroOpenNotifications as EventListener);
        window.addEventListener('msinfor-financeiro-toggle-user-menu', handleFinanceiroToggleUserMenu as EventListener);

        return () => {
            window.removeEventListener('msinfor-financeiro-toggle-sidebar', handleFinanceiroToggleSidebar as EventListener);
            window.removeEventListener('msinfor-financeiro-open-notifications', handleFinanceiroOpenNotifications as EventListener);
            window.removeEventListener('msinfor-financeiro-toggle-user-menu', handleFinanceiroToggleUserMenu as EventListener);
        };
    }, [router]);

    useEffect(() => {
        const loadCurrentUserEmail = async () => {
            try {
                const { token } = getDashboardAuthContext();
                if (!token) {
                    setCurrentUserEmail(null);
                    return;
                }

                const response = await fetch(`${API_BASE_URL}/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                const data = await response.json().catch(() => null);
                if (response.status === 401) {
                    invalidateSession();
                    return;
                }

                if (!response.ok) {
                    throw new Error(data?.message || 'Não foi possível carregar o e-mail do usuário.');
                }

                setCurrentUserEmail(typeof data?.email === 'string' && data.email.trim() ? data.email.trim().toUpperCase() : null);
            } catch {
                setCurrentUserEmail(null);
            }
        };

        void loadCurrentUserEmail();
    }, [invalidateSession]);

    useEffect(() => {
        const loadCurrentTenant = async () => {
            try {
                const { token } = getDashboardAuthContext();
                if (!token) return;

                const response = await fetch(`${API_BASE_URL}/tenants/current`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                const data = await response.json().catch(() => null);
                if (response.status === 401) {
                    invalidateSession();
                    return;
                }

                if (!response.ok) {
                    throw new Error(data?.message || 'Não foi possível carregar a escola logada.');
                }

                setCurrentTenant(data);
                cacheTenantBranding({
                    tenantId: data.id,
                    schoolName: data.name,
                    logoUrl: data.logoUrl || null,
                });
            } catch {
                setCurrentTenant(null);
            }
        };

        void loadCurrentTenant();
    }, [invalidateSession]);

    useEffect(() => {
        const loadCurrentBranchFooter = async () => {
            try {
                const { token, branchCode } = getDashboardAuthContext();
                if (!token) {
                    setCurrentBranchFooterLabel(null);
                    return;
                }

                const response = await fetch(`${API_BASE_URL}/tenants/current/branches`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                const data = await response.json().catch(() => null);
                if (response.status === 401) {
                    invalidateSession();
                    return;
                }

                if (!response.ok || !Array.isArray(data)) {
                    throw new Error(data?.message || 'Não foi possível carregar as filiais da escola.');
                }

                const branches = (data as CurrentBranchSummary[]).filter(
                    (branch) => branch && branch.isActive !== false && !branch.isShared,
                );
                if (branches.length <= 1) {
                    setCurrentBranchFooterLabel(null);
                    return;
                }

                const currentBranch =
                    branches.find((branch) => branch.branchCode === branchCode) || null;
                const branchName = normalizeDisplayText(currentBranch?.name) || `FILIAL ${branchCode}`;
                setCurrentBranchFooterLabel(branchName.toUpperCase());
            } catch {
                setCurrentBranchFooterLabel(null);
            }
        };

        void loadCurrentBranchFooter();
    }, [invalidateSession]);

    useEffect(() => {
        const loadUnreadNotifications = async () => {
            try {
                const { token, userId } = getDashboardAuthContext();
                if (!token || !userId) {
                    setUnreadSummary(null);
                    return;
                }

                const response = await fetch(`${API_BASE_URL}/notifications/my/unread-summary`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                const data = await response.json().catch(() => null);
                if (response.status === 401) {
                    invalidateSession();
                    return;
                }

                if (!response.ok) {
                    throw new Error(data?.message || 'Não foi possível carregar o resumo de notificações.');
                }

                setUnreadSummary(data);
            } catch {
                setUnreadSummary(null);
            }
        };

        void loadUnreadNotifications();
        const handleNotificationsUpdated = () => {
            void loadUnreadNotifications();
        };

        window.addEventListener('notifications-updated', handleNotificationsUpdated);
        return () => window.removeEventListener('notifications-updated', handleNotificationsUpdated);
    }, [invalidateSession, pathname]);

    useEffect(() => {
        if (!isUserMenuOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setUserMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isUserMenuOpen]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsExitConfirmationOpen(false);
                setIsChangePasswordOpen(false);
                setChangePasswordAlertType(null);
                setChangePasswordError(null);
                setChangePasswordErrorVariant(null);
                setChangePasswordStatus(null);
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (isExitConfirmationOpen || isChangePasswordOpen || changePasswordAlertType) return;

        const cleanupTimers: number[] = [];
        const scheduleCleanup = () => {
            clearOrphanBackdrops();
        };

        const frameId = window.requestAnimationFrame(scheduleCleanup);
        [120, 400, 1200].forEach((delay) => {
            cleanupTimers.push(window.setTimeout(scheduleCleanup, delay));
        });

        return () => {
            cancelAnimationFrame(frameId);
            cleanupTimers.forEach((timerId) => {
                window.clearTimeout(timerId);
            });
        };
    }, [pathname, isExitConfirmationOpen, isChangePasswordOpen, changePasswordAlertType]);

    const handleLogout = () => {
        setIsExitConfirmationOpen(false);
        clearStoredSession();
        router.push('/');
    };

    const handleBackNavigation = () => {
        if (isCashierOnlyAccess) {
            setUserMenuOpen(false);
            setIsExitConfirmationOpen(true);
            return;
        }

        router.back();
    };

    const handleUserMenuLogout = () => {
        setUserMenuOpen(false);
        if (isCashierOnlyAccess) {
            setIsExitConfirmationOpen(true);
            return;
        }
        handleLogout();
    };

    const handleOpenChangePassword = () => {
        setUserMenuOpen(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setShowConfirmNewPassword(false);
        setChangePasswordStatus(null);
        setChangePasswordError(null);
        setChangePasswordErrorVariant(null);
        setChangePasswordAlertType(null);
        setIsChangePasswordOpen(true);
    };

    const closeChangePassword = () => {
        setIsChangePasswordOpen(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setChangePasswordStatus(null);
        setChangePasswordError(null);
        setChangePasswordErrorVariant(null);
        setChangePasswordAlertType(null);
        setIsChangingPassword(false);
    };

    const handleSubmitChangePassword = async () => {
        setChangePasswordError(null);
        setChangePasswordStatus(null);
        setChangePasswordErrorVariant(null);
        setChangePasswordAlertType(null);

        const normalizedCurrentPassword = currentPassword.trim();
        const normalizedNewPassword = newPassword.trim();
        const normalizedConfirmNewPassword = confirmNewPassword.trim();

        const { token } = getDashboardAuthContext();
        if (!token) {
            setChangePasswordError('TOKEN DE AUTENTICAÇÃO AUSENTE.');
            setChangePasswordErrorVariant('generic');
            setChangePasswordAlertType('error');
            return;
        }

        if (!normalizedCurrentPassword) {
            setChangePasswordError('INFORME A SENHA ATUAL.');
            setChangePasswordErrorVariant('generic');
            setChangePasswordAlertType('error');
            return;
        }

        try {
            setIsChangingPassword(true);
            const confirmResponse = await fetch(`${API_BASE_URL}/auth/confirm-shared-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    password: normalizedCurrentPassword,
                }),
            });

            const confirmPayload = await confirmResponse.json().catch(() => null);
            if (!confirmResponse.ok) {
                const rawMessage = Array.isArray(confirmPayload?.message)
                    ? String(confirmPayload.message[0])
                    : String(confirmPayload?.message || 'NÃO FOI POSSÍVEL VALIDAR A SENHA ATUAL.');
                throw new Error(rawMessage);
            }

            if (!normalizedNewPassword) {
                setChangePasswordError('NOVA SENHA INFORMADA EM BRANCO');
                setChangePasswordErrorVariant('blank');
                setChangePasswordAlertType('error');
                return;
            }

            if (normalizedNewPassword !== normalizedConfirmNewPassword) {
                setChangePasswordError('SENHAS INFORMADAS DIFERENTES');
                setChangePasswordErrorVariant('mismatch');
                setChangePasswordAlertType('error');
                return;
            }

            const response = await fetch(`${API_BASE_URL}/auth/change-shared-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    currentPassword: normalizedCurrentPassword,
                    newPassword: normalizedNewPassword,
                }),
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                const rawMessage = Array.isArray(payload?.message)
                    ? String(payload.message[0])
                    : String(payload?.message || 'NÃO FOI POSSÍVEL ALTERAR A SENHA.');
                throw new Error(rawMessage);
            }

            setChangePasswordStatus('SENHA ALTERADA E SINCRONIZADA COM SUCESSO.');
            setChangePasswordAlertType('success');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmNewPassword('');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'NÃO FOI POSSÍVEL ALTERAR A SENHA.';
            const normalizedErrorMessage = errorMessage.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
            setChangePasswordError(errorMessage);
            setChangePasswordErrorVariant(normalizedErrorMessage.includes('SENHA INVALIDA') ? 'invalid-current' : 'generic');
            setChangePasswordAlertType('error');
        } finally {
            setIsChangingPassword(false);
        }
    };

    const renderChangePasswordErrorMessage = () => {
        if (changePasswordErrorVariant === 'invalid-current') {
            return (
                <>
                    <div>SENHA ATUAL</div>
                    <div>INFORMADA INVÁLIDA !!!</div>
                </>
            );
        }

        return <div>{changePasswordError}</div>;
    };

    const userDisplayName = currentUserName || 'USUÁRIO DO SISTEMA';
    const userInitials = useMemo(() => {
        if (currentUserName) {
            const initials = currentUserName
                .split(' ')
                .filter((token) => token)
                .slice(0, 2)
                .map((token) => token.charAt(0).toUpperCase())
                .join('');

            return initials || getRoleInitials(currentRole);
        }

        return getRoleInitials(currentRole);
    }, [currentUserName, currentRole]);

    const navItems: NavItem[] = [
        {
            href: '/principal',
            label: 'Menu Principal',
            allowWhen: true,
            icon: (
                <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                </svg>
            ),
        },
        {
            href: '/principal/dashboard',
            label: 'Menu DashBoard',
            allowWhen: true,
            showAfterDashboardBase: true,
            icon: (
                <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v16H4z" />
                </svg>
            ),
        },
        {
            href: '/principal/dashboard/resumo',
            label: 'Resumo geral',
            allowWhen: true,
            requiresDashboardBase: true,
            icon: (
                <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6h6v6m2 0h2a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2h2m10 0v-2a2 2 0 00-2-2H7a2 2 0 00-2 2v2" />
                </svg>
            ),
        },
        {
            href: '/principal/dashboard/resumo-por-serie',
            label: 'Resumo por série',
            allowWhen: true,
            requiresDashboardBase: true,
            icon: (
                <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 5h12M6 12h9M6 19h12M4 5h.01M4 12h.01M4 19h.01" />
                </svg>
            ),
        },
        {
            href: '/principal/dashboard/resumo-por-turma',
            label: 'Resumo por turma',
            allowWhen: true,
            requiresDashboardBase: true,
            icon: (
                <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h6m-9 6h12M4 18h1m2-12h1m2 0h1M4 12h1M18 12h1" />
                </svg>
            ),
        },
        {
            href: '/principal/dashboard/resumo-por-periodo',
            label: 'Resumo por período',
            allowWhen: true,
            requiresDashboardBase: true,
            icon: (
                <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8V4m-4 4v-2m8 2V4m-4 12v4m-4-4v2m8-2v2M8 12H4m4 0H4m16 0h-4m4 0h-4" />
                </svg>
            ),
        },
        {
            href: '/principal/dashboard/resumo-professor-aulas',
            label: 'Resumo Semanal Professor x Aulas',
            allowWhen: true,
            requiresDashboardBase: true,
            icon: (
                <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8a4 4 0 100-8 4 4 0 000 8zm-6 16a6 6 0 0112 0H6z" />
                </svg>
            ),
        },
        {
            href: '/principal/notificacoes',
            label: 'Notificações',
            allowWhen: true,
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
            ),
        },
        {
            href: '/principal/pessoas',
            label: 'Pessoas',
            allowWhen:
                currentRole === 'SOFTHOUSE_ADMIN' ||
                currentRole === 'ADMIN' ||
                currentRole === 'SECRETARIA' ||
                currentRole === 'COORDENACAO',
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5V19a4 4 0 00-5.356-3.761M17 20H7m10 0v-1c0-1.657-1.343-3-3-3H10a3 3 0 00-3 3v1m0 0H2v-1a4 4 0 015.356-3.761M7 20v-1m10-9a4 4 0 11-8 0 4 4 0 018 0zm-10 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
            ),
        },
        {
            href: '/principal/comunicacoes',
            label: 'Comunicações',
            allowWhen:
                currentRole === 'ADMIN' ||
                currentRole === 'PROFESSOR' ||
                hasAnyDashboardPermission(currentRole, currentPermissions, [
                    'MANAGE_COMMUNICATION_CENTER',
                    'MANAGE_FINANCIAL',
                ]),
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.223-3.668C3.455 15.022 3 13.557 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
            ),
        },
        {
            href: '/principal/calendario-aulas',
            label: 'Calendário de aulas',
            allowWhen: currentRole === 'PROFESSOR',
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zm2-5h10M9 16h.01M12 16h.01M15 16h.01" />
                </svg>
            ),
        },
        {
            href: '/principal/lancar-notas',
            label: 'Lançar notas',
            allowWhen: currentRole === 'PROFESSOR',
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2zm0 0V3m10 1V3" />
                </svg>
            ),
        },
        {
            href: '/principal/historico-notas',
            label: 'Histórico notas',
            allowWhen: currentRole === 'PROFESSOR',
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17h6M9 13h6M9 9h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
                </svg>
            ),
        },
        {
            href: '/principal/professores',
            label: 'Professores',
            allowWhen: hasAllDashboardPermissions(currentRole, currentPermissions, ['VIEW_TEACHERS', 'VIEW_SUBJECTS']),
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
            ),
        },
        {
            href: '/principal/alunos',
            label: 'Alunos',
            allowWhen: hasDashboardPermission(currentRole, currentPermissions, 'VIEW_STUDENTS'),
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10a4 4 0 11-8 0 4 4 0 018 0m6 11v-1a6 6 0 00-6-6H8a6 6 0 00-6 6v1h18z" />
                </svg>
            ),
        },
        {
            href: '/principal/responsaveis',
            label: 'Responsáveis',
            allowWhen: hasDashboardPermission(currentRole, currentPermissions, 'VIEW_GUARDIANS'),
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5V4H2v16h5m10 0v-2a4 4 0 00-4-4H11a4 4 0 00-4 4v2m10 0H7m10-10a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
            ),
        },
        {
            href: '/principal/mensalidades',
            label: 'Gerar Mensalidades',
            allowWhen: hasAnyDashboardPermission(currentRole, currentPermissions, ['VIEW_FINANCIAL', 'MANAGE_MONTHLY_FEES']),
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m-7 4h8m-8 4h5m5 4H6a2 2 0 01-2-2V5a2 2 0 012-2h8l4 4v10a2 2 0 01-2 2z" />
                </svg>
            ),
        },
        {
            href: '/principal/financeiro/parcelas',
            label: 'Parcelas',
            allowWhen: hasAnyDashboardPermission(currentRole, currentPermissions, ['VIEW_CASHIER', 'SETTLE_RECEIVABLES']),
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 12h6m-6 5h10M5 3h10l4 4v12a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
                </svg>
            ),
        },
        {
            href: '/principal/disciplinas',
            label: 'Disciplinas',
            allowWhen: hasAllDashboardPermissions(currentRole, currentPermissions, ['VIEW_SUBJECTS', 'VIEW_TEACHERS']),
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
            ),
        },
        {
            href: '/principal/series',
            label: 'Séries',
            allowWhen: hasDashboardPermission(currentRole, currentPermissions, 'VIEW_SERIES'),
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 12h10M7 17h10M4 7h.01M4 12h.01M4 17h.01" />
                </svg>
            ),
        },
        {
            href: '/principal/turmas',
            label: 'Turmas',
            allowWhen: hasAllDashboardPermissions(currentRole, currentPermissions, ['VIEW_SERIES', 'VIEW_SERIES_CLASSES']),
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M6 12h12M9 17h6" />
                </svg>
            ),
        },
        {
            href: '/principal/configura-ano-letivo',
            label: 'Configura Ano Letivo',
            allowWhen: hasAnyDashboardPermission(currentRole, currentPermissions, ['VIEW_SCHOOL_YEARS', 'VIEW_LESSON_CALENDARS']),
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M5 11h14M7 21h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 16h3m3 0h.01" />
                </svg>
            ),
        },
        {
            href: '/principal/grade',
            label: 'Turmas x horários',
            allowWhen: hasAllDashboardPermissions(currentRole, currentPermissions, ['VIEW_CLASS_SCHEDULES', 'VIEW_SCHOOL_YEARS', 'VIEW_SERIES_CLASSES', 'VIEW_SUBJECTS']),
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            ),
        },
        {
            href: '/principal/grade-anual',
            label: 'Grade anual',
            allowWhen: hasAllDashboardPermissions(currentRole, currentPermissions, ['VIEW_LESSON_CALENDARS', 'VIEW_SCHOOL_YEARS', 'VIEW_SERIES_CLASSES', 'VIEW_CLASS_SCHEDULES']),
            icon: (
                <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zm2-5h10" />
                </svg>
            ),
        },
    ].filter((item) => item.allowWhen);
    const summaryNavPaths = [
        '/principal/dashboard/resumo',
        '/principal/dashboard/resumo-por-serie',
        '/principal/dashboard/resumo-por-turma',
        '/principal/dashboard/resumo-por-periodo',
        '/principal/dashboard/resumo-professor-aulas',
    ];
    const showDashboardBase = pathname.startsWith('/principal/dashboard');
    const showDashboardProgram = pathname.startsWith('/principal/dashboard/') && pathname !== '/principal/dashboard';
    const showSummaryNav = showDashboardProgram;
    const showFinanceiroModuleNav = pathname.startsWith('/principal/financeiro');
    const showFinanceiroParcelasScreen = pathname.startsWith('/principal/financeiro/parcelas');
    const showFinanceiroVendasScreen = pathname === '/principal/financeiro/vendas';
    const showPrincipalHeroHeader = pathname === '/principal';
    const showNotificationsHeroHeader = pathname === '/principal/notificacoes';
    const showPeopleHeroHeader = pathname === '/principal/pessoas';
    const showCommunicationsHeroHeader = pathname === '/principal/comunicacoes';
    const showGuardiansHeroHeader = pathname === '/principal/responsaveis';
    const showSeriesHeroHeader = pathname === '/principal/series';
    const showClassesHeroHeader = pathname === '/principal/turmas';
    const showSchoolYearConfigHeroHeader = pathname === '/principal/configura-ano-letivo';
    const showGradeHeroHeader = pathname === '/principal/grade';
    const showAnnualGradeHeroHeader = pathname === '/principal/grade-anual';
    const showStudentsHeroHeader = pathname === '/principal/alunos';
    const showTeachersHeroHeader = pathname === '/principal/professores';
    const showMonthlyFeesHeroHeader = pathname === '/principal/mensalidades';
    const showSubjectsHeroHeader = pathname === '/principal/disciplinas';
    const showCustomHeroHeader =
        showFinanceiroModuleNav ||
        showPrincipalHeroHeader ||
        showNotificationsHeroHeader ||
        showPeopleHeroHeader ||
        showCommunicationsHeroHeader ||
        showGuardiansHeroHeader ||
        showSeriesHeroHeader ||
        showClassesHeroHeader ||
        showSchoolYearConfigHeroHeader ||
        showGradeHeroHeader ||
        showAnnualGradeHeroHeader ||
        showStudentsHeroHeader ||
        showTeachersHeroHeader ||
        showMonthlyFeesHeroHeader ||
        showSubjectsHeroHeader;
    const summaryHrefSet = new Set(['/principal', '/principal/dashboard', ...summaryNavPaths]);
    const menuPrincipalItem = navItems.find((item) => item.href === '/principal');
    const menuDashboardItem = navItems.find((item) => item.href === '/principal/dashboard');
    const summaryLinks = navItems.filter((item) => summaryNavPaths.includes(item.href));
    const showGeneralNav = !showSummaryNav && pathname !== '/principal/dashboard';
    const generalLinks = showGeneralNav
        ? navItems.filter(
              (item) =>
                  !summaryHrefSet.has(item.href) &&
                  (!item.requiresDashboardBase || showDashboardBase) &&
                  (!item.showAfterDashboardBase || showDashboardProgram),
          )
        : [];
    const screenContextLabel = useMemo(
        () => embeddedScreenContextLabel || deriveScreenContextLabel(pathname),
        [embeddedScreenContextLabel, pathname],
    );
    const currentScreenAuditOverride = screenAuditOverride?.screenId === screenContextLabel ? screenAuditOverride : null;
    const topLinks: NavItem[] = [];
    if (menuPrincipalItem) topLinks.push(menuPrincipalItem);
    if (showSummaryNav && menuDashboardItem) topLinks.push(menuDashboardItem);
    const financeModuleNavItems: NavItem[] = [
        {
            href: '/principal',
            label: 'Principal',
            allowWhen: true,
            icon: (
                <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                </svg>
            ),
        },
        {
            href: '/principal/financeiro',
            label: 'Financeiro',
            allowWhen: true,
            icon: (
                <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-3.314 0-6 1.79-6 4s2.686 4 6 4 6-1.79 6-4-2.686-4-6-4zm0 0V5m0 11v3m-7-7H2m20 0h-3" />
                </svg>
            ),
        },
        {
            href: '/principal/financeiro/contas-a-receber',
            label: 'Contas a Receber',
            allowWhen: true,
            icon: (
                <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 12h6m-6 5h10M5 3h10l4 4v12a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
                </svg>
            ),
        },
        {
            href: '/principal/financeiro/contas-a-pagar',
            label: 'Contas a Pagar',
            allowWhen: true,
            icon: (
                <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h7m-7 4h5M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2z" />
                </svg>
            ),
        },
        {
            href: '/principal/financeiro/estoque',
            label: 'Estoque',
            allowWhen: true,
            icon: (
                <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7m-9 4v10" />
                </svg>
            ),
        },
        {
            href: '/principal/financeiro/vendas',
            label: 'Vendas',
            allowWhen: true,
            icon: (
                <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h2l2 9h8l3-7H7" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20a1 1 0 100-2 1 1 0 000 2zm7 0a1 1 0 100-2 1 1 0 000 2z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5v6m-3-3h6" />
                </svg>
            ),
        },
    ];
    const filteredNavItems = isCashierOnlyAccess
        ? []
        : showFinanceiroModuleNav
            ? financeModuleNavItems
            : showSummaryNav
                ? [...topLinks, ...summaryLinks]
                : [...topLinks, ...generalLinks];
    const isCurrentNavItem = (item: NavItem) => {
        const isExactOrChild = pathname === item.href || pathname.startsWith(`${item.href}/`);
        if (item.href !== '/principal/financeiro') {
            return isExactOrChild;
        }

        const hasSpecificFinanceItem = filteredNavItems.some(
            (navItem) =>
                navItem.href !== item.href &&
                navItem.href.startsWith('/principal/financeiro') &&
                (pathname === navItem.href || pathname.startsWith(`${navItem.href}/`)),
        );

        return pathname.startsWith('/principal/financeiro') && !hasSpecificFinanceItem;
    };
    const hasAllNotificationsRead = unreadSummary?.count === 0;
    const notificationsButtonTitle = hasAllNotificationsRead
        ? 'TODAS NOTIFICAÇÕES FORAM LIDAS'
        : 'ABRIR NOTIFICAÇÕES';
    const notificationsButtonClassName = hasAllNotificationsRead
        ? 'relative p-2 text-emerald-600 hover:text-emerald-700 transition-colors'
        : 'relative p-2 text-slate-400 hover:text-blue-600 transition-colors';
    const userMenuButtonClassName = showFinanceiroModuleNav || showPrincipalHeroHeader || showNotificationsHeroHeader || showPeopleHeroHeader || showCommunicationsHeroHeader || showGuardiansHeroHeader || showSeriesHeroHeader || showClassesHeroHeader || showSchoolYearConfigHeroHeader || showGradeHeroHeader || showAnnualGradeHeroHeader || showStudentsHeroHeader || showMonthlyFeesHeroHeader || showTeachersHeroHeader || showSubjectsHeroHeader
        ? 'flex items-center gap-3 rounded-2xl border border-white/20 bg-white px-3 py-2 shadow-lg transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400'
        : 'flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-slate-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400';
    const userMenuTrigger = (
        <div ref={userMenuRef} className="relative">
            <button
                type="button"
                aria-haspopup="true"
                aria-expanded={isUserMenuOpen}
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className={userMenuButtonClassName}
            >
                <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-slate-700 leading-tight">{userDisplayName}</p>
                    <p className="text-xs font-medium text-slate-400">{getRoleLabel(currentRole)}</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-slate-200">
                    <span className="text-sm font-bold text-blue-700">{userInitials}</span>
                </div>
                <svg className={`w-3 h-3 text-slate-400 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
                </svg>
            </button>
            {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 min-w-[180px] rounded-2xl border border-slate-200 bg-white py-2 shadow-lg shadow-slate-900/5 z-20">
                    <button
                        type="button"
                        onClick={handleOpenChangePassword}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M10.29 3.86l-8.2 14.22A2 2 0 003.82 21h16.36a2 2 0 001.73-2.92L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <span>ALTERAR SENHA</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleUserMenuLogout}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span>SAIR</span>
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-[#f3f4f6] flex font-sans text-slate-800">
            <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-[#153a6a] text-white flex flex-col transition-all duration-300 shadow-xl relative z-20`}>
                <div className={`border-b border-white/10 px-4 py-4 ${isSidebarOpen ? 'min-h-[108px]' : 'h-16'} flex items-center justify-center`}>
                    <Link
                        href={isCashierOnlyAccess ? CASHIER_ONLY_HOME_ROUTE : '/principal'}
                        className={`flex ${isSidebarOpen ? 'flex-col' : 'flex-row'} items-center justify-center gap-3 ${isSidebarOpen ? '' : 'gap-1'} cursor-pointer`}
                    >
                        <div className={`flex items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-sm shrink-0 ${isSidebarOpen ? 'h-16 w-16' : 'h-10 w-10'}`}>
                            {currentTenant?.logoUrl ? (
                                <img
                                    src={currentTenant.logoUrl}
                                    alt={`Logo de ${currentTenant.name}`}
                                    className={`h-full w-full object-contain ${isSidebarOpen ? 'p-1.5' : 'p-1'}`}
                                />
                            ) : (
                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                </svg>
                            )}
                        </div>
                        {isSidebarOpen && currentTenant ? (
                            <span className="mt-3 max-w-[180px] text-center text-xs font-bold leading-4 text-white">
                                {currentTenant.name}
                            </span>
                        ) : null}
                    </Link>
                </div>

                <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-2">
                    {filteredNavItems.map((item) => {
                        const isCurrent = isCurrentNavItem(item);
                        return (
                <Link
                                key={item.href}
                                href={item.href}
                                onClick={(event) => {
                                    if (
                                        showFinanceiroModuleNav &&
                                        item.href.startsWith('/principal/financeiro') &&
                                        pathname === item.href &&
                                        typeof window !== 'undefined'
                                    ) {
                                        event.preventDefault();
                                        window.location.assign(item.href);
                                    }
                                }}
                                className={`flex items-center rounded-lg px-3 py-2.5 font-medium transition-colors ${
                                    isCurrent
                                        ? 'bg-blue-600/30 text-white shadow-sm border border-blue-500/20'
                                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                                }`}
                            >
                                {item.icon}
                                {isSidebarOpen ? <span className="ml-3 text-sm">{item.label}</span> : null}
                            </Link>
                        );
                    })}
                </nav>

                <div className="border-t border-white/10 px-3 py-4">
                    <button
                        type="button"
                        onClick={handleLogout}
                        title="Abrir login"
                        aria-label="Abrir login"
                        className="flex w-full items-center rounded-lg px-3 py-2.5 font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                    >
                        <svg className="w-5 h-5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        {isSidebarOpen ? <span className="ml-3 text-sm">Login</span> : null}
                    </button>
                </div>

            </aside>

            <div className="flex-1 flex flex-col h-screen overflow-hidden">
                <header
                    className={`bg-white flex items-center justify-between shadow-sm z-10 shrink-0 ${
                        showCustomHeroHeader
                            ? 'h-0 overflow-hidden border-b-0 px-0'
                            : 'h-16 border-b border-slate-200 px-6'
                    }`}
                >
                    <div className="flex items-center gap-4">
                        {!showFinanceiroModuleNav ? (
                            <button
                                onClick={() => setSidebarOpen(!isSidebarOpen)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                        ) : null}
                        {!showFinanceiroModuleNav ? (
                            <span className="text-lg font-bold text-[#153a6a] hidden sm:block">{isPersonalRole ? 'Meu Painel' : 'Gestão Administrativa'}</span>
                        ) : null}
                    </div>

                    <div className="flex items-center gap-4">
                        {!showFinanceiroModuleNav && !showPrincipalHeroHeader && !showNotificationsHeroHeader && !showPeopleHeroHeader && !showCommunicationsHeroHeader && !showGuardiansHeroHeader && !showSeriesHeroHeader && !showClassesHeroHeader && !showSchoolYearConfigHeroHeader && !showGradeHeroHeader && !showAnnualGradeHeroHeader && !showStudentsHeroHeader && !showTeachersHeroHeader && !showMonthlyFeesHeroHeader && !showSubjectsHeroHeader ? (
                            <button
                                type="button"
                                onClick={() => router.push('/principal/notificacoes')}
                                title={notificationsButtonTitle}
                                aria-label={notificationsButtonTitle}
                                className={notificationsButtonClassName}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                                {unreadSummary?.count ? (
                                    <span className="absolute -right-1 top-0 flex min-h-5 min-w-5 items-center justify-center rounded-full border border-white bg-red-500 px-1 text-[10px] font-extrabold leading-none text-white">
                                        {unreadSummary.count > 9 ? '9+' : unreadSummary.count}
                                    </span>
                                ) : null}
                            </button>
                        ) : null}

                        {!showFinanceiroModuleNav && !showPrincipalHeroHeader && !showNotificationsHeroHeader && !showPeopleHeroHeader && !showCommunicationsHeroHeader && !showGuardiansHeroHeader && !showSeriesHeroHeader && !showClassesHeroHeader && !showSchoolYearConfigHeroHeader && !showGradeHeroHeader && !showAnnualGradeHeroHeader && !showStudentsHeroHeader && !showTeachersHeroHeader && !showMonthlyFeesHeroHeader && !showSubjectsHeroHeader ? <div className="h-6 w-px bg-slate-200"></div> : null}
                        {!showFinanceiroModuleNav && !showPrincipalHeroHeader && !showNotificationsHeroHeader && !showPeopleHeroHeader && !showCommunicationsHeroHeader && !showGuardiansHeroHeader && !showSeriesHeroHeader && !showClassesHeroHeader && !showSchoolYearConfigHeroHeader && !showGradeHeroHeader && !showAnnualGradeHeroHeader && !showStudentsHeroHeader && !showTeachersHeroHeader && !showMonthlyFeesHeroHeader && !showSubjectsHeroHeader ? userMenuTrigger : null}
                    </div>
                </header>

                <main
                    className={`relative flex-1 bg-slate-50 ${
                        showFinanceiroVendasScreen
                            ? 'overflow-y-auto px-6 pb-1 pt-2 md:px-8 md:pb-1 md:pt-2'
                            : showFinanceiroParcelasScreen
                            ? 'overflow-hidden px-6 pb-6 pt-2 md:px-8 md:pb-8 md:pt-2'
                            : showCustomHeroHeader
                                ? 'overflow-y-auto px-6 pb-6 pt-2 md:px-8 md:pb-8 md:pt-2'
                            : 'overflow-y-auto p-6 md:p-8'
                    }`}
                >
                    {showFinanceiroModuleNav ? (
                        <div className="pointer-events-none absolute left-6 right-6 top-5 z-20 flex justify-end md:left-8 md:right-12 md:top-5">
                            <div className="pointer-events-auto flex flex-col items-end gap-3">
                                <div className="translate-y-1">
                                    {userMenuTrigger}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleBackNavigation}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#153a6a] shadow-lg transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span>Voltar</span>
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showPrincipalHeroHeader ? (
                        <div className="pointer-events-none absolute right-8 top-5 z-20 flex justify-end md:right-10 md:top-5">
                            <div className="pointer-events-auto flex flex-col items-end gap-3">
                                {userMenuTrigger}
                                <button
                                    type="button"
                                    onClick={handleBackNavigation}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#153a6a] shadow-lg transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span>Voltar</span>
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showNotificationsHeroHeader ? (
                        <div className={PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS}>
                            <div className="pointer-events-auto flex flex-col items-end gap-3">
                                {userMenuTrigger}
                                <button
                                    type="button"
                                    onClick={handleBackNavigation}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#153a6a] shadow-lg transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span>Voltar</span>
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showPeopleHeroHeader ? (
                        <div className={PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS}>
                            <div className="pointer-events-auto flex flex-col items-end gap-3">
                                {userMenuTrigger}
                                <button
                                    type="button"
                                    onClick={handleBackNavigation}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#153a6a] shadow-lg transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span>Voltar</span>
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showCommunicationsHeroHeader ? (
                        <div className={PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS}>
                            <div className="pointer-events-auto flex flex-col items-end gap-3">
                                {userMenuTrigger}
                                <button
                                    type="button"
                                    onClick={handleBackNavigation}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#153a6a] shadow-lg transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span>Voltar</span>
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showMonthlyFeesHeroHeader ? (
                        <div className={PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS}>
                            <div className="pointer-events-auto flex flex-col items-end gap-3">
                                {userMenuTrigger}
                                <button
                                    type="button"
                                    onClick={handleBackNavigation}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#153a6a] shadow-lg transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span>Voltar</span>
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showStudentsHeroHeader ? (
                        <div className={PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS}>
                            <div className="pointer-events-auto flex flex-col items-end gap-3">
                                {userMenuTrigger}
                                <button
                                    type="button"
                                    onClick={handleBackNavigation}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#153a6a] shadow-lg transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span>Voltar</span>
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showGuardiansHeroHeader ? (
                        <div className={PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS}>
                            <div className="pointer-events-auto flex flex-col items-end gap-3">
                                {userMenuTrigger}
                                <button
                                    type="button"
                                    onClick={handleBackNavigation}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#153a6a] shadow-lg transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span>Voltar</span>
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showSeriesHeroHeader ? (
                        <div className={PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS}>
                            <div className="pointer-events-auto flex flex-col items-end gap-3">
                                {userMenuTrigger}
                                <button
                                    type="button"
                                    onClick={handleBackNavigation}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#153a6a] shadow-lg transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span>Voltar</span>
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showClassesHeroHeader ? (
                        <div className={PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS}>
                            <div className="pointer-events-auto flex flex-col items-end gap-3">
                                {userMenuTrigger}
                                <button
                                    type="button"
                                    onClick={handleBackNavigation}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#153a6a] shadow-lg transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span>Voltar</span>
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showSchoolYearConfigHeroHeader ? (
                        <div className={PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS}>
                            <div className="pointer-events-auto flex flex-col items-end gap-3">
                                {userMenuTrigger}
                                <button
                                    type="button"
                                    onClick={handleBackNavigation}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#153a6a] shadow-lg transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span>Voltar</span>
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showGradeHeroHeader ? (
                        <div className={PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS}>
                            <div className="pointer-events-auto flex flex-col items-end gap-3">
                                {userMenuTrigger}
                                <button
                                    type="button"
                                    onClick={handleBackNavigation}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#153a6a] shadow-lg transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span>Voltar</span>
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showAnnualGradeHeroHeader ? (
                        <div className={PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS}>
                            <div className="pointer-events-auto flex flex-col items-end gap-3">
                                {userMenuTrigger}
                                <button
                                    type="button"
                                    onClick={handleBackNavigation}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#153a6a] shadow-lg transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span>Voltar</span>
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showTeachersHeroHeader ? (
                        <div className={PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS}>
                            <div className="pointer-events-auto flex flex-col items-end gap-3">
                                {userMenuTrigger}
                                <button
                                    type="button"
                                    onClick={handleBackNavigation}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#153a6a] shadow-lg transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span>Voltar</span>
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showSubjectsHeroHeader ? (
                        <div className={PRINCIPAL_PROGRAM_HEADER_RIGHT_OVERLAY_CLASS}>
                            <div className="pointer-events-auto flex flex-col items-end gap-3">
                                {userMenuTrigger}
                                <button
                                    type="button"
                                    onClick={handleBackNavigation}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#153a6a] shadow-lg transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    Voltar
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {children}
                </main>
                <footer className={`bg-white border-t border-slate-200 px-6 text-xs italic text-slate-500 ${showFinanceiroVendasScreen ? 'py-1' : 'py-3'}`}>
                    <div className={`flex flex-wrap items-center justify-between ${showFinanceiroVendasScreen ? 'gap-1' : 'gap-2'}`}>
                        <span className="flex-1 text-slate-500 min-w-[240px] text-left">
                            Desenvolvido por MSINFOR SISTEMAS
                            <span className="mx-2 text-slate-400">•</span>
                            (16) 3025-6025
                            <span className="mx-2 text-slate-400">/</span>
                            <a
                                href="https://wa.me/5516999991978"
                                target="_blank"
                                rel="noreferrer"
                                title="Clique aqui para abrir o Wattsup"
                                className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-600 transition"
                            >
                                <svg className={`${showFinanceiroVendasScreen ? 'h-4 w-4' : 'h-5 w-5'} text-emerald-500`} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 3C7.03 3 3 7.03 3 12c0 1.91.56 3.69 1.53 5.19L5 22l4.88-1.39c1.59.81 3.32 1.13 5.02.62 4.97-1.36 8.02-7.13 6.08-12.04C18.66 4.56 15.6 3 12 3zm0 16c-1.37 0-2.71-.41-3.85-1.18l-.28-.18-3.41.97.83-3.19-.19-.32A8.99 8.99 0 014 12c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9z" />
                                    <path d="M15.42 14.36c-.23-.12-1.36-.75-1.58-.84-.22-.1-.38-.12-.55.11s-.63.84-.77 1c-.14.15-.28.17-.51.06a5.1 5.1 0 01-1.5-.94 5.8 5.8 0 01-1.1-1.36c-.11-.19-.01-.29.08-.38.09-.08.21-.21.32-.32.1-.1.15-.18.23-.29.08-.11.04-.2-.02-.36-.06-.16-.57-1.36-.78-1.87-.21-.52-.43-.45-.58-.45-.15 0-.32-.01-.49-.01s-.36.05-.55.27c-.19.22-.74.72-.74 1.76s.78 2.54.89 2.72c.11.19 1.92 2.91 4.68 3.98.68.29 1.19.45 1.63.58.67.21 1.28.18 1.76.11.53-.09 1.2-.55 1.53-1.16.33-.61.33-1.12.25-1.22-.08-.1-.33-.16-.68-.28z" />
                                </svg>
                                <span>(16) 99999-1978</span>
                            </a>
                        </span>
                        {currentBranchFooterLabel ? (
                            <span className="min-w-[180px] text-center text-[10px] font-black not-italic uppercase tracking-[0.24em] text-slate-500">
                                FILIAL: <span className="text-slate-700">{currentBranchFooterLabel}</span>
                            </span>
                        ) : null}
                        {/* padrão: exibimos o identificador da tela e o botão de copiar no rodapé */}
                        <ScreenNameCopy
                            screenId={screenContextLabel}
                            className={`flex-1 justify-end text-right ${showFinanceiroVendasScreen ? 'text-[10px]' : 'text-[11px]'}`}
                            originText={currentScreenAuditOverride?.originText}
                            auditText={currentScreenAuditOverride?.auditText}
                            sqlText={currentScreenAuditOverride?.sqlText}
                            disableMargin={showFinanceiroVendasScreen}
                        />
                    </div>
                </footer>
            </div>

            {isExitConfirmationOpen ? (
                <div
                    className="fixed inset-0 z-[97] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-md"
                    onClick={() => setIsExitConfirmationOpen(false)}
                    role="presentation"
                >
                    <div
                        className="w-full max-w-xl overflow-hidden rounded-[30px] border border-blue-100 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.45)]"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cashier-exit-title"
                    >
                        <div className="bg-gradient-to-r from-[#153a6a] via-blue-700 to-blue-600 px-6 py-5 text-white">
                            <div className="flex items-center gap-4">
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/30 bg-white shadow-lg">
                                    {currentTenant?.logoUrl ? (
                                        <img src={currentTenant.logoUrl} alt={currentTenant.name} className="h-full w-full object-contain p-2" />
                                    ) : (
                                        <span className="text-lg font-black uppercase text-[#153a6a]">
                                            {String(currentTenant?.name || 'ESCOLA').slice(0, 3).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-[0.32em] text-blue-100">SAIDA DO SISTEMA</div>
                                    <h2 id="cashier-exit-title" className="mt-1 text-2xl font-black leading-tight">
                                        CONFIRMAR ENCERRAMENTO
                                    </h2>
                                    <div className="mt-1 truncate text-sm font-semibold text-blue-50">
                                        {currentTenant?.name || 'ESCOLA'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-6 text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M17 16l4-4m0 0l-4-4m4 4H7" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 5V4a2 2 0 00-2-2H6a2 2 0 00-2 2v16a2 2 0 002 2h5a2 2 0 002-2v-1" />
                                </svg>
                            </div>
                            <p className="mt-4 text-xl font-black uppercase text-slate-900">
                                DESEJA REALMENTE SAIR DO SISTEMA?
                            </p>
                            <p className="mt-2 text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                                SUA SESSAO SERA ENCERRADA E A TELA DE LOGIN SERA ABERTA.
                            </p>
                        </div>

                        <div className="grid gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => setIsExitConfirmationOpen(false)}
                                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-100"
                            >
                                CANCELAR
                            </button>
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-500"
                            >
                                SAIR
                            </button>
                        </div>

                        <div className="border-t border-slate-100 bg-white px-6 py-3">
                            <ScreenNameCopy
                                screenId={EXIT_CONFIRMATION_SCREEN_ID}
                                label="TELA"
                                className="justify-end"
                                disableMargin
                            />
                        </div>
                    </div>
                </div>
            ) : null}

            {isChangePasswordOpen ? (
                <div
                    className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
                    onClick={closeChangePassword}
                    role="presentation"
                >
                    <div
                        className="relative w-full max-w-2xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-blue-50 to-indigo-50 px-6 py-5">
                            <div className="flex items-center gap-4">
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white bg-white shadow-md">
                                    {currentTenant?.logoUrl ? (
                                        <img src={currentTenant.logoUrl} alt={currentTenant.name} className="h-full w-full object-contain p-2" />
                                    ) : (
                                        <span className="text-lg font-black uppercase text-slate-500">
                                            {String(currentTenant?.name || 'ESCOLA').slice(0, 3).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <div className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500">Alterar senha</div>
                                    <div className="mt-1 text-2xl font-black text-slate-900">Senha do e-mail geral</div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={closeChangePassword}
                                className="rounded-full bg-red-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-red-700"
                            >
                                FECHAR
                            </button>
                        </div>

                        <div className="px-6 py-6">
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="md:col-span-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                                    A nova senha será validada pelo e-mail e sincronizada em todos os cadastros vinculados.
                                </div>

                                <div className="md:col-span-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">E-mail que será alterado</div>
                                    <div className="mt-1 break-all text-base font-black">
                                        {currentUserEmail || 'E-MAIL NÃO LOCALIZADO'}
                                    </div>
                                </div>

                                <div className="md:col-span-3">
                                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Senha atual</label>
                                    <div className="relative">
                                        <input
                                            type={showCurrentPassword ? 'text' : 'password'}
                                            value={currentPassword}
                                            onChange={(event) => setCurrentPassword(event.target.value)}
                                            placeholder="INFORME A SENHA ATUAL"
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-sm font-medium text-slate-700 outline-none focus:bg-white"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowCurrentPassword((value) => !value)}
                                            className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-900"
                                            aria-label={showCurrentPassword ? 'Ocultar senha atual' : 'Mostrar senha atual'}
                                        >
                                            {showCurrentPassword ? (
                                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 3l18 18" />
                                                    <path d="M10.58 10.58A2 2 0 0 0 13.42 13.42" />
                                                    <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c7 0 10 7 10 7a18.27 18.27 0 0 1-4.23 5.42" />
                                                    <path d="M6.61 6.61C3.61 8.79 2 12 2 12s3 7 10 7a10.9 10.9 0 0 0 5.39-1.44" />
                                                </svg>
                                            ) : (
                                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <div className="md:col-span-3">
                                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Nova senha</label>
                                    <div className="relative">
                                        <input
                                            type={showNewPassword ? 'text' : 'password'}
                                            value={newPassword}
                                            onChange={(event) => setNewPassword(event.target.value)}
                                            placeholder="INFORME A NOVA SENHA"
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-sm font-medium text-slate-700 outline-none focus:bg-white"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPassword((value) => !value)}
                                            className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-900"
                                            aria-label={showNewPassword ? 'Mostrar senha nova' : 'Ocultar senha nova'}
                                        >
                                            {showNewPassword ? (
                                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 3l18 18" />
                                                    <path d="M10.58 10.58A2 2 0 0 0 13.42 13.42" />
                                                    <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c7 0 10 7 10 7a18.27 18.27 0 0 1-4.23 5.42" />
                                                    <path d="M6.61 6.61C3.61 8.79 2 12 2 12s3 7 10 7a10.9 10.9 0 0 0 5.39-1.44" />
                                                </svg>
                                            ) : (
                                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <div className="md:col-span-3">
                                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Repetir nova senha</label>
                                    <div className="relative">
                                        <input
                                            type={showConfirmNewPassword ? 'text' : 'password'}
                                            value={confirmNewPassword}
                                            onChange={(event) => setConfirmNewPassword(event.target.value)}
                                            placeholder="REPITA A NOVA SENHA"
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-sm font-medium text-slate-700 outline-none focus:bg-white"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmNewPassword((value) => !value)}
                                            className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-900"
                                            aria-label={showConfirmNewPassword ? 'Mostrar confirmação de senha' : 'Ocultar confirmação de senha'}
                                        >
                                            {showConfirmNewPassword ? (
                                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 3l18 18" />
                                                    <path d="M10.58 10.58A2 2 0 0 0 13.42 13.42" />
                                                    <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c7 0 10 7 10 7a18.27 18.27 0 0 1-4.23 5.42" />
                                                    <path d="M6.61 6.61C3.61 8.79 2 12 2 12s3 7 10 7a10.9 10.9 0 0 0 5.39-1.44" />
                                                </svg>
                                            ) : (
                                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <button
                                type="button"
                                onClick={() => void handleSubmitChangePassword()}
                                disabled={isChangingPassword}
                                className="w-full rounded-xl bg-[#153a6a] px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-wait disabled:bg-slate-300"
                            >
                                {isChangingPassword ? 'SALVANDO...' : 'ALTERAR SENHA'}
                            </button>
                            <ScreenNameCopy
                                screenId={CHANGE_PASSWORD_SCREEN_ID}
                                label="NOME DA TELA"
                                className="justify-end"
                                disableMargin
                            />
                        </div>
                    </div>
                </div>
            ) : null}

            {changePasswordAlertType && (changePasswordError || changePasswordStatus) ? (
                <div
                    className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-md"
                    onClick={() => {
                        setChangePasswordAlertType(null);
                        setChangePasswordError(null);
                        setChangePasswordErrorVariant(null);
                        setChangePasswordStatus(null);
                    }}
                    role="presentation"
                >
                    <div
                        className={`w-full max-w-lg overflow-hidden rounded-[30px] border bg-white shadow-[0_30px_90px_rgba(15,23,42,0.45)] ${
                            changePasswordAlertType === 'error' ? 'border-rose-200' : 'border-emerald-200'
                        }`}
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                    >
                        <div
                            className={`flex items-start gap-4 px-6 py-5 ${
                                changePasswordAlertType === 'error'
                                    ? 'bg-gradient-to-r from-rose-50 to-orange-50'
                                    : 'bg-gradient-to-r from-emerald-50 to-cyan-50'
                            }`}
                        >
                            <div
                                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-md ${
                                    changePasswordAlertType === 'error' ? 'ring-2 ring-rose-200' : 'ring-2 ring-emerald-200'
                                }`}
                            >
                                {changePasswordAlertType === 'error' ? (
                                    changePasswordErrorVariant === 'blank' ? (
                                        <img src="/password-empty-warning.svg" alt="Senha não informada" className="h-10 w-10 object-contain" />
                                    ) : (
                                        <svg viewBox="0 0 24 24" className="h-7 w-7 text-rose-600 mx-auto" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M12 9v4" />
                                            <path d="M12 17h.01" />
                                            <path d="M10.29 3.86l-8.45 14.63A2 2 0 0 0 3.58 21h16.84a2 2 0 0 0 1.74-3.01L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        </svg>
                                    )
                                ) : (
                                    <svg viewBox="0 0 24 24" className="h-7 w-7 text-emerald-600 mx-auto" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 6L9 17l-5-5" />
                                    </svg>
                                )}
                            </div>
                            <div className="min-w-0 flex-1 text-center">
                                {changePasswordAlertType === 'error' ? (
                                    <>
                                        <div className="text-[18px] font-black uppercase tracking-[0.45em] text-rose-700">
                                            E R R O !!!
                                        </div>
                                        <div className="mt-3 text-lg font-black uppercase leading-tight text-slate-900">
                                            {renderChangePasswordErrorMessage()}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-[11px] font-black uppercase tracking-[0.3em] text-emerald-700">
                                            Sucesso
                                        </div>
                                        <div className="mt-1 text-xl font-black text-slate-900">
                                            {changePasswordStatus}
                                        </div>
                                    </>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setChangePasswordAlertType(null);
                                    setChangePasswordError(null);
                                    setChangePasswordErrorVariant(null);
                                    setChangePasswordStatus(null);
                                }}
                                className="rounded-full bg-white px-3 py-2 text-sm font-black text-slate-500 shadow-sm hover:text-slate-900"
                            >
                                ×
                            </button>
                        </div>
                        <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setChangePasswordAlertType(null);
                                    setChangePasswordError(null);
                                    setChangePasswordErrorVariant(null);
                                    setChangePasswordStatus(null);
                                }}
                                className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white ${
                                    changePasswordAlertType === 'error' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
                                }`}
                            >
                                FECHAR
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

        </div>
    );
}
