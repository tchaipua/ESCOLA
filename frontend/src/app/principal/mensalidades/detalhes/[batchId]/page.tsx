'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardAccessDenied from '@/app/components/dashboard-access-denied';
import GridColumnConfigModal from '@/app/components/grid-column-config-modal';
import GridExportModal from '@/app/components/grid-export-modal';
import GridSortableHeader from '@/app/components/grid-sortable-header';
import { copyTextToClipboard } from '@/app/lib/clipboard';
import { getDashboardAuthContext, hasAnyDashboardPermission, type DashboardAuthContext } from '@/app/lib/dashboard-crud-utils';
import {
    buildDefaultExportColumns,
    exportGridRows,
    sortGridRows,
    type GridColumnDefinition,
    type GridExportFormat,
    type GridSortState,
} from '@/app/lib/grid-export-utils';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const SCREEN_ID = 'PRINCIPAL_MENSALIDADES_DETALHES_LANCAMENTO';
const COPY_FEEDBACK_TIMEOUT = 1800;

type HistoryDetailsResponse = {
    batch: {
        id: string;
        launchType: string;
        scope: string;
        referenceMonthLabel: string;
        totalStudents: number;
        totalInstallments: number;
        totalAmount: number;
        skippedStudentsCount: number;
        createdAt: string;
        schoolYear?: {
            id: string;
            year: number;
        } | null;
    };
    items: Array<{
        status: 'OK' | 'PROBLEMA';
        studentId: string;
        studentName: string;
        classLabel: string | null;
        payerName: string | null;
        referenceMonthLabel: string;
        dueDate: string | null;
        installmentLabel: string;
        amount: number | null;
        description: string | null;
        reason: string | null;
    }>;
};

type DetailTab = 'generated' | 'problem';
type GeneratedColumnKey = 'studentName' | 'classLabel' | 'payerName' | 'installmentCount' | 'lastDueDate' | 'totalAmount';
type ProblemColumnKey = 'studentName' | 'classLabel' | 'installmentCount' | 'problemReason';

type StudentLaunchSummary = {
    status: 'OK' | 'PROBLEMA';
    studentId: string;
    studentName: string;
    classLabel: string | null;
    payerName: string | null;
    referenceMonthLabel: string;
    installmentCount: number;
    totalAmount: number;
    lastDueDate: string | null;
    problemReason: string | null;
};

const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const DEFAULT_PAGE_SIZE = 10;
const EMPTY_AUTH_CONTEXT: DashboardAuthContext = {
    token: null,
    userId: null,
    role: null,
    permissions: [],
    tenantId: null,
    branchCode: 1,
    name: null,
    modelType: null,
    cashierOnly: false,
};

const generatedGridColumns: Array<GridColumnDefinition<StudentLaunchSummary, GeneratedColumnKey>> = [
    {
        key: 'studentName',
        label: 'Aluno',
        getValue: (row) => row.studentName,
        getSortValue: (row) => row.studentName,
    },
    {
        key: 'classLabel',
        label: 'Turma',
        getValue: (row) => row.classLabel || '---',
        getSortValue: (row) => row.classLabel || '',
    },
    {
        key: 'payerName',
        label: 'Pagador',
        getValue: (row) => row.payerName || '---',
        getSortValue: (row) => row.payerName || '',
    },
    {
        key: 'installmentCount',
        label: 'Parcelas lançadas',
        getValue: (row) => String(row.installmentCount),
        getSortValue: (row) => row.installmentCount,
        align: 'center',
    },
    {
        key: 'lastDueDate',
        label: 'Último vencimento',
        getValue: (row) => formatDateLabel(row.lastDueDate),
        getSortValue: (row) => row.lastDueDate ? new Date(row.lastDueDate).getTime() : 0,
        align: 'center',
    },
    {
        key: 'totalAmount',
        label: 'Total lançado',
        getValue: (row) => formatCurrency(row.totalAmount),
        getSortValue: (row) => row.totalAmount,
        align: 'right',
    },
];

const problemGridColumns: Array<GridColumnDefinition<StudentLaunchSummary, ProblemColumnKey>> = [
    {
        key: 'studentName',
        label: 'Aluno',
        getValue: (row) => row.studentName,
        getSortValue: (row) => row.studentName,
    },
    {
        key: 'classLabel',
        label: 'Turma',
        getValue: (row) => row.classLabel || '---',
        getSortValue: (row) => row.classLabel || '',
    },
    {
        key: 'installmentCount',
        label: 'Parcelas lançadas',
        getValue: (row) => String(row.installmentCount),
        getSortValue: (row) => row.installmentCount,
        align: 'center',
    },
    {
        key: 'problemReason',
        label: 'Problema',
        getValue: (row) => row.problemReason || '---',
        getSortValue: (row) => row.problemReason || '',
    },
];

function getTotalPages(recordsCount: number, pageSize: number) {
    return Math.max(1, Math.ceil(recordsCount / pageSize));
}

function getVisibleOrderedColumns<ColumnKey extends string>(
    columns: Array<GridColumnDefinition<StudentLaunchSummary, ColumnKey>>,
    columnOrder: ColumnKey[],
    hiddenColumns: ColumnKey[],
) {
    return columnOrder
        .map((columnKey) => columns.find((column) => column.key === columnKey))
        .filter((column): column is GridColumnDefinition<StudentLaunchSummary, ColumnKey> => Boolean(column))
        .filter((column) => !hiddenColumns.includes(column.key));
}

function getMovedColumns<ColumnKey extends string>(columns: ColumnKey[], columnKey: ColumnKey, direction: 'up' | 'down') {
    const currentIndex = columns.indexOf(columnKey);
    if (currentIndex === -1) return columns;

    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= columns.length) return columns;

    const nextColumns = [...columns];
    [nextColumns[currentIndex], nextColumns[nextIndex]] = [nextColumns[nextIndex], nextColumns[currentIndex]];
    return nextColumns;
}

function getRowClassName(isSelected: boolean, isProblemRow: boolean, rowIndex: number) {
    if (isSelected) {
        return 'bg-blue-100 outline outline-2 -outline-offset-2 outline-blue-400';
    }

    if (isProblemRow) {
        return rowIndex % 2 === 0
            ? 'bg-rose-100/80 hover:bg-rose-200/80'
            : 'bg-rose-200/70 hover:bg-rose-300/70';
    }

    return rowIndex % 2 === 0
        ? 'bg-white hover:bg-blue-50/70'
        : 'bg-slate-200/70 hover:bg-slate-300/70';
}

type DetailLaunchGridProps<ColumnKey extends string> = {
    title: string;
    statusLabel: string;
    rows: StudentLaunchSummary[];
    pagedRows: StudentLaunchSummary[];
    columns: Array<GridColumnDefinition<StudentLaunchSummary, ColumnKey>>;
    visibleColumns: Array<GridColumnDefinition<StudentLaunchSummary, ColumnKey>>;
    sortState: GridSortState<ColumnKey>;
    onSort: (columnKey: ColumnKey) => void;
    selectedRowId: string | null;
    onSelectedRowIdChange: (value: string) => void;
    emptyMessage: string;
    pageSize: number;
    currentPage: number;
    totalPages: number;
    onPageSizeChange: (value: number) => void;
    onFirstPage: () => void;
    onPreviousPage: () => void;
    onNextPage: () => void;
    onLastPage: () => void;
    onOpenColumns: () => void;
    onOpenExport: () => void;
    aggregateSummaries?: Array<{
        key: string;
        label: string;
        value: string;
    }>;
};

function DetailLaunchGrid<ColumnKey extends string>({
    title,
    statusLabel,
    rows,
    pagedRows,
    visibleColumns,
    sortState,
    onSort,
    selectedRowId,
    onSelectedRowIdChange,
    emptyMessage,
    pageSize,
    currentPage,
    totalPages,
    onPageSizeChange,
    onFirstPage,
    onPreviousPage,
    onNextPage,
    onLastPage,
    onOpenColumns,
    onOpenExport,
    aggregateSummaries = [],
}: DetailLaunchGridProps<ColumnKey>) {
    const formattedCount = new Intl.NumberFormat('pt-BR').format(rows.length);

    return (
        <div className="flex min-h-[560px] flex-col">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <h2 className="text-base font-black uppercase tracking-[0.12em] text-slate-900">{title}</h2>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
                        {formattedCount}
                    </span>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    {statusLabel}
                </span>
            </div>

            <div className="min-h-0 flex-1 overflow-x-auto">
                <div className="max-h-[430px] min-h-[360px] overflow-auto">
                    <table className="min-w-full border-separate border-spacing-0">
                        <thead>
                            <tr className="text-left text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                                {visibleColumns.map((column) => {
                                    const alignClass =
                                        column.align === 'right'
                                            ? 'text-right'
                                            : column.align === 'center'
                                                ? 'text-center'
                                                : 'text-left';

                                    return (
                                        <th key={column.key} className={`sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-4 py-3 ${alignClass}`}>
                                            <GridSortableHeader
                                                label={column.label}
                                                isActive={sortState.column === column.key}
                                                direction={sortState.direction}
                                                onClick={() => onSort(column.key)}
                                                align={column.align}
                                            />
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="text-sm font-semibold text-slate-700">
                            {pagedRows.map((entry, rowIndex) => {
                                const rowId = `${entry.status}-${entry.studentId}`;
                                const isSelected = selectedRowId === rowId;

                                return (
                                    <tr
                                        key={rowId}
                                        aria-selected={isSelected}
                                        onClick={() => onSelectedRowIdChange(rowId)}
                                        className={`cursor-pointer transition-colors ${getRowClassName(isSelected, entry.status === 'PROBLEMA', rowIndex)}`}
                                    >
                                        {visibleColumns.map((column) => {
                                            const alignClass =
                                                column.align === 'right'
                                                    ? 'text-right'
                                                    : column.align === 'center'
                                                        ? 'text-center'
                                                        : 'text-left';
                                            const valueClass = column.key === 'problemReason' ? 'text-rose-700' : '';

                                            return (
                                                <td key={column.key} className={`border-b border-white/60 px-4 py-4 ${alignClass} ${valueClass}`}>
                                                    {column.getValue(entry)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                            {!rows.length ? (
                                <tr>
                                    <td colSpan={Math.max(visibleColumns.length, 1)} className="px-4 py-16 text-center text-sm font-semibold text-slate-500">
                                        {emptyMessage}
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={onOpenColumns}
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
                        onClick={onOpenExport}
                        title="Abrir exportação e impressão"
                        aria-label="Abrir exportação e impressão"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V4h12v5M6 18h12v2H6v-2zm-1-8h14a2 2 0 012 2v4H3v-4a2 2 0 012-2z" />
                        </svg>
                    </button>
                    <div className="inline-flex h-8 items-center rounded-full border border-slate-300 bg-white px-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 shadow-sm">
                        {statusLabel}
                    </div>
                    <div className="inline-flex h-8 items-center rounded-full border border-slate-300 bg-white px-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 shadow-sm">
                        Total registros: {formattedCount}
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
                        value={pageSize}
                        onChange={(event) => onPageSizeChange(Number(event.target.value))}
                        aria-label="Registros por página"
                        className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 outline-none transition hover:bg-slate-50 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    >
                        {[10, 20, 50, 100].map((option) => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        aria-label="Voltar para o início"
                        title="Voltar para o início"
                        onClick={onFirstPage}
                        disabled={currentPage <= 1}
                        className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {'<<'}
                    </button>
                    <button
                        type="button"
                        aria-label="Voltar uma página"
                        title="Voltar uma página"
                        onClick={onPreviousPage}
                        disabled={currentPage <= 1}
                        className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {'<'}
                    </button>
                    <div className="min-w-20 text-center text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                        {currentPage}/{totalPages}
                    </div>
                    <button
                        type="button"
                        aria-label="Avançar uma página"
                        title="Avançar uma página"
                        onClick={onNextPage}
                        disabled={currentPage >= totalPages}
                        className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {'>'}
                    </button>
                    <button
                        type="button"
                        aria-label="Ir para o fim"
                        title="Ir para o fim"
                        onClick={onLastPage}
                        disabled={currentPage >= totalPages}
                        className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {'>>'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function formatCurrency(value?: number | null) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(typeof value === 'number' ? value : 0);
}

function formatDateLabel(value?: string | null) {
    if (!value) return '---';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('pt-BR');
}

function getFriendlyRequestErrorMessage(error: unknown, fallbackMessage: string) {
    if (!(error instanceof Error)) return fallbackMessage;

    const normalizedMessage = String(error.message || '').trim();
    if (!normalizedMessage) return fallbackMessage;

    if (normalizedMessage === 'Failed to fetch') {
        return 'Não foi possível conectar ao servidor. Verifique se o backend está aberto e tente novamente.';
    }

    if (normalizedMessage === 'Unauthorized') {
        return 'Sua sessão não está autorizada no momento. Faça login novamente e tente outra vez.';
    }

    return normalizedMessage;
}

export default function PrincipalMensalidadesDetalhesPage() {
    const params = useParams<{ batchId: string }>();
    const [details, setDetails] = useState<HistoryDetailsResponse | null>(null);
    const [isClientReady, setIsClientReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [screenCopyStatus, setScreenCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
    const [activeTab, setActiveTab] = useState<DetailTab>('generated');
    const [generatedPageSize, setGeneratedPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [problemPageSize, setProblemPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [generatedPage, setGeneratedPage] = useState(1);
    const [problemPage, setProblemPage] = useState(1);
    const [selectedGeneratedRowId, setSelectedGeneratedRowId] = useState<string | null>(null);
    const [selectedProblemRowId, setSelectedProblemRowId] = useState<string | null>(null);
    const [generatedSortState, setGeneratedSortState] = useState<GridSortState<GeneratedColumnKey>>({
        column: 'studentName',
        direction: 'asc',
    });
    const [problemSortState, setProblemSortState] = useState<GridSortState<ProblemColumnKey>>({
        column: 'studentName',
        direction: 'asc',
    });
    const [generatedColumnOrder, setGeneratedColumnOrder] = useState<GeneratedColumnKey[]>(
        () => generatedGridColumns.map((column) => column.key),
    );
    const [problemColumnOrder, setProblemColumnOrder] = useState<ProblemColumnKey[]>(
        () => problemGridColumns.map((column) => column.key),
    );
    const [generatedHiddenColumns, setGeneratedHiddenColumns] = useState<GeneratedColumnKey[]>([]);
    const [problemHiddenColumns, setProblemHiddenColumns] = useState<ProblemColumnKey[]>([]);
    const [isGeneratedColumnsOpen, setIsGeneratedColumnsOpen] = useState(false);
    const [isProblemColumnsOpen, setIsProblemColumnsOpen] = useState(false);
    const [isGeneratedExportOpen, setIsGeneratedExportOpen] = useState(false);
    const [isProblemExportOpen, setIsProblemExportOpen] = useState(false);
    const [generatedExportFormat, setGeneratedExportFormat] = useState<GridExportFormat>('excel');
    const [problemExportFormat, setProblemExportFormat] = useState<GridExportFormat>('excel');
    const [generatedExportColumns, setGeneratedExportColumns] = useState<Record<GeneratedColumnKey, boolean>>(
        () => ({ ...buildDefaultExportColumns(generatedGridColumns) }),
    );
    const [problemExportColumns, setProblemExportColumns] = useState<Record<ProblemColumnKey, boolean>>(
        () => ({ ...buildDefaultExportColumns(problemGridColumns) }),
    );
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const authContext = isClientReady ? getDashboardAuthContext() : EMPTY_AUTH_CONTEXT;
    const canViewFinancial = isClientReady && hasAnyDashboardPermission(authContext.role, authContext.permissions, ['VIEW_FINANCIAL', 'MANAGE_MONTHLY_FEES']);
    const tenantBranding = useMemo(() => readCachedTenantBranding(authContext.tenantId), [authContext.tenantId]);

    useEffect(() => {
        setIsClientReady(true);
    }, []);

    useEffect(() => {
        return () => {
            if (copyTimerRef.current) {
                clearTimeout(copyTimerRef.current);
            }
        };
    }, []);

    const resetCopyFeedback = useCallback(() => {
        if (copyTimerRef.current) {
            clearTimeout(copyTimerRef.current);
        }

        copyTimerRef.current = setTimeout(() => setScreenCopyStatus('idle'), COPY_FEEDBACK_TIMEOUT);
    }, []);

    const handleCopyScreenName = useCallback(async (screenId: string) => {
        try {
            const copied = await copyTextToClipboard(screenId);
            setScreenCopyStatus(copied ? 'copied' : 'error');
        } catch (error) {
            console.error('Falha ao copiar nome da tela', error);
            setScreenCopyStatus('error');
        } finally {
            resetCopyFeedback();
        }
    }, [resetCopyFeedback]);

    const loadDetails = useCallback(async () => {
        if (!isClientReady) return;
        if (!authContext.token || !canViewFinancial || !params?.batchId) {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setLoadError(null);

            const response = await fetch(`${API_BASE_URL}/student-financial-launches/${params.batchId}/details`, {
                headers: {
                    Authorization: `Bearer ${authContext.token}`,
                },
            });

            const payload = (await response.json().catch(() => null)) as HistoryDetailsResponse | { message?: string } | null;
            if (!response.ok) {
                throw new Error(payload && 'message' in payload ? payload.message || 'Não foi possível carregar o detalhamento do lançamento.' : 'Não foi possível carregar o detalhamento do lançamento.');
            }

            setDetails(payload as HistoryDetailsResponse);
        } catch (error) {
            setDetails(null);
            setLoadError(getFriendlyRequestErrorMessage(error, 'Não foi possível carregar o detalhamento do lançamento.'));
        } finally {
            setIsLoading(false);
        }
    }, [authContext.token, canViewFinancial, isClientReady, params?.batchId]);

    useEffect(() => {
        if (!isClientReady) return;
        void loadDetails();
    }, [isClientReady, loadDetails]);

    const studentSummaries = useMemo<StudentLaunchSummary[]>(() => {
        if (!details) return [];

        const grouped = new Map<string, StudentLaunchSummary>();

        details.items.forEach((entry) => {
            const key = `${entry.status}:${entry.studentId}`;
            const existing = grouped.get(key);

            if (entry.status === 'OK') {
                if (!existing) {
                    grouped.set(key, {
                        status: 'OK',
                        studentId: entry.studentId,
                        studentName: entry.studentName,
                        classLabel: entry.classLabel,
                        payerName: entry.payerName,
                        referenceMonthLabel: entry.referenceMonthLabel,
                        installmentCount: 1,
                        totalAmount: entry.amount || 0,
                        lastDueDate: entry.dueDate,
                        problemReason: null,
                    });
                    return;
                }

                const currentDueTime = entry.dueDate ? new Date(entry.dueDate).getTime() : 0;
                const existingDueTime = existing.lastDueDate ? new Date(existing.lastDueDate).getTime() : 0;

                grouped.set(key, {
                    ...existing,
                    installmentCount: existing.installmentCount + 1,
                    totalAmount: existing.totalAmount + (entry.amount || 0),
                    lastDueDate: currentDueTime > existingDueTime ? entry.dueDate : existing.lastDueDate,
                });
                return;
            }

            if (!existing) {
                grouped.set(key, {
                    status: 'PROBLEMA',
                    studentId: entry.studentId,
                    studentName: entry.studentName,
                    classLabel: entry.classLabel,
                    payerName: null,
                    referenceMonthLabel: entry.referenceMonthLabel,
                    installmentCount: 0,
                    totalAmount: 0,
                    lastDueDate: null,
                    problemReason: entry.reason,
                });
            }
        });

        return Array.from(grouped.values()).sort((left, right) => left.studentName.localeCompare(right.studentName));
    }, [details]);

    const successItems = useMemo(
        () => studentSummaries.filter((entry) => entry.status === 'OK'),
        [studentSummaries],
    );
    const problemItems = useMemo(
        () => studentSummaries.filter((entry) => entry.status === 'PROBLEMA'),
        [studentSummaries],
    );
    const successTotalInstallments = successItems.reduce((total, entry) => total + entry.installmentCount, 0);
    const successTotalAmount = successItems.reduce((total, entry) => total + entry.totalAmount, 0);
    const visibleGeneratedColumns = useMemo(
        () => getVisibleOrderedColumns(generatedGridColumns, generatedColumnOrder, generatedHiddenColumns),
        [generatedColumnOrder, generatedHiddenColumns],
    );
    const visibleProblemColumns = useMemo(
        () => getVisibleOrderedColumns(problemGridColumns, problemColumnOrder, problemHiddenColumns),
        [problemColumnOrder, problemHiddenColumns],
    );
    const sortedGeneratedItems = useMemo(
        () => sortGridRows(successItems, generatedGridColumns, generatedSortState, (left, right) => left.studentName.localeCompare(right.studentName)),
        [generatedSortState, successItems],
    );
    const sortedProblemItems = useMemo(
        () => sortGridRows(problemItems, problemGridColumns, problemSortState, (left, right) => left.studentName.localeCompare(right.studentName)),
        [problemItems, problemSortState],
    );
    const generatedTotalPages = getTotalPages(sortedGeneratedItems.length, generatedPageSize);
    const problemTotalPages = getTotalPages(sortedProblemItems.length, problemPageSize);
    const currentGeneratedPage = Math.min(generatedPage, generatedTotalPages);
    const currentProblemPage = Math.min(problemPage, problemTotalPages);
    const generatedPagedItems = sortedGeneratedItems.slice(
        (currentGeneratedPage - 1) * generatedPageSize,
        currentGeneratedPage * generatedPageSize,
    );
    const problemPagedItems = sortedProblemItems.slice(
        (currentProblemPage - 1) * problemPageSize,
        currentProblemPage * problemPageSize,
    );

    const handleGeneratedSort = useCallback((columnKey: GeneratedColumnKey) => {
        setGeneratedSortState((current) => ({
            column: columnKey,
            direction: current.column === columnKey && current.direction === 'asc' ? 'desc' : 'asc',
        }));
        setGeneratedPage(1);
    }, []);

    const handleProblemSort = useCallback((columnKey: ProblemColumnKey) => {
        setProblemSortState((current) => ({
            column: columnKey,
            direction: current.column === columnKey && current.direction === 'asc' ? 'desc' : 'asc',
        }));
        setProblemPage(1);
    }, []);

    const toggleGeneratedColumnVisibility = useCallback((columnKey: GeneratedColumnKey) => {
        setGeneratedHiddenColumns((current) => {
            const isHidden = current.includes(columnKey);
            if (!isHidden && generatedGridColumns.length - current.length <= 1) return current;
            return isHidden ? current.filter((key) => key !== columnKey) : [...current, columnKey];
        });
    }, []);

    const toggleProblemColumnVisibility = useCallback((columnKey: ProblemColumnKey) => {
        setProblemHiddenColumns((current) => {
            const isHidden = current.includes(columnKey);
            if (!isHidden && problemGridColumns.length - current.length <= 1) return current;
            return isHidden ? current.filter((key) => key !== columnKey) : [...current, columnKey];
        });
    }, []);

    const setAllGeneratedExportColumns = useCallback((value: boolean) => {
        setGeneratedExportColumns(
            generatedGridColumns.reduce<Record<GeneratedColumnKey, boolean>>((accumulator, column) => {
                accumulator[column.key] = value;
                return accumulator;
            }, {} as Record<GeneratedColumnKey, boolean>),
        );
    }, []);

    const setAllProblemExportColumns = useCallback((value: boolean) => {
        setProblemExportColumns(
            problemGridColumns.reduce<Record<ProblemColumnKey, boolean>>((accumulator, column) => {
                accumulator[column.key] = value;
                return accumulator;
            }, {} as Record<ProblemColumnKey, boolean>),
        );
    }, []);

    const handleGeneratedExport = useCallback(async (config?: {
        selectedColumns: Record<GeneratedColumnKey, boolean>;
        orderedColumns: GeneratedColumnKey[];
        orderedVisibleColumns: Array<{ key: GeneratedColumnKey; label: string }>;
    }) => {
        try {
            await exportGridRows({
                rows: sortedGeneratedItems,
                columns: config?.orderedColumns
                    ? config.orderedColumns
                        .map((key) => generatedGridColumns.find((column) => column.key === key))
                        .filter((column): column is GridColumnDefinition<StudentLaunchSummary, GeneratedColumnKey> => Boolean(column))
                    : generatedGridColumns,
                selectedColumns: config?.selectedColumns || generatedExportColumns,
                format: generatedExportFormat,
                fileBaseName: 'mensalidades-lancamentos-gerados',
                branding: {
                    title: 'Lançamentos gerados',
                    subtitle: 'Detalhamento de parcelas registradas pelo Financeiro.',
                },
            });
            setIsGeneratedExportOpen(false);
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'Não foi possível exportar os lançamentos gerados.');
        }
    }, [generatedExportColumns, generatedExportFormat, sortedGeneratedItems]);

    const handleProblemExport = useCallback(async (config?: {
        selectedColumns: Record<ProblemColumnKey, boolean>;
        orderedColumns: ProblemColumnKey[];
        orderedVisibleColumns: Array<{ key: ProblemColumnKey; label: string }>;
    }) => {
        try {
            await exportGridRows({
                rows: sortedProblemItems,
                columns: config?.orderedColumns
                    ? config.orderedColumns
                        .map((key) => problemGridColumns.find((column) => column.key === key))
                        .filter((column): column is GridColumnDefinition<StudentLaunchSummary, ProblemColumnKey> => Boolean(column))
                    : problemGridColumns,
                selectedColumns: config?.selectedColumns || problemExportColumns,
                format: problemExportFormat,
                fileBaseName: 'mensalidades-nao-geraram-parcelas',
                branding: {
                    title: 'Não geraram parcelas',
                    subtitle: 'Detalhamento de registros bloqueados na geração financeira.',
                },
            });
            setIsProblemExportOpen(false);
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'Não foi possível exportar os registros bloqueados.');
        }
    }, [problemExportColumns, problemExportFormat, sortedProblemItems]);

    if (!isClientReady) {
        return (
            <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl items-center justify-center">
                <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Financeiro integrado</div>
                    <h1 className="mt-5 text-3xl font-extrabold text-[#153a6a]">Carregando detalhamento</h1>
                    <p className="mt-3 text-sm font-medium text-slate-500">
                        Preparando permissões e dados do lote financeiro.
                    </p>
                </div>
            </div>
        );
    }

    if (!canViewFinancial) {
        return (
            <DashboardAccessDenied
                title="Financeiro indisponível"
                message="Seu perfil não possui permissão para visualizar o detalhamento dos lançamentos."
            />
        );
    }

    return (
        <div className="space-y-6">
            <section className={`${cardClass} overflow-hidden`}>
                <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-sm">
                                {tenantBranding?.logoUrl ? (
                                    <img
                                        src={tenantBranding.logoUrl}
                                        alt={`Logo de ${tenantBranding.schoolName}`}
                                        className="h-full w-full object-contain p-1.5"
                                    />
                                ) : (
                                    <span className="text-sm font-black uppercase tracking-[0.25em] text-white">
                                        {String(tenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">Financeiro integrado</div>
                                <div className="mt-1 flex flex-wrap items-center gap-3">
                                    <h1 className="text-2xl font-black tracking-tight">Detalhes dos lançamentos</h1>
                                    <button
                                        type="button"
                                        onClick={() => void handleCopyScreenName(SCREEN_ID)}
                                        title="Copiar nome da tela"
                                        aria-label={`Copiar o identificador ${SCREEN_ID}`}
                                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                                    >
                                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M8 7h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
                                            <path d="M9 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                        </svg>
                                    </button>
                                    {screenCopyStatus !== 'idle' ? (
                                        <span className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100">
                                            {screenCopyStatus === 'copied' ? 'Copiado' : 'Falha ao copiar'}
                                        </span>
                                    ) : null}
                                </div>
                        <p className="mt-1 max-w-3xl text-xs font-medium text-blue-100/90">
                                    Consulte em grid o resumo por aluno do que o Financeiro gravou e do que foi bloqueado neste lote.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Link
                                href="/principal/mensalidades"
                                className="rounded-2xl border border-white/25 bg-white/10 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/20"
                            >
                                Voltar
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {loadError ? (
                <section className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <div className="text-xs font-black uppercase tracking-[0.18em] text-rose-700">Detalhamento indisponível</div>
                            <p className="mt-1 text-sm font-semibold text-rose-700">{loadError}</p>
                            <p className="mt-1 text-sm font-medium text-rose-600">
                                O Financeiro não respondeu para este lote. Tente recarregar quando a integração estabilizar.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void loadDetails()}
                            disabled={isLoading}
                            className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70"
                        >
                            {isLoading ? 'Tentando...' : 'Tentar novamente'}
                        </button>
                    </div>
                </section>
            ) : null}

            {details ? (
                <section className={`${cardClass} p-6`}>
                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Lançamentos OK</div>
                            <div className="mt-2 text-2xl font-black text-emerald-700">{successItems.length}</div>
                        </div>
                        <div className="rounded-2xl border border-rose-300 bg-rose-100 px-4 py-4">
                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Com problema</div>
                            <div className="mt-2 text-2xl font-black text-rose-700">{problemItems.length}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Valor total</div>
                            <div className="mt-2 text-2xl font-black text-slate-900">{formatCurrency(details.batch.totalAmount)}</div>
                        </div>
                    </div>
                </section>
            ) : null}

            <section className={`${cardClass} overflow-hidden`}>
                <div className="border-b border-slate-200 bg-slate-50 px-4 pt-4">
                    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Detalhamento de lançamentos financeiros">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab === 'generated'}
                            onClick={() => setActiveTab('generated')}
                            className={`rounded-t-2xl border px-5 py-3 text-sm font-black uppercase tracking-[0.14em] transition ${
                                activeTab === 'generated'
                                    ? 'border-slate-200 border-b-white bg-white text-emerald-700 shadow-sm'
                                    : 'border-transparent bg-slate-100 text-slate-500 hover:bg-white'
                            }`}
                        >
                            Lançamentos gerados
                            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">{successItems.length}</span>
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab === 'problem'}
                            onClick={() => setActiveTab('problem')}
                            className={`rounded-t-2xl border px-5 py-3 text-sm font-black uppercase tracking-[0.14em] transition ${
                                activeTab === 'problem'
                                    ? 'border-slate-200 border-b-white bg-white text-rose-700 shadow-sm'
                                    : 'border-transparent bg-slate-100 text-slate-500 hover:bg-white'
                            }`}
                        >
                            Não geraram parcelas
                            <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-700">{problemItems.length}</span>
                        </button>
                    </div>
                </div>

                {activeTab === 'generated' ? (
                    <DetailLaunchGrid
                        title="Lançamentos gerados"
                        statusLabel={isLoading ? 'CARREGANDO' : 'GERADOS'}
                        rows={sortedGeneratedItems}
                        pagedRows={generatedPagedItems}
                        columns={generatedGridColumns}
                        visibleColumns={visibleGeneratedColumns}
                        sortState={generatedSortState}
                        onSort={handleGeneratedSort}
                        selectedRowId={selectedGeneratedRowId}
                        onSelectedRowIdChange={setSelectedGeneratedRowId}
                        emptyMessage="Nenhuma parcela foi registrada pelo Financeiro neste lote."
                        pageSize={generatedPageSize}
                        currentPage={currentGeneratedPage}
                        totalPages={generatedTotalPages}
                        onPageSizeChange={(value) => {
                            setGeneratedPageSize(value);
                            setGeneratedPage(1);
                        }}
                        onFirstPage={() => setGeneratedPage(1)}
                        onPreviousPage={() => setGeneratedPage((page) => Math.max(1, page - 1))}
                        onNextPage={() => setGeneratedPage((page) => Math.min(generatedTotalPages, page + 1))}
                        onLastPage={() => setGeneratedPage(generatedTotalPages)}
                        onOpenColumns={() => setIsGeneratedColumnsOpen(true)}
                        onOpenExport={() => setIsGeneratedExportOpen(true)}
                        aggregateSummaries={[
                            { key: 'installments', label: 'Parcelas', value: String(successTotalInstallments) },
                            { key: 'amount', label: 'Valor', value: formatCurrency(successTotalAmount) },
                        ]}
                    />
                ) : (
                    <DetailLaunchGrid
                        title="Não geraram parcelas"
                        statusLabel={isLoading ? 'CARREGANDO' : 'NÃO GERADOS'}
                        rows={sortedProblemItems}
                        pagedRows={problemPagedItems}
                        columns={problemGridColumns}
                        visibleColumns={visibleProblemColumns}
                        sortState={problemSortState}
                        onSort={handleProblemSort}
                        selectedRowId={selectedProblemRowId}
                        onSelectedRowIdChange={setSelectedProblemRowId}
                        emptyMessage="Nenhum problema encontrado neste lote."
                        pageSize={problemPageSize}
                        currentPage={currentProblemPage}
                        totalPages={problemTotalPages}
                        onPageSizeChange={(value) => {
                            setProblemPageSize(value);
                            setProblemPage(1);
                        }}
                        onFirstPage={() => setProblemPage(1)}
                        onPreviousPage={() => setProblemPage((page) => Math.max(1, page - 1))}
                        onNextPage={() => setProblemPage((page) => Math.min(problemTotalPages, page + 1))}
                        onLastPage={() => setProblemPage(problemTotalPages)}
                        onOpenColumns={() => setIsProblemColumnsOpen(true)}
                        onOpenExport={() => setIsProblemExportOpen(true)}
                    />
                )}
            </section>

            <GridColumnConfigModal
                isOpen={isGeneratedColumnsOpen}
                title="Configurar colunas do grid"
                description="Reordene, oculte ou inclua colunas dos lançamentos gerados."
                columns={generatedGridColumns.map((column) => ({
                    key: column.key,
                    label: column.label,
                    visibleByDefault: true,
                }))}
                orderedColumns={generatedColumnOrder}
                hiddenColumns={generatedHiddenColumns}
                onToggleColumnVisibility={toggleGeneratedColumnVisibility}
                onMoveColumn={(columnKey, direction) => setGeneratedColumnOrder((columns) => getMovedColumns(columns, columnKey, direction))}
                onReset={() => {
                    setGeneratedColumnOrder(generatedGridColumns.map((column) => column.key));
                    setGeneratedHiddenColumns([]);
                }}
                onClose={() => setIsGeneratedColumnsOpen(false)}
            />

            <GridColumnConfigModal
                isOpen={isProblemColumnsOpen}
                title="Configurar colunas do grid"
                description="Reordene, oculte ou inclua colunas dos registros que não geraram parcelas."
                columns={problemGridColumns.map((column) => ({
                    key: column.key,
                    label: column.label,
                    visibleByDefault: true,
                }))}
                orderedColumns={problemColumnOrder}
                hiddenColumns={problemHiddenColumns}
                onToggleColumnVisibility={toggleProblemColumnVisibility}
                onMoveColumn={(columnKey, direction) => setProblemColumnOrder((columns) => getMovedColumns(columns, columnKey, direction))}
                onReset={() => {
                    setProblemColumnOrder(problemGridColumns.map((column) => column.key));
                    setProblemHiddenColumns([]);
                }}
                onClose={() => setIsProblemColumnsOpen(false)}
            />

            <GridExportModal
                isOpen={isGeneratedExportOpen}
                title="Exportar lançamentos gerados"
                description={`A exportação inclui ${sortedGeneratedItems.length} registro(s) da aba atual.`}
                format={generatedExportFormat}
                onFormatChange={setGeneratedExportFormat}
                columns={generatedGridColumns.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={generatedExportColumns}
                onToggleColumn={(columnKey) => setGeneratedExportColumns((current) => ({ ...current, [columnKey]: !current[columnKey] }))}
                onSelectAll={setAllGeneratedExportColumns}
                onClose={() => setIsGeneratedExportOpen(false)}
                onExport={handleGeneratedExport}
            />

            <GridExportModal
                isOpen={isProblemExportOpen}
                title="Exportar registros sem parcelas"
                description={`A exportação inclui ${sortedProblemItems.length} registro(s) da aba atual.`}
                format={problemExportFormat}
                onFormatChange={setProblemExportFormat}
                columns={problemGridColumns.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={problemExportColumns}
                onToggleColumn={(columnKey) => setProblemExportColumns((current) => ({ ...current, [columnKey]: !current[columnKey] }))}
                onSelectAll={setAllProblemExportColumns}
                onClose={() => setIsProblemExportOpen(false)}
                onExport={handleProblemExport}
            />

            <div className={`${cardClass} px-6 py-4`}>
                <div className="flex justify-end">
                    <div className="flex items-start gap-2 text-right text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">
                        <div>
                            <div>Tela:</div>
                            <div className="mt-1 break-all font-normal tracking-[0.35em] text-slate-500">
                                {SCREEN_ID}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => void handleCopyScreenName(SCREEN_ID)}
                            title="Copiar nome da tela"
                            aria-label={`Copiar o identificador ${SCREEN_ID}`}
                            className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 active:scale-95"
                        >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 6h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <path d="M12 10h3" />
                                <path d="M12 14h3" />
                                <path d="M12 18h3" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );
}
