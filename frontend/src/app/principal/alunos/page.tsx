'use client';

import Link from 'next/link';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
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
import {
    fetchAddressByCep,
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
    readImageFileAsDataUrl,
    type SharedNameSuggestion,
} from '@/app/lib/dashboard-crud-utils';
import {
    buildGridAggregateSummaries,
    getAllGridColumnKeys,
    getDefaultVisibleGridColumnKeys,
    loadGridColumnConfig,
    type ConfigurableGridColumn,
    type GridColumnAggregations,
    writeGridColumnConfig,
} from '@/app/lib/grid-column-config-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import {
    getDefaultAccessProfileForRole,
    getProfilePermissions,
    getProfilesForRole,
    PERMISSION_OPTIONS,
    type AccessProfileCode,
} from '@/app/lib/access-profiles';
import { buildDefaultExportColumns, buildExportColumnsFromGridColumns, exportGridRows, sortGridRows, type GridColumnDefinition, type GridSortState } from '@/app/lib/grid-export-utils';
import { dedupeSeriesClassOptions } from '@/app/lib/series-class-option-utils';

const API_BASE_URL = 'http://localhost:3001/api/v1';
const ALUNOS_STATUS_MODAL_SCREEN_ID = 'PRINCIPAL_ALUNOS_STATUS_MODAL';

const KINSHIP_OPTIONS = [
    { value: 'PAI', label: 'PAI' },
    { value: 'MAE', label: 'MAE' },
    { value: 'PADRASTO', label: 'PADRASTO' },
    { value: 'MADRASTA', label: 'MADRASTA' },
    { value: 'TIO', label: 'TIO / TIA' },
    { value: 'AVOS', label: 'AVOS' },
    { value: 'OUTROS', label: 'OUTROS' },
] as const;

type KinshipValue = (typeof KINSHIP_OPTIONS)[number]['value'];

type GuardianSummary = {
    id: string;
    name: string;
    birthDate?: string | null;
    cpf?: string | null;
    rg?: string | null;
    email?: string | null;
    zipCode?: string | null;
    street?: string | null;
    number?: string | null;
    city?: string | null;
    state?: string | null;
    neighborhood?: string | null;
    complement?: string | null;
    whatsapp?: string | null;
    cellphone1?: string | null;
    cellphone2?: string | null;
    phone?: string | null;
};

type StudentGuardianLink = {
    id: string;
    kinship?: string | null;
    kinshipDescription?: string | null;
    guardian?: GuardianSummary | null;
};

type SchoolYearSummary = {
    id: string;
    year: number;
    isActive?: boolean;
};

type SeriesSummary = {
    id: string;
    name: string;
};

type ClassSummary = {
    id: string;
    name: string;
    shift?: string | null;
    defaultMonthlyFee?: number | null;
};

type SeriesClassSummary = {
    id: string;
    schoolYearId: string;
    schoolYear?: SchoolYearSummary | null;
    series?: SeriesSummary | null;
    class?: ClassSummary | null;
};

type StudentEnrollment = {
    id: string;
    schoolYearId: string;
    seriesClassId?: string | null;
    seriesClass?: SeriesClassSummary | null;
};

type StudentRecord = {
    id: string;
    canceledAt?: string | null;
    name: string;
    photoUrl?: string | null;
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
    monthlyFee?: number | null;
    notes?: string | null;
    zipCode?: string | null;
    street?: string | null;
    number?: string | null;
    city?: string | null;
    state?: string | null;
    neighborhood?: string | null;
    complement?: string | null;
    accessProfile?: AccessProfileCode | null;
    permissions?: string[];
    guardians?: StudentGuardianLink[];
    enrollments?: StudentEnrollment[];
};

type StudentFormState = {
    name: string;
    photoUrl: string;
    birthDate: string;
    cpf: string;
    rg: string;
    cnpj: string;
    nickname: string;
    corporateName: string;
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
    seriesClassId: string;
    monthlyFee: string;
    notes: string;
    accessProfile: AccessProfileCode;
    permissions: string[];
};

const DEFAULT_STUDENT_PROFILE = getDefaultAccessProfileForRole('ALUNO');

type GuardianLinkFormState = {
    guardianId: string;
    kinship: KinshipValue;
    kinshipDescription: string;
    guardianQuery: string;
};

const EMPTY_FORM: StudentFormState = {
    name: '',
    photoUrl: '',
    birthDate: '',
    cpf: '',
    rg: '',
    cnpj: '',
    nickname: '',
    corporateName: '',
    phone: '',
    whatsapp: '',
    cellphone1: '',
    cellphone2: '',
    email: '',
    password: '',
    zipCode: '',
    street: '',
    number: '',
    city: '',
    state: '',
    neighborhood: '',
    complement: '',
    seriesClassId: '',
    monthlyFee: '',
    notes: '',
    accessProfile: DEFAULT_STUDENT_PROFILE,
    permissions: getProfilePermissions(DEFAULT_STUDENT_PROFILE),
};

const EMPTY_GUARDIAN_LINK_FORM: GuardianLinkFormState = {
    guardianId: '',
    kinship: 'PAI',
    kinshipDescription: '',
    guardianQuery: '',
};

const inputClass = 'w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white';
const labelClass = 'mb-1 block text-xs font-bold text-slate-600';

type StudentColumnKey =
    | 'name'
    | 'currentEnrollment'
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
    | 'monthlyFee'
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
    | 'accessProfile'
    | 'notes';

type StudentExportColumnKey = StudentColumnKey | 'recordStatus' | 'permissions';

const STUDENT_COLUMNS: ConfigurableGridColumn<StudentRecord, StudentColumnKey>[] = [
    { key: 'name', label: 'Aluno', getValue: (row) => row.name || '---', visibleByDefault: true },
    { key: 'currentEnrollment', label: 'Turma atual', getValue: (row) => getStudentCurrentEnrollmentLabel(row, null), visibleByDefault: false },
    { key: 'nickname', label: 'Apelido', getValue: (row) => row.nickname || '---', visibleByDefault: false },
    { key: 'corporateName', label: 'Nome empresarial', getValue: (row) => row.corporateName || '---', visibleByDefault: false },
    { key: 'birthDate', label: 'Nascimento', getValue: (row) => formatStudentDate(row.birthDate), visibleByDefault: false },
    { key: 'cpf', label: 'CPF', getValue: (row) => row.cpf || '---', visibleByDefault: true },
    { key: 'rg', label: 'RG', getValue: (row) => row.rg || '---', visibleByDefault: false },
    { key: 'cnpj', label: 'CNPJ', getValue: (row) => row.cnpj || '---', visibleByDefault: false },
    { key: 'contact', label: 'Contato / Login', getValue: (row) => row.email || row.whatsapp || row.phone || row.cellphone1 || '---', visibleByDefault: true },
    { key: 'email', label: 'E-mail de login', getValue: (row) => row.email || '---', visibleByDefault: false },
    { key: 'phone', label: 'Telefone', getValue: (row) => row.phone || '---', visibleByDefault: false },
    { key: 'whatsapp', label: 'WhatsApp', getValue: (row) => row.whatsapp || '---', visibleByDefault: false },
    { key: 'cellphone1', label: 'Telefone 1', getValue: (row) => row.cellphone1 || '---', visibleByDefault: false },
    { key: 'cellphone2', label: 'Telefone 2', getValue: (row) => row.cellphone2 || '---', visibleByDefault: false },
    {
        key: 'monthlyFee',
        label: 'Mensalidade',
        getValue: (row) => formatMoneyLabel(row.monthlyFee),
        getSortValue: (row) => row.monthlyFee ?? -1,
        visibleByDefault: false,
        aggregateOptions: ['sum', 'avg', 'min', 'max', 'count'],
        getAggregateValue: (row) => row.monthlyFee ?? null,
        formatAggregateValue: (value, aggregateType) => aggregateType === 'count' ? String(value) : formatMoneyLabel(value),
    },
    { key: 'zipCode', label: 'CEP', getValue: (row) => row.zipCode || '---', visibleByDefault: false },
    { key: 'street', label: 'Logradouro', getValue: (row) => row.street || '---', visibleByDefault: false },
    { key: 'number', label: 'Número', getValue: (row) => row.number || '---', visibleByDefault: false },
    { key: 'neighborhood', label: 'Bairro', getValue: (row) => row.neighborhood || '---', visibleByDefault: false },
    { key: 'complement', label: 'Complemento', getValue: (row) => row.complement || '---', visibleByDefault: false },
    { key: 'city', label: 'Cidade', getValue: (row) => row.city || '---', visibleByDefault: false },
    { key: 'state', label: 'UF', getValue: (row) => row.state || '---', visibleByDefault: false },
    { key: 'cityState', label: 'Cidade / UF', getValue: (row) => [row.city, row.state].filter(Boolean).join(' / ') || '---', visibleByDefault: false },
    { key: 'address', label: 'Endereço', getValue: (row) => getStudentAddressLabel(row), visibleByDefault: false },
    { key: 'pwaStatus', label: 'Status PWA', getValue: (row) => row.email ? 'APP LIBERADO' : 'SEM ACESSO', getSortValue: (row) => row.email ? 1 : 0, visibleByDefault: true },
    { key: 'accessProfile', label: 'Perfil', getValue: (row) => formatStudentAccessProfile(row.accessProfile), visibleByDefault: false },
    { key: 'notes', label: 'Observações', getValue: (row) => row.notes || '---', visibleByDefault: false },
];

const STUDENT_EXPORT_COLUMNS: GridColumnDefinition<StudentRecord, StudentExportColumnKey>[] = buildExportColumnsFromGridColumns<StudentRecord, StudentColumnKey, 'recordStatus' | 'permissions'>(
    STUDENT_COLUMNS,
    [
        { key: 'recordStatus', label: 'Status do cadastro', getValue: (row) => row.canceledAt ? 'INATIVO' : 'ATIVO' },
        { key: 'permissions', label: 'Permissões específicas', getValue: (row) => formatStudentPermissions(row.permissions) },
    ],
);
const STUDENT_COLUMN_KEYS = getAllGridColumnKeys(STUDENT_COLUMNS);
const DEFAULT_VISIBLE_STUDENT_COLUMNS = getDefaultVisibleGridColumnKeys(STUDENT_COLUMNS);

function getStudentGridConfigStorageKey(tenantId: string | null) {
    return `dashboard:alunos:grid-config:${tenantId || 'default'}`;
}

function getStudentExportConfigStorageKey(tenantId: string | null) {
    return `dashboard:alunos:export-config:${tenantId || 'default'}`;
}

const DEFAULT_SORT: GridSortState<StudentColumnKey> = {
    column: 'name',
    direction: 'asc',
};

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function formatKinshipLabel(link: StudentGuardianLink) {
    if (link.kinship === 'OUTROS' && link.kinshipDescription) {
        return link.kinshipDescription;
    }

    return KINSHIP_OPTIONS.find((option) => option.value === link.kinship)?.label || link.kinship || 'SEM PARENTESCO';
}

function getGuardianComboLabel(guardian: GuardianSummary) {
    return `${guardian.name}${guardian.cpf ? ` - ${guardian.cpf}` : ''}`;
}

function getGuardianPrimaryPhone(guardian?: GuardianSummary | null) {
    return guardian?.whatsapp || guardian?.cellphone1 || guardian?.phone || guardian?.cellphone2 || 'Sem telefone cadastrado';
}

function splitClassShifts(shift?: string | null) {
    return String(shift || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
            if (item === 'MANHA') return 'MANHÃ';
            if (item === 'TARDE') return 'TARDE';
            if (item === 'NOITE') return 'NOITE';
            return item;
        });
}

function getSeriesClassLabel(seriesClass: SeriesClassSummary) {
    const seriesName = seriesClass.series?.name || 'SEM SÉRIE';
    const className = seriesClass.class?.name || 'SEM TURMA';
    const shifts = splitClassShifts(seriesClass.class?.shift).join(' / ');
    return shifts ? `${seriesName} - ${className} (${shifts})` : `${seriesName} - ${className}`;
}

function getCurrentEnrollmentSeriesClassId(student: StudentRecord, activeSchoolYearId: string | null) {
    if (!activeSchoolYearId || !Array.isArray(student.enrollments) || student.enrollments.length === 0) return '';
    const enrollment = student.enrollments.find((item) => item.schoolYearId === activeSchoolYearId);
    return enrollment?.seriesClassId || '';
}

function formatMoneyValue(value?: number | null) {
    return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '';
}

function parseMoneyValue(value: string) {
    const trimmedValue = value.trim();
    if (!trimmedValue) return null;

    const parsedValue = Number(trimmedValue.replace(',', '.'));
    return Number.isFinite(parsedValue) ? parsedValue : null;
}

function formatMoneyLabel(value?: number | null) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Não informada';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getStudentAddressLabel(student: StudentRecord) {
    const parts = [
        student.street,
        student.number,
        student.neighborhood,
        student.city,
        student.state,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : 'Não informado';
}

function formatStudentDate(value?: string | null) {
    return value ? new Date(value).toLocaleDateString() : '---';
}

function formatStudentAccessProfile(value?: AccessProfileCode | null) {
    return value ? value.replaceAll('_', ' ') : 'PADRÃO';
}

function formatStudentPermissions(permissions?: string[]) {
    const permissionLabels = permissions
        ?.map((permission) => PERMISSION_OPTIONS.find((option) => option.value === permission)?.label || permission)
        .filter(Boolean) || [];
    return permissionLabels.length > 0 ? permissionLabels.join(', ') : '---';
}

function getStudentCurrentEnrollmentLabel(student: StudentRecord, activeSchoolYearId: string | null) {
    const currentEnrollment = student.enrollments?.find((item) => item.schoolYearId === activeSchoolYearId) || student.enrollments?.[0];
    if (!currentEnrollment?.seriesClass) return 'Sem turma vinculada';
    return getSeriesClassLabel(currentEnrollment.seriesClass);
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

    if (!normalizedRoles.includes('ALUNO')) {
        normalizedRoles.unshift('ALUNO');
    }

    return Array.from(new Set(normalizedRoles));
}

function getStudentGuardiansSummary(student: StudentRecord) {
    if (!student.guardians?.length) return 'Sem responsáveis vinculados';
    return student.guardians
        .map((link) => `${link.guardian?.name || 'Responsável'} (${formatKinshipLabel(link)})`)
        .join(' | ');
}

export default function AlunosPage() {
    const [students, setStudents] = useState<StudentRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(1);
    const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [formData, setFormData] = useState<StudentFormState>(EMPTY_FORM);
    const [studentGuardians, setStudentGuardians] = useState<StudentGuardianLink[]>([]);
    const [guardiansCatalog, setGuardiansCatalog] = useState<GuardianSummary[]>([]);
    const [guardianLinkForm, setGuardianLinkForm] = useState<GuardianLinkFormState>(EMPTY_GUARDIAN_LINK_FORM);
    const [isLoadingGuardians, setIsLoadingGuardians] = useState(false);
    const [isUpdatingGuardians, setIsUpdatingGuardians] = useState(false);
    const [guardiansError, setGuardiansError] = useState<string | null>(null);
    const [guardiansStatus, setGuardiansStatus] = useState<string | null>(null);
    const [selectedGuardianDetails, setSelectedGuardianDetails] = useState<GuardianSummary | null>(null);
    const [isGuardiansViewOpen, setIsGuardiansViewOpen] = useState(false);
    const [guardiansViewStudentName, setGuardiansViewStudentName] = useState('');
    const [guardiansViewItems, setGuardiansViewItems] = useState<StudentGuardianLink[]>([]);
    const [isLoadingGuardiansView, setIsLoadingGuardiansView] = useState(false);
    const [guardiansViewError, setGuardiansViewError] = useState<string | null>(null);
    const [seriesClassesCatalog, setSeriesClassesCatalog] = useState<SeriesClassSummary[]>([]);
    const [activeSchoolYearId, setActiveSchoolYearId] = useState<string | null>(null);
    const [activeSchoolYear, setActiveSchoolYear] = useState<SchoolYearSummary | null>(null);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [sortState, setSortState] = useState<GridSortState<StudentColumnKey>>(DEFAULT_SORT);
    const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
    const [isGridConfigOpen, setIsGridConfigOpen] = useState(false);
    const [isGridConfigReady, setIsGridConfigReady] = useState(false);
    const [columnOrder, setColumnOrder] = useState<StudentColumnKey[]>(STUDENT_COLUMN_KEYS);
    const [hiddenColumns, setHiddenColumns] = useState<StudentColumnKey[]>(
        STUDENT_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_STUDENT_COLUMNS.includes(key)),
    );
    const [columnAggregations, setColumnAggregations] = useState<GridColumnAggregations<StudentColumnKey>>({});
    const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFormat, setExportFormat] = useState<'excel' | 'csv' | 'pdf' | 'json' | 'txt'>('excel');
    const [exportColumns, setExportColumns] = useState<Record<StudentExportColumnKey, boolean>>(buildDefaultExportColumns(STUDENT_EXPORT_COLUMNS));
    const [studentStatusToggleTarget, setStudentStatusToggleTarget] = useState<StudentRecord | null>(null);
    const [studentStatusToggleAction, setStudentStatusToggleAction] = useState<'activate' | 'deactivate' | null>(null);
    const [isProcessingStudentToggle, setIsProcessingStudentToggle] = useState(false);
    const [personSystemRoles, setPersonSystemRoles] = useState<string[]>(['ALUNO']);
    const [nameSuggestions, setNameSuggestions] = useState<SharedNameSuggestion[]>([]);
    const [showNameSuggestions, setShowNameSuggestions] = useState(false);
    const [isLoadingNameSuggestions, setIsLoadingNameSuggestions] = useState(false);
    const [nameSuggestionError, setNameSuggestionError] = useState<string | null>(null);
    const [debouncedStudentNameQuery, setDebouncedStudentNameQuery] = useState('');

    const canViewStudents = hasDashboardPermission(currentRole, currentPermissions, 'VIEW_STUDENTS');
    const canManageStudents = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_STUDENTS');
    const studentFieldAccess = getAllowedDashboardFields(currentRole, currentPermissions, {
        contact: 'VIEW_STUDENT_CONTACT_DATA',
        academic: 'VIEW_STUDENT_ACADEMIC_DATA',
        financial: 'VIEW_STUDENT_FINANCIAL_DATA',
        sensitive: 'VIEW_STUDENT_SENSITIVE_DATA',
        access: 'VIEW_STUDENT_ACCESS_DATA',
    });
    const availableStudentColumns = useMemo(
        () => STUDENT_COLUMNS.filter((column) => {
            if (['cpf', 'rg', 'cnpj'].includes(column.key) && !studentFieldAccess.sensitive) return false;
            if (column.key === 'monthlyFee' && !studentFieldAccess.financial) return false;
            if (['phone', 'whatsapp', 'cellphone1', 'cellphone2', 'zipCode', 'street', 'number', 'neighborhood', 'complement', 'city', 'state', 'cityState', 'address'].includes(column.key) && !studentFieldAccess.contact) return false;
            if (['email', 'accessProfile', 'pwaStatus'].includes(column.key) && !studentFieldAccess.access) return false;
            if (column.key === 'currentEnrollment' && !studentFieldAccess.academic) return false;
            if (column.key === 'contact' && !studentFieldAccess.contact && !studentFieldAccess.access) return false;
            if (column.key === 'notes' && !studentFieldAccess.academic) return false;
            return true;
        }),
        [studentFieldAccess.access, studentFieldAccess.academic, studentFieldAccess.contact, studentFieldAccess.financial, studentFieldAccess.sensitive],
    );
    const availableStudentExportColumns = useMemo(
        () => STUDENT_EXPORT_COLUMNS.filter((column) => {
            if (['cpf', 'rg', 'cnpj'].includes(column.key) && !studentFieldAccess.sensitive) return false;
            if (column.key === 'monthlyFee' && !studentFieldAccess.financial) return false;
            if (['phone', 'whatsapp', 'cellphone1', 'cellphone2', 'zipCode', 'street', 'number', 'neighborhood', 'complement', 'city', 'state', 'cityState', 'address'].includes(column.key) && !studentFieldAccess.contact) return false;
            if (['email', 'accessProfile', 'pwaStatus', 'permissions'].includes(column.key) && !studentFieldAccess.access) return false;
            if (column.key === 'currentEnrollment' && !studentFieldAccess.academic) return false;
            if (column.key === 'contact' && !studentFieldAccess.contact && !studentFieldAccess.access) return false;
            if (column.key === 'notes' && !studentFieldAccess.academic) return false;
            return true;
        }),
        [studentFieldAccess.access, studentFieldAccess.academic, studentFieldAccess.contact, studentFieldAccess.financial, studentFieldAccess.sensitive],
    );
    const orderedStudentColumns = useMemo(
        () => columnOrder.map((key) => availableStudentColumns.find((column) => column.key === key)).filter((column): column is ConfigurableGridColumn<StudentRecord, StudentColumnKey> => !!column),
        [availableStudentColumns, columnOrder],
    );
    const visibleStudentColumns = useMemo(
        () => orderedStudentColumns.filter((column) => !hiddenColumns.includes(column.key)),
        [hiddenColumns, orderedStudentColumns],
    );
    const linkedGuardianIds = new Set(studentGuardians.map((link) => link.guardian?.id).filter(Boolean));
    const availableGuardians = guardiansCatalog.filter((guardian) => !linkedGuardianIds.has(guardian.id));
    const filteredStudents = useMemo(() => {
        const term = searchTerm.trim().toUpperCase();
        return students.filter((student) => {
            const isActive = !student.canceledAt;
            const matchesStatus =
                statusFilter === 'ALL'
                    ? true
                    : statusFilter === 'ACTIVE'
                        ? isActive
                        : !isActive;
            const matchesSearch =
                !term ||
                [student.name, student.email, student.cpf, student.whatsapp, student.phone]
                    .some((value) => String(value || '').toUpperCase().includes(term));
            return matchesStatus && matchesSearch;
        });
    }, [searchTerm, statusFilter, students]);
    const sortedFilteredStudents = useMemo(
        () => sortGridRows(filteredStudents, STUDENT_COLUMNS, sortState),
        [filteredStudents, sortState],
    );
    const aggregateSummaries = useMemo(
        () => buildGridAggregateSummaries(sortedFilteredStudents, visibleStudentColumns, columnAggregations),
        [columnAggregations, sortedFilteredStudents, visibleStudentColumns],
    );
    const availableSeriesClasses = useMemo(() => {
        const activeYearSeriesClasses = activeSchoolYearId
            ? seriesClassesCatalog.filter((item) => item.schoolYearId === activeSchoolYearId)
            : [];
        const currentStudentSeriesClass = seriesClassesCatalog.find((item) => item.id === formData.seriesClassId);
        const filteredSeriesClasses = activeYearSeriesClasses.length > 0 ? activeYearSeriesClasses : seriesClassesCatalog;
        const baseSeriesClasses = currentStudentSeriesClass && !filteredSeriesClasses.some((item) => item.id === currentStudentSeriesClass.id)
            ? [...filteredSeriesClasses, currentStudentSeriesClass]
            : filteredSeriesClasses;
        return dedupeSeriesClassOptions(baseSeriesClasses, getSeriesClassLabel, formData.seriesClassId);
    }, [activeSchoolYearId, formData.seriesClassId, seriesClassesCatalog]);
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
            setPersonSystemRoles(['ALUNO']);
        }
    };

    const resetGuardianSection = () => {
        setStudentGuardians([]);
        setGuardiansCatalog([]);
        setGuardianLinkForm(EMPTY_GUARDIAN_LINK_FORM);
        setGuardiansError(null);
        setGuardiansStatus(null);
        setIsLoadingGuardians(false);
        setIsUpdatingGuardians(false);
        setSelectedGuardianDetails(null);
    };

    const fetchStudents = async () => {
        try {
            setIsLoading(true);
            setErrorStatus(null);
            const { token, role, permissions, tenantId } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');
            setCurrentRole(role);
            setCurrentPermissions(permissions);
            setCurrentTenantId(tenantId);
            const response = await fetch(`${API_BASE_URL}/students`, { headers: { Authorization: `Bearer ${token}` } });
            if (!response.ok) {
                const err = await response.json().catch(() => null);
                throw new Error(err?.message || 'Falha ao buscar alunos.');
            }
            const data = await response.json();
            setStudents(Array.isArray(data) ? data : []);
        } catch (error) {
            setErrorStatus(errorMessage(error, 'Não foi possível carregar os alunos.'));
        } finally {
            setIsLoading(false);
        }
    };

    const loadSeriesClassCatalog = async () => {
        try {
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const [seriesClassesResponse, yearsResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/series-classes`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_BASE_URL}/school-years`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);

            const [seriesClassesData, yearsData] = await Promise.all([
                seriesClassesResponse.json().catch(() => null),
                yearsResponse.json().catch(() => null),
            ]);

            if (!seriesClassesResponse.ok) {
                throw new Error(seriesClassesData?.message || 'Não foi possível carregar as turmas disponíveis.');
            }

            if (!yearsResponse.ok) {
                throw new Error(yearsData?.message || 'Não foi possível carregar os anos letivos.');
            }

            const yearsList = Array.isArray(yearsData) ? yearsData : [];
            const activeYear = yearsList.find((item: SchoolYearSummary) => item.isActive) || yearsList[0] || null;

            setSeriesClassesCatalog(
                dedupeSeriesClassOptions(
                    Array.isArray(seriesClassesData) ? seriesClassesData : [],
                    getSeriesClassLabel,
                ),
            );
            setActiveSchoolYearId(activeYear?.id || null);
            setActiveSchoolYear(activeYear || null);
        } catch (error) {
            setErrorStatus(errorMessage(error, 'Não foi possível carregar as turmas disponíveis para o aluno.'));
        }
    };

    const fetchStudentDetail = async (studentId: string) => {
        const { token } = getDashboardAuthContext();
        if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

        const response = await fetch(`${API_BASE_URL}/students/${studentId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
            const err = await response.json().catch(() => null);
            throw new Error(err?.message || 'Não foi possível carregar os dados completos do aluno.');
        }

        return response.json() as Promise<StudentRecord>;
    };

    const loadStudentGuardians = async (studentId: string) => {
        try {
            setIsLoadingGuardians(true);
            setGuardiansError(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const [studentResponse, guardiansResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/students/${studentId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_BASE_URL}/guardians`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);

            if (!studentResponse.ok) {
                const err = await studentResponse.json().catch(() => null);
                throw new Error(err?.message || 'Não foi possível carregar os responsáveis do aluno.');
            }

            if (!guardiansResponse.ok) {
                const err = await guardiansResponse.json().catch(() => null);
                throw new Error(err?.message || 'Não foi possível carregar a lista de responsáveis.');
            }

            const studentData = await studentResponse.json();
            const guardiansData = await guardiansResponse.json();

            setStudentGuardians(Array.isArray(studentData?.guardians) ? studentData.guardians : []);
            setGuardiansCatalog(Array.isArray(guardiansData) ? guardiansData : []);
            setGuardianLinkForm((current) => ({
                ...current,
                guardianId: Array.isArray(guardiansData) && guardiansData.some((guardian) => guardian.id === current.guardianId) ? current.guardianId : '',
                guardianQuery: Array.isArray(guardiansData)
                    ? getGuardianComboLabel(guardiansData.find((guardian) => guardian.id === current.guardianId) || { id: '', name: '' })
                    : '',
            }));
        } catch (error) {
            setGuardiansError(errorMessage(error, 'Não foi possível carregar os vínculos do aluno.'));
        } finally {
            setIsLoadingGuardians(false);
        }
    };

    useEffect(() => {
        void fetchStudents();
        void loadSeriesClassCatalog();
    }, []);

    useEffect(() => {
        let isMounted = true;
        setIsGridConfigReady(false);
        void loadGridColumnConfig(getStudentGridConfigStorageKey(currentTenantId), STUDENT_COLUMN_KEYS, DEFAULT_VISIBLE_STUDENT_COLUMNS).then((config) => {
            if (!isMounted) return;
            setColumnOrder(config.order);
            setHiddenColumns(config.hidden);
            setColumnAggregations(config.aggregations);
            setIsGridConfigReady(true);
        });
        return () => {
            isMounted = false;
        };
    }, [currentTenantId]);

    useEffect(() => {
        if (!isGridConfigReady) return;
        writeGridColumnConfig(getStudentGridConfigStorageKey(currentTenantId), STUDENT_COLUMN_KEYS, columnOrder, hiddenColumns, columnAggregations);
    }, [columnAggregations, columnOrder, currentTenantId, hiddenColumns, isGridConfigReady]);

    useEffect(() => {
        if (!isModalOpen || !editingStudentId || activeTab !== 4) return;
        void loadStudentGuardians(editingStudentId);
    }, [activeTab, editingStudentId, isModalOpen]);

    useEffect(() => {
        if (!isModalOpen || !!editingStudentId) {
            setDebouncedStudentNameQuery('');
            setNameSuggestionError(null);
            return;
        }

        const nameQuery = String(formData.name || '').trim();
        if (nameQuery.length < 2) {
            setDebouncedStudentNameQuery('');
            setNameSuggestions([]);
            setShowNameSuggestions(false);
            setIsLoadingNameSuggestions(false);
            setNameSuggestionError(null);
            return;
        }

        const timer = window.setTimeout(() => {
            setDebouncedStudentNameQuery(nameQuery);
        }, 260);

        return () => window.clearTimeout(timer);
    }, [editingStudentId, formData.name, isModalOpen]);

    useEffect(() => {
        if (!isModalOpen || !!editingStudentId || !debouncedStudentNameQuery) return;

        let isActive = true;
        setIsLoadingNameSuggestions(true);
        setShowNameSuggestions(true);
        setNameSuggestionError(null);

        void fetchSharedPersonNameSuggestions(debouncedStudentNameQuery, 8)
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
    }, [debouncedStudentNameQuery, editingStudentId, isModalOpen]);

    if (!isLoading && !canViewStudents) {
        return (
            <DashboardAccessDenied
                title="Acesso restrito aos alunos"
                message="Seu perfil pode entrar no painel, mas não tem autorização para consultar ou manter o cadastro de alunos desta escola."
            />
        );
    }

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingStudentId(null);
        setActiveTab(1);
        setFormData(EMPTY_FORM);
        setPersonSystemRoles(['ALUNO']);
        setNameSuggestions([]);
        setShowNameSuggestions(false);
        setIsLoadingNameSuggestions(false);
        setNameSuggestionError(null);
        resetGuardianSection();
        setPhotoError(null);
    };

    const toggleSort = (column: StudentColumnKey) => {
        setSortState((current) => ({
            column,
            direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const toggleExportColumn = (column: StudentExportColumnKey) => {
        setExportColumns((current) => ({ ...current, [column]: !current[column] }));
    };

    const setAllExportColumns = (value: boolean) => {
        setExportColumns(
            availableStudentExportColumns.reduce<Record<StudentExportColumnKey, boolean>>((accumulator, column) => {
                accumulator[column.key] = value;
                return accumulator;
            }, {} as Record<StudentExportColumnKey, boolean>),
        );
    };

    const toggleGridColumnVisibility = (columnKey: StudentColumnKey) => {
        const isHidden = hiddenColumns.includes(columnKey);
        const visibleCount = availableStudentColumns.filter((column) => !hiddenColumns.includes(column.key)).length;
        if (!isHidden && visibleCount === 1) {
            setErrorStatus('Pelo menos uma coluna precisa continuar visível no grid.');
            return;
        }
        setHiddenColumns((current) => isHidden ? current.filter((item) => item !== columnKey) : [...current, columnKey]);
    };

    const moveGridColumn = (columnKey: StudentColumnKey, direction: 'up' | 'down') => {
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
        setColumnOrder(STUDENT_COLUMN_KEYS);
        setHiddenColumns(STUDENT_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_STUDENT_COLUMNS.includes(key)));
        setColumnAggregations({});
    };

    const handleColumnAggregationChange = (columnKey: StudentColumnKey, aggregateType: 'sum' | 'avg' | 'min' | 'max' | 'count' | null) => {
        setColumnAggregations((current) => {
            const next = { ...current };
            if (aggregateType) {
                next[columnKey] = aggregateType;
            } else {
                delete next[columnKey];
            }
            return next;
        });
    };

    const renderStudentGridCell = (student: StudentRecord, columnKey: StudentColumnKey) => {
        if (columnKey === 'name') {
            return (
                <td key={columnKey} className="px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                            {student.photoUrl ? (
                                <img src={student.photoUrl} alt={`Foto de ${student.name}`} className="h-full w-full object-cover" />
                            ) : (
                                <span className="text-xs font-bold text-slate-400">SEM FOTO</span>
                            )}
                        </div>
                        <div>
                            <div className={`flex items-center gap-2 font-semibold ${student.canceledAt ? 'text-rose-800' : 'text-slate-800'}`}>
                                <span>{student.name}</span>
                                <RecordStatusIndicator active={!student.canceledAt} />
                            </div>
                            <div className={`text-[13px] ${student.canceledAt ? 'text-rose-500' : 'text-slate-400'}`}>
                                {student.birthDate ? new Date(student.birthDate).toLocaleDateString() : 'Sem data de nascimento'}
                            </div>
                        </div>
                    </div>
                </td>
            );
        }

        if (columnKey === 'contact') {
            return (
                <td key={columnKey} className="px-6 py-4">
                    <div className={`text-sm font-medium ${student.canceledAt ? 'text-rose-800' : 'text-slate-700'}`}>
                        {studentFieldAccess.access
                            ? (student.email || <span className="italic text-slate-400">Sem login</span>)
                            : (studentFieldAccess.contact ? (student.whatsapp || student.phone || student.cellphone1 || student.cellphone2 || 'Sem contato') : '---')}
                    </div>
                    {studentFieldAccess.contact ? (
                        <div className={`text-[13px] ${student.canceledAt ? 'text-rose-500' : 'text-slate-400'}`}>
                            {student.whatsapp || student.phone || student.cellphone1 || '---'}
                        </div>
                    ) : null}
                </td>
            );
        }

        if (columnKey === 'cpf') {
            return (
                <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${student.canceledAt ? 'text-rose-700' : 'text-slate-600'}`}>
                    {student.cpf || '---'}
                </td>
            );
        }

        if (columnKey === 'pwaStatus') {
            return (
                <td key={columnKey} className="px-6 py-4 text-center">
                    <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${student.email ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {student.email ? 'App liberado' : 'Sem acesso'}
                    </span>
                </td>
            );
        }
        const value = STUDENT_COLUMNS.find((column) => column.key === columnKey)?.getValue(student) || '---';
        return (
            <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${student.canceledAt ? 'text-rose-700' : 'text-slate-600'}`}>
                {value}
            </td>
        );
    };

    const openModal = () => {
        setEditingStudentId(null);
        setActiveTab(1);
        setFormData(EMPTY_FORM);
        setPersonSystemRoles(['ALUNO']);
        setNameSuggestions([]);
        setShowNameSuggestions(false);
        setIsLoadingNameSuggestions(false);
        setNameSuggestionError(null);
        resetGuardianSection();
        setPhotoError(null);
        setIsModalOpen(true);
    };

    const openStudentModal = async (student: StudentRecord, initialTab = 1) => {
        try {
            setErrorStatus(null);
            const detail = await fetchStudentDetail(student.id);

            setEditingStudentId(detail.id);
            setActiveTab(initialTab);
            setFormData({
                name: detail.name || '',
                photoUrl: detail.photoUrl || '',
                birthDate: detail.birthDate ? new Date(detail.birthDate).toISOString().split('T')[0] : '',
                cpf: detail.cpf || '',
                rg: detail.rg || '',
                cnpj: detail.cnpj || '',
                nickname: detail.nickname || '',
                corporateName: detail.corporateName || '',
                phone: detail.phone || '',
                whatsapp: detail.whatsapp || '',
                cellphone1: detail.cellphone1 || '',
                cellphone2: detail.cellphone2 || '',
                email: detail.email || '',
                password: '',
                zipCode: detail.zipCode || '',
                street: detail.street || '',
                number: detail.number || '',
                city: detail.city || '',
                state: detail.state || '',
                neighborhood: detail.neighborhood || '',
                complement: detail.complement || '',
                seriesClassId: getCurrentEnrollmentSeriesClassId(detail, activeSchoolYearId),
                monthlyFee: formatMoneyValue(detail.monthlyFee),
                notes: detail.notes || '',
                accessProfile: detail.accessProfile || DEFAULT_STUDENT_PROFILE,
                permissions: Array.isArray(detail.permissions) && detail.permissions.length > 0
                    ? detail.permissions
                    : getProfilePermissions(detail.accessProfile || DEFAULT_STUDENT_PROFILE),
            });
            setPersonSystemRoles(buildSystemRoleBadges(['ALUNO']));
            setNameSuggestions([]);
            setShowNameSuggestions(false);
            setIsLoadingNameSuggestions(false);
            setNameSuggestionError(null);
            void resolvePersonSystemRoles(detail.cpf, detail.email);
            resetGuardianSection();
            setPhotoError(null);
            setIsModalOpen(true);
        } catch (error) {
            setErrorStatus(errorMessage(error, 'Não foi possível abrir os dados do aluno.'));
        }
    };

    const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setPhotoError(null);
            const dataUrl = await readImageFileAsDataUrl(file);
            setFormData((current) => ({
                ...current,
                photoUrl: dataUrl,
            }));
        } catch (error) {
            setPhotoError(errorMessage(error, 'Não foi possível carregar a foto do aluno.'));
        } finally {
            event.target.value = '';
        }
    };

    const handleEdit = (student: StudentRecord) => {
        void openStudentModal(student, 1);
    };

    const handleCpfBlur = async () => {
        if (!formData.cpf || editingStudentId) return;

        try {
            const profile = await fetchSharedPersonProfileByCpf(formData.cpf);
            if (!profile) {
                setPersonSystemRoles(['ALUNO']);
                return;
            }

            setFormData((current) => (
                mergeSharedPersonIntoForm(
                    current as unknown as Record<string, string>,
                    profile,
                ) as unknown as StudentFormState
            ));
            setPersonSystemRoles(buildSystemRoleBadges(profile.roles));
        } catch (error) {
            setSaveError(errorMessage(error, 'Não foi possível reaproveitar os dados deste CPF.'));
        }
    };

    const handleStudentNameChange = (value: string) => {
        setFormData((current) => ({ ...current, name: value.toUpperCase() }));
        if (!editingStudentId) {
            setShowNameSuggestions(String(value || '').trim().length >= 2);
        }
    };

    const handleStudentProfileChange = (profileCode: AccessProfileCode) => {
        setFormData((current) => ({
            ...current,
            accessProfile: profileCode,
            permissions: getProfilePermissions(profileCode),
        }));
    };

    const toggleStudentPermission = (permission: string) => {
        setFormData((current) => ({
            ...current,
            permissions: current.permissions.includes(permission)
                ? current.permissions.filter((item) => item !== permission)
                : [...current.permissions, permission],
        }));
    };

    const closeGuardiansViewModal = () => {
        setIsGuardiansViewOpen(false);
        setGuardiansViewStudentName('');
        setGuardiansViewItems([]);
        setGuardiansViewError(null);
        setIsLoadingGuardiansView(false);
    };

    const handleManageGuardians = async (student: StudentRecord) => {
        try {
            setGuardiansViewStudentName(student.name);
            setGuardiansViewItems([]);
            setGuardiansViewError(null);
            setIsLoadingGuardiansView(true);
            setIsGuardiansViewOpen(true);

            const detail = await fetchStudentDetail(student.id);
            setGuardiansViewStudentName(detail.name || student.name);
            setGuardiansViewItems(Array.isArray(detail.guardians) ? detail.guardians : []);
        } catch (error) {
            setGuardiansViewError(errorMessage(error, 'Não foi possível carregar os responsáveis deste aluno.'));
        } finally {
            setIsLoadingGuardiansView(false);
        }
    };

    const openStudentStatusModal = (student: StudentRecord) => {
        setStudentStatusToggleTarget(student);
        setStudentStatusToggleAction(student.canceledAt ? 'activate' : 'deactivate');
    };

    const closeStudentStatusModal = (force = false) => {
        if (!force && isProcessingStudentToggle) return;
        setStudentStatusToggleTarget(null);
        setStudentStatusToggleAction(null);
    };

    const confirmStudentStatusToggle = async () => {
        if (!studentStatusToggleTarget || !studentStatusToggleAction) return;
        const willActivate = studentStatusToggleAction === 'activate';
        try {
            setIsProcessingStudentToggle(true);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');
            const response = await fetch(`${API_BASE_URL}/students/${studentStatusToggleTarget.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ active: willActivate }),
            });
            if (!response.ok) {
                const err = await response.json().catch(() => null);
                throw new Error(err?.message || (willActivate ? 'Não foi possível ativar o aluno.' : 'Não foi possível inativar o aluno.'));
            }
            await fetchStudents();
            closeStudentStatusModal(true);
        } catch (error) {
            setErrorStatus(errorMessage(error, willActivate ? 'Não foi possível ativar o aluno.' : 'Não foi possível inativar o aluno.'));
        } finally {
            setIsProcessingStudentToggle(false);
        }
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
        setSaveError(null);
        if (formData.cpf && !isValidCpf(formData.cpf)) return setSaveError('CPF inválido. Informe um CPF válido.');
        if (formData.cnpj && !isValidCnpj(formData.cnpj)) return setSaveError('CNPJ inválido. Informe um CNPJ válido.');

        try {
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');
            const url = editingStudentId ? `${API_BASE_URL}/students/${editingStudentId}` : `${API_BASE_URL}/students`;
            const method = editingStudentId ? 'PATCH' : 'POST';
            const payload: Record<string, string | number | string[] | null> = {
                ...formData,
                cpf: formatCpf(formData.cpf),
                cnpj: formatCnpj(formData.cnpj),
                phone: formatPhone(formData.phone),
                whatsapp: formatPhone(formData.whatsapp),
                cellphone1: formatPhone(formData.cellphone1),
                cellphone2: formatPhone(formData.cellphone2),
                monthlyFee: parseMoneyValue(formData.monthlyFee),
            };
            delete payload.seriesClassId;
            if (editingStudentId && !payload.password) delete payload.password;
            if (!payload.birthDate) delete payload.birthDate;
            if (!studentFieldAccess.financial) delete payload.monthlyFee;
            if (!studentFieldAccess.access) {
                delete payload.email;
                delete payload.password;
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
                throw new Error(err?.message || 'Erro ao salvar aluno.');
            }

            const savedStudent = await response.json().catch(() => null);
            const studentId = editingStudentId || savedStudent?.id;
            if (!studentId) {
                throw new Error('Aluno salvo, mas não foi possível identificar o registro criado.');
            }

            const assignmentResponse = await fetch(`${API_BASE_URL}/students/${studentId}/series-class-assignment`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    seriesClassId: formData.seriesClassId || null,
                }),
            });

            if (!assignmentResponse.ok) {
                const err = await assignmentResponse.json().catch(() => null);
                if (!editingStudentId) setEditingStudentId(studentId);
                throw new Error(err?.message || 'Aluno salvo, mas não foi possível lançar a turma + série.');
            }

            closeModal();
            await fetchStudents();
        } catch (error) {
            setSaveError(errorMessage(error, 'Erro ao salvar aluno.'));
        }
    };

    const handleLinkGuardian = async () => {
        if (!editingStudentId) return;
        if (!guardianLinkForm.guardianId) {
            setGuardiansError('Selecione um responsável para vincular ao aluno.');
            return;
        }
        if (guardianLinkForm.kinship === 'OUTROS' && !guardianLinkForm.kinshipDescription.trim()) {
            setGuardiansError('Descreva o parentesco quando selecionar OUTROS.');
            return;
        }

        try {
            setIsUpdatingGuardians(true);
            setGuardiansError(null);
            setGuardiansStatus(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const response = await fetch(`${API_BASE_URL}/guardians/${guardianLinkForm.guardianId}/students`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    studentId: editingStudentId,
                    kinship: guardianLinkForm.kinship,
                    kinshipDescription: guardianLinkForm.kinship === 'OUTROS'
                        ? guardianLinkForm.kinshipDescription.trim().toUpperCase()
                        : undefined,
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => null);
                throw new Error(err?.message || 'Não foi possível vincular o responsável.');
            }

            setGuardiansStatus('Responsável vinculado com sucesso ao aluno.');
            setGuardianLinkForm(EMPTY_GUARDIAN_LINK_FORM);
            await loadStudentGuardians(editingStudentId);
        } catch (error) {
            setGuardiansError(errorMessage(error, 'Não foi possível vincular o responsável.'));
        } finally {
            setIsUpdatingGuardians(false);
        }
    };

    const handleUnlinkGuardian = async (link: StudentGuardianLink) => {
        if (!editingStudentId || !link.guardian?.id) return;
        if (!window.confirm(`Deseja remover o responsável ${link.guardian.name} deste aluno?`)) return;

        try {
            setIsUpdatingGuardians(true);
            setGuardiansError(null);
            setGuardiansStatus(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const response = await fetch(`${API_BASE_URL}/guardians/${link.guardian.id}/students/${editingStudentId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.ok) {
                const err = await response.json().catch(() => null);
                throw new Error(err?.message || 'Não foi possível remover o responsável.');
            }

            setGuardiansStatus('Responsável removido do aluno com sucesso.');
            await loadStudentGuardians(editingStudentId);
        } catch (error) {
            setGuardiansError(errorMessage(error, 'Não foi possível remover o responsável.'));
        } finally {
            setIsUpdatingGuardians(false);
        }
    };

    const renderStudentInfoButton = (student: StudentRecord) => (
        <GridRecordPopover
            title={student.name}
            subtitle={student.birthDate ? `Nascimento: ${formatStudentDate(student.birthDate)}` : 'Aluno sem data de nascimento informada'}
            buttonLabel={`Ver detalhes do aluno ${student.name}`}
            avatarUrl={student.photoUrl}
            badges={[
                student.canceledAt ? 'INATIVO' : 'ATIVO',
                ...(studentFieldAccess.access ? [student.email ? 'APP LIBERADO' : 'SEM ACESSO', formatStudentAccessProfile(student.accessProfile)] : []),
            ]}
            sections={[
                {
                    title: 'Cadastro',
                    items: [
                        ...(studentFieldAccess.sensitive ? [
                            { label: 'CPF', value: student.cpf || 'Não informado' },
                            { label: 'RG', value: student.rg || 'Não informado' },
                        ] : []),
                        { label: 'Apelido', value: student.nickname || 'Não informado' },
                        { label: 'Nome empresarial', value: student.corporateName || 'Não informado' },
                    ],
                },
                ...(studentFieldAccess.contact || studentFieldAccess.access ? [{
                    title: 'Contato',
                    items: [
                        ...(studentFieldAccess.access ? [{ label: 'E-mail', value: student.email || 'Não informado' }] : []),
                        ...(studentFieldAccess.contact ? [
                            { label: 'Telefone principal', value: student.whatsapp || student.phone || student.cellphone1 || student.cellphone2 || 'Não informado' },
                            { label: 'Telefone 1', value: student.cellphone1 || 'Não informado' },
                            { label: 'Telefone 2', value: student.cellphone2 || 'Não informado' },
                            { label: 'WhatsApp', value: student.whatsapp || 'Não informado' },
                        ] : []),
                    ],
                }] : []),
                ...(studentFieldAccess.academic || studentFieldAccess.financial || studentFieldAccess.access ? [{
                    title: 'Acadêmico',
                    items: [
                        ...(studentFieldAccess.academic ? [{ label: 'Turma atual', value: getStudentCurrentEnrollmentLabel(student, activeSchoolYearId) }] : []),
                        ...(studentFieldAccess.financial ? [{ label: 'Mensalidade', value: formatMoneyLabel(student.monthlyFee) }] : []),
                        { label: 'Responsáveis', value: getStudentGuardiansSummary(student) },
                        ...(studentFieldAccess.access ? [{ label: 'Permissões específicas', value: formatStudentPermissions(student.permissions) }] : []),
                    ],
                }] : []),
                ...(studentFieldAccess.contact ? [{
                    title: 'Endereço',
                    items: [
                        { label: 'Endereço completo', value: getStudentAddressLabel(student) },
                        { label: 'Cidade / UF', value: [student.city, student.state].filter(Boolean).join(' / ') || 'Não informado' },
                        { label: 'CEP', value: student.zipCode || 'Não informado' },
                        { label: 'Complemento', value: student.complement || 'Não informado' },
                    ],
                }] : []),
                ...(studentFieldAccess.academic ? [{
                    title: 'Observações',
                    items: [
                        { label: 'Anotações', value: student.notes || 'Sem observações cadastradas' },
                    ],
                }] : []),
            ]}
            contextLabel="PRINCIPAL_ALUNOS_POPUP"
        />
    );

    return (
        <div className="w-full">
            <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-[#153a6a]">Alunos</h1>
                    <p className="mt-1 font-medium text-slate-500">Cadastre estudantes e mantenha seus dados atualizados.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setIsExportModalOpen(true)}
                        className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                    >
                        Exportar
                    </button>
                    {canManageStudents ? (
                        <button
                            onClick={openModal}
                            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white shadow-md shadow-blue-500/20 transition-all active:scale-95 hover:bg-blue-500"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                            Novo Aluno
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-medium text-blue-800">
                O cadastro-base compartilhado agora fica em <Link href="/dashboard/pessoas" className="font-black underline">Pessoas</Link>. Use esta area para operacoes especificas do aluno, como matricula, turma, foto e vinculos com responsaveis.
            </div>

            {errorStatus ? <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-600">{errorStatus}</div> : null}

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="dashboard-band border-b px-6 py-4">
                    <div className="relative w-full max-w-xs">
                        <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar aluno..." className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="dashboard-table-head border-b border-slate-300 text-[13px] font-bold uppercase tracking-wider">
                                {visibleStudentColumns.map((column) => (
                                    <th key={column.key} className={`px-6 py-4 ${column.align === 'center' ? 'text-center' : ''}`}><GridSortableHeader label={column.label} isActive={sortState.column === column.key} direction={sortState.direction} onClick={() => toggleSort(column.key)} align={column.align === 'center' ? 'center' : 'left'} /></th>
                                ))}
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? <tr><td colSpan={visibleStudentColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">Carregando alunos...</td></tr> : null}
                            {!isLoading && sortedFilteredStudents.length === 0 ? <tr><td colSpan={visibleStudentColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">Nenhum aluno encontrado.</td></tr> : null}
                            {!isLoading && sortedFilteredStudents.map((student) => (
                                <tr key={student.id} className={student.canceledAt ? 'bg-rose-50/40 hover:bg-rose-50' : 'hover:bg-slate-50'}>
                                    {visibleStudentColumns.map((column) => renderStudentGridCell(student, column.key))}
                                    <td className="px-6 py-4 text-right">
                                        {canManageStudents ? (
                                            <div className="flex justify-end gap-2">
                                                {renderStudentInfoButton(student)}
                                                <GridRowActionIconButton title="Abrir responsáveis do aluno" onClick={() => handleManageGuardians(student)} tone="violet">
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5V4H2v16h5m10 0v-2a4 4 0 00-4-4H11a4 4 0 00-4 4v2m10 0H7m10 0h-2m-8 0H5m6-10a4 4 0 110-8 4 4 0 010 8z" />
                                                    </svg>
                                                </GridRowActionIconButton>
                                                <GridRowActionIconButton title="Editar aluno" onClick={() => handleEdit(student)} tone="blue">
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </GridRowActionIconButton>
                                                <GridRowActionIconButton title={student.canceledAt ? 'Ativar aluno' : 'Inativar aluno'} onClick={() => openStudentStatusModal(student)} tone={student.canceledAt ? 'emerald' : 'rose'}>
                                                    {student.canceledAt ? (
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
                                                {renderStudentInfoButton(student)}
                                                <span className="self-center text-xs font-semibold text-slate-400">Somente leitura</span>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <GridFooterControls
                    key={`student-footer-${sortedFilteredStudents.length}`}
                    recordsCount={Number(sortedFilteredStudents.length)}
                    onOpenColumns={() => setIsGridConfigOpen(true)}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    activeLabel="Mostrar somente alunos ativos"
                    allLabel="Mostrar alunos ativos e inativos"
                    inactiveLabel="Mostrar somente alunos inativos"
                    aggregateSummaries={aggregateSummaries}
                />
            </div>

            <GridColumnConfigModal
                isOpen={isGridConfigOpen}
                title="Configurar colunas do grid"
                description="Reordene, oculte ou inclua colunas do cadastro de alunos nesta tela."
                columns={availableStudentColumns.map((column) => ({
                    key: column.key,
                    label: column.label,
                    visibleByDefault: column.visibleByDefault,
                    aggregateOptions: column.aggregateOptions,
                }))}
                orderedColumns={columnOrder}
                hiddenColumns={hiddenColumns}
                selectedAggregations={columnAggregations}
                onToggleColumnVisibility={toggleGridColumnVisibility}
                onMoveColumn={moveGridColumn}
                onAggregationChange={handleColumnAggregationChange}
                onReset={resetGridColumns}
                onClose={() => setIsGridConfigOpen(false)}
            />

            <StatusConfirmationModal
                isOpen={Boolean(studentStatusToggleTarget && studentStatusToggleAction)}
                tenantId={currentTenantId}
                actionType={studentStatusToggleAction || 'activate'}
                title={studentStatusToggleAction === 'activate' ? 'Ativar aluno' : 'Inativar aluno'}
                itemLabel="Aluno"
                itemName={studentStatusToggleTarget?.name || ''}
                description={studentStatusToggleAction === 'activate'
                    ? 'Ao ativar um aluno, ele volta a constar na lista de ativos e pode ser matriculado novamente nas turmas e relatórios.'
                    : 'Ao inativar um aluno, seu histórico fica preservado e ele deixa de ser considerado ativo para futuras operações.'}
                confirmLabel={studentStatusToggleAction === 'activate' ? 'Confirmar ativação' : 'Confirmar inativação'}
                onCancel={() => closeStudentStatusModal(true)}
                onConfirm={confirmStudentStatusToggle}
                isProcessing={isProcessingStudentToggle}
                statusActive={!studentStatusToggleTarget?.canceledAt}
                screenId={ALUNOS_STATUS_MODAL_SCREEN_ID}
            />

            <GridExportModal
                isOpen={isExportModalOpen}
                title="Exportar alunos"
                description={`A exportação respeita a busca atual e inclui ${sortedFilteredStudents.length} registro(s).`}
                format={exportFormat}
                onFormatChange={setExportFormat}
                columns={availableStudentExportColumns.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={exportColumns}
                onToggleColumn={toggleExportColumn}
                onSelectAll={setAllExportColumns}
                storageKey={getStudentExportConfigStorageKey(currentTenantId)}
                onClose={() => setIsExportModalOpen(false)}
                onExport={async (config) => {
                    try {
                        await exportGridRows({
                            rows: sortedFilteredStudents,
                            columns: config?.orderedColumns
                                ? config.orderedColumns
                                    .map((key) => availableStudentExportColumns.find((column) => column.key === key))
                                    .filter((column): column is GridColumnDefinition<StudentRecord, StudentExportColumnKey> => !!column)
                                : availableStudentExportColumns,
                            selectedColumns: config?.selectedColumns || exportColumns,
                            format: exportFormat,
                            pdfOptions: config?.pdfOptions,
                            fileBaseName: 'alunos',
                            branding: {
                                title: 'Alunos',
                                subtitle: 'Exportação com os filtros atualmente aplicados.',
                            },
                        });
                        setErrorStatus(null);
                        setIsExportModalOpen(false);
                    } catch (error) {
                        setErrorStatus(error instanceof Error ? error.message : 'Não foi possível exportar os alunos.');
                    }
                }}
            />

            {isModalOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
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
                                        {editingStudentId ? `Editar aluno: ${formData.name || 'ALUNO'}` : 'Cadastrar aluno'}
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
                        <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50/50 px-6 pt-4">
                            {[
                                { id: 1, label: '1. DADOS BÁSICOS' },
                                { id: 2, label: '2. ENDEREÇO' },
                                { id: 3, label: '3. ACESSO PWA' },
                                { id: 4, label: '4. RESPONSÁVEIS', disabled: !editingStudentId },
                                { id: 5, label: '5. FOTOS' },
                                { id: 6, label: '6. OBSERVAÇÕES' },
                            ].map((tab) => (
                                <button
                                    key={tab.label}
                                    type="button"
                                    disabled={tab.disabled}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`rounded-t-lg px-4 py-2.5 text-sm font-bold ${
                                        activeTab === tab.id
                                            ? 'border border-slate-200 border-b-white bg-white text-blue-700'
                                            : tab.disabled
                                                ? 'cursor-not-allowed text-slate-300'
                                                : 'text-slate-500 hover:bg-slate-100'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6">
                            {activeTab === 1 ? (
                                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                                    {studentFieldAccess.sensitive ? (
                                        <div>
                                            <label className={labelClass}>CPF (opcional)</label>
                                            <input value={formData.cpf} onChange={(event) => setFormData((current) => ({ ...current, cpf: event.target.value.toUpperCase() }))} onBlur={handleCpfBlur} className={inputClass} />
                                        </div>
                                    ) : null}
                                    <div className="relative lg:col-span-2">
                                        <label className={labelClass}>Nome completo *</label>
                                        <input
                                            required
                                            value={formData.name}
                                            onChange={(event) => handleStudentNameChange(event.target.value)}
                                            onFocus={() => {
                                                if (!editingStudentId && String(formData.name || '').trim().length >= 2) {
                                                    setShowNameSuggestions(true);
                                                }
                                            }}
                                            onBlur={() => {
                                                window.setTimeout(() => setShowNameSuggestions(false), 160);
                                            }}
                                            className={inputClass}
                                        />
                                        {!editingStudentId && (showNameSuggestions || isLoadingNameSuggestions) ? (
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
                                    <div className="lg:col-span-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-4">
                                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_0.8fr]">
                                            <div>
                                                <label className={labelClass}>Turma + série (opcional)</label>
                                                <select
                                                    value={formData.seriesClassId}
                                                    onChange={(event) => {
                                                        const selectedSeriesClass = availableSeriesClasses.find((item) => item.id === event.target.value);
                                                        setFormData((current) => ({
                                                            ...current,
                                                            seriesClassId: event.target.value,
                                                            monthlyFee: studentFieldAccess.financial
                                                                ? (current.monthlyFee || formatMoneyValue(selectedSeriesClass?.class?.defaultMonthlyFee))
                                                                : current.monthlyFee,
                                                        }));
                                                    }}
                                                    className={`${inputClass} bg-white`}
                                                >
                                                    <option value="">SEM TURMA VINCULADA</option>
                                                    {availableSeriesClasses.map((seriesClass) => (
                                                        <option key={seriesClass.id} value={seriesClass.id}>
                                                            {getSeriesClassLabel(seriesClass)}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="mt-2 rounded-lg border border-blue-200 bg-white/80 px-3 py-2 text-xs font-bold text-blue-700">
                                                    {activeSchoolYear
                                                        ? `ANO LETIVO ASSUMIDO: ${activeSchoolYear.year}${activeSchoolYear.isActive ? ' (ATIVO)' : ''}`
                                                        : 'ANO LETIVO ASSUMIDO: NÃO IDENTIFICADO'}
                                                </div>
                                                <div className="mt-2 text-xs font-medium text-slate-500">
                                                    {activeSchoolYearId
                                                        ? 'Se nada for informado, o aluno será salvo sem turma vinculada neste ano.'
                                                        : 'Nenhum ano letivo ativo encontrado. O aluno pode ser salvo normalmente sem turma.'}
                                                </div>
                                            </div>
                                            {studentFieldAccess.financial ? (
                                                <div>
                                                    <label className={labelClass}>Valor da mensalidade</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={formData.monthlyFee}
                                                        onChange={(event) => setFormData((current) => ({ ...current, monthlyFee: event.target.value }))}
                                                        className={`${inputClass} bg-white`}
                                                        placeholder="0.00"
                                                    />
                                                    <div className="mt-2 text-xs font-medium text-slate-500">
                                                        Se a turma tiver valor padrão, ele pode ser usado como base e ajustado aqui.
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                    {studentFieldAccess.sensitive ? (
                                        <>
                                            <div><label className={labelClass}>RG</label><input value={formData.rg} onChange={(event) => setFormData((current) => ({ ...current, rg: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                            <div><label className={labelClass}>CNPJ</label><input value={formData.cnpj} onChange={(event) => setFormData((current) => ({ ...current, cnpj: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                        </>
                                    ) : null}
                                    <div><label className={labelClass}>Apelido</label><input value={formData.nickname} onChange={(event) => setFormData((current) => ({ ...current, nickname: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                    <div className="lg:col-span-2"><label className={labelClass}>Nome empresarial / social</label><input value={formData.corporateName} onChange={(event) => setFormData((current) => ({ ...current, corporateName: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                    {studentFieldAccess.contact ? (
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
                                studentFieldAccess.contact ? (
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
                                        Seu perfil não possui autorização para consultar ou alterar os dados de contato e endereço deste aluno.
                                    </div>
                                )
                            ) : null}
                            {activeTab === 3 ? (
                                studentFieldAccess.access ? (
                                    <div className="space-y-6">
                                    <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-slate-50 p-6">
                                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                            <div className="md:col-span-2">
                                                <label className={labelClass}>Perfil pré-definido do aluno</label>
                                                <select
                                                    value={formData.accessProfile}
                                                    onChange={(event) => handleStudentProfileChange(event.target.value as AccessProfileCode)}
                                                    className={`${inputClass} bg-white`}
                                                >
                                                    {getProfilesForRole('ALUNO').map((profile) => (
                                                        <option key={profile.code} value={profile.code}>{profile.label}</option>
                                                    ))}
                                                </select>
                                                <div className="mt-2 text-xs font-medium text-slate-500">
                                                    Se este aluno precisar de uma exceção, ajuste os checkboxes abaixo. Nesse caso, a permissão específica da tela passa a valer acima do perfil padrão.
                                                </div>
                                            </div>
                                            <div>
                                                <label className={labelClass}>E-mail de login</label>
                                                <input
                                                    type="email"
                                                    value={formData.email}
                                                    onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value.toUpperCase() }))}
                                                    className={`${inputClass} bg-white`}
                                                />
                                            </div>
                                            <div>
                                                <label className={labelClass}>{editingStudentId ? 'Senha nova (opcional)' : 'Senha de acesso'}</label>
                                                <input
                                                    value={formData.password}
                                                    onChange={(event) => setFormData((current) => ({ ...current, password: event.target.value }))}
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
                                                        onChange={() => toggleStudentPermission(permission.value)}
                                                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                                    />
                                                    <span className="text-sm font-medium text-slate-700">{permission.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    {editingStudentId ? <div className="mx-auto max-w-4xl rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-700">Depois de salvar os dados deste aluno, você também pode usar a aba RESPONSÁVEIS para lançar quem responde por ele.</div> : null}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-medium text-amber-700">
                                        Seu perfil não possui autorização para consultar ou alterar os dados de acesso PWA deste aluno.
                                    </div>
                                )
                            ) : null}
                            {activeTab === 4 ? (
                                <div className="space-y-6">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                                        <div className="text-sm font-bold text-slate-700">Responsáveis do aluno</div>
                                        <div className="mt-1 text-sm text-slate-500">Lance aqui quem são os pais, mães ou demais responsáveis deste aluno.</div>
                                    </div>

                                    {guardiansError ? <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-600">{guardiansError}</div> : null}
                                    {guardiansStatus ? <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">{guardiansStatus}</div> : null}

                                    <div className="space-y-6">
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                                            <h3 className="text-base font-bold text-slate-800">Lançar novo responsável</h3>
                                            <p className="mt-1 text-sm text-slate-500">Escolha abaixo um responsável já cadastrado na escola e informe o parentesco.</p>

                                            <div className="mt-5 space-y-4">
                                                <div>
                                                    <label className={labelClass}>Selecionar responsável *</label>
                                                    <select
                                                        value={guardianLinkForm.guardianId}
                                                        onChange={(event) => setGuardianLinkForm((current) => ({
                                                            ...current,
                                                            guardianId: event.target.value,
                                                            guardianQuery: getGuardianComboLabel(availableGuardians.find((guardian) => guardian.id === event.target.value) || { id: '', name: '' }),
                                                        }))}
                                                        className={inputClass}
                                                        disabled={!canManageStudents || isLoadingGuardians || isUpdatingGuardians || !availableGuardians.length}
                                                    >
                                                        <option value="">SELECIONE O RESPONSÁVEL</option>
                                                        {availableGuardians.map((guardian) => (
                                                            <option key={guardian.id} value={guardian.id}>
                                                                {getGuardianComboLabel(guardian)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {!isLoadingGuardians && availableGuardians.length === 0 ? <div className="mt-2 text-xs font-medium text-slate-400">Todos os responsáveis cadastrados já estão vinculados a este aluno.</div> : null}
                                                </div>

                                                <div>
                                                    <label className={labelClass}>Parentesco *</label>
                                                    <select
                                                        value={guardianLinkForm.kinship}
                                                        onChange={(event) => setGuardianLinkForm((current) => ({
                                                            ...current,
                                                            kinship: event.target.value as KinshipValue,
                                                            kinshipDescription: event.target.value === 'OUTROS' ? current.kinshipDescription : '',
                                                        }))}
                                                        className={inputClass}
                                                        disabled={!canManageStudents || isLoadingGuardians || isUpdatingGuardians}
                                                    >
                                                        {KINSHIP_OPTIONS.map((option) => (
                                                            <option key={option.value} value={option.value}>{option.label}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {guardianLinkForm.kinship === 'OUTROS' ? (
                                                    <div>
                                                        <label className={labelClass}>Descrição do parentesco *</label>
                                                        <input
                                                            value={guardianLinkForm.kinshipDescription}
                                                            onChange={(event) => setGuardianLinkForm((current) => ({ ...current, kinshipDescription: event.target.value.toUpperCase() }))}
                                                            className={inputClass}
                                                            disabled={!canManageStudents || isLoadingGuardians || isUpdatingGuardians}
                                                            placeholder="EX.: IRMÃ MAIS VELHA"
                                                        />
                                                    </div>
                                                ) : null}

                                                <button
                                                    type="button"
                                                    onClick={handleLinkGuardian}
                                                    disabled={!canManageStudents || isLoadingGuardians || isUpdatingGuardians || !availableGuardians.length}
                                                    className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                                                >
                                                    {isUpdatingGuardians ? 'Salvando vínculo...' : 'Lançar responsável'}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                            <div className="mb-4 flex items-center justify-between">
                                                <div>
                                                    <h3 className="text-base font-bold text-slate-800">Responsáveis já cadastrados neste aluno</h3>
                                                    <p className="text-sm text-slate-500">{studentGuardians.length} responsável(is) lançado(s) para este aluno.</p>
                                                </div>
                                                <GridRowActionIconButton
                                                    title="Atualizar responsáveis do aluno"
                                                    onClick={() => { if (editingStudentId) void loadStudentGuardians(editingStudentId); }}
                                                    tone="slate"
                                                >
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                    </svg>
                                                </GridRowActionIconButton>
                                            </div>

                                            {isLoadingGuardians ? (
                                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-medium text-slate-400">Carregando responsáveis do aluno...</div>
                                            ) : null}

                                            {!isLoadingGuardians && studentGuardians.length === 0 ? (
                                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-medium text-slate-400">Nenhum responsável lançado para este aluno.</div>
                                            ) : null}

                                            {!isLoadingGuardians && studentGuardians.length > 0 ? (
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    {studentGuardians.map((link) => (
                                                        <div key={link.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                                                            <div className="flex flex-col gap-3">
                                                                <div>
                                                                    <div className="text-sm font-bold text-slate-800">{link.guardian?.name || 'RESPONSÁVEL SEM NOME'}</div>
                                                                    <div className="mt-1 inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-700">{formatKinshipLabel(link)}</div>
                                                                    <div className="mt-3 text-sm font-medium text-slate-500">{getGuardianPrimaryPhone(link.guardian)}</div>
                                                                </div>
                                                                <div className="flex flex-wrap gap-2">
                                                                    <GridRowActionIconButton
                                                                        title="Abrir dados gerais do responsável"
                                                                        onClick={() => setSelectedGuardianDetails(link.guardian || null)}
                                                                        tone="blue"
                                                                    >
                                                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                        </svg>
                                                                    </GridRowActionIconButton>
                                                                    {canManageStudents ? (
                                                                        <button
                                                                            type="button"
                                                                            title="Remover responsável deste aluno"
                                                                            disabled={isUpdatingGuardians}
                                                                            onClick={() => handleUnlinkGuardian(link)}
                                                                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                                                                        >
                                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728M6 6l12 12" />
                                                                            </svg>
                                                                        </button>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                            {activeTab === 5 ? (
                                <div className="mx-auto max-w-4xl space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-6">
                                    <div>
                                        <div className="text-base font-bold text-slate-800">Fotos do aluno</div>
                                        <div className="mt-1 text-sm text-slate-500">Controle aqui a foto principal do aluno e atualize sempre que precisar.</div>
                                    </div>
                                    <div className="grid gap-5 md:grid-cols-[220px_1fr] md:items-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="flex h-44 w-44 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-blue-200 bg-white shadow-sm">
                                                {formData.photoUrl ? (
                                                    <img src={formData.photoUrl} alt="Foto do aluno" className="h-full w-full object-cover" />
                                                ) : (
                                                    <div className="px-4 text-center text-xs font-bold text-slate-400">
                                                        FOTO DO ALUNO
                                                    </div>
                                                )}
                                            </div>
                                            {formData.photoUrl ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData((current) => ({ ...current, photoUrl: '' }))}
                                                    className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100"
                                                >
                                                    Remover foto
                                                </button>
                                            ) : null}
                                        </div>
                                        <div>
                                            <label className={labelClass}>Foto do aluno</label>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handlePhotoChange}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-blue-700"
                                            />
                                            <div className="mt-2 text-xs font-medium text-slate-500">
                                                {editingStudentId ? 'Você pode atualizar a foto do aluno sempre que precisar.' : 'A foto será gravada junto com o cadastro do aluno.'}
                                            </div>
                                            {photoError ? (
                                                <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                                                    {photoError}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                            {activeTab === 6 ? (
                                <div className="mx-auto max-w-3xl space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-6">
                                    <div>
                                        <div className="text-base font-bold text-slate-800">Observações do aluno</div>
                                        <div className="mt-1 text-sm text-slate-500">Use esta aba para registrar informações importantes sobre o aluno.</div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Observação</label>
                                        <textarea
                                            value={formData.notes}
                                            onChange={(event) => setFormData((current) => ({ ...current, notes: event.target.value.toUpperCase() }))}
                                            rows={8}
                                            className={`${inputClass} min-h-[220px] resize-y bg-white`}
                                            placeholder="INFORMAÇÕES IMPORTANTES SOBRE O ALUNO"
                                        />
                                    </div>
                                </div>
                            ) : null}

                            <div className="sticky bottom-0 -mx-6 mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white/95 px-6 py-5 backdrop-blur-sm">
                                <div className="flex flex-wrap gap-3">
                                    <button type="button" onClick={closeModal} className="rounded-xl px-6 py-3 text-sm font-semibold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100">Sair sem Gravar</button>
                                    {activeTab > 1 ? (
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab(activeTab === 4 ? 3 : activeTab === 6 ? 5 : activeTab - 1)}
                                            className="rounded-xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                                        >
                                            {activeTab === 4
                                                ? 'Voltar para acesso'
                                                : activeTab === 5
                                                    ? (editingStudentId ? 'Voltar para responsáveis' : 'Voltar para acesso')
                                                    : activeTab === 6
                                                        ? 'Voltar para fotos'
                                                        : 'Voltar'}
                                        </button>
                                    ) : null}
                                </div>
                                <div className="flex flex-wrap justify-end gap-3">
                                    {activeTab < 6 ? (
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab(activeTab === 3 ? (editingStudentId ? 4 : 5) : activeTab + 1)}
                                            className="rounded-xl bg-[#153a6a] px-8 py-3 text-sm font-bold text-white hover:bg-blue-800"
                                        >
                                            Próxima etapa →
                                        </button>
                                    ) : null}
                                    <button type="submit" className="rounded-xl bg-green-600 px-8 py-3 text-sm font-bold text-white hover:bg-green-700">{editingStudentId ? 'Salvar edição' : 'Registrar aluno'}</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {isGuardiansViewOpen ? (
                <div className="fixed inset-0 z-[57] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
                            <div>
                                <h2 className="text-xl font-bold text-[#153a6a]">Responsáveis do aluno</h2>
                                <p className="mt-1 text-sm font-medium text-slate-500">{guardiansViewStudentName}</p>
                            </div>
                            <button onClick={closeGuardiansViewModal} className="text-slate-400 hover:text-red-500">×</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {isLoadingGuardiansView ? (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm font-medium text-slate-400">
                                    Carregando responsáveis do aluno...
                                </div>
                            ) : null}

                            {!isLoadingGuardiansView && guardiansViewError ? (
                                <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-600">
                                    {guardiansViewError}
                                </div>
                            ) : null}

                            {!isLoadingGuardiansView && !guardiansViewError && guardiansViewItems.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm font-medium text-slate-400">
                                    Nenhum responsável lançado para este aluno.
                                </div>
                            ) : null}

                            {!isLoadingGuardiansView && !guardiansViewError && guardiansViewItems.length > 0 ? (
                                <div className="grid gap-4 md:grid-cols-2">
                                    {guardiansViewItems.map((link) => (
                                        <div key={link.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="text-base font-bold text-slate-800">{link.guardian?.name || 'RESPONSÁVEL SEM NOME'}</div>
                                                    <div className="mt-2 inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-700">
                                                        {formatKinshipLabel(link)}
                                                    </div>
                                                </div>
                                                <div className="space-y-1 text-sm text-slate-600">
                                                    <div>Telefone: {getGuardianPrimaryPhone(link.guardian)}</div>
                                                    <div>E-mail: {link.guardian?.email || 'Não informado'}</div>
                                                    <div>CPF: {link.guardian?.cpf || 'Não informado'}</div>
                                                </div>
                                                <div className="pt-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedGuardianDetails(link.guardian || null)}
                                                        className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-100"
                                                    >
                                                        Dados gerais
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 text-right">
                            <button onClick={closeGuardiansViewModal} className="rounded-xl bg-[#153a6a] px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-800">
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {selectedGuardianDetails ? (
                <div className="fixed inset-0 z-[58] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
                            <div>
                                <h2 className="text-xl font-bold text-[#153a6a]">Dados do responsável</h2>
                                <p className="mt-1 text-sm font-medium text-slate-500">{selectedGuardianDetails.name}</p>
                            </div>
                            <button onClick={() => setSelectedGuardianDetails(null)} className="text-slate-400 hover:text-red-500">×</button>
                        </div>
                        <div className="grid gap-6 p-6 md:grid-cols-2">
                            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <h3 className="text-sm font-bold text-slate-800">Dados gerais</h3>
                                <div className="text-sm text-slate-600">CPF: {selectedGuardianDetails.cpf || 'Não informado'}</div>
                                <div className="text-sm text-slate-600">RG: {selectedGuardianDetails.rg || 'Não informado'}</div>
                                <div className="text-sm text-slate-600">Nascimento: {selectedGuardianDetails.birthDate ? new Date(selectedGuardianDetails.birthDate).toLocaleDateString() : 'Não informado'}</div>
                                <div className="text-sm text-slate-600">E-mail: {selectedGuardianDetails.email || 'Não informado'}</div>
                            </div>
                            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <h3 className="text-sm font-bold text-slate-800">Telefones</h3>
                                <div className="text-sm text-slate-600">WhatsApp: {selectedGuardianDetails.whatsapp || 'Não informado'}</div>
                                <div className="text-sm text-slate-600">Celular 1: {selectedGuardianDetails.cellphone1 || 'Não informado'}</div>
                                <div className="text-sm text-slate-600">Celular 2: {selectedGuardianDetails.cellphone2 || 'Não informado'}</div>
                                <div className="text-sm text-slate-600">Telefone: {selectedGuardianDetails.phone || 'Não informado'}</div>
                            </div>
                            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 md:col-span-2">
                                <h3 className="text-sm font-bold text-slate-800">Endereço</h3>
                                <div className="text-sm text-slate-600">CEP: {selectedGuardianDetails.zipCode || 'Não informado'}</div>
                                <div className="text-sm text-slate-600">Logradouro: {selectedGuardianDetails.street || 'Não informado'}</div>
                                <div className="text-sm text-slate-600">Número: {selectedGuardianDetails.number || 'Não informado'}</div>
                                <div className="text-sm text-slate-600">Bairro: {selectedGuardianDetails.neighborhood || 'Não informado'}</div>
                                <div className="text-sm text-slate-600">Complemento: {selectedGuardianDetails.complement || 'Não informado'}</div>
                                <div className="text-sm text-slate-600">Cidade: {selectedGuardianDetails.city || 'Não informado'}</div>
                                <div className="text-sm text-slate-600">UF: {selectedGuardianDetails.state || 'Não informado'}</div>
                            </div>
                        </div>
                        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 text-right">
                            <button onClick={() => setSelectedGuardianDetails(null)} className="rounded-xl bg-[#153a6a] px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-800">Fechar</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {saveError ? <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"><div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-3 text-lg font-bold text-slate-800">Atenção</div><div className="text-sm font-medium text-red-600">{saveError}</div><div className="mt-4 text-right"><button onClick={() => setSaveError(null)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">Fechar</button></div></div></div> : null}
        </div>
    );
}

