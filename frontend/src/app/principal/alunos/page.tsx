'use client';

import { type ChangeEvent, type KeyboardEvent, useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import GridColumnConfigModal from '@/app/components/grid-column-config-modal';
import GridExportModal from '@/app/components/grid-export-modal';
import GridRecordPopover from '@/app/components/grid-record-popover';
import GridRowActionIconButton from '@/app/components/grid-row-action-icon-button';
import PrincipalProgramHeader from '@/app/components/principal-program-header';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { showErrorMessage, showSuccessMessage } from '@/app/components/system-message-provider';
import StatusConfirmationModal from '@/app/components/status-confirmation-modal';
import { TenantBranchSelect } from '@/app/components/tenant-branch-select';
import GridStatusFilter, { type GridStatusFilterValue } from '@/app/components/grid-status-filter';
import {
    fetchAddressByCep,
    fetchEmailUsageByEmail,
    fetchSharedPersonNameSuggestions,
    fetchSharedPersonProfileByCpf,
    fetchSharedPersonProfileByEmail,
    fetchTenantBranches,
    formatCepInput,
    formatCnpj,
    formatCnpjInput,
    formatCpf,
    formatCpfInput,
    formatPhone,
    formatPhoneInput,
    getAllowedDashboardFields,
    getDashboardAuthContext,
    hasDashboardPermission,
    isValidCnpj,
    isValidCpf,
    mergeSharedPersonIntoForm,
    normalizeCnpj,
    normalizeDocumentDigits,
    readImageFileAsDataUrl,
    type EmailUsageRecord,
    type SharedNameSuggestion,
    type TenantBranchSummary,
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
import { dispatchScreenAuditContext, formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';
import { buildBranchAccessPayload, resolveBranchAccessSelection } from '@/app/lib/tenant-branch-selection';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const ALUNOS_SCREEN_ID = 'PRINCIPAL_ALUNOS';
const ALUNOS_STATUS_MODAL_SCREEN_ID = 'PRINCIPAL_ALUNOS_STATUS_MODAL';

const normalizeCpfDigits = (value: string) => String(value || '').replace(/\D/g, '');
const limitNumericDigits = (value: string, maxLength: number) =>
    normalizeDocumentDigits(value).slice(0, maxLength);

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
type BillingPayerType = 'ALUNO' | 'RESPONSAVEL';

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

type EmailUsageAlert = {
    email: string;
    usages: EmailUsageRecord[];
    currentTenantId: string | null;
    currentTenantName: string;
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
    branchCode?: number | null;
    branchAccessCodes?: number[] | null;
    personId?: string | null;
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
    telegramChatId?: string | null;
    telegramUsername?: string | null;
    telegramOptInAt?: string | null;
    telegramOptOutAt?: string | null;
    monthlyFee?: number | null;
    billingPayerType?: BillingPayerType | null;
    billingGuardianId?: string | null;
    billingGuardian?: GuardianSummary | null;
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
    branchCode: number;
    branchAccessCodes: number[];
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
    telegramChatId: string;
    telegramUsername: string;
    telegramOptInEnabled: boolean;
    zipCode: string;
    street: string;
    number: string;
    city: string;
    state: string;
    neighborhood: string;
    complement: string;
    seriesClassId: string;
    monthlyFee: string;
    billingPayerType: BillingPayerType;
    billingGuardianId: string;
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
    branchCode: 1,
    branchAccessCodes: [1],
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
    telegramChatId: '',
    telegramUsername: '',
    telegramOptInEnabled: false,
    zipCode: '',
    street: '',
    number: '',
    city: '',
    state: '',
    neighborhood: '',
    complement: '',
    seriesClassId: '',
    monthlyFee: '',
    billingPayerType: 'ALUNO',
    billingGuardianId: '',
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

const CPF_CONFLICT_SCREEN_ID = 'PRINCIPAL_ALUNOS_POPUP_CPF_CONFLICT';
const inputClass = 'w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white';
const labelClass = 'mb-1 block text-xs font-bold text-slate-600';

type StudentColumnKey =
    | 'name'
    | 'currentEnrollment'
    | 'currentClass'
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
type StudentColumnFilters = Record<StudentColumnKey, string>;

const HIDDEN_ALUNOS_DISPLAY_COLUMNS = new Set<StudentExportColumnKey>([
    'cpf',
    'contact',
    'email',
    'phone',
    'whatsapp',
    'cellphone1',
    'cellphone2',
]);

const STUDENT_COLUMNS: ConfigurableGridColumn<StudentRecord, StudentColumnKey>[] = [
    { key: 'name', label: 'Aluno', getValue: (row) => row.name || '---', visibleByDefault: true },
    { key: 'currentEnrollment', label: 'Série atual', getValue: (row) => getStudentCurrentSeriesLabel(row, null), visibleByDefault: true },
    { key: 'currentClass', label: 'Turma atual', getValue: (row) => getStudentCurrentClassLabel(row, null), visibleByDefault: true },
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
const STUDENT_GRID_COLUMN_WIDTHS: Partial<Record<StudentColumnKey, string>> = {
    name: 'w-[36%]',
    currentEnrollment: 'w-[20%]',
    currentClass: 'w-[16%]',
    pwaStatus: 'w-[10%]',
    birthDate: 'w-36',
    monthlyFee: 'w-40',
    accessProfile: 'w-40',
    notes: 'w-56',
    address: 'w-64',
};
const STUDENT_COLUMN_KEYS = getAllGridColumnKeys(STUDENT_COLUMNS);
const DEFAULT_VISIBLE_STUDENT_COLUMNS = getDefaultVisibleGridColumnKeys(STUDENT_COLUMNS);
const EMPTY_STUDENT_COLUMN_FILTERS = STUDENT_COLUMN_KEYS.reduce<StudentColumnFilters>((accumulator, key) => {
    accumulator[key] = '';
    return accumulator;
}, {} as StudentColumnFilters);
const REQUIRED_VISIBLE_STUDENT_GRID_COLUMNS: StudentColumnKey[] = ['currentEnrollment', 'currentClass'];

function getStudentGridColumnWidthClass(columnKey: StudentColumnKey) {
    return STUDENT_GRID_COLUMN_WIDTHS[columnKey] || 'w-40';
}

function ensureRequiredStudentGridColumns(order: StudentColumnKey[]) {
    let nextOrder = [...order];

    REQUIRED_VISIBLE_STUDENT_GRID_COLUMNS.forEach((columnKey) => {
        if (nextOrder.includes(columnKey)) return;

        const currentEnrollmentIndex = nextOrder.indexOf('currentEnrollment');
        const nameIndex = nextOrder.indexOf('name');
        const insertionIndex = currentEnrollmentIndex >= 0
            ? currentEnrollmentIndex + 1
            : nameIndex >= 0
                ? nameIndex + 1
                : 0;

        nextOrder = [
            ...nextOrder.slice(0, insertionIndex),
            columnKey,
            ...nextOrder.slice(insertionIndex),
        ];
    });

    return nextOrder;
}

function normalizeStudentGridFilterValue(value: unknown) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
}

function normalizeStudentGridDigits(value: unknown) {
    return String(value ?? '').replace(/\D/g, '');
}

function matchesStudentGridFilter(values: unknown[], filter: string) {
    const normalizedFilter = normalizeStudentGridFilterValue(filter);
    const filterDigits = normalizeStudentGridDigits(filter);

    if (!normalizedFilter) {
        return true;
    }

    return values.some((value) => {
        const normalizedValue = normalizeStudentGridFilterValue(value);

        if (normalizedValue.includes(normalizedFilter)) {
            return true;
        }

        return Boolean(filterDigits && normalizeStudentGridDigits(value).includes(filterDigits));
    });
}

function getStudentColumnFilterValues(row: StudentRecord, columnKey: StudentColumnKey, activeSchoolYearId: string | null) {
    const column = STUDENT_COLUMNS.find((item) => item.key === columnKey);
    const baseValue = column?.getValue(row) || '';

    if (columnKey === 'name') {
        return [row.name, row.nickname, row.email, formatStudentDate(row.birthDate), baseValue];
    }

    if (columnKey === 'currentEnrollment') {
        return [getStudentCurrentSeriesLabel(row, activeSchoolYearId), baseValue];
    }

    if (columnKey === 'currentClass') {
        return [getStudentCurrentClassLabel(row, activeSchoolYearId), baseValue];
    }

    if (columnKey === 'contact') {
        return [row.email, row.phone, row.whatsapp, row.cellphone1, row.cellphone2, baseValue];
    }

    if (columnKey === 'address') {
        return [row.street, row.number, row.neighborhood, row.complement, row.city, row.state, row.zipCode, baseValue];
    }

    if (columnKey === 'cityState') {
        return [row.city, row.state, baseValue];
    }

    return [baseValue];
}

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

type AlunosAuditParams = {
    tenantId: string | null;
    tenantName?: string | null;
    searchTerm: string;
    statusFilter: GridStatusFilterValue;
    seriesFilter: string;
    classFilter: string;
    displayedRowsCount: number;
    sortColumn: StudentColumnKey;
    sortDirection: 'asc' | 'desc';
};

function getAlunosAuditOrderBy(column: StudentColumnKey) {
    const orderColumns: Record<StudentColumnKey, string> = {
        name: 'ST.name',
        currentEnrollment: 'SE.name',
        currentClass: 'CL.name',
        nickname: 'ST.nickname',
        corporateName: 'ST.corporateName',
        birthDate: 'ST.birthDate',
        cpf: 'ST.cpf',
        rg: 'ST.rg',
        cnpj: 'ST.cnpj',
        contact: 'COALESCE(ST.email, ST.whatsapp, ST.phone, ST.cellphone1)',
        email: 'ST.email',
        phone: 'ST.phone',
        whatsapp: 'ST.whatsapp',
        cellphone1: 'ST.cellphone1',
        cellphone2: 'ST.cellphone2',
        monthlyFee: 'ST.monthlyFee',
        zipCode: 'ST.zipCode',
        street: 'ST.street',
        number: 'ST.number',
        neighborhood: 'ST.neighborhood',
        complement: 'ST.complement',
        city: 'ST.city',
        state: 'ST.state',
        cityState: 'ST.city',
        address: 'ST.street',
        pwaStatus: 'ST.email',
        accessProfile: 'ST.accessProfile',
        notes: 'ST.notes',
    };

    return orderColumns[column] || 'ST.name';
}

function buildAlunosAuditSql(params: AlunosAuditParams) {
    const searchTerm = params.searchTerm.trim().toUpperCase();
    const statusFilter = String(params.statusFilter || 'ACTIVE').toUpperCase();
    const seriesFilter = String(params.seriesFilter || 'ALL').trim().toUpperCase() || 'ALL';
    const classFilter = String(params.classFilter || 'ALL').trim().toUpperCase() || 'ALL';
    const sortDirection = params.sortDirection === 'desc' ? 'DESC' : 'ASC';

    return `-- PARAMETROS ATUAIS DO GRID
-- :schoolId = ${toSqlLiteral(params.tenantId || '')}
-- :searchTerm = ${toSqlLiteral(searchTerm)}
-- :statusFilter = ${toSqlLiteral(statusFilter)}
-- :seriesFilter = ${toSqlLiteral(seriesFilter)}
-- :classFilter = ${toSqlLiteral(classFilter)}

SELECT DISTINCT ST.*
FROM students ST
LEFT JOIN enrollments EN
  ON EN.studentId = ST.id
 AND EN.tenantId = ST.tenantId
 AND EN.canceledAt IS NULL
LEFT JOIN series_classes SC
  ON SC.id = EN.seriesClassId
 AND SC.tenantId = ST.tenantId
 AND SC.canceledAt IS NULL
LEFT JOIN series SE
  ON SE.id = SC.seriesId
 AND SE.tenantId = ST.tenantId
 AND SE.canceledAt IS NULL
LEFT JOIN classes CL
  ON CL.id = SC.classId
 AND CL.tenantId = ST.tenantId
 AND CL.canceledAt IS NULL
WHERE ST.tenantId = ${toSqlLiteral(params.tenantId || '')}
  AND (
    ${toSqlLiteral(searchTerm)} = ''
    OR UPPER(COALESCE(ST.name, '')) LIKE '%' || UPPER(${toSqlLiteral(searchTerm)}) || '%'
    OR UPPER(COALESCE(ST.email, '')) LIKE '%' || UPPER(${toSqlLiteral(searchTerm)}) || '%'
    OR UPPER(COALESCE(ST.cpf, '')) LIKE '%' || UPPER(${toSqlLiteral(searchTerm)}) || '%'
    OR UPPER(COALESCE(ST.whatsapp, '')) LIKE '%' || UPPER(${toSqlLiteral(searchTerm)}) || '%'
    OR UPPER(COALESCE(ST.phone, '')) LIKE '%' || UPPER(${toSqlLiteral(searchTerm)}) || '%'
  )
  AND (
    ${toSqlLiteral(statusFilter)} = 'ALL'
    OR (${toSqlLiteral(statusFilter)} = 'ACTIVE' AND ST.canceledAt IS NULL)
    OR (${toSqlLiteral(statusFilter)} = 'INACTIVE' AND ST.canceledAt IS NOT NULL)
  )
  AND (
    ${toSqlLiteral(seriesFilter)} = 'ALL'
    OR UPPER(COALESCE(SE.name, '')) = ${toSqlLiteral(seriesFilter)}
  )
  AND (
    ${toSqlLiteral(classFilter)} = 'ALL'
    OR UPPER(COALESCE(CL.name, '')) = ${toSqlLiteral(classFilter)}
  )
ORDER BY ${getAlunosAuditOrderBy(params.sortColumn)} ${sortDirection};`;
}

function buildAlunosAuditText(params: AlunosAuditParams) {
    const searchTerm = params.searchTerm.trim().toUpperCase();
    const statusFilter = String(params.statusFilter || 'ACTIVE').toUpperCase();
    const seriesFilter = String(params.seriesFilter || 'ALL').trim().toUpperCase() || 'ALL';
    const classFilter = String(params.classFilter || 'ALL').trim().toUpperCase() || 'ALL';
    const sortDirection = params.sortDirection === 'desc' ? 'DESC' : 'ASC';

    return `--- LOGICA DA TELA ---
Tela de grid/listagem administrativa para manutencao do cadastro de alunos.

TABELAS PRINCIPAIS:
- students (ST) - cadastro operacional de alunos
- enrollments (EN) - matriculas e vinculos academicos
- series_classes (SC) - vinculo entre serie e turma
- series (SE) - cadastro de series da escola
- classes (CL) - cadastro de turmas da escola

RELACIONAMENTOS:
- students.id = enrollments.studentId
- enrollments.seriesClassId = series_classes.id
- series.id = series_classes.seriesId
- classes.id = series_classes.classId

FILTROS APLICADOS AGORA:
- escola/tenant atual (:schoolId): ${formatTenantAuditValue(params.tenantId, params.tenantName)}
- busca digitada (:searchTerm): ${formatAuditValue(searchTerm)}
- status selecionado (:statusFilter): ${statusFilter}
- serie selecionada (:seriesFilter): ${seriesFilter}
- turma selecionada (:classFilter): ${classFilter}
- registros exibidos apos os filtros: ${params.displayedRowsCount}
- ordenacao atual: ${getAlunosAuditOrderBy(params.sortColumn)} ${sortDirection}

OBSERVACAO SOBRE O FILTRO DA EMPRESA / ESCOLA:
- ST.tenantId e a coluna usada para isolar os dados da empresa / escola
- :schoolId acima ja esta preenchido com o tenantId real da escola logada
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

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

function getStudentCurrentSeriesLabel(student: StudentRecord, activeSchoolYearId: string | null) {
    const currentEnrollment = student.enrollments?.find((item) => item.schoolYearId === activeSchoolYearId) || student.enrollments?.[0];
    return currentEnrollment?.seriesClass?.series?.name || 'Sem série vinculada';
}

function getStudentCurrentClassLabel(student: StudentRecord, activeSchoolYearId: string | null) {
    const currentEnrollment = student.enrollments?.find((item) => item.schoolYearId === activeSchoolYearId) || student.enrollments?.[0];
    const currentClass = currentEnrollment?.seriesClass?.class;
    if (!currentClass?.name) return 'Sem turma vinculada';

    const shifts = splitClassShifts(currentClass.shift).join(' / ');
    return shifts ? `${currentClass.name} (${shifts})` : currentClass.name;
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

function getBillingGuardianLabel(guardians: StudentGuardianLink[], guardianId?: string | null) {
    const guardianLink = guardians.find((link) => link.guardian?.id === guardianId);
    return guardianLink?.guardian?.name || 'Responsável não identificado';
}

function getStudentBillingPayerLabel(student: StudentRecord) {
    const billingPayerType = student.billingPayerType === 'RESPONSAVEL' ? 'RESPONSAVEL' : 'ALUNO';
    if (billingPayerType === 'ALUNO') {
        return `O próprio aluno (${student.name || 'ALUNO'})`;
    }

    return student.billingGuardian?.name
        || getBillingGuardianLabel(student.guardians || [], student.billingGuardianId)
        || 'Responsável não identificado';
}

function getFormBillingPayerLabel(studentName: string, payerType: BillingPayerType, guardianId: string, guardians: StudentGuardianLink[]) {
    if (payerType === 'ALUNO') {
        return `O próprio aluno (${studentName || 'ALUNO'})`;
    }

    if (!guardianId) {
        return 'Selecione o responsável que pagará a mensalidade.';
    }

    return getBillingGuardianLabel(guardians, guardianId);
}

export default function AlunosPage() {
    const [students, setStudents] = useState<StudentRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(1);
    const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
    const [originalStudentCpf, setOriginalStudentCpf] = useState('');
    const [originalStudentPersonId, setOriginalStudentPersonId] = useState<string | null>(null);
    const [originalStudentSeriesClassId, setOriginalStudentSeriesClassId] = useState('');
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [currentBranchCode, setCurrentBranchCode] = useState(1);
    const [tenantBranches, setTenantBranches] = useState<TenantBranchSummary[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [saveError, setSaveErrorState] = useState<string | null>(null);
    const [saveSuccessPopup, setSaveSuccessPopup] = useState<{ title: string; message: string } | null>(null);
    const [formData, setFormData] = useState<StudentFormState>(EMPTY_FORM);
    const [studentGuardians, setStudentGuardians] = useState<StudentGuardianLink[]>([]);
    const [guardiansCatalog, setGuardiansCatalog] = useState<GuardianSummary[]>([]);
    const [guardianLinkForm, setGuardianLinkForm] = useState<GuardianLinkFormState>(EMPTY_GUARDIAN_LINK_FORM);
    const [isLoadingGuardians, setIsLoadingGuardians] = useState(false);
    const [isUpdatingGuardians, setIsUpdatingGuardians] = useState(false);
    const [guardiansError, setGuardiansError] = useState<string | null>(null);
    const [guardiansStatus, setGuardiansStatus] = useState<string | null>(null);
    const [cpfConflictAlert, setCpfConflictAlert] = useState<{ name: string; cpf: string } | null>(null);
    const [cpfConflictRoles, setCpfConflictRoles] = useState<string[]>([]);
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
    const [studentColumnFilters, setStudentColumnFilters] = useState<StudentColumnFilters>(EMPTY_STUDENT_COLUMN_FILTERS);
    const [studentColumnFilterDrafts, setStudentColumnFilterDrafts] = useState<StudentColumnFilters>(EMPTY_STUDENT_COLUMN_FILTERS);
    const [activeStudentFilterColumn, setActiveStudentFilterColumn] = useState<StudentColumnKey | null>(null);
    const [studentPageSize, setStudentPageSize] = useState(10);
    const [studentPage, setStudentPage] = useState(1);
    const [selectedStudentGridRowId, setSelectedStudentGridRowId] = useState<string | null>(null);
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
    const setSaveError = (message: string | null) => {
        setSaveErrorState(null);
        if (message) showErrorMessage(message);
    };
    const [debouncedStudentNameQuery, setDebouncedStudentNameQuery] = useState('');
    const [emailUsageAlert, setEmailUsageAlert] = useState<EmailUsageAlert | null>(null);

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
            if (HIDDEN_ALUNOS_DISPLAY_COLUMNS.has(column.key)) return false;
            if (['cpf', 'rg', 'cnpj'].includes(column.key) && !studentFieldAccess.sensitive) return false;
            if (column.key === 'monthlyFee' && !studentFieldAccess.financial) return false;
            if (['phone', 'whatsapp', 'cellphone1', 'cellphone2', 'zipCode', 'street', 'number', 'neighborhood', 'complement', 'city', 'state', 'cityState', 'address'].includes(column.key) && !studentFieldAccess.contact) return false;
            if (['email', 'accessProfile', 'pwaStatus'].includes(column.key) && !studentFieldAccess.access) return false;
            if (['currentEnrollment', 'currentClass'].includes(column.key) && !studentFieldAccess.academic) return false;
            if (column.key === 'contact' && !studentFieldAccess.contact && !studentFieldAccess.access) return false;
            if (column.key === 'notes' && !studentFieldAccess.academic) return false;
            return true;
        }),
        [studentFieldAccess.access, studentFieldAccess.academic, studentFieldAccess.contact, studentFieldAccess.financial, studentFieldAccess.sensitive],
    );
    const availableStudentExportColumns = useMemo(
        () => STUDENT_EXPORT_COLUMNS.filter((column) => {
            if (HIDDEN_ALUNOS_DISPLAY_COLUMNS.has(column.key)) return false;
            if (['cpf', 'rg', 'cnpj'].includes(column.key) && !studentFieldAccess.sensitive) return false;
            if (column.key === 'monthlyFee' && !studentFieldAccess.financial) return false;
            if (['phone', 'whatsapp', 'cellphone1', 'cellphone2', 'zipCode', 'street', 'number', 'neighborhood', 'complement', 'city', 'state', 'cityState', 'address'].includes(column.key) && !studentFieldAccess.contact) return false;
            if (['email', 'accessProfile', 'pwaStatus', 'permissions'].includes(column.key) && !studentFieldAccess.access) return false;
            if (['currentEnrollment', 'currentClass'].includes(column.key) && !studentFieldAccess.academic) return false;
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
    const seriesOptions = useMemo(() => {
        const labels = new Map<string, string>();
        seriesClassesCatalog.forEach((seriesClass) => {
            const seriesName = seriesClass.series?.name?.trim();
            if (seriesName) labels.set(seriesName.toUpperCase(), seriesName);
        });
        return Array.from(labels.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));
    }, [seriesClassesCatalog]);
    const studentClassOptions = useMemo(() => {
        const labels = new Map<string, string>();
        const seriesFilterValue = studentColumnFilters.currentEnrollment.trim().toUpperCase();
        seriesClassesCatalog.forEach((seriesClass) => {
            const seriesName = seriesClass.series?.name?.trim().toUpperCase() || '';
            if (seriesFilterValue && seriesName !== seriesFilterValue) return;
            const className = seriesClass.class?.name?.trim();
            if (className) labels.set(className.toUpperCase(), className);
        });
        return Array.from(labels.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));
    }, [seriesClassesCatalog, studentColumnFilters.currentEnrollment]);
    const filteredStudents = useMemo(() => {
        const term = searchTerm.trim().toUpperCase();
        const activeColumnFilters = (Object.entries(studentColumnFilters) as Array<[StudentColumnKey, string]>)
            .filter(([, value]) => value.trim());

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
              const matchesColumnFilters = activeColumnFilters.every(([columnKey, filter]) =>
                  matchesStudentGridFilter(getStudentColumnFilterValues(student, columnKey, activeSchoolYearId), filter),
              );
              return matchesStatus && matchesSearch && matchesColumnFilters;
          });
    }, [activeSchoolYearId, searchTerm, statusFilter, studentColumnFilters, students]);
    const sortedFilteredStudents = useMemo(
        () => sortGridRows(filteredStudents, STUDENT_COLUMNS, sortState),
        [filteredStudents, sortState],
    );
    const studentTotalPages = Math.max(1, Math.ceil(sortedFilteredStudents.length / studentPageSize));
    const currentStudentPage = Math.min(Math.max(studentPage, 1), studentTotalPages);
    const paginatedStudents = useMemo(() => {
        const startIndex = (currentStudentPage - 1) * studentPageSize;
        return sortedFilteredStudents.slice(startIndex, startIndex + studentPageSize);
    }, [currentStudentPage, sortedFilteredStudents, studentPageSize]);
    const displayedStudentsCount = sortedFilteredStudents.length;
    const hasStudentGridFilters = useMemo(
        () =>
            Boolean(searchTerm.trim())
            || statusFilter !== 'ACTIVE'
            || sortState.column !== DEFAULT_SORT.column
            || sortState.direction !== DEFAULT_SORT.direction
            || Object.values(studentColumnFilters).some((value) => value.trim()),
        [searchTerm, sortState.column, sortState.direction, statusFilter, studentColumnFilters],
    );
    const aggregateSummaries = useMemo(
        () => buildGridAggregateSummaries(sortedFilteredStudents, visibleStudentColumns, columnAggregations),
        [columnAggregations, sortedFilteredStudents, visibleStudentColumns],
    );
    const availableSeriesClasses = useMemo(() => {
        const activeYearSeriesClasses = activeSchoolYearId
            ? seriesClassesCatalog.filter((item) => item.schoolYearId === activeSchoolYearId)
            : seriesClassesCatalog;
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
    const alunosAuditContext = useMemo(() => {
        const auditParams: AlunosAuditParams = {
            tenantId: currentTenantId,
            tenantName: currentTenantBranding?.schoolName,
            searchTerm,
            statusFilter,
            seriesFilter: studentColumnFilters.currentEnrollment.trim().toUpperCase() || 'ALL',
            classFilter: studentColumnFilters.currentClass.trim().toUpperCase() || 'ALL',
            displayedRowsCount: sortedFilteredStudents.length,
            sortColumn: sortState.column,
            sortDirection: sortState.direction,
        };

        return {
            auditText: buildAlunosAuditText(auditParams),
            sqlText: buildAlunosAuditSql(auditParams),
        };
    }, [currentTenantBranding?.schoolName, currentTenantId, searchTerm, sortState.column, sortState.direction, sortedFilteredStudents.length, statusFilter, studentColumnFilters.currentClass, studentColumnFilters.currentEnrollment]);

    useEffect(() => {
        dispatchScreenAuditContext({
            screenId: ALUNOS_SCREEN_ID,
            auditText: alunosAuditContext.auditText,
            sqlText: alunosAuditContext.sqlText,
        });
    }, [alunosAuditContext]);

    useEffect(() => {
        setStudentPage(1);
    }, [searchTerm, sortState.column, sortState.direction, statusFilter, studentColumnFilters, studentPageSize]);

    useEffect(() => {
        setStudentPage((current) => Math.min(Math.max(current, 1), studentTotalPages));
    }, [studentTotalPages]);

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
            const { token, role, permissions, tenantId, branchCode } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');
            setCurrentRole(role);
            setCurrentPermissions(permissions);
            setCurrentTenantId(tenantId);
            setCurrentBranchCode(branchCode);
            const [response, branchesData] = await Promise.all([
                fetch(`${API_BASE_URL}/students`, { headers: { Authorization: `Bearer ${token}` } }),
                fetchTenantBranches().catch(() => []),
            ]);
            if (!response.ok) {
                const err = await response.json().catch(() => null);
                throw new Error(err?.message || 'Falha ao buscar alunos.');
            }
            const data = await response.json();
            setStudents(Array.isArray(data) ? data : []);
            setTenantBranches(Array.isArray(branchesData) ? branchesData : []);
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
            const nextOrder = ensureRequiredStudentGridColumns(config.order);
            setColumnOrder(nextOrder);
            setHiddenColumns(config.hidden.filter((key) => !REQUIRED_VISIBLE_STUDENT_GRID_COLUMNS.includes(key)));
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
        setOriginalStudentCpf('');
        setOriginalStudentPersonId(null);
        setOriginalStudentSeriesClassId('');
        setCpfConflictAlert(null);
        setCpfConflictRoles([]);
        setCpfConflictRoles([]);
        setCpfConflictRoles([]);
        setActiveTab(1);
        setFormData({ ...EMPTY_FORM, branchCode: currentBranchCode, branchAccessCodes: [currentBranchCode] });
        setPersonSystemRoles(['ALUNO']);
        setNameSuggestions([]);
        setShowNameSuggestions(false);
        setIsLoadingNameSuggestions(false);
        setNameSuggestionError(null);
        setEmailUsageAlert(null);
        resetGuardianSection();
        setPhotoError(null);
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

    const clearAllStudentGridFilters = () => {
        setSearchTerm('');
        setStatusFilter('ACTIVE');
        setSortState(DEFAULT_SORT);
        setStudentColumnFilters({ ...EMPTY_STUDENT_COLUMN_FILTERS });
        setStudentColumnFilterDrafts({ ...EMPTY_STUDENT_COLUMN_FILTERS });
        setActiveStudentFilterColumn(null);
        setStudentPage(1);
    };

    const openStudentColumnFilter = (columnKey: StudentColumnKey | null) => {
        if (!columnKey) {
            setActiveStudentFilterColumn(null);
            return;
        }

        setStudentColumnFilterDrafts((current) => ({
            ...current,
            [columnKey]: studentColumnFilters[columnKey] || '',
        }));
        setActiveStudentFilterColumn(columnKey);
    };

    const applyStudentColumnFilter = (columnKey: StudentColumnKey) => {
        setStudentColumnFilters((current) => ({
            ...current,
            [columnKey]: studentColumnFilterDrafts[columnKey] || '',
            ...(columnKey === 'currentEnrollment' ? { currentClass: '' } : {}),
        }));
        setStudentColumnFilterDrafts((current) => ({
            ...current,
            ...(columnKey === 'currentEnrollment' ? { currentClass: '' } : {}),
        }));
        setActiveStudentFilterColumn(null);
    };

    const clearStudentColumnFilter = (columnKey: StudentColumnKey) => {
        setStudentColumnFilters((current) => ({
            ...current,
            [columnKey]: '',
            ...(columnKey === 'currentEnrollment' ? { currentClass: '' } : {}),
        }));
        setStudentColumnFilterDrafts((current) => ({
            ...current,
            [columnKey]: '',
            ...(columnKey === 'currentEnrollment' ? { currentClass: '' } : {}),
        }));
        setActiveStudentFilterColumn(null);
    };

    const handleStudentColumnFilterKeyDown = (
        event: KeyboardEvent<HTMLInputElement>,
        columnKey: StudentColumnKey,
    ) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        applyStudentColumnFilter(columnKey);
    };

    const renderStudentClearAllButton = () => (
        <button
            type="button"
            onClick={clearAllStudentGridFilters}
            aria-label="Limpar todos os filtros"
            title="Limpar todos os filtros"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${
                hasStudentGridFilters
                    ? 'border-rose-300 bg-rose-50 text-rose-600 shadow-sm hover:bg-rose-100'
                    : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
            }`}
        >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M4 6h16M7 12h10M10 18h4" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M18 4 6 20" />
            </svg>
        </button>
    );

    const renderStudentColumnHeader = (column: ConfigurableGridColumn<StudentRecord, StudentColumnKey>) => {
        const isOpen = activeStudentFilterColumn === column.key;
        const isActive = Boolean(studentColumnFilters[column.key]?.trim()) || sortState.column === column.key;
        const alignClass =
            column.align === 'right'
                ? 'justify-end'
                : column.align === 'center'
                    ? 'justify-center'
                    : 'justify-start';
        const comboFilterOptions = column.key === 'currentEnrollment'
            ? seriesOptions
            : column.key === 'currentClass'
                ? studentClassOptions
                : null;
        const comboFilterAllLabel = column.key === 'currentEnrollment' ? 'Todas as séries' : 'Todas as turmas';
        const popoverAlignClass = column.align === 'right' || column.key === 'currentClass' ? 'right-0' : 'left-0';

        return (
            <div className={`relative flex items-center gap-2 ${alignClass}`}>
                <span>{column.label}</span>
                <button
                    type="button"
                    onClick={() => openStudentColumnFilter(isOpen ? null : column.key)}
                    aria-label={`Filtrar ${column.label}`}
                    title={`Filtrar ${column.label}`}
                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
                        isActive || isOpen
                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-white text-slate-400 hover:border-blue-200 hover:text-blue-600'
                    }`}
                >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <circle cx="11" cy="11" r="7" strokeWidth={1.8} />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m20 20-3.5-3.5" />
                    </svg>
                </button>
                {isOpen ? (
                    <div className={`absolute top-full z-40 mt-2 w-[276px] rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-xl ${popoverAlignClass}`}>
                        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                            Ordenar coluna
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSortState({ column: column.key, direction: 'asc' });
                                    setActiveStudentFilterColumn(null);
                                }}
                                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                            >
                                Crescente
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSortState({ column: column.key, direction: 'desc' });
                                    setActiveStudentFilterColumn(null);
                                }}
                                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                            >
                                Decrescente
                            </button>
                        </div>
                        <div className="mt-3 border-t border-slate-100 pt-3">
                            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                                Filtrar {column.label}
                            </div>
                            {comboFilterOptions ? (
                                <select
                                    value={studentColumnFilterDrafts[column.key] || ''}
                                    onChange={(event) =>
                                        setStudentColumnFilterDrafts((current) => ({
                                            ...current,
                                            [column.key]: event.target.value,
                                        }))
                                    }
                                    className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                                >
                                    <option value="">{comboFilterAllLabel}</option>
                                    {comboFilterOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    value={studentColumnFilterDrafts[column.key] || ''}
                                    onChange={(event) =>
                                        setStudentColumnFilterDrafts((current) => ({
                                            ...current,
                                            [column.key]: event.target.value.toUpperCase(),
                                        }))
                                    }
                                    onKeyDown={(event) => handleStudentColumnFilterKeyDown(event, column.key)}
                                    placeholder="DIGITE O FILTRO"
                                    className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold uppercase text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                                />
                            )}
                            <button
                                type="button"
                                onClick={() => applyStudentColumnFilter(column.key)}
                                className="mt-2 h-9 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
                            >
                                Filtrar
                            </button>
                            <button
                                type="button"
                                onClick={() => clearStudentColumnFilter(column.key)}
                                className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:bg-slate-100"
                            >
                                Limpar
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    };

    const renderStudentGridCell = (student: StudentRecord, columnKey: StudentColumnKey) => {
        if (columnKey === 'name') {
            return (
                <td key={columnKey} className="overflow-hidden px-6 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                            {student.photoUrl ? (
                                <img src={student.photoUrl} alt={`Foto de ${student.name}`} className="h-full w-full object-cover" />
                            ) : (
                                <span className="text-xs font-bold text-slate-400">SEM FOTO</span>
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className={`flex min-w-0 items-center gap-2 font-semibold ${student.canceledAt ? 'text-rose-800' : 'text-slate-800'}`}>
                                <span
                                    className={`inline-flex h-3 w-3 shrink-0 rounded-full ${student.canceledAt ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                    title={student.canceledAt ? 'INATIVO' : 'ATIVO'}
                                    aria-label={student.canceledAt ? 'INATIVO' : 'ATIVO'}
                                    role="img"
                                />
                                <span className="truncate">{student.name}</span>
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

        if (columnKey === 'currentEnrollment') {
            return (
                <td key={columnKey} className={`overflow-hidden px-6 py-4 text-sm font-medium ${student.canceledAt ? 'text-rose-700' : 'text-slate-600'}`}>
                    {getStudentCurrentSeriesLabel(student, activeSchoolYearId)}
                </td>
            );
        }

        if (columnKey === 'currentClass') {
            return (
                <td key={columnKey} className={`overflow-hidden px-6 py-4 text-sm font-medium ${student.canceledAt ? 'text-rose-700' : 'text-slate-600'}`}>
                    {getStudentCurrentClassLabel(student, activeSchoolYearId)}
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
            <td key={columnKey} className={`overflow-hidden px-6 py-4 text-sm font-medium ${student.canceledAt ? 'text-rose-700' : 'text-slate-600'}`}>
                {value}
            </td>
        );
    };

    const openModal = () => {
        setEditingStudentId(null);
        setOriginalStudentCpf('');
        setOriginalStudentPersonId(null);
        setOriginalStudentSeriesClassId('');
        setCpfConflictAlert(null);
        setActiveTab(1);
        setFormData({ ...EMPTY_FORM, branchCode: currentBranchCode, branchAccessCodes: [currentBranchCode] });
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
            setOriginalStudentCpf(detail.cpf || '');
            setOriginalStudentPersonId(detail.personId || null);
            setOriginalStudentSeriesClassId(getCurrentEnrollmentSeriesClassId(detail, activeSchoolYearId));
            setActiveTab(initialTab);
            setFormData({
                branchCode: typeof detail.branchCode === 'number' ? detail.branchCode : currentBranchCode,
                branchAccessCodes: resolveBranchAccessSelection(detail, currentBranchCode),
                name: detail.name || '',
                photoUrl: detail.photoUrl || '',
                birthDate: detail.birthDate ? new Date(detail.birthDate).toISOString().split('T')[0] : '',
                cpf: detail.cpf || '',
                rg: detail.rg || '',
                cnpj: detail.cnpj ? normalizeCnpj(detail.cnpj) : '',
                nickname: detail.nickname || '',
                corporateName: detail.corporateName || '',
                phone: detail.phone || '',
                whatsapp: detail.whatsapp || '',
                cellphone1: detail.cellphone1 || '',
                cellphone2: detail.cellphone2 || '',
                email: detail.email || '',
                telegramChatId: detail.telegramChatId || '',
                telegramUsername: detail.telegramUsername || '',
                telegramOptInEnabled: Boolean(detail.telegramOptInAt && !detail.telegramOptOutAt),
                zipCode: detail.zipCode || '',
                street: detail.street || '',
                number: detail.number || '',
                city: detail.city || '',
                state: detail.state || '',
                neighborhood: detail.neighborhood || '',
                complement: detail.complement || '',
                seriesClassId: getCurrentEnrollmentSeriesClassId(detail, activeSchoolYearId),
                monthlyFee: formatMoneyValue(detail.monthlyFee),
                billingPayerType: detail.billingPayerType === 'RESPONSAVEL' ? 'RESPONSAVEL' : 'ALUNO',
                billingGuardianId: detail.billingGuardianId || '',
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
        const formattedCpf = formatCpf(formData.cpf);
        if (!formData.cpf) {
            setFormData((current) => ({ ...current, cpf: formattedCpf }));
            return;
        }

        if (editingStudentId) {
            const currentCpfDigits = normalizeCpfDigits(formData.cpf);
            const originalCpfDigits = normalizeCpfDigits(originalStudentCpf);
            const cpfChanged = currentCpfDigits && currentCpfDigits !== originalCpfDigits;

            if (cpfChanged) {
                try {
                    const profile = await fetchSharedPersonProfileByCpf(formData.cpf);
                    const currentName = String(formData.name || '').trim().toUpperCase();
                    const profileName = String(profile?.name || '').trim().toUpperCase();
                    const samePerson = Boolean(
                        profile?.personId && originalStudentPersonId && profile.personId === originalStudentPersonId,
                    );

                    if (profile && !samePerson && profileName && profileName !== currentName) {
                        setCpfConflictAlert({
                            name: profileName,
                            cpf: formattedCpf,
                        });
                        setCpfConflictRoles(buildSystemRoleBadges(profile.roles));
                        setSaveError(null);
                    }
                } catch (error) {
                    setSaveError(errorMessage(error, 'NÃO FOI POSSÍVEL VALIDAR O CPF INFORMADO.'));
                }
            }

            setFormData((current) => ({ ...current, cpf: formattedCpf }));
            return;
        }

        try {
            const profile = await fetchSharedPersonProfileByCpf(formData.cpf);
            if (!profile) {
                setPersonSystemRoles(['ALUNO']);
                setFormData((current) => ({ ...current, cpf: formattedCpf }));
                return;
            }

            setFormData((current) => (
                mergeSharedPersonIntoForm(
                    current as unknown as Record<string, string>,
                    profile,
                ) as unknown as StudentFormState
            ));
            setPersonSystemRoles(buildSystemRoleBadges(profile.roles));
            setFormData((current) => ({ ...current, cpf: formattedCpf }));
        } catch (error) {
            setSaveError(errorMessage(error, 'Não foi possível reaproveitar os dados deste CPF.'));
            setFormData((current) => ({ ...current, cpf: formattedCpf }));
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
                if (!editingStudentId) return true;
                return !(usage.entityType === 'STUDENT' && usage.recordId === editingStudentId);
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

        const billingPayerType: BillingPayerType = formData.billingPayerType === 'RESPONSAVEL' ? 'RESPONSAVEL' : 'ALUNO';
        const selectedBillingGuardian = studentGuardians.find((link) => link.guardian?.id === formData.billingGuardianId);

        if (studentFieldAccess.financial && billingPayerType === 'RESPONSAVEL') {
            if (!editingStudentId) {
                setSaveError('Salve o aluno antes de definir um responsável como pagador da mensalidade.');
                return;
            }
            if (!formData.billingGuardianId) {
                setSaveError('Selecione o responsável que pagará a mensalidade.');
                return;
            }
            if (!selectedBillingGuardian) {
                setSaveError('O responsável pagador precisa estar vinculado a este aluno.');
                return;
            }
        }

        if (editingStudentId) {
            const currentCpfDigits = normalizeCpfDigits(formData.cpf);
            const originalCpfDigits = normalizeCpfDigits(originalStudentCpf);
            const cpfChanged = currentCpfDigits && currentCpfDigits !== originalCpfDigits;

            if (cpfChanged) {
                try {
                    const profile = await fetchSharedPersonProfileByCpf(formData.cpf);
                    const currentName = String(formData.name || '').trim().toUpperCase();
                    const profileName = String(profile?.name || '').trim().toUpperCase();
                    const samePerson =
                        Boolean(profile?.personId && originalStudentPersonId && profile.personId === originalStudentPersonId);

                    if (profile && !samePerson && profileName && profileName !== currentName) {
                        setCpfConflictAlert({
                            name: profileName,
                            cpf: formatCpf(formData.cpf),
                        });
                        setCpfConflictRoles(buildSystemRoleBadges(profile.roles));
                        setSaveError(null);
                        return;
                    }
                } catch (error) {
                    setSaveError(errorMessage(error, 'NÃO FOI POSSÍVEL VALIDAR O CPF INFORMADO.'));
                    return;
                }
            }
        }

        try {
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');
            const url = editingStudentId ? `${API_BASE_URL}/students/${editingStudentId}` : `${API_BASE_URL}/students`;
            const method = editingStudentId ? 'PATCH' : 'POST';
            const branchPayload = buildBranchAccessPayload(formData.branchAccessCodes, tenantBranches, currentBranchCode);
            const payload: Record<string, string | number | boolean | string[] | number[] | null | undefined> = {
                ...formData,
                ...branchPayload,
                cpf: formatCpf(formData.cpf),
                cnpj: formatCnpj(formData.cnpj),
                phone: formatPhone(formData.phone),
                whatsapp: formatPhone(formData.whatsapp),
                cellphone1: formatPhone(formData.cellphone1),
                cellphone2: formatPhone(formData.cellphone2),
                monthlyFee: parseMoneyValue(formData.monthlyFee),
                billingPayerType,
                billingGuardianId: billingPayerType === 'RESPONSAVEL' ? (formData.billingGuardianId || null) : null,
            };
            if (branchPayload.branchAccessCodes === undefined) {
                delete payload.branchAccessCodes;
            }
            if (!String(formData.email || '').trim()) delete payload.email;
            delete payload.seriesClassId;
            if (!payload.birthDate) delete payload.birthDate;
            if (!studentFieldAccess.financial) {
                delete payload.monthlyFee;
                delete payload.billingPayerType;
                delete payload.billingGuardianId;
            }
            if (!studentFieldAccess.access) {
                delete payload.email;
                delete payload.telegramChatId;
                delete payload.telegramUsername;
                delete payload.telegramOptInEnabled;
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

            const shouldSyncSeriesClass = !editingStudentId || formData.seriesClassId !== originalStudentSeriesClassId;
            if (shouldSyncSeriesClass) {
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
            }

            const wasEditing = Boolean(editingStudentId);
            closeModal();
            await fetchStudents();
            setSaveSuccessPopup(null);
            showSuccessMessage(wasEditing ? 'O aluno foi alterado e a lista já foi atualizada.' : 'O aluno foi inserido e a lista já foi atualizada.');
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

            if (formData.billingPayerType === 'RESPONSAVEL' && formData.billingGuardianId === link.guardian.id) {
                setFormData((current) => ({
                    ...current,
                    billingPayerType: 'ALUNO',
                    billingGuardianId: '',
                }));
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
                            { label: 'RG', value: student.rg || 'Não informado' },
                        ] : []),
                        { label: 'Apelido', value: student.nickname || 'Não informado' },
                    ],
                },
                ...(studentFieldAccess.academic || studentFieldAccess.financial || studentFieldAccess.access ? [{
                    title: 'Acadêmico',
                    items: [
                        ...(studentFieldAccess.academic ? [{ label: 'Turma atual', value: getStudentCurrentEnrollmentLabel(student, activeSchoolYearId) }] : []),
                        ...(studentFieldAccess.financial ? [
                            { label: 'Mensalidade', value: formatMoneyLabel(student.monthlyFee) },
                            { label: 'Pagador', value: getStudentBillingPayerLabel(student) },
                        ] : []),
                        { label: 'Responsáveis', value: getStudentGuardiansSummary(student) },
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
        <div className="flex h-[calc(100vh-4.5rem)] min-h-0 w-full pt-0">
            <div className="flex w-full flex-col bg-transparent">
                <PrincipalProgramHeader
                    eyebrow="Central discente"
                    title="Cadastro de alunos"
                    description="Gerencie estudantes, matrícula atual, responsáveis vinculados e acesso ao sistema."
                    schoolName={currentTenantBranding?.schoolName}
                    logoUrl={currentTenantBranding?.logoUrl}
                    secondaryAction={
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    window.dispatchEvent(new Event('msinfor-financeiro-toggle-sidebar'));
                                }}
                                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/20"
                                title="Recolher menu lateral"
                                aria-label="Recolher menu lateral"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    window.dispatchEvent(new Event('msinfor-financeiro-open-notifications'));
                                }}
                                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/20"
                                title="Abrir notificações"
                                aria-label="Abrir notificações"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                            </button>
                        </>
                    }
                />
                {errorStatus ? <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-600">{errorStatus}</div> : null}

                <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="dashboard-band shrink-0 border-b px-4 py-3">
                        <div className="flex flex-wrap items-center gap-3">
                            {canManageStudents ? (
                                <button
                                    type="button"
                                    onClick={openModal}
                                    title="Cadastrar novo aluno"
                                    aria-label="Cadastrar novo aluno"
                                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-500 active:scale-95"
                                >
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                    </svg>
                                </button>
                            ) : null}
                            <div className="relative w-full max-w-xs">
                                <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar aluno..." className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                                <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div className="min-h-0 min-w-0 flex-1 overflow-auto">
                        <table className="min-w-full table-fixed border-collapse text-left">
                            <colgroup>
                                <col className="w-12" />
                                {visibleStudentColumns.map((column) => (
                                    <col key={column.key} className={getStudentGridColumnWidthClass(column.key)} />
                                ))}
                                <col className="w-36" />
                            </colgroup>
                            <thead className="bg-slate-50">
                                <tr className="dashboard-table-head border-b border-slate-300 text-[13px] font-bold uppercase tracking-wider">
                                    <th className="sticky top-0 z-20 w-12 bg-slate-50 px-3 py-3 text-left">
                                        {renderStudentClearAllButton()}
                                    </th>
                                    {visibleStudentColumns.map((column) => (
                                        <th key={column.key} className={`sticky top-0 z-20 bg-slate-50 px-6 py-3 ${column.align === 'center' ? 'text-center' : ''}`}>
                                            {renderStudentColumnHeader(column)}
                                        </th>
                                    ))}
                                    <th className="sticky top-0 z-20 w-36 bg-slate-50 px-6 py-3 text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={visibleStudentColumns.length + 2} className="px-6 py-12 text-center font-medium text-slate-400">
                                            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600"></div>
                                            Carregando alunos...
                                        </td>
                                    </tr>
                                ) : sortedFilteredStudents.length === 0 ? (
                                    <tr>
                                        <td colSpan={visibleStudentColumns.length + 2} className="px-6 py-12 text-center font-medium text-slate-400">
                                            Nenhum aluno encontrado.
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedStudents.map((student, rowIndex) => {
                                        const zebraClass = rowIndex % 2 === 0
                                            ? student.canceledAt
                                                ? 'bg-rose-100/80 hover:bg-rose-200/80'
                                                : 'bg-white hover:bg-slate-50'
                                            : student.canceledAt
                                                ? 'bg-rose-200/70 hover:bg-rose-300/70'
                                                : 'bg-slate-200/70 hover:bg-slate-300/60';
                                        const isSelectedRow = selectedStudentGridRowId === student.id;
                                        const rowClass = isSelectedRow
                                            ? 'bg-blue-100 outline outline-2 outline-blue-400 outline-offset-[-2px] hover:bg-blue-100'
                                            : zebraClass;

                                        return (
                                            <tr
                                                key={student.id}
                                                onClick={() => setSelectedStudentGridRowId(student.id)}
                                                aria-selected={isSelectedRow}
                                                className={`group cursor-pointer transition-colors ${rowClass}`}
                                            >
                                                <td className="px-3 py-4" />
                                                {visibleStudentColumns.map((column) => renderStudentGridCell(student, column.key))}
                                                <td className="w-36 px-6 py-4 text-right">
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
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setIsGridConfigOpen(true)}
                                title="ALTERAR COLUNAS GRID"
                                aria-label="ALTERAR COLUNAS GRID"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <rect x="4" y="5" width="16" height="14" rx="2" strokeWidth={2} />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5v14M15 5v14" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsExportModalOpen(true)}
                                title="Abrir exportação e impressão"
                                aria-label="Abrir exportação e impressão"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V4h12v5M6 18h12v2H6v-2zm-1-8h14a2 2 0 012 2v4H3v-4a2 2 0 012-2z" />
                                </svg>
                            </button>
                            <GridStatusFilter
                                value={statusFilter}
                                onChange={setStatusFilter}
                                activeLabel="Mostrar somente alunos ativos"
                                allLabel="Mostrar alunos ativos e inativos"
                                inactiveLabel="Mostrar somente alunos inativos"
                            />
                            <div
                                className="inline-flex h-8 items-center rounded-full border border-slate-300 bg-white px-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 shadow-sm"
                                title={`${displayedStudentsCount} registro(s) encontrado(s)`}
                            >
                                Total registros: {new Intl.NumberFormat('pt-BR').format(displayedStudentsCount)}
                            </div>
                            {aggregateSummaries.map((summary) => (
                                <div
                                    key={summary.key}
                                    className="inline-flex h-8 items-center rounded-full border border-slate-300 bg-white px-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 shadow-sm"
                                >
                                    {summary.label}: <span className="ml-1 text-blue-700">{summary.value}</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <select
                                value={studentPageSize}
                                onChange={(event) => setStudentPageSize(Number(event.target.value))}
                                aria-label="Registros por página"
                                className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 outline-none transition hover:bg-slate-50 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            >
                                {[10, 20, 50, 100].map((pageSize) => (
                                    <option key={pageSize} value={pageSize}>{pageSize}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                aria-label="Voltar para o início"
                                title="Voltar para o início"
                                onClick={() => setStudentPage(1)}
                                disabled={currentStudentPage <= 1}
                                className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {'<<'}
                            </button>
                            <button
                                type="button"
                                aria-label="Voltar uma página"
                                title="Voltar uma página"
                                onClick={() => setStudentPage((current) => Math.max(1, current - 1))}
                                disabled={currentStudentPage <= 1}
                                className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {'<'}
                            </button>
                            <div className="min-w-20 text-center text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                                {currentStudentPage}/{studentTotalPages}
                            </div>
                            <button
                                type="button"
                                aria-label="Avançar uma página"
                                title="Avançar uma página"
                                onClick={() => setStudentPage((current) => Math.min(studentTotalPages, current + 1))}
                                disabled={currentStudentPage >= studentTotalPages}
                                className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {'>'}
                            </button>
                            <button
                                type="button"
                                aria-label="Ir para o fim"
                                title="Ir para o fim"
                                onClick={() => setStudentPage(studentTotalPages)}
                                disabled={currentStudentPage >= studentTotalPages}
                                className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {'>>'}
                            </button>
                        </div>
                    </div>
                </section>

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
                                { id: 3, label: '3. CREDENCIAIS DE ACESSO' },
                                { id: 4, label: '4. RESPONSÁVEIS', disabled: !editingStudentId },
                                { id: 5, label: '5. FINANCEIRO' },
                                { id: 6, label: '6. FOTOS' },
                                { id: 7, label: '7. OBSERVAÇÕES' },
                                { id: 8, label: '8. FILIAIS DE ACESSO' },
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
                                            <input
                                                value={formatCpfInput(formData.cpf)}
                                                onChange={(event) =>
                                                    setFormData((current) => ({
                                                        ...current,
                                                        cpf: limitNumericDigits(event.target.value, 11),
                                                    }))
                                                }
                                                onBlur={handleCpfBlur}
                                                className={inputClass}
                                            />
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
                                            <div>
                                                <label className={labelClass}>CNPJ</label>
                                                <input
                                                    value={formatCnpjInput(formData.cnpj)}
                                                    onChange={(event) =>
                                                        setFormData((current) => ({
                                                            ...current,
                                                            cnpj: normalizeCnpj(event.target.value),
                                                        }))
                                                    }
                                                    className={inputClass}
                                                />
                                            </div>
                                        </>
                                    ) : null}
                                    <div><label className={labelClass}>Apelido</label><input value={formData.nickname} onChange={(event) => setFormData((current) => ({ ...current, nickname: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                    <div className="lg:col-span-2"><label className={labelClass}>Nome empresarial / social</label><input value={formData.corporateName} onChange={(event) => setFormData((current) => ({ ...current, corporateName: event.target.value.toUpperCase() }))} className={inputClass} /></div>
                                    {studentFieldAccess.contact ? (
                                        <>
                                            <div>
                                                <label className={labelClass}>WhatsApp</label>
                                                <input
                                                    value={formatPhoneInput(formData.whatsapp)}
                                                    onChange={(event) =>
                                                        setFormData((current) => ({
                                                            ...current,
                                                            whatsapp: limitNumericDigits(event.target.value, 11),
                                                        }))
                                                    }
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Telefone</label>
                                                <input
                                                    value={formatPhoneInput(formData.phone)}
                                                    onChange={(event) =>
                                                        setFormData((current) => ({
                                                            ...current,
                                                            phone: limitNumericDigits(event.target.value, 11),
                                                        }))
                                                    }
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Celular 1</label>
                                                <input
                                                    value={formatPhoneInput(formData.cellphone1)}
                                                    onChange={(event) =>
                                                        setFormData((current) => ({
                                                            ...current,
                                                            cellphone1: limitNumericDigits(event.target.value, 11),
                                                        }))
                                                    }
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Celular 2</label>
                                                <input
                                                    value={formatPhoneInput(formData.cellphone2)}
                                                    onChange={(event) =>
                                                        setFormData((current) => ({
                                                            ...current,
                                                            cellphone2: limitNumericDigits(event.target.value, 11),
                                                        }))
                                                    }
                                                    className={inputClass}
                                                />
                                            </div>
                                        </>
                                    ) : null}
                                </div>
                            ) : null}
                            {activeTab === 2 ? (
                                studentFieldAccess.contact ? (
                                    <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
                                        <div>
                                            <label className={labelClass}>CEP</label>
                                            <div className="flex gap-2">
                                                <input
                                                    value={formatCepInput(formData.zipCode)}
                                                    onChange={(event) =>
                                                        setFormData((current) => ({
                                                            ...current,
                                                            zipCode: limitNumericDigits(event.target.value, 8),
                                                        }))
                                                    }
                                                    className={inputClass}
                                                />
                                                <button type="button" onClick={handleCepSearch} className="rounded-lg border border-blue-200 bg-blue-100 px-3 font-bold text-blue-700">
                                                    OK
                                                </button>
                                            </div>
                                        </div>
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
                                                <label className={labelClass}>E-mail de login (opcional)</label>
                                                <input
                                                    type="email"
                                                    value={formData.email}
                                                    onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value.toUpperCase() }))}
                                                    onBlur={handleEmailUsageBlur}
                                                    className={`${inputClass} bg-white`}
                                                />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Telegram Chat ID</label>
                                                <input
                                                    value={formData.telegramChatId}
                                                    onChange={(event) => setFormData((current) => ({ ...current, telegramChatId: event.target.value.trim() }))}
                                                    className={`${inputClass} bg-white`}
                                                    placeholder="Ex.: 123456789"
                                                />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Usuário Telegram</label>
                                                <input
                                                    value={formData.telegramUsername}
                                                    onChange={(event) => setFormData((current) => ({ ...current, telegramUsername: event.target.value.toUpperCase() }))}
                                                    className={`${inputClass} bg-white`}
                                                    placeholder="Ex.: @USUARIO"
                                                />
                                            </div>
                                            <label className="flex min-h-[46px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.telegramOptInEnabled}
                                                    onChange={(event) => setFormData((current) => ({ ...current, telegramOptInEnabled: event.target.checked }))}
                                                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                                />
                                                Telegram ativo para notificações
                                            </label>
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
                                                                    <div className="mt-1 flex flex-wrap gap-2">
                                                                        <div className="inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-700">{formatKinshipLabel(link)}</div>
                                                                        {formData.billingPayerType === 'RESPONSAVEL' && formData.billingGuardianId === link.guardian?.id ? (
                                                                            <div className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">Pagador da mensalidade</div>
                                                                        ) : null}
                                                                    </div>
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
                                <div className="space-y-6">
                                    {guardiansError ? <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-600">{guardiansError}</div> : null}
                                    {guardiansStatus ? <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">{guardiansStatus}</div> : null}

                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-5 shadow-sm">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div>
                                                <h3 className="text-base font-bold text-slate-800">Pagador da mensalidade</h3>
                                                <p className="mt-1 text-sm text-slate-600">Defina aqui quem responde pela mensalidade do aluno. Esta informação é enviada ao Financeiro para que os títulos sejam emitidos no pagador correto.</p>
                                            </div>
                                            <div className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 shadow-sm">
                                                Integração futura
                                            </div>
                                        </div>

                                        {studentFieldAccess.financial ? (
                                            <div className="mt-5 space-y-4">
                                                <div className="grid gap-4 md:grid-cols-2">
                                                    <div>
                                                        <label className={labelClass}>Quem paga a mensalidade?</label>
                                                        <select
                                                            value={formData.billingPayerType}
                                                            onChange={(event) => setFormData((current) => ({
                                                                ...current,
                                                                billingPayerType: event.target.value as BillingPayerType,
                                                                billingGuardianId: event.target.value === 'RESPONSAVEL' ? current.billingGuardianId : '',
                                                            }))}
                                                            className={inputClass}
                                                            disabled={!canManageStudents || isLoadingGuardians || isUpdatingGuardians}
                                                        >
                                                            <option value="ALUNO">O próprio aluno</option>
                                                            <option value="RESPONSAVEL" disabled={!studentGuardians.length}>Um responsável vinculado</option>
                                                        </select>
                                                        {!editingStudentId ? <div className="mt-2 text-xs font-medium text-slate-500">Salve o aluno primeiro para depois vincular e selecionar um responsável pagador.</div> : null}
                                                    </div>
                                                </div>

                                                {formData.billingPayerType === 'RESPONSAVEL' ? (
                                                    <div>
                                                        <label className={labelClass}>Responsável pagador *</label>
                                                        <select
                                                            value={formData.billingGuardianId}
                                                            onChange={(event) => setFormData((current) => ({
                                                                ...current,
                                                                billingGuardianId: event.target.value,
                                                            }))}
                                                            className={inputClass}
                                                            disabled={!canManageStudents || isLoadingGuardians || isUpdatingGuardians || !studentGuardians.length}
                                                        >
                                                            <option value="">SELECIONE O RESPONSÁVEL</option>
                                                            {studentGuardians.map((link) => (
                                                                <option key={link.id} value={link.guardian?.id || ''} disabled={!link.guardian?.id}>
                                                                    {link.guardian ? getGuardianComboLabel(link.guardian) : 'RESPONSÁVEL SEM CADASTRO'}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {!studentGuardians.length ? <div className="mt-2 text-xs font-medium text-amber-700">Antes de definir o pagador, vincule pelo menos um responsável a este aluno.</div> : null}
                                                    </div>
                                                ) : (
                                                    <div className="rounded-xl border border-dashed border-emerald-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600">
                                                        Os boletos e demais cobranças do Financeiro serão emitidos no nome definido aqui.
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-700">
                                                Seu perfil não possui autorização para definir quem paga a mensalidade deste aluno.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : null}
                            {activeTab === 6 ? (
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
                            {activeTab === 7 ? (
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
                            {activeTab === 8 ? (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <h4 className="text-xs uppercase tracking-wider font-bold text-blue-800 pb-2 border-b border-blue-50">Filiais de Acesso</h4>
                                    <div className="grid grid-cols-1 gap-5 max-w-4xl mx-auto mt-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
                                        <TenantBranchSelect
                                            branches={tenantBranches}
                                            value={formData.branchCode}
                                            onChange={(branchCode) => setFormData((current) => ({ ...current, branchCode }))}
                                            mode="multiple"
                                            selectedBranchCodes={formData.branchAccessCodes}
                                            onSelectedBranchCodesChange={(branchAccessCodes) => setFormData((current) => ({ ...current, branchAccessCodes }))}
                                            labelClassName={labelClass}
                                            selectClassName={`${inputClass} bg-white`}
                                        />
                                    </div>
                                </div>
                            ) : null}

                            <div className="sticky bottom-0 -mx-6 mt-8 border-t border-slate-100 bg-white/95 px-6 py-5 backdrop-blur-sm">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <button type="button" onClick={closeModal} className="rounded-xl border border-rose-200 bg-rose-50 px-6 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100">Sair sem Gravar</button>
                                    <button type="submit" className="rounded-xl bg-green-600 px-8 py-3 text-sm font-bold text-white hover:bg-green-700">{editingStudentId ? 'Salvar' : 'Registrar aluno'}</button>
                                </div>
                                <div className="mt-3 flex justify-end">
                                    <ScreenNameCopy screenId="PRINCIPAL_ALUNOS_POPUP_EDITAR_ALUNO" className="mt-0" />
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {saveSuccessPopup ? (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl">
                        <div className="border-b border-emerald-100 bg-emerald-50 px-6 py-5">
                            <div className="flex items-start gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
                                    {currentTenantBranding?.logoUrl ? (
                                        <img src={currentTenantBranding.logoUrl} alt={currentTenantBranding.schoolName || 'Escola'} className="h-full w-full object-contain" />
                                    ) : (
                                        <span className="text-sm font-black tracking-[0.25em] text-[#153a6a]">
                                            {String(currentTenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">SUCESSO</div>
                                    <h3 className="mt-1 text-xl font-bold text-slate-900">{saveSuccessPopup.title}</h3>
                                    <p className="mt-2 text-sm font-medium text-slate-600">{saveSuccessPopup.message}</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end px-6 py-4">
                            <button
                                type="button"
                                onClick={() => setSaveSuccessPopup(null)}
                                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
                            >
                                Voltar para lista
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {isGuardiansViewOpen ? (
                <div className="fixed inset-0 z-[57] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
                            <div className="flex min-w-0 items-center gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                    {currentTenantBranding?.logoUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
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
                                    <h2 className="text-xl font-bold text-[#153a6a]">Responsáveis do aluno</h2>
                                    <p className="mt-1 text-sm font-medium text-slate-500">{guardiansViewStudentName}</p>
                                </div>
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
                                                    <div>Dados de contato ocultos nesta tela.</div>
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
                            <div className="flex min-w-0 items-center gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                    {currentTenantBranding?.logoUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
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
                                    <h2 className="text-xl font-bold text-[#153a6a]">Dados do responsável</h2>
                                    <p className="mt-1 text-sm font-medium text-slate-500">{selectedGuardianDetails.name}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedGuardianDetails(null)} className="text-slate-400 hover:text-red-500">×</button>
                        </div>
                        <div className="grid gap-6 p-6 md:grid-cols-2">
                            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <h3 className="text-sm font-bold text-slate-800">Dados gerais</h3>
                                <div className="text-sm text-slate-600">RG: {selectedGuardianDetails.rg || 'Não informado'}</div>
                                <div className="text-sm text-slate-600">Nascimento: {selectedGuardianDetails.birthDate ? new Date(selectedGuardianDetails.birthDate).toLocaleDateString() : 'Não informado'}</div>
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

            {emailUsageAlert ? (
                <div className="fixed inset-0 z-[59] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
                    <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-amber-200">
                        <div className="border-b border-amber-100 bg-amber-50 px-6 py-5">
                            <div className="flex items-start gap-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
                                    {currentTenantBranding?.logoUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={currentTenantBranding.logoUrl} alt={currentTenantBranding.schoolName} className="h-full w-full object-contain" />
                                    ) : (
                                        <span className="text-xs font-black uppercase tracking-[0.18em] text-[#153a6a]">
                                            {String(currentTenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                        </span>
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
                        </div>
                        <div className="max-h-[42vh] overflow-y-auto p-6">
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
                                    screenId="PRINCIPAL_ALUNOS_POPUP_EMAIL_USAGE_ALERT"
                                    label="Tela"
                                    className="mt-0 justify-end"
                                    disableMargin
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

            {cpfConflictAlert ? (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-2xl">
                        <div className="flex items-start gap-4">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                                {currentTenantBranding?.logoUrl ? (
                                    <img src={currentTenantBranding.logoUrl} alt={currentTenantBranding.schoolName} className="h-full w-full object-contain" />
                                ) : (
                                    <span className="text-xs font-black tracking-[0.2em] text-[#153a6a]">
                                        {String(currentTenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="mb-2 flex items-center gap-2 text-lg font-bold text-slate-800">
                                    <svg className="h-5 w-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86l-8.2 14.22A2 2 0 003.82 21h16.36a2 2 0 001.73-2.92L13.71 3.86a2 2 0 00-3.42 0z" />
                                    </svg>
                                    ATENÇÃO
                                </div>
                                <div className="text-sm font-semibold text-slate-700">
                                    CPF JÁ USADO POR:
                                </div>
                                <div className="mt-1 text-base font-bold text-slate-900">
                                    {cpfConflictAlert.name}
                                </div>
                                <div className="mt-1 text-sm font-medium text-slate-600">
                                    CPF INFORMADO: {cpfConflictAlert.cpf}
                                </div>
                                {cpfConflictRoles.length > 0 ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {cpfConflictRoles.map((role) => (
                                            <span
                                                key={role}
                                                className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700"
                                            >
                                                {role}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                                    RECOMENDAMOS DEIXAR O CPF EM BRANCO QUANDO FOREM PESSOAS DIFERENTES, PARA EVITAR CONFLITO NO SISTEMA.
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <div className="w-full max-w-[300px]">
                                <ScreenNameCopy
                                    screenId={CPF_CONFLICT_SCREEN_ID}
                                    label="Tela"
                                    className="mt-0 justify-end"
                                    disableMargin
                                />
                            </div>
                        </div>
                        <div className="mt-5 text-right">
                            <button
                                type="button"
                                onClick={() => {
                                    setCpfConflictAlert(null);
                                    setCpfConflictRoles([]);
                                }}
                                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            ) : saveError ? (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center gap-4 border-b border-slate-100 bg-slate-50 px-6 py-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                {currentTenantBranding?.logoUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={currentTenantBranding.logoUrl} alt={currentTenantBranding.schoolName} className="h-full w-full object-contain" />
                                ) : (
                                    <span className="text-xs font-black tracking-[0.2em] text-[#153a6a]">
                                        {String(currentTenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <div>
                                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-700">Atenção</div>
                                <div className="mt-1 text-lg font-bold text-slate-800">Não foi possível salvar</div>
                            </div>
                        </div>
                        <div className="px-6 py-5 text-sm font-medium text-red-600">{saveError}</div>
                        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 text-right">
                            <button onClick={() => setSaveError(null)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">Fechar</button>
                        </div>
                    </div>
                </div>
            ) : null}
            </div>
        </div>
    );
}

