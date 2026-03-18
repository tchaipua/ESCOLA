'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MSINFOR_MASTER_SESSION_KEY, getStoredToken } from '@/app/lib/auth-storage';
import { readCachedTenantBranding } from '@/app/lib/tenant-branding-cache';
import {
    DEFAULT_GRID_PDF_OPTIONS,
    GridExportFormat,
    GridPdfFontScale,
    GridPdfLineClamp,
    GridPdfOptions,
    GridPdfOrientation,
    GridPdfRowDensity,
    GridPdfWidthStrategy,
    normalizeGridPdfOptions,
} from '@/app/lib/grid-export-utils';
import { fetchUserPreference, saveUserPreference } from '@/app/lib/user-preferences';

type ExportColumn<ColumnKey extends string> = { key: ColumnKey; label: string };

type GridExportModalProps<ColumnKey extends string> = {
    isOpen: boolean;
    title: string;
    description: string;
    format: GridExportFormat;
    onFormatChange: (format: GridExportFormat) => void;
    columns: ExportColumn<ColumnKey>[];
    selectedColumns: Record<ColumnKey, boolean>;
    onToggleColumn: (column: ColumnKey) => void;
    onSelectAll: (value: boolean) => void;
    storageKey?: string;
    legacyStorageKeys?: string[];
    onClose: () => void;
    onExport: (config?: {
        selectedColumns: Record<ColumnKey, boolean>;
        orderedColumns: ColumnKey[];
        orderedVisibleColumns: ExportColumn<ColumnKey>[];
        pdfOptions?: GridPdfOptions;
    }) => void;
};

type StoredExportConfig = {
    order?: string[];
    selected?: Record<string, boolean>;
    pdfOptions?: Partial<GridPdfOptions>;
    schemaVersion?: number;
};

type ExportViewMode = 'columns' | 'pdf';

const EXPORT_CONFIG_SCHEMA_VERSION = 5;

function decodeTokenPayload(token: string) {
    try {
        const base64 = token.split('.')[1];
        if (!base64) return null;
        const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        return JSON.parse(atob(padded)) as { userId?: string; tenantId?: string };
    } catch {
        return null;
    }
}

function getDefaultStorageKey(title: string) {
    if (typeof window === 'undefined') return null;
    const pathname = window.location.pathname.replace(/[^\w/-]+/g, '-');
    const token = getStoredToken();
    const payload = token ? decodeTokenPayload(token) : null;
    const userId = payload?.userId || (window.sessionStorage.getItem(MSINFOR_MASTER_SESSION_KEY) === 'true' ? 'master' : 'anonymous');
    const tenantId = payload?.tenantId || 'global';
    const titleKey = title.toLowerCase().replace(/[^\w]+/g, '-');
    return `grid-export:${pathname}:${tenantId}:${userId}:${titleKey}`;
}

function getDefaultStorageKeyCandidates(title: string) {
    if (typeof window === 'undefined') return [] as string[];
    const pathname = window.location.pathname.replace(/[^\w/-]+/g, '-');
    const token = getStoredToken();
    const payload = token ? decodeTokenPayload(token) : null;
    const userId = payload?.userId || (window.sessionStorage.getItem(MSINFOR_MASTER_SESSION_KEY) === 'true' ? 'master' : 'anonymous');
    const tenantId = payload?.tenantId || 'global';
    const titleKey = title.toLowerCase().replace(/[^\w]+/g, '-');
    const candidates = new Set<string>([`grid-export:${pathname}:${tenantId}:${userId}:${titleKey}`]);
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 1) {
        candidates.add(`grid-export:/${segments.slice(0, -1).join('/')}:${tenantId}:${userId}:${titleKey}`);
    }
    return Array.from(candidates);
}

function normalizeOrder<ColumnKey extends string>(order: string[] | undefined, allKeys: ColumnKey[]) {
    const validKeys = order?.filter((item): item is ColumnKey => allKeys.includes(item as ColumnKey)) || [];
    return [...validKeys, ...allKeys.filter((key) => !validKeys.includes(key))];
}

function normalizeSelectedColumns<ColumnKey extends string>(selected: Record<string, boolean> | undefined, baseSelected: Record<ColumnKey, boolean>, allKeys: ColumnKey[]) {
    const next = { ...baseSelected };
    allKeys.forEach((key) => {
        if (typeof selected?.[key] === 'boolean') next[key] = Boolean(selected[key]);
    });
    return next;
}

function readLocalStoredExportConfig(storageKey: string | null): StoredExportConfig | null {
    if (!storageKey || typeof window === 'undefined') return null;
    try {
        const rawValue = window.localStorage.getItem(storageKey);
        return rawValue ? JSON.parse(rawValue) as StoredExportConfig : null;
    } catch {
        return null;
    }
}

async function readRemoteStoredExportConfig(storageKey: string | null): Promise<StoredExportConfig | null> {
    if (!storageKey) return null;
    try {
        return await fetchUserPreference<StoredExportConfig>(storageKey);
    } catch {
        return null;
    }
}

function persistStoredExportConfig<ColumnKey extends string>(storageKey: string, orderedColumns: ColumnKey[], selectedColumns: Record<ColumnKey, boolean>, pdfOptions: GridPdfOptions) {
    if (typeof window === 'undefined') return;
    const payload: StoredExportConfig = { schemaVersion: EXPORT_CONFIG_SCHEMA_VERSION, order: orderedColumns, selected: selectedColumns, pdfOptions };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
    void saveUserPreference(storageKey, payload).catch(() => undefined);
}

function renderExportFormatIcon(format: GridExportFormat) {
    if (format === 'excel') return <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8m-5-5l5 5m-9 4l4 6m0-6l-4 6" /></svg>;
    if (format === 'csv') return <svg className="h-6 w-6 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7h8M8 12h8M8 17h5M5 5h.01M5 10h.01M5 15h.01M5 20h.01" /></svg>;
    if (format === 'pdf') return <svg className="h-6 w-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zm7 0v5h5M8 15h8M8 11h4" /></svg>;
    if (format === 'json') return <svg className="h-6 w-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5c-2 0-3 1-3 3v2c0 1.5-.5 2.5-2 3 1.5.5 2 1.5 2 3v2c0 2 1 3 3 3m6-16c2 0 3 1 3 3v2c0 1.5.5 2.5 2 3-1.5.5-2 1.5-2 3v2c0 2-1 3-3 3" /></svg>;
    return <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2zm3 4h4M8 12h8M8 16h6" /></svg>;
}

function renderChoiceCard({ title, description, isActive, onClick, compact = false }: { title: string; description: string; isActive: boolean; onClick: () => void; compact?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-2xl border text-left transition-all ${compact ? 'px-3 py-3' : 'px-4 py-4'} ${isActive ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm ring-2 ring-blue-100' : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50'}`}
        >
            <div className={`${compact ? 'text-[13px]' : 'text-sm'} font-bold`}>{title}</div>
            <div className={`mt-1 ${compact ? 'text-[11px] leading-4' : 'text-xs'} font-medium text-slate-500`}>{description}</div>
        </button>
    );
}

const pdfLabels = {
    orientation: (value: GridPdfOrientation) => value === 'landscape' ? 'Paisagem' : 'Retrato',
    rowDensity: (value: GridPdfRowDensity) => value === 'compact' ? 'Compacta' : value === 'spacious' ? 'Arejada' : 'Equilibrada',
    fontScale: (value: GridPdfFontScale) => value === 'small' ? 'Pequena' : value === 'large' ? 'Grande' : 'Média',
    widthStrategy: (value: GridPdfWidthStrategy) => value === 'compact' ? 'Compacta' : value === 'detailed' ? 'Detalhada' : 'Equilibrada',
    lineClamp: (value: GridPdfLineClamp) => value === 0 ? 'Livre' : `${value} linha(s)`,
    presentation: (value: boolean) => value ? 'Com cabeçalho' : 'Descrição no campo',
};

export default function GridExportModal<ColumnKey extends string>(props: GridExportModalProps<ColumnKey>) {
    const {
        isOpen, title, description, format, onFormatChange, columns, selectedColumns,
        storageKey, legacyStorageKeys = [], onClose, onExport,
    } = props;
    const effectiveStorageKey = useMemo(() => storageKey || getDefaultStorageKey(title), [storageKey, title]);
    const automaticLegacyStorageKeys = useMemo(() => (storageKey ? getDefaultStorageKeyCandidates(title).filter((key) => key !== storageKey) : []), [storageKey, title]);
    const allColumnKeys = useMemo(() => columns.map((column) => column.key), [columns]);
    const allColumnKeysSignature = useMemo(() => allColumnKeys.join('|'), [allColumnKeys]);
    const [orderedColumns, setOrderedColumns] = useState<ColumnKey[]>(allColumnKeys);
    const [localSelectedColumns, setLocalSelectedColumns] = useState<Record<ColumnKey, boolean>>(selectedColumns);
    const [pdfOptions, setPdfOptions] = useState<GridPdfOptions>(DEFAULT_GRID_PDF_OPTIONS);
    const [isConfigHydrated, setIsConfigHydrated] = useState(false);
    const [draggedColumnKey, setDraggedColumnKey] = useState<ColumnKey | null>(null);
    const [activeColumnKey, setActiveColumnKey] = useState<ColumnKey | null>(null);
    const [viewMode, setViewMode] = useState<ExportViewMode>('columns');
    const selectedColumnsRef = useRef(selectedColumns);
    const mergedLegacyStorageKeysRef = useRef<string[]>([]);
    const mergedLegacyStorageKeys = useMemo(() => Array.from(new Set([...legacyStorageKeys, ...automaticLegacyStorageKeys])), [automaticLegacyStorageKeys, legacyStorageKeys]);
    const legacyStorageKeysSignature = useMemo(() => mergedLegacyStorageKeys.join('|'), [mergedLegacyStorageKeys]);
    const tenantBranding = useMemo(() => {
        if (typeof window === 'undefined') return null;
        const token = getStoredToken();
        const tenantId = token ? decodeTokenPayload(token)?.tenantId : null;
        return readCachedTenantBranding(tenantId);
    }, []);

    useEffect(() => { selectedColumnsRef.current = selectedColumns; }, [selectedColumns]);
    useEffect(() => { mergedLegacyStorageKeysRef.current = mergedLegacyStorageKeys; }, [legacyStorageKeysSignature, mergedLegacyStorageKeys]);
    useEffect(() => {
        if (!isOpen) {
            setViewMode('columns');
            setDraggedColumnKey(null);
            setActiveColumnKey(null);
            return;
        }

        const defaultOrder = [...allColumnKeys];
        const defaultSelected = { ...selectedColumnsRef.current };
        setIsConfigHydrated(false);
        setActiveColumnKey(null);
        setViewMode('columns');

        if (!effectiveStorageKey || typeof window === 'undefined') {
            setOrderedColumns(defaultOrder);
            setLocalSelectedColumns(defaultSelected);
            setPdfOptions(DEFAULT_GRID_PDF_OPTIONS);
            setIsConfigHydrated(true);
            return;
        }

        let isMounted = true;
        const loadConfig = async () => {
            try {
                const localCurrentConfig = readLocalStoredExportConfig(effectiveStorageKey);
                const remoteCurrentConfig = await readRemoteStoredExportConfig(effectiveStorageKey);
                const versionedCurrentConfig =
                    remoteCurrentConfig?.schemaVersion === EXPORT_CONFIG_SCHEMA_VERSION
                        ? remoteCurrentConfig
                        : localCurrentConfig?.schemaVersion === EXPORT_CONFIG_SCHEMA_VERSION
                            ? localCurrentConfig
                            : null;
                let selectedConfig = versionedCurrentConfig;

                if (!selectedConfig) {
                    for (const legacyStorageKey of mergedLegacyStorageKeysRef.current) {
                        const localLegacyConfig = readLocalStoredExportConfig(legacyStorageKey);
                        const remoteLegacyConfig = await readRemoteStoredExportConfig(legacyStorageKey);
                        const legacyConfig = remoteLegacyConfig || localLegacyConfig;
                        if (legacyConfig) {
                            selectedConfig = legacyConfig;
                            break;
                        }
                    }
                }

                if (!selectedConfig) selectedConfig = remoteCurrentConfig || localCurrentConfig;

                const normalizedOrder = normalizeOrder(selectedConfig?.order, defaultOrder);
                const normalizedSelected = normalizeSelectedColumns(selectedConfig?.selected, defaultSelected, defaultOrder);
                const normalizedPdfOptions = normalizeGridPdfOptions(selectedConfig?.pdfOptions);
                if (!isMounted) return;

                setOrderedColumns(normalizedOrder);
                setLocalSelectedColumns(normalizedSelected);
                setPdfOptions(normalizedPdfOptions);
                persistStoredExportConfig(effectiveStorageKey, normalizedOrder, normalizedSelected, normalizedPdfOptions);
                setIsConfigHydrated(true);
            } catch {
                if (!isMounted) return;
                setOrderedColumns(defaultOrder);
                setLocalSelectedColumns(defaultSelected);
                setPdfOptions(DEFAULT_GRID_PDF_OPTIONS);
                setIsConfigHydrated(true);
            }
        };

        void loadConfig();
        return () => {
            isMounted = false;
        };
    }, [allColumnKeysSignature, effectiveStorageKey, isOpen, legacyStorageKeysSignature]);

    useEffect(() => {
        if (!isOpen || !isConfigHydrated || !effectiveStorageKey || typeof window === 'undefined') return;
        persistStoredExportConfig(effectiveStorageKey, orderedColumns, localSelectedColumns, pdfOptions);
    }, [effectiveStorageKey, isConfigHydrated, isOpen, localSelectedColumns, orderedColumns, pdfOptions]);

    useEffect(() => {
        if (!isOpen || format === 'pdf') return;
        setViewMode('columns');
    }, [format, isOpen]);

    const orderedExportColumns = useMemo(
        () => orderedColumns.map((key) => columns.find((column) => column.key === key)).filter((column): column is ExportColumn<ColumnKey> => !!column),
        [columns, orderedColumns],
    );
    const displayOrderedExportColumns = useMemo(() => {
        const selected = orderedExportColumns.filter((column) => localSelectedColumns[column.key]);
        const unselected = orderedExportColumns.filter((column) => !localSelectedColumns[column.key]);
        return [...selected, ...unselected];
    }, [localSelectedColumns, orderedExportColumns]);
    const selectedCount = useMemo(() => Object.values(localSelectedColumns).filter(Boolean).length, [localSelectedColumns]);

    const updatePdfOptions = (nextOptions: Partial<GridPdfOptions>) => {
        setPdfOptions((current) => normalizeGridPdfOptions({ ...current, ...nextOptions }));
    };

    const toggleLocalColumn = (columnKey: ColumnKey) => {
        setLocalSelectedColumns((current) => {
            const nextValue = !current[columnKey];
            return { ...current, [columnKey]: nextValue };
        });
    };

    const setAllLocalColumns = (value: boolean) => {
        setLocalSelectedColumns((current) => {
            return orderedExportColumns.reduce<Record<ColumnKey, boolean>>((accumulator, column) => {
                accumulator[column.key] = value;
                return accumulator;
            }, { ...current });
        });
    };

    const moveColumnToIndex = (columnKey: ColumnKey, targetIndex: number) => {
        setOrderedColumns((current) => {
            const currentDisplayOrder = current
                .map((key) => columns.find((column) => column.key === key))
                .filter((column): column is ExportColumn<ColumnKey> => !!column)
                .sort((left, right) => {
                    const leftSelected = localSelectedColumns[left.key] ? 0 : 1;
                    const rightSelected = localSelectedColumns[right.key] ? 0 : 1;
                    if (leftSelected !== rightSelected) return leftSelected - rightSelected;
                    return current.indexOf(left.key) - current.indexOf(right.key);
                })
                .map((column) => column.key);

            const currentIndex = currentDisplayOrder.indexOf(columnKey);
            if (currentIndex === -1 || targetIndex < 0 || targetIndex >= currentDisplayOrder.length || currentIndex === targetIndex) {
                return current;
            }

            const nextDisplayOrder = [...currentDisplayOrder];
            const [movedItem] = nextDisplayOrder.splice(currentIndex, 1);
            nextDisplayOrder.splice(targetIndex, 0, movedItem);
            return nextDisplayOrder;
        });
    };

    const handlePrimaryAction = () => {
        if (format === 'pdf' && viewMode === 'columns') {
            setViewMode('pdf');
            return;
        }
        onExport({
            selectedColumns: localSelectedColumns,
            orderedColumns,
            orderedVisibleColumns: orderedExportColumns,
            pdfOptions,
        });
    };

    if (!isOpen) return null;

    const renderSummaryCard = (label: string, value: string) => (
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
            <div className="mt-1 text-sm font-semibold text-slate-700">{value}</div>
        </div>
    );

    const renderPdfScreen = () => (
        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-4">
                <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">Layout PDF</div>
                    <div className="mt-1.5 text-xl font-bold text-[#153a6a]">Monte o relatório do seu jeito</div>
                    <p className="mt-1.5 text-xs font-medium leading-5 text-slate-500">Estas preferências ficam gravadas para o usuário logado e já voltam prontas na próxima exportação em PDF desta tela.</p>
                </div>
                <div className="space-y-3">
                    <div>
                        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Orientação da página</div>
                        <div className="grid gap-3 md:grid-cols-2">
                            {renderChoiceCard({ title: 'Retrato', description: 'Melhor para poucas colunas e leitura mais vertical.', isActive: pdfOptions.orientation === 'portrait', onClick: () => updatePdfOptions({ orientation: 'portrait' }), compact: true })}
                            {renderChoiceCard({ title: 'Paisagem', description: 'Ideal para relatórios mais largos e várias colunas.', isActive: pdfOptions.orientation === 'landscape', onClick: () => updatePdfOptions({ orientation: 'landscape' }), compact: true })}
                        </div>
                    </div>
                    <div>
                        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Leitura por registro</div>
                        <div className="grid gap-3 md:grid-cols-3">
                            {([
                                { key: 'compact', title: 'Compacta', description: 'Mais registros por página.' },
                                { key: 'comfortable', title: 'Equilibrada', description: 'Boa leitura sem desperdiçar espaço.' },
                                { key: 'spacious', title: 'Arejada', description: 'Mais respiro visual por linha.' },
                            ] as Array<{ key: GridPdfRowDensity; title: string; description: string }>).map((option) => (
                                <div key={option.key}>{renderChoiceCard({ title: option.title, description: option.description, isActive: pdfOptions.rowDensity === option.key, onClick: () => updatePdfOptions({ rowDensity: option.key }), compact: true })}</div>
                            ))}
                        </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                {pdfOptions.showColumnHeaders ? 'Linhas por campo' : 'Linhas automáticas'}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {([
                                    { key: 1, title: '1 linha', description: 'Máxima compactação por campo.' },
                                    { key: 2, title: '2 linhas', description: 'Boa leitura para textos médios.' },
                                    { key: 3, title: '3 linhas', description: 'Mais contexto por célula.' },
                                    { key: 0, title: 'Livre', description: 'Não corta o conteúdo do campo.' },
                                ] as Array<{ key: GridPdfLineClamp; title: string; description: string }>).map((option) => (
                                    <div key={option.title}>{renderChoiceCard({
                                        title: option.title,
                                        description: pdfOptions.showColumnHeaders
                                            ? option.description
                                            : option.key === 0
                                                ? 'Recomendado para mostrar todo o conteúdo do registro sem cortes.'
                                                : 'No modo sem cabeçalho, o registro cresce automaticamente e não corta o conteúdo.',
                                        isActive: pdfOptions.lineClamp === option.key,
                                        onClick: () => updatePdfOptions({ lineClamp: option.key }),
                                        compact: true,
                                    })}</div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Apresentação dos campos</div>
                            <div className="grid gap-3">
                                <div>{renderChoiceCard({ title: 'Com cabeçalho de colunas', description: 'Mantém o cabeçalho tradicional no topo da tabela.', isActive: pdfOptions.showColumnHeaders, onClick: () => updatePdfOptions({ showColumnHeaders: true }), compact: true })}</div>
                                <div>{renderChoiceCard({ title: 'Sem cabeçalho, com descrição no campo', description: 'Cada campo sai alinhado com a descrição à esquerda e o conteúdo completo à direita, sem cortes.', isActive: !pdfOptions.showColumnHeaders, onClick: () => updatePdfOptions({ showColumnHeaders: false }), compact: true })}</div>
                            </div>
                        </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Espaço ocupado pelos campos</div>
                            <div className="grid gap-3">
                                {([
                                    { key: 'compact', title: 'Compacta', description: 'Aperta colunas e cabe mais informação na página.' },
                                    { key: 'balanced', title: 'Equilibrada', description: 'Distribui bem a largura entre os campos.' },
                                    { key: 'detailed', title: 'Detalhada', description: 'Dá mais liberdade para campos longos ocuparem espaço.' },
                                ] as Array<{ key: GridPdfWidthStrategy; title: string; description: string }>).map((option) => (
                                    <div key={option.key}>{renderChoiceCard({ title: option.title, description: option.description, isActive: pdfOptions.widthStrategy === option.key, onClick: () => updatePdfOptions({ widthStrategy: option.key }), compact: true })}</div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Escala da fonte</div>
                            <div className="grid gap-3 sm:grid-cols-3">
                                {([
                                    { key: 'small', title: 'Pequena' },
                                    { key: 'medium', title: 'Média' },
                                    { key: 'large', title: 'Grande' },
                                ] as Array<{ key: GridPdfFontScale; title: string }>).map((option) => (
                                    <div key={option.key}>{renderChoiceCard({ title: option.title, description: 'Ajuste rápido para caber mais ou melhorar a leitura.', isActive: pdfOptions.fontScale === option.key, onClick: () => updatePdfOptions({ fontScale: option.key }), compact: true })}</div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Acabamento visual</div>
                            <button
                                type="button"
                                onClick={() => updatePdfOptions({ showRowStripes: !pdfOptions.showRowStripes })}
                                className={`flex w-full items-start justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition-all ${pdfOptions.showRowStripes ? 'border-blue-300 bg-blue-50 text-blue-700 ring-2 ring-blue-100' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
                            >
                                <div>
                                    <div className="text-[13px] font-bold">Alternar linhas com faixa suave</div>
                                    <div className="mt-1 text-[11px] leading-4 font-medium text-slate-500">Facilita a leitura horizontal em relatórios com muitas colunas.</div>
                                </div>
                                <div className={`mt-1 inline-flex h-6 w-11 rounded-full transition-colors ${pdfOptions.showRowStripes ? 'bg-blue-600' : 'bg-slate-300'}`}>
                                    <span className={`m-0.5 h-5 w-5 rounded-full bg-white transition-transform ${pdfOptions.showRowStripes ? 'translate-x-5' : 'translate-x-0'}`} />
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Resumo salvo</div>
                    <div className="mt-1.5 text-base font-bold text-[#153a6a]">Prévia do layout</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {renderSummaryCard('Orientação', pdfLabels.orientation(pdfOptions.orientation))}
                        {renderSummaryCard('Leitura', pdfLabels.rowDensity(pdfOptions.rowDensity))}
                        {renderSummaryCard(pdfOptions.showColumnHeaders ? 'Linhas por campo' : 'Quebra do conteúdo', pdfOptions.showColumnHeaders ? pdfLabels.lineClamp(pdfOptions.lineClamp) : 'Automática')}
                        {renderSummaryCard('Apresentação', pdfLabels.presentation(pdfOptions.showColumnHeaders))}
                        {renderSummaryCard('Largura', pdfLabels.widthStrategy(pdfOptions.widthStrategy))}
                        {renderSummaryCard('Fonte', pdfLabels.fontScale(pdfOptions.fontScale))}
                    </div>
                </div>
                <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
                    <div className="text-sm font-bold text-emerald-800">Dica rápida</div>
                    <p className="mt-1.5 text-xs font-medium leading-5 text-emerald-700">Para relatórios mais largos, combine <strong>Paisagem</strong> com largura <strong>Detalhada</strong>. Para impressão econômica, use leitura <strong>Compacta</strong> com fonte <strong>Pequena</strong>.</p>
                </div>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[56] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-4">
                    <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            {tenantBranding?.logoUrl ? (
                                <img
                                    src={tenantBranding.logoUrl}
                                    alt={tenantBranding.schoolName}
                                    className="h-full w-full object-contain"
                                />
                            ) : (
                                <span className="text-sm font-black tracking-[0.25em] text-[#153a6a]">
                                    {String(tenantBranding?.schoolName || 'ESCOLA').slice(0, 3).toUpperCase()}
                                </span>
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-blue-600">
                                {tenantBranding?.schoolName || 'Escola'}
                            </div>
                            <h2 className="truncate text-xl font-bold text-[#153a6a]">{title}</h2>
                            <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-red-500">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {viewMode === 'columns' ? (
                        <div className="flex min-h-0 flex-1 flex-col">
                            <div className="shrink-0 space-y-6">
                                <div>
                                    <div className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Formato do arquivo</div>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                                        {[
                                            { value: 'excel', label: 'Excel (.xls)', detail: 'Planilha pronta para abrir no Excel' },
                                            { value: 'csv', label: 'CSV (.csv)', detail: 'Arquivo leve para importação' },
                                            { value: 'pdf', label: 'PDF', detail: 'Abre a etapa de layout profissional' },
                                            { value: 'json', label: 'JSON (.json)', detail: 'Estrutura de dados em JSON' },
                                            { value: 'txt', label: 'Texto (.txt)', detail: 'Texto simples do grid' },
                                        ].map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => onFormatChange(option.value as GridExportFormat)}
                                                className={`rounded-2xl border px-4 py-4 text-left transition-all ${format === option.value ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${option.value === 'excel' ? 'bg-emerald-50' : option.value === 'csv' ? 'bg-sky-50' : option.value === 'pdf' ? 'bg-rose-50' : option.value === 'json' ? 'bg-violet-50' : 'bg-amber-50'}`}>
                                                        {renderExportFormatIcon(option.value as GridExportFormat)}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold">{option.label}</div>
                                                        <div className="mt-1 text-xs font-medium text-slate-500">{option.detail}</div>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="border-b border-slate-100 pb-4">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-bold uppercase tracking-wide text-slate-500">Colunas da exportação</div>
                                            <p className="mt-1 text-sm text-slate-500">As colunas selecionadas aparecem primeiro. Desmarque apenas o que não quiser levar.</p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-500">{selectedCount} coluna(s) ativa(s)</div>
                                            <button type="button" onClick={() => setAllLocalColumns(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Marcar todas</button>
                                            <button type="button" onClick={() => setAllLocalColumns(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Limpar todas</button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {displayOrderedExportColumns.map((column, index) => (
                                        <div
                                            key={column.key}
                                            draggable
                                            onClick={() => setActiveColumnKey(column.key)}
                                            onDragStart={() => { setActiveColumnKey(column.key); setDraggedColumnKey(column.key); }}
                                            onDragEnd={() => setDraggedColumnKey(null)}
                                            onDragOver={(event) => { event.preventDefault(); }}
                                            onDrop={() => {
                                                if (!draggedColumnKey) return;
                                                setActiveColumnKey(draggedColumnKey);
                                                moveColumnToIndex(draggedColumnKey, index);
                                                setDraggedColumnKey(null);
                                            }}
                                            className={`flex cursor-grab items-center justify-between gap-3 rounded-2xl border px-4 py-4 transition-colors active:cursor-grabbing ${activeColumnKey === column.key || draggedColumnKey === column.key ? 'border-emerald-300 bg-emerald-200/90 ring-2 ring-emerald-300' : 'border-slate-200 bg-white'}`}
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <span className="text-xs font-black uppercase tracking-wide text-slate-400">{`${index + 1}º`}</span>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        toggleLocalColumn(column.key);
                                                    }}
                                                    aria-pressed={localSelectedColumns[column.key]}
                                                    aria-label={localSelectedColumns[column.key] ? `Remover campo ${column.label} da exportação` : `Adicionar campo ${column.label} na exportação`}
                                                    title={localSelectedColumns[column.key] ? 'Este campo esta sendo usado na exportação' : 'Este campo nao esta sendo usado na exportação'}
                                                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 shadow-sm transition-transform hover:scale-105 ${
                                                        localSelectedColumns[column.key]
                                                            ? 'border-emerald-200 bg-emerald-500 text-white shadow-emerald-200/70'
                                                            : 'border-red-200 bg-red-500 text-white shadow-red-200/70'
                                                    }`}
                                                >
                                                    {localSelectedColumns[column.key] ? (
                                                        <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    ) : (
                                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M6 6l12 12M18 6L6 18" />
                                                        </svg>
                                                    )}
                                                </button>
                                                <span className="truncate text-sm font-medium text-slate-700">{column.label}</span>
                                            </div>
                                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500" title="Clique e segure para arrastar este campo">
                                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
                                                </svg>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : renderPdfScreen()}
                </div>

                <div className="flex shrink-0 flex-wrap justify-between gap-3 border-t border-slate-100 bg-white px-6 py-5">
                    <div>
                        {viewMode === 'pdf' ? (
                            <button type="button" onClick={() => setViewMode('columns')} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                                Voltar para colunas
                            </button>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap justify-end gap-3">
                        <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancelar</button>
                        <button type="button" onClick={handlePrimaryAction} className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-500">
                            {format === 'pdf' && viewMode === 'columns' ? 'Avançar para layout PDF' : 'Exportar agora'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
