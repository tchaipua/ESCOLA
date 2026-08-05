'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import GridColumnConfigModal from '@/app/components/grid-column-config-modal';
import GridExportModal from '@/app/components/grid-export-modal';
import GridRecordPopover from '@/app/components/grid-record-popover';
import GridRowActionIconButton from '@/app/components/grid-row-action-icon-button';
import GridStatusFilter, { type GridStatusFilterValue } from '@/app/components/grid-status-filter';
import MaintenanceModalFooter from '@/app/components/maintenance-modal-footer';
import MaintenanceModalHeader from '@/app/components/maintenance-modal-header';
import PrincipalProgramHeader from '@/app/components/principal-program-header';
import StatusConfirmationModal from '@/app/components/status-confirmation-modal';
import { showErrorMessage, showSuccessMessage } from '@/app/components/system-message-provider';
import { TenantBranchSelect } from '@/app/components/tenant-branch-select';
import {
    fetchAddressByCep,
    fetchTenantBranches,
    formatCepInput,
    formatCnpjInput,
    formatCpfInput,
    formatPhoneInput,
    getDashboardAuthContext,
    hasDashboardPermission,
    type TenantBranchSummary,
} from '@/app/lib/dashboard-crud-utils';
import {
    getDefaultAccessProfileForRole,
    getProfilePermissions,
    getProfilesForRole,
    PERMISSION_OPTIONS,
    type AccessProfileCode,
    type AccessRole,
} from '@/app/lib/access-profiles';
import {
    buildDefaultExportColumns,
    exportGridRows,
    sortGridRows,
    type GridColumnDefinition,
    type GridExportFormat,
    type GridSortState,
} from '@/app/lib/grid-export-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import { getStoredToken } from '@/app/lib/auth-storage';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';
const USERS_SCREEN_ID = 'PRINCIPAL_USUARIOS';
const USERS_FORM_MODAL_SCREEN_ID = 'PRINCIPAL_USUARIOS_CADASTRO_FUNCIONARIO';
const USERS_STATUS_MODAL_SCREEN_ID = 'PRINCIPAL_USUARIOS_STATUS_MODAL';
const USER_ROLES = ['ADMIN', 'SECRETARIA', 'COORDENACAO'] as const;
type UserRole = (typeof USER_ROLES)[number];

type UserRecord = {
    id: string;
    name: string;
    email: string;
    accessUsername?: string | null;
    role: UserRole;
    accessProfile?: AccessProfileCode | null;
    permissions?: string[];
    complementaryProfiles?: string[];
    cashierOnly?: boolean;
    branchCode?: number | null;
    branchAccessCodes?: number[] | null;
    birthDate?: string | null;
    rg?: string | null;
    cpf?: string | null;
    cnpj?: string | null;
    nickname?: string | null;
    corporateName?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    cellphone1?: string | null;
    cellphone2?: string | null;
    zipCode?: string | null;
    street?: string | null;
    number?: string | null;
    city?: string | null;
    state?: string | null;
    neighborhood?: string | null;
    complement?: string | null;
    updatedAt?: string | null;
    canceledAt?: string | null;
    active?: boolean;
};

type UserFormState = {
    name: string;
    email: string;
    accessUsername: string;
    password: string;
    passwordConfirmation: string;
    birthDate: string;
    rg: string;
    cpf: string;
    cnpj: string;
    nickname: string;
    corporateName: string;
    phone: string;
    whatsapp: string;
    cellphone1: string;
    cellphone2: string;
    zipCode: string;
    street: string;
    number: string;
    city: string;
    state: string;
    neighborhood: string;
    complement: string;
    role: UserRole;
    accessProfile: AccessProfileCode;
    permissions: string[];
    complementaryProfiles: string[];
    branchAccessCodes: number[];
    cashierOnly: boolean;
};

type UserColumnKey =
    | 'name'
    | 'role'
    | 'branches'
    | 'cpf'
    | 'contact'
    | 'updatedAt';

type UserColumnDefinition = GridColumnDefinition<UserRecord, UserColumnKey> & {
    visibleByDefault?: boolean;
};

type UserExportColumnKey = UserColumnKey | 'email' | 'accessProfile' | 'recordStatus';

const ROLE_LABELS: Record<UserRole, string> = {
    ADMIN: 'ADMINISTRADOR',
    SECRETARIA: 'SECRETARIA',
    COORDENACAO: 'COORDENAÇÃO',
};

const PERMISSION_LABELS = PERMISSION_OPTIONS.reduce<Record<string, string>>((accumulator, option) => {
    accumulator[option.value] = option.label;
    return accumulator;
}, {});

const USER_COLUMNS: UserColumnDefinition[] = [
    { key: 'name', label: 'Nome oficial', getValue: (row) => row.name || '---', visibleByDefault: true },
    { key: 'role', label: 'Papel', getValue: (row) => ROLE_LABELS[row.role] || row.role || '---', visibleByDefault: true },
    { key: 'branches', label: 'Filiais de acesso', getValue: (row) => formatUserBranches(row), visibleByDefault: true },
    { key: 'cpf', label: 'CPF', getValue: (row) => row.cpf || '---', visibleByDefault: false },
    { key: 'contact', label: 'Contato', getValue: (row) => row.phone || row.whatsapp || row.cellphone1 || '---', visibleByDefault: false },
    { key: 'updatedAt', label: 'Última alteração', getValue: (row) => formatUserDate(row.updatedAt), getSortValue: (row) => row.updatedAt || '', visibleByDefault: false },
];

const USER_EXPORT_COLUMNS: GridColumnDefinition<UserRecord, UserExportColumnKey>[] = [
    ...USER_COLUMNS,
    { key: 'email', label: 'E-mail de confirmação', getValue: (row) => row.email || '---' },
    { key: 'accessProfile', label: 'Perfil de acesso', getValue: (row) => String(row.accessProfile || 'PADRÃO').replaceAll('_', ' ') },
    { key: 'recordStatus', label: 'Situação do registro', getValue: (row) => row.canceledAt ? 'INATIVO' : 'ATIVO' },
];

const USER_COLUMN_KEYS = USER_COLUMNS.map((column) => column.key);
const DEFAULT_USER_COLUMN_ORDER = USER_COLUMNS.map((column) => column.key);
const DEFAULT_HIDDEN_USER_COLUMNS = USER_COLUMNS.filter((column) => !column.visibleByDefault).map((column) => column.key);
const DEFAULT_USER_SORT: GridSortState<UserColumnKey> = { column: 'name', direction: 'asc' };

function emptyUserForm(branchCode: number, branches: TenantBranchSummary[]): UserFormState {
    const role: UserRole = 'SECRETARIA';
    const accessProfile = getDefaultAccessProfileForRole(role);
    return {
        name: '',
        email: '',
        accessUsername: '',
        password: '',
        passwordConfirmation: '',
        birthDate: '',
        rg: '',
        cpf: '',
        cnpj: '',
        nickname: '',
        corporateName: '',
        phone: '',
        whatsapp: '',
        cellphone1: '',
        cellphone2: '',
        zipCode: '',
        street: '',
        number: '',
        city: '',
        state: '',
        neighborhood: '',
        complement: '',
        role,
        accessProfile,
        permissions: getProfilePermissions(accessProfile),
        complementaryProfiles: [],
        branchAccessCodes: branches.length > 1 ? branches.map((branch) => branch.branchCode) : [branchCode],
        cashierOnly: false,
    };
}

function formFromUser(user: UserRecord, currentBranchCode: number): UserFormState {
    const role = USER_ROLES.includes(user.role) ? user.role : 'SECRETARIA';
    const accessProfile = (user.accessProfile || getDefaultAccessProfileForRole(role)) as AccessProfileCode;
    return {
        name: user.name || '',
        email: user.email || '',
        accessUsername: user.accessUsername || '',
        password: '',
        passwordConfirmation: '',
        birthDate: user.birthDate ? String(user.birthDate).slice(0, 10) : '',
        rg: user.rg || '',
        cpf: user.cpf || '',
        cnpj: user.cnpj || '',
        nickname: user.nickname || '',
        corporateName: user.corporateName || '',
        phone: user.phone || '',
        whatsapp: user.whatsapp || '',
        cellphone1: user.cellphone1 || '',
        cellphone2: user.cellphone2 || '',
        zipCode: user.zipCode || '',
        street: user.street || '',
        number: user.number || '',
        city: user.city || '',
        state: user.state || '',
        neighborhood: user.neighborhood || '',
        complement: user.complement || '',
        role,
        accessProfile,
        permissions: user.permissions || getProfilePermissions(accessProfile),
        complementaryProfiles: user.complementaryProfiles || [],
        branchAccessCodes: user.branchAccessCodes?.length
            ? user.branchAccessCodes
            : user.branchCode && user.branchCode > 0
                ? [user.branchCode]
                : [currentBranchCode],
        cashierOnly: Boolean(user.cashierOnly),
    };
}

function formatUserDate(value?: string | null) {
    if (!value) return '---';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '---' : parsed.toLocaleDateString('pt-BR');
}

function formatUserBranches(user: UserRecord) {
    if (user.role === 'ADMIN' || user.branchCode === 0) return 'TODAS AS FILIAIS';
    if (user.branchAccessCodes?.length) return user.branchAccessCodes.join(', ');
    return user.branchCode ? String(user.branchCode) : '---';
}

function normalizeSearch(value: string | number | null | undefined) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
}

function InputField({
    label,
    value,
    onChange,
    type = 'text',
    placeholder,
    required = false,
    disabled = false,
    onBlur,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    onBlur?: () => void;
}) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-600">{label}{required ? ' *' : ''}</span>
            <input
                type={type}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onBlur={onBlur}
                placeholder={placeholder}
                required={required}
                disabled={disabled}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />
        </label>
    );
}

function PasswordField({
    label,
    value,
    onChange,
    placeholder,
    required = false,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
}) {
    const [isVisible, setIsVisible] = useState(false);
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">{label}{required ? ' *' : ''}</span>
            <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
                <input
                    type={isVisible ? 'text' : 'password'}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    required={required}
                    autoComplete="new-password"
                    className="min-w-0 flex-1 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none"
                />
                <button
                    type="button"
                    onClick={() => setIsVisible((current) => !current)}
                    className="flex w-12 shrink-0 items-center justify-center border-l border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-blue-600"
                    aria-label={isVisible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
                    title={isVisible ? 'Ocultar senha' : 'Mostrar senha'}
                >
                    {isVisible ? (
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
        </label>
    );
}

function UserDetails({ user }: { user: UserRecord }) {
    const permissionLabels = (user.permissions || [])
        .map((permission) => PERMISSION_LABELS[permission] || permission)
        .join(', ');
    return (
        <GridRecordPopover
            title={user.name}
            subtitle={`${ROLE_LABELS[user.role] || user.role} · ${user.email}`}
            buttonLabel={`Visualizar dados de ${user.name}`}
            modalVariant="school-record-detail"
            contextLabel={USERS_SCREEN_ID}
            sections={[
                {
                    title: 'Dados básicos',
                    items: [
                        { label: 'Nome', value: user.name },
                        { label: 'CPF', value: user.cpf || 'Não informado' },
                        { label: 'Nascimento', value: formatUserDate(user.birthDate) },
                        { label: 'RG', value: user.rg || 'Não informado' },
                        { label: 'CNPJ', value: user.cnpj || 'Não informado' },
                    ],
                },
                {
                    title: 'Acesso',
                    items: [
                        { label: 'Usuário de acesso', value: user.accessUsername || user.email },
                        { label: 'E-mail de confirmação', value: user.email },
                        { label: 'Papel', value: ROLE_LABELS[user.role] || user.role },
                        { label: 'Perfil', value: String(user.accessProfile || 'PADRÃO').replaceAll('_', ' ') },
                        { label: 'Filiais', value: formatUserBranches(user) },
                        { label: 'Permissões', value: permissionLabels || 'Perfil padrão' },
                    ],
                },
                {
                    title: 'Contato e endereço',
                    items: [
                        { label: 'Telefone', value: user.phone || 'Não informado' },
                        { label: 'WhatsApp', value: user.whatsapp || 'Não informado' },
                        { label: 'Endereço', value: [user.street, user.number, user.neighborhood, user.city, user.state].filter(Boolean).join(', ') || 'Não informado' },
                    ],
                },
            ]}
        />
    );
}

export default function UsuariosPage() {
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [tenantBranches, setTenantBranches] = useState<TenantBranchSummary[]>([]);
    const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [currentBranchCode, setCurrentBranchCode] = useState(1);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');
    const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
    const [sortState, setSortState] = useState<GridSortState<UserColumnKey>>(DEFAULT_USER_SORT);
    const [pageSize, setPageSize] = useState(10);
    const [page, setPage] = useState(1);
    const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [formData, setFormData] = useState<UserFormState>(() => emptyUserForm(1, []));
    const [activeTab, setActiveTab] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    const [isGridConfigOpen, setIsGridConfigOpen] = useState(false);
    const [hiddenColumns, setHiddenColumns] = useState<UserColumnKey[]>(DEFAULT_HIDDEN_USER_COLUMNS);
    const [columnOrder, setColumnOrder] = useState<UserColumnKey[]>(DEFAULT_USER_COLUMN_ORDER);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
    const [exportColumns, setExportColumns] = useState<Record<UserExportColumnKey, boolean>>(
        buildDefaultExportColumns(USER_EXPORT_COLUMNS),
    );
    const [statusTarget, setStatusTarget] = useState<UserRecord | null>(null);
    const [statusAction, setStatusAction] = useState<'activate' | 'deactivate' | null>(null);
    const [isProcessingStatus, setIsProcessingStatus] = useState(false);
    const [isLookingUpCep, setIsLookingUpCep] = useState(false);

    const currentTenantBranding = useMemo(
        () => readCachedTenantBranding(currentTenantId),
        [currentTenantId],
    );
    const canViewUsers = hasDashboardPermission(currentRole, currentPermissions, 'VIEW_USERS');
    const canManageUsers = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_USERS');
    const visibleColumns = useMemo(
        () => columnOrder
            .map((key) => USER_COLUMNS.find((column) => column.key === key))
            .filter((column): column is UserColumnDefinition => Boolean(column))
            .filter((column) => !hiddenColumns.includes(column.key)),
        [columnOrder, hiddenColumns],
    );

    const loadUsers = async (token: string) => {
        try {
            setIsLoading(true);
            const response = await fetch(`${API_BASE_URL}/users`, {
                headers: {},
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Não foi possível carregar os usuários da escola.');
            setUsers(Array.isArray(data) ? data : []);
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível carregar os usuários da escola.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const auth = getDashboardAuthContext();
        setCurrentTenantId(auth.tenantId);
        setCurrentRole(auth.role);
        setCurrentPermissions(auth.permissions);
        setCurrentBranchCode(auth.branchCode);
        setIsAuthReady(true);

        if (!auth.token || !hasDashboardPermission(auth.role, auth.permissions, 'VIEW_USERS')) {
            setIsLoading(false);
            return;
        }

        void Promise.all([
            loadUsers(auth.token),
            fetchTenantBranches().then(setTenantBranches).catch(() => setTenantBranches([])),
        ]);
    }, []);

    const filteredUsers = useMemo(() => {
        const normalizedSearch = normalizeSearch(searchTerm);
        return users.filter((user) => {
            const matchesSearch = !normalizedSearch || [user.name, user.email, user.accessUsername, user.cpf, user.phone, user.whatsapp, ROLE_LABELS[user.role]]
                .some((value) => normalizeSearch(value).includes(normalizedSearch));
            const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
            const isActive = !user.canceledAt;
            const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? isActive : !isActive);
            return matchesSearch && matchesRole && matchesStatus;
        });
    }, [roleFilter, searchTerm, statusFilter, users]);

    const sortedUsers = useMemo(
        () => sortGridRows(filteredUsers, USER_COLUMNS, sortState),
        [filteredUsers, sortState],
    );
    const totalPages = Math.max(1, Math.ceil(sortedUsers.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const paginatedUsers = useMemo(
        () => sortedUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        [currentPage, pageSize, sortedUsers],
    );

    useEffect(() => {
        setPage(1);
    }, [pageSize, roleFilter, searchTerm, sortState, statusFilter]);

    useEffect(() => {
        setPage((value) => Math.min(Math.max(value, 1), totalPages));
    }, [totalPages]);

    const updateFormField = <Key extends keyof UserFormState>(field: Key, value: UserFormState[Key]) => {
        setFormData((current) => ({ ...current, [field]: value }));
    };

    const openCreateModal = () => {
        setEditingUserId(null);
        setFormData(emptyUserForm(currentBranchCode, tenantBranches));
        setActiveTab(1);
        setIsModalOpen(true);
    };

    const openEditModal = (user: UserRecord) => {
        setEditingUserId(user.id);
        setFormData(formFromUser(user, currentBranchCode));
        setActiveTab(1);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        if (isSaving) return;
        setIsModalOpen(false);
        setEditingUserId(null);
    };

    const handleRoleChange = (role: UserRole) => {
        const accessProfile = getDefaultAccessProfileForRole(role);
        setFormData((current) => ({
            ...current,
            role,
            accessProfile,
            permissions: getProfilePermissions(accessProfile),
            complementaryProfiles: role === 'ADMIN' ? [] : current.complementaryProfiles,
            cashierOnly: role === 'ADMIN' ? false : current.cashierOnly,
        }));
    };

    const handleProfileChange = (accessProfile: AccessProfileCode) => {
        setFormData((current) => ({
            ...current,
            accessProfile,
            permissions: getProfilePermissions(accessProfile),
        }));
    };

    const togglePermission = (permission: string) => {
        setFormData((current) => ({
            ...current,
            permissions: current.permissions.includes(permission)
                ? current.permissions.filter((item) => item !== permission)
                : [...current.permissions, permission],
        }));
    };

    const toggleComplementaryProfile = (profile: string) => {
        setFormData((current) => ({
            ...current,
            complementaryProfiles: current.complementaryProfiles.includes(profile)
                ? current.complementaryProfiles.filter((item) => item !== profile)
                : [...current.complementaryProfiles, profile],
            cashierOnly: profile === 'CAIXA' && current.complementaryProfiles.includes(profile)
                ? false
                : current.cashierOnly,
        }));
    };

    const lookupCep = async () => {
        if (formData.zipCode.replace(/\D/g, '').length !== 8) return;
        try {
            setIsLookingUpCep(true);
            const address = await fetchAddressByCep(formData.zipCode);
            if (!address) return;
            setFormData((current) => ({
                ...current,
                street: address.street.toUpperCase(),
                neighborhood: address.neighborhood.toUpperCase(),
                city: address.city.toUpperCase(),
                state: address.state.toUpperCase(),
            }));
        } catch (error) {
            showErrorMessage(error instanceof Error ? error.message : 'Não foi possível consultar o CEP.');
        } finally {
            setIsLookingUpCep(false);
        }
    };

    const handleSave = async (event: FormEvent) => {
        event.preventDefault();
        const token = getStoredToken();
        if (!token) {
            showErrorMessage('Sessão expirada. Faça login novamente.');
            return;
        }
        if (!formData.name.trim()) {
            showErrorMessage('Informe o nome completo do funcionário/usuário.');
            return;
        }
        if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
            showErrorMessage('Informe um e-mail válido para confirmação e recuperação.');
            return;
        }
        if (formData.accessUsername.trim() && (!/^\S{3,160}$/u.test(formData.accessUsername.trim()))) {
            showErrorMessage('Informe o usuário de acesso com 3 a 160 caracteres e sem espaços.');
            return;
        }
        if (!editingUserId && !formData.password) {
            showErrorMessage('Informe a senha inicial do usuário.');
            return;
        }
        if (formData.password || formData.passwordConfirmation) {
            if (formData.password !== formData.passwordConfirmation) {
                showErrorMessage('A confirmação da senha não confere.');
                return;
            }
            if (!/(?=.*[A-Z])(?=.*[a-z])(?=.*[^A-Za-z0-9\s]).{6,}/.test(formData.password)) {
                showErrorMessage('A senha deve ter ao menos 6 caracteres, com maiúscula, minúscula e caractere especial.');
                return;
            }
        }

        try {
            setIsSaving(true);
            const payload: Record<string, unknown> = {
                name: formData.name.toUpperCase(),
                email: formData.email.trim().toUpperCase(),
                accessUsername: formData.accessUsername.trim().toUpperCase() || undefined,
                birthDate: formData.birthDate || undefined,
                rg: formData.rg,
                cpf: formData.cpf,
                cnpj: formData.cnpj,
                nickname: formData.nickname,
                corporateName: formData.corporateName,
                phone: formData.phone,
                whatsapp: formData.whatsapp,
                cellphone1: formData.cellphone1,
                cellphone2: formData.cellphone2,
                zipCode: formData.zipCode,
                street: formData.street,
                number: formData.number,
                city: formData.city,
                state: formData.state,
                neighborhood: formData.neighborhood,
                complement: formData.complement,
                role: formData.role,
                accessProfile: formData.accessProfile,
                permissions: formData.permissions,
                complementaryProfiles: formData.complementaryProfiles,
                branchAccessCodes: tenantBranches.length > 1 ? formData.branchAccessCodes : undefined,
                cashierOnly: formData.cashierOnly,
            };
            if (formData.password) payload.password = formData.password;
            const response = await fetch(`${API_BASE_URL}/users${editingUserId ? `/${editingUserId}` : ''}`, {
                method: editingUserId ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Não foi possível salvar o usuário.');
            setIsModalOpen(false);
            setEditingUserId(null);
            await loadUsers(token);
            showSuccessMessage(editingUserId ? 'Usuário alterado com sucesso.' : 'Usuário cadastrado com sucesso.');
        } catch (error) {
            showErrorMessage(error instanceof Error ? error.message : 'Não foi possível salvar o usuário.');
        } finally {
            setIsSaving(false);
        }
    };

    const openStatusModal = (user: UserRecord) => {
        setStatusTarget(user);
        setStatusAction(user.canceledAt ? 'activate' : 'deactivate');
    };

    const closeStatusModal = () => {
        if (isProcessingStatus) return;
        setStatusTarget(null);
        setStatusAction(null);
    };

    const confirmStatus = async () => {
        if (!statusTarget || !statusAction) return;
        try {
            setIsProcessingStatus(true);
            const response = await fetch(`${API_BASE_URL}/users/${statusTarget.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: statusAction === 'activate' }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Não foi possível alterar o status do usuário.');
            closeStatusModal();
            const token = getStoredToken();
            if (token) await loadUsers(token);
            showSuccessMessage(data?.message || 'Status do usuário alterado com sucesso.');
        } catch (error) {
            showErrorMessage(error instanceof Error ? error.message : 'Não foi possível alterar o status do usuário.');
        } finally {
            setIsProcessingStatus(false);
        }
    };

    const toggleColumnVisibility = (columnKey: UserColumnKey) => {
        setHiddenColumns((current) => current.includes(columnKey)
            ? current.filter((key) => key !== columnKey)
            : [...current, columnKey]);
    };

    const moveColumn = (columnKey: UserColumnKey, direction: 'up' | 'down') => {
        setColumnOrder((current) => {
            const index = current.indexOf(columnKey);
            const nextIndex = direction === 'up' ? index - 1 : index + 1;
            if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
            const next = [...current];
            [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
            return next;
        });
    };

    const resetColumns = () => {
        setColumnOrder(DEFAULT_USER_COLUMN_ORDER);
        setHiddenColumns(DEFAULT_HIDDEN_USER_COLUMNS);
    };

    const toggleExportColumn = (columnKey: UserExportColumnKey) => {
        setExportColumns((current) => ({ ...current, [columnKey]: !current[columnKey] }));
    };

    const setAllExportColumns = (value: boolean) => {
        setExportColumns(Object.fromEntries(USER_EXPORT_COLUMNS.map((column) => [column.key, value])) as Record<UserExportColumnKey, boolean>);
    };

    if (isAuthReady && !canViewUsers) {
        return (
            <DashboardAccessDenied
                title="Acesso restrito aos usuários"
                message="Seu perfil não possui permissão para consultar os funcionários e usuários desta escola."
            />
        );
    }

    return (
        <div className="flex h-[calc(100vh-4.5rem)] min-h-0 w-full pt-0">
            <div className="flex w-full flex-col bg-transparent">
                <PrincipalProgramHeader
                    eyebrow="Escola · Administração"
                    title="Funcionários e Usuários"
                    description="Gerencie os usuários de acesso da escola, seus dados básicos, perfis e filiais liberadas."
                    schoolName={currentTenantBranding?.schoolName}
                    logoUrl={currentTenantBranding?.logoUrl}
                    secondaryAction={
                        <>
                            <button
                                type="button"
                                onClick={() => window.dispatchEvent(new Event('msinfor-financeiro-toggle-sidebar'))}
                                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/20"
                                title="Recolher menu lateral"
                                aria-label="Recolher menu lateral"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                            </button>
                            <button
                                type="button"
                                onClick={() => window.dispatchEvent(new Event('msinfor-financeiro-open-notifications'))}
                                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/20"
                                title="Abrir notificações"
                                aria-label="Abrir notificações"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                            </button>
                        </>
                    }
                />

                <div className="flex min-h-0 flex-1 px-5 pb-8 pt-5 sm:px-6 lg:px-8">
                    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="dashboard-band shrink-0 border-b px-4 py-3">
                            <div className="flex flex-wrap items-center gap-3">
                                {canManageUsers ? (
                                    <button
                                        type="button"
                                        onClick={openCreateModal}
                                        title="Cadastrar novo funcionário/usuário"
                                        aria-label="Cadastrar novo funcionário/usuário"
                                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-500 active:scale-95"
                                    >
                                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                    </button>
                                ) : null}
                                <div className="relative w-full max-w-xs">
                                    <input
                                        value={searchTerm}
                                        onChange={(event) => setSearchTerm(event.target.value)}
                                        type="text"
                                        placeholder="Buscar usuário..."
                                        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    />
                                    <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" /></svg>
                                </div>
                                <select
                                    value={roleFilter}
                                    onChange={(event) => setRoleFilter(event.target.value as UserRole | 'ALL')}
                                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold uppercase tracking-[0.08em] text-slate-600 outline-none focus:border-blue-400"
                                    aria-label="Filtrar papel"
                                >
                                    <option value="ALL">Todos os papéis</option>
                                    {USER_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                                </select>
                            </div>
                        </div>

                        {errorStatus ? <div className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorStatus}</div> : null}

                        <div className="min-h-0 flex-1 overflow-auto">
                            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                                <thead>
                                    <tr>
                                        <th className="sticky top-0 z-20 bg-slate-50 px-3 py-3" />
                                        {visibleColumns.map((column) => (
                                            <th key={column.key} className="sticky top-0 z-20 bg-slate-50 px-5 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
                                                <button
                                                    type="button"
                                                    onClick={() => setSortState((current) => ({ column: column.key, direction: current.column === column.key && current.direction === 'asc' ? 'desc' : 'asc' }))}
                                                    className="inline-flex items-center gap-1 whitespace-nowrap hover:text-blue-700"
                                                >
                                                    {column.label}
                                                    <span className="text-[10px] text-slate-400">{sortState.column === column.key ? (sortState.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
                                                </button>
                                            </th>
                                        ))}
                                        <th className="sticky top-0 z-20 bg-slate-50 px-5 py-3 text-right text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {isLoading ? (
                                        <tr><td colSpan={visibleColumns.length + 2} className="px-6 py-12 text-center font-medium text-slate-400"><div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />Sincronizando usuários...</td></tr>
                                    ) : paginatedUsers.length === 0 ? (
                                        <tr><td colSpan={visibleColumns.length + 2} className="px-6 py-12 text-center font-medium text-slate-400">Nenhum usuário encontrado para os filtros atuais.</td></tr>
                                    ) : paginatedUsers.map((user, rowIndex) => {
                                        const isSelected = selectedRowId === user.id;
                                        const baseRowClass = rowIndex % 2 === 0
                                            ? user.canceledAt ? 'bg-rose-100/80 hover:bg-rose-200/80' : 'bg-white hover:bg-slate-50'
                                            : user.canceledAt ? 'bg-rose-200/70 hover:bg-rose-300/70' : 'bg-slate-200/70 hover:bg-slate-300/60';
                                        return (
                                            <tr
                                                key={user.id}
                                                onClick={() => setSelectedRowId(user.id)}
                                                aria-selected={isSelected}
                                                className={`group cursor-pointer transition-colors ${isSelected ? 'bg-blue-100 outline outline-2 outline-blue-400 outline-offset-[-2px]' : baseRowClass}`}
                                            >
                                                <td className="px-3 py-4" />
                                                {visibleColumns.map((column) => (
                                                    <td key={column.key} className={`max-w-[280px] px-5 py-4 font-semibold text-slate-700 ${column.key === 'name' ? 'whitespace-nowrap font-black text-slate-900' : ''}`}>
                                                        {column.key === 'name' ? (
                                                            <span className="inline-flex items-center gap-2 whitespace-nowrap" title={column.getValue(user)}>
                                                                <span
                                                                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${user.canceledAt ? 'bg-red-500' : 'bg-emerald-500'}`}
                                                                    title={user.canceledAt ? 'USUÁRIO INATIVO' : 'USUÁRIO ATIVO'}
                                                                    aria-label={user.canceledAt ? 'Usuário inativo' : 'Usuário ativo'}
                                                                />
                                                                {column.getValue(user)}
                                                            </span>
                                                        ) : column.key === 'role' ? <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">{column.getValue(user)}</span> : <span className="block truncate" title={column.getValue(user)}>{column.getValue(user)}</span>}
                                                    </td>
                                                ))}
                                                <td className="px-5 py-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <UserDetails user={user} />
                                                        {canManageUsers ? <GridRowActionIconButton title="Abrir manutenção do usuário" onClick={() => openEditModal(user)} tone="blue" visualStyle="outlined"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586Z" /></svg></GridRowActionIconButton> : null}
                                                        {canManageUsers ? <GridRowActionIconButton title={user.canceledAt ? 'Ativar usuário' : 'Inativar usuário'} onClick={() => openStatusModal(user)} tone={user.canceledAt ? 'emerald' : 'rose'} visualStyle="outlined">{user.canceledAt ? <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m5 13 4 4L19 7" /></svg> : <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636 5.636 18.364M6 6l12 12" /></svg>}</GridRowActionIconButton> : null}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">
                            <div className="flex flex-wrap items-center gap-3">
                                <button type="button" onClick={() => setIsGridConfigOpen(true)} title="ALTERAR COLUNAS GRID" aria-label="ALTERAR COLUNAS GRID" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="4" y="5" width="16" height="14" rx="2" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M9 5v14M15 5v14" /></svg></button>
                                <button type="button" onClick={() => setIsExportModalOpen(true)} title="Abrir exportação e impressão" aria-label="Abrir exportação e impressão" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V4h12v5M6 18h12v2H6v-2Zm-1-8h14a2 2 0 0 1 2 2v4H3v-4a2 2 0 0 1 2-2Z" /></svg></button>
                                <GridStatusFilter value={statusFilter} onChange={setStatusFilter} activeLabel="Mostrar somente usuários ativos" allLabel="Mostrar usuários ativos e inativos" inactiveLabel="Mostrar somente usuários inativos" />
                                <span className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-[0.14em] text-slate-700">Total registros: {new Intl.NumberFormat('pt-BR').format(sortedUsers.length)}</span>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="Registros por página" className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 outline-none"><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select>
                                <button type="button" onClick={() => setPage(1)} disabled={currentPage <= 1} className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black disabled:opacity-40">{'<<'}</button>
                                <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1} className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black disabled:opacity-40">{'<'}</button>
                                <span className="min-w-14 text-center text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{currentPage}/{totalPages}</span>
                                <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage >= totalPages} className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black disabled:opacity-40">{'>'}</button>
                                <button type="button" onClick={() => setPage(totalPages)} disabled={currentPage >= totalPages} className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black disabled:opacity-40">{'>>'}</button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            <GridColumnConfigModal
                isOpen={isGridConfigOpen}
                title="Configurar colunas do grid"
                description="Reordene, oculte ou inclua colunas do cadastro de funcionários e usuários nesta tela."
                columns={USER_COLUMNS.map((column) => ({ key: column.key, label: column.label, visibleByDefault: column.visibleByDefault }))}
                orderedColumns={columnOrder}
                hiddenColumns={hiddenColumns}
                onToggleColumnVisibility={toggleColumnVisibility}
                onMoveColumn={moveColumn}
                onReset={resetColumns}
                onClose={() => setIsGridConfigOpen(false)}
            />

            <GridExportModal
                isOpen={isExportModalOpen}
                title="Exportar funcionários e usuários"
                description={`A exportação respeita os filtros atuais e inclui ${sortedUsers.length} registro(s).`}
                format={exportFormat}
                onFormatChange={setExportFormat}
                columns={USER_EXPORT_COLUMNS.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={exportColumns}
                onToggleColumn={toggleExportColumn}
                onSelectAll={setAllExportColumns}
                storageKey={`PRINCIPAL_USUARIOS_EXPORT:${currentTenantId || 'global'}`}
                onClose={() => setIsExportModalOpen(false)}
                onExport={async (config) => {
                    try {
                        await exportGridRows({
                            rows: sortedUsers,
                            columns: config?.orderedColumns
                                ? config.orderedColumns.map((key) => USER_EXPORT_COLUMNS.find((column) => column.key === key)).filter((column): column is GridColumnDefinition<UserRecord, UserExportColumnKey> => Boolean(column))
                                : USER_EXPORT_COLUMNS,
                            selectedColumns: config?.selectedColumns || exportColumns,
                            format: exportFormat,
                            pdfOptions: config?.pdfOptions,
                            fileBaseName: 'funcionarios-usuarios',
                            branding: { title: 'Funcionários e Usuários', subtitle: 'Exportação com os filtros atualmente aplicados.' },
                        });
                        setIsExportModalOpen(false);
                        showSuccessMessage(`Exportação ${exportFormat.toUpperCase()} preparada com ${sortedUsers.length} registro(s).`);
                    } catch (error) {
                        showErrorMessage(error instanceof Error ? error.message : 'Não foi possível exportar os usuários.');
                    }
                }}
            />

            <StatusConfirmationModal
                isOpen={Boolean(statusTarget && statusAction)}
                tenantId={currentTenantId}
                actionType={statusAction || 'activate'}
                title={statusAction === 'activate' ? 'Ativar usuário' : 'Inativar usuário'}
                itemLabel="Usuário"
                itemName={statusTarget?.name || ''}
                description={statusAction === 'activate' ? 'O usuário voltará a poder acessar a escola conforme seu papel e permissões.' : 'O acesso será suspenso e o histórico do usuário será preservado.'}
                confirmLabel={statusAction === 'activate' ? 'Confirmar ativação' : 'Confirmar inativação'}
                onCancel={closeStatusModal}
                onConfirm={confirmStatus}
                isProcessing={isProcessingStatus}
                statusActive={!statusTarget?.canceledAt}
                screenId={USERS_STATUS_MODAL_SCREEN_ID}
            />

            {isModalOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm">
                    <div className="flex max-h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <MaintenanceModalHeader
                            title={editingUserId ? `Editar funcionário/usuário: ${formData.name || 'USUÁRIO'}` : 'Cadastrar funcionário/usuário'}
                            eyebrow="Escola · Administração"
                            description="Preencha os dados básicos, contatos, endereço e acesso do usuário."
                            tenantId={currentTenantId}
                            schoolName={currentTenantBranding?.schoolName}
                            logoUrl={currentTenantBranding?.logoUrl}
                            onClose={closeModal}
                        />
                        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-slate-200 bg-slate-50/50 px-4 pt-2">
                            {[
                                { id: 1, label: '1. DADOS BÁSICOS E CONTATOS' },
                                { id: 2, label: '2. ENDEREÇO E LOGÍSTICA' },
                                { id: 3, label: '3. PERFIL E PERMISSÕES' },
                                { id: 4, label: '4. FILIAIS DE ACESSO' },
                                { id: 5, label: '5. SENHA DE ACESSO' },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    aria-selected={activeTab === tab.id}
                                    className={`shrink-0 rounded-t-lg px-3 py-1.5 text-xs font-bold tracking-wide transition-colors ${activeTab === tab.id ? 'border-l border-r border-t border-slate-200 bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-blue-600'}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <form id="principal-usuarios-form" onSubmit={handleSave} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                            <div className="space-y-5">
                                {activeTab === 1 ? <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <h3 className="border-b border-blue-100 pb-2 text-sm font-black uppercase tracking-[0.16em] text-blue-800">1. Dados básicos e identificação</h3>
                                    <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                        <div className="lg:col-span-2"><InputField label="Nome completo do funcionário/usuário" value={formData.name} onChange={(value) => updateFormField('name', value.toUpperCase())} placeholder="NOME COMPLETO" required /></div>
                                        <InputField label="CPF" value={formData.cpf} onChange={(value) => updateFormField('cpf', formatCpfInput(value))} placeholder="000.000.000-00" />
                                        <InputField label="Data de nascimento" value={formData.birthDate} onChange={(value) => updateFormField('birthDate', value)} type="date" />
                                        <InputField label="RG" value={formData.rg} onChange={(value) => updateFormField('rg', value.toUpperCase())} />
                                        <InputField label="CNPJ (PJ/MEI se houver)" value={formData.cnpj} onChange={(value) => updateFormField('cnpj', formatCnpjInput(value))} />
                                        <InputField label="Apelido" value={formData.nickname} onChange={(value) => updateFormField('nickname', value.toUpperCase())} />
                                        <div className="lg:col-span-2"><InputField label="Nome empresarial" value={formData.corporateName} onChange={(value) => updateFormField('corporateName', value.toUpperCase())} /></div>
                                    </div>
                                </section> : null}

                                {activeTab === 1 ? <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <h3 className="border-b border-blue-100 pb-2 text-sm font-black uppercase tracking-[0.16em] text-blue-800">2. Contatos</h3>
                                    <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                        <InputField label="Telefone" value={formData.phone} onChange={(value) => updateFormField('phone', formatPhoneInput(value))} />
                                        <InputField label="WhatsApp" value={formData.whatsapp} onChange={(value) => updateFormField('whatsapp', formatPhoneInput(value))} />
                                        <InputField label="Celular 1" value={formData.cellphone1} onChange={(value) => updateFormField('cellphone1', formatPhoneInput(value))} />
                                        <InputField label="Celular 2" value={formData.cellphone2} onChange={(value) => updateFormField('cellphone2', formatPhoneInput(value))} />
                                    </div>
                                </section> : null}

                                {activeTab === 2 ? <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <h3 className="border-b border-blue-100 pb-2 text-sm font-black uppercase tracking-[0.16em] text-blue-800">2. Endereço e logística</h3>
                                    <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                        <label className="block">
                                            <span className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-600">{isLookingUpCep ? 'CEP (consultando...)' : 'CEP'}</span>
                                            <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-slate-50 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
                                                <input
                                                    type="text"
                                                    value={formData.zipCode}
                                                    onChange={(event) => updateFormField('zipCode', formatCepInput(event.target.value))}
                                                    onBlur={() => void lookupCep()}
                                                    placeholder="00000-000"
                                                    className="min-w-0 flex-1 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:bg-white"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => void lookupCep()}
                                                    disabled={isLookingUpCep}
                                                    className="flex w-12 shrink-0 items-center justify-center border-l border-slate-200 text-blue-600 transition hover:bg-white disabled:cursor-wait disabled:text-slate-400"
                                                    aria-label="Consultar CEP"
                                                    title="Consultar CEP pela API ViaCEP"
                                                >
                                                    {isLookingUpCep ? (
                                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                                                    ) : (
                                                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                                            <circle cx="11" cy="11" r="6.5" />
                                                            <path strokeLinecap="round" d="m16 16 4.5 4.5" />
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
                                        </label>
                                        <div className="lg:col-span-2"><InputField label="Logradouro" value={formData.street} onChange={(value) => updateFormField('street', value.toUpperCase())} /></div>
                                        <InputField label="Número" value={formData.number} onChange={(value) => updateFormField('number', value.toUpperCase())} />
                                        <InputField label="Bairro" value={formData.neighborhood} onChange={(value) => updateFormField('neighborhood', value.toUpperCase())} />
                                        <InputField label="Cidade" value={formData.city} onChange={(value) => updateFormField('city', value.toUpperCase())} />
                                        <InputField label="UF" value={formData.state} onChange={(value) => updateFormField('state', value.toUpperCase().slice(0, 2))} />
                                        <InputField label="Complemento" value={formData.complement} onChange={(value) => updateFormField('complement', value.toUpperCase())} />
                                    </div>
                                </section> : null}

                                {activeTab === 3 ? <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <h3 className="border-b border-blue-100 pb-2 text-sm font-black uppercase tracking-[0.16em] text-blue-800">3. Perfil e permissões</h3>
                                    <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                        <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-600">Papel no sistema *</span><select value={formData.role} onChange={(event) => handleRoleChange(event.target.value as UserRole)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"><option value="ADMIN">ADMINISTRADOR</option><option value="SECRETARIA">SECRETARIA</option><option value="COORDENACAO">COORDENAÇÃO</option></select></label>
                                        <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-600">Perfil predefinido *</span><select value={formData.accessProfile} onChange={(event) => handleProfileChange(event.target.value as AccessProfileCode)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-500">{getProfilesForRole(formData.role as AccessRole).map((profile) => <option key={profile.code} value={profile.code}>{profile.label}</option>)}</select></label>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-3">
                                        {['FINANCEIRO', 'CAIXA'].map((profile) => (
                                            <label key={profile} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700">
                                                <input type="checkbox" checked={formData.complementaryProfiles.includes(profile)} onChange={() => toggleComplementaryProfile(profile)} disabled={formData.role === 'ADMIN'} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                                                {profile}
                                            </label>
                                        ))}
                                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-amber-800">
                                            <input type="checkbox" checked={formData.cashierOnly} onChange={(event) => setFormData((current) => ({ ...current, cashierOnly: event.target.checked, complementaryProfiles: event.target.checked && !current.complementaryProfiles.includes('CAIXA') ? [...current.complementaryProfiles, 'CAIXA'] : current.complementaryProfiles }))} disabled={formData.role === 'ADMIN'} className="h-4 w-4 rounded border-amber-300 text-amber-600" />
                                            ACESSO EXCLUSIVO AO CAIXA
                                        </label>
                                    </div>
                                    <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                        <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.12em] text-slate-700">Permissões específicas ({formData.permissions.length})</summary>
                                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                            {PERMISSION_OPTIONS.map((permission) => (
                                                <label key={permission.value} className="inline-flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                                                    <input type="checkbox" checked={formData.permissions.includes(permission.value)} onChange={() => togglePermission(permission.value)} disabled={formData.role === 'ADMIN'} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600" />
                                                    {permission.label}
                                                </label>
                                            ))}
                                        </div>
                                    </details>
                                </section> : null}

                                {activeTab === 4 ? <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <h3 className="border-b border-blue-100 pb-2 text-sm font-black uppercase tracking-[0.16em] text-blue-800">4. Filiais de acesso</h3>
                                    <p className="mt-2 text-xs font-medium text-slate-500">Defina em quais filiais este funcionário/usuário poderá atuar. Administradores mantêm acesso a todas as filiais.</p>
                                    <div className="mt-4 max-w-xl">
                                        <TenantBranchSelect
                                            branches={tenantBranches}
                                            value={formData.branchAccessCodes[0] || 0}
                                            onChange={(branchCode) => updateFormField('branchAccessCodes', branchCode === 0 ? tenantBranches.map((branch) => branch.branchCode) : [branchCode])}
                                            mode="multiple"
                                            selectedBranchCodes={formData.branchAccessCodes}
                                            onSelectedBranchCodesChange={(codes) => updateFormField('branchAccessCodes', codes)}
                                            label="Filiais de acesso"
                                            labelClassName="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-600"
                                        />
                                    </div>
                                </section> : null}

                                {activeTab === 5 ? <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <h3 className="border-b border-blue-100 pb-2 text-sm font-black uppercase tracking-[0.16em] text-blue-800">5. Senha de acesso</h3>
                                    <p className="mt-2 text-xs font-medium text-slate-500">Forneça as credenciais para que o funcionário/usuário acesse o sistema da escola.</p>
                                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                                        <label className="block">
                                            <span className="mb-1 block text-xs font-bold text-slate-600">Nome Usuário Usado na Tela de Login (Não deve conter espaços)</span>
                                            <input
                                                type="text"
                                                value={formData.accessUsername}
                                                onChange={(event) => updateFormField('accessUsername', event.target.value.toUpperCase())}
                                                placeholder="USUÁRIO OU E-MAIL"
                                                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                            />
                                            <span className="mt-1 block text-xs font-medium text-slate-500">Se não informar outro usuário, o e-mail será usado no login.</span>
                                        </label>
                                        <label className="block md:col-span-2">
                                            <span className="mb-1 block text-xs font-bold text-slate-600">E-mail para confirmação e recuperação *</span>
                                            <input
                                                type="email"
                                                value={formData.email}
                                                onChange={(event) => updateFormField('email', event.target.value.toUpperCase())}
                                                placeholder="E-mail para contato e recuperação"
                                                required
                                                disabled={Boolean(editingUserId)}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                                            />
                                            <span className="mt-1 block text-xs font-medium text-slate-500">Obrigatório para confirmação e recuperação da conta.</span>
                                        </label>
                                    </div>
                                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                                        <PasswordField label="Senha de acesso" value={formData.password} onChange={(value) => updateFormField('password', value)} placeholder={editingUserId ? 'Preencha somente para trocar a senha' : 'Defina a senha do funcionário/usuário'} required={!editingUserId} />
                                        <PasswordField label="Confirmar senha de acesso" value={formData.passwordConfirmation} onChange={(value) => updateFormField('passwordConfirmation', value)} placeholder="Repita a senha de acesso" required={!editingUserId} />
                                    </div>
                                </section> : null}
                            </div>
                        </form>
                        <MaintenanceModalFooter
                            screenId={USERS_FORM_MODAL_SCREEN_ID}
                            formId="principal-usuarios-form"
                            saveLabel={editingUserId ? 'Salvar alterações' : 'Salvar usuário'}
                            savingLabel="Salvando..."
                            isSaving={isSaving}
                            disabled={!canManageUsers}
                            screenNameCompact
                            originText="Origem: Sistema Escola - PRINCIPAL_USUARIOS"
                            auditText="Cadastro administrativo de usuário com pessoa compartilhada por tenant, perfil, permissões e filiais de acesso."
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}
