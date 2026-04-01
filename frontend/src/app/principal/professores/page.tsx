'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getStoredToken } from '@/app/lib/auth-storage';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import GridColumnConfigModal from '@/app/components/grid-column-config-modal';
import GridExportModal from '@/app/components/grid-export-modal';
import GridFooterControls from '@/app/components/grid-footer-controls';
import RecordStatusIndicator from '@/app/components/record-status-indicator';
import GridRecordPopover from '@/app/components/grid-record-popover';
import GridRowActionIconButton from '@/app/components/grid-row-action-icon-button';
import StatusConfirmationModal from '@/app/components/status-confirmation-modal';
import { type GridStatusFilterValue } from '@/app/components/grid-status-filter';
import GridSortableHeader from '@/app/components/grid-sortable-header';
import { fetchEmailUsageByEmail, fetchSharedPersonNameSuggestions, fetchSharedPersonProfileByCpf, fetchSharedPersonProfileByEmail, getAllowedDashboardFields, getDashboardAuthContext, hasAllDashboardPermissions, hasDashboardPermission, mergeSharedPersonIntoForm, type EmailUsageRecord, type SharedNameSuggestion } from '@/app/lib/dashboard-crud-utils';
import { getDefaultAccessProfileForRole, getProfilePermissions, getProfilesForRole, PERMISSION_OPTIONS, type AccessProfileCode } from '@/app/lib/access-profiles';
import { buildDefaultExportColumns, buildExportColumnsFromGridColumns, exportGridRows, sortGridRows, type GridColumnDefinition, type GridSortState } from '@/app/lib/grid-export-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import { fetchUserPreference, saveUserPreference } from '@/app/lib/user-preferences';
import ScreenNameCopy from '@/app/components/screen-name-copy';
const PROFESSORES_STATUS_MODAL_SCREEN_ID = 'PRINCIPAL_PROFESSORES_STATUS_MODAL';
const PROFESSORES_DETAIL_COPY_SCREEN_ID = 'PRINCIPAL_PROFESSORES_DETAIL_DOCENTE_EXCLUSIVO';
const PROFESSORES_EMAIL_USAGE_MODAL_SCREEN_ID = 'PRINCIPAL_PROFESSORES_EMAIL_USAGE_MODAL';

type SubjectRecord = {
    id: string;
    name: string;
    canceledAt?: string | null;
};

type TeacherSubjectAssignment = {
    id: string;
    subjectId: string;
    hourlyRate?: number | null;
    rateHistories?: Array<{
        id: string;
        hourlyRate?: number | null;
        effectiveFrom: string;
        effectiveTo?: string | null;
    }>;
    subject?: {
        id: string;
        name: string;
    } | null;
};

type TeacherRecord = {
    id: string;
    name: string;
    canceledAt?: string | null;
    email?: string | null;
    cpf?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    rg?: string | null;
    cnpj?: string | null;
    nickname?: string | null;
    corporateName?: string | null;
    birthDate?: string | null;
    cellphone1?: string | null;
    cellphone2?: string | null;
    zipCode?: string | null;
    street?: string | null;
    number?: string | null;
    city?: string | null;
    state?: string | null;
    neighborhood?: string | null;
    complement?: string | null;
    accessProfile?: AccessProfileCode | null;
    permissions?: string[];
    teacherSubjects?: TeacherSubjectAssignment[];
};

type TeacherFormState = {
    name: string;
    rg: string;
    cpf: string;
    cnpj: string;
    nickname: string;
    corporateName: string;
    birthDate: string;
    phone: string;
    whatsapp: string;
    cellphone1: string;
    cellphone2: string;
    email: string;
    password: string;
    zipCode: string;
    street: string;
    number: string;
    city: string;
    state: string;
    neighborhood: string;
    complement: string;
    accessProfile: AccessProfileCode;
    permissions: string[];
};

type ExistingCpfAlert = {
    name: string;
    roles: string[];
};

type EmailUsageAlert = {
    email: string;
    usages: EmailUsageRecord[];
    currentTenantId: string | null;
    currentTenantName: string;
};

const DEFAULT_TEACHER_PROFILE = getDefaultAccessProfileForRole('PROFESSOR');

type TeacherColumnKey =
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
    | 'pwaStatus'
    | 'accessProfile';

type TeacherExportColumnKey =
    | Exclude<TeacherColumnKey, 'subjectsCount'>
    | 'recordStatus'
    | 'nickname'
    | 'corporateName'
    | 'cnpj'
    | 'email'
    | 'cellphone1'
    | 'cellphone2'
    | 'zipCode'
    | 'street'
    | 'number'
    | 'neighborhood'
    | 'complement'
    | 'city'
    | 'state'
    | 'permissions';

type TeacherGridColumnDefinition = GridColumnDefinition<TeacherRecord, TeacherColumnKey> & {
    align?: 'left' | 'center' | 'right';
    visibleByDefault?: boolean;
};

const TEACHER_COLUMNS: TeacherGridColumnDefinition[] = [
    { key: 'name', label: 'Nome oficial', getValue: (row) => row.name || '---', visibleByDefault: true },
    { key: 'nickname', label: 'Apelido', getValue: (row) => row.nickname || '---', visibleByDefault: false },
    { key: 'corporateName', label: 'Nome empresarial', getValue: (row) => row.corporateName || '---', visibleByDefault: false },
    { key: 'birthDate', label: 'Nascimento', getValue: (row) => row.birthDate ? new Date(row.birthDate).toLocaleDateString() : '---', visibleByDefault: false },
    { key: 'cpf', label: 'CPF', getValue: (row) => row.cpf || '---', visibleByDefault: true },
    { key: 'rg', label: 'RG', getValue: (row) => row.rg || '---', visibleByDefault: false },
    { key: 'cnpj', label: 'CNPJ', getValue: (row) => row.cnpj || '---', visibleByDefault: false },
    { key: 'contact', label: 'Contato / Login', getValue: (row) => row.email || row.phone || row.whatsapp || '---', visibleByDefault: true },
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
    { key: 'address', label: 'Endereço', getValue: (row) => [row.street, row.number, row.neighborhood].filter(Boolean).join(', ') || '---', visibleByDefault: false },
    { key: 'pwaStatus', label: 'Status PWA', getValue: (row) => row.email ? 'APP LIBERADO' : 'SEM ACESSO', getSortValue: (row) => row.email ? 1 : 0, align: 'center', visibleByDefault: true },
    { key: 'accessProfile', label: 'Perfil', getValue: (row) => row.accessProfile ? row.accessProfile.replaceAll('_', ' ') : 'PADRÃO', visibleByDefault: false },
];

const PERMISSION_LABEL_MAP = PERMISSION_OPTIONS.reduce<Record<string, string>>((accumulator, option) => {
    accumulator[option.value] = option.label;
    return accumulator;
}, {});

function formatTeacherDate(value?: string | null) {
    return value ? new Date(value).toLocaleDateString() : '---';
}

function formatTeacherAddress(row: TeacherRecord) {
    return [row.street, row.number, row.neighborhood].filter(Boolean).join(', ') || '---';
}

function formatTeacherPermissions(row: TeacherRecord) {
    const permissionLabels = row.permissions
        ?.map((permission) => PERMISSION_LABEL_MAP[permission] || permission)
        .filter(Boolean) || [];
    return permissionLabels.length ? permissionLabels.join(', ') : '---';
}

function formatTeacherSubjects(row: TeacherRecord) {
    const subjects = row.teacherSubjects
        ?.map((assignment) => assignment.subject?.name || 'DISCIPLINA')
        .filter(Boolean) || [];
    return subjects.length ? subjects.join(' | ') : null;
}

function getTeacherSubjectNames(row: TeacherRecord) {
    return row.teacherSubjects
        ?.map((assignment) => assignment.subject?.name || 'DISCIPLINA')
        .filter(Boolean) || [];
}

function normalizeTeacherSubjectName(value?: string | null) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
}

function formatTeacherRateHistoryLabel(effectiveFrom?: string | null, effectiveTo?: string | null) {
    const start = effectiveFrom ? new Date(effectiveFrom).toLocaleDateString() : 'SEM INÍCIO';
    const end = effectiveTo ? new Date(effectiveTo).toLocaleDateString() : 'ATUAL';
    return `${start} a ${end}`;
}

function toDateInputValue(value?: string | null) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().split('T')[0];
}

function formatTeacherRateHistoryValue(value?: number | null) {
    return typeof value === 'number'
        ? `R$ ${value.toFixed(2).replace('.', ',')}`
        : 'SEM VALOR';
}

const TEACHER_EXPORT_COLUMNS: GridColumnDefinition<TeacherRecord, TeacherExportColumnKey>[] = buildExportColumnsFromGridColumns<TeacherRecord, TeacherColumnKey, 'recordStatus' | 'permissions'>(
    TEACHER_COLUMNS,
    [
        { key: 'recordStatus', label: 'Status do cadastro', getValue: (row) => row.canceledAt ? 'INATIVO' : 'ATIVO' },
        { key: 'permissions', label: 'Permissões específicas', getValue: (row) => formatTeacherPermissions(row) },
    ],
);

const ALL_TEACHER_COLUMN_KEYS = TEACHER_COLUMNS.map((column) => column.key);
const DEFAULT_VISIBLE_TEACHER_COLUMNS = TEACHER_COLUMNS.filter((column) => column.visibleByDefault).map((column) => column.key);

function getTeacherGridConfigStorageKey(tenantId: string | null) {
    return `dashboard:professores:grid-config:${tenantId || 'default'}`;
}

function getTeacherExportConfigStorageKey(tenantId: string | null) {
    return `dashboard:professores:export-config:${tenantId || 'default'}`;
}

function decodeTokenUserId(token: string) {
    try {
        const base64 = token.split('.')[1];
        if (!base64) return null;

        const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        return (JSON.parse(atob(padded)) as { userId?: string }).userId || null;
    } catch {
        return null;
    }
}

function getTeacherLegacyExportConfigStorageKeys(tenantId: string | null) {
    if (typeof window === 'undefined') {
        return [];
    }

    const token = getStoredToken();
    const userId = token ? decodeTokenUserId(token) : null;
    if (!userId) {
        return [];
    }

    const normalizedTenantId = tenantId || 'default';
    return [
        `grid-export:/dashboard/professores:${normalizedTenantId}:${userId}:exportar-professores`,
        `grid-export:/dashboard:${normalizedTenantId}:${userId}:exportar-professores`,
    ];
}

function normalizeTeacherColumnOrder(order?: string[]) {
    const validKeys = order?.filter((item): item is TeacherColumnKey => ALL_TEACHER_COLUMN_KEYS.includes(item as TeacherColumnKey)) || [];
    const missingKeys = ALL_TEACHER_COLUMN_KEYS.filter((key) => !validKeys.includes(key));
    return [...validKeys, ...missingKeys];
}

function normalizeHiddenTeacherColumns(hidden?: string[]) {
    return hidden?.filter((item): item is TeacherColumnKey => ALL_TEACHER_COLUMN_KEYS.includes(item as TeacherColumnKey)) || [];
}

function readTeacherGridConfig(tenantId: string | null) {
    if (typeof window === 'undefined') {
        return {
            order: normalizeTeacherColumnOrder(DEFAULT_VISIBLE_TEACHER_COLUMNS),
            hidden: ALL_TEACHER_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_TEACHER_COLUMNS.includes(key)),
        };
    }

    try {
        const rawValue = window.localStorage.getItem(getTeacherGridConfigStorageKey(tenantId));
        if (!rawValue) {
            return {
                order: normalizeTeacherColumnOrder(DEFAULT_VISIBLE_TEACHER_COLUMNS),
                hidden: ALL_TEACHER_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_TEACHER_COLUMNS.includes(key)),
            };
        }

        const parsed = JSON.parse(rawValue) as { order?: string[]; hidden?: string[] };
        return {
            order: normalizeTeacherColumnOrder(parsed.order),
            hidden: normalizeHiddenTeacherColumns(parsed.hidden),
        };
    } catch {
        return {
            order: normalizeTeacherColumnOrder(DEFAULT_VISIBLE_TEACHER_COLUMNS),
            hidden: ALL_TEACHER_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_TEACHER_COLUMNS.includes(key)),
        };
    }
}

async function loadTeacherGridConfig(tenantId: string | null) {
    const localConfig = readTeacherGridConfig(tenantId);

    try {
        const remoteConfig = await fetchUserPreference<{ order?: string[]; hidden?: string[] }>(getTeacherGridConfigStorageKey(tenantId));
        if (!remoteConfig) {
            return localConfig;
        }

        const normalized = {
            order: normalizeTeacherColumnOrder(remoteConfig.order),
            hidden: normalizeHiddenTeacherColumns(remoteConfig.hidden),
        };

        if (typeof window !== 'undefined') {
            window.localStorage.setItem(getTeacherGridConfigStorageKey(tenantId), JSON.stringify(normalized));
        }

        return normalized;
    } catch {
        return localConfig;
    }
}

function writeTeacherGridConfig(tenantId: string | null, order: TeacherColumnKey[], hidden: TeacherColumnKey[]) {
    if (typeof window === 'undefined') return;
    const payload = {
        order: normalizeTeacherColumnOrder(order),
        hidden: normalizeHiddenTeacherColumns(hidden),
    };
    window.localStorage.setItem(getTeacherGridConfigStorageKey(tenantId), JSON.stringify(payload));
    void saveUserPreference(getTeacherGridConfigStorageKey(tenantId), payload).catch(() => undefined);
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

    if (!normalizedRoles.includes('PROFESSOR')) {
        normalizedRoles.unshift('PROFESSOR');
    }

    return Array.from(new Set(normalizedRoles));
}

function buildDetectedRoleBadges(roles?: string[]) {
    return Array.from(new Set((roles || [])
        .map((role) => normalizeSystemRoleLabel(role))
        .filter((role): role is string => Boolean(role))));
}

const DEFAULT_SORT: GridSortState<TeacherColumnKey> = {
    column: 'name',
    direction: 'asc',
};

export default function ProfessoresPage() {
    const [professores, setProfessores] = useState<TeacherRecord[]>([]);
    const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [successStatus, setSuccessStatus] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState(1);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTeacherForSubjects, setSelectedTeacherForSubjects] = useState<TeacherRecord | null>(null);
    const [selectedSubjectIdForTeacher, setSelectedSubjectIdForTeacher] = useState('');
    const [hourlyRateForTeacher, setHourlyRateForTeacher] = useState('');
    const [effectiveFromForTeacher, setEffectiveFromForTeacher] = useState('');
    const [isAssigningSubject, setIsAssigningSubject] = useState(false);
    const [removingAssignmentKey, setRemovingAssignmentKey] = useState<string | null>(null);
    const [updatingAssignmentKey, setUpdatingAssignmentKey] = useState<string | null>(null);
    const [editingHourlyRateBySubject, setEditingHourlyRateBySubject] = useState<Record<string, string>>({});
    const [editingEffectiveFromBySubject, setEditingEffectiveFromBySubject] = useState<Record<string, string>>({});
    const [sortState, setSortState] = useState<GridSortState<TeacherColumnKey>>(DEFAULT_SORT);
    const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isGridConfigOpen, setIsGridConfigOpen] = useState(false);
    const [isGridConfigReady, setIsGridConfigReady] = useState(false);
    const [exportFormat, setExportFormat] = useState<'excel' | 'csv' | 'pdf' | 'json' | 'txt'>('excel');
    const [exportColumns, setExportColumns] = useState<Record<TeacherExportColumnKey, boolean>>(buildDefaultExportColumns(TEACHER_EXPORT_COLUMNS));
    const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
    const [columnOrder, setColumnOrder] = useState<TeacherColumnKey[]>(normalizeTeacherColumnOrder(DEFAULT_VISIBLE_TEACHER_COLUMNS));
    const [hiddenColumns, setHiddenColumns] = useState<TeacherColumnKey[]>(
        ALL_TEACHER_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_TEACHER_COLUMNS.includes(key)),
    );
    const [personSystemRoles, setPersonSystemRoles] = useState<string[]>(['PROFESSOR']);
    const [nameSuggestions, setNameSuggestions] = useState<SharedNameSuggestion[]>([]);
    const [showNameSuggestions, setShowNameSuggestions] = useState(false);
    const [isLoadingNameSuggestions, setIsLoadingNameSuggestions] = useState(false);
    const [nameSuggestionError, setNameSuggestionError] = useState<string | null>(null);
    const [debouncedTeacherNameQuery, setDebouncedTeacherNameQuery] = useState('');
    const [existingCpfAlert, setExistingCpfAlert] = useState<ExistingCpfAlert | null>(null);
    const [emailUsageAlert, setEmailUsageAlert] = useState<EmailUsageAlert | null>(null);
    const [originalTeacherEmail, setOriginalTeacherEmail] = useState('');
    const [teacherStatusToggleTarget, setTeacherStatusToggleTarget] = useState<TeacherRecord | null>(null);
    const [teacherStatusToggleAction, setTeacherStatusToggleAction] = useState<'activate' | 'deactivate' | null>(null);
    const [isProcessingTeacherToggle, setIsProcessingTeacherToggle] = useState(false);

    const canViewTeachers = hasAllDashboardPermissions(currentRole, currentPermissions, ['VIEW_TEACHERS', 'VIEW_SUBJECTS']);
    const canManageTeachers = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_TEACHERS');
    const canManageTeacherSubjects = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_SUBJECTS');
    const teacherFieldAccess = getAllowedDashboardFields(currentRole, currentPermissions, {
        contact: 'VIEW_TEACHER_CONTACT_DATA',
        academic: 'VIEW_TEACHER_ACADEMIC_DATA',
        financial: 'VIEW_TEACHER_FINANCIAL_DATA',
        sensitive: 'VIEW_TEACHER_SENSITIVE_DATA',
        access: 'VIEW_TEACHER_ACCESS_DATA',
    });
    const availableTeacherColumns = useMemo(
        () => TEACHER_COLUMNS.filter((column) => {
            if (['cpf', 'rg', 'cnpj'].includes(column.key) && !teacherFieldAccess.sensitive) return false;
            if (['phone', 'whatsapp', 'cellphone1', 'cellphone2', 'zipCode', 'street', 'number', 'neighborhood', 'complement', 'city', 'state', 'cityState', 'address'].includes(column.key) && !teacherFieldAccess.contact) return false;
            if (['email', 'accessProfile', 'pwaStatus'].includes(column.key) && !teacherFieldAccess.access) return false;
            if (column.key === 'contact' && !teacherFieldAccess.contact && !teacherFieldAccess.access) return false;
            return true;
        }),
        [teacherFieldAccess.access, teacherFieldAccess.contact, teacherFieldAccess.sensitive],
    );
    const availableTeacherExportColumns = useMemo(
        () => TEACHER_EXPORT_COLUMNS.filter((column) => {
            if (['cpf', 'rg', 'cnpj'].includes(column.key) && !teacherFieldAccess.sensitive) return false;
            if (['phone', 'whatsapp', 'cellphone1', 'cellphone2', 'zipCode', 'street', 'number', 'neighborhood', 'complement', 'city', 'state', 'address'].includes(column.key) && !teacherFieldAccess.contact) return false;
            if (['email', 'accessProfile', 'pwaStatus', 'permissions'].includes(column.key) && !teacherFieldAccess.access) return false;
            if (column.key === 'contact' && !teacherFieldAccess.contact && !teacherFieldAccess.access) return false;
            return true;
        }),
        [teacherFieldAccess.access, teacherFieldAccess.contact, teacherFieldAccess.sensitive],
    );
    const orderedTeacherColumns = useMemo(
        () => columnOrder.map((key) => availableTeacherColumns.find((column) => column.key === key)).filter((column): column is TeacherGridColumnDefinition => !!column),
        [availableTeacherColumns, columnOrder],
    );
    const teacherExportLegacyStorageKeys = useMemo(
        () => getTeacherLegacyExportConfigStorageKeys(currentTenantId),
        [currentTenantId],
    );
    const visibleTeacherColumns = useMemo(
        () => orderedTeacherColumns.filter((column) => !hiddenColumns.includes(column.key)),
        [hiddenColumns, orderedTeacherColumns],
    );
    const todayDateInput = useMemo(() => new Date().toISOString().split('T')[0], []);
    const currentTenantBranding = useMemo(
        () => readCachedTenantBranding(currentTenantId),
        [currentTenantId],
    );
    const filteredProfessores = professores.filter((prof) => {
        const term = searchTerm.trim().toUpperCase();
        const matchesSearch = !term || [prof.name, prof.email, prof.cpf, prof.phone, prof.whatsapp]
            .some((value) => String(value || '').toUpperCase().includes(term));
        const isActive = !prof.canceledAt;
        const matchesStatus =
            statusFilter === 'ALL'
                ? true
                : statusFilter === 'ACTIVE'
                    ? isActive
                    : !isActive;

        return matchesSearch && matchesStatus;
    });
    const sortedFilteredProfessores = useMemo(
        () => sortGridRows(filteredProfessores, TEACHER_COLUMNS, sortState),
        [filteredProfessores, sortState],
    );
    const displayedTeachersCount = sortedFilteredProfessores.length;

    // States do Formulário
    const [formData, setFormData] = useState<TeacherFormState>({
        name: '', rg: '', cpf: '', cnpj: '', nickname: '', corporateName: '', birthDate: '',
        phone: '', whatsapp: '', cellphone1: '', cellphone2: '', email: '', password: '',
        zipCode: '', street: '', number: '', city: '', state: '', neighborhood: '', complement: '',
        accessProfile: DEFAULT_TEACHER_PROFILE, permissions: getProfilePermissions(DEFAULT_TEACHER_PROFILE)
    });

    const fetchProfessores = async () => {
        try {
            setIsLoading(true);
            const { token, role, permissions, tenantId } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            setCurrentRole(role);
            setCurrentPermissions(permissions);
            setCurrentTenantId(tenantId);

            const [teachersResponse, subjectsResponse] = await Promise.all([
                fetch('http://localhost:3001/api/v1/teachers', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }),
                fetch('http://localhost:3001/api/v1/subjects?activeOnly=1', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
            ]);

            if (!teachersResponse.ok) {
                const errData = await teachersResponse.json().catch(() => null);
                throw new Error(errData?.message || 'Falha ao buscar professores');
            }

            if (!subjectsResponse.ok) {
                const errData = await subjectsResponse.json().catch(() => null);
                throw new Error(errData?.message || 'Falha ao buscar disciplinas');
            }

            const [teachersData, subjectsData] = await Promise.all([
                teachersResponse.json(),
                subjectsResponse.json()
            ]);

            setProfessores(teachersData);
            setSubjects(
                Array.isArray(subjectsData)
                    ? subjectsData.filter((subject: SubjectRecord) => !subject.canceledAt)
                    : [],
            );
            setSelectedTeacherForSubjects((current) => {
                if (!current) return null;
                return teachersData.find((teacher: TeacherRecord) => teacher.id === current.id) || null;
            });
        } catch (err: any) {
            console.error(err);
            setErrorStatus(err.message || 'Não foi possível carregar os professores. Verifique se o backend está rodando.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProfessores();
    }, []);

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
            setPersonSystemRoles(['PROFESSOR']);
        }
    };

    useEffect(() => {
        if (!currentTenantId) return;
        let isMounted = true;
        setIsGridConfigReady(false);
        void loadTeacherGridConfig(currentTenantId).then((config) => {
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
        if (!currentTenantId) return;
        if (!isGridConfigReady) return;
        writeTeacherGridConfig(currentTenantId, columnOrder, hiddenColumns);
    }, [columnOrder, currentTenantId, hiddenColumns, isGridConfigReady]);

    useEffect(() => {
        if (!errorStatus && !successStatus) return;
        const timer = setTimeout(() => {
            setErrorStatus(null);
            setSuccessStatus(null);
        }, 5000);

        return () => clearTimeout(timer);
    }, [errorStatus, successStatus]);

    useEffect(() => {
        if (!isModalOpen || !!editingTeacherId) {
            setDebouncedTeacherNameQuery('');
            setNameSuggestionError(null);
            return;
        }

        const nameQuery = String(formData.name || '').trim();
        if (nameQuery.length < 2) {
            setDebouncedTeacherNameQuery('');
            setNameSuggestions([]);
            setShowNameSuggestions(false);
            setIsLoadingNameSuggestions(false);
            setNameSuggestionError(null);
            return;
        }

        const timer = window.setTimeout(() => {
            setDebouncedTeacherNameQuery(nameQuery);
        }, 260);

        return () => window.clearTimeout(timer);
    }, [editingTeacherId, formData.name, isModalOpen]);

    useEffect(() => {
        if (!isModalOpen || !!editingTeacherId || !debouncedTeacherNameQuery) return;

        let isActive = true;
        setIsLoadingNameSuggestions(true);
        setShowNameSuggestions(true);
        setNameSuggestionError(null);

        void fetchSharedPersonNameSuggestions(debouncedTeacherNameQuery, 8)
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
    }, [debouncedTeacherNameQuery, editingTeacherId, isModalOpen]);

    if (!isLoading && !canViewTeachers) {
        return (
            <DashboardAccessDenied
                title="Acesso restrito aos professores"
                message="Seu perfil não possui permissão para consultar a equipe docente e as disciplinas vinculadas desta escola."
            />
        );
    }

    const openModal = () => {
        setEditingTeacherId(null);
        setOriginalTeacherEmail('');
        setActiveTab(1);
        setSelectedTeacherForSubjects(null);
        setSelectedSubjectIdForTeacher('');
        setHourlyRateForTeacher('');
        setEffectiveFromForTeacher(todayDateInput);
        setEditingHourlyRateBySubject({});
        setEditingEffectiveFromBySubject({});
        setFormData({
            name: '', rg: '', cpf: '', cnpj: '', nickname: '', corporateName: '', birthDate: '',
            phone: '', whatsapp: '', cellphone1: '', cellphone2: '', email: '', password: '',
            zipCode: '', street: '', number: '', city: '', state: '', neighborhood: '', complement: '',
            accessProfile: DEFAULT_TEACHER_PROFILE, permissions: getProfilePermissions(DEFAULT_TEACHER_PROFILE)
        });
        setPersonSystemRoles(['PROFESSOR']);
        setNameSuggestions([]);
        setShowNameSuggestions(false);
        setNameSuggestionError(null);
        setExistingCpfAlert(null);
        setEmailUsageAlert(null);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingTeacherId(null);
        setOriginalTeacherEmail('');
        setSelectedTeacherForSubjects(null);
        setSelectedSubjectIdForTeacher('');
        setHourlyRateForTeacher('');
        setEffectiveFromForTeacher(todayDateInput);
        setEditingHourlyRateBySubject({});
        setEditingEffectiveFromBySubject({});
        setPersonSystemRoles(['PROFESSOR']);
        setNameSuggestions([]);
        setShowNameSuggestions(false);
        setNameSuggestionError(null);
        setExistingCpfAlert(null);
        setEmailUsageAlert(null);
    };

    const handleEdit = (prof: TeacherRecord) => {
        setEditingTeacherId(prof.id);
        setOriginalTeacherEmail(String(prof.email || '').trim().toUpperCase());
        setActiveTab(1);
        setSelectedTeacherForSubjects(prof);
        setSelectedSubjectIdForTeacher('');
        setHourlyRateForTeacher('');
        setEffectiveFromForTeacher(todayDateInput);
        setEditingHourlyRateBySubject(
            (prof.teacherSubjects || []).reduce<Record<string, string>>((accumulator, assignment) => {
                accumulator[assignment.subjectId] = typeof assignment.hourlyRate === 'number'
                    ? assignment.hourlyRate.toFixed(2).replace('.', ',')
                    : '';
                return accumulator;
            }, {}),
        );
        setEditingEffectiveFromBySubject(
            (prof.teacherSubjects || []).reduce<Record<string, string>>((accumulator, assignment) => {
                accumulator[assignment.subjectId] = getAssignmentEffectiveFrom(assignment);
                return accumulator;
            }, {}),
        );
        setFormData({
            name: prof.name || '',
            rg: prof.rg || '',
            cpf: prof.cpf || '',
            cnpj: prof.cnpj || '',
            nickname: prof.nickname || '',
            corporateName: prof.corporateName || '',
            birthDate: prof.birthDate ? new Date(prof.birthDate).toISOString().split('T')[0] : '',
            phone: prof.phone || '',
            whatsapp: prof.whatsapp || '',
            cellphone1: prof.cellphone1 || '',
            cellphone2: prof.cellphone2 || '',
            email: prof.email || '',
            password: '', // Não carrega senha
            zipCode: prof.zipCode || '',
            street: prof.street || '',
            number: prof.number || '',
            city: prof.city || '',
            state: prof.state || '',
            neighborhood: prof.neighborhood || '',
            complement: prof.complement || '',
            accessProfile: prof.accessProfile || DEFAULT_TEACHER_PROFILE,
            permissions: Array.isArray(prof.permissions) && prof.permissions.length > 0 ? prof.permissions : getProfilePermissions(prof.accessProfile || DEFAULT_TEACHER_PROFILE),
        });
        setPersonSystemRoles(buildSystemRoleBadges(['PROFESSOR']));
        setNameSuggestions([]);
        setShowNameSuggestions(false);
        setNameSuggestionError(null);
        setExistingCpfAlert(null);
        setEmailUsageAlert(null);
        void resolvePersonSystemRoles(prof.cpf, prof.email);
        setIsModalOpen(true);
    };

    const handleCpfBlur = async () => {
        if (!formData.cpf || editingTeacherId) return;

        try {
            const profile = await fetchSharedPersonProfileByCpf(formData.cpf);
            if (!profile) {
                setPersonSystemRoles(['PROFESSOR']);
                setExistingCpfAlert(null);
                return;
            }

            setFormData((current) => (
                mergeSharedPersonIntoForm(
                    current as unknown as Record<string, string>,
                    profile,
                ) as unknown as TeacherFormState
            ));
            const resolvedRoles = buildSystemRoleBadges(profile.roles);
            const detectedRoles = buildDetectedRoleBadges(profile.roles);
            setPersonSystemRoles(resolvedRoles);
            setExistingCpfAlert({
                name: String(profile.name || 'PESSOA JÁ CADASTRADA'),
                roles: detectedRoles.length ? detectedRoles : ['CADASTRO BASE'],
            });
        } catch (error: any) {
            setSaveError(error?.message || 'Não foi possível reaproveitar os dados deste CPF.');
            setExistingCpfAlert(null);
        }
    };

    const handleTeacherNameChange = (value: string) => {
        setFormData((current) => ({ ...current, name: value.toUpperCase() }));
        if (!editingTeacherId) {
            setShowNameSuggestions(String(value || '').trim().length >= 2);
        }
    };

    const handleTeacherCpfChange = (value: string) => {
        setFormData((current) => ({ ...current, cpf: value.toUpperCase() }));
        setExistingCpfAlert(null);
    };

    const handleTeacherEmailChange = (value: string) => {
        setFormData((current) => ({ ...current, email: value.toUpperCase() }));
        setEmailUsageAlert(null);
    };

    const normalizeTeacherEmail = (value?: string | null) => String(value || '').trim().toUpperCase();

    const resolveTeacherEmailUsageConflicts = async (email: string, showAlert = true) => {
        const normalizedEmail = normalizeTeacherEmail(email);

        if (!normalizedEmail || !normalizedEmail.includes('@')) {
            if (showAlert) {
                setEmailUsageAlert(null);
            }
            return [] as EmailUsageRecord[];
        }

        const normalizedOriginalEmail = normalizeTeacherEmail(originalTeacherEmail);
        if (editingTeacherId && normalizedEmail === normalizedOriginalEmail) {
            if (showAlert) {
                setEmailUsageAlert(null);
            }
            return [] as EmailUsageRecord[];
        }

        const usages = await fetchEmailUsageByEmail(normalizedEmail);
        const filteredUsages = usages.filter((usage) => {
            if (!editingTeacherId) return true;
            return !(usage.entityType === 'TEACHER' && usage.recordId === editingTeacherId);
        });

        if (filteredUsages.length === 0) {
            if (showAlert) {
                setEmailUsageAlert(null);
            }
            return [] as EmailUsageRecord[];
        }

        if (showAlert) {
            setEmailUsageAlert({
                email: normalizedEmail,
                usages: filteredUsages,
                currentTenantId,
                currentTenantName: currentTenantBranding?.schoolName || 'ESCOLA LOGADA',
            });
        }

        return filteredUsages;
    };

    const handleTeacherEmailBlur = async () => {
        const normalizedEmail = String(formData.email || '').trim().toUpperCase();

        if (!normalizedEmail || !normalizedEmail.includes('@')) {
            setEmailUsageAlert(null);
            return;
        }

        try {
            await resolveTeacherEmailUsageConflicts(normalizedEmail);
        } catch (error: any) {
            setEmailUsageAlert(null);
            setErrorStatus(error?.message || 'Não foi possível consultar o uso deste e-mail.');
        }
    };

    const handleTeacherProfileChange = (profileCode: AccessProfileCode) => {
        setFormData((current) => ({
            ...current,
            accessProfile: profileCode,
            permissions: getProfilePermissions(profileCode),
        }));
    };

    const toggleSort = (column: TeacherColumnKey) => {
        setSortState((current) => ({
            column,
            direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const toggleExportColumn = (column: TeacherExportColumnKey) => {
        setExportColumns((current) => ({ ...current, [column]: !current[column] }));
    };

    const setAllExportColumns = (value: boolean) => {
        setExportColumns(
            availableTeacherExportColumns.reduce<Record<TeacherExportColumnKey, boolean>>((accumulator, column) => {
                accumulator[column.key] = value;
                return accumulator;
            }, {} as Record<TeacherExportColumnKey, boolean>),
        );
    };

    const renderTeacherInfoButton = (teacher: TeacherRecord) => (
        <GridRecordPopover
            title={teacher.name}
            subtitle={teacher.birthDate ? `Nascimento: ${formatTeacherDate(teacher.birthDate)}` : 'Docente sem data de nascimento informada'}
            buttonLabel={`Ver detalhes do professor ${teacher.name}`}
            badges={[
                teacher.canceledAt ? 'INATIVO' : 'ATIVO',
            ]}
            sections={[
                {
                    title: 'Cadastro',
                    items: [
                        ...(teacherFieldAccess.sensitive ? [
                            { label: 'CPF', value: teacher.cpf || 'Não informado' },
                            { label: 'RG', value: teacher.rg || 'Não informado' },
                            { label: 'CNPJ', value: teacher.cnpj || 'Não informado' },
                        ] : []),
                        { label: 'Apelido', value: teacher.nickname || 'Não informado' },
                        { label: 'Nome empresarial', value: teacher.corporateName || 'Não informado' },
                    ],
                },
                ...(teacherFieldAccess.contact || teacherFieldAccess.access ? [{
                    title: 'Contato',
                    items: [
                        ...(teacherFieldAccess.access ? [{ label: 'E-mail', value: teacher.email || 'Não informado' }] : []),
                        ...(teacherFieldAccess.contact ? [
                            { label: 'Telefone principal', value: teacher.whatsapp || teacher.phone || teacher.cellphone1 || teacher.cellphone2 || 'Não informado' },
                            { label: 'Telefone 1', value: teacher.cellphone1 || 'Não informado' },
                            { label: 'Telefone 2', value: teacher.cellphone2 || 'Não informado' },
                            { label: 'WhatsApp', value: teacher.whatsapp || 'Não informado' },
                        ] : []),
                    ],
                }] : []),
                ...(teacherFieldAccess.contact ? [{
                    title: 'Endereço',
                    items: [
                        { label: 'Endereço completo', value: formatTeacherAddress(teacher) },
                        { label: 'Cidade / UF', value: [teacher.city, teacher.state].filter(Boolean).join(' / ') || 'Não informado' },
                        { label: 'CEP', value: teacher.zipCode || 'Não informado' },
                        { label: 'Complemento', value: teacher.complement || 'Não informado' },
                    ],
                }] : []),
            ]}
            disciplines={getTeacherSubjectNames(teacher)}
            contextLabel="PRINCIPAL_PROFESSORES_POPUP"
        />
    );

    const toggleGridColumnVisibility = (columnKey: TeacherColumnKey) => {
        const isHidden = hiddenColumns.includes(columnKey);
        const visibleCount = availableTeacherColumns.filter((column) => !hiddenColumns.includes(column.key)).length;

        if (!isHidden && visibleCount === 1) {
            setErrorStatus('Pelo menos uma coluna precisa continuar visível no grid.');
            return;
        }

        setHiddenColumns((current) =>
            isHidden ? current.filter((item) => item !== columnKey) : [...current, columnKey],
        );
    };

    const moveGridColumn = (columnKey: TeacherColumnKey, direction: 'up' | 'down') => {
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
        setColumnOrder(normalizeTeacherColumnOrder(DEFAULT_VISIBLE_TEACHER_COLUMNS));
        setHiddenColumns(ALL_TEACHER_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_TEACHER_COLUMNS.includes(key)));
    };

    const renderTeacherGridCell = (prof: TeacherRecord, columnKey: TeacherColumnKey) => {
        if (columnKey === 'name') {
            return (
                <td key={columnKey} className="px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border ${prof.canceledAt ? 'bg-rose-100 text-rose-700 border-rose-200/50' : 'bg-blue-100 text-blue-700 border-blue-200/50'}`}>
                            {prof.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <div className={`flex items-center gap-2 font-semibold ${prof.canceledAt ? 'text-rose-800' : 'text-slate-800'}`}>
                                <span>{prof.name}</span>
                                <RecordStatusIndicator active={!prof.canceledAt} />
                            </div>
                            {(() => {
                                const subjectList = formatTeacherSubjects(prof);
                                return subjectList ? (
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                                            DISCIPLINAS
                                        </span>
                                        <span className="text-xs font-semibold text-slate-500">{subjectList}</span>
                                    </div>
                                ) : null;
                            })()}
                        </div>
                    </div>
                </td>
            );
        }

        if (columnKey === 'contact') {
            return (
                <td key={columnKey} className="px-6 py-4">
                    <div className={`text-sm font-medium ${prof.canceledAt ? 'text-rose-800' : 'text-slate-700'}`}>
                        {teacherFieldAccess.access
                            ? (prof.email || <span className="text-slate-400 italic">Sem login</span>)
                            : (teacherFieldAccess.contact ? (prof.whatsapp || prof.phone || prof.cellphone1 || prof.cellphone2 || 'Sem contato') : '---')}
                    </div>
                    {teacherFieldAccess.contact ? (
                        <div className={`text-[13px] mt-0.5 ${prof.canceledAt ? 'text-rose-500' : 'text-slate-400'}`}>
                            {prof.phone || prof.whatsapp || prof.cellphone1 || prof.cellphone2 || '---'}
                        </div>
                    ) : null}
                </td>
            );
        }

        if (columnKey === 'pwaStatus') {
            return (
                <td key={columnKey} className="px-6 py-4 text-center">
                    {prof.email ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> App Liberado
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span> Sem Acesso
                        </span>
                    )}
                </td>
            );
        }
        const value = TEACHER_COLUMNS.find((column) => column.key === columnKey)?.getValue(prof) || '---';
        return (
            <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${prof.canceledAt ? 'text-rose-700' : 'text-slate-600'}`}>
                {value}
            </td>
        );
    };

    const openTeacherStatusModal = (teacher: TeacherRecord) => {
        setTeacherStatusToggleTarget(teacher);
        setTeacherStatusToggleAction(teacher.canceledAt ? 'activate' : 'deactivate');
    };

    const closeTeacherStatusModal = (force = false) => {
        if (!force && isProcessingTeacherToggle) return;
        setTeacherStatusToggleTarget(null);
        setTeacherStatusToggleAction(null);
    };

    const confirmTeacherStatusToggle = async () => {
        if (!teacherStatusToggleTarget || !teacherStatusToggleAction) return;
        const willActivate = teacherStatusToggleAction === 'activate';

        try {
            setIsProcessingTeacherToggle(true);
            const token = getStoredToken();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const response = await fetch(`http://localhost:3001/api/v1/teachers/${teacherStatusToggleTarget.id}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ active: willActivate }),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || `Não foi possível ${willActivate ? 'ativar' : 'inativar'} o professor.`);
            }

            setSuccessStatus(data?.message || (willActivate ? 'Professor ativado com sucesso.' : 'Professor inativado com sucesso.'));
            await fetchProfessores();
            closeTeacherStatusModal(true);
        } catch (error: any) {
            setErrorStatus(error?.message || 'Não foi possível alterar o status do professor.');
        } finally {
            setIsProcessingTeacherToggle(false);
        }
    };

    const toggleTeacherPermission = (permission: string) => {
        setFormData((current) => ({
            ...current,
            permissions: current.permissions.includes(permission)
                ? current.permissions.filter((item) => item !== permission)
                : [...current.permissions, permission],
        }));
    };

    const handleAssignSubjectToTeacher = async (event?: React.FormEvent) => {
        event?.preventDefault();
        if (!selectedTeacherForSubjects || !canManageTeacherSubjects) return;
        if (!selectedSubjectIdForTeacher) {
            setErrorStatus('Selecione uma disciplina para este professor.');
            return;
        }

        const alreadyAssigned = selectedTeacherForSubjects.teacherSubjects?.some(
            (assignment) => assignment.subjectId === selectedSubjectIdForTeacher,
        );

        if (alreadyAssigned) {
            setErrorStatus('Esta disciplina já está vinculada a este professor.');
            return;
        }

        try {
            setIsAssigningSubject(true);
            setErrorStatus(null);
            const token = getStoredToken();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const payload: { subjectId: string; hourlyRate?: number; effectiveFrom?: string } = {
                subjectId: selectedSubjectIdForTeacher,
            };

            if (teacherFieldAccess.financial && hourlyRateForTeacher.trim()) {
                const parsedHourlyRate = Number(hourlyRateForTeacher.replace(',', '.'));
                if (Number.isNaN(parsedHourlyRate)) {
                    throw new Error('Informe um valor de hora-aula válido.');
                }
                payload.hourlyRate = parsedHourlyRate;
                payload.effectiveFrom = effectiveFromForTeacher || todayDateInput;
            }

            const response = await fetch(`http://localhost:3001/api/v1/teachers/${selectedTeacherForSubjects.id}/subjects`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível vincular a disciplina ao professor.');
            }

            setSuccessStatus('Disciplina vinculada ao professor com sucesso.');
            setSelectedSubjectIdForTeacher('');
            setHourlyRateForTeacher('');
            setEffectiveFromForTeacher(todayDateInput);
            await fetchProfessores();
        } catch (err: any) {
            setErrorStatus(err.message || 'Não foi possível vincular a disciplina ao professor.');
        } finally {
            setIsAssigningSubject(false);
        }
    };

    const handleRemoveTeacherSubject = async (subjectId: string, subjectName: string) => {
        if (!selectedTeacherForSubjects || !canManageTeacherSubjects) return;
        const confirmed = window.confirm(`Deseja desvincular a disciplina ${subjectName} deste professor?`);
        if (!confirmed) return;

        try {
            const assignmentKey = `${selectedTeacherForSubjects.id}:${subjectId}`;
            setRemovingAssignmentKey(assignmentKey);
            setErrorStatus(null);
            const token = getStoredToken();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const response = await fetch(`http://localhost:3001/api/v1/teachers/${selectedTeacherForSubjects.id}/subjects/${subjectId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível desvincular a disciplina do professor.');
            }

            setSuccessStatus('Disciplina desvinculada com sucesso.');
            await fetchProfessores();
        } catch (err: any) {
            setErrorStatus(err.message || 'Não foi possível desvincular a disciplina do professor.');
        } finally {
            setRemovingAssignmentKey(null);
        }
    };

    const handleHourlyRateDraftChange = (subjectId: string, value: string) => {
        setEditingHourlyRateBySubject((current) => ({
            ...current,
            [subjectId]: value,
        }));
    };

    const handleEffectiveFromDraftChange = (subjectId: string, value: string) => {
        setEditingEffectiveFromBySubject((current) => ({
            ...current,
            [subjectId]: value,
        }));
    };

    const handleUpdateTeacherSubject = async (subjectId: string, subjectName: string) => {
        if (!selectedTeacherForSubjects || !canManageTeacherSubjects || !teacherFieldAccess.financial) return;

        const rawValue = (editingHourlyRateBySubject[subjectId] || '').trim();
        const normalizedValue = rawValue.replace(',', '.');
        const parsedHourlyRate = normalizedValue ? Number(normalizedValue) : null;
        const effectiveFrom = editingEffectiveFromBySubject[subjectId] || todayDateInput;

        if (normalizedValue && Number.isNaN(parsedHourlyRate)) {
            setErrorStatus(`Informe um valor de hora-aula válido para ${subjectName}.`);
            return;
        }

        if (!effectiveFrom) {
            setErrorStatus(`Informe a data de vigência para ${subjectName}.`);
            return;
        }

        try {
            const assignmentKey = `${selectedTeacherForSubjects.id}:${subjectId}`;
            setUpdatingAssignmentKey(assignmentKey);
            setErrorStatus(null);
            const token = getStoredToken();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const response = await fetch(`http://localhost:3001/api/v1/teachers/${selectedTeacherForSubjects.id}/subjects/${subjectId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    hourlyRate: parsedHourlyRate === null ? null : parsedHourlyRate,
                    effectiveFrom,
                })
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível atualizar a hora-aula da disciplina.');
            }

            setSuccessStatus(`Hora-aula atualizada para ${subjectName} com vigência em ${new Date(`${effectiveFrom}T00:00:00`).toLocaleDateString()}.`);
            await fetchProfessores();
        } catch (err: any) {
            setErrorStatus(err.message || 'Não foi possível atualizar a hora-aula da disciplina.');
        } finally {
            setUpdatingAssignmentKey(null);
        }
    };

    const handleCepSearch = async () => {
        const cep = formData.zipCode.replace(/\D/g, '');
        if (cep.length !== 8) {
            alert('CEP inválido! Digite os 8 números.');
            return;
        }

        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            if (!response.ok) throw new Error('Erro na requisição do CEP');

            const data = await response.json();

            if (data.erro) {
                alert('O CEP informado não foi encontrado.');
                return;
            }

            setFormData(prev => ({
                ...prev,
                street: data.logradouro ? data.logradouro.toUpperCase() : '',
                neighborhood: data.bairro ? data.bairro.toUpperCase() : '',
                city: data.localidade ? data.localidade.toUpperCase() : '',
                state: data.uf || ''
            }));
        } catch (error) {
            console.error('Falha ao consultar viaCEP:', error);
            alert('Falha ao consultar CEP.');
        }
    };

    const isValidCpf = (cpf: string) => {
        cpf = cpf.replace(/[^\d]+/g, '');
        if (cpf === '' || cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
        let add = 0;
        for (let i = 0; i < 9; i++) add += parseInt(cpf.charAt(i)) * (10 - i);
        let rev = 11 - (add % 11);
        if (rev === 10 || rev === 11) rev = 0;
        if (rev !== parseInt(cpf.charAt(9))) return false;
        add = 0;
        for (let i = 0; i < 10; i++) add += parseInt(cpf.charAt(i)) * (11 - i);
        rev = 11 - (add % 11);
        if (rev === 10 || rev === 11) rev = 0;
        if (rev !== parseInt(cpf.charAt(10))) return false;
        return true;
    };

    const isValidCnpj = (cnpj: string) => {
        cnpj = cnpj.replace(/[^\d]+/g, '');
        if (cnpj === '' || cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
        let tamanho = cnpj.length - 2;
        let numeros = cnpj.substring(0, tamanho);
        const digitos = cnpj.substring(tamanho);
        let soma = 0;
        let pos = tamanho - 7;
        for (let i = tamanho; i >= 1; i--) {
            soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
            if (pos < 2) pos = 9;
        }
        let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
        if (resultado !== parseInt(digitos.charAt(0))) return false;
        tamanho = tamanho + 1;
        numeros = cnpj.substring(0, tamanho);
        soma = 0;
        pos = tamanho - 7;
        for (let i = tamanho; i >= 1; i--) {
            soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
            if (pos < 2) pos = 9;
        }
        resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
        if (resultado !== parseInt(digitos.charAt(1))) return false;
        return true;
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validação de Documentos antes de enviar pro Back-End!
        if (formData.cpf && formData.cpf.trim() !== '') {
            if (!isValidCpf(formData.cpf)) {
                setSaveError("E R R O ! ! !\nCPF Inválido\nPor favor, digite um CPF válido e tente novamente.");
                setTimeout(() => setSaveError(null), 5000);
                return;
            }
        }

        if (formData.cnpj && formData.cnpj.trim() !== '') {
            if (!isValidCnpj(formData.cnpj)) {
                setSaveError("E R R O ! ! !\nCNPJ Inválido\nO CNPJ do professor (MEI/PJ) não é válido.");
                setTimeout(() => setSaveError(null), 5000);
                return;
            }
        }

        try {
            const token = getStoredToken();
            const url = editingTeacherId
                ? `http://localhost:3001/api/v1/teachers/${editingTeacherId}`
                : 'http://localhost:3001/api/v1/teachers';
            const method = editingTeacherId ? 'PATCH' : 'POST';

            const payload = { ...formData, password: formData.password.trim(), permissions: formData.permissions };
            if (editingTeacherId && !payload.password) {
                delete (payload as any).password;
            }
            if (!teacherFieldAccess.access) {
                delete (payload as any).email;
                delete (payload as any).password;
                delete (payload as any).accessProfile;
                delete (payload as any).permissions;
            }
            if (!payload.birthDate) {
                delete (payload as any).birthDate;
            }

            // Mágica da Formatação (Pelo menos no Back-End e Banco de Dados vai ficar lindo!)
            if (payload.cpf) {
                const cleanCpf = payload.cpf.replace(/[^\d]+/g, '');
                if (cleanCpf.length === 11) {
                    payload.cpf = cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
                }
            }
            if (payload.cnpj) {
                const cleanCnpj = payload.cnpj.replace(/[^\d]+/g, '');
                if (cleanCnpj.length === 14) {
                    payload.cnpj = cleanCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
                }
            }

            // Mágica da Formatação de Telefones
            const formatPhone = (val: string) => {
                if (!val) return val;
                let num = val.replace(/[^\d]+/g, '');
                // Se começou com 0 e tem mais de 10 dígitos (Ex: 016...), extrai do segundo caractere em diante
                if (num.startsWith('0') && num.length >= 11) {
                    num = num.substring(1);
                }
                if (num.length === 11) { // Celular 9 dígitos
                    return num.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
                } else if (num.length === 10) { // Fixo 8 dígitos
                    return num.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
                }
                return val; // Devolve como está se for ramal ou algo bizarro
            };

            if (payload.phone) payload.phone = formatPhone(payload.phone);
            if (payload.whatsapp) payload.whatsapp = formatPhone(payload.whatsapp);
            if (payload.cellphone1) payload.cellphone1 = formatPhone(payload.cellphone1);
            if (payload.cellphone2) payload.cellphone2 = formatPhone(payload.cellphone2);

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.message || 'Erro ao salvar Professor');
            }

            closeModal();
            fetchProfessores();
            setEmailUsageAlert(null);

        } catch (err: any) {
            let errorMsg = err.message || 'Ocorreu um erro.';
            if (errorMsg.includes('password should not be empty') || errorMsg.includes('mínimo')) {
                errorMsg = 'A senha deve ter no mínimo 4 caracteres';
            }
            setSaveError(errorMsg);
            setTimeout(() => setSaveError(null), 5000);
        }
    };

    const currentTeacherForSubjects = selectedTeacherForSubjects
        ? professores.find((teacher) => teacher.id === selectedTeacherForSubjects.id) || selectedTeacherForSubjects
        : null;
    const currentTeacherAssignments = currentTeacherForSubjects?.teacherSubjects || [];
    const assignedSubjectIds = new Set(currentTeacherAssignments.map((assignment) => assignment.subjectId));
    const assignedSubjectNames = new Set(
        currentTeacherAssignments
            .map((assignment) => normalizeTeacherSubjectName(assignment.subject?.name))
            .filter(Boolean),
    );
    const availableSubjectsForCurrentTeacher = subjects.filter((subject) => (
        !subject.canceledAt
        && !assignedSubjectIds.has(subject.id)
        && !assignedSubjectNames.has(normalizeTeacherSubjectName(subject.name))
    ));

    const getAssignmentEffectiveFrom = (assignment: TeacherSubjectAssignment) =>
        toDateInputValue(assignment.rateHistories?.[0]?.effectiveFrom) || todayDateInput;

    return (
        <div className="w-full">
            {/* Cabeçalho */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-[#153a6a] tracking-tight">Equipe Docente</h1>
                    <p className="text-slate-500 font-medium mt-1">Gerencie os professores, dados contratuais e acesso ao Sistema.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setIsExportModalOpen(true)}
                        className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                    >
                        Exportar
                    </button>
                    {canManageTeachers && (
                        <button
                            onClick={openModal}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                            Novo Docente
                        </button>
                    )}
                </div>
            </div>

            <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-medium text-blue-800">
                O cadastro-base compartilhado agora fica em <Link href="/dashboard/pessoas" className="font-black underline">Pessoas</Link>. Use esta area principalmente para operacoes do papel de professor, como disciplinas, valores por aula e ajustes especificos.
            </div>

            {errorStatus && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 mb-6 font-medium text-sm flex items-center gap-3">
                    <span className="bg-red-200 text-red-700 w-6 h-6 rounded-full flex items-center justify-center font-bold">!</span>
                    {errorStatus}
                </div>
            )}

            {successStatus && (
                <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl border border-emerald-100 mb-6 font-medium text-sm flex items-center gap-3">
                    <span className="bg-emerald-200 text-emerald-700 w-6 h-6 rounded-full flex items-center justify-center font-bold">✓</span>
                    {successStatus}
                </div>
            )}

            {/* Tabela */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="dashboard-band px-6 py-4 border-b">
                    <div className="relative w-full max-w-xs">
                        <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} type="text" placeholder="Buscar docente..." className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all" />
                        <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="dashboard-table-head border-b border-slate-300 text-[13px] uppercase tracking-wider font-bold">
                                {visibleTeacherColumns.map((column) => (
                                    <th key={column.key} className={`px-6 py-4 ${column.align === 'center' ? 'text-center' : ''}`}>
                                        <GridSortableHeader
                                            label={column.label}
                                            isActive={sortState.column === column.key}
                                            direction={sortState.direction}
                                            onClick={() => toggleSort(column.key)}
                                            align={column.align === 'center' ? 'center' : 'left'}
                                        />
                                    </th>
                                ))}
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={visibleTeacherColumns.length + 1} className="px-6 py-12 text-center text-slate-400 font-medium">
                                        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3"></div>
                                        Sincronizando com Banco de Dados...
                                    </td>
                                </tr>
                            ) : sortedFilteredProfessores.length === 0 ? (
                                <tr>
                                    <td colSpan={visibleTeacherColumns.length + 1} className="px-6 py-12 text-center text-slate-400 font-medium">
                                        Nenhum professor cadastrado ainda.
                                    </td>
                                </tr>
                            ) : (
                                sortedFilteredProfessores.map((prof) => (
                                    <tr key={prof.id} className={`transition-colors group ${prof.canceledAt ? 'bg-rose-50/40 hover:bg-rose-50' : 'hover:bg-slate-50'}`}>
                                        {visibleTeacherColumns.map((column) => renderTeacherGridCell(prof, column.key))}
                                        <td className="px-6 py-4 text-right">
                                        {canManageTeachers ? (
                                            <div className="flex justify-end gap-2">
                                                {renderTeacherInfoButton(prof)}
                                                <GridRowActionIconButton
                                                    title="Abrir manutenção do professor"
                                                    onClick={() => handleEdit(prof)}
                                                    tone="blue"
                                                >
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </GridRowActionIconButton>
                                                <GridRowActionIconButton
                                                    title={prof.canceledAt ? 'Ativar professor' : 'Inativar professor'}
                                                    onClick={() => openTeacherStatusModal(prof)}
                                                    tone={prof.canceledAt ? 'emerald' : 'rose'}
                                                >
                                                        {prof.canceledAt ? (
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728M6 6l12 12" />
                                                            </svg>
                                                        )}
                                                </GridRowActionIconButton>
                                            </div>
                                        ) : (
                                            <div className="flex justify-end gap-2">
                                                {renderTeacherInfoButton(prof)}
                                                <span className="self-center text-xs font-semibold text-slate-400">Somente leitura</span>
                                            </div>
                                        )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <GridFooterControls
                    key={`teacher-footer-${displayedTeachersCount}`}
                    recordsCount={Number(displayedTeachersCount)}
                    onOpenColumns={() => setIsGridConfigOpen(true)}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    activeLabel="Mostrar somente professores ativos"
                    allLabel="Mostrar professores ativos e inativos"
                    inactiveLabel="Mostrar somente professores inativos"
                />
            </div>

            <GridColumnConfigModal
                isOpen={isGridConfigOpen}
                title="Configurar colunas do grid"
                description="Reordene, oculte ou inclua colunas do cadastro de professores nesta tela."
                columns={availableTeacherColumns.map((column) => ({
                    key: column.key,
                    label: column.label,
                    visibleByDefault: column.visibleByDefault,
                }))}
                orderedColumns={columnOrder}
                hiddenColumns={hiddenColumns}
                onToggleColumnVisibility={toggleGridColumnVisibility}
                onMoveColumn={moveGridColumn}
                onReset={resetGridColumns}
                onClose={() => setIsGridConfigOpen(false)}
            />

            <StatusConfirmationModal
                isOpen={Boolean(teacherStatusToggleTarget && teacherStatusToggleAction)}
                tenantId={currentTenantId}
                actionType={teacherStatusToggleAction || 'activate'}
                title={teacherStatusToggleAction === 'activate' ? 'Ativar professor' : 'Inativar professor'}
                itemLabel="Professor"
                itemName={teacherStatusToggleTarget?.name || ''}
                description={teacherStatusToggleAction === 'activate'
                    ? 'Ao ativar o professor, ele volta a ter acesso ao PWA e pode ser vinculado a disciplinas normalmente.'
                    : 'Ao inativar o professor, seu acesso é suspenso, mantendo o histórico das aulas ministradas.'}
                confirmLabel={teacherStatusToggleAction === 'activate' ? 'Confirmar ativação' : 'Confirmar inativação'}
                onCancel={() => closeTeacherStatusModal(true)}
                onConfirm={confirmTeacherStatusToggle}
                isProcessing={isProcessingTeacherToggle}
                statusActive={!teacherStatusToggleTarget?.canceledAt}
                screenId={PROFESSORES_STATUS_MODAL_SCREEN_ID}
            />

            <GridExportModal
                isOpen={isExportModalOpen}
                title="Exportar professores"
                description={`A exportação respeita a busca atual e inclui ${sortedFilteredProfessores.length} registro(s).`}
                format={exportFormat}
                onFormatChange={setExportFormat}
                columns={availableTeacherExportColumns.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={exportColumns}
                onToggleColumn={toggleExportColumn}
                onSelectAll={setAllExportColumns}
                storageKey={getTeacherExportConfigStorageKey(currentTenantId)}
                legacyStorageKeys={teacherExportLegacyStorageKeys}
                onClose={() => setIsExportModalOpen(false)}
                onExport={async (config) => {
                    try {
                        await exportGridRows({
                            rows: sortedFilteredProfessores,
                            columns: config?.orderedColumns
                                ? config.orderedColumns
                                    .map((key) => availableTeacherExportColumns.find((column) => column.key === key))
                                    .filter((column): column is GridColumnDefinition<TeacherRecord, TeacherExportColumnKey> => !!column)
                                : availableTeacherExportColumns,
                            selectedColumns: config?.selectedColumns || exportColumns,
                            format: exportFormat,
                            pdfOptions: config?.pdfOptions,
                            fileBaseName: 'professores',
                            branding: {
                                title: 'Professores',
                                subtitle: 'Exportação com os filtros atualmente aplicados.',
                            },
                        });
                        setSuccessStatus(`Exportação ${exportFormat.toUpperCase()} preparada com ${sortedFilteredProfessores.length} registro(s).`);
                        setIsExportModalOpen(false);
                    } catch (error) {
                        setErrorStatus(error instanceof Error ? error.message : 'Não foi possível exportar os professores.');
                    }
                }}
            />

            {/* MODAL MÁGICO DE CADASTRO / EDIÇÃO */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">

                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                            <div className="flex items-center gap-4 min-w-0">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                    {currentTenantBranding?.logoUrl ? (
                                        <img
                                            src={currentTenantBranding.logoUrl}
                                            alt={currentTenantBranding.schoolName}
                                            className="h-full w-full object-contain"
                                        />
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
                                        {editingTeacherId ? `Editar dossiê do docente: ${formData.name || 'DOCENTE'}` : 'Cadastrar Novo Docente'}
                                    </h2>
                                </div>
                            </div>
                            <button
                                onClick={closeModal}
                                className="rounded-full bg-red-600 px-4 py-2 text-sm font-black uppercase tracking-[0.3em] text-white shadow-sm shadow-red-600/30 transition hover:bg-red-700"
                            >
                                Fechar
                            </button>
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
                        {currentTeacherAssignments.length ? (
                            <div className="border-b border-slate-100 bg-white px-6 py-4">
                                <div className="mb-2 text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">
                                    DISCIPLINAS
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {currentTeacherAssignments.map((assignment) => (
                                        <span
                                            key={assignment.id}
                                            className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white px-5 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-600 shadow-sm"
                                        >
                                            {assignment.subject?.name || 'DISCIPLINA'}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {/* Abas */}
                        <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 pt-4 gap-2 shrink-0">
                            <button type="button" onClick={() => setActiveTab(1)} className={`px-4 py-2.5 rounded-t-lg font-bold text-sm tracking-wide transition-colors ${activeTab === 1 ? 'bg-white text-blue-700 border-t border-l border-r border-slate-200 shadow-sm' : 'text-slate-500 hover:text-blue-600 hover:bg-slate-100'}`}>
                                1. DADOS BÁSICOS E CONTATOS
                            </button>
                            <button type="button" onClick={() => setActiveTab(2)} className={`px-4 py-2.5 rounded-t-lg font-bold text-sm tracking-wide transition-colors ${activeTab === 2 ? 'bg-white text-blue-700 border-t border-l border-r border-slate-200 shadow-sm' : 'text-slate-500 hover:text-blue-600 hover:bg-slate-100'}`}>
                                2. ENDEREÇO E LOGÍSTICA
                            </button>
                            <button type="button" onClick={() => setActiveTab(3)} className={`px-4 py-2.5 rounded-t-lg font-bold text-sm tracking-wide transition-colors ${activeTab === 3 ? 'bg-white text-blue-700 border-t border-l border-r border-slate-200 shadow-sm' : 'text-slate-500 hover:text-blue-600 hover:bg-slate-100'}`}>
                                3. DISCIPLINAS
                            </button>
                            <button type="button" onClick={() => setActiveTab(4)} className={`px-4 py-2.5 rounded-t-lg font-bold text-sm tracking-wide transition-colors ${activeTab === 4 ? 'bg-white text-blue-700 border-t border-l border-r border-slate-200 shadow-sm' : 'text-slate-500 hover:text-blue-600 hover:bg-slate-100'}`}>
                                4. ACESSO PWA (APP)
                            </button>
                        </div>

                        {/* Formulário */}
                        <form id="teacher-form" onSubmit={handleSave} className="flex-1 overflow-y-auto custom-scrollbar bg-white p-6">

                            {activeTab === 1 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <h4 className="text-xs uppercase tracking-wider font-bold text-blue-800 pb-2 border-b border-blue-50">Identificação Pessoal / Contratual</h4>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                        {teacherFieldAccess.sensitive ? (
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">CPF</label>
                                                <input type="text" value={formData.cpf} onChange={(event) => handleTeacherCpfChange(event.target.value)} onBlur={handleCpfBlur} className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white" placeholder="Somente números" />
                                                {!editingTeacherId && existingCpfAlert ? (
                                                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                                                        <div className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-700">CPF já cadastrado</div>
                                                        <div className="mt-1 text-xs font-semibold text-amber-800">
                                                            {existingCpfAlert.name} já possui os papéis:
                                                        </div>
                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                            {existingCpfAlert.roles.map((role) => (
                                                                <span key={`cpf-alert-${role}`} className="inline-flex items-center rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700">
                                                                    {role}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}
                                        <div className="lg:col-span-2 relative">
                                            <label className="text-xs font-bold text-slate-600 mb-1 block">Nome Completo do Docente *</label>
                                            <input
                                                type="text"
                                                required
                                                value={formData.name}
                                                onChange={(event) => handleTeacherNameChange(event.target.value)}
                                                onFocus={() => {
                                                    if (!editingTeacherId && String(formData.name || '').trim().length >= 2) {
                                                        setShowNameSuggestions(true);
                                                    }
                                                }}
                                                onBlur={() => {
                                                    window.setTimeout(() => setShowNameSuggestions(false), 160);
                                                }}
                                                className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                                                placeholder="Ex: Professor Girafales"
                                            />
                                            {!editingTeacherId && (showNameSuggestions || isLoadingNameSuggestions) ? (
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
                                        <div>
                                            <label className="text-xs font-bold text-slate-600 mb-1 block">Data de Nascimento</label>
                                            <input type="date" value={formData.birthDate} onChange={e => setFormData({ ...formData, birthDate: e.target.value })} className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white" />
                                        </div>

                                        {teacherFieldAccess.sensitive ? (
                                            <>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 mb-1 block">RG</label>
                                                    <input type="text" value={formData.rg} onChange={e => setFormData({ ...formData, rg: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 mb-1 block">CNPJ (PJ / MEI se houver)</label>
                                                    <input type="text" value={formData.cnpj} onChange={e => setFormData({ ...formData, cnpj: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white" />
                                                </div>
                                            </>
                                        ) : null}

                                        {teacherFieldAccess.contact || teacherFieldAccess.access ? (
                                            <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                                                {teacherFieldAccess.contact ? (
                                                    <>
                                                        <div>
                                                            <label className="text-xs font-bold text-slate-600 mb-1 block">Celular 1 (WhatsApp)</label>
                                                            <input type="text" value={formData.whatsapp} onChange={e => setFormData({ ...formData, whatsapp: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white" />
                                                        </div>
                                                        <div>
                                                            <label className="text-xs font-bold text-slate-600 mb-1 block">Telefone Secundário</label>
                                                            <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white" />
                                                        </div>
                                                    </>
                                                ) : null}
                                                {teacherFieldAccess.access ? (
                                                    <div className="md:col-span-2">
                                                        <label className="text-xs font-bold text-slate-600 mb-1 block">E-mail para contato / acesso</label>
                                                        <input
                                                            type="email"
                                                            value={formData.email}
                                                            onChange={(e) => handleTeacherEmailChange(e.target.value)}
                                                            onBlur={() => void handleTeacherEmailBlur()}
                                                            className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white"
                                                        />
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            )}

                            {activeTab === 2 && (
                                teacherFieldAccess.contact ? (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <h4 className="text-xs uppercase tracking-wider font-bold text-blue-800 pb-2 border-b border-blue-50">Endereço Residencial do Docente</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">CEP</label>
                                                <div className="flex gap-2">
                                                    <input type="text" value={formData.zipCode} onChange={e => setFormData({ ...formData, zipCode: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white" placeholder="00000-000" />
                                                    <button type="button" onClick={handleCepSearch} className="bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200 rounded-lg px-3 transition-colors font-bold shadow-sm">
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Logradouro / Rua</label>
                                                <input type="text" value={formData.street} onChange={e => setFormData({ ...formData, street: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Número</label>
                                                <input type="text" value={formData.number} onChange={e => setFormData({ ...formData, number: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white" />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Bairro</label>
                                                <input type="text" value={formData.neighborhood} onChange={e => setFormData({ ...formData, neighborhood: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white" />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Complemento</label>
                                                <input type="text" value={formData.complement} onChange={e => setFormData({ ...formData, complement: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white" />
                                            </div>
                                            <div className="md:col-span-3">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Cidade</label>
                                                <input type="text" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white" />
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">UF</label>
                                                <input type="text" value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white" />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-medium text-amber-700">
                                        Seu perfil não possui autorização para consultar ou alterar os dados de contato e endereço deste professor.
                                    </div>
                                )
                            )}

                            {activeTab === 3 && (
                                teacherFieldAccess.academic || canManageTeacherSubjects ? (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <h4 className="text-xs uppercase tracking-wider font-bold text-blue-800 pb-2 border-b border-blue-50">Disciplinas que o docente leciona</h4>

                                        {!editingTeacherId || !currentTeacherForSubjects ? (
                                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm font-medium text-amber-800">
                                                Salve o cadastro do professor primeiro. Depois disso, esta aba libera o vínculo das disciplinas que ele poderá lecionar.
                                            </div>
                                        ) : (
                                            <>
                                                {canManageTeacherSubjects ? (
                                                    <div className="dashboard-band-soft grid grid-cols-1 gap-4 rounded-2xl border p-4 md:grid-cols-[1.2fr_0.9fr_0.9fr_auto]">
                                                        <div>
                                                            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Nova disciplina</label>
                                                            <select
                                                                value={selectedSubjectIdForTeacher}
                                                                onChange={(e) => setSelectedSubjectIdForTeacher(e.target.value)}
                                                                disabled={isAssigningSubject}
                                                                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                                                            >
                                                                <option value="">Selecione uma disciplina</option>
                                                                {availableSubjectsForCurrentTeacher.map((subject) => (
                                                                    <option key={subject.id} value={subject.id}>{subject.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Hora-aula</label>
                                                            {teacherFieldAccess.financial ? (
                                                                <input
                                                                    type="text"
                                                                    value={hourlyRateForTeacher}
                                                                    onChange={(e) => setHourlyRateForTeacher(e.target.value)}
                                                                    placeholder="Ex: 45,00"
                                                                    disabled={isAssigningSubject}
                                                                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                                                                />
                                                            ) : (
                                                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
                                                                    Hora-aula oculta para este perfil.
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Vigência</label>
                                                            {teacherFieldAccess.financial ? (
                                                                <input
                                                                    type="date"
                                                                    value={effectiveFromForTeacher}
                                                                    onChange={(e) => setEffectiveFromForTeacher(e.target.value)}
                                                                    disabled={isAssigningSubject}
                                                                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                                                                />
                                                            ) : (
                                                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
                                                                    Vigência vinculada ao valor financeiro.
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex items-end">
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleAssignSubjectToTeacher()}
                                                                disabled={isAssigningSubject}
                                                                className="w-full rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-violet-600/20 transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                                                            >
                                                                {isAssigningSubject ? 'Vinculando...' : 'Atribuir disciplina'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : null}

                                                {currentTeacherAssignments.length > 0 ? (
                                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                        {currentTeacherAssignments.map((assignment) => (
                                                            <div key={assignment.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div>
                                                                        <div className="font-bold text-slate-800">{assignment.subject?.name || 'Disciplina sem nome'}</div>
                                                                        {teacherFieldAccess.financial ? (
                                                                            <div className="mt-3 space-y-2">
                                                                                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                                                                    Valor hora-aula
                                                                                </label>
                                                                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                                                                                    <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                                                                                        Valor atual
                                                                                    </div>
                                                                                    <div className="mt-1 text-base font-extrabold text-emerald-800">
                                                                                        {typeof assignment.hourlyRate === 'number'
                                                                                            ? `R$ ${assignment.hourlyRate.toFixed(2).replace('.', ',')}`
                                                                                            : 'Hora-aula não informada'}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="space-y-2">
                                                                                    <input
                                                                                        type="text"
                                                                                        value={editingHourlyRateBySubject[assignment.subjectId] ?? ''}
                                                                                        onChange={(event) => handleHourlyRateDraftChange(assignment.subjectId, event.target.value)}
                                                                                        placeholder="Informar novo valor"
                                                                                        disabled={updatingAssignmentKey === `${currentTeacherForSubjects.id}:${assignment.subjectId}`}
                                                                                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                                                                                    />
                                                                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                                                                                        <input
                                                                                            type="date"
                                                                                            value={editingEffectiveFromBySubject[assignment.subjectId] ?? getAssignmentEffectiveFrom(assignment)}
                                                                                            onChange={(event) => handleEffectiveFromDraftChange(assignment.subjectId, event.target.value)}
                                                                                            disabled={updatingAssignmentKey === `${currentTeacherForSubjects.id}:${assignment.subjectId}`}
                                                                                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                                                                                        />
                                                                                        {canManageTeacherSubjects ? (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => handleUpdateTeacherSubject(assignment.subjectId, assignment.subject?.name || 'Disciplina')}
                                                                                                disabled={updatingAssignmentKey === `${currentTeacherForSubjects.id}:${assignment.subjectId}`}
                                                                                                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                                                                                            >
                                                                                                {updatingAssignmentKey === `${currentTeacherForSubjects.id}:${assignment.subjectId}` ? 'Salvando...' : 'Salvar valor'}
                                                                                            </button>
                                                                                        ) : null}
                                                                                    </div>
                                                                                </div>
                                                                                {assignment.rateHistories && assignment.rateHistories.length > 0 ? (
                                                                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                                                                        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                                                                            Histórico de vigência
                                                                                        </div>
                                                                                        <div className="space-y-1.5">
                                                                                            {assignment.rateHistories.map((history) => (
                                                                                                <div key={history.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                                                                                                    <span className="font-semibold text-slate-700">
                                                                                                        {formatTeacherRateHistoryValue(history.hourlyRate)}
                                                                                                    </span>
                                                                                                    <span>{formatTeacherRateHistoryLabel(history.effectiveFrom, history.effectiveTo)}</span>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                ) : null}
                                                                            </div>
                                                                        ) : null}
                                                                    </div>
                                                                    <span className="rounded-full bg-violet-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-violet-700">
                                                                        Ativa
                                                                    </span>
                                                                </div>
                                                                {canManageTeacherSubjects ? (
                                                                    <div className="mt-4 flex justify-end">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleRemoveTeacherSubject(assignment.subjectId, assignment.subject?.name || 'Disciplina')}
                                                                            disabled={removingAssignmentKey === `${currentTeacherForSubjects.id}:${assignment.subjectId}`}
                                                                            className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
                                                                        >
                                                                            {removingAssignmentKey === `${currentTeacherForSubjects.id}:${assignment.subjectId}` ? 'Desvinculando...' : 'Desvincular'}
                                                                        </button>
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="dashboard-band-soft rounded-2xl border border-dashed px-6 py-12 text-center">
                                                        <div className="text-base font-bold text-slate-700">Nenhuma disciplina vinculada</div>
                                                        <p className="mt-2 text-sm font-medium text-slate-500">
                                                            Este professor ainda não possui disciplinas cadastradas para lecionar.
                                                        </p>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-medium text-amber-700">
                                        Seu perfil não possui autorização para consultar as disciplinas vinculadas deste professor.
                                    </div>
                                )
                            )}

                            {activeTab === 4 && (
                                teacherFieldAccess.access ? (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <h4 className="text-xs uppercase tracking-wider font-bold text-blue-800 pb-2 border-b border-blue-50">Configurações de Acesso ao App</h4>
                                        <div className="grid grid-cols-1 gap-5 max-w-4xl mx-auto mt-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
                                            <div className="md:col-span-2">
                                                <h5 className="text-center text-sm font-semibold text-slate-600 mb-4">Forneça as credenciais para que o professor acesse chamadas e notas via PWA.</h5>
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Perfil pré-definido do professor</label>
                                                <select
                                                    value={formData.accessProfile}
                                                    onChange={e => handleTeacherProfileChange(e.target.value as AccessProfileCode)}
                                                    className="w-full bg-white border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                                                >
                                                    {getProfilesForRole('PROFESSOR').map((profile) => (
                                                        <option key={profile.code} value={profile.code}>{profile.label}</option>
                                                    ))}
                                                </select>
                                                <div className="mt-2 text-xs font-medium text-slate-500">
                                                    Se este docente precisar de uma exceção, ajuste os checkboxes abaixo. Nesse caso, a permissão específica da tela passa a valer acima do perfil padrão.
                                                </div>
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">E-mail de Login PWA (Apenas para Acesso)</label>
                                                <input
                                                    type="email"
                                                    value={formData.email}
                                                    onChange={(e) => handleTeacherEmailChange(e.target.value)}
                                                    onBlur={() => void handleTeacherEmailBlur()}
                                                    className="w-full bg-white border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                                                    placeholder="Apenas para acessar o portal"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">
                                                    {editingTeacherId ? 'Senha Nova (Deixe em branco para não alterar)' : 'Senha de Acesso ao PWA'}
                                                </label>
                                                <input type="text" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className="w-full bg-white border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm" placeholder={editingTeacherId ? '••••••••' : 'Defina a senha inicial'} minLength={4} />
                                            </div>
                                            <div className="md:col-span-2">
                                                <div className="mb-2 text-xs font-bold text-slate-600">Permissões específicas do docente</div>
                                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                                    {PERMISSION_OPTIONS.map((permission) => (
                                                        <label key={permission.value} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={formData.permissions.includes(permission.value)}
                                                                onChange={() => toggleTeacherPermission(permission.value)}
                                                                className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                                            />
                                                            <span className="text-sm font-medium text-slate-700">{permission.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-medium text-amber-700">
                                        Seu perfil não possui autorização para consultar ou alterar os dados de acesso PWA deste professor.
                                    </div>
                                )
                            )}

                        </form>
                        <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-5 shadow-[0_-8px_20px_rgba(15,23,42,0.06)]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap gap-3">
                                <button type="button" onClick={closeModal} className="px-6 py-3 font-semibold rounded-xl border border-rose-200 bg-rose-50 text-rose-700 transition-colors hover:bg-rose-100 text-sm">Sair sem Gravar</button>
                                {activeTab > 1 ? (
                                    <button type="button" onClick={() => setActiveTab((prev) => prev - 1)} className="rounded-xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Voltar</button>
                                ) : null}
                            </div>
                            <div className="flex flex-wrap justify-end gap-3">
                                {activeTab < 4 ? (
                                    <button type="button" onClick={() => setActiveTab((prev) => prev + 1)} className="bg-[#153a6a] hover:bg-blue-800 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-900/30 text-sm tracking-wide transition-all">Próxima Etapa →</button>
                                ) : null}
                                <button type="submit" form="teacher-form" className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-green-600/30 text-sm tracking-wide transition-all flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                {editingTeacherId ? 'Salvar' : 'Registrar Professor'}
                                </button>
                            </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                            <ScreenNameCopy
                                screenId={PROFESSORES_DETAIL_COPY_SCREEN_ID}
                                label="NOME DA TELA"
                                className="mt-0 justify-end"
                                disableMargin
                            />
                        </div>
                    </div>
                    </div>
                </div>
            )}

            {saveError && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 relative">
                        <button
                            onClick={() => setSaveError(null)}
                            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100/50 hover:bg-slate-200 text-slate-400 hover:text-red-500 transition-colors z-10"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <div className="bg-red-500/10 p-6 flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4 ring-4 ring-white shadow-sm">
                                <span className="font-bold text-2xl">!</span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 mb-1">Atenção</h3>
                            <div className="flex flex-col items-center w-full mt-1 mb-2">
                                <p className="text-slate-600 font-bold text-[15px] leading-tight text-center">
                                    {saveError.split('\n').map((line, i) => (
                                        <span key={i} className="block mb-1">{line}</span>
                                    ))}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {emailUsageAlert && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 px-4">
                    <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200 relative">
                        <button
                            type="button"
                            onClick={() => setEmailUsageAlert(null)}
                            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100/80 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <div className="border-b border-amber-100 bg-amber-50 px-6 py-5">
                            <div className="flex items-start gap-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
                                    {currentTenantBranding?.logoUrl ? (
                                        <img
                                            src={currentTenantBranding.logoUrl}
                                            alt={`Logotipo de ${currentTenantBranding.schoolName}`}
                                            className="h-full w-full object-contain p-1.5"
                                        />
                                    ) : (
                                        <span className="text-xs font-black uppercase tracking-[0.18em] text-[#153a6a]">EA</span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">E-mail já utilizado</div>
                                    <h3 className="mt-1 text-lg font-bold text-slate-800">{emailUsageAlert.email}</h3>
                                    <p className="mt-1 text-sm font-medium text-slate-600">
                                        Este e-mail já está cadastrado em {emailUsageAlert.usages.length} local(is). Verifique a escola e o perfil abaixo.
                                    </p>
                                </div>
                            </div>
                            {Array.from(new Set(
                                emailUsageAlert.usages
                                    .filter((usage) => usage.tenantId && usage.tenantId !== emailUsageAlert.currentTenantId)
                                    .map((usage) => usage.tenantName),
                            )).length > 0 ? (
                                <div className="mt-4 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-amber-800">
                                    OUTRAS ESCOLAS ENCONTRADAS: {' '}
                                    {Array.from(new Set(
                                        emailUsageAlert.usages
                                            .filter((usage) => usage.tenantId && usage.tenantId !== emailUsageAlert.currentTenantId)
                                            .map((usage) => usage.tenantName),
                                    )).join(' | ')}
                                </div>
                            ) : (
                                <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                                    VÍNCULO LOCAL IDENTIFICADO NA ESCOLA {emailUsageAlert.currentTenantName}.
                                </div>
                            )}
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
                                                        Escola Atual
                                                    </span>
                                                )}
                                                <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">
                                                    {usage.entityLabel}
                                                </span>
                                                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
                                                    {usage.tenantDocument || 'SEM DOCUMENTO'}
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
                                    screenId={PROFESSORES_EMAIL_USAGE_MODAL_SCREEN_ID}
                                    label="NOME DA TELA"
                                    className="mt-0 justify-end"
                                    disableMargin
                                />
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setEmailUsageAlert(null)}
                                    className="rounded-xl bg-[#153a6a] px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-800"
                                >
                                    ENTENDI
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}





