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
import { getDashboardAuthContext, hasDashboardPermission } from '@/app/lib/dashboard-crud-utils';
import {
    buildGridAggregateSummaries,
    getAllGridColumnKeys,
    getDefaultVisibleGridColumnKeys,
    loadGridColumnConfig,
    type ConfigurableGridColumn,
    type GridColumnAggregations,
    writeGridColumnConfig,
} from '@/app/lib/grid-column-config-utils';
import { buildDefaultExportColumns, buildExportColumnsFromGridColumns, exportGridRows, sortGridRows, type GridColumnDefinition, type GridSortState } from '@/app/lib/grid-export-utils';

const API_BASE_URL = 'http://localhost:3001/api/v1';

type SeriesRecord = {
    id: string;
    name: string;
    code?: string | null;
    sortOrder?: number | null;
    canceledAt?: string | null;
};

const EMPTY_FORM = {
    name: '',
    code: '',
    sortOrder: '',
};

type SeriesColumnKey = 'name' | 'code' | 'sortOrder' | 'recordStatus';
type SeriesExportColumnKey = SeriesColumnKey;

const SERIES_COLUMNS: ConfigurableGridColumn<SeriesRecord, SeriesColumnKey>[] = [
    { key: 'name', label: 'Série', getValue: (row) => row.name || '---', visibleByDefault: true },
    { key: 'code', label: 'Código', getValue: (row) => row.code || '---', visibleByDefault: true },
    {
        key: 'sortOrder',
        label: 'Ordem de aprendizado',
        getValue: (row) => row.sortOrder !== null && row.sortOrder !== undefined ? String(row.sortOrder) : '---',
        getSortValue: (row) => row.sortOrder ?? -1,
        visibleByDefault: true,
        aggregateOptions: ['sum', 'avg', 'min', 'max', 'count'],
        getAggregateValue: (row) => row.sortOrder ?? null,
    },
    { key: 'recordStatus', label: 'Status do cadastro', getValue: (row) => row.canceledAt ? 'INATIVO' : 'ATIVO', visibleByDefault: false },
];
const SERIES_EXPORT_COLUMNS: GridColumnDefinition<SeriesRecord, SeriesExportColumnKey>[] = buildExportColumnsFromGridColumns(
    SERIES_COLUMNS,
);
const SERIES_COLUMN_KEYS = getAllGridColumnKeys(SERIES_COLUMNS);
const DEFAULT_VISIBLE_SERIES_COLUMNS = getDefaultVisibleGridColumnKeys(SERIES_COLUMNS);

function getSeriesGridConfigStorageKey(tenantId: string | null) {
    return `dashboard:series:grid-config:${tenantId || 'default'}`;
}

function getSeriesExportConfigStorageKey(tenantId: string | null) {
    return `dashboard:series:export-config:${tenantId || 'default'}`;
}

const DEFAULT_SORT: GridSortState<SeriesColumnKey> = {
    column: 'name',
    direction: 'asc',
};

export default function SeriesPage() {
    const [series, setSeries] = useState<SeriesRecord[]>([]);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [successStatus, setSuccessStatus] = useState<string | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [sortState, setSortState] = useState<GridSortState<SeriesColumnKey>>(DEFAULT_SORT);
    const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
    const [isGridConfigOpen, setIsGridConfigOpen] = useState(false);
    const [isGridConfigReady, setIsGridConfigReady] = useState(false);
    const [columnOrder, setColumnOrder] = useState<SeriesColumnKey[]>(SERIES_COLUMN_KEYS);
    const [hiddenColumns, setHiddenColumns] = useState<SeriesColumnKey[]>(
        SERIES_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_SERIES_COLUMNS.includes(key)),
    );
    const [columnAggregations, setColumnAggregations] = useState<GridColumnAggregations<SeriesColumnKey>>({});
    const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFormat, setExportFormat] = useState<'excel' | 'csv' | 'pdf' | 'json' | 'txt'>('excel');
    const [exportColumns, setExportColumns] = useState<Record<SeriesExportColumnKey, boolean>>(buildDefaultExportColumns(SERIES_EXPORT_COLUMNS));
    const [seriesStatusToggleTarget, setSeriesStatusToggleTarget] = useState<SeriesRecord | null>(null);
    const [seriesStatusToggleAction, setSeriesStatusToggleAction] = useState<'activate' | 'deactivate' | null>(null);
    const [isProcessingSeriesToggle, setIsProcessingSeriesToggle] = useState(false);

    const canView = hasDashboardPermission(currentRole, currentPermissions, 'VIEW_SERIES');
    const canManage = hasDashboardPermission(currentRole, currentPermissions, 'MANAGE_SERIES');
    const orderedSeriesColumns = useMemo(
        () => columnOrder.map((key) => SERIES_COLUMNS.find((column) => column.key === key)).filter((column): column is ConfigurableGridColumn<SeriesRecord, SeriesColumnKey> => !!column),
        [columnOrder],
    );
    const visibleSeriesColumns = useMemo(
        () => orderedSeriesColumns.filter((column) => !hiddenColumns.includes(column.key)),
        [hiddenColumns, orderedSeriesColumns],
    );
    const filteredSeries = series.filter((item) => {
        const term = searchTerm.trim().toUpperCase();
        const isActive = !item.canceledAt;
        const matchesStatus =
            statusFilter === 'ALL'
                ? true
                : statusFilter === 'ACTIVE'
                    ? isActive
                    : !isActive;

        if (!matchesStatus) return false;
        if (!term) return true;
        return [item.name, item.code].some((value) => String(value || '').toUpperCase().includes(term));
    });
    const sortedFilteredSeries = useMemo(
        () => sortGridRows(filteredSeries, SERIES_COLUMNS, sortState),
        [filteredSeries, sortState],
    );
    const aggregateSummaries = useMemo(
        () => buildGridAggregateSummaries(sortedFilteredSeries, visibleSeriesColumns, columnAggregations),
        [columnAggregations, sortedFilteredSeries, visibleSeriesColumns],
    );

    const loadSeries = async () => {
        try {
            setIsLoading(true);
            setErrorStatus(null);
            const { token, role, permissions, tenantId } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');
            setCurrentRole(role);
            setCurrentPermissions(permissions);
            setCurrentTenantId(tenantId);

            const response = await fetch(`${API_BASE_URL}/series`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Não foi possível carregar as séries.');
            setSeries(Array.isArray(data) ? data : []);
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível carregar as séries.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { void loadSeries(); }, []);

    useEffect(() => {
        let isMounted = true;
        setIsGridConfigReady(false);
        void loadGridColumnConfig(getSeriesGridConfigStorageKey(currentTenantId), SERIES_COLUMN_KEYS, DEFAULT_VISIBLE_SERIES_COLUMNS).then((config) => {
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
        writeGridColumnConfig(getSeriesGridConfigStorageKey(currentTenantId), SERIES_COLUMN_KEYS, columnOrder, hiddenColumns, columnAggregations);
    }, [columnAggregations, columnOrder, currentTenantId, hiddenColumns, isGridConfigReady]);

    if (!isLoading && !canView) {
        return (
            <DashboardAccessDenied
                title="Acesso restrito às séries"
                message="Seu perfil pode entrar no sistema, mas não tem permissão para consultar ou manter o cadastro de séries desta escola."
            />
        );
    }

    const resetForm = () => {
        setEditingId(null);
        setFormData(EMPTY_FORM);
    };

    const openCreateModal = () => {
        resetForm();
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        resetForm();
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            setIsSaving(true);
            setErrorStatus(null);
            setSuccessStatus(null);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');

            const response = await fetch(editingId ? `${API_BASE_URL}/series/${editingId}` : `${API_BASE_URL}/series`, {
                method: editingId ? 'PATCH' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    name: formData.name,
                    code: formData.code || undefined,
                    sortOrder: formData.sortOrder ? Number(formData.sortOrder) : undefined,
                }),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Não foi possível salvar a série.');

            setSuccessStatus(editingId ? 'Série atualizada com sucesso.' : 'Série cadastrada com sucesso.');
            closeModal();
            await loadSeries();
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : 'Não foi possível salvar a série.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleEdit = (item: SeriesRecord) => {
        setEditingId(item.id);
        setFormData({
            name: item.name || '',
            code: item.code || '',
            sortOrder: item.sortOrder !== null && item.sortOrder !== undefined ? String(item.sortOrder) : '',
        });
        setIsModalOpen(true);
    };

    const openSeriesStatusModal = (item: SeriesRecord) => {
        setSeriesStatusToggleTarget(item);
        setSeriesStatusToggleAction(item.canceledAt ? 'activate' : 'deactivate');
    };

    const closeSeriesStatusModal = (force = false) => {
        if (!force && isProcessingSeriesToggle) return;
        setSeriesStatusToggleTarget(null);
        setSeriesStatusToggleAction(null);
    };

    const confirmSeriesStatusToggle = async () => {
        if (!seriesStatusToggleTarget || !seriesStatusToggleAction) return;
        const willActivate = seriesStatusToggleAction === 'activate';
        try {
            setIsProcessingSeriesToggle(true);
            const { token } = getDashboardAuthContext();
            if (!token) throw new Error('Token não encontrado, por favor faça login novamente.');
            const response = await fetch(`${API_BASE_URL}/series/${seriesStatusToggleTarget.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ active: willActivate }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || (willActivate ? 'Não foi possível ativar a série.' : 'Não foi possível inativar a série.'));
            setSuccessStatus(data?.message || (willActivate ? 'Série ativada com sucesso.' : 'Série inativada com sucesso.'));
            await loadSeries();
            closeSeriesStatusModal(true);
        } catch (error) {
            setErrorStatus(error instanceof Error ? error.message : (willActivate ? 'Não foi possível ativar a série.' : 'Não foi possível inativar a série.'));
        } finally {
            setIsProcessingSeriesToggle(false);
        }
    };

    const toggleSort = (column: SeriesColumnKey) => {
        setSortState((current) => ({
            column,
            direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const toggleExportColumn = (column: SeriesExportColumnKey) => {
        setExportColumns((current) => ({ ...current, [column]: !current[column] }));
    };

    const renderSeriesInfoButton = (item: SeriesRecord) => (
        <GridRecordPopover
            title={item.name}
            subtitle={item.code ? `Código: ${item.code}` : 'Série sem código informado'}
            buttonLabel={`Ver detalhes da série ${item.name}`}
            badges={[
                item.canceledAt ? 'INATIVA' : 'ATIVA',
                item.code || 'SEM CÓDIGO',
                item.sortOrder !== null && item.sortOrder !== undefined ? `ORDEM ${item.sortOrder}` : 'SEM ORDEM',
            ]}
            sections={[
                {
                    title: 'Cadastro',
                    items: [
                        { label: 'Série', value: item.name || 'Não informada' },
                        { label: 'Código', value: item.code || 'Não informado' },
                        { label: 'Ordem de aprendizado', value: item.sortOrder !== null && item.sortOrder !== undefined ? String(item.sortOrder) : 'Não informada' },
                        { label: 'Status', value: item.canceledAt ? 'INATIVA' : 'ATIVA' },
                        { label: 'Resumo', value: item.code ? `${item.name} (${item.code})` : item.name || 'Não informada' },
                    ],
                },
            ]}
            contextLabel="PRINCIPAL_SERIES_POPUP"
        />
    );

    const setAllExportColumns = (value: boolean) => {
        setExportColumns(
            SERIES_EXPORT_COLUMNS.reduce<Record<SeriesExportColumnKey, boolean>>((accumulator, column) => {
                accumulator[column.key] = value;
                return accumulator;
            }, {} as Record<SeriesExportColumnKey, boolean>),
        );
    };

    const toggleGridColumnVisibility = (columnKey: SeriesColumnKey) => {
        const isHidden = hiddenColumns.includes(columnKey);
        const visibleCount = SERIES_COLUMN_KEYS.length - hiddenColumns.length;
        if (!isHidden && visibleCount === 1) {
            setErrorStatus('Pelo menos uma coluna precisa continuar visível no grid.');
            return;
        }
        setHiddenColumns((current) => isHidden ? current.filter((item) => item !== columnKey) : [...current, columnKey]);
    };

    const moveGridColumn = (columnKey: SeriesColumnKey, direction: 'up' | 'down') => {
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
        setColumnOrder(SERIES_COLUMN_KEYS);
        setHiddenColumns(SERIES_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_SERIES_COLUMNS.includes(key)));
        setColumnAggregations({});
    };

    const handleColumnAggregationChange = (columnKey: SeriesColumnKey, aggregateType: 'sum' | 'avg' | 'min' | 'max' | 'count' | null) => {
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

    const renderSeriesGridCell = (item: SeriesRecord, columnKey: SeriesColumnKey) => {
        if (columnKey === 'name') {
            return (
                <td key={columnKey} className={`px-6 py-4 font-semibold ${item.canceledAt ? 'text-rose-800' : 'text-slate-800'}`}>
                    <div className="flex items-center gap-2">
                        <span>{item.name}</span>
                        <RecordStatusIndicator active={!item.canceledAt} />
                    </div>
                </td>
            );
        }
        if (columnKey === 'code') return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${item.canceledAt ? 'text-rose-700' : 'text-slate-600'}`}>{item.code || '---'}</td>;
        if (columnKey === 'recordStatus') {
            return (
                <td key={columnKey} className="px-6 py-4 text-center">
                    <RecordStatusIndicator active={!item.canceledAt} />
                </td>
            );
        }
        return <td key={columnKey} className={`px-6 py-4 text-sm font-medium ${item.canceledAt ? 'text-rose-700' : 'text-slate-600'}`}>{item.sortOrder ?? '---'}</td>;
    };

    return (
        <div className="w-full space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-[#153a6a] tracking-tight">Séries</h1>
                    <p className="text-slate-500 font-medium mt-1">Cadastre as séries pedagógicas da escola.</p>
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
                            Nova Série
                        </button>
                    ) : null}
                </div>
            </div>

            {errorStatus ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorStatus}</div> : null}
            {successStatus ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{successStatus}</div> : null}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="dashboard-band border-b px-6 py-4">
                    <div className="relative w-full max-w-xs">
                        <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar série..." className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="dashboard-table-head border-b border-slate-300 text-[13px] font-bold uppercase tracking-wider">
                                {visibleSeriesColumns.map((column) => (
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
                            {isLoading ? <tr><td colSpan={visibleSeriesColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">Carregando séries...</td></tr> : null}
                            {!isLoading && sortedFilteredSeries.length === 0 ? <tr><td colSpan={visibleSeriesColumns.length + 1} className="px-6 py-12 text-center font-medium text-slate-400">Nenhuma série cadastrada.</td></tr> : null}
                            {!isLoading && sortedFilteredSeries.map((item) => (
                                <tr key={item.id} className={item.canceledAt ? 'bg-rose-50/40 hover:bg-rose-50' : 'hover:bg-slate-50'}>
                                    {visibleSeriesColumns.map((column) => renderSeriesGridCell(item, column.key))}
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {renderSeriesInfoButton(item)}
                                            <GridRowActionIconButton title="Editar série" onClick={() => handleEdit(item)} tone="blue">
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </GridRowActionIconButton>
                                            <GridRowActionIconButton title={item.canceledAt ? 'Ativar série' : 'Inativar série'} onClick={() => openSeriesStatusModal(item)} tone={item.canceledAt ? 'emerald' : 'rose'}>
                                                {item.canceledAt ? (
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
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <GridFooterControls
                    key={`series-footer-${sortedFilteredSeries.length}`}
                    recordsCount={Number(sortedFilteredSeries.length)}
                    onOpenColumns={() => setIsGridConfigOpen(true)}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    activeLabel="Mostrar somente séries ativas"
                    allLabel="Mostrar séries ativas e inativas"
                    inactiveLabel="Mostrar somente séries inativas"
                    aggregateSummaries={aggregateSummaries}
                />
            </section>

            <GridColumnConfigModal
                isOpen={isGridConfigOpen}
                title="Configurar colunas do grid"
                description="Reordene, oculte ou inclua colunas do cadastro de séries nesta tela."
                columns={orderedSeriesColumns.map((column) => ({
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
                isOpen={Boolean(seriesStatusToggleTarget && seriesStatusToggleAction)}
                tenantId={currentTenantId}
                actionType={seriesStatusToggleAction || 'activate'}
                title={seriesStatusToggleAction === 'activate' ? 'Ativar série' : 'Inativar série'}
                itemLabel="Série"
                itemName={seriesStatusToggleTarget?.name || ''}
                description={seriesStatusToggleAction === 'activate'
                    ? 'Ao ativar uma série ela volta a ser ofertada para matrículas e aparecerá nos relatórios.'
                    : 'Ao inativar uma série ela sai das opções de turma, mas o histórico de registros permanece.'}
                hintText="A alteração fica registrada na trilha de auditoria da escola."
                confirmLabel={seriesStatusToggleAction === 'activate' ? 'Confirmar ativação' : 'Confirmar inativação'}
                onCancel={() => closeSeriesStatusModal(true)}
                onConfirm={confirmSeriesStatusToggle}
                isProcessing={isProcessingSeriesToggle}
                statusActive={!seriesStatusToggleTarget?.canceledAt}
            />

            <GridExportModal
                isOpen={isExportModalOpen}
                title="Exportar séries"
                description={`A exportação respeita a busca atual e inclui ${sortedFilteredSeries.length} registro(s).`}
                format={exportFormat}
                onFormatChange={setExportFormat}
                columns={SERIES_EXPORT_COLUMNS.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={exportColumns}
                onToggleColumn={toggleExportColumn}
                onSelectAll={setAllExportColumns}
                storageKey={getSeriesExportConfigStorageKey(currentTenantId)}
                onClose={() => setIsExportModalOpen(false)}
                onExport={async (config) => {
                    try {
                        await exportGridRows({
                            rows: sortedFilteredSeries,
                            columns: config?.orderedColumns
                                ? config.orderedColumns
                                    .map((key) => SERIES_EXPORT_COLUMNS.find((column) => column.key === key))
                                    .filter((column): column is GridColumnDefinition<SeriesRecord, SeriesExportColumnKey> => !!column)
                                : SERIES_EXPORT_COLUMNS,
                            selectedColumns: config?.selectedColumns || exportColumns,
                            format: exportFormat,
                            pdfOptions: config?.pdfOptions,
                            fileBaseName: 'series',
                            branding: {
                                title: 'Séries',
                                subtitle: 'Exportação com os filtros atualmente aplicados.',
                            },
                        });
                        setSuccessStatus(`Exportação ${exportFormat.toUpperCase()} preparada com ${sortedFilteredSeries.length} registro(s).`);
                        setIsExportModalOpen(false);
                    } catch (error) {
                        setErrorStatus(error instanceof Error ? error.message : 'Não foi possível exportar as séries.');
                    }
                }}
            />

            {isModalOpen ? (
                <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-xl font-bold text-[#153a6a]">{editingId ? 'Editar série' : 'Nova série'}</h2>
                            <button onClick={closeModal} className="text-slate-400 hover:text-red-500">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                <input required value={formData.name} onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value.toUpperCase() }))} placeholder="Nome da série" className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20" />
                                <input value={formData.code} onChange={(event) => setFormData((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="Código curto" className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20" />
                                <input value={formData.sortOrder} onChange={(event) => setFormData((current) => ({ ...current, sortOrder: event.target.value }))} placeholder="Ordem de aprendizado" className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20" />
                            </div>

                            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                                <button type="button" onClick={closeModal} className="px-5 py-2.5 text-slate-500 font-semibold hover:bg-slate-100 rounded-xl transition-colors text-sm">Cancelar</button>
                                <button type="submit" disabled={!canManage || isSaving} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-md shadow-blue-500/20 transition-all text-sm disabled:bg-slate-300 disabled:cursor-not-allowed">{isSaving ? 'Salvando...' : editingId ? 'Salvar edição' : 'Cadastrar série'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

