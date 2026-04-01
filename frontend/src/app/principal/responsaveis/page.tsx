'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import GridColumnConfigModal from '@/app/components/grid-column-config-modal';
import GridExportModal from '@/app/components/grid-export-modal';
import GridFooterControls from '@/app/components/grid-footer-controls';
import RecordStatusIndicator from '@/app/components/record-status-indicator';
import GridRecordPopover from '@/app/components/grid-record-popover';
import GridRowActionIconButton from '@/app/components/grid-row-action-icon-button';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import StatusConfirmationModal from '@/app/components/status-confirmation-modal';
import { type GridStatusFilterValue } from '@/app/components/grid-status-filter';
import GridSortableHeader from '@/app/components/grid-sortable-header';
import {
    fetchAddressByCep,
    fetchEmailUsageByEmail,
    fetchSharedPersonNameSuggestions,
    fetchSharedPersonProfileByCpf,
    fetchSharedPersonProfileByEmail,
    formatCnpj,
    formatCpf,
    formatPhone,
    getAllowedDashboardFields,
    getDashboardAuthContext,
    hasDashboardPermission,
    isValidCnpj,
    isValidCpf,
    mergeSharedPersonIntoForm,
    type EmailUsageRecord,
    type SharedNameSuggestion,
} from '@/app/lib/dashboard-crud-utils';
import { getAllGridColumnKeys, getDefaultVisibleGridColumnKeys, loadGridColumnConfig, type ConfigurableGridColumn, writeGridColumnConfig } from '@/app/lib/grid-column-config-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import {
    getDefaultAccessProfileForRole,
    getProfilePermissions,
    getProfilesForRole,
    PERMISSION_OPTIONS,
    type AccessProfileCode,
} from '@/app/lib/access-profiles';
const RESPONSAVEIS_STATUS_MODAL_SCREEN_ID = 'PRINCIPAL_RESPONSAVEIS_STATUS_MODAL';
import { buildDefaultExportColumns, buildExportColumnsFromGridColumns, exportGridRows, sortGridRows, type GridColumnDefinition, type GridSortState } from '@/app/lib/grid-export-utils';

const API_BASE_URL = 'http://localhost:3001/api/v1';

type GuardianStudentLink = {
    id: string;
    kinship?: string | null;
    kinshipDescription?: string | null;
    student?: { id: string; name: string } | null;
};

type EmailUsageAlert = {
    email: string;
    usages: EmailUsageRecord[];
    currentTenantId: string | null;
    currentTenantName: string;
};

type GuardianRecord = {
    id: string;
    canceledAt?: string | null;
    name: string;
    birthDate?: string | null;
    cpf?: string | null;
    rg?: string | null;
    cnpj?: string | null;
    nickname?: string | null;
    corporateName?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    cellphone1?: string | null;
    cellphone2?: string | null;
    email?: string | null;
    zipCode?: string | null;
    street?: string | null;
    number?: string | null;
    city?: string | null;
    state?: string | null;
    neighborhood?: string | null;
    complement?: string | null;
    accessProfile?: AccessProfileCode | null;
    permissions?: string[];
    students?: GuardianStudentLink[];
};

type GuardianFormState = {
    name: string; birthDate: string; cpf: string; rg: string; cnpj: string; nickname: string; corporateName: string;
    phone: string; whatsapp: string; cellphone1: string; cellphone2: string; email: string;
    zipCode: string; street: string; number: string; city: string; state: string; neighborhood: string; complement: string;
    accessProfile: AccessProfileCode; permissions: string[];
};

const DEFAULT_GUARDIAN_PROFILE = getDefaultAccessProfileForRole('RESPONSAVEL');

const EMPTY_FORM: GuardianFormState = {
    name: '', birthDate: '', cpf: '', rg: '', cnpj: '', nickname: '', corporateName: '',
    phone: '', whatsapp: '', cellphone1: '', cellphone2: '', email: '',
    zipCode: '', street: '', number: '', city: '', state: '', neighborhood: '', complement: '',
    accessProfile: DEFAULT_GUARDIAN_PROFILE, permissions: getProfilePermissions(DEFAULT_GUARDIAN_PROFILE),
};

const inputClass = 'w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white';
const labelClass = 'mb-1 block text-xs font-bold text-slate-600';

type GuardianColumnKey =
    | 'name'
    | 'nickname'
    | 'corporateName'
    | 'birthDate'
    | 'cpf'
    | 'rg'
    | 'cnpj'
    | 'contact'
    | 'email'
    | 'phone'
    | 'whatsapp'
    | 'cellphone1'
    | 'cellphone2'
    | 'zipCode'
    | 'street'
    | 'number'
    | 'neighborhood'
    | 'complement'
    | 'city'
    | 'state'
    | 'cityState'
    | 'address'
    | 'accessProfile'
    | 'students';

type GuardianExportColumnKey = GuardianColumnKey | 'recordStatus' | 'permissions';

const GUARDIAN_COLUMNS: ConfigurableGridColumn<GuardianRecord, GuardianColumnKey>[] = [
    { key: 'name', label: 'Responsável', getValue: (row) => row.name || '---', visibleByDefault: true },
    { key: 'nickname', label: 'Apelido', getValue: (row) => row.nickname || '---', visibleByDefault: false },
    { key: 'corporateName', label: 'Nome empresarial', getValue: (row) => row.corporateName || '---', visibleByDefault: false },
    { key: 'birthDate', label: 'Nascimento', getValue: (row) => formatGuardianDate(row.birthDate), visibleByDefault: false },
    { key: 'cpf', label: 'CPF', getValue: (row) => row.cpf || '---', visibleByDefault: true },
    { key: 'rg', label: 'RG', getValue: (row) => row.rg || '---', visibleByDefault: false },
    { key: 'cnpj', label: 'CNPJ', getValue: (row) => row.cnpj || '---', visibleByDefault: false },
    { key: 'contact', label: 'Contato / Login', getValue: (row) => row.email || row.whatsapp || row.phone || row.cellphone1 || '---', visibleByDefault: true },
    { key: 'email', label: 'E-mail de login', getValue: (row) => row.email || '---', visibleByDefault: false },
    { key: 'phone', label: 'Telefone', getValue: (row) => row.phone || '---', visibleByDefault: false },
    { key: 'whatsapp', label: 'WhatsApp', getValue: (row) => row.whatsapp || '---', visibleByDefault: false },
    { key: 'cellphone1', label: 'Telefone 1', getValue: (row) => row.cellphone1 || '---', visibleByDefault: false },
    { key: 'cellphone2', label: 'Telefone 2', getValue: (row) => row.cellphone2 || '---', visibleByDefault: false },
    { key: 'zipCode', label: 'CEP', getValue: (row) => row.zipCode || '---', visibleByDefault: false },
    { key: 'street', label: 'Logradouro', getValue: (row) => row.street || '---', visibleByDefault: false },
    { key: 'number', label: 'Número', getValue: (row) => row.number || '---', visibleByDefault: false },
    { key: 'neighborhood', label: 'Bairro', getValue: (row) => row.neighborhood || '---', visibleByDefault: false },
    { key: 'complement', label: 'Complemento', getValue: (row) => row.complement || '---', visibleByDefault: false },
    { key: 'city', label: 'Cidade', getValue: (row) => row.city || '---', visibleByDefault: false },
    { key: 'state', label: 'UF', getValue: (row) => row.state || '---', visibleByDefault: false },
    { key: 'cityState', label: 'Cidade / UF', getValue: (row) => [row.city, row.state].filter(Boolean).join(' / ') || '---', visibleByDefault: false },
    { key: 'address', label: 'Endereço', getValue: (row) => formatGuardianAddress(row), visibleByDefault: false },
    { key: 'accessProfile', label: 'Perfil', getValue: (row) => formatGuardianAccessProfile(row.accessProfile), visibleByDefault: false },
    {
        key: 'students',
        label: 'Alunos vinculados',
        getValue: (row) => row.students?.length ? `${row.students.length} aluno(s)` : 'Nenhum vínculo',
        getSortValue: (row) => row.students?.length || 0,
        visibleByDefault: true,
    },
];

const GUARDIAN_EXPORT_COLUMNS: GridColumnDefinition<GuardianRecord, GuardianExportColumnKey>[] = buildExportColumnsFromGridColumns<GuardianRecord, GuardianColumnKey, 'recordStatus' | 'permissions'>(
    GUARDIAN_COLUMNS,
    [
        { key: 'recordStatus', label: 'Status do cadastro', getValue: (row) => row.canceledAt ? 'INATIVO' : 'ATIVO' },
        { key: 'permissions', label: 'Permissões específicas', getValue: (row) => formatGuardianPermissions(row.permissions) },
    ],
);
const GUARDIAN_COLUMN_KEYS = getAllGridColumnKeys(GUARDIAN_COLUMNS);
const DEFAULT_VISIBLE_GUARDIAN_COLUMNS = getDefaultVisibleGridColumnKeys(GUARDIAN_COLUMNS);

function getGuardianGridConfigStorageKey(tenantId: string | null) {
    return `dashboard:responsaveis:grid-config:${tenantId || 'default'}`;
}

function getGuardianExportConfigStorageKey(tenantId: string | null) {
    return `dashboard:responsaveis:export-config:${tenantId || 'default'}`;
}

const DEFAULT_SORT: GridSortState<GuardianColumnKey> = {
    column: 'name',
    direction: 'asc',
};

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function formatGuardianDate(value?: string | null) {
    return value ? new Date(value).toLocaleDateString() : '---';
}

function formatGuardianAddress(guardian: GuardianRecord) {
    return [guardian.street, guardian.number, guardian.neighborhood].filter(Boolean).join(', ') || '---';
}

function formatGuardianAccessProfile(value?: AccessProfileCode | null) {
    return value ? value.replaceAll('_', ' ') : 'PADRÃO';
}

function formatGuardianPermissions(permissions?: string[]) {
    const permissionLabels = permissions
        ?.map((permission) => PERMISSION_OPTIONS.find((option) => option.value === permission)?.label || permission)
        .filter(Boolean) || [];
    return permissionLabels.length > 0 ? permissionLabels.join(', ') : '---';
}

function formatGuardianStudents(guardian: GuardianRecord) {
    const students = guardian.students?.map((item) => item.student?.name).filter(Boolean) || [];
    return students.length > 0 ? students.join(' | ') : 'Sem alunos vinculados';
}

function formatGuardianStudentLinks(guardian: GuardianRecord) {
    const students = guardian.students
        ?.map((item) => {
            const studentName = item.student?.name || 'Aluno';
            const kinship = item.kinship === 'OUTROS' && item.kinshipDescription
                ? item.kinshipDescription
                : item.kinship || 'SEM PARENTESCO';
            return `${studentName} (${kinship})`;
        })
        .filter(Boolean) || [];

    return students.length > 0 ? students.join(' | ') : 'Sem alunos vinculados';
}

function normalizeSystemRoleLabel(role: string) {
    const key = String(role || '').toUpperCase().trim();
    if (!key) return null;
    if (key === 'TEACHER' || key === 'PROFESSOR') return 'PROFESSOR';
    if (key === 'STUDENT' || key === 'ALUNO') return 'ALUNO';
    if (key === 'GUARDIAN' || key === 'RESPONSAVEL') return 'RESPONSAVEL';
    if (['ADMIN', 'ADMINISTRADOR', 'SCHOOL_ADMIN', 'TENANT_ADMIN', 'ADMIN_ESCOLA'].includes(key)) return 'ADMINISTRADOR';
    if (key === 'SECRETARIA') return 'SECRETARIA';
    if (key === 'COORDENACAO') return 'COORDENACAO';
    if (key === 'USUARIO_ESCOLA' || key === 'USER') return 'ADMINISTRATIVO';
    return key.replaceAll('_', ' ');
}

function buildSystemRoleBadges(roles?: string[]) {
    const normalizedRoles = (roles || [])
        .map((role) => normalizeSystemRoleLabel(role))
        .filter((role): role is string => Boolean(role));

    if (!normalizedRoles.includes('RESPONSAVEL')) {
        normalizedRoles.unshift('RESPONSAVEL');
    }

    return Array.from(new Set(normalizedRoles));
}

export default function ResponsaveisPage() {
    const [guardians, setGuardians] = useState<GuardianRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(1);
    const [editingGuardianId, setEditingGuardianId] = useState<string | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [formData, setFormData] = useState<GuardianFormState>(EMPTY_FORM);
    const [selectedGuardianForStudents, setSelectedGuardianForStudents] = useState<GuardianRecord | null>(null);
    const [sortState, setSortState] = useState<GridSortState<GuardianColumnKey>>(DEFAULT_SORT);
    const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
    const [isGridConfigOpen, setIsGridConfigOpen] = useState(false);
    const [isGridConfigReady, setIsGridConfigReady] = useState(false);
    const [columnOrder, setColumnOrder] = useState<GuardianColumnKey[]>(GUARDIAN_COLUMN_KEYS);
    const [hiddenColumns, setHiddenColumns] = useState<GuardianColumnKey[]>(
        GUARDIAN_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_GUARDIAN_COLUMNS.includes(key)),
    );
    const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFormat, setExportFormat] = useState<'excel' | 'csv' | 'pdf' | 'json' | 'txt'>('excel');
    const [exportColumns, setExportColumns] = useState<Record<GuardianExportColumnKey, boolean>>(buildDefaultExportColumns(GUARDIAN_EXPORT_COLUMNS));
    const [guardianStatusToggleTarget, setGuardianStatusToggleTarget] = useState<GuardianRecord | null>(null);
    const [guardianStatusToggleAction, setGuardianStatusToggleAction] = useState<'activate' | 'deactivate' | null>(null);
    const [isProcessingGuardianToggle, setIsProcessingGuardianToggle] = useState(false);
    const [personSystemRoles, setPersonSystemRoles] = useState<string[]>(['RESPONSAVEL']);
    const [nameSuggestions, setNameSuggestions] = useState<SharedNameSuggestion[]>([]);
    const [showNameSuggestions, setShowNameSuggestions] = useState(false);
    const [isLoadingNameSuggestions, setIsLoadingNameSuggestions] = useState(false);
    const [nameSuggestionError, setNameSuggestionError] = useState<string | null>(null);
    const [debouncedGuardianNameQuery, setDebouncedGuardianNameQuery] = useState('');
    const [emailUsageAlert, setEmailUsageAlert] = useState<EmailUsageAlert | null>(null);

    const canViewGuardians = hasDashboardPermission(currentRole, currentPermissions, 'VIEW_GUARDIANS');
    const canManageGuardians = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_GUARDIANS');
    const guardianFieldAccess = getAllowedDashboardFields(currentRole, currentPermissions, {
        contact: 'VIEW_GUARDIAN_CONTACT_DATA',
        financial: 'VIEW_GUARDIAN_FINANCIAL_DATA',
        sensitive: 'VIEW_GUARDIAN_SENSITIVE_DATA',
        access: 'VIEW_GUARDIAN_ACCESS_DATA',
    });
    const availableGuardianColumns = useMemo(
        () => GUARDIAN_COLUMNS.filter((column) => {
            if (['cpf', 'rg', 'cnpj'].includes(column.key) && !guardianFieldAccess.sensitive) return false;
            if (['phone', 'whatsapp', 'cellphone1', 'cellphone2', 'zipCode', 'street', 'number', 'neighborhood', 'complement', 'city', 'state', 'cityState', 'address'].includes(column.key) && !guardianFieldAccess.contact) return false;
            if (['email', 'accessProfile'].includes(column.key) && !guardianFieldAccess.access) return false;
            if (column.key === 'contact' && !guardianFieldAccess.contact && !guardianFieldAccess.access) return false;
            return true;
        }),
        [guardianFieldAccess.access, guardianFieldAccess.contact, guardianFieldAccess.sensitive],
    );
    const availableGuardianExportColumns = useMemo(
        () => GUARDIAN_EXPORT_COLUMNS.filter((column) => {
            if (['cpf', 'rg', 'cnpj'].includes(column.key) && !guardianFieldAccess.sensitive) return false;
            if (['phone', 'whatsapp', 'cellphone1', 'cellphone2', 'zipCode', 'street', 'number', 'neighborhood', 'complement', 'city', 'state', 'cityState', 'address'].includes(column.key) && !guardianFieldAccess.contact) return false;
            if (['email', 'accessProfile', 'permissions'].includes(column.key) && !guardianFieldAccess.access) return false;
            if (column.key === 'contact' && !guardianFieldAccess.contact && !guardianFieldAccess.access) return false;
            return true;
        }),
        [guardianFieldAccess.access, guardianFieldAccess.contact, guardianFieldAccess.sensitive],
    );
    const orderedGuardianColumns = useMemo(
        () => columnOrder.map((key) => availableGuardianColumns.find((column) => column.key === key)).filter((column): column is ConfigurableGridColumn<GuardianRecord, GuardianColumnKey> => !!column),
        [availableGuardianColumns, columnOrder],
    );
    const visibleGuardianColumns = useMemo(
        () => orderedGuardianColumns.filter((column) => !hiddenColumns.includes(column.key)),
        [hiddenColumns, orderedGuardianColumns],
    );
    const filteredGuardians = useMemo(() => {
        const term = searchTerm.trim().toUpperCase();
        return guardians.filter((guardian) => {
            const isActive = !guardian.canceledAt;
            const matchesStatus =
                statusFilter === 'ALL'
                    ? true
                    : statusFilter === 'ACTIVE'
                        ? isActive
                        : !isActive;
            const matchesSearch =
                !term ||
                [guardian.name, guardian.email, guardian.cpf, guardian.whatsapp, guardian.phone]
                    .some((value) => String(value || '').toUpperCase().includes(term));
            return matchesStatus && matchesSearch;
        });
    }, [guardians, searchTerm, statusFilter]);
    const sortedFilteredGuardians = useMemo(
        () => sortGridRows(filteredGuardians, GUARDIAN_COLUMNS, sortState),
        [filteredGuardians, sortState],
    );
    const currentTenantBranding = useMemo(
        () => readCachedTenantBranding(currentTenantId),
        [currentTenantId],
    );

    const resolvePersonSystemRoles = async (cpf?: string | null, email?: string | null) => {
        const normalizedCpf = String(cpf || '').replace(/\D/g, '');
        const normalizedEmail = String(email || '').trim().toUpperCase();

        try {
            const [cpfProfile, emailProfile] = await Promise.all([
                normalizedCpf.length === 11 ? fetchSharedPersonProfileByCpf(normalizedCpf) : Promise.resolve(null),
                normalizedEmail.includes('@') ? fetchSharedPersonProfileByEmail(normalizedEmail) : Promise.resolve(null),
            ]);
            setPersonSystemRoles(buildSystemRoleBadges([...(cpfProfile?.roles || []), ...(emailProfile?.roles || [])]));
        } catch {
            setPersonSystemRoles(['RESPONSAVEL']);
        }
    };

    const fetchGuardians = async () => {
        try {
            setIsLoading(true);
            setErrorStatus(null);
            const { token, role, permissions, tenantId } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');
            setCurrentRole(role);
            setCurrentPermissions(permissions);
            setCurrentTenantId(tenantId);
            const response = await fetch(`${API_BASE_URL}/guardians`, { headers: { Authorization: `Bearer ${token}` } });
            if (!response.ok) {
                const err = await response.json().catch(() => null);
                throw new Error(err?.message || 'Falha ao buscar responsáveis.');
            }
            const data = await response.json();
            setGuardians(Array.isArray(data) ? data : []);
        } catch (error) {
            setErrorStatus(errorMessage(error, 'Não foi possível carregar os responsáveis.'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { void fetchGuardians(); }, []);

    useEffect(() => {
        let isMounted = true;
        setIsGridConfigReady(false);
        void loadGridColumnConfig(getGuardianGridConfigStorageKey(currentTenantId), GUARDIAN_COLUMN_KEYS, DEFAULT_VISIBLE_GUARDIAN_COLUMNS).then((config) => {
            if (!isMounted) return;
            setColumnOrder(config.order);
            setHiddenColumns(config.hidden);
            setIsGridConfigReady(true);
        });
        return () => {
            isMounted = false;
        };
    }, [currentTenantId]);

    useEffect(() => {
        if (!isGridConfigReady) return;
        writeGridColumnConfig(getGuardianGridConfigStorageKey(currentTenantId), GUARDIAN_COLUMN_KEYS, columnOrder, hiddenColumns);
    }, [columnOrder, currentTenantId, hiddenColumns, isGridConfigReady]);

    useEffect(() => {
        if (!isModalOpen || !!editingGuardianId) {
            setDebouncedGuardianNameQuery('');
            setNameSuggestionError(null);
            return;
        }

        const nameQuery = String(formData.name || '').trim();
        if (nameQuery.length < 2) {
            setDebouncedGuardianNameQuery('');
            setNameSuggestions([]);
            setShowNameSuggestions(false);
            setIsLoadingNameSuggestions(false);
            setNameSuggestionError(null);
            return;
        }

        const timer = window.setTimeout(() => {
            setDebouncedGuardianNameQuery(nameQuery);
        }, 260);

        return () => window.clearTimeout(timer);
    }, [editingGuardianId, formData.name, isModalOpen]);

    useEffect(() => {
        if (!isModalOpen || !!editingGuardianId || !debouncedGuardianNameQuery) return;

        let isActive = true;
        setIsLoadingNameSuggestions(true);
        setShowNameSuggestions(true);
        setNameSuggestionError(null);

        void fetchSharedPersonNameSuggestions(debouncedGuardianNameQuery, 8)
            .then((remoteSuggestions) => {
                if (!isActive) return;
                setNameSuggestions(remoteSuggestions);
            })
            .catch((error: unknown) => {
                if (!isActive) return;
                setNameSuggestions([]);
                setNameSuggestionError(error instanceof Error ? error.message : 'Não foi possível carregar sugestões agora.');
            })
            .finally(() => {
                if (!isActive) return;
                setIsLoadingNameSuggestions(false);
            });

        return () => {
            isActive = false;
        };
    }, [debouncedGuardianNameQuery, editingGuardianId, isModalOpen]);

    if (!isLoading && !canViewGuardians) {
        return (
            <DashboardAccessDenied
                title="Acesso restrito aos responsáveis"
                message="Seu perfil não tem autorização para consultar ou manter o cadastro de responsáveis desta escola."
            />
        );
    }

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingGuardianId(null);
        setActiveTab(1);
        setFormData(EMPTY_FORM);
        setPersonSystemRoles(['RESPONSAVEL']);
        setNameSuggestions([]);
        setShowNameSuggestions(false);
        setIsLoadingNameSuggestions(false);
        setNameSuggestionError(null);
        setEmailUsageAlert(null);
    };

    const openModal = () => {
        setEditingGuardianId(null);
        setActiveTab(1);
        setFormData(EMPTY_FORM);
        setPersonSystemRoles(['RESPONSAVEL']);
        setNameSuggestions([]);
        setShowNameSuggestions(false);
        setIsLoadingNameSuggestions(false);
        setNameSuggestionError(null);
        setIsModalOpen(true);
    };

    const handleEdit = (guardian: GuardianRecord) => {
        setEditingGuardianId(guardian.id);
        setActiveTab(1);
        setFormData({
            name: guardian.name || '',
            birthDate: guardian.birthDate ? new Date(guardian.birthDate).toISOString().split('T')[0] : '',
            cpf: guardian.cpf || '',
            rg: guardian.rg || '',
            cnpj: guardian.cnpj || '',
            nickname: guardian.nickname || '',
            corporateName: guardian.corporateName || '',
            phone: guardian.phone || '',
            whatsapp: guardian.whatsapp || '',
            cellphone1: guardian.cellphone1 || '',
            cellphone2: guardian.cellphone2 || '',
            email: guardian.email || '',
            zipCode: guardian.zipCode || '',
            street: guardian.street || '',
            number: guardian.number || '',
            city: guardian.city || '',
            state: guardian.state || '',
            neighborhood: guardian.neighborhood || '',
            complement: guardian.complement || '',
            accessProfile: guardian.accessProfile || DEFAULT_GUARDIAN_PROFILE,
            permissions: Array.isArray(guardian.permissions) && guardian.permissions.length > 0
                ? guardian.permissions
                : getProfilePermissions(guardian.accessProfile || DEFAULT_GUARDIAN_PROFILE),
        });
        setPersonSystemRoles(buildSystemRoleBadges(['RESPONSAVEL']));
        setNameSuggestions([]);
        setShowNameSuggestions(false);
        setIsLoadingNameSuggestions(false);
        setNameSuggestionError(null);
        void resolvePersonSystemRoles(guardian.cpf, guardian.email);
        setIsModalOpen(true);
    };

    const handleOpenStudentsModal = (guardian: GuardianRecord) => {
        setSelectedGuardianForStudents(guardian);
    };

    const handleCpfBlur = async () => {
        if (!formData.cpf || editingGuardianId) return;

        try {
            const profile = await fetchSharedPersonProfileByCpf(formData.cpf);
            if (!profile) {
                setPersonSystemRoles(['RESPONSAVEL']);
                return;
            }

            setFormData((current) => (
                mergeSharedPersonIntoForm(
                    current as unknown as Record<string, string>,
                    profile,
                ) as unknown as GuardianFormState
            ));
            setPersonSystemRoles(buildSystemRoleBadges(profile.roles));
        } catch (error) {
            setSaveError(errorMessage(error, 'Não foi possível reaproveitar os dados deste CPF.'));
        }
    };

    const handleEmailUsageBlur = async () => {
        const normalizedEmail = String(formData.email || '').trim().toUpperCase();

        if (!normalizedEmail || !normalizedEmail.includes('@')) {
            setEmailUsageAlert(null);
            return;
        }

        try {
            const usages = await fetchEmailUsageByEmail(normalizedEmail);
            const filteredUsages = usages.filter((usage) => {
                if (!editingGuardianId) return true;
                return !(usage.entityType === 'GUARDIAN' && usage.recordId === editingGuardianId);
            });

            if (filteredUsages.length === 0) {
                setEmailUsageAlert(null);
                return;
            }

            setEmailUsageAlert({
                email: normalizedEmail,
                usages: filteredUsages,
                currentTenantId,
                currentTenantName: currentTenantBranding?.schoolName || 'ESCOLA LOGADA',
            });
        } catch (error) {
            setEmailUsageAlert(null);
            setErrorStatus(errorMessage(error, 'Não foi possível consultar o uso deste e-mail.'));
        }
    };

    const handleGuardianProfileChange = (profileCode: AccessProfileCode) => {
        setFormData((current) => ({
            ...current,
            accessProfile: profileCode,
            permissions: getProfilePermissions(profileCode),
        }));
    };

    const handleGuardianNameChange = (value: string) => {
        setFormData((current) => ({ ...current, name: value.toUpperCase() }));
        if (!editingGuardianId) {
            setShowNameSuggestions(String(value || '').trim().length >= 2);
        }
    };

    const toggleGuardianPermission = (permission: string) => {
        setFormData((current) => ({
            ...current,
            permissions: current.permissions.includes(permission)
                ? current.permissions.filter((item) => item !== permission)
                : [...current.permissions, permission],
        }));
    };

    const closeStudentsModal = () => {
        setSelectedGuardianForStudents(null);
    };

    const openGuardianStatusModal = (guardian: GuardianRecord) => {
        setGuardianStatusToggleTarget(guardian);
        setGuardianStatusToggleAction(guardian.canceledAt ? 'activate' : 'deactivate');
    };

    const closeGuardianStatusModal = (force = false) => {
        if (!force && isProcessingGuardianToggle) return;
        setGuardianStatusToggleTarget(null);
        setGuardianStatusToggleAction(null);
    };

    const confirmGuardianStatusToggle = async () => {
        if (!guardianStatusToggleTarget || !guardianStatusToggleAction) return;
        const willActivate = guardianStatusToggleAction === 'activate';
        try {
            setIsProcessingGuardianToggle(true);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');
            const response = await fetch(`${API_BASE_URL}/guardians/${guardianStatusToggleTarget.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ active: willActivate }),
            });
            if (!response.ok) {
                const err = await response.json().catch(() => null);
                throw new Error(err?.message || (willActivate ? 'Não foi possível ativar o responsável.' : 'Não foi possível inativar o responsável.'));
            }
            await fetchGuardians();
            closeGuardianStatusModal(true);
        } catch (error) {
            setErrorStatus(errorMessage(error, willActivate ? 'Não foi possível ativar o responsável.' : 'Não foi possível inativar o responsável.'));
        } finally {
            setIsProcessingGuardianToggle(false);
        }
    };

    const toggleSort = (column: GuardianColumnKey) => {
        setSortState((current) => ({
            column,
            direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const toggleExportColumn = (column: GuardianExportColumnKey) => {
        setExportColumns((current) => ({ ...current, [column]: !current[column] }));
    };

    const renderGuardianInfoButton = (guardian: GuardianRecord) => (
        <GridRecordPopover
            title={guardian.name}
            subtitle={guardian.birthDate ? `Nascimento: ${formatGuardianDate(guardian.birthDate)}` : 'Responsável sem data de nascimento informada'}
            buttonLabel={`Ver detalhes do responsável ${guardian.name}`}
            badges={[
                guardian.canceledAt ? 'INATIVO' : 'ATIVO',
                ...(guardianFieldAccess.access ? [guardian.email ? 'APP LIBERADO' : 'SEM ACESSO', formatGuardianAccessProfile(guardian.accessProfile)] : []),
            ]}
            sections={[
                {
                    title: 'Cadastro',
                    items: [
                        ...(guardianFieldAccess.sensitive ? [
                            { label: 'CPF', value: guardian.cpf || 'Não informado' },
                            { label: 'RG', value: guardian.rg || 'Não informado' },
                            { label: 'CNPJ', value: guardian.cnpj || 'Não informado' },
                        ] : []),
                        { label: 'Apelido', value: guardian.nickname || 'Não informado' },
                        { label: 'Nome empresarial', value: guardian.corporateName || 'Não informado' },
                    ],
                },
                ...(guardianFieldAccess.contact || guardianFieldAccess.access ? [{
                    title: 'Contato',
                    items: [
                        ...(guardianFieldAccess.access ? [{ label: 'E-mail', value: guardian.email || 'Não informado' }] : []),
                        ...(guardianFieldAccess.contact ? [
                            { label: 'Telefone principal', value: guardian.whatsapp || guardian.phone || guardian.cellphone1 || guardian.cellphone2 || 'Não informado' },
                            { label: 'Telefone 1', value: guardian.cellphone1 || 'Não informado' },
                            { label: 'Telefone 2', value: guardian.cellphone2 || 'Não informado' },
                            { label: 'WhatsApp', value: guardian.whatsapp || 'Não informado' },
                        ] : []),
                    ],
                }] : []),
                ...(guardianFieldAccess.contact ? [{
                    title: 'Endereço',
                    items: [
                        { label: 'Endereço completo', value: formatGuardianAddress(guardian) },
                        { label: 'Cidade / UF', value: [guardian.city, guardian.state].filter(Boolean).join(' / ') || 'Não informado' },
                        { label: 'CEP', value: guardian.zipCode || 'Não informado' },
                        { label: 'Complemento', value: guardian.complement || 'Não informado' },
                    ],
                }] : []),
                {
                    title: 'Vínculos',
                    items: [
                        { label: 'Alunos vinculados', value: formatGuardianStudentLinks(guardian) },
                        { label: 'Total de vínculos', value: String(guardian.students?.length || 0) },
                        ...(guardianFieldAccess.access ? [{ label: 'Permissões específicas', value: formatGuardianPermissions(guardian.permissions) }] : []),
                    ],
                },
            ]}
            contextLabel="PRINCIPAL_RESPONSAVEIS_POPUP"
        />
    );

    const setAllExportColumns = (value: boolean) => {
        setExportColumns(
            availableGuardianExportColumns.reduce<Record<GuardianExportColumnKey, boolean>>((accumulator, column) => {
                accumulator[column.key] = value;
                return accumulator;
            }, {} as Record<GuardianExportColumnKey, boolean>),
        );
    };

    const toggleGridColumnVisibility = (columnKey: GuardianColumnKey) => {
        const isHidden = hiddenColumns.includes(columnKey);
        const visibleCount = availableGuardianColumns.filter((column) => !hiddenColumns.includes(column.key)).length;
        if (!isHidden && visibleCount === 1) {
            setErrorStatus('Pelo menos uma coluna precisa continuar visível no grid.');
            return;
        }
        setHiddenColumns((current) => isHidden ? current.filter((item) => item !== columnKey) : [...current, columnKey]);
    };

    const moveGridColumn = (columnKey: GuardianColumnKey, direction: 'up' | 'down') => {
        setColumnOrder((current) => {
            const currentIndex = current.indexOf(columnKey);
            if (currentIndex === -1) return current;
            const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (nextIndex < 0 || nextIndex >= current.length) return current;
            const nextOrder = [...current];
            const [removed] = nextOrder.splice(currentIndex, 1);
            nextOrder.splice(nextIndex, 0, removed);
            return nextOrder;
        });
    };

    const resetGridColumns = () => {
        setColumnOrder(GUARDIAN_COLUMN_KEYS);
        setHiddenColumns(GUARDIAN_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_GUARDIAN_COLUMNS.includes(key)));
    };

    const renderGuardianGridCell = (guardian: GuardianRecord, columnKey: GuardianColumnKey) => {
        if (columnKey === 'name') {
            return (
                <td key={columnKey} className="px-6 py-4">
                    <div className={`flex items-center gap-2 font-semibold ${guardian.canceledAt ? 'text-rose-800' : 'text-slate-800'}`}>
                        <span>{guardian.name}</span>
                        <RecordStatusIndicator active={!guardian.canceledAt} />
                    </div>
                    <div className={`text-[13px] ${guardian.canceledAt ? 'text-rose-500' : 'text-slate-400'}`}>
                        {guardian.birthDate ? new Date(guardian.birthDate).toLocaleDateString() : 'Sem data de nascimento'}
                    </div>
                </td>
            );
        }

        if (columnKey === 'contact') {
            return (
                <td key={columnKey} className="px-6 py-4">
                    <div className={`text-sm font-medium ${guardian.canceledAt ? 'text-rose-800' : 'text-slate-700'}`}>
                        {guardianFieldAccess.access
                            ? (guardian.email || <span className="italic text-slate-400">Sem login</span>)
                            : (guardianFieldAccess.contact ? (guardian.whatsapp || guardian.phone || guardian.cellphone1 || guardian.cellphone2 || 'Sem contato') : '---')}
                    </div>
                    {guardianFieldAccess.contact ? (
                        <div className={`text-[13px] ${guardian.canceledAt ? 'text-rose-500' : 'text-slate-400'}`}>
                            {guardian.whatsapp || guardian.phone || guardian.cellphone1 || '---'}
                        </div>
                    ) : null}
                </td>
            );
        }

        if (columnKey === 'cpf') {
            return (
                <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${guardian.canceledAt ? 'text-rose-700' : 'text-slate-600'}`}>
                    {guardian.cpf || '---'}
                </td>
            );
        }

        if (columnKey !== 'students') {
            const value = GUARDIAN_COLUMNS.find((column) => column.key === columnKey)?.getValue(guardian) || '---';
            return (
                <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${guardian.canceledAt ? 'text-rose-700' : 'text-slate-600'}`}>
                    {value}
                </td>
            );
        }

        return (
            <td key={columnKey} className="px-6 py-4">
                <div className={`text-sm font-medium ${guardian.canceledAt ? 'text-rose-800' : 'text-slate-700'}`}>
                    {guardian.students?.length ? `${guardian.students.length} aluno(s)` : 'Nenhum vínculo'}
                </div>
                <div className={`text-[13px] ${guardian.canceledAt ? 'text-rose-500' : 'text-slate-400'}`}>
                    {guardian.students?.slice(0, 2).map((link) => link.student?.name).filter(Boolean).join(', ') || 'Sem alunos relacionados'}
                </div>
            </td>
        );
    };

    const handleCepSearch = async () => {
        try {
            const address = await fetchAddressByCep(formData.zipCode);
            if (!address) return;
            setFormData((current) => ({ ...current, ...address }));
        } catch (error) {
            alert(errorMessage(error, 'Falha ao consultar CEP.'));
        }
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        if (formData.cpf && !isValidCpf(formData.cpf)) return setSaveError('CPF inválido. Informe um CPF válido.');
        if (formData.cnpj && !isValidCnpj(formData.cnpj)) return setSaveError('CNPJ inválido. Informe um CNPJ válido.');

        try {
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');
            const url = editingGuardianId ? `${API_BASE_URL}/guardians/${editingGuardianId}` : `${API_BASE_URL}/guardians`;
            const method = editingGuardianId ? 'PATCH' : 'POST';
            const payload: Record<string, string | string[]> = {
                ...formData,
                cpf: formatCpf(formData.cpf),
                cnpj: formatCnpj(formData.cnpj),
                phone: formatPhone(formData.phone),
                whatsapp: formatPhone(formData.whatsapp),
                cellphone1: formatPhone(formData.cellphone1),
                cellphone2: formatPhone(formData.cellphone2),
            };
            if (!payload.birthDate) delete payload.birthDate;
            if (!guardianFieldAccess.access) {
                delete payload.email;
                delete payload.accessProfile;
                delete payload.permissions;
            }

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const err = await response.json().catch(() => null);
                throw new Error(err?.message || 'Erro ao salvar responsável.');
            }
            closeModal();
            await fetchGuardians();
        } catch (error) {
            setSaveError(errorMessage(error, 'Erro ao salvar responsável.'));
        }
    };

    return (
        <div className="w-full">
            <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-[#153a6a]">Responsáveis</h1>
                    <p className="mt-1 font-medium text-slate-500">Cadastre pais, mães e demais responsáveis ligados aos alunos.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setIsExportModalOpen(true)}
                        className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                    >
                        Exportar
                    </button>
                    {canManageGuardians ? (
                        <button
                            onClick={openModal}
                            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white shadow-md shadow-blue-500/20 transition-all active:scale-95 hover:bg-blue-500"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                            Novo Responsável
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-medium text-blue-800">
                O cadastro-base compartilhado agora fica em <Link href="/dashboard/pessoas" className="font-black underline">Pessoas</Link>. Use esta area para operacoes especificas do responsavel, como vinculo com alunos e manutencao do parentesco.
            </div>

            {errorStatus ? <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-600">{errorStatus}</div> : null}

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="dashboard-band border-b px-6 py-4">
                    <div className="relative w-full max-w-xs">
                        <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar responsável..." className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="dashboard-table-head border-b border-slate-300 text-[13px] font-bold uppercase tracking-wider">
                                {visibleGuardianColumns.map((column) => (
                                    <th key={column.key} className="px-6 py-4">
                                        <GridSortableHeader
                                            label={column.label}
                                            isActive={sortState.column === column.key}
                                            direction={sortState.direction}
                                            onClick={() => toggleSort(column.key)}
                                        />
                                    </th>
                                ))}
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? <tr><td colSpan={visibleGuardianColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">Carregando responsáveis...</td></tr> : null}
                            {!isLoading && sortedFilteredGuardians.length === 0 ? <tr><td colSpan={visibleGuardianColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">Nenhum responsável encontrado.</td></tr> : null}
                            {!isLoading && sortedFilteredGuardians.map((guardian) => (
                                <tr key={guardian.id} className={guardian.canceledAt ? 'bg-rose-50/40 hover:bg-rose-50' : 'hover:bg-slate-50'}>
                                    {visibleGuardianColumns.map((column) => renderGuardianGridCell(guardian, column.key))}
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {renderGuardianInfoButton(guardian)}
                                            <GridRowActionIconButton title="Abrir alunos do responsável" onClick={() => handleOpenStudentsModal(guardian)} tone="violet">
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5V4H2v16h5m10 0v-2a4 4 0 00-4-4H11a4 4 0 00-4 4v2m10 0H7m10 0h-2m-8 0H5m6-10a4 4 0 110-8 4 4 0 010 8z" />
                                                </svg>
                                            </GridRowActionIconButton>
                                            {canManageGuardians ? (
                                                <>
                                                    <GridRowActionIconButton title="Editar responsável" onClick={() => handleEdit(guardian)} tone="blue">
                                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </GridRowActionIconButton>
                                                    <GridRowActionIconButton title={guardian.canceledAt ? 'Ativar responsável' : 'Inativar responsável'} onClick={() => openGuardianStatusModal(guardian)} tone={guardian.canceledAt ? 'emerald' : 'rose'}>
                                                        {guardian.canceledAt ? (
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728M6 6l12 12" />
                                                            </svg>
                                                        )}
                                                    </GridRowActionIconButton>
                                                </>
                                            ) : null}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <GridFooterControls
                    key={`guardian-footer-${sortedFilteredGuardians.length}`}
                    recordsCount={Number(sortedFilteredGuardians.length)}
                    onOpenColumns={() => setIsGridConfigOpen(true)}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    activeLabel="Mostrar somente responsáveis ativos"
                    allLabel="Mostrar responsáveis ativos e inativos"
                    inactiveLabel="Mostrar somente responsáveis inativos"
                />
            </div>

            <GridColumnConfigModal
                isOpen={isGridConfigOpen}
                title="Configurar colunas do grid"
                description="Reordene, oculte ou inclua colunas do cadastro de responsáveis nesta tela."
                columns={availableGuardianColumns.map((column) => ({ key: column.key, label: column.label, visibleByDefault: column.visibleByDefault }))}
                orderedColumns={columnOrder}
                hiddenColumns={hiddenColumns}
                onToggleColumnVisibility={toggleGridColumnVisibility}
                onMoveColumn={moveGridColumn}
                onReset={resetGridColumns}
                onClose={() => setIsGridConfigOpen(false)}
            />

            <StatusConfirmationModal
                isOpen={Boolean(guardianStatusToggleTarget && guardianStatusToggleAction)}
                tenantId={currentTenantId}
                actionType={guardianStatusToggleAction || 'activate'}
                title={guardianStatusToggleAction === 'activate' ? 'Ativar responsável' : 'Inativar responsável'}
                itemLabel="Responsável"
                itemName={guardianStatusToggleTarget?.name || ''}
                description={guardianStatusToggleAction === 'activate'
                    ? 'Ao ativar este responsável ele volta a ter acesso ao PWA e pode acompanhar os alunos novamente.'
                    : 'Ao inativar este responsável, ele sai das listas de comunicação ativos, mas o histórico persiste.'}
                confirmLabel={guardianStatusToggleAction === 'activate' ? 'Confirmar ativação' : 'Confirmar inativação'}
                onCancel={() => closeGuardianStatusModal(true)}
                onConfirm={confirmGuardianStatusToggle}
                isProcessing={isProcessingGuardianToggle}
                statusActive={!guardianStatusToggleTarget?.canceledAt}
                screenId={RESPONSAVEIS_STATUS_MODAL_SCREEN_ID}
            />

            <GridExportModal
                isOpen={isExportModalOpen}
                title="Exportar responsáveis"
                description={`A exportação respeita a busca atual e inclui ${sortedFilteredGuardians.length} registro(s).`}
                format={exportFormat}
                onFormatChange={setExportFormat}
                columns={availableGuardianExportColumns.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={exportColumns}
                onToggleColumn={toggleExportColumn}
                onSelectAll={setAllExportColumns}
                storageKey={getGuardianExportConfigStorageKey(currentTenantId)}
                onClose={() => setIsExportModalOpen(false)}
                onExport={async (config) => {
                    try {
                        await exportGridRows({
                            rows: sortedFilteredGuardians,
                            columns: config?.orderedColumns
                                ? config.orderedColumns
                                    .map((key) => availableGuardianExportColumns.find((column) => column.key === key))
                                    .filter((column): column is GridColumnDefinition<GuardianRecord, GuardianExportColumnKey> => !!column)
                                : availableGuardianExportColumns,
                            selectedColumns: config?.selectedColumns || exportColumns,
                            format: exportFormat,
                            pdfOptions: config?.pdfOptions,
                            fileBaseName: 'responsaveis',
                            branding: {
                                title: 'Responsáveis',
                                subtitle: 'Exportação com os filtros atualmente aplicados.',
                            },
                        });
                        setErrorStatus(null);
                        setIsExportModalOpen(false);
                    } catch (error) {
                        setErrorStatus(error instanceof Error ? error.message : 'Não foi possível exportar os responsáveis.');
                    }
                }}
            />

            {isModalOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
                            <div className="flex min-w-0 items-center gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                    {currentTenantBranding?.logoUrl ? (
                                        <img src={currentTenantBranding.logoUrl} alt={currentTenantBranding.schoolName} className="h-full w-full object-contain" />
                                    ) : (
                                        <span className="text-sm font-black tracking-[0.25em] text-[#153a6a]">
                                            {String(currentTenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-blue-600">
                                        {currentTenantBranding?.schoolName || 'Escola'}
                                    </div>
                                    <h2 className="truncate text-xl font-bold text-[#153a6a]">
                                        {editingGuardianId ? `Editar responsável: ${formData.name || 'RESPONSAVEL'}` : 'Cadastrar responsável'}
                                    </h2>
                                </div>
                            </div>
                            <button onClick={closeModal} className="text-slate-400 hover:text-red-500">×</button>
                        </div>
                        <div className="border-b border-slate-100 bg-white px-6 py-3">
                            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                Esta pessoa ja possui os seguintes papeis no sistema
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {personSystemRoles.map((role) => (
                                    <span
                                        key={role}
                                        className="inline-flex min-h-10 items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-blue-700"
                                    >
                                        {role}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2 border-b border-slate-200 bg-slate-50/50 px-6 pt-4">
                            {['1. DADOS BÁSICOS', '2. ENDEREÇO', '3. ACESSO PWA'].map((label, index) => (
                                <button key={label} type="button" onClick={() => setActiveTab(index + 1)} className={`rounded-t-lg px-4 py-2.5 text-sm font-bold ${activeTab === index + 1 ? 'border border-slate-200 border-b-white bg-white text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}>{label}</button>
                            ))}
                        </div>
                        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6">
                            {activeTab === 1 ? (
                                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                                    {guardianFieldAccess.sensitive ? (
                                        <div>
                                            <label className={labelClass}>CPF</label>
                                            <input value={formData.cpf} onChange={(event) => setFormData((current) => ({ ...current, cpf: event.target.value.toUpperCase() }))} onBlur={handleCpfBlur} className={inputClass} />
                                        </div>
                                    ) : null}
                                    <div className="relative lg:col-span-2">
                                        <label className={labelClass}>Nome completo *</label>
                                        <input
                                            required
                                            value={formData.name}
                                            onChange={(event) => handleGuardianNameChange(event.target.value)}
                                            onFocus={() => {
                                                if (!editingGuardianId && String(formData.name || '').trim().length >= 2) {
                                                    setShowNameSuggestions(true);
                                                }
                                            }}
                                            onBlur={() => {
                                                window.setTimeout(() => setShowNameSuggestions(false), 160);
                                            }}
                                            className={inputClass}
                                        />
                                        {!editingGuardianId && (showNameSuggestions || isLoadingNameSuggestions) ? (
                                            <div className="mt-2 w-full rounded-xl border border-blue-100 bg-white p-3 shadow-xl">
                                                <div className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700">
                                                    Possíveis nomes já cadastrados
                                                </div>
                                                {isLoadingNameSuggestions ? (
                                                    <div className="text-xs font-semibold text-slate-500">Buscando sugestões...</div>
                                                ) : nameSuggestionError ? (
                                                    <div className="text-xs font-semibold text-rose-600">{nameSuggestionError}</div>
                                                ) : nameSuggestions.length === 0 ? (
                                                    <div className="text-xs font-semibold text-slate-500">Nenhum nome parecido encontrado.</div>
                                                ) : (
                                                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                                                        {nameSuggestions.map((suggestion, index) => (
                                                            <div key={`${suggestion.name}-${suggestion.cpf || suggestion.email || index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                                                <div className="text-sm font-bold text-slate-700">{suggestion.name}</div>
                                                                <div className="mt-1 flex flex-wrap gap-1">
                                                                    {(suggestion.roles || []).map((role) => (
                                                                        <span key={`${suggestion.name}-${role}-${index}`} className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">
                                                                            {normalizeSystemRoleLabel(role) || role}
                                                                        </span>
                                                                    ))}
                                                                    {suggestion.cpf ? (
                                                                        <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">
                                                                            CPF {suggestion.cpf}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div><label className={labelClass}>Data de nascimento</label><input type="date" value={formData.birthDate} onChange={(event) => setFormData((current) => ({ ...current, birthDate: event.target.value }))} className={inputClass} /></div>
                                    {guardianFieldAccess.sensitive ? (
                                        <>
                                            <div><label className={labelClass}>RG</label><input value={formData.rg} onChange={(event) => setFormData((current) => ({ ...current, rg: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                            <div><label className={labelClass}>CNPJ</label><input value={formData.cnpj} onChange={(event) => setFormData((current) => ({ ...current, cnpj: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                        </>
                                    ) : null}
                                    <div><label className={labelClass}>Apelido</label><input value={formData.nickname} onChange={(event) => setFormData((current) => ({ ...current, nickname: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                    <div className="lg:col-span-2"><label className={labelClass}>Nome empresarial / social</label><input value={formData.corporateName} onChange={(event) => setFormData((current) => ({ ...current, corporateName: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                    {guardianFieldAccess.contact ? (
                                        <>
                                            <div><label className={labelClass}>WhatsApp</label><input value={formData.whatsapp} onChange={(event) => setFormData((current) => ({ ...current, whatsapp: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                            <div><label className={labelClass}>Telefone</label><input value={formData.phone} onChange={(event) => setFormData((current) => ({ ...current, phone: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                            <div><label className={labelClass}>Celular 1</label><input value={formData.cellphone1} onChange={(event) => setFormData((current) => ({ ...current, cellphone1: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                            <div><label className={labelClass}>Celular 2</label><input value={formData.cellphone2} onChange={(event) => setFormData((current) => ({ ...current, cellphone2: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                        </>
                                    ) : null}
                                </div>
                            ) : null}
                            {activeTab === 2 ? (
                                guardianFieldAccess.contact ? (
                                    <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
                                        <div><label className={labelClass}>CEP</label><div className="flex gap-2"><input value={formData.zipCode} onChange={(event) => setFormData((current) => ({ ...current, zipCode: event.target.value.toUpperCase() }))} className={inputClass} /><button type="button" onClick={handleCepSearch} className="rounded-lg border border-blue-200 bg-blue-100 px-3 font-bold text-blue-700">OK</button></div></div>
                                        <div className="md:col-span-2"><label className={labelClass}>Logradouro</label><input value={formData.street} onChange={(event) => setFormData((current) => ({ ...current, street: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                        <div><label className={labelClass}>Número</label><input value={formData.number} onChange={(event) => setFormData((current) => ({ ...current, number: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                        <div className="md:col-span-2"><label className={labelClass}>Bairro</label><input value={formData.neighborhood} onChange={(event) => setFormData((current) => ({ ...current, neighborhood: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                        <div className="md:col-span-2"><label className={labelClass}>Complemento</label><input value={formData.complement} onChange={(event) => setFormData((current) => ({ ...current, complement: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                        <div className="md:col-span-3"><label className={labelClass}>Cidade</label><input value={formData.city} onChange={(event) => setFormData((current) => ({ ...current, city: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                        <div><label className={labelClass}>UF</label><input value={formData.state} onChange={(event) => setFormData((current) => ({ ...current, state: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-medium text-amber-700">
                                        Seu perfil não possui autorização para consultar ou alterar os dados de contato e endereço deste responsável.
                                    </div>
                                )
                            ) : null}
                            {activeTab === 3 ? (
                                guardianFieldAccess.access ? (
                                    <div className="space-y-6">
                                    <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-slate-50 p-6">
                                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                            <div className="md:col-span-2">
                                                <label className={labelClass}>Perfil pré-definido do responsável</label>
                                                <select
                                                    value={formData.accessProfile}
                                                    onChange={(event) => handleGuardianProfileChange(event.target.value as AccessProfileCode)}
                                                    className={`${inputClass} bg-white`}
                                                >
                                                    {getProfilesForRole('RESPONSAVEL').map((profile) => (
                                                        <option key={profile.code} value={profile.code}>{profile.label}</option>
                                                    ))}
                                                </select>
                                                <div className="mt-2 text-xs font-medium text-slate-500">
                                                    Se este responsável precisar de uma exceção, ajuste os checkboxes abaixo. Nesse caso, a permissão específica da tela passa a valer acima do perfil padrão.
                                                </div>
                                            </div>
                                            <div>
                                                <label className={labelClass}>E-mail de login</label>
                                                <input
                                                    type="email"
                                                    value={formData.email}
                                                    onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value.toUpperCase() }))}
                                                    onBlur={handleEmailUsageBlur}
                                                    className={`${inputClass} bg-white`}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-6">
                                        <div className="mb-4 text-sm font-semibold text-slate-700">Permissões específicas por tela</div>
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                            {PERMISSION_OPTIONS.map((permission) => (
                                                <label key={permission.value} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.permissions.includes(permission.value)}
                                                        onChange={() => toggleGuardianPermission(permission.value)}
                                                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                                    />
                                                    <span className="text-sm font-medium text-slate-700">{permission.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-medium text-amber-700">
                                        Seu perfil não possui autorização para consultar ou alterar os dados de acesso PWA deste responsável.
                                    </div>
                                )
                            ) : null}
                            <div className="sticky bottom-0 -mx-6 mt-8 flex flex-col gap-3 border-t border-slate-100 bg-white/95 px-6 py-5 backdrop-blur-sm">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex flex-wrap gap-3">
                                        <button type="button" onClick={closeModal} className="rounded-xl px-6 py-3 text-sm font-semibold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100">SAIR</button>
                                    </div>
                                    <div className="flex flex-wrap justify-end gap-3">
                                        <button type="submit" className="rounded-xl bg-green-600 px-8 py-3 text-sm font-bold text-white hover:bg-green-700">{editingGuardianId ? 'Salvar' : 'Registrar responsável'}</button>
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <ScreenNameCopy
                                        screenId="PRINCIPAL_RESPONSAVEIS_POPUP_EDITAR_RESPONSAVEL"
                                        label="Tela"
                                        disableMargin
                                        className="w-auto justify-end"
                                    />
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {selectedGuardianForStudents ? (
                <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
                            <div className="flex min-w-0 items-center gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                    {currentTenantBranding?.logoUrl ? (
                                        <img src={currentTenantBranding.logoUrl} alt={currentTenantBranding.schoolName || 'Escola'} className="h-full w-full object-contain" />
                                    ) : (
                                        <span className="text-sm font-black tracking-[0.25em] text-[#153a6a]">
                                            {String(currentTenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-blue-600">
                                        {currentTenantBranding?.schoolName || 'Escola'}
                                    </div>
                                    <h2 className="truncate text-xl font-bold text-[#153a6a]">Alunos vinculados</h2>
                                    <p className="mt-1 truncate text-sm font-medium text-slate-500">{selectedGuardianForStudents.name}</p>
                                </div>
                            </div>
                            <button onClick={closeStudentsModal} className="text-slate-400 hover:text-red-500">×</button>
                        </div>
                        <div className="max-h-[70vh] overflow-y-auto p-6">
                            {!selectedGuardianForStudents.students?.length ? (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-medium text-slate-400">
                                    Este responsável ainda não possui alunos vinculados.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {selectedGuardianForStudents.students.map((link) => (
                                        <div key={link.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                                            <div className="text-sm font-bold text-slate-800">{link.student?.name || 'ALUNO NÃO IDENTIFICADO'}</div>
                                            <div className="mt-1 text-xs font-bold text-violet-700">
                                                {link.kinship === 'OUTROS' && link.kinshipDescription ? link.kinshipDescription : (link.kinship || 'SEM PARENTESCO')}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 text-right">
                            <button onClick={closeStudentsModal} className="rounded-xl bg-[#153a6a] px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-800">Fechar</button>
                        </div>
                        <div className="border-t border-slate-100 bg-white px-6 py-3">
                            <div className="flex justify-end">
                                <ScreenNameCopy screenId="PRINCIPAL_RESPONSAVEIS_ALUNOS_VINCULADOS" disableMargin className="w-auto" />
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {emailUsageAlert ? (
                <div className="fixed inset-0 z-[59] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
                    <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
                        <div className="border-b border-amber-100 bg-amber-50 px-6 py-5">
                            <div className="flex items-start gap-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-white shadow-sm">
                                    <span className="text-xs font-black uppercase tracking-[0.18em] text-[#153a6a]">EA</span>
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">E-mail já utilizado</div>
                                    <h3 className="mt-1 text-lg font-bold text-slate-800">{emailUsageAlert.email}</h3>
                                    <p className="mt-1 text-sm font-medium text-slate-600">
                                        Este e-mail já está cadastrado em {emailUsageAlert.usages.length} local(is). Verifique a escola e o perfil abaixo.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto p-6">
                            <div className="grid grid-cols-1 gap-3">
                                {emailUsageAlert.usages.map((usage, index) => (
                                    <div
                                        key={`${usage.tenantId}-${usage.recordId}-${usage.entityType}-${index}`}
                                        className={`rounded-2xl border px-4 py-4 ${usage.tenantId !== emailUsageAlert.currentTenantId ? 'border-amber-300 bg-amber-50/70' : 'border-slate-200 bg-slate-50'}`}
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                                                    {usage.tenantName}
                                                </div>
                                                <div className="mt-1 text-sm font-bold text-slate-800">
                                                    {usage.recordName || 'SEM NOME'}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {usage.tenantId !== emailUsageAlert.currentTenantId ? (
                                                    <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-800">
                                                        OUTRA ESCOLA
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
                                                        ESCOLA ATUAL
                                                    </span>
                                                )}
                                                <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">
                                                    {usage.entityLabel}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <div className="flex justify-end">
                                <ScreenNameCopy
                                    screenId="PRINCIPAL_RESPONSAVEIS_POPUP_EMAIL_USAGE_ALERT"
                                    label="Tela"
                                    disableMargin
                                    className="w-auto justify-end"
                                />
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setEmailUsageAlert(null)}
                                    className="rounded-xl bg-[#153a6a] px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-800"
                                >
                                    ENTENDI
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {saveError ? <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"><div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-3 text-lg font-bold text-slate-800">Atenção</div><div className="text-sm font-medium text-red-600">{saveError}</div><div className="mt-4 text-right"><button onClick={() => setSaveError(null)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">Fechar</button></div></div></div> : null}
        </div>
    );
}

