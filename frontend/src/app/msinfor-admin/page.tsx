'use client';

import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import GridColumnConfigModal from '@/app/components/grid-column-config-modal';
import GridRecordPopover from '@/app/components/grid-record-popover';
import GridRowActionIconButton from '@/app/components/grid-row-action-icon-button';
import { MSINFOR_MASTER_SESSION_KEY } from '@/app/lib/auth-storage';
import { readImageFileAsDataUrl } from '@/app/lib/dashboard-crud-utils';
import GridExportModal from '@/app/components/grid-export-modal';
import GridSortableHeader from '@/app/components/grid-sortable-header';
import { getAllGridColumnKeys, getDefaultVisibleGridColumnKeys, loadGridColumnConfig, type ConfigurableGridColumn, writeGridColumnConfig } from '@/app/lib/grid-column-config-utils';
import { buildDefaultExportColumns, buildExportColumnsFromGridColumns, exportGridRows, sortGridRows, type GridColumnDefinition, type GridExportFormat, type GridSortState } from '@/app/lib/grid-export-utils';
import GlobalSettingsModal, { DEFAULT_GENERAL_SETTINGS, type GeneralSettingsForm, type GeneralSettingsTab } from './components/global-settings-modal';
import TenantAccessManager from './components/tenant-access-manager';

type TenantRecord = {
    id: string;
    name: string;
    document?: string | null;
    logoUrl?: string | null;
    createdAt: string;
    users?: Array<{
        name?: string | null;
        email?: string | null;
    }>;
};

type EmailUsageRecord = {
    entityType: string;
    recordId: string;
    recordName: string;
    tenantName: string;
    document?: string | null;
    currentEmail: string;
    updatedAt: string;
    updatedBy?: string | null;
};

type TenantColumnKey = 'id' | 'name' | 'document' | 'admin' | 'createdAt';
type TenantExportColumnKey = TenantColumnKey;
type EmailUsageColumnKey = 'entityType' | 'recordId' | 'recordName' | 'tenantName' | 'document' | 'currentEmail' | 'updatedAt' | 'updatedBy';
type EmailUsageExportColumnKey = EmailUsageColumnKey;

const TENANT_COLUMNS: ConfigurableGridColumn<TenantRecord, TenantColumnKey>[] = [
    { key: 'id', label: 'ID da escola', getValue: (row) => row.id || '---', visibleByDefault: false },
    { key: 'name', label: 'Tenant ID (Escola)', getValue: (row) => row.name || '---' },
    { key: 'document', label: 'Documento / CNPJ', getValue: (row) => row.document || 'NÃO INFORMADO' },
    { key: 'admin', label: 'Admin titular master', getValue: (row) => row.users?.[0]?.name || row.users?.[0]?.email || '---' },
    { key: 'createdAt', label: 'Data de registro', getValue: (row) => new Date(row.createdAt).toLocaleDateString(), getSortValue: (row) => new Date(row.createdAt).getTime() },
];
const TENANT_EXPORT_COLUMNS: GridColumnDefinition<TenantRecord, TenantExportColumnKey>[] = buildExportColumnsFromGridColumns(
    TENANT_COLUMNS,
);

const EMAIL_USAGE_COLUMNS: ConfigurableGridColumn<EmailUsageRecord, EmailUsageColumnKey>[] = [
    { key: 'entityType', label: 'Tipo', getValue: (row) => row.entityType || '---' },
    { key: 'recordId', label: 'ID do registro', getValue: (row) => row.recordId || '---', visibleByDefault: false },
    { key: 'recordName', label: 'Registro', getValue: (row) => row.recordName || '---' },
    { key: 'tenantName', label: 'Escola', getValue: (row) => row.tenantName || '---' },
    { key: 'document', label: 'Documento / CNPJ', getValue: (row) => row.document || 'NÃO INFORMADO', visibleByDefault: false },
    { key: 'currentEmail', label: 'E-mail atual', getValue: (row) => row.currentEmail || '---' },
    { key: 'updatedAt', label: 'Última auditoria', getValue: (row) => new Date(row.updatedAt).toLocaleDateString(), getSortValue: (row) => new Date(row.updatedAt).getTime() },
    { key: 'updatedBy', label: 'Atualizado por', getValue: (row) => row.updatedBy || '---', visibleByDefault: false },
];
const EMAIL_USAGE_EXPORT_COLUMNS: GridColumnDefinition<EmailUsageRecord, EmailUsageExportColumnKey>[] = buildExportColumnsFromGridColumns(
    EMAIL_USAGE_COLUMNS,
);
const TENANT_COLUMN_KEYS = getAllGridColumnKeys(TENANT_COLUMNS);
const EMAIL_USAGE_COLUMN_KEYS = getAllGridColumnKeys(EMAIL_USAGE_COLUMNS);
const DEFAULT_VISIBLE_TENANT_COLUMNS = getDefaultVisibleGridColumnKeys(TENANT_COLUMNS);
const DEFAULT_VISIBLE_EMAIL_USAGE_COLUMNS = getDefaultVisibleGridColumnKeys(EMAIL_USAGE_COLUMNS);

const DEFAULT_TENANT_SORT: GridSortState<TenantColumnKey> = {
    column: 'name',
    direction: 'asc',
};

const DEFAULT_EMAIL_USAGE_SORT: GridSortState<EmailUsageColumnKey> = {
    column: 'updatedAt',
    direction: 'desc',
};

function getTenantGridConfigStorageKey() {
    return 'msinfor-admin:tenants:grid-config';
}

function getEmailUsageGridConfigStorageKey() {
    return 'msinfor-admin:email-usage:grid-config';
}

function getTenantExportConfigStorageKey() {
    return 'msinfor-admin:tenants:export-config';
}

function getEmailUsageExportConfigStorageKey() {
    return 'msinfor-admin:email-usage:export-config';
}

export default function MsinforAdminPage() {
    const [escolas, setEscolas] = useState<TenantRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [errorStatus, setErrorStatus] = useState<string | null>(null);
    const [isMasterLogged, setIsMasterLogged] = useState(false);
    const [masterPassword, setMasterPassword] = useState('');
    const [loginError, setLoginError] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState(1);
    const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
    const [emailQuery, setEmailQuery] = useState('');
    const [emailUsageResults, setEmailUsageResults] = useState<EmailUsageRecord[]>([]);
    const [emailUsageLoading, setEmailUsageLoading] = useState(false);
    const [emailUsageError, setEmailUsageError] = useState<string | null>(null);
    const [emailUsageSuccess, setEmailUsageSuccess] = useState<string | null>(null);
    const [emailUsageSearched, setEmailUsageSearched] = useState(false);
    const [editingEmailUsage, setEditingEmailUsage] = useState<any | null>(null);
    const [replacementEmail, setReplacementEmail] = useState('');
    const [emailUpdateLoading, setEmailUpdateLoading] = useState(false);
    const [accessTenant, setAccessTenant] = useState<any | null>(null);
    const [isGeneralSettingsOpen, setIsGeneralSettingsOpen] = useState(false);
    const [generalSettingsTab, setGeneralSettingsTab] = useState<GeneralSettingsTab>('s3');
    const [generalSettings, setGeneralSettings] = useState<GeneralSettingsForm>(DEFAULT_GENERAL_SETTINGS);
    const [generalSettingsStatus, setGeneralSettingsStatus] = useState<string | null>(null);
    const [isGeneralSettingsLoading, setIsGeneralSettingsLoading] = useState(false);
    const [isGeneralSettingsTesting, setIsGeneralSettingsTesting] = useState(false);
    const [generalSettingsTestResult, setGeneralSettingsTestResult] = useState<{
        tone: 'success' | 'error';
        title: string;
        message: string;
        details?: string[];
    } | null>(null);
    const [logoError, setLogoError] = useState<string | null>(null);
    const [tenantSortState, setTenantSortState] = useState<GridSortState<TenantColumnKey>>(DEFAULT_TENANT_SORT);
    const [emailUsageSortState, setEmailUsageSortState] = useState<GridSortState<EmailUsageColumnKey>>(DEFAULT_EMAIL_USAGE_SORT);
    const [isTenantGridConfigOpen, setIsTenantGridConfigOpen] = useState(false);
    const [isEmailUsageGridConfigOpen, setIsEmailUsageGridConfigOpen] = useState(false);
    const [isTenantGridConfigReady, setIsTenantGridConfigReady] = useState(false);
    const [isEmailUsageGridConfigReady, setIsEmailUsageGridConfigReady] = useState(false);
    const [tenantColumnOrder, setTenantColumnOrder] = useState<TenantColumnKey[]>(TENANT_COLUMN_KEYS);
    const [tenantHiddenColumns, setTenantHiddenColumns] = useState<TenantColumnKey[]>(
        TENANT_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_TENANT_COLUMNS.includes(key)),
    );
    const [emailUsageColumnOrder, setEmailUsageColumnOrder] = useState<EmailUsageColumnKey[]>(EMAIL_USAGE_COLUMN_KEYS);
    const [emailUsageHiddenColumns, setEmailUsageHiddenColumns] = useState<EmailUsageColumnKey[]>(
        EMAIL_USAGE_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_EMAIL_USAGE_COLUMNS.includes(key)),
    );
    const [isTenantExportModalOpen, setIsTenantExportModalOpen] = useState(false);
    const [isEmailUsageExportModalOpen, setIsEmailUsageExportModalOpen] = useState(false);
    const [tenantExportFormat, setTenantExportFormat] = useState<GridExportFormat>('excel');
    const [emailUsageExportFormat, setEmailUsageExportFormat] = useState<GridExportFormat>('excel');
    const [tenantExportColumns, setTenantExportColumns] = useState<Record<TenantExportColumnKey, boolean>>(buildDefaultExportColumns(TENANT_EXPORT_COLUMNS));
    const [emailUsageExportColumns, setEmailUsageExportColumns] = useState<Record<EmailUsageExportColumnKey, boolean>>(buildDefaultExportColumns(EMAIL_USAGE_EXPORT_COLUMNS));

    const [formData, setFormData] = useState({
        name: '',
        document: '',
        logoUrl: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        // DB
        rg: '', cpf: '', cnpj: '', nickname: '', corporateName: '',
        phone: '', whatsapp: '', cellphone1: '', cellphone2: '', email: '',
        // EC
        zipCode: '', street: '', number: '', city: '', state: '', neighborhood: '', complement: '',
        // FINANCAS (DF)
        interestRate: '', penaltyRate: '', penaltyValue: '', penaltyGracePeriod: '', interestGracePeriod: '',
        // SMTP
        smtpHost: 'smtp.gmail.com', smtpPort: '465', smtpTimeout: '60',
        smtpAuthenticate: true, smtpSecure: true, smtpAuthType: 'SSL',
        smtpEmail: '', smtpPassword: ''
    });

    const handleLogoChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setLogoError(null);
            const dataUrl = await readImageFileAsDataUrl(file);
            setFormData((current) => ({
                ...current,
                logoUrl: dataUrl,
            }));
        } catch (error: any) {
            setLogoError(error?.message || 'Não foi possível carregar o logotipo.');
        } finally {
            event.target.value = '';
        }
    };

    const buildMasterPass = (date: Date) => {
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const hr = date.getHours();
        const min = date.getMinutes();

        return `S${day + hr}${month + min}`;
    };

    const getMasterPassForRequest = useCallback(() => {
        return isMasterLogged ? buildMasterPass(new Date()) : masterPassword.trim();
    }, [isMasterLogged, masterPassword]);

    // Buscar Escolas da API
    const fetchEscolas = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await fetch('http://localhost:3001/api/v1/tenants', {
                headers: { 'x-msinfor-master-pass': getMasterPassForRequest() }
            });

            if (!response.ok) throw new Error('Falha ao buscar as Escolas cadastradas');

            const data = await response.json();
            setEscolas(data);
        } catch (err: any) {
            console.error(err);
            setErrorStatus('Não foi possível carregar as escolas. Verifique se o backend está rodando na porta 3001.');
        } finally {
            setIsLoading(false);
        }
    }, [getMasterPassForRequest]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const hasMasterSession = window.sessionStorage.getItem(MSINFOR_MASTER_SESSION_KEY) === 'true';
        if (hasMasterSession) {
            setIsMasterLogged(true);
            setLoginError(false);
        }
    }, []);

    const fetchGeneralSettings = useCallback(async () => {
        try {
            setIsGeneralSettingsLoading(true);
            setGeneralSettingsStatus(null);

            const response = await fetch('http://localhost:3001/api/v1/global-settings', {
                headers: { 'x-msinfor-master-pass': getMasterPassForRequest() },
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => null);
                throw new Error(errorPayload?.message || 'Não foi possível carregar as configurações gerais.');
            }

            const payload = (await response.json()) as Partial<GeneralSettingsForm>;
            setGeneralSettings((current) => ({
                ...current,
                ...payload,
            }));
        } catch (error: any) {
            setGeneralSettingsStatus(error?.message || 'Não foi possível carregar as configurações gerais da softhouse.');
        } finally {
            setIsGeneralSettingsLoading(false);
        }
    }, [getMasterPassForRequest]);

    useEffect(() => {
        if (isMasterLogged) {
            void fetchEscolas();
            void fetchGeneralSettings();
        }
    }, [isMasterLogged, fetchEscolas, fetchGeneralSettings]);

    useEffect(() => {
        let isMounted = true;
        setIsTenantGridConfigReady(false);
        setIsEmailUsageGridConfigReady(false);

        void loadGridColumnConfig(getTenantGridConfigStorageKey(), TENANT_COLUMN_KEYS, DEFAULT_VISIBLE_TENANT_COLUMNS).then((tenantConfig) => {
            if (!isMounted) return;
            setTenantColumnOrder(tenantConfig.order);
            setTenantHiddenColumns(tenantConfig.hidden);
            setIsTenantGridConfigReady(true);
        });

        void loadGridColumnConfig(getEmailUsageGridConfigStorageKey(), EMAIL_USAGE_COLUMN_KEYS, DEFAULT_VISIBLE_EMAIL_USAGE_COLUMNS).then((emailUsageConfig) => {
            if (!isMounted) return;
            setEmailUsageColumnOrder(emailUsageConfig.order);
            setEmailUsageHiddenColumns(emailUsageConfig.hidden);
            setIsEmailUsageGridConfigReady(true);
        });

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (!isTenantGridConfigReady) return;
        writeGridColumnConfig(getTenantGridConfigStorageKey(), TENANT_COLUMN_KEYS, tenantColumnOrder, tenantHiddenColumns);
    }, [isTenantGridConfigReady, tenantColumnOrder, tenantHiddenColumns]);

    useEffect(() => {
        if (!isEmailUsageGridConfigReady) return;
        writeGridColumnConfig(getEmailUsageGridConfigStorageKey(), EMAIL_USAGE_COLUMN_KEYS, emailUsageColumnOrder, emailUsageHiddenColumns);
    }, [emailUsageColumnOrder, emailUsageHiddenColumns, isEmailUsageGridConfigReady]);

    const getEmailEntityLabel = (usage: any) => {
        switch (usage.entityType) {
            case 'TENANT':
                return 'ESCOLA';
            case 'ADMIN_USER':
                return 'ADMINISTRADOR';
            case 'USER':
                return usage.role ? `USUARIO (${usage.role})` : 'USUARIO DO SISTEMA';
            case 'TEACHER':
                return 'PROFESSOR';
            case 'STUDENT':
                return 'ALUNO';
            case 'GUARDIAN':
                return 'RESPONSAVEL';
            default:
                return usage.entityLabel || 'REGISTRO';
        }
    };

    const getEmailEntityBadgeClass = (entityType: string) => {
        switch (entityType) {
            case 'TENANT':
                return 'bg-indigo-100 text-indigo-700 border-indigo-200';
            case 'ADMIN_USER':
                return 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200';
            case 'USER':
                return 'bg-slate-100 text-slate-700 border-slate-200';
            case 'TEACHER':
                return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'STUDENT':
                return 'bg-sky-100 text-sky-700 border-sky-200';
            case 'GUARDIAN':
                return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            default:
                return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    const renderTenantInfoButton = (escola: TenantRecord) => (
        <GridRecordPopover
            title={escola.name}
            subtitle={escola.document || 'Escola sem documento informado'}
            buttonLabel={`Ver detalhes da escola ${escola.name}`}
            avatarUrl={escola.logoUrl || null}
            sections={[
                {
                    title: 'Escola',
                    items: [
                        { label: 'ID', value: escola.id || 'Não informado' },
                        { label: 'Nome', value: escola.name || 'Não informado' },
                        { label: 'Documento', value: escola.document || 'Não informado' },
                        { label: 'Data de registro', value: new Date(escola.createdAt).toLocaleDateString() },
                    ],
                },
                {
                    title: 'Admin master',
                    items: [
                        { label: 'Nome', value: escola.users?.[0]?.name || 'Não informado' },
                        { label: 'E-mail', value: escola.users?.[0]?.email || 'Sem login' },
                        { label: 'Status do acesso', value: escola.users?.[0]?.email ? 'Login master configurado' : 'Escola sem login master cadastrado' },
                    ],
                },
            ]}
            contextLabel="MSINFOR_ADMIN_TENANT_POPUP"
        />
    );

    const renderEmailUsageInfoButton = (usage: EmailUsageRecord) => (
        <GridRecordPopover
            title={usage.recordName}
            subtitle={`${getEmailEntityLabel(usage)} - ${usage.currentEmail}`}
            buttonLabel={`Ver detalhes do vínculo de e-mail ${usage.recordName}`}
            badges={[
                getEmailEntityLabel(usage),
                usage.updatedBy ? 'COM AUDITORIA' : 'SEM AUDITORIA',
                usage.document ? 'ESCOLA IDENTIFICADA' : 'SEM DOCUMENTO',
            ]}
            sections={[
                {
                    title: 'Vínculo',
                    items: [
                        { label: 'Tipo', value: getEmailEntityLabel(usage) },
                        { label: 'Registro', value: usage.recordName || 'Não informado' },
                        { label: 'ID do registro', value: usage.recordId || 'Não informado' },
                        { label: 'E-mail atual', value: usage.currentEmail || 'Não informado' },
                    ],
                },
                {
                    title: 'Escola',
                    items: [
                        { label: 'Escola', value: usage.tenantName || 'Não informada' },
                        { label: 'Documento', value: usage.document || 'Não informado' },
                        { label: 'Última auditoria', value: new Date(usage.updatedAt).toLocaleDateString() },
                        { label: 'Atualizado por', value: usage.updatedBy || 'Sem auditoria informada' },
                        { label: 'Resumo', value: `${getEmailEntityLabel(usage)} vinculado à escola ${usage.tenantName || 'NÃO INFORMADA'}` },
                    ],
                },
            ]}
            contextLabel="MSINFOR_ADMIN_EMAIL_USAGE_POPUP"
        />
    );

    const orderedTenantColumns = useMemo(
        () => tenantColumnOrder.map((key) => TENANT_COLUMNS.find((column) => column.key === key)).filter((column): column is ConfigurableGridColumn<TenantRecord, TenantColumnKey> => !!column),
        [tenantColumnOrder],
    );
    const visibleTenantColumns = useMemo(
        () => orderedTenantColumns.filter((column) => !tenantHiddenColumns.includes(column.key)),
        [orderedTenantColumns, tenantHiddenColumns],
    );
    const orderedEmailUsageColumns = useMemo(
        () => emailUsageColumnOrder.map((key) => EMAIL_USAGE_COLUMNS.find((column) => column.key === key)).filter((column): column is ConfigurableGridColumn<EmailUsageRecord, EmailUsageColumnKey> => !!column),
        [emailUsageColumnOrder],
    );
    const visibleEmailUsageColumns = useMemo(
        () => orderedEmailUsageColumns.filter((column) => !emailUsageHiddenColumns.includes(column.key)),
        [emailUsageHiddenColumns, orderedEmailUsageColumns],
    );

    const sortedEscolas = useMemo(
        () => sortGridRows(escolas, TENANT_COLUMNS, tenantSortState),
        [escolas, tenantSortState],
    );

    const sortedEmailUsageResults = useMemo(
        () => sortGridRows(emailUsageResults, EMAIL_USAGE_COLUMNS, emailUsageSortState),
        [emailUsageResults, emailUsageSortState],
    );

    const toggleTenantSort = (column: TenantColumnKey) => {
        setTenantSortState((current) => ({
            column,
            direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const toggleEmailUsageSort = (column: EmailUsageColumnKey) => {
        setEmailUsageSortState((current) => ({
            column,
            direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const toggleTenantColumnVisibility = (columnKey: TenantColumnKey) => {
        const isHidden = tenantHiddenColumns.includes(columnKey);
        const visibleCount = TENANT_COLUMN_KEYS.length - tenantHiddenColumns.length;
        if (!isHidden && visibleCount === 1) {
            setErrorStatus('Pelo menos uma coluna precisa continuar visível no grid de escolas.');
            return;
        }

        setTenantHiddenColumns((current) => isHidden ? current.filter((item) => item !== columnKey) : [...current, columnKey]);
    };

    const moveTenantColumn = (columnKey: TenantColumnKey, direction: 'up' | 'down') => {
        setTenantColumnOrder((current) => {
            const currentIndex = current.indexOf(columnKey);
            if (currentIndex === -1) return current;

            const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (targetIndex < 0 || targetIndex >= current.length) return current;

            const nextOrder = [...current];
            const [movedItem] = nextOrder.splice(currentIndex, 1);
            nextOrder.splice(targetIndex, 0, movedItem);
            return nextOrder;
        });
    };

    const resetTenantColumns = () => {
        setTenantColumnOrder(TENANT_COLUMN_KEYS);
        setTenantHiddenColumns(TENANT_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_TENANT_COLUMNS.includes(key)));
        setErrorStatus(null);
    };

    const toggleEmailUsageColumnVisibility = (columnKey: EmailUsageColumnKey) => {
        const isHidden = emailUsageHiddenColumns.includes(columnKey);
        const visibleCount = EMAIL_USAGE_COLUMN_KEYS.length - emailUsageHiddenColumns.length;
        if (!isHidden && visibleCount === 1) {
            setEmailUsageError('Pelo menos uma coluna precisa continuar visível no grid de vínculos de e-mail.');
            return;
        }

        setEmailUsageHiddenColumns((current) => isHidden ? current.filter((item) => item !== columnKey) : [...current, columnKey]);
    };

    const moveEmailUsageColumn = (columnKey: EmailUsageColumnKey, direction: 'up' | 'down') => {
        setEmailUsageColumnOrder((current) => {
            const currentIndex = current.indexOf(columnKey);
            if (currentIndex === -1) return current;

            const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (targetIndex < 0 || targetIndex >= current.length) return current;

            const nextOrder = [...current];
            const [movedItem] = nextOrder.splice(currentIndex, 1);
            nextOrder.splice(targetIndex, 0, movedItem);
            return nextOrder;
        });
    };

    const resetEmailUsageColumns = () => {
        setEmailUsageColumnOrder(EMAIL_USAGE_COLUMN_KEYS);
        setEmailUsageHiddenColumns(EMAIL_USAGE_COLUMN_KEYS.filter((key) => !DEFAULT_VISIBLE_EMAIL_USAGE_COLUMNS.includes(key)));
        setEmailUsageError(null);
    };

    const toggleTenantExportColumn = (column: TenantExportColumnKey) => {
        setTenantExportColumns((current) => ({ ...current, [column]: !current[column] }));
    };

    const toggleEmailUsageExportColumn = (column: EmailUsageExportColumnKey) => {
        setEmailUsageExportColumns((current) => ({ ...current, [column]: !current[column] }));
    };

    const setAllTenantExportColumns = (value: boolean) => {
        setTenantExportColumns(
            TENANT_EXPORT_COLUMNS.reduce<Record<TenantExportColumnKey, boolean>>((accumulator, column) => {
                accumulator[column.key] = value;
                return accumulator;
            }, {} as Record<TenantExportColumnKey, boolean>),
        );
    };

    const setAllEmailUsageExportColumns = (value: boolean) => {
        setEmailUsageExportColumns(
            EMAIL_USAGE_EXPORT_COLUMNS.reduce<Record<EmailUsageExportColumnKey, boolean>>((accumulator, column) => {
                accumulator[column.key] = value;
                return accumulator;
            }, {} as Record<EmailUsageExportColumnKey, boolean>),
        );
    };

    const fetchEmailUsage = async (emailToQuery = emailQuery) => {
        const normalizedEmail = emailToQuery.trim().toUpperCase();

        if (!normalizedEmail) {
            setEmailUsageError('Informe um e-mail para consultar os vínculos.');
            setEmailUsageResults([]);
            setEmailUsageSearched(false);
            return;
        }

        try {
            setEmailUsageLoading(true);
            setEmailUsageError(null);
            const response = await fetch(`http://localhost:3001/api/v1/tenants/email-usage?email=${encodeURIComponent(normalizedEmail)}`, {
                headers: { 'x-msinfor-master-pass': getMasterPassForRequest() }
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Falha ao consultar onde o e-mail está sendo usado.');
            }

            setEmailQuery(normalizedEmail);
            setEmailUsageResults(Array.isArray(data) ? data : []);
            setEmailUsageSearched(true);
        } catch (err: any) {
            setEmailUsageResults([]);
            setEmailUsageSearched(true);
            setEmailUsageError(err.message || 'Não foi possível consultar o uso do e-mail.');
        } finally {
            setEmailUsageLoading(false);
        }
    };

    const handleEmailUsageSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        await fetchEmailUsage();
    };

    const openEmailUsageEditor = (usage: any) => {
        setEditingEmailUsage(usage);
        setReplacementEmail((usage.currentEmail || '').toUpperCase());
        setEmailUsageError(null);
        setEmailUsageSuccess(null);
    };

    const closeEmailUsageEditor = () => {
        setEditingEmailUsage(null);
        setReplacementEmail('');
        setEmailUpdateLoading(false);
    };

    const closeAccessManager = () => {
        setAccessTenant(null);
    };

    const handleLogout = () => {
        if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem(MSINFOR_MASTER_SESSION_KEY);
        }
        setIsMasterLogged(false);
        setMasterPassword('');
        setLoginError(false);
    };

    const handleEmailUsageUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEmailUsage) return;

        const normalizedEmail = replacementEmail.trim().toUpperCase();
        if (!normalizedEmail) {
            setEmailUsageError('Informe o novo e-mail que deve substituir o vínculo selecionado.');
            return;
        }

        try {
            setEmailUpdateLoading(true);
            setEmailUsageError(null);
            const response = await fetch('http://localhost:3001/api/v1/tenants/email-usage', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-msinfor-master-pass': getMasterPassForRequest(),
                },
                body: JSON.stringify({
                    entityType: editingEmailUsage.entityType,
                    recordId: editingEmailUsage.recordId,
                    newEmail: normalizedEmail,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Não foi possível atualizar o e-mail do vínculo selecionado.');
            }

            closeEmailUsageEditor();
            await fetchEmailUsage(emailQuery);
            await fetchEscolas();
            setEmailUsageSuccess(data.message || 'E-mail atualizado com sucesso.');
            setTimeout(() => setEmailUsageSuccess(null), 5000);
        } catch (err: any) {
            setEmailUsageError(err.message || 'Não foi possível atualizar o e-mail do vínculo selecionado.');
        } finally {
            setEmailUpdateLoading(false);
        }
    };
    const handleMasterLogin = (e: React.FormEvent) => {
        e.preventDefault();

        const now = new Date();
        const prevMinute = new Date(now.getTime() - 60_000);
        const nextMinute = new Date(now.getTime() + 60_000);

        const validPasswords = new Set([
            buildMasterPass(prevMinute),
            buildMasterPass(now),
            buildMasterPass(nextMinute),
        ]);

        if (validPasswords.has(masterPassword.trim())) {
            if (typeof window !== 'undefined') {
                window.sessionStorage.setItem(MSINFOR_MASTER_SESSION_KEY, 'true');
            }
            setIsMasterLogged(true);
            setLoginError(false);
        } else {
            setLoginError(true);
            setTimeout(() => setLoginError(false), 5000);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const url = editingTenantId
                ? `http://localhost:3001/api/v1/tenants/${editingTenantId}`
                : 'http://localhost:3001/api/v1/tenants';
            const method = editingTenantId ? 'PUT' : 'POST';
            // Converte os dados financeiros de string para number, caso existam e não sejam vazios
            const payload: any = {
                ...formData,
                interestRate: formData.interestRate ? parseFloat(formData.interestRate as string) : null,
                penaltyRate: formData.penaltyRate ? parseFloat(formData.penaltyRate as string) : null,
                penaltyValue: formData.penaltyValue ? parseFloat(formData.penaltyValue as string) : null,
                interestGracePeriod: formData.interestGracePeriod ? parseInt(formData.interestGracePeriod as string, 10) : null,
                penaltyGracePeriod: formData.penaltyGracePeriod ? parseInt(formData.penaltyGracePeriod as string, 10) : null,
                smtpPort: formData.smtpPort ? parseInt(formData.smtpPort as string, 10) : null,
                smtpTimeout: formData.smtpTimeout ? parseInt(formData.smtpTimeout as string, 10) : null,
                smtpAuthenticate: !!formData.smtpAuthenticate,
                smtpSecure: !!formData.smtpSecure,
                smtpAuthType: formData.smtpAuthType || (formData.smtpSecure ? 'SSL' : 'STARTTLS'),
            };

            // Se for edição e a senha estiver vazia, remove do payload para não dar erro de validação (MinLength 6)
            if (editingTenantId && !payload.adminPassword) {
                delete payload.adminPassword;
            }

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'x-msinfor-master-pass': getMasterPassForRequest()
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.message || (editingTenantId ? 'Erro ao atualizar Escola' : 'Erro ao cadastrar Escola'));
            }

            closeModal();
            fetchEscolas();

        } catch (err: any) {
            let errorMsg = err.message || 'Ocorreu um erro.';
            if (errorMsg.includes('adminPassword should not be empty') || errorMsg.includes('mínimo 6 caracteres')) {
                errorMsg = 'A senha deve ter no mínimo 6 caracteres';
            }
            setSaveError(errorMsg);
            setTimeout(() => setSaveError(null), 5000);
        }
    };

    const handleEdit = (escola: any) => {
        setEditingTenantId(escola.id);
        const admin = escola.users?.[0] || {};

        setFormData({
            name: escola.name || '',
            document: escola.document || '',
            logoUrl: escola.logoUrl || '',
            adminName: admin.name || '',
            adminEmail: admin.email || '',
            adminPassword: '', // Limpo, para não enviar acidentalmente
            rg: escola.rg || '', cpf: escola.cpf || '', cnpj: escola.cnpj || '', nickname: escola.nickname || '', corporateName: escola.corporateName || '',
            phone: escola.phone || '', whatsapp: escola.whatsapp || '', cellphone1: escola.cellphone1 || '', cellphone2: escola.cellphone2 || '', email: escola.email || '',
            zipCode: escola.zipCode || '', street: escola.street || '', number: escola.number || '', city: escola.city || '', state: escola.state || '', neighborhood: escola.neighborhood || '', complement: escola.complement || '',
            interestRate: escola.interestRate ?? '',
            penaltyRate: escola.penaltyRate ?? '',
            penaltyValue: escola.penaltyValue ?? '',
            penaltyGracePeriod: escola.penaltyGracePeriod ?? '',
            interestGracePeriod: escola.interestGracePeriod ?? '',
            smtpHost: escola.smtpHost ?? 'smtp.gmail.com',
            smtpPort: escola.smtpPort ? String(escola.smtpPort) : (escola.smtpSecure ? '465' : '587'),
            smtpTimeout: escola.smtpTimeout ? String(escola.smtpTimeout) : '60',
            smtpAuthenticate: escola.smtpAuthenticate ?? true,
            smtpSecure: escola.smtpSecure ?? true,
            smtpAuthType: escola.smtpAuthType ?? ((escola.smtpSecure ?? true) ? 'SSL' : 'STARTTLS'),
            smtpEmail: escola.smtpEmail ?? '',
            smtpPassword: escola.smtpPassword ?? ''
        });

        setActiveTab(1);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingTenantId(null);
        setActiveTab(1);
        setFormData({
            name: '', document: '', logoUrl: '', adminName: '', adminEmail: '', adminPassword: '',
            rg: '', cpf: '', cnpj: '', nickname: '', corporateName: '', phone: '', whatsapp: '', cellphone1: '', cellphone2: '', email: '',
            zipCode: '', street: '', number: '', city: '', state: '', neighborhood: '', complement: '',
            interestRate: '', penaltyRate: '', penaltyValue: '', penaltyGracePeriod: '', interestGracePeriod: '',
            smtpHost: 'smtp.gmail.com', smtpPort: '465', smtpTimeout: '60',
            smtpAuthenticate: true, smtpSecure: true, smtpAuthType: 'SSL',
            smtpEmail: '', smtpPassword: ''
        });
        setLogoError(null);
    };

    const updateGeneralSettingsField = <K extends keyof GeneralSettingsForm>(field: K, value: GeneralSettingsForm[K]) => {
        setGeneralSettings((current) => ({
            ...current,
            [field]: value,
        }));
    };

    const handleSaveGeneralSettings = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            setIsGeneralSettingsLoading(true);
            setGeneralSettingsStatus(null);

            const response = await fetch('http://localhost:3001/api/v1/global-settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-msinfor-master-pass': getMasterPassForRequest(),
                },
                body: JSON.stringify(generalSettings),
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.message || 'Não foi possível salvar as configurações gerais.');
            }

            setGeneralSettings((current) => ({
                ...current,
                ...(payload?.settings || {}),
            }));
            setGeneralSettingsStatus(payload?.message || 'Configurações gerais salvas com sucesso.');
        } catch (error: any) {
            setGeneralSettingsStatus(error?.message || 'Não foi possível salvar as configurações gerais.');
        } finally {
            setIsGeneralSettingsLoading(false);
        }
    };

    const handleTestS3GeneralSettings = async () => {
        try {
            setIsGeneralSettingsTesting(true);
            setGeneralSettingsTestResult(null);

            const response = await fetch('http://localhost:3001/api/v1/global-settings/test-s3', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-msinfor-master-pass': getMasterPassForRequest(),
                },
                body: JSON.stringify(generalSettings),
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.message || 'Não foi possível testar a comunicação com o S3.');
            }

            setGeneralSettingsTestResult({
                tone: 'success',
                title: 'S3 conectado com sucesso',
                message: payload?.message || 'A comunicação com o S3 foi concluída sem erros.',
                details: Array.isArray(payload?.details) ? payload.details : [],
            });
        } catch (error: any) {
            setGeneralSettingsTestResult({
                tone: 'error',
                title: 'Falha ao comunicar com o S3',
                message: error?.message || 'Não foi possível validar a comunicação com o S3.',
            });
        } finally {
            setIsGeneralSettingsTesting(false);
        }
    };

    const handleCepSearch = async () => {
        const cep = formData.zipCode.replace(/\D/g, ''); // Remove todos os não dígitos
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
                state: data.uf || '' // A UF da API do ViaCEP vem como sigla ex: 'SP', 'RS'
            }));

            // Opcional: Se quiser dar foco para o número:
            // document.getElementById('numero_input')?.focus();

        } catch (error) {
            console.error('Falha ao consultar viaCEP:', error);
            alert('Falha ao consultar CEP. Serviço viacep pode estar oscilando.');
        }
    };

    const renderEmailUsageGridCell = (usage: EmailUsageRecord, columnKey: EmailUsageColumnKey) => {
        if (columnKey === 'entityType') {
            return (
                <td key={`${usage.entityType}-${usage.recordId}-${columnKey}`} className="px-5 py-4">
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black tracking-wide ${getEmailEntityBadgeClass(usage.entityType)}`}>
                        {getEmailEntityLabel(usage)}
                    </span>
                </td>
            );
        }

        if (columnKey === 'recordId') {
            return <td key={`${usage.entityType}-${usage.recordId}-${columnKey}`} className="px-5 py-4 text-[11px] font-mono text-slate-500">{usage.recordId || '---'}</td>;
        }

        if (columnKey === 'recordName') {
            return (
                <td key={`${usage.entityType}-${usage.recordId}-${columnKey}`} className="px-5 py-4">
                    <div className="font-bold text-slate-800 text-sm">{usage.recordName}</div>
                    <div className="text-[10px] font-mono text-slate-400 mt-1">{usage.recordId}</div>
                </td>
            );
        }

        if (columnKey === 'tenantName') {
            return (
                <td key={`${usage.entityType}-${usage.recordId}-${columnKey}`} className="px-5 py-4">
                    <div className="text-sm font-semibold text-slate-700">{usage.tenantName}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{usage.document || 'SEM DOCUMENTO'}</div>
                </td>
            );
        }

        if (columnKey === 'document') {
            return <td key={`${usage.entityType}-${usage.recordId}-${columnKey}`} className="px-5 py-4 text-sm font-medium text-slate-600">{usage.document || 'NÃO INFORMADO'}</td>;
        }

        if (columnKey === 'currentEmail') {
            return <td key={`${usage.entityType}-${usage.recordId}-${columnKey}`} className="px-5 py-4 text-sm font-semibold text-indigo-700 break-all">{usage.currentEmail}</td>;
        }

        if (columnKey === 'updatedBy') {
            return <td key={`${usage.entityType}-${usage.recordId}-${columnKey}`} className="px-5 py-4 text-sm font-medium text-slate-600">{usage.updatedBy || 'SEM AUDITORIA INFORMADA'}</td>;
        }

        return (
            <td key={`${usage.entityType}-${usage.recordId}-${columnKey}`} className="px-5 py-4 text-xs text-slate-500">
                <div>{new Date(usage.updatedAt).toLocaleDateString()}</div>
                <div className="mt-0.5">{usage.updatedBy || 'SEM AUDITORIA INFORMADA'}</div>
            </td>
        );
    };

    const renderTenantGridCell = (escola: TenantRecord, columnKey: TenantColumnKey) => {
        if (columnKey === 'id') {
            return <td key={`${escola.id}-${columnKey}`} className="px-6 py-4 text-[11px] font-mono text-slate-500">{escola.id}</td>;
        }

        if (columnKey === 'name') {
            return (
                <td key={`${escola.id}-${columnKey}`} className="px-6 py-4">
                    <div className="font-bold text-indigo-900 text-base">{escola.name}</div>
                    <div className="text-[10px] font-mono text-slate-400 mt-1">{escola.id}</div>
                </td>
            );
        }

        if (columnKey === 'document') {
            return (
                <td key={`${escola.id}-${columnKey}`} className="px-6 py-4 text-slate-600 font-medium">
                    {escola.document || <span className="text-slate-300 italic">Não Informado</span>}
                </td>
            );
        }

        if (columnKey === 'admin') {
            return (
                <td key={`${escola.id}-${columnKey}`} className="px-6 py-4">
                    <div className="text-sm font-bold text-slate-700">{escola.users?.[0]?.name || '---'}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{escola.users?.[0]?.email || 'Sem login'}</div>
                </td>
            );
        }

        return <td key={`${escola.id}-${columnKey}`} className="px-6 py-4 text-slate-500 text-sm font-medium">{new Date(escola.createdAt).toLocaleDateString()}</td>;
    };

    // TELA DE BLOQUEIO (COFRE DO MOTOR CENTRAL)
    if (!isMasterLogged) {
        return (
            <div className="min-h-screen bg-[#0a192f] flex flex-col items-center justify-center font-sans">
                <div className="mb-8">
                    <img src="/logo-msinfor.jpg" alt="Logo MSINFOR" className="w-24 h-24 rounded-full border-4 border-indigo-500/30 shadow-[0_0_40px_rgba(99,102,241,0.4)]" />
                </div>

                <div className="bg-[#112240] p-8 rounded-2xl shadow-2xl border border-white/5 max-w-sm w-full relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

                    <h2 className="text-xl font-bold text-center text-white tracking-[0.15em] mb-8">ACESSO EXCLUSIVO MSINFOR</h2>

                    <form onSubmit={handleMasterLogin}>
                        <div className="relative mb-6">
                            <input
                                type="password"
                                placeholder="Chave de Acesso Admin"
                                value={masterPassword}
                                onChange={e => setMasterPassword(e.target.value)}
                                className="w-full bg-[#0a192f] border border-slate-700/50 text-slate-200 px-4 py-3.5 rounded-xl outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 text-center tracking-widest font-mono text-lg shadow-inner transition-all placeholder:text-slate-600 placeholder:text-sm"
                            />
                        </div>
                        <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white tracking-widest text-sm font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-95">
                            ACESSAR
                        </button>
                    </form>
                </div>

                {/* MODAL MÁGICO DE ERRO NO CENTRO DA TELA (POP-UP / TOAST) IGUAL O DO LOGIN */}
                {loginError && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="bg-red-500/10 p-6 flex flex-col items-center text-center">
                                <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4 ring-4 ring-white shadow-sm">
                                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-bold text-slate-800 mb-1">Acesso Negado</h3>

                                <div className="flex flex-col items-center w-full mt-1 mb-2">
                                    <p className="text-slate-600 font-bold text-[15px] max-w-[200px] leading-tight text-center">
                                        SENHA MASTER INVÁLIDA
                                    </p>

                                    <div className="mt-3 bg-red-50 border border-red-200/50 px-3 py-2.5 rounded-xl w-full text-center shadow-inner flex flex-col gap-2">
                                        <span className="text-red-600 font-mono font-bold text-[16px] tracking-wide break-all block">
                                            Intruso Detectado.
                                        </span>
                                        <span className="text-red-500/80 text-xs font-mono tracking-widest block font-bold border-t border-red-200/50 pt-2 mt-1">
                                            CÓDIGO ERRO: S(DH)+(MM)
                                        </span>
                                    </div>
                                </div>

                                <p className="text-xs text-slate-400 mt-2">Fechando automaticamente em 5s...</p>

                                <button
                                    onClick={() => setLoginError(false)}
                                    className="mt-6 bg-slate-800 hover:bg-slate-700 text-white w-full py-2.5 rounded-xl font-semibold tracking-wide transition-colors"
                                >
                                    Dispensar Aviso
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // TELA LIBERADA DO PAINEL DE CONTROLE DAS ESCOLAS
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">

            {/* Cabeçalho MSINFOR ADMIN */}
            <header className="bg-[#153a6a] text-white p-4 shadow-md flex items-center justify-between border-b-4 border-indigo-500 relative z-10">
                <div className="flex items-center gap-4 px-4">
                    <img src="/logo-msinfor.jpg" alt="Logo MSINFOR" className="w-[50px] h-[50px] rounded-full ring-2 ring-white/20" />
                    <div>
                        <h1 className="text-xl font-black tracking-wide leading-tight">MSINFOR <span className="font-light">| MOTOR CENTRAL</span></h1>
                        <p className="text-indigo-200 text-xs mt-0.5 tracking-wider">GESTÃO DE INQUILINOS (TENANTS)</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 px-4">
                    <span className="bg-indigo-600/50 text-indigo-100 text-[11px] font-bold px-3 py-1.5 rounded border border-indigo-500/30 tracking-widest">
                        ACESSO RESTRITO
                    </span>
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="rounded-lg border border-red-300/30 bg-red-500/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-100 transition-colors hover:bg-red-500/20 hover:text-white"
                    >
                        Logout
                    </button>
                </div>
            </header>

            {/* Conteúdo */}
            <main className="flex-1 p-8 max-w-7xl w-full mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">Unidades de Ensino Ativas</h2>
                        <p className="text-slate-500 text-sm mt-1">Escolas que rodam sob o guarda-chuva do sistema.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                                onClick={() => {
                                    setGeneralSettingsStatus(null);
                                    setGeneralSettingsTestResult(null);
                                    setGeneralSettingsTab('s3');
                                    setIsGeneralSettingsOpen(true);
                                    void fetchGeneralSettings();
                                }}
                            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50"
                        >
                            Configurações gerais
                        </button>
                        <button
                            onClick={() => { closeModal(); setIsModalOpen(true); }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md shadow-indigo-500/20 transition-all flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                            Implantar Nova Escola
                        </button>
                    </div>
                </div>

                {errorStatus && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 mb-6 font-medium text-sm flex items-center gap-3">
                        <span className="w-6 h-6 bg-red-200 text-red-700 rounded-full flex items-center justify-center font-bold">!</span>
                        {errorStatus}
                    </div>
                )}

                <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
                    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between mb-5">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Rastreador Global de E-mail</h3>
                            <p className="text-slate-500 text-sm mt-1">
                                Consulte em quais cadastros um e-mail está sendo usado e corrija o vínculo escolhido.
                            </p>
                        </div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">
                            Master lookup
                        </div>
                    </div>

                    <form onSubmit={handleEmailUsageSearch} className="flex flex-col lg:flex-row gap-3">
                        <div className="flex-1">
                            <label className="text-xs font-bold text-slate-600 mb-1 block">E-mail para varredura</label>
                            <input
                                type="text"
                                value={emailQuery}
                                onChange={e => setEmailQuery(e.target.value.toUpperCase())}
                                className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-medium rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                placeholder="EX: CADASTRO@ESCOLA.COM"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={emailUsageLoading}
                            className="lg:self-end bg-[#153a6a] hover:bg-[#0f2c50] text-white px-5 py-3 rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 min-w-[220px] disabled:opacity-70"
                        >
                            {emailUsageLoading ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Consultando...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
                                    </svg>
                                    Consultar Vinculos
                                </>
                            )}
                        </button>
                    </form>

                    {emailUsageError && (
                        <div className="mt-4 bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 font-medium text-sm flex items-center gap-3">
                            <span className="w-6 h-6 bg-red-200 text-red-700 rounded-full flex items-center justify-center font-bold">!</span>
                            {emailUsageError}
                        </div>
                    )}

                    {emailUsageSuccess && (
                        <div className="mt-4 bg-emerald-50 text-emerald-700 p-4 rounded-xl border border-emerald-100 font-medium text-sm flex items-center gap-3">
                            <span className="w-6 h-6 bg-emerald-200 text-emerald-700 rounded-full flex items-center justify-center font-bold">✓</span>
                            {emailUsageSuccess}
                        </div>
                    )}

                    {emailUsageSearched && !emailUsageLoading && (
                        <div className="mt-5 rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                                <div>
                                    <h4 className="font-bold text-slate-800">Resultado da consulta</h4>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {emailUsageResults.length > 0
                                            ? `${emailUsageResults.length} vínculo(s) encontrado(s) para ${emailQuery}.`
                                            : `Nenhum vínculo ativo encontrado para ${emailQuery}.`}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsEmailUsageGridConfigOpen(true)}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                                    >
                                        Colunas
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsEmailUsageExportModalOpen(true)}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                                    >
                                        Exportar
                                    </button>
                                </div>
                            </div>

                            {emailUsageResults.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-white border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-bold">
                                                {visibleEmailUsageColumns.map((column) => (
                                                    <th key={column.key} className="px-5 py-4">
                                                        <GridSortableHeader
                                                            label={column.label}
                                                            isActive={emailUsageSortState.column === column.key}
                                                            direction={emailUsageSortState.direction}
                                                            onClick={() => toggleEmailUsageSort(column.key)}
                                                        />
                                                    </th>
                                                ))}
                                                <th className="px-5 py-4 text-right">Ação</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {sortedEmailUsageResults.map((usage) => (
                                                <tr key={`${usage.entityType}-${usage.recordId}`} className="hover:bg-slate-50 transition-colors">
                                                    {visibleEmailUsageColumns.map((column) => renderEmailUsageGridCell(usage, column.key))}
                                                    <td className="px-5 py-4 text-right">
                                                        <div className="ml-auto flex items-center justify-end gap-2">
                                                            {renderEmailUsageInfoButton(usage)}
                                                            <GridRowActionIconButton
                                                                title="Alterar e-mail do vínculo"
                                                                onClick={() => openEmailUsageEditor(usage)}
                                                                tone="blue"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </GridRowActionIconButton>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="px-5 py-8 text-sm text-slate-500 bg-white">
                                    Nenhum vínculo ativo usa esse e-mail no momento.
                                </div>
                            )}
                        </div>
                    )}
                </section>
                {/* Tabela de Escolas */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="flex items-center justify-end border-b border-slate-200 bg-slate-50 px-6 py-4">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setIsTenantGridConfigOpen(true)}
                                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                            >
                                Colunas
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsTenantExportModalOpen(true)}
                                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                            >
                                Exportar
                            </button>
                        </div>
                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-bold">
                                {visibleTenantColumns.map((column) => (
                                    <th key={column.key} className="px-6 py-4">
                                        <GridSortableHeader
                                            label={column.label}
                                            isActive={tenantSortState.column === column.key}
                                            direction={tenantSortState.direction}
                                            onClick={() => toggleTenantSort(column.key)}
                                        />
                                    </th>
                                ))}
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={visibleTenantColumns.length + 1} className="px-6 py-12 text-center text-slate-400 font-medium tracking-wide">
                                        Lendo o Core do Banco de Dados...
                                    </td>
                                </tr>
                            ) : sortedEscolas.length === 0 ? (
                                <tr>
                                    <td colSpan={visibleTenantColumns.length + 1} className="px-6 py-12 text-center text-slate-400 font-medium">
                                        Nenhuma escola no sistema ainda. Implante o primeiro cliente.
                                    </td>
                                </tr>
                            ) : (
                                sortedEscolas.map((escola) => (
                                    <tr key={escola.id} className="hover:bg-indigo-50/30 transition-colors">
                                        {visibleTenantColumns.map((column) => renderTenantGridCell(escola, column.key))}
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {renderTenantInfoButton(escola)}
                                                <GridRowActionIconButton
                                                    title="Abrir acessos da escola"
                                                    onClick={() => setAccessTenant(escola)}
                                                    tone="violet"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5V4H2v16h5m10 0v-2a4 4 0 00-4-4H11a4 4 0 00-4 4v2m10 0H7m10-10a4 4 0 11-8 0 4 4 0 018 0z" />
                                                    </svg>
                                                </GridRowActionIconButton>
                                                <GridRowActionIconButton title="Editar escola" onClick={() => handleEdit(escola)} tone="blue">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </GridRowActionIconButton>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </main>

            {editingEmailUsage && (
                <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Alterar E-mail do Vínculo</h3>
                                <p className="text-xs text-slate-500 mt-1">Atualize apenas o registro selecionado na consulta master.</p>
                            </div>
                            <button onClick={closeEmailUsageEditor} className="text-slate-400 hover:text-red-500">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <form onSubmit={handleEmailUsageUpdate} className="p-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Tipo</div>
                                    <div className="font-bold text-slate-800">{getEmailEntityLabel(editingEmailUsage)}</div>
                                </div>
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Escola</div>
                                    <div className="font-bold text-slate-800">{editingEmailUsage.tenantName}</div>
                                </div>
                                <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-4">
                                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Registro</div>
                                    <div className="font-bold text-slate-800">{editingEmailUsage.recordName}</div>
                                    <div className="text-[10px] font-mono text-slate-400 mt-1">{editingEmailUsage.recordId}</div>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">E-mail atual</label>
                                <input type="text" value={editingEmailUsage.currentEmail} readOnly className="w-full bg-slate-100 border border-slate-200 text-slate-500 font-medium rounded-xl px-4 py-3 text-sm outline-none" />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">Novo e-mail</label>
                                <input
                                    type="text"
                                    required
                                    value={replacementEmail}
                                    onChange={e => setReplacementEmail(e.target.value.toUpperCase())}
                                    className="w-full bg-white border border-slate-300 text-slate-900 font-medium rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                    placeholder="NOVOEMAIL@DOMINIO.COM"
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={closeEmailUsageEditor} className="px-5 py-3 text-slate-500 font-semibold hover:bg-slate-100 rounded-xl transition-colors text-sm">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={emailUpdateLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold shadow-md shadow-indigo-600/30 text-sm tracking-wide transition-all active:scale-95 disabled:opacity-70">
                                    {emailUpdateLoading ? 'Salvando...' : 'Salvar Novo E-mail'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <GlobalSettingsModal
                isOpen={isGeneralSettingsOpen}
                activeTab={generalSettingsTab}
                values={generalSettings}
                status={generalSettingsStatus}
                isSaving={isGeneralSettingsLoading}
                isTesting={isGeneralSettingsTesting}
                testResult={generalSettingsTestResult}
                onClose={() => setIsGeneralSettingsOpen(false)}
                onTabChange={setGeneralSettingsTab}
                onChange={updateGeneralSettingsField}
                onSave={handleSaveGeneralSettings}
                onTestS3={handleTestS3GeneralSettings}
                onDismissTestResult={() => setGeneralSettingsTestResult(null)}
            />
            {accessTenant && (
                <TenantAccessManager
                    tenant={accessTenant}
                    getMasterPass={getMasterPassForRequest}
                    onClose={closeAccessManager}
                    onChanged={fetchEscolas}
                />
            )}

            <GridColumnConfigModal
                isOpen={isEmailUsageGridConfigOpen}
                title="Configurar colunas do grid"
                description="Reordene, oculte ou inclua colunas da consulta de vínculos de e-mail."
                columns={EMAIL_USAGE_COLUMNS.map((column) => ({ key: column.key, label: column.label, visibleByDefault: column.visibleByDefault }))}
                orderedColumns={emailUsageColumnOrder}
                hiddenColumns={emailUsageHiddenColumns}
                onToggleColumnVisibility={toggleEmailUsageColumnVisibility}
                onMoveColumn={moveEmailUsageColumn}
                onReset={resetEmailUsageColumns}
                onClose={() => setIsEmailUsageGridConfigOpen(false)}
            />

            <GridColumnConfigModal
                isOpen={isTenantGridConfigOpen}
                title="Configurar colunas do grid"
                description="Reordene, oculte ou inclua colunas da listagem de escolas."
                columns={TENANT_COLUMNS.map((column) => ({ key: column.key, label: column.label, visibleByDefault: column.visibleByDefault }))}
                orderedColumns={tenantColumnOrder}
                hiddenColumns={tenantHiddenColumns}
                onToggleColumnVisibility={toggleTenantColumnVisibility}
                onMoveColumn={moveTenantColumn}
                onReset={resetTenantColumns}
                onClose={() => setIsTenantGridConfigOpen(false)}
            />

            <GridExportModal
                isOpen={isEmailUsageExportModalOpen}
                title="Exportar vínculos de e-mail"
                description={`A exportação respeita o resultado atual da consulta e inclui ${sortedEmailUsageResults.length} registro(s).`}
                format={emailUsageExportFormat}
                onFormatChange={setEmailUsageExportFormat}
                columns={EMAIL_USAGE_EXPORT_COLUMNS.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={emailUsageExportColumns}
                onToggleColumn={toggleEmailUsageExportColumn}
                onSelectAll={setAllEmailUsageExportColumns}
                storageKey={getEmailUsageExportConfigStorageKey()}
                onClose={() => setIsEmailUsageExportModalOpen(false)}
                onExport={async (config) => {
                    try {
                        await exportGridRows({
                            rows: sortedEmailUsageResults,
                            columns: config?.orderedColumns
                                ? config.orderedColumns
                                    .map((key) => EMAIL_USAGE_EXPORT_COLUMNS.find((column) => column.key === key))
                                    .filter((column): column is GridColumnDefinition<EmailUsageRecord, EmailUsageExportColumnKey> => !!column)
                                : EMAIL_USAGE_EXPORT_COLUMNS,
                            selectedColumns: config?.selectedColumns || emailUsageExportColumns,
                            format: emailUsageExportFormat,
                            pdfOptions: config?.pdfOptions,
                            fileBaseName: 'vinculos-email',
                            branding: {
                                title: 'Vínculos de e-mail',
                                subtitle: 'Exportação com o resultado atual da consulta master.',
                            },
                        });
                        setEmailUsageSuccess(`Exportação ${emailUsageExportFormat.toUpperCase()} preparada com ${sortedEmailUsageResults.length} registro(s).`);
                        setIsEmailUsageExportModalOpen(false);
                    } catch (error: any) {
                        setEmailUsageError(error?.message || 'Não foi possível exportar os vínculos de e-mail.');
                    }
                }}
            />

            <GridExportModal
                isOpen={isTenantExportModalOpen}
                title="Exportar escolas"
                description={`A exportação inclui ${sortedEscolas.length} escola(s) carregada(s) na listagem master.`}
                format={tenantExportFormat}
                onFormatChange={setTenantExportFormat}
                columns={TENANT_EXPORT_COLUMNS.map((column) => ({ key: column.key, label: column.label }))}
                selectedColumns={tenantExportColumns}
                onToggleColumn={toggleTenantExportColumn}
                onSelectAll={setAllTenantExportColumns}
                storageKey={getTenantExportConfigStorageKey()}
                onClose={() => setIsTenantExportModalOpen(false)}
                onExport={async (config) => {
                    try {
                        await exportGridRows({
                            rows: sortedEscolas,
                            columns: config?.orderedColumns
                                ? config.orderedColumns
                                    .map((key) => TENANT_EXPORT_COLUMNS.find((column) => column.key === key))
                                    .filter((column): column is GridColumnDefinition<TenantRecord, TenantExportColumnKey> => !!column)
                                : TENANT_EXPORT_COLUMNS,
                            selectedColumns: config?.selectedColumns || tenantExportColumns,
                            format: tenantExportFormat,
                            pdfOptions: config?.pdfOptions,
                            fileBaseName: 'escolas',
                            branding: {
                                title: 'Escolas cadastradas',
                                subtitle: 'Exportação da listagem atual do painel master.',
                            },
                        });
                        setErrorStatus(null);
                        setIsTenantExportModalOpen(false);
                    } catch (error) {
                        setErrorStatus(error instanceof Error ? error.message : 'Não foi possível exportar as escolas.');
                    }
                }}
            />
            {/* Modal Nova Escola */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">

                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                            <h2 className="text-xl font-bold text-[#153a6a] flex items-center gap-2">
                                {editingTenantId ? 'Editar Escola Cliente' : 'Nova Escola Cliente'}
                            </h2>
                            <button onClick={closeModal} className="text-slate-400 hover:text-red-500">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* NAVEGAÇÃO DE ABAS */}
                        <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 pt-4 gap-2">
                            <button type="button" onClick={() => setActiveTab(1)} className={`px-4 py-2.5 rounded-t-lg font-bold text-sm tracking-wide transition-colors ${activeTab === 1 ? 'bg-white text-indigo-700 border-t border-l border-r border-slate-200 shadow-sm' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100'}`}>
                                1. DADOS BÁSICOS (DB)
                            </button>
                            <button type="button" onClick={() => setActiveTab(2)} className={`px-4 py-2.5 rounded-t-lg font-bold text-sm tracking-wide transition-colors ${activeTab === 2 ? 'bg-white text-indigo-700 border-t border-l border-r border-slate-200 shadow-sm' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100'}`}>
                                2. ENDEREÇO (EC)
                            </button>
                            <button type="button" onClick={() => setActiveTab(3)} className={`px-4 py-2.5 rounded-t-lg font-bold text-sm tracking-wide transition-colors ${activeTab === 3 ? 'bg-white text-indigo-700 border-t border-l border-r border-slate-200 shadow-sm' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100'}`}>
                                3. DADOS FINANCEIROS
                            </button>
                            <button type="button" onClick={() => setActiveTab(4)} className={`px-4 py-2.5 rounded-t-lg font-bold text-sm tracking-wide transition-colors ${activeTab === 4 ? 'bg-white text-indigo-700 border-t border-l border-r border-slate-200 shadow-sm' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100'}`}>
                                4. ADMINISTRADOR
                            </button>
                            <button type="button" onClick={() => setActiveTab(5)} className={`px-4 py-2.5 rounded-t-lg font-bold text-sm tracking-wide transition-colors ${activeTab === 5 ? 'bg-white text-indigo-700 border-t border-l border-r border-slate-200 shadow-sm' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100'}`}>
                                5. SISTEMA DE E-MAILS
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50 p-6">
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 min-h-[300px]">

                                {activeTab === 1 && (
                                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                        <h4 className="text-xs uppercase tracking-wider font-bold text-indigo-800 mb-4 pb-2 border-b border-indigo-50">Identificação Jurídica da Instituição</h4>
                                        <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5">
                                            <div className="grid gap-5 md:grid-cols-[180px_1fr] md:items-center">
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-indigo-200 bg-white shadow-sm">
                                                        {formData.logoUrl ? (
                                                            <img src={formData.logoUrl} alt="Logotipo da escola" className="h-full w-full object-contain" />
                                                        ) : (
                                                            <div className="px-4 text-center text-xs font-bold text-slate-400">
                                                                LOGOTIPO DA ESCOLA
                                                            </div>
                                                        )}
                                                    </div>
                                                    {formData.logoUrl ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData((current) => ({ ...current, logoUrl: '' }))}
                                                            className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100"
                                                        >
                                                            Remover logotipo
                                                        </button>
                                                    ) : null}
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 mb-1 block">Logotipo da escola</label>
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleLogoChange}
                                                        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-indigo-700"
                                                    />
                                                    <p className="mt-2 text-xs font-medium text-slate-500">
                                                        A imagem fica gravada no banco e será exibida no dashboard da escola logada.
                                                    </p>
                                                    {logoError ? (
                                                        <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                                                            {logoError}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                            <div className="lg:col-span-3">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Nome da Instituição *</label>
                                                <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder="Ex: Colégio Progresso" />
                                            </div>
                                            <div className="lg:col-span-3">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Razão Social</label>
                                                <input type="text" value={formData.corporateName} onChange={e => setFormData({ ...formData, corporateName: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" placeholder="Razão Social LTDA" />
                                            </div>
                                            <div className="lg:col-span-1 border-r border-slate-100 pr-5">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Apelido (Nome Fantasia)</label>
                                                <input type="text" value={formData.nickname} onChange={e => setFormData({ ...formData, nickname: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />

                                                <div className="mt-4">
                                                    <label className="text-xs font-bold text-slate-600 mb-1 block">CNPJ</label>
                                                    <input type="text" value={formData.cnpj} onChange={e => setFormData({ ...formData, cnpj: e.target.value.toUpperCase(), document: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" placeholder="00.000.000/0001-00" />
                                                </div>
                                            </div>

                                            <div className="lg:col-span-2 grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 mb-1 block">Celular 1 (WhatsApp Oficial)</label>
                                                    <input type="text" value={formData.whatsapp} onChange={e => setFormData({ ...formData, whatsapp: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 mb-1 block">E-mail Administrativo</label>
                                                    <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 mb-1 block">Telefone Fixo</label>
                                                    <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 mb-1 block">Celular 2 (Recados)</label>
                                                    <input type="text" value={formData.cellphone2} onChange={e => setFormData({ ...formData, cellphone2: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 mb-1 block">CPF do Titular</label>
                                                    <input type="text" value={formData.cpf} onChange={e => setFormData({ ...formData, cpf: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 mb-1 block">RG do Titular</label>
                                                    <input type="text" value={formData.rg} onChange={e => setFormData({ ...formData, rg: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 2 && (
                                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                        <h4 className="text-xs uppercase tracking-wider font-bold text-indigo-800 mb-4 pb-2 border-b border-indigo-50">Endereço Completo e Logística</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">CEP</label>
                                                <div className="flex gap-2">
                                                    <input type="text" value={formData.zipCode} onChange={e => setFormData({ ...formData, zipCode: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" placeholder="00000-000" />
                                                    <button type="button" onClick={handleCepSearch} className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border border-indigo-200 rounded-lg px-3 transition-colors flex items-center justify-center font-bold shadow-sm" title="Consultar CEP">
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Logradouro / Rua</label>
                                                <input type="text" value={formData.street} onChange={e => setFormData({ ...formData, street: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Número</label>
                                                <input type="text" value={formData.number} onChange={e => setFormData({ ...formData, number: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Bairro</label>
                                                <input type="text" value={formData.neighborhood} onChange={e => setFormData({ ...formData, neighborhood: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Complemento</label>
                                                <input type="text" value={formData.complement} onChange={e => setFormData({ ...formData, complement: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                                            </div>
                                            <div className="md:col-span-3">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Cidade</label>
                                                <input type="text" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value.toUpperCase() })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">UF</label>
                                                <select value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all">
                                                    <option value="">Selecione</option>
                                                    <option value="AC">Acre</option>
                                                    <option value="AL">Alagoas</option>
                                                    <option value="AP">Amapá</option>
                                                    <option value="AM">Amazonas</option>
                                                    <option value="BA">Bahia</option>
                                                    <option value="CE">Ceará</option>
                                                    <option value="DF">Distrito Federal</option>
                                                    <option value="ES">Espírito Santo</option>
                                                    <option value="GO">Goiás</option>
                                                    <option value="MA">Maranhão</option>
                                                    <option value="MT">Mato Grosso</option>
                                                    <option value="MS">Mato Grosso do Sul</option>
                                                    <option value="MG">Minas Gerais</option>
                                                    <option value="PA">Pará</option>
                                                    <option value="PB">Paraíba</option>
                                                    <option value="PR">Paraná</option>
                                                    <option value="PE">Pernambuco</option>
                                                    <option value="PI">Piauí</option>
                                                    <option value="RJ">Rio de Janeiro</option>
                                                    <option value="RN">Rio Grande do Norte</option>
                                                    <option value="RS">Rio Grande do Sul</option>
                                                    <option value="RO">Rondônia</option>
                                                    <option value="RR">Roraima</option>
                                                    <option value="SC">Santa Catarina</option>
                                                    <option value="SP">São Paulo</option>
                                                    <option value="SE">Sergipe</option>
                                                    <option value="TO">Tocantins</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 3 && (
                                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                        <h4 className="text-xs uppercase tracking-wider font-bold text-indigo-800 mb-4 pb-2 border-b border-indigo-50">Configurações Base Financeiras</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">% Juros Mensais</label>
                                                <input type="number" step="0.01" value={formData.interestRate} onChange={e => setFormData({ ...formData, interestRate: e.target.value })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" placeholder="Ex: 5" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Dias de Carência (Juros)</label>
                                                <input type="number" step="1" value={formData.interestGracePeriod} onChange={e => setFormData({ ...formData, interestGracePeriod: e.target.value })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" placeholder="Ex: 5" />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">% Multa</label>
                                                <input type="number" step="0.01" value={formData.penaltyRate} onChange={e => setFormData({ ...formData, penaltyRate: e.target.value, penaltyValue: (Number(e.target.value) > 0) ? '' : formData.penaltyValue })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" placeholder="% Multa" disabled={Number(formData.penaltyValue) > 0} />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block text-slate-400">R$ Valor Fixo Multa</label>
                                                <input type="number" step="0.01" value={formData.penaltyValue} onChange={e => setFormData({ ...formData, penaltyValue: e.target.value, penaltyRate: (Number(e.target.value) > 0) ? '' : formData.penaltyRate })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" placeholder="R$ Valor da Multa" disabled={Number(formData.penaltyRate) > 0} />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Dias de Carência (Multa)</label>
                                                <input type="number" step="1" value={formData.penaltyGracePeriod} onChange={e => setFormData({ ...formData, penaltyGracePeriod: e.target.value })} className="w-full bg-slate-100/50 border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" placeholder="Ex: 5" />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 4 && (
                                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                        <h4 className="text-xs uppercase tracking-wider font-bold text-indigo-800 mb-4 pb-2 border-b border-indigo-50">Conta Limite do Administrador Titular</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl mx-auto mt-6 bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-inner">
                                            <div className="md:col-span-2">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Nome do Responsável Titular *</label>
                                                <input type="text" required value={formData.adminName} onChange={e => setFormData({ ...formData, adminName: e.target.value.toUpperCase() })} className="w-full bg-white border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">E-mail Corporativo de Acesso *</label>
                                                <input type="email" required value={formData.adminEmail} onChange={e => setFormData({ ...formData, adminEmail: e.target.value.toUpperCase() })} className="w-full bg-white border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">
                                                    {editingTenantId ? 'Senha de Acesso (Criptografada e Segura)' : 'Senha Inicial de Acesso *'}
                                                </label>
                                                <input type="text" required={!editingTenantId} minLength={6} value={formData.adminPassword} onChange={e => setFormData({ ...formData, adminPassword: e.target.value })} className="w-full bg-white border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm" placeholder={editingTenantId ? '•••••••• (Digite uma nova para substituir)' : 'Mínimo 6 caracteres'} />
                                            </div>
                                        </div>

                                        <div className="mt-8 flex justify-end gap-3 pt-5 border-t border-slate-100">
                                            <button type="button" onClick={() => setActiveTab(5)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-md shadow-indigo-600/30 text-sm tracking-wide transition-all active:scale-95">
                                                Avançar para Sistema de E-mails →
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 5 && (
                                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                        <h4 className="text-xs uppercase tracking-wider font-bold text-indigo-800 mb-4 pb-2 border-b border-indigo-50">Configuração de Servidor de E-mail (SMTP)</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto mt-6 bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-inner">
                                            <div className="md:col-span-2">
                                                <h5 className="text-center text-sm font-semibold text-slate-600 mb-2">Configure o SMTP da escola para recuperação de senha e notificações.</h5>
                                            </div>

                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Host SMTP</label>
                                                <input type="text" value={formData.smtpHost} onChange={e => setFormData({ ...formData, smtpHost: e.target.value.toLowerCase() })} className="w-full bg-white border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm" placeholder="smtp.gmail.com" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Porta SMTP</label>
                                                <input type="number" min={1} max={65535} value={formData.smtpPort} onChange={e => setFormData({ ...formData, smtpPort: e.target.value })} className="w-full bg-white border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm" placeholder="465" />
                                            </div>

                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Tempo Limite (segundos)</label>
                                                <input type="number" min={5} max={600} value={formData.smtpTimeout} onChange={e => setFormData({ ...formData, smtpTimeout: e.target.value })} className="w-full bg-white border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm" placeholder="60" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Tipo de Autenticação</label>
                                                <select
                                                    value={formData.smtpAuthType}
                                                    onChange={e => {
                                                        const authType = e.target.value;
                                                        const secure = authType === 'SSL';
                                                        setFormData({
                                                            ...formData,
                                                            smtpAuthType: authType,
                                                            smtpSecure: secure,
                                                            smtpPort: secure ? '465' : '587'
                                                        });
                                                    }}
                                                    className="w-full bg-white border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm"
                                                >
                                                    <option value="SSL">SSL (465)</option>
                                                    <option value="STARTTLS">STARTTLS/TLS (587)</option>
                                                </select>
                                            </div>

                                            <div className="md:col-span-2 flex flex-wrap items-center gap-6 pt-2">
                                                <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                                                    <input type="checkbox" checked={!!formData.smtpAuthenticate} onChange={e => setFormData({ ...formData, smtpAuthenticate: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                                                    Exigir autenticação SMTP (usuário/senha)
                                                </label>
                                                <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                                                    <input type="checkbox" checked={!!formData.smtpSecure} onChange={e => setFormData({ ...formData, smtpSecure: e.target.checked, smtpAuthType: e.target.checked ? 'SSL' : 'STARTTLS', smtpPort: e.target.checked ? '465' : '587' })} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                                                    Conexão segura (SSL)
                                                </label>
                                            </div>

                                            <div className="md:col-span-2">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Usuário SMTP (e-mail remetente)</label>
                                                <input type="email" value={formData.smtpEmail} onChange={e => setFormData({ ...formData, smtpEmail: e.target.value.toLowerCase() })} className="w-full bg-white border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm" placeholder="financeiro.franca.msinfor@gmail.com" />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="text-xs font-bold text-slate-600 mb-1 block">Senha SMTP / App Password</label>
                                                <input type="password" value={formData.smtpPassword} onChange={e => setFormData({ ...formData, smtpPassword: e.target.value })} className="w-full bg-white border border-slate-300 text-slate-900 font-medium rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm" placeholder="App password do provedor" />
                                            </div>
                                        </div>

                                        <div className="mt-8 flex justify-end gap-3 pt-5 border-t border-slate-100">
                                            <button type="button" onClick={closeModal} className="px-6 py-3 text-slate-500 font-semibold hover:bg-slate-100 rounded-xl transition-colors text-sm">Cancelar e Fechar</button>
                                            <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-green-600/30 text-sm tracking-wide transition-all active:scale-95 flex items-center gap-2">
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                {editingTenantId ? 'Salvar Edição da Escola' : 'Confirmar e Implantar Escola'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Botoes de Navegação das Abas genéricas */}
                            {(activeTab !== 4 && activeTab !== 5) && (
                                <div className="mt-5 flex justify-end gap-3 max-w-4xl pt-2">
                                    <button type="button" onClick={closeModal} className="px-6 py-3 text-slate-400 font-semibold hover:bg-slate-100 rounded-xl transition-colors text-sm">Cancelar</button>
                                    <button type="button" onClick={() => setActiveTab(activeTab + 1)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-md shadow-indigo-600/30 text-sm tracking-wide transition-all active:scale-95">
                                        Próxima Etapa →
                                    </button>
                                </div>
                            )}

                        </form>
                    </div>
                </div>
            )}
            {/* MODAL MÁGICO DE ERRO AO SALVAR ESCOLA (POP-UP / TOAST) */}
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
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 mb-1">Atenção</h3>

                            <div className="flex flex-col items-center w-full mt-1 mb-2">
                                <p className="text-slate-600 font-bold text-[15px] leading-tight text-center">
                                    {saveError.split('\n').map((line, i) => (
                                        <span key={i} className="block mb-1">
                                            {line}
                                        </span>
                                    ))}
                                </p>
                            </div>

                            <p className="text-xs text-slate-400 mt-2">Fechando automaticamente em 5s...</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}











