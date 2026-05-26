'use client';

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { readImageFileAsDataUrl } from '@/app/lib/dashboard-crud-utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const BRANCH_MANAGER_SCREEN_ID = 'MSINFOR_ADMIN_FILIAIS_ESCOLA';
const BRANCH_EDITOR_SCREEN_ID = 'MSINFOR_ADMIN_EDITAR_FILIAL_ESCOLA';

type BranchEditorTab = 'general' | 'logo' | 'phones' | 'address' | 'parameters' | 'smtp' | 'storage';
type BranchStockParameterMode = 'NO' | 'YES' | 'BY_PRODUCT';
type BranchStockParameterField =
  | 'stockControlMode'
  | 'stockIntegerQuantityMode'
  | 'stockLotControlMode'
  | 'stockExpirationControlMode'
  | 'stockGridControlMode'
  | 'stockNegativeControlMode';

const BRANCH_EDITOR_TABS: Array<{ key: BranchEditorTab; label: string }> = [
  { key: 'general', label: 'Informações gerais' },
  { key: 'logo', label: 'Logotipo' },
  { key: 'phones', label: 'Telefones' },
  { key: 'address', label: 'Endereço' },
  { key: 'parameters', label: 'Parâmetros' },
  { key: 'smtp', label: 'Sistema de e-mails' },
  { key: 'storage', label: 'Arquivos / Storage' },
];

const STOCK_PARAMETER_OPTIONS: Array<{ value: BranchStockParameterMode; label: string }> = [
  { value: 'BY_PRODUCT', label: 'Controlar por produto' },
  { value: 'YES', label: 'Sim' },
  { value: 'NO', label: 'Não' },
];

type TenantBranchRecord = {
  id: string;
  branchCode: number;
  name: string;
  logoUrl?: string | null;
  document?: string | null;
  rg?: string | null;
  cpf?: string | null;
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
  stockControlMode?: BranchStockParameterMode | null;
  stockIntegerQuantityMode?: BranchStockParameterMode | null;
  stockLotControlMode?: BranchStockParameterMode | null;
  stockExpirationControlMode?: BranchStockParameterMode | null;
  stockGridControlMode?: BranchStockParameterMode | null;
  stockNegativeControlMode?: BranchStockParameterMode | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpTimeout?: number | null;
  smtpAuthenticate?: boolean | null;
  smtpSecure?: boolean | null;
  smtpAuthType?: string | null;
  smtpEmail?: string | null;
  smtpPassword?: string | null;
  storageProviderAccessKeyId?: string | null;
  storageProviderSecretAccessKey?: string | null;
  storageBucketName?: string | null;
  storageFolderName?: string | null;
  storageDefaultAcl?: string | null;
  storageDefaultExpiration?: number | null;
  storageRegion?: string | null;
  storageEndpoint?: string | null;
  storageCustomEndpoint?: string | null;
  isActive: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

type TenantBranchForm = {
  branchCode: string;
  name: string;
  logoUrl: string;
  document: string;
  rg: string;
  cpf: string;
  cnpj: string;
  nickname: string;
  corporateName: string;
  phone: string;
  whatsapp: string;
  cellphone1: string;
  cellphone2: string;
  email: string;
  zipCode: string;
  street: string;
  number: string;
  city: string;
  state: string;
  neighborhood: string;
  complement: string;
  stockControlMode: BranchStockParameterMode;
  stockIntegerQuantityMode: BranchStockParameterMode;
  stockLotControlMode: BranchStockParameterMode;
  stockExpirationControlMode: BranchStockParameterMode;
  stockGridControlMode: BranchStockParameterMode;
  stockNegativeControlMode: BranchStockParameterMode;
  smtpHost: string;
  smtpPort: string;
  smtpTimeout: string;
  smtpAuthenticate: boolean;
  smtpSecure: boolean;
  smtpAuthType: string;
  smtpEmail: string;
  smtpPassword: string;
  storageProviderAccessKeyId: string;
  storageProviderSecretAccessKey: string;
  storageBucketName: string;
  storageFolderName: string;
  storageDefaultAcl: string;
  storageDefaultExpiration: string;
  storageRegion: string;
  storageEndpoint: string;
  storageCustomEndpoint: string;
};

type TenantBranchManagerProps = {
  tenant: {
    id: string;
    name: string;
  };
  getMasterPass: () => string;
  onClose: () => void;
};

const EMPTY_FORM: TenantBranchForm = {
  branchCode: '',
  name: '',
  logoUrl: '',
  document: '',
  rg: '',
  cpf: '',
  cnpj: '',
  nickname: '',
  corporateName: '',
  phone: '',
  whatsapp: '',
  cellphone1: '',
  cellphone2: '',
  email: '',
  zipCode: '',
  street: '',
  number: '',
  city: '',
  state: '',
  neighborhood: '',
  complement: '',
  stockControlMode: 'BY_PRODUCT',
  stockIntegerQuantityMode: 'BY_PRODUCT',
  stockLotControlMode: 'BY_PRODUCT',
  stockExpirationControlMode: 'BY_PRODUCT',
  stockGridControlMode: 'BY_PRODUCT',
  stockNegativeControlMode: 'BY_PRODUCT',
  smtpHost: '',
  smtpPort: '',
  smtpTimeout: '',
  smtpAuthenticate: true,
  smtpSecure: true,
  smtpAuthType: 'SSL',
  smtpEmail: '',
  smtpPassword: '',
  storageProviderAccessKeyId: '',
  storageProviderSecretAccessKey: '',
  storageBucketName: '',
  storageFolderName: '',
  storageDefaultAcl: '',
  storageDefaultExpiration: '',
  storageRegion: '',
  storageEndpoint: '',
  storageCustomEndpoint: '',
};

function normalizeStockParameterMode(value?: string | null): BranchStockParameterMode {
  return value === 'NO' || value === 'YES' || value === 'BY_PRODUCT' ? value : 'BY_PRODUCT';
}

function toForm(branch: TenantBranchRecord): TenantBranchForm {
  return {
    branchCode: String(branch.branchCode || ''),
    name: branch.name || '',
    logoUrl: branch.logoUrl || '',
    document: branch.document || '',
    rg: branch.rg || '',
    cpf: branch.cpf || '',
    cnpj: branch.cnpj || '',
    nickname: branch.nickname || '',
    corporateName: branch.corporateName || '',
    phone: branch.phone || '',
    whatsapp: branch.whatsapp || '',
    cellphone1: branch.cellphone1 || '',
    cellphone2: branch.cellphone2 || '',
    email: branch.email || '',
    zipCode: branch.zipCode || '',
    street: branch.street || '',
    number: branch.number || '',
    city: branch.city || '',
    state: branch.state || '',
    neighborhood: branch.neighborhood || '',
    complement: branch.complement || '',
    stockControlMode: normalizeStockParameterMode(branch.stockControlMode),
    stockIntegerQuantityMode: normalizeStockParameterMode(branch.stockIntegerQuantityMode),
    stockLotControlMode: normalizeStockParameterMode(branch.stockLotControlMode),
    stockExpirationControlMode: normalizeStockParameterMode(branch.stockExpirationControlMode),
    stockGridControlMode: normalizeStockParameterMode(branch.stockGridControlMode),
    stockNegativeControlMode: normalizeStockParameterMode(branch.stockNegativeControlMode),
    smtpHost: branch.smtpHost || '',
    smtpPort: branch.smtpPort ? String(branch.smtpPort) : '',
    smtpTimeout: branch.smtpTimeout ? String(branch.smtpTimeout) : '',
    smtpAuthenticate: branch.smtpAuthenticate ?? true,
    smtpSecure: branch.smtpSecure ?? true,
    smtpAuthType: branch.smtpAuthType || ((branch.smtpSecure ?? true) ? 'SSL' : 'STARTTLS'),
    smtpEmail: branch.smtpEmail || '',
    smtpPassword: '',
    storageProviderAccessKeyId: branch.storageProviderAccessKeyId || '',
    storageProviderSecretAccessKey: branch.storageProviderSecretAccessKey || '',
    storageBucketName: branch.storageBucketName || '',
    storageFolderName: branch.storageFolderName || '',
    storageDefaultAcl: branch.storageDefaultAcl || '',
    storageDefaultExpiration: branch.storageDefaultExpiration ? String(branch.storageDefaultExpiration) : '',
    storageRegion: branch.storageRegion || '',
    storageEndpoint: branch.storageEndpoint || '',
    storageCustomEndpoint: branch.storageCustomEndpoint || '',
  };
}

function inputClassName() {
  return 'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';
}

function labelClassName() {
  return 'mb-1 block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500';
}

function editorTabClassName(isActive: boolean) {
  return [
    'rounded-lg px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition-colors',
    isActive
      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
      : 'border border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700',
  ].join(' ');
}

type BranchManagerAuditParams = {
  tenantId: string;
  tenantName: string;
  loadedRowsCount: number;
  rowsCount: number;
  activeRowsCount: number;
  inactiveRowsCount: number;
};

function toSqlLiteral(value: string) {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

function buildBranchManagerAuditSql({
  tenantId,
}: BranchManagerAuditParams) {
  const tenantLiteral = tenantId ? toSqlLiteral(tenantId) : ':tenantId';

  return `-- PARAMETROS ATUAIS DO GRID
-- :tenantId = ${tenantId ? tenantLiteral : 'NAO IDENTIFICADO'}
-- :statusFilter = ${toSqlLiteral('ALL')}
-- :canceledFilter = ${toSqlLiteral('ACTIVE_RECORDS')}

SELECT
  TB.id,
  TB.tenantId,
  TB.branchCode,
  TB.name,
  TB.logoUrl,
  TB.document,
  TB.cnpj,
  TB.cpf,
  TB.corporateName,
  TB.nickname,
  TB.phone,
  TB.whatsapp,
  TB.email,
  TB.street,
  TB.number,
  TB.neighborhood,
  TB.city,
  TB.state,
  TB.isActive,
  TB.updatedAt,
  TB.updatedBy
FROM tenant_branches TB
WHERE TB.tenantId = ${tenantLiteral}
  AND TB.canceledAt IS NULL
ORDER BY TB.branchCode ASC, TB.name ASC;`;
}

function buildBranchManagerAuditText(params: BranchManagerAuditParams) {
  const tenantLabel = params.tenantName ? `${params.tenantId} (${params.tenantName})` : params.tenantId;
  const sqlText = buildBranchManagerAuditSql(params);

  return `--- LOGICA DA TELA ---
Tela master do MSINFOR ADMIN para listar e manter as filiais operacionais da escola/empresa selecionada.

TABELAS PRINCIPAIS:
- tenant_branches (TB) - cadastro das filiais operacionais por escola/empresa
- tenants (T) - cadastro principal da escola/empresa usada como contexto da tela

RELACIONAMENTOS:
- tenant_branches.tenantId = tenants.id

FILTROS APLICADOS AGORA:
- escola/tenant selecionado (:tenantId): ${tenantLabel || 'NAO IDENTIFICADO'}
- busca digitada (:searchTerm): NAO APLICAVEL - esta grid nao possui campo de busca
- status selecionado (:statusFilter): ALL
- cancelamento logico (:canceledFilter): TB.canceledAt IS NULL
- registros carregados do backend: ${params.loadedRowsCount}
- registros exibidos apos os filtros: ${params.rowsCount}
- filiais ativas exibidas: ${params.activeRowsCount}
- filiais inativas exibidas: ${params.inactiveRowsCount}
- ordenacao atual: branchCode ASC, name ASC
- colunas visiveis agora: Codigo, Filial, Documento / CNPJ, Contato, Endereco, Status, Acao

SQL EQUIVALENTE DOS FILTROS DA TELA:
${sqlText}

OBSERVACAO SOBRE O FILTRO DA EMPRESA / ESCOLA:
- TB.tenantId e a coluna usada para isolar as filiais da escola/empresa selecionada
- :tenantId acima ja esta preenchido com o tenantId real escolhido no MSINFOR ADMIN
- o backend garante a existencia da filial principal branchCode = 1 quando necessario
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

export default function TenantBranchManager({
  tenant,
  getMasterPass,
  onClose,
}: TenantBranchManagerProps) {
  const [branches, setBranches] = useState<TenantBranchRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingBranch, setEditingBranch] = useState<TenantBranchRecord | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [activeEditorTab, setActiveEditorTab] = useState<BranchEditorTab>('general');
  const [formData, setFormData] = useState<TenantBranchForm>(EMPTY_FORM);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [isSmtpPasswordVisible, setIsSmtpPasswordVisible] = useState(false);

  const nextBranchCode = useMemo(() => {
    const maxCode = branches.reduce((max, branch) => Math.max(max, branch.branchCode || 0), 0);
    return String(Math.max(maxCode + 1, 1));
  }, [branches]);

  const sortedBranches = useMemo(
    () => [...branches].sort((left, right) => (left.branchCode || 0) - (right.branchCode || 0) || left.name.localeCompare(right.name)),
    [branches],
  );

  const branchAuditContext = useMemo(() => {
    const auditParams: BranchManagerAuditParams = {
      tenantId: tenant.id,
      tenantName: tenant.name,
      loadedRowsCount: branches.length,
      rowsCount: sortedBranches.length,
      activeRowsCount: sortedBranches.filter((branch) => branch.isActive).length,
      inactiveRowsCount: sortedBranches.filter((branch) => !branch.isActive).length,
    };

    return {
      auditText: buildBranchManagerAuditText(auditParams),
      sqlText: buildBranchManagerAuditSql(auditParams),
    };
  }, [branches.length, sortedBranches, tenant.id, tenant.name]);

  const loadBranches = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/tenants/${tenant.id}/branches`, {
        headers: { 'x-msinfor-master-pass': getMasterPass() },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || 'Não foi possível carregar as filiais.');
      }
      setBranches(Array.isArray(payload) ? payload : []);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar as filiais.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBranches();
  }, [tenant.id]);

  const startNewBranch = () => {
    setEditingBranch(null);
    setFormData({ ...EMPTY_FORM, branchCode: nextBranchCode, name: `FILIAL ${nextBranchCode}` });
    setActiveEditorTab('general');
    setIsEditorOpen(true);
    setError(null);
    setSuccess(null);
  };

  const startEditBranch = (branch: TenantBranchRecord) => {
    setEditingBranch(branch);
    setFormData(toForm(branch));
    setActiveEditorTab('general');
    setIsEditorOpen(true);
    setError(null);
    setSuccess(null);
  };

  const closeEditor = () => {
    setEditingBranch(null);
    setFormData(EMPTY_FORM);
    setLogoError(null);
    setActiveEditorTab('general');
    setIsSmtpPasswordVisible(false);
    setIsEditorOpen(false);
  };

  const updateField = (field: keyof TenantBranchForm, value: string | boolean) => {
    setFormData((current) => ({
      ...current,
      [field]: typeof value === 'boolean'
        ? value
        : field === 'smtpPassword' ||
          field === 'storageProviderSecretAccessKey' ||
          field === 'storageProviderAccessKeyId' ||
          field === 'storageBucketName' ||
          field === 'storageFolderName' ||
          field === 'storageDefaultAcl' ||
          field === 'storageRegion' ||
          field === 'storageEndpoint'
          ? value
          : field === 'smtpHost' || field === 'smtpEmail' || field === 'storageCustomEndpoint'
            ? value.toLowerCase()
            : value.toUpperCase(),
    }));
  };

  const handleLogoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setLogoError(null);
      const dataUrl = await readImageFileAsDataUrl(file);
      setFormData((current) => ({ ...current, logoUrl: dataUrl }));
    } catch (err: any) {
      setLogoError(err?.message || 'Não foi possível carregar o logotipo da filial.');
    } finally {
      event.target.value = '';
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const branchCode = Number.parseInt(formData.branchCode, 10);

    if (!Number.isInteger(branchCode) || branchCode < 1) {
      setError('Informe um código de filial maior ou igual a 1.');
      return;
    }

    if (!formData.name.trim()) {
      setError('Informe o nome da filial.');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);
      const response = await fetch(
        editingBranch
          ? `${API_BASE_URL}/tenants/${tenant.id}/branches/${editingBranch.id}`
          : `${API_BASE_URL}/tenants/${tenant.id}/branches`,
        {
          method: editingBranch ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-msinfor-master-pass': getMasterPass(),
          },
          body: JSON.stringify({
            ...formData,
            branchCode,
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || 'Não foi possível salvar a filial.');
      }

      setSuccess(editingBranch ? 'Filial atualizada com sucesso.' : 'Filial cadastrada com sucesso.');
      closeEditor();
      await loadBranches();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar a filial.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderStockParameterSelect = (
    field: BranchStockParameterField,
    label: string,
  ) => (
    <div>
      <label className={labelClassName()}>{label}</label>
      <select
        value={formData[field]}
        onChange={(event) => updateField(field, event.target.value)}
        className={inputClassName()}
      >
        {STOCK_PARAMETER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-50 font-sans">
      <header className="relative z-10 flex items-center justify-between border-b-4 border-indigo-500 bg-[#153a6a] p-4 text-white shadow-md">
        <div className="flex items-center gap-4 px-4">
          <img src="/logo-msinfor.jpg" alt="Logo MSINFOR" className="h-[50px] w-[50px] rounded-full ring-2 ring-white/20" />
          <div>
            <h1 className="text-xl font-black leading-tight tracking-wide">
              MSINFOR <span className="font-light">| MOTOR CENTRAL</span>
            </h1>
            <p className="mt-0.5 text-xs tracking-wider text-indigo-200">{BRANCH_MANAGER_SCREEN_ID}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4">
          <span className="rounded border border-indigo-500/30 bg-indigo-600/50 px-3 py-1.5 text-[11px] font-bold tracking-widest text-indigo-100">
            FILIAIS
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-red-300/30 bg-red-500/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-100 transition-colors hover:bg-red-500/20 hover:text-white"
          >
            Voltar
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Filiais da Empresa</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{tenant.name}</p>
          </div>
          <button type="button" onClick={startNewBranch} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-700">
            Nova filial
          </button>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-black uppercase tracking-[0.18em] text-slate-700">Filiais cadastradas</h4>
            <p className="mt-1 text-xs font-medium text-slate-500">{branches.length} filial(is) ativa(s)</p>
          </div>
        </div>

            {error && (
              <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                {success}
              </div>
            )}

            <div className="-mx-8 min-h-0 flex-1 overflow-auto border-y border-slate-200 bg-white">
              {isLoading ? (
                <div className="px-6 py-12 text-center text-sm font-semibold text-slate-400">
                  Carregando filiais...
                </div>
              ) : sortedBranches.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm font-semibold text-slate-400">
                  Nenhuma filial encontrada.
                </div>
              ) : (
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-4">Código</th>
                      <th className="px-5 py-4">Filial</th>
                      <th className="px-5 py-4">Documento / CNPJ</th>
                      <th className="px-5 py-4">Contato</th>
                      <th className="px-5 py-4">Endereço</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedBranches.map((branch) => {
                      const contact = branch.email || branch.whatsapp || branch.phone || '---';
                      const document = branch.document || branch.cnpj || branch.cpf || 'NÃO INFORMADO';
                      const address = [branch.street, branch.number, branch.neighborhood, branch.city, branch.state]
                        .filter(Boolean)
                        .join(', ') || 'NÃO INFORMADO';

                      return (
                        <tr key={branch.id} className="transition-colors hover:bg-indigo-50/30">
                          <td className="whitespace-nowrap px-5 py-4 text-sm font-black text-slate-700">{branch.branchCode}</td>
                          <td className="px-5 py-4">
                            <div className="flex min-w-[220px] items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-500">
                                {branch.logoUrl ? (
                                  <img src={branch.logoUrl} alt={branch.name} className="h-full w-full object-contain" />
                                ) : (
                                  branch.name.slice(0, 2)
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-black text-slate-800">{branch.name}</div>
                                <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                  {branch.corporateName || branch.nickname || 'FILIAL'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm font-semibold text-slate-600">{document}</td>
                          <td className="px-5 py-4 text-sm font-semibold text-slate-600">{contact}</td>
                          <td className="max-w-[320px] px-5 py-4 text-sm font-medium text-slate-500">
                            <div className="truncate" title={address}>{address}</div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-wrap gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
                                branch.isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {branch.isActive ? 'Ativa' : 'Inativa'}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => startEditBranch(branch)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-800"
                              title="Editar filial"
                              aria-label="Editar filial"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <ScreenNameCopy
                screenId={BRANCH_MANAGER_SCREEN_ID}
                label="Tela"
                className="mt-0"
                disableMargin
                auditText={branchAuditContext.auditText}
                sqlText={branchAuditContext.sqlText}
              />
            </div>

          {isEditorOpen ? (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
              <form onSubmit={handleSubmit} className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
                <div className="min-h-0 overflow-y-auto p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-black uppercase tracking-[0.18em] text-slate-700">
                  {editingBranch ? 'Editar filial' : 'Incluir filial'}
                </h4>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Dados próprios da filial, como CNPJ, contato e endereço operacional.
                </p>
              </div>
            </div>

            <div className="mb-5 flex flex-wrap gap-2 border-b border-slate-100 pb-4">
              {BRANCH_EDITOR_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveEditorTab(tab.key)}
                  className={editorTabClassName(activeEditorTab === tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeEditorTab === 'general' ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <label className={labelClassName()}>Código</label>
                  <input type="number" min={1} value={formData.branchCode} onChange={(event) => updateField('branchCode', event.target.value)} className={inputClassName()} />
                </div>
                <div className="md:col-span-3">
                  <label className={labelClassName()}>Nome da filial</label>
                  <input type="text" required value={formData.name} onChange={(event) => updateField('name', event.target.value)} className={inputClassName()} />
                </div>
                <div>
                  <label className={labelClassName()}>Documento</label>
                  <input type="text" value={formData.document} onChange={(event) => updateField('document', event.target.value)} className={inputClassName()} />
                </div>
                <div>
                  <label className={labelClassName()}>CNPJ</label>
                  <input type="text" value={formData.cnpj} onChange={(event) => updateField('cnpj', event.target.value)} className={inputClassName()} />
                </div>
                <div>
                  <label className={labelClassName()}>CPF</label>
                  <input type="text" value={formData.cpf} onChange={(event) => updateField('cpf', event.target.value)} className={inputClassName()} />
                </div>
                <div>
                  <label className={labelClassName()}>RG</label>
                  <input type="text" value={formData.rg} onChange={(event) => updateField('rg', event.target.value)} className={inputClassName()} />
                </div>
                <div>
                  <label className={labelClassName()}>Apelido</label>
                  <input type="text" value={formData.nickname} onChange={(event) => updateField('nickname', event.target.value)} className={inputClassName()} />
                </div>
                <div className="md:col-span-3">
                  <label className={labelClassName()}>Razão social</label>
                  <input type="text" value={formData.corporateName} onChange={(event) => updateField('corporateName', event.target.value)} className={inputClassName()} />
                </div>
              </div>
            ) : null}

            {activeEditorTab === 'logo' ? (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5">
                <div className="grid gap-5 md:grid-cols-[180px_1fr] md:items-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-indigo-200 bg-white shadow-sm">
                      {formData.logoUrl ? (
                        <img src={formData.logoUrl} alt="Logotipo da filial" className="h-full w-full object-contain" />
                      ) : (
                        <div className="px-4 text-center text-xs font-bold text-slate-400">LOGOTIPO</div>
                      )}
                    </div>
                    {formData.logoUrl ? (
                      <button type="button" onClick={() => setFormData((current) => ({ ...current, logoUrl: '' }))} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100">
                        Remover logotipo
                      </button>
                    ) : null}
                  </div>
                  <div>
                    <label className={labelClassName()}>Logotipo da filial</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-indigo-700"
                    />
                    {logoError ? <p className="mt-2 text-xs font-bold text-rose-600">{logoError}</p> : null}
                  </div>
                </div>
              </div>
            ) : null}

            {activeEditorTab === 'phones' ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <label className={labelClassName()}>Telefone</label>
                  <input type="text" value={formData.phone} onChange={(event) => updateField('phone', event.target.value)} className={inputClassName()} />
                </div>
                <div>
                  <label className={labelClassName()}>WhatsApp</label>
                  <input type="text" value={formData.whatsapp} onChange={(event) => updateField('whatsapp', event.target.value)} className={inputClassName()} />
                </div>
                <div>
                  <label className={labelClassName()}>Celular 01</label>
                  <input type="text" value={formData.cellphone1} onChange={(event) => updateField('cellphone1', event.target.value)} className={inputClassName()} />
                </div>
                <div>
                  <label className={labelClassName()}>Celular 02</label>
                  <input type="text" value={formData.cellphone2} onChange={(event) => updateField('cellphone2', event.target.value)} className={inputClassName()} />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClassName()}>E-mail</label>
                  <input type="text" value={formData.email} onChange={(event) => updateField('email', event.target.value)} className={inputClassName()} />
                </div>
              </div>
            ) : null}

            {activeEditorTab === 'address' ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <label className={labelClassName()}>CEP</label>
                  <input type="text" value={formData.zipCode} onChange={(event) => updateField('zipCode', event.target.value)} className={inputClassName()} />
                </div>
                <div className="md:col-span-3">
                  <label className={labelClassName()}>Logradouro</label>
                  <input type="text" value={formData.street} onChange={(event) => updateField('street', event.target.value)} className={inputClassName()} />
                </div>
                <div>
                  <label className={labelClassName()}>Número</label>
                  <input type="text" value={formData.number} onChange={(event) => updateField('number', event.target.value)} className={inputClassName()} />
                </div>
                <div>
                  <label className={labelClassName()}>Bairro</label>
                  <input type="text" value={formData.neighborhood} onChange={(event) => updateField('neighborhood', event.target.value)} className={inputClassName()} />
                </div>
                <div>
                  <label className={labelClassName()}>Cidade</label>
                  <input type="text" value={formData.city} onChange={(event) => updateField('city', event.target.value)} className={inputClassName()} />
                </div>
                <div>
                  <label className={labelClassName()}>Estado</label>
                  <input type="text" value={formData.state} onChange={(event) => updateField('state', event.target.value)} className={inputClassName()} />
                </div>
                <div className="md:col-span-4">
                  <label className={labelClassName()}>Complemento</label>
                  <input type="text" value={formData.complement} onChange={(event) => updateField('complement', event.target.value)} className={inputClassName()} />
                </div>
              </div>
            ) : null}

            {activeEditorTab === 'parameters' ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {renderStockParameterSelect('stockControlMode', 'Controlar quantidade do estoque')}
                {renderStockParameterSelect('stockIntegerQuantityMode', 'Tratar apenas quantidade inteira')}
                {renderStockParameterSelect('stockLotControlMode', 'Controla lote')}
                {renderStockParameterSelect('stockExpirationControlMode', 'Controla validade')}
                {renderStockParameterSelect('stockGridControlMode', 'Controla grade')}
                {renderStockParameterSelect('stockNegativeControlMode', 'Permite estoque negativo')}
              </div>
            ) : null}

            {activeEditorTab === 'smtp' ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
                  Quando a filial tiver SMTP configurado, ele será usado no lugar do SMTP da empresa.
                </div>
                <div>
                  <label className={labelClassName()}>Host SMTP</label>
                  <input type="text" value={formData.smtpHost} onChange={(event) => updateField('smtpHost', event.target.value)} className={inputClassName()} placeholder="smtp.gmail.com" />
                </div>
                <div>
                  <label className={labelClassName()}>Porta SMTP</label>
                  <input type="number" min={1} max={65535} value={formData.smtpPort} onChange={(event) => updateField('smtpPort', event.target.value)} className={inputClassName()} placeholder="465" />
                </div>
                <div>
                  <label className={labelClassName()}>Tempo limite (segundos)</label>
                  <input type="number" min={5} max={600} value={formData.smtpTimeout} onChange={(event) => updateField('smtpTimeout', event.target.value)} className={inputClassName()} placeholder="60" />
                </div>
                <div>
                  <label className={labelClassName()}>Tipo de autenticação</label>
                  <select
                    value={formData.smtpAuthType}
                    onChange={(event) => {
                      const authType = event.target.value;
                      const secure = authType === 'SSL';
                      setFormData((current) => ({
                        ...current,
                        smtpAuthType: authType,
                        smtpSecure: secure,
                        smtpPort: secure ? '465' : '587',
                      }));
                    }}
                    className={inputClassName()}
                  >
                    <option value="SSL">SSL (465)</option>
                    <option value="STARTTLS">STARTTLS/TLS (587)</option>
                  </select>
                </div>
                <div className="md:col-span-2 flex flex-wrap items-center gap-6">
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={!!formData.smtpAuthenticate} onChange={(event) => updateField('smtpAuthenticate', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                    Exigir autenticação SMTP (usuário/senha)
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={!!formData.smtpSecure}
                      onChange={(event) => {
                        const secure = event.target.checked;
                        setFormData((current) => ({
                          ...current,
                          smtpSecure: secure,
                          smtpAuthType: secure ? 'SSL' : 'STARTTLS',
                          smtpPort: secure ? '465' : '587',
                        }));
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Conexão segura (SSL)
                  </label>
                </div>
                <div className="md:col-span-2">
                  <label className={labelClassName()}>Usuário SMTP (e-mail remetente)</label>
                  <input type="email" value={formData.smtpEmail} onChange={(event) => updateField('smtpEmail', event.target.value)} className={inputClassName()} placeholder="financeiro.franca.msinfor@gmail.com" />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClassName()}>Senha SMTP / App Password</label>
                  <div className="relative">
                    <input
                      type={isSmtpPasswordVisible ? 'text' : 'password'}
                      value={formData.smtpPassword}
                      onChange={(event) => updateField('smtpPassword', event.target.value)}
                      className={`${inputClassName()} pr-12`}
                      placeholder={formData.smtpEmail ? 'Informe apenas para alterar a senha salva' : 'App password do provedor'}
                    />
                    <button
                      type="button"
                      onClick={() => setIsSmtpPasswordVisible((current) => !current)}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition-colors hover:text-indigo-600"
                      title={isSmtpPasswordVisible ? 'Ocultar senha SMTP' : 'Mostrar senha SMTP'}
                    >
                      {isSmtpPasswordVisible ? (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.584 10.587A2 2 0 0012 14a2 2 0 001.414-.586" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.88 5.09A9.953 9.953 0 0112 4c5 0 9.27 3.11 11 7.5a11.826 11.826 0 01-4.293 5.246M6.228 6.228C3.89 7.778 2.117 9.99 1 12.5 2.73 16.89 7 20 12 20a9.96 9.96 0 005.042-1.37" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {activeEditorTab === 'storage' ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
                  Quando a filial tiver storage configurado, ele será usado no lugar do storage da empresa.
                </div>
                <div>
                  <label className={labelClassName()}>Access Key ID</label>
                  <input type="text" value={formData.storageProviderAccessKeyId} onChange={(event) => updateField('storageProviderAccessKeyId', event.target.value)} className={inputClassName()} />
                </div>
                <div>
                  <label className={labelClassName()}>Secret Access Key</label>
                  <input type="text" value={formData.storageProviderSecretAccessKey} onChange={(event) => updateField('storageProviderSecretAccessKey', event.target.value)} className={inputClassName()} />
                </div>
                <div>
                  <label className={labelClassName()}>Bucket</label>
                  <input type="text" value={formData.storageBucketName} onChange={(event) => updateField('storageBucketName', event.target.value)} className={inputClassName()} placeholder="contabos3msinfor" />
                </div>
                <div>
                  <label className={labelClassName()}>Pasta</label>
                  <input type="text" value={formData.storageFolderName} onChange={(event) => updateField('storageFolderName', event.target.value)} className={inputClassName()} placeholder="content" />
                </div>
                <div>
                  <label className={labelClassName()}>ACL padrão</label>
                  <input type="text" value={formData.storageDefaultAcl} onChange={(event) => updateField('storageDefaultAcl', event.target.value)} className={inputClassName()} placeholder="Default" />
                </div>
                <div>
                  <label className={labelClassName()}>Expiração padrão (minutos)</label>
                  <input type="number" min={1} value={formData.storageDefaultExpiration} onChange={(event) => updateField('storageDefaultExpiration', event.target.value)} className={inputClassName()} placeholder="1440" />
                </div>
                <div>
                  <label className={labelClassName()}>Região</label>
                  <input type="text" value={formData.storageRegion} onChange={(event) => updateField('storageRegion', event.target.value)} className={inputClassName()} placeholder="US-central" />
                </div>
                <div>
                  <label className={labelClassName()}>Endpoint</label>
                  <input type="text" value={formData.storageEndpoint} onChange={(event) => updateField('storageEndpoint', event.target.value)} className={inputClassName()} placeholder="custom" />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClassName()}>Endpoint customizado</label>
                  <input type="text" value={formData.storageCustomEndpoint} onChange={(event) => updateField('storageCustomEndpoint', event.target.value)} className={inputClassName()} placeholder="https://usc1.contabostorage.com/" />
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <ScreenNameCopy
                screenId={BRANCH_EDITOR_SCREEN_ID}
                label="Tela"
                className="mt-0"
                disableMargin
                auditText={branchAuditContext.auditText}
                sqlText={branchAuditContext.sqlText}
              />
              <div className="flex gap-3">
                <button type="button" onClick={closeEditor} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-500 transition hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={isSaving} className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-70">
                  {isSaving ? 'Salvando...' : editingBranch ? 'Salvar Filial' : 'Incluir Filial'}
                </button>
              </div>
            </div>
                </div>
          </form>
            </div>
          ) : null}
      </main>
    </div>
  );
}
