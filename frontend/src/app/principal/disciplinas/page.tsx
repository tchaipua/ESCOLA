'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import GridColumnFilterHeader from '@/app/components/grid-column-filter-header';
import GridColumnConfigModal from '@/app/components/grid-column-config-modal';
import GridExportModal from '@/app/components/grid-export-modal';
import GridStandardFooter from '@/app/components/grid-standard-footer';
import PrincipalProgramHeader from '@/app/components/principal-program-header';
import GridRecordPopover from '@/app/components/grid-record-popover';
import GridRowActionIconButton from '@/app/components/grid-row-action-icon-button';
import StatusConfirmationModal from '@/app/components/status-confirmation-modal';
import { type GridStatusFilterValue } from '@/app/components/grid-status-filter';
import { TenantBranchSelect } from '@/app/components/tenant-branch-select';
import { getStoredToken } from '@/app/lib/auth-storage';
import { fetchTenantBranches, getDashboardAuthContext, hasAllDashboardPermissions, hasDashboardPermission, type TenantBranchSummary } from '@/app/lib/dashboard-crud-utils';
import { getAllGridColumnKeys, getDefaultVisibleGridColumnKeys, loadGridColumnConfig, type ConfigurableGridColumn, writeGridColumnConfig } from '@/app/lib/grid-column-config-utils';
import { buildDefaultExportColumns, buildExportColumnsFromGridColumns, exportGridRows, sortGridRows, type GridColumnDefinition, type GridSortState } from '@/app/lib/grid-export-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import { dispatchScreenAuditContext, formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

type Subject = {
    id: string;
    name: string;
    branchCode?: number | null;
    canceledAt?: string | null;
};

type TeacherSubjectAssignment = {
    id: string;
    subjectId: string;
    hourlyRate?: number | null;
};

type Teacher = {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    teacherSubjects: TeacherSubjectAssignment[];
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const DISCIPLINAS_SCREEN_ID = 'PRINCIPAL_DISCIPLINAS';
const DISCIPLINAS_STATUS_MODAL_SCREEN_ID = 'PRINCIPAL_DISCIPLINAS_STATUS_MODAL';

type SubjectColumnKey = 'name' | 'recordStatus';
type SubjectExportColumnKey = SubjectColumnKey;
type SubjectColumnFilters = Record<SubjectColumnKey, string>;

const SUBJECT_COLUMNS: ConfigurableGridColumn<Subject, SubjectColumnKey>[] = [
    { key: 'name', label: 'Disciplina', getValue: (row) => row.name || '---', visibleByDefault: true },
    { key: 'recordStatus', label: 'Status do cadastro', getValue: (row) => row.canceledAt ? 'INATIVO' : 'ATIVO', visibleByDefault: false },
];
const SUBJECT_GRID_COLUMNS = SUBJECT_COLUMNS.filter((column) => column.key !== 'recordStatus');
const SUBJECT_EXPORT_COLUMNS: GridColumnDefinition<Subject, SubjectExportColumnKey>[] = buildExportColumnsFromGridColumns(
    SUBJECT_COLUMNS,
);
const SUBJECT_COLUMN_KEYS = getAllGridColumnKeys(SUBJECT_COLUMNS);
const SUBJECT_GRID_COLUMN_KEYS = getAllGridColumnKeys(SUBJECT_GRID_COLUMNS);
const DEFAULT_VISIBLE_SUBJECT_GRID_COLUMNS = getDefaultVisibleGridColumnKeys(SUBJECT_GRID_COLUMNS);
const EMPTY_SUBJECT_COLUMN_FILTERS = SUBJECT_COLUMN_KEYS.reduce<SubjectColumnFilters>((accumulator, key) => {
    accumulator[key] = '';
    return accumulator;
}, {} as SubjectColumnFilters);

function normalizeSubjectGridFilterValue(value: unknown) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
}

function normalizeSubjectGridDigits(value: unknown) {
    return String(value ?? '').replace(/\D/g, '');
}

function matchesSubjectGridFilter(values: unknown[], filter: string) {
    const normalizedFilter = normalizeSubjectGridFilterValue(filter);
    const filterDigits = normalizeSubjectGridDigits(filter);

    if (!normalizedFilter) {
        return true;
    }

    return values.some((value) => {
        const normalizedValue = normalizeSubjectGridFilterValue(value);

        if (normalizedValue.includes(normalizedFilter)) {
            return true;
        }

        return Boolean(filterDigits && normalizeSubjectGridDigits(value).includes(filterDigits));
    });
}

function getSubjectColumnFilterValues(row: Subject, columnKey: SubjectColumnKey) {
    const column = SUBJECT_COLUMNS.find((item) => item.key === columnKey);
    const baseValue = column?.getValue(row) || '';
    return [baseValue, row.name, row.canceledAt ? 'INATIVO' : 'ATIVO'];
}

function getSubjectGridConfigStorageKey(tenantId: string | null) {
    return `dashboard:disciplinas:grid-config:${tenantId || 'default'}`;
}

function getSubjectExportConfigStorageKey(tenantId: string | null) {
    return `dashboard:disciplinas:export-config:${tenantId || 'default'}`;
}

const DEFAULT_SORT: GridSortState<SubjectColumnKey> = {
    column: 'name',
    direction: 'asc',
};

type DisciplinasAuditParams = {
    tenantId: string | null;
    tenantName?: string | null;
    searchTerm: string;
    statusFilter: GridStatusFilterValue;
    displayedRowsCount: number;
    sortColumn: SubjectColumnKey;
    sortDirection: 'asc' | 'desc';
};

function getDisciplinasAuditOrderBy(column: SubjectColumnKey) {
    const orderColumns: Record<SubjectColumnKey, string> = {
        name: 'S.name',
        recordStatus: 'S.canceledAt',
    };

    return orderColumns[column] || 'S.name';
}

function buildDisciplinasAuditSql(params: DisciplinasAuditParams) {
    const searchTerm = params.searchTerm.trim().toUpperCase();
    const statusFilter = String(params.statusFilter || 'ACTIVE').toUpperCase();
    const sortDirection = params.sortDirection === 'desc' ? 'DESC' : 'ASC';

    return `-- PARAMETROS ATUAIS DO GRID
-- :schoolId = ${toSqlLiteral(params.tenantId || '')}
-- :searchTerm = ${toSqlLiteral(searchTerm)}
-- :statusFilter = ${toSqlLiteral(statusFilter)}

SELECT S.*
FROM subjects S
WHERE S.tenantId = ${toSqlLiteral(params.tenantId || '')}
  AND (
    ${toSqlLiteral(searchTerm)} = ''
    OR UPPER(COALESCE(S.name, '')) LIKE '%' || UPPER(${toSqlLiteral(searchTerm)}) || '%'
  )
  AND (
    ${toSqlLiteral(statusFilter)} = 'ALL'
    OR (${toSqlLiteral(statusFilter)} = 'ACTIVE' AND S.canceledAt IS NULL)
    OR (${toSqlLiteral(statusFilter)} = 'INACTIVE' AND S.canceledAt IS NOT NULL)
  )
ORDER BY ${getDisciplinasAuditOrderBy(params.sortColumn)} ${sortDirection};`;
}

function buildDisciplinasAuditText(params: DisciplinasAuditParams) {
    const searchTerm = params.searchTerm.trim().toUpperCase();
    const statusFilter = String(params.statusFilter || 'ACTIVE').toUpperCase();
    const sortDirection = params.sortDirection === 'desc' ? 'DESC' : 'ASC';

    return `--- LOGICA DA TELA ---
Tela de grid/listagem administrativa para manutencao do cadastro de disciplinas.

TABELAS PRINCIPAIS:
- subjects (S) - cadastro de disciplinas da escola

RELACIONAMENTOS:
- Nao ha relacionamento obrigatorio para a listagem principal.

FILTROS APLICADOS AGORA:
- escola/tenant atual (:schoolId): ${formatTenantAuditValue(params.tenantId, params.tenantName)}
- busca digitada (:searchTerm): ${formatAuditValue(searchTerm)}
- status selecionado (:statusFilter): ${statusFilter}
- registros exibidos apos os filtros: ${params.displayedRowsCount}
- ordenacao atual: ${getDisciplinasAuditOrderBy(params.sortColumn)} ${sortDirection}

OBSERVACAO SOBRE O FILTRO DA EMPRESA / ESCOLA:
- S.tenantId e a coluna usada para isolar os dados da empresa / escola
- :schoolId acima ja esta preenchido com o tenantId real da escola logada
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

function normalizeText(value: string) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

function scoreSimilarity(query: string, candidate: string) {
    const normalizedQuery = normalizeText(query);
    const normalizedCandidate = normalizeText(candidate);
    if (!normalizedQuery || !normalizedCandidate) return 0;
    if (normalizedCandidate === normalizedQuery) return 120;
    if (normalizedCandidate.startsWith(normalizedQuery)) return 110;
    if (normalizedCandidate.includes(normalizedQuery)) return 100;
    const queryTokens = normalizedQuery.split(' ').filter(Boolean);
    const candidateTokens = normalizedCandidate.split(' ').filter(Boolean);
    if (
        queryTokens.length > 0 &&
        queryTokens.every((token) => candidateTokens.some((candidateToken) => candidateToken.includes(token)))
    ) {
        return 90;
    }
    const compactQuery = normalizedQuery.replace(/\s+/g, '');
    const compactCandidate = normalizedCandidate.replace(/\s+/g, '');
    if (compactQuery.length >= 3 && compactCandidate.includes(compactQuery)) {
        return 80;
    }
    return 0;
}

export default function DisciplinasPage() {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingSubject, setIsSavingSubject] = useState(false);
    const [subjectName, setSubjectName] = useState('');
    const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [successStatus, setSuccessStatus] = useState<string | null>(null);
    const [saveSuccessPopup, setSaveSuccessPopup] = useState<{ title: string; message: string } | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSubjectForTeachers, setSelectedSubjectForTeachers] = useState<Subject | null>(null);
    const [sortState, setSortState] = useState<GridSortState<SubjectColumnKey>>(DEFAULT_SORT);
    const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
    const [isGridConfigOpen, setIsGridConfigOpen] = useState(false);
    const [isGridConfigReady, setIsGridConfigReady] = useState(false);
    const [columnOrder, setColumnOrder] = useState<SubjectColumnKey[]>(SUBJECT_GRID_COLUMN_KEYS);
    const [hiddenColumns, setHiddenColumns] = useState<SubjectColumnKey[]>(
        SUBJECT_GRID_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_SUBJECT_GRID_COLUMNS.includes(key)),
    );
    const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
    const [subjectColumnFilters, setSubjectColumnFilters] = useState<SubjectColumnFilters>(EMPTY_SUBJECT_COLUMN_FILTERS);
    const [subjectColumnFilterDrafts, setSubjectColumnFilterDrafts] = useState<SubjectColumnFilters>(EMPTY_SUBJECT_COLUMN_FILTERS);
    const [activeSubjectFilterColumn, setActiveSubjectFilterColumn] = useState<SubjectColumnKey | null>(null);
    const [subjectPageSize, setSubjectPageSize] = useState(10);
    const [subjectPage, setSubjectPage] = useState(1);
    const [selectedSubjectGridRowId, setSelectedSubjectGridRowId] = useState<string | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFormat, setExportFormat] = useState<'excel' | 'csv' | 'pdf' | 'json' | 'txt'>('excel');
    const [exportColumns, setExportColumns] = useState<Record<SubjectExportColumnKey, boolean>>(buildDefaultExportColumns(SUBJECT_EXPORT_COLUMNS));
    const [toggleModalSubject, setToggleModalSubject] = useState<Subject | null>(null);
    const [toggleModalAction, setToggleModalAction] = useState<'activate' | 'deactivate' | null>(null);
    const [isProcessingToggle, setIsProcessingToggle] = useState(false);
    const [nameSuggestions, setNameSuggestions] = useState<Array<{ name: string; active: boolean }>>([]);
    const [showNameSuggestions, setShowNameSuggestions] = useState(false);
    const [isLoadingNameSuggestions, setIsLoadingNameSuggestions] = useState(false);
    const [nameSuggestionError, setNameSuggestionError] = useState<string | null>(null);
    const [debouncedSubjectNameQuery, setDebouncedSubjectNameQuery] = useState('');
    const [currentBranchCode, setCurrentBranchCode] = useState(1);
    const [tenantBranches, setTenantBranches] = useState<TenantBranchSummary[]>([]);
    const [subjectBranchCode, setSubjectBranchCode] = useState(1);

    const canView = hasAllDashboardPermissions(currentRole, currentPermissions, ['VIEW_SUBJECTS', 'VIEW_TEACHERS']);
    const canManage = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_SUBJECTS');
    const orderedSubjectColumns = useMemo(
        () => columnOrder.map((key) => SUBJECT_GRID_COLUMNS.find((column) => column.key === key)).filter((column): column is ConfigurableGridColumn<Subject, SubjectColumnKey> => !!column),
        [columnOrder],
    );
    const visibleSubjectColumns = useMemo(
        () => orderedSubjectColumns.filter((column) => !hiddenColumns.includes(column.key)),
        [hiddenColumns, orderedSubjectColumns],
    );
    const currentTenantBranding = useMemo(
        () => readCachedTenantBranding(currentTenantId),
        [currentTenantId],
    );

    const loadData = async () => {
        try {
            setIsLoading(true);
            setErrorStatus(null);
            const { token, role, permissions, tenantId, branchCode } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            setCurrentRole(role);
            setCurrentPermissions(permissions);
            setCurrentTenantId(tenantId);
            setCurrentBranchCode(branchCode);

            const [subjectsResponse, teachersResponse, branches] = await Promise.all([
                fetch(`${API_BASE_URL}/subjects`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_BASE_URL}/teachers`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetchTenantBranches().catch(() => []),
            ]);

            if (!subjectsResponse.ok) {
                const errData = await subjectsResponse.json().catch(() => null);
                throw new Error(errData?.message || 'Falha ao carregar disciplinas.');
            }

            if (!teachersResponse.ok) {
                const errData = await teachersResponse.json().catch(() => null);
                throw new Error(errData?.message || 'Falha ao carregar professores.');
            }

            const [subjectsData, teachersData] = await Promise.all([
                subjectsResponse.json(),
                teachersResponse.json(),
            ]);

            setSubjects(Array.isArray(subjectsData) ? subjectsData : []);
            setTeachers(Array.isArray(teachersData) ? teachersData : []);
            setTenantBranches(branches);
            setSelectedSubjectForTeachers((current) => {
                if (!current) return null;
                return subjectsData.find((subject: Subject) => subject.id === current.id) || null;
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Não foi possível carregar a tela de disciplinas.';
            setErrorStatus(message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

    useEffect(() => {
        let isMounted = true;
        setIsGridConfigReady(false);
        void loadGridColumnConfig(getSubjectGridConfigStorageKey(currentTenantId), SUBJECT_GRID_COLUMN_KEYS, DEFAULT_VISIBLE_SUBJECT_GRID_COLUMNS).then((config) => {
            if (!isMounted) return;
            setColumnOrder(config.order.filter((key) => SUBJECT_GRID_COLUMN_KEYS.includes(key)));
            setHiddenColumns(config.hidden.filter((key) => SUBJECT_GRID_COLUMN_KEYS.includes(key)));
            setIsGridConfigReady(true);
        });
        return () => {
            isMounted = false;
        };
    }, [currentTenantId]);

    useEffect(() => {
        if (!isGridConfigReady) return;
        writeGridColumnConfig(getSubjectGridConfigStorageKey(currentTenantId), SUBJECT_GRID_COLUMN_KEYS, columnOrder, hiddenColumns);
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
        if (!isModalOpen || !!editingSubjectId) {
            setDebouncedSubjectNameQuery('');
            setShowNameSuggestions(false);
            setIsLoadingNameSuggestions(false);
            setNameSuggestions([]);
            setNameSuggestionError(null);
            return;
        }

        const trimmed = subjectName.trim();
        if (trimmed.length < 2) {
            setDebouncedSubjectNameQuery('');
            setShowNameSuggestions(false);
            setIsLoadingNameSuggestions(false);
            setNameSuggestions([]);
            setNameSuggestionError(null);
            return;
        }

        const timer = window.setTimeout(() => {
            setDebouncedSubjectNameQuery(trimmed);
        }, 260);

        return () => window.clearTimeout(timer);
    }, [subjectName, editingSubjectId, isModalOpen]);

    useEffect(() => {
        if (!isModalOpen || !!editingSubjectId || !debouncedSubjectNameQuery) {
            return;
        }

        setIsLoadingNameSuggestions(true);
        setShowNameSuggestions(true);
        setNameSuggestionError(null);

        const normalizedQuery = normalizeText(debouncedSubjectNameQuery);
        const matches = subjects
            .map((subject) => ({
                name: subject.name,
                active: !subject.canceledAt,
                score: scoreSimilarity(normalizedQuery, subject.name),
            }))
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8)
            .map(({ score, ...rest }) => rest);

        setNameSuggestions(matches);
        setIsLoadingNameSuggestions(false);
    }, [debouncedSubjectNameQuery, editingSubjectId, isModalOpen, subjects]);

    const filteredSubjects = useMemo(() => {
        const term = searchTerm.trim().toUpperCase();
        const activeColumnFilters = (Object.entries(subjectColumnFilters) as Array<[SubjectColumnKey, string]>)
            .filter(([, value]) => value.trim());

        return subjects.filter((subject) => {
            const isActive = !subject.canceledAt;
            const matchesStatus =
                statusFilter === 'ALL'
                    ? true
                    : statusFilter === 'ACTIVE'
                        ? isActive
                        : !isActive;
            const matchesSearch = !term || subject.name.toUpperCase().includes(term);
            const matchesColumnFilters = activeColumnFilters.every(([columnKey, filter]) =>
                matchesSubjectGridFilter(getSubjectColumnFilterValues(subject, columnKey), filter),
            );
            return matchesStatus && matchesSearch && matchesColumnFilters;
        });
    }, [searchTerm, statusFilter, subjectColumnFilters, subjects]);
    const sortedFilteredSubjects = useMemo(
        () =>
            sortGridRows(
                filteredSubjects,
                SUBJECT_COLUMNS,
                sortState,
            ),
        [filteredSubjects, sortState],
    );
    const subjectTotalPages = Math.max(1, Math.ceil(sortedFilteredSubjects.length / subjectPageSize));
    const currentSubjectPage = Math.min(Math.max(subjectPage, 1), subjectTotalPages);
    const paginatedSubjects = useMemo(() => {
        const startIndex = (currentSubjectPage - 1) * subjectPageSize;
        return sortedFilteredSubjects.slice(startIndex, startIndex + subjectPageSize);
    }, [currentSubjectPage, subjectPageSize, sortedFilteredSubjects]);
    const hasSubjectGridFilters = useMemo(
        () =>
            Boolean(searchTerm.trim())
            || statusFilter !== 'ACTIVE'
            || sortState.column !== DEFAULT_SORT.column
            || sortState.direction !== DEFAULT_SORT.direction
            || Object.values(subjectColumnFilters).some((value) => value.trim()),
        [searchTerm, sortState.column, sortState.direction, statusFilter, subjectColumnFilters],
    );
    const disciplinasAuditContext = useMemo(() => {
        const auditParams: DisciplinasAuditParams = {
            tenantId: currentTenantId,
            tenantName: currentTenantBranding?.schoolName,
            searchTerm,
            statusFilter,
            displayedRowsCount: sortedFilteredSubjects.length,
            sortColumn: sortState.column,
            sortDirection: sortState.direction,
        };

        return {
            auditText: buildDisciplinasAuditText(auditParams),
            sqlText: buildDisciplinasAuditSql(auditParams),
        };
    }, [currentTenantBranding?.schoolName, currentTenantId, searchTerm, sortState.column, sortState.direction, sortedFilteredSubjects.length, statusFilter]);

    useEffect(() => {
        dispatchScreenAuditContext({
            screenId: DISCIPLINAS_SCREEN_ID,
            auditText: disciplinasAuditContext.auditText,
            sqlText: disciplinasAuditContext.sqlText,
        });
    }, [disciplinasAuditContext]);

    useEffect(() => {
        setSubjectPage(1);
    }, [searchTerm, sortState.column, sortState.direction, statusFilter, subjectColumnFilters, subjectPageSize]);

    useEffect(() => {
        setSubjectPage((current) => Math.min(Math.max(current, 1), subjectTotalPages));
    }, [subjectTotalPages]);

    const openCreateModal = () => {
        setEditingSubjectId(null);
        setSubjectName('');
        setSubjectBranchCode(currentBranchCode);
        setNameSuggestions([]);
        setShowNameSuggestions(false);
        setIsLoadingNameSuggestions(false);
        setNameSuggestionError(null);
        setDebouncedSubjectNameQuery('');
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingSubjectId(null);
        setSubjectName('');
        setSubjectBranchCode(currentBranchCode);
        setNameSuggestions([]);
        setShowNameSuggestions(false);
        setIsLoadingNameSuggestions(false);
        setNameSuggestionError(null);
        setDebouncedSubjectNameQuery('');
    };

    const getTeachersForSubject = (subjectId: string) => (
        teachers.filter((teacher) =>
            teacher.teacherSubjects.some((assignment) => assignment.subjectId === subjectId),
        )
    );

    const renderSubjectInfoButton = (subject: Subject) => {
        const linkedTeachers = getTeachersForSubject(subject.id);
        return (
            <GridRecordPopover
                title={subject.name}
                subtitle={subject.canceledAt ? 'Disciplina inativa' : 'Disciplina ativa'}
                buttonLabel={`Ver detalhes da disciplina ${subject.name}`}
                badges={[
                    subject.canceledAt ? 'INATIVA' : 'ATIVA',
                    `${linkedTeachers.length} DOCENTE(S)`,
                ]}
                sections={[
                    {
                        title: 'Cadastro',
                        items: [
                            { label: 'Disciplina', value: subject.name || 'Não informada' },
                            { label: 'Status', value: subject.canceledAt ? 'INATIVA' : 'ATIVA' },
                            { label: 'Professores vinculados', value: String(linkedTeachers.length) },
                            { label: 'ID da disciplina', value: subject.id || 'Não informado' },
                        ],
                    },
                    {
                        title: 'Equipe',
                        items: linkedTeachers.length > 0
                            ? linkedTeachers.map((teacher) => ({
                                label: teacher.name,
                                value: [teacher.email, teacher.whatsapp, teacher.phone].filter(Boolean).join(' | ') || 'Sem contato informado',
                            }))
                            : [{ label: 'Professores', value: 'Nenhum professor vinculado a esta disciplina' }],
                    },
            ]}
            contextLabel="PRINCIPAL_DISCIPLINAS_POPUP"
        />
        );
    };

    const teachersForSelectedSubject = selectedSubjectForTeachers
        ? getTeachersForSubject(selectedSubjectForTeachers.id)
        : [];

    const handleSaveSubject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canManage) return;

        const normalizedName = subjectName.trim().toUpperCase();
        if (!normalizedName) {
            setErrorStatus('Informe o nome da disciplina.');
            return;
        }

        const alreadyExists = subjects.some((subject) => subject.name === normalizedName && subject.id !== editingSubjectId);
        if (alreadyExists) {
            setErrorStatus('Esta disciplina já está cadastrada nesta escola.');
            return;
        }

        try {
            setIsSavingSubject(true);
            setErrorStatus(null);
            const token = getStoredToken();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const url = editingSubjectId
                ? `${API_BASE_URL}/subjects/${editingSubjectId}`
                : `${API_BASE_URL}/subjects`;
            const method = editingSubjectId ? 'PATCH' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    name: normalizedName,
                    branchCode: tenantBranches.length <= 1 ? currentBranchCode : subjectBranchCode,
                }),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Falha ao salvar disciplina.');
            }

            const wasEditing = Boolean(editingSubjectId);
            closeModal();
            await loadData();
            setSaveSuccessPopup({
                title: wasEditing ? 'Disciplina salva com sucesso' : 'Disciplina inserida com sucesso',
                message: wasEditing ? 'A disciplina foi alterada e a lista já foi atualizada.' : 'A disciplina foi inserida e a lista já foi atualizada.',
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Falha ao salvar disciplina.';
            setErrorStatus(message);
        } finally {
            setIsSavingSubject(false);
        }
    };

    const handleEditSubject = (subject: Subject) => {
        if (!canManage) return;
        setSubjectName(subject.name);
        setSubjectBranchCode(typeof subject.branchCode === 'number' ? subject.branchCode : currentBranchCode);
        setEditingSubjectId(subject.id);
        setNameSuggestions([]);
        setShowNameSuggestions(false);
        setIsLoadingNameSuggestions(false);
        setNameSuggestionError(null);
        setDebouncedSubjectNameQuery('');
        setIsModalOpen(true);
    };

    const handleSubjectNameChange = (value: string) => {
        setSubjectName(value.toUpperCase());
        if (!editingSubjectId) {
            setShowNameSuggestions(value.trim().length >= 2);
        }
    };

    const handleToggleSubjectStatus = (subject: Subject) => {
        if (!canManage || isProcessingToggle) return;
        setToggleModalSubject(subject);
        setToggleModalAction(subject.canceledAt ? 'activate' : 'deactivate');
    };

    const closeToggleModal = (force = false) => {
        if (!force && isProcessingToggle) return;
        setToggleModalSubject(null);
        setToggleModalAction(null);
    };

    const confirmToggleSubjectStatus = async () => {
        if (!toggleModalSubject || !toggleModalAction) return;
        const willActivate = toggleModalAction === 'activate';

        try {
            setIsProcessingToggle(true);
            setErrorStatus(null);
            const token = getStoredToken();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const response = await fetch(`${API_BASE_URL}/subjects/${toggleModalSubject.id}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ active: willActivate }),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || (willActivate ? 'Falha ao ativar disciplina.' : 'Falha ao inativar disciplina.'));
            }

            setSuccessStatus(data?.message || (willActivate ? 'Disciplina ativada com sucesso.' : 'Disciplina inativada com sucesso.'));
            if (editingSubjectId === toggleModalSubject.id) {
                closeModal();
            }
            await loadData();
            closeToggleModal(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : (willActivate ? 'Falha ao ativar disciplina.' : 'Falha ao inativar disciplina.');
            setErrorStatus(message);
        } finally {
            setIsProcessingToggle(false);
        }
    };

    const toggleExportColumn = (column: SubjectExportColumnKey) => {
        setExportColumns((current) => ({ ...current, [column]: !current[column] }));
    };

    const setAllExportColumns = (value: boolean) => {
        setExportColumns(
            SUBJECT_EXPORT_COLUMNS.reduce<Record<SubjectExportColumnKey, boolean>>((accumulator, column) => {
                accumulator[column.key] = value;
                return accumulator;
            }, {} as Record<SubjectExportColumnKey, boolean>),
        );
    };

    const toggleGridColumnVisibility = (columnKey: SubjectColumnKey) => {
        const isHidden = hiddenColumns.includes(columnKey);
        const visibleCount = SUBJECT_GRID_COLUMN_KEYS.length - hiddenColumns.length;
        if (!isHidden && visibleCount === 1) {
            setErrorStatus('Pelo menos uma coluna precisa continuar visível no grid.');
            return;
        }
        setHiddenColumns((current) => isHidden ? current.filter((item) => item !== columnKey) : [...current, columnKey]);
    };

    const moveGridColumn = (columnKey: SubjectColumnKey, direction: 'up' | 'down') => {
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
        setColumnOrder(SUBJECT_GRID_COLUMN_KEYS);
        setHiddenColumns(SUBJECT_GRID_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_SUBJECT_GRID_COLUMNS.includes(key)));
    };

    const clearAllSubjectGridFilters = () => {
        setSearchTerm('');
        setStatusFilter('ACTIVE');
        setSortState(DEFAULT_SORT);
        setSubjectColumnFilters(EMPTY_SUBJECT_COLUMN_FILTERS);
        setSubjectColumnFilterDrafts(EMPTY_SUBJECT_COLUMN_FILTERS);
        setActiveSubjectFilterColumn(null);
        setSubjectPage(1);
    };

    const openSubjectColumnFilter = (columnKey: SubjectColumnKey | null) => {
        setActiveSubjectFilterColumn(columnKey);
        if (!columnKey) return;
        setSubjectColumnFilterDrafts((current) => ({
            ...current,
            [columnKey]: subjectColumnFilters[columnKey] || '',
        }));
    };

    const applySubjectColumnFilter = (columnKey: SubjectColumnKey) => {
        setSubjectColumnFilters((current) => ({
            ...current,
            [columnKey]: subjectColumnFilterDrafts[columnKey] || '',
        }));
        setActiveSubjectFilterColumn(null);
    };

    const clearSubjectColumnFilter = (columnKey: SubjectColumnKey) => {
        setSubjectColumnFilters((current) => ({ ...current, [columnKey]: '' }));
        setSubjectColumnFilterDrafts((current) => ({ ...current, [columnKey]: '' }));
        setActiveSubjectFilterColumn(null);
    };

    const renderSubjectClearAllButton = () => (
        <button
            type="button"
            onClick={clearAllSubjectGridFilters}
            title="Limpar todos os filtros"
            aria-label="Limpar todos os filtros"
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
                hasSubjectGridFilters
                    ? 'border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100'
                    : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
            }`}
        >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 7h14M10 11v6m4-6v6M9 7V5h6v2m-9 0 1 14h10l1-14" />
            </svg>
        </button>
    );

    const renderSubjectColumnHeader = (column: ConfigurableGridColumn<Subject, SubjectColumnKey>) => (
        <GridColumnFilterHeader
            label={column.label}
            align={column.align}
            isOpen={activeSubjectFilterColumn === column.key}
            isActive={Boolean(subjectColumnFilters[column.key]?.trim()) || sortState.column === column.key}
            filterValue={subjectColumnFilterDrafts[column.key] || ''}
            onToggle={() => openSubjectColumnFilter(activeSubjectFilterColumn === column.key ? null : column.key)}
            onSort={(direction) => {
                setSortState({ column: column.key, direction });
                setActiveSubjectFilterColumn(null);
            }}
            onFilterValueChange={(value) =>
                setSubjectColumnFilterDrafts((current) => ({
                    ...current,
                    [column.key]: value,
                }))
            }
            onApply={() => applySubjectColumnFilter(column.key)}
            onClear={() => clearSubjectColumnFilter(column.key)}
        />
    );

    const renderSubjectGridCell = (subject: Subject, columnKey: SubjectColumnKey) => {
        if (columnKey === 'name') {
            const statusLabel = subject.canceledAt ? 'INATIVO' : 'ATIVO';
            return (
                <td key={columnKey} className={`px-6 py-4 font-semibold ${subject.canceledAt ? 'text-rose-800' : 'text-slate-800'}`}>
                    <div className="flex items-center gap-2">
                        <span
                            className={`h-3 w-3 shrink-0 rounded-full ${subject.canceledAt ? 'bg-rose-500' : 'bg-emerald-500'}`}
                            title={statusLabel}
                            aria-label={statusLabel}
                        />
                        <span>{subject.name}</span>
                    </div>
                </td>
            );
        }

        const statusLabel = subject.canceledAt ? 'INATIVO' : 'ATIVO';

        return (
            <td key={columnKey} className="px-6 py-4 text-center">
                <span
                    className={`inline-flex h-3 w-3 rounded-full ${subject.canceledAt ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    title={statusLabel}
                    aria-label={statusLabel}
                />
            </td>
        );
    };

    if (!isLoading && !canView) {
        return (
            <DashboardAccessDenied
                title="Acesso restrito às disciplinas"
                message="Seu perfil não possui permissão para consultar a grade de disciplinas e os professores vinculados desta escola."
            />
        );
    }

    return (
        <div className="flex min-h-[calc(100vh-12rem)] w-full pt-0">
            <div className="flex w-full flex-col bg-transparent">
                <PrincipalProgramHeader
                    eyebrow="Central curricular"
                    title="Cadastro de disciplinas"
                    description="Cadastre as disciplinas e consulte os professores vinculados."
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

                <div className="w-full space-y-8">
                    {errorStatus ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                            {errorStatus}
                        </div>
                    ) : null}

                    {successStatus ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                            {successStatus}
                        </div>
                    ) : null}

                    <section className="mt-6 flex h-[calc(100vh-17rem)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="dashboard-band shrink-0 border-b px-6 py-4">
                            <div className="flex flex-wrap items-center gap-3">
                                {canManage ? (
                                    <button
                                        type="button"
                                        onClick={openCreateModal}
                                        title="Cadastrar nova disciplina"
                                        aria-label="Cadastrar nova disciplina"
                                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-500 active:scale-95"
                                    >
                                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                        </svg>
                                    </button>
                                ) : null}
                                <div className="relative w-full max-w-xs">
                                    <input
                                        value={searchTerm}
                                        onChange={(event) => setSearchTerm(event.target.value)}
                                        placeholder="Buscar disciplina..."
                                        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    />
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
                                    {visibleSubjectColumns.map((column) => (
                                        <col key={column.key} />
                                    ))}
                                    <col className="w-44" />
                                </colgroup>
                                <thead>
                                    <tr className="dashboard-table-head border-b border-slate-300 text-[13px] font-bold uppercase tracking-wider">
                                        <th className="sticky top-0 z-20 w-12 bg-slate-50 px-3 py-3 text-left">
                                            {renderSubjectClearAllButton()}
                                        </th>
                                        {visibleSubjectColumns.map((column) => (
                                            <th key={column.key} className={`sticky top-0 z-20 bg-slate-50 px-6 py-3 ${column.align === 'center' ? 'text-center' : ''}`}>
                                                {renderSubjectColumnHeader(column)}
                                            </th>
                                        ))}
                                        <th className="sticky top-0 z-20 w-44 bg-slate-50 px-6 py-3 text-right">Ação</th>
                                    </tr>
                                    {activeSubjectFilterColumn ? (
                                        <tr aria-hidden="true">
                                            <th colSpan={visibleSubjectColumns.length + 2} className="h-56 bg-white p-0" />
                                        </tr>
                                    ) : null}
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={visibleSubjectColumns.length + 2} className="px-6 py-12 text-center font-medium text-slate-400">
                                                Carregando disciplinas...
                                            </td>
                                        </tr>
                                    ) : null}

                                    {!isLoading && sortedFilteredSubjects.length === 0 ? (
                                        <tr>
                                            <td colSpan={visibleSubjectColumns.length + 2} className="px-6 py-12 text-center font-medium text-slate-400">
                                                Nenhuma disciplina cadastrada.
                                            </td>
                                        </tr>
                                    ) : null}

                                    {!isLoading && paginatedSubjects.map((subject, rowIndex) => {
                                        const zebraClass = rowIndex % 2 === 0
                                            ? subject.canceledAt
                                                ? 'bg-rose-100/80 hover:bg-rose-200/80'
                                                : 'bg-white hover:bg-slate-50'
                                            : subject.canceledAt
                                                ? 'bg-rose-200/70 hover:bg-rose-300/70'
                                                : 'bg-slate-200/70 hover:bg-slate-300/60';
                                        const isSelectedRow = selectedSubjectGridRowId === subject.id;
                                        const rowClass = isSelectedRow
                                            ? 'bg-blue-100 outline outline-2 outline-blue-400 outline-offset-[-2px] hover:bg-blue-100'
                                            : zebraClass;

                                        return (
                                            <tr
                                                key={subject.id}
                                                onClick={() => setSelectedSubjectGridRowId(subject.id)}
                                                aria-selected={isSelectedRow}
                                                className={`group cursor-pointer transition-colors ${rowClass}`}
                                            >
                                                <td className="px-3 py-4" />
                                                {visibleSubjectColumns.map((column) => renderSubjectGridCell(subject, column.key))}
                                                <td className="w-44 px-6 py-4 text-right">
                                                    {canManage ? (
                                                        <div className="flex justify-end gap-2">
                                                            {renderSubjectInfoButton(subject)}
                                                            <GridRowActionIconButton title="Editar disciplina" onClick={() => handleEditSubject(subject)} tone="blue">
                                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </GridRowActionIconButton>
                                                            <GridRowActionIconButton
                                                                title={subject.canceledAt ? 'Ativar disciplina' : 'Inativar disciplina'}
                                                                onClick={() => handleToggleSubjectStatus(subject)}
                                                                tone={subject.canceledAt ? 'emerald' : 'rose'}
                                                            >
                                                                {subject.canceledAt ? (
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
                                                            {renderSubjectInfoButton(subject)}
                                                            <span className="self-center text-xs font-semibold text-slate-400">Somente leitura</span>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <GridStandardFooter
                            recordsCount={sortedFilteredSubjects.length}
                            onOpenColumns={() => setIsGridConfigOpen(true)}
                            onOpenExport={() => setIsExportModalOpen(true)}
                            statusFilter={statusFilter}
                            onStatusFilterChange={setStatusFilter}
                            activeLabel="Mostrar somente disciplinas ativas"
                            allLabel="Mostrar disciplinas ativas e inativas"
                            inactiveLabel="Mostrar somente disciplinas inativas"
                            pageSize={subjectPageSize}
                            onPageSizeChange={setSubjectPageSize}
                            currentPage={currentSubjectPage}
                            totalPages={subjectTotalPages}
                            onFirstPage={() => setSubjectPage(1)}
                            onPreviousPage={() => setSubjectPage((current) => Math.max(1, current - 1))}
                            onNextPage={() => setSubjectPage((current) => Math.min(subjectTotalPages, current + 1))}
                            onLastPage={() => setSubjectPage(subjectTotalPages)}
                        />
                    </section>

                    <GridColumnConfigModal
                isOpen={isGridConfigOpen}
                title="Configurar colunas do grid"
                description="Reordene, oculte ou inclua colunas do cadastro de disciplinas nesta tela."
                columns={orderedSubjectColumns.map((column) => ({ key: column.key, label: column.label, visibleByDefault: column.visibleByDefault }))}
                orderedColumns={columnOrder}
                hiddenColumns={hiddenColumns}
                onToggleColumnVisibility={toggleGridColumnVisibility}
                onMoveColumn={moveGridColumn}
                onReset={resetGridColumns}
                onClose={() => setIsGridConfigOpen(false)}
                    />

                    <GridExportModal
                isOpen={isExportModalOpen}
                title="Exportar disciplinas"
                description={`A exportação respeita a busca atual e inclui ${sortedFilteredSubjects.length} registro(s).`}
                format={exportFormat}
                onFormatChange={setExportFormat}
                columns={SUBJECT_EXPORT_COLUMNS.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={exportColumns}
                onToggleColumn={toggleExportColumn}
                onSelectAll={setAllExportColumns}
                storageKey={getSubjectExportConfigStorageKey(currentTenantId)}
                onClose={() => setIsExportModalOpen(false)}
                onExport={async (config) => {
                    try {
                        const orderedSubjectColumns = config?.orderedColumns
                            ? config.orderedColumns
                                .map((key) => SUBJECT_EXPORT_COLUMNS.find((column) => column.key === key))
                                .filter((column): column is GridColumnDefinition<Subject, SubjectExportColumnKey> => !!column)
                            : SUBJECT_EXPORT_COLUMNS;
                        await exportGridRows({
                            rows: sortedFilteredSubjects,
                            columns: orderedSubjectColumns,
                            selectedColumns: config?.selectedColumns || exportColumns,
                            format: exportFormat,
                            pdfOptions: config?.pdfOptions,
                            fileBaseName: 'disciplinas',
                            branding: {
                                title: 'Disciplinas',
                                subtitle: 'Exportação com os filtros atualmente aplicados.',
                            },
                        });
                        setSuccessStatus(`Exportação ${exportFormat.toUpperCase()} preparada com ${sortedFilteredSubjects.length} registro(s).`);
                        setIsExportModalOpen(false);
                    } catch (error) {
                        setErrorStatus(error instanceof Error ? error.message : 'Não foi possível exportar as disciplinas.');
                    }
                }}
                    />

                    <StatusConfirmationModal
                isOpen={Boolean(toggleModalSubject && toggleModalAction)}
                tenantId={currentTenantId}
                actionType={toggleModalAction || 'activate'}
                title={toggleModalAction === 'activate' ? 'Ativar disciplina' : 'Inativar disciplina'}
                itemLabel="Disciplina"
                itemName={toggleModalSubject?.name || ''}
                description={toggleModalAction === 'activate'
                    ? 'Ao ativar esta disciplina ela voltará a ser oferecida na grade e os professores poderão vinculá-la novamente.'
                    : 'Ao inativar esta disciplina ela será removida das opções de vinculação e aparecerá como inativa em relatórios.'}
                confirmLabel={toggleModalAction === 'activate' ? 'Confirmar ativação' : 'Confirmar inativação'}
                onCancel={() => closeToggleModal(true)}
                onConfirm={confirmToggleSubjectStatus}
                isProcessing={isProcessingToggle}
                statusActive={!toggleModalSubject?.canceledAt}
                screenId={DISCIPLINAS_STATUS_MODAL_SCREEN_ID}
                    />

                    {isModalOpen ? (
                <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
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
                                    <h2 className="truncate text-xl font-bold text-[#153a6a]">
                                        {editingSubjectId ? 'Editar disciplina' : 'Nova disciplina'}
                                    </h2>
                                </div>
                            </div>
                            <button onClick={closeModal} className="text-slate-400 hover:text-red-500">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSaveSubject} className="p-6 space-y-5">
                            <div className="relative">
                                <label className="text-xs font-bold text-slate-600 mb-1 block">Nome da disciplina *</label>
                                <input
                                    type="text"
                                    value={subjectName}
                                    onChange={(event) => handleSubjectNameChange(event.target.value)}
                                    placeholder="Ex: MATEMÁTICA"
                                    disabled={!canManage || isSavingSubject}
                                    onFocus={() => {
                                        if (!editingSubjectId && subjectName.trim().length >= 2) {
                                            setShowNameSuggestions(true);
                                        }
                                    }}
                                    onBlur={() => {
                                        window.setTimeout(() => setShowNameSuggestions(false), 160);
                                    }}
                                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                                />
                                {!editingSubjectId && (showNameSuggestions || isLoadingNameSuggestions) ? (
                                    <div className="mt-2 w-full rounded-xl border border-blue-100 bg-white p-3 shadow-xl">
                                        <div className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700">
                                            Possíveis nomes já cadastrados
                                        </div>
                                        {isLoadingNameSuggestions ? (
                                            <div className="text-xs font-semibold text-slate-500">Buscando sugestões...</div>
                                        ) : nameSuggestions.length === 0 ? (
                                            <div className="text-xs font-semibold text-slate-500">Nenhuma disciplina parecida encontrada.</div>
                                        ) : (
                                            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                                                {nameSuggestions.map((suggestion, index) => (
                                                    <button
                                                        key={`${suggestion.name}-${index}`}
                                                        type="button"
                                                        onClick={() => {
                                                            setSubjectName(suggestion.name);
                                                            setNameSuggestions([]);
                                                            setShowNameSuggestions(false);
                                                            setDebouncedSubjectNameQuery('');
                                                        }}
                                                        className="w-full text-left"
                                                    >
                                                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                                                            {suggestion.name}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : null}
                            </div>

                            <TenantBranchSelect
                                branches={tenantBranches}
                                value={subjectBranchCode}
                                onChange={setSubjectBranchCode}
                                variant="pills"
                                label="Filiais"
                            />

                            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="px-5 py-2.5 text-slate-500 font-semibold hover:bg-slate-100 rounded-xl transition-colors text-sm"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={!canManage || isSavingSubject}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-md shadow-blue-500/20 transition-all text-sm disabled:bg-slate-300 disabled:cursor-not-allowed"
                                >
                                    {isSavingSubject ? 'Salvando...' : editingSubjectId ? 'Salvar edição' : 'Cadastrar disciplina'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
                    ) : null}

                    {saveSuccessPopup ? (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl animate-in zoom-in-95">
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

                    {selectedSubjectForTeachers ? (
                <div className="fixed inset-0 z-[56] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95">
                        <div className="dashboard-band flex items-start justify-between gap-4 border-b px-6 py-5 shrink-0">
                            <div>
                                <h2 className="text-xl font-bold text-[#153a6a]">Professores da disciplina</h2>
                                <p className="mt-1 text-sm font-medium text-slate-500">{selectedSubjectForTeachers.name}</p>
                            </div>
                            <button onClick={() => setSelectedSubjectForTeachers(null)} className="text-slate-400 hover:text-red-500">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {teachersForSelectedSubject.length > 0 ? (
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    {teachersForSelectedSubject.map((teacher) => {
                                        const assignment = teacher.teacherSubjects.find((item) => item.subjectId === selectedSubjectForTeachers.id) || null;
                                        return (
                                            <div key={teacher.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                                <div className="font-bold text-slate-800">{teacher.name}</div>
                                                <div className="mt-1 text-sm font-medium text-slate-500">{teacher.email || 'Sem e-mail de acesso'}</div>
                                                <div className="mt-1 text-xs font-medium text-slate-400">{teacher.phone || teacher.whatsapp || 'Sem telefone cadastrado'}</div>
                                                <div className="mt-3 text-xs font-semibold text-violet-700">
                                                    {typeof assignment?.hourlyRate === 'number'
                                                        ? `Hora-aula: R$ ${assignment.hourlyRate.toFixed(2).replace('.', ',')}`
                                                        : 'Hora-aula não informada'}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="dashboard-band-soft rounded-2xl border border-dashed px-6 py-12 text-center">
                                    <div className="text-base font-bold text-slate-700">Nenhum professor vinculado</div>
                                    <p className="mt-2 text-sm font-medium text-slate-500">
                                        Esta disciplina ainda não possui professores vinculados.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-right shrink-0">
                            <button
                                type="button"
                                onClick={() => setSelectedSubjectForTeachers(null)}
                                className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-white"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

