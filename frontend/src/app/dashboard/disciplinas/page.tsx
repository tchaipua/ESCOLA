'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { getStoredToken } from '@/app/lib/auth-storage';
import { getDashboardAuthContext, hasAllDashboardPermissions, hasDashboardPermission } from '@/app/lib/dashboard-crud-utils';
import { getAllGridColumnKeys, getDefaultVisibleGridColumnKeys, loadGridColumnConfig, type ConfigurableGridColumn, writeGridColumnConfig } from '@/app/lib/grid-column-config-utils';
import { buildDefaultExportColumns, buildExportColumnsFromGridColumns, exportGridRows, sortGridRows, type GridColumnDefinition, type GridSortState } from '@/app/lib/grid-export-utils';

type Subject = {
    id: string;
    name: string;
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

const API_BASE_URL = 'http://localhost:3001/api/v1';

type SubjectColumnKey = 'name' | 'recordStatus';
type SubjectExportColumnKey = SubjectColumnKey;

const SUBJECT_COLUMNS: ConfigurableGridColumn<Subject, SubjectColumnKey>[] = [
    { key: 'name', label: 'Disciplina', getValue: (row) => row.name || '---', visibleByDefault: true },
    { key: 'recordStatus', label: 'Status do cadastro', getValue: (row) => row.canceledAt ? 'INATIVO' : 'ATIVO', visibleByDefault: false },
];
const SUBJECT_EXPORT_COLUMNS: GridColumnDefinition<Subject, SubjectExportColumnKey>[] = buildExportColumnsFromGridColumns(
    SUBJECT_COLUMNS,
);
const SUBJECT_COLUMN_KEYS = getAllGridColumnKeys(SUBJECT_COLUMNS);
const DEFAULT_VISIBLE_SUBJECT_COLUMNS = getDefaultVisibleGridColumnKeys(SUBJECT_COLUMNS);

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
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSubjectForTeachers, setSelectedSubjectForTeachers] = useState<Subject | null>(null);
    const [sortState, setSortState] = useState<GridSortState<SubjectColumnKey>>(DEFAULT_SORT);
    const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
    const [isGridConfigOpen, setIsGridConfigOpen] = useState(false);
    const [isGridConfigReady, setIsGridConfigReady] = useState(false);
    const [columnOrder, setColumnOrder] = useState<SubjectColumnKey[]>(SUBJECT_COLUMN_KEYS);
    const [hiddenColumns, setHiddenColumns] = useState<SubjectColumnKey[]>(
        SUBJECT_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_SUBJECT_COLUMNS.includes(key)),
    );
    const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
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

    const canView = hasAllDashboardPermissions(currentRole, currentPermissions, ['VIEW_SUBJECTS', 'VIEW_TEACHERS']);
    const canManage = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_SUBJECTS');
    const orderedSubjectColumns = useMemo(
        () => columnOrder.map((key) => SUBJECT_COLUMNS.find((column) => column.key === key)).filter((column): column is ConfigurableGridColumn<Subject, SubjectColumnKey> => !!column),
        [columnOrder],
    );
    const visibleSubjectColumns = useMemo(
        () => orderedSubjectColumns.filter((column) => !hiddenColumns.includes(column.key)),
        [hiddenColumns, orderedSubjectColumns],
    );

    const loadData = async () => {
        try {
            setIsLoading(true);
            setErrorStatus(null);
            const { token, role, permissions, tenantId } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            setCurrentRole(role);
            setCurrentPermissions(permissions);
            setCurrentTenantId(tenantId);

            const [subjectsResponse, teachersResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/subjects`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_BASE_URL}/teachers`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
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
        void loadGridColumnConfig(getSubjectGridConfigStorageKey(currentTenantId), SUBJECT_COLUMN_KEYS, DEFAULT_VISIBLE_SUBJECT_COLUMNS).then((config) => {
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
        writeGridColumnConfig(getSubjectGridConfigStorageKey(currentTenantId), SUBJECT_COLUMN_KEYS, columnOrder, hiddenColumns);
    }, [columnOrder, currentTenantId, hiddenColumns, isGridConfigReady]);

    if (!isLoading && !canView) {
        return (
            <DashboardAccessDenied
                title="Acesso restrito às disciplinas"
                message="Seu perfil não possui permissão para consultar a grade de disciplinas e os professores vinculados desta escola."
            />
        );
    }

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
        return subjects.filter((subject) => {
            const isActive = !subject.canceledAt;
            const matchesStatus =
                statusFilter === 'ALL'
                    ? true
                    : statusFilter === 'ACTIVE'
                        ? isActive
                        : !isActive;
            const matchesSearch = !term || subject.name.toUpperCase().includes(term);
            return matchesStatus && matchesSearch;
        });
    }, [searchTerm, statusFilter, subjects]);
    const sortedFilteredSubjects = useMemo(
        () =>
            sortGridRows(
                filteredSubjects,
                SUBJECT_COLUMNS,
                sortState,
            ),
        [filteredSubjects, sortState],
    );

    const openCreateModal = () => {
        setEditingSubjectId(null);
        setSubjectName('');
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
                body: JSON.stringify({ name: normalizedName }),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.message || 'Falha ao salvar disciplina.');
            }

            setSuccessStatus(editingSubjectId ? 'Disciplina atualizada com sucesso.' : 'Disciplina cadastrada com sucesso.');
            closeModal();
            await loadData();
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

    const toggleSort = (column: SubjectColumnKey) => {
        setSortState((current) => ({
            column,
            direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
        }));
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
        const visibleCount = SUBJECT_COLUMN_KEYS.length - hiddenColumns.length;
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
        setColumnOrder(SUBJECT_COLUMN_KEYS);
        setHiddenColumns(SUBJECT_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_SUBJECT_COLUMNS.includes(key)));
    };

    const renderSubjectGridCell = (subject: Subject, columnKey: SubjectColumnKey) => {
        if (columnKey === 'name') {
            return (
                <td key={columnKey} className={`px-6 py-4 font-semibold ${subject.canceledAt ? 'text-rose-800' : 'text-slate-800'}`}>
                    <div className="flex items-center gap-2">
                        <span>{subject.name}</span>
                        <RecordStatusIndicator active={!subject.canceledAt} />
                    </div>
                </td>
            );
        }

        return (
            <td key={columnKey} className="px-6 py-4 text-center">
                <RecordStatusIndicator active={!subject.canceledAt} />
            </td>
        );
    };

    return (
        <div className="w-full space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-[#153a6a] tracking-tight">Disciplinas</h1>
                    <p className="text-slate-500 font-medium mt-1">Cadastre as disciplinas e consulte os professores vinculados.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setIsExportModalOpen(true)}
                        className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                    >
                        Exportar
                    </button>
                    {canManage ? (
                        <button
                            onClick={openCreateModal}
                            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white shadow-md shadow-blue-500/20 transition-all active:scale-95 hover:bg-blue-500"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                            Nova Disciplina
                        </button>
                    ) : null}
                </div>
            </div>

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

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="dashboard-band border-b px-6 py-4">
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

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="dashboard-table-head border-b border-slate-300 text-[13px] font-bold uppercase tracking-wider">
                                {visibleSubjectColumns.map((column) => (
                                    <th key={column.key} className={`px-6 py-4 ${column.align === 'center' ? 'text-center' : ''}`}>
                                        <GridSortableHeader label={column.label} isActive={sortState.column === column.key} direction={sortState.direction} onClick={() => toggleSort(column.key)} align={column.align === 'center' ? 'center' : 'left'} />
                                    </th>
                                ))}
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={visibleSubjectColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">
                                        Carregando disciplinas...
                                    </td>
                                </tr>
                            ) : null}

                            {!isLoading && sortedFilteredSubjects.length === 0 ? (
                                <tr>
                                    <td colSpan={visibleSubjectColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">
                                        Nenhuma disciplina cadastrada.
                                    </td>
                                </tr>
                            ) : null}

                            {!isLoading && sortedFilteredSubjects.map((subject) => {
                                return (
                                    <tr key={subject.id} className={subject.canceledAt ? 'bg-rose-50/40 hover:bg-rose-50' : 'hover:bg-slate-50'}>
                                        {visibleSubjectColumns.map((column) => renderSubjectGridCell(subject, column.key))}
                                        <td className="px-6 py-4 text-right">
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

                <GridFooterControls
                    key={`subject-footer-${sortedFilteredSubjects.length}`}
                    recordsCount={Number(sortedFilteredSubjects.length)}
                    onOpenColumns={() => setIsGridConfigOpen(true)}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    activeLabel="Mostrar somente disciplinas ativas"
                    allLabel="Mostrar disciplinas ativas e inativas"
                    inactiveLabel="Mostrar somente disciplinas inativas"
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
                hintText="Esta ação é obrigatória para manter a conformidade com o histórico da escola."
                confirmLabel={toggleModalAction === 'activate' ? 'Confirmar ativação' : 'Confirmar inativação'}
                onCancel={() => closeToggleModal(true)}
                onConfirm={confirmToggleSubjectStatus}
                isProcessing={isProcessingToggle}
                statusActive={!toggleModalSubject?.canceledAt}
            />

            {isModalOpen ? (
                <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-xl font-bold text-[#153a6a]">
                                {editingSubjectId ? 'Editar disciplina' : 'Nova disciplina'}
                            </h2>
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
    );
}

