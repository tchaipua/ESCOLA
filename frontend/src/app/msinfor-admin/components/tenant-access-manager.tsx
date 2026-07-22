'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchAddressByCep, formatCepInput, normalizeDocumentDigits, readImageFileAsDataUrl } from '@/app/lib/dashboard-crud-utils';
import { copyTextToClipboard } from '@/app/lib/clipboard';
import {
  COMPLEMENTARY_ACCESS_PROFILE_DEFINITIONS,
  getDefaultAccessProfileForRole,
  getProfilesForRole,
  mergeAccessPermissions,
  normalizeComplementaryProfiles,
  PERMISSION_OPTIONS,
  type AccessProfileCode,
  type ComplementaryAccessProfileCode,
} from '@/app/lib/access-profiles';

import ScreenNameCopy from '@/app/components/screen-name-copy';
import ScreenAuditModal from '@/app/components/screen-audit-modal';
import MaintenanceModalFooter from '@/app/components/maintenance-modal-footer';
import MaintenanceModalHeader from '@/app/components/maintenance-modal-header';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';
const SCREEN_NAME = 'ACESSOS_ESPECIAIS_GESTAO_ESCOLA';
const EDIT_SCREEN_NAME = 'ACESSOS_ESPECIAIS_GESTAO_ESCOLA_EDICAO';
const CPF_CONFLICT_SCREEN_ID = `${SCREEN_NAME}_POPUP_CPF_CONFLICT`;

const labelClass = 'mb-1 block text-xs font-bold text-slate-600';
const inputClass =
  'w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white';
const limitNumericDigits = (value: string, maxLength: number) => normalizeDocumentDigits(value).slice(0, maxLength);

type TenantSummary = {
  id: string;
  name: string;
  logoUrl?: string | null;
};

type AccessUser = {
  id: string;
  name: string;
  email: string;
  birthDate?: string | null;
  rg?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  nickname?: string | null;
  corporateName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  cellphone1?: string | null;
  cellphone2?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
  photoUrl?: string | null;
  complementaryProfiles?: ComplementaryAccessProfileCode[];
  role: 'ADMIN' | 'SECRETARIA' | 'COORDENACAO' | string;
  accessProfile?: AccessProfileCode | null;
  permissions: string[];
  branchAccessCodes?: number[];
  cashierOnly?: boolean;
  canceledAt?: string | null;
};

type TenantBranchSummary = {
  id: string;
  branchCode: number;
  name: string;
  isActive: boolean;
  isShared?: boolean;
};

type AccessFormState = {
  name: string;
  email: string;
  birthDate: string;
  rg: string;
  cpf: string;
  cnpj: string;
  nickname: string;
  corporateName: string;
  phone: string;
  whatsapp: string;
  cellphone1: string;
  cellphone2: string;
  zipCode: string;
  street: string;
  number: string;
  city: string;
  state: string;
  neighborhood: string;
  complement: string;
  photoUrl: string;
  complementaryProfiles: ComplementaryAccessProfileCode[];
  role: 'ADMIN' | 'SECRETARIA' | 'COORDENACAO';
  accessProfile: AccessProfileCode;
  permissions: string[];
  branchAccessCodes: number[];
  cashierOnly: boolean;
};

type TenantAccessManagerProps = {
  tenant: TenantSummary | null;
  getMasterPass: () => string;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
};

const EMPTY_FORM: AccessFormState = {
  name: '',
  email: '',
  birthDate: '',
  rg: '',
  cpf: '',
  cnpj: '',
  nickname: '',
  corporateName: '',
  phone: '',
  whatsapp: '',
  cellphone1: '',
  cellphone2: '',
  zipCode: '',
  street: '',
  number: '',
  city: '',
  state: '',
  neighborhood: '',
  complement: '',
  photoUrl: '',
  complementaryProfiles: [],
  role: 'SECRETARIA',
  accessProfile: getDefaultAccessProfileForRole('SECRETARIA'),
  permissions: mergeAccessPermissions(getDefaultAccessProfileForRole('SECRETARIA'), []),
  branchAccessCodes: [],
  cashierOnly: false,
};

function summarizePermissions(permissions: string[]) {
  if (!permissions.length) return 'Nenhuma permissao especifica.';

  return permissions
    .map((permission) => PERMISSION_OPTIONS.find((item) => item.value === permission)?.label || permission)
    .join(', ');
}

function getRoleBadgeClass(role: string) {
  return role === 'ADMIN'
    ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
    : role === 'COORDENACAO'
      ? 'border-violet-200 bg-violet-50 text-violet-700'
    : 'border-indigo-200 bg-indigo-50 text-indigo-700';
}

function getRoleDescription(role: string) {
  if (role === 'ADMIN') return 'Acesso total da escola.';
  if (role === 'COORDENACAO') return 'Coordena professores, disciplinas, horários e grade.';
  return 'Opera o cadastro escolar diário com permissões controladas.';
}

function formatComplementaryProfiles(profiles?: ComplementaryAccessProfileCode[] | null) {
  if (!profiles || profiles.length === 0) return 'Sem perfis complementares.';
  return profiles
    .map((profile) => COMPLEMENTARY_ACCESS_PROFILE_DEFINITIONS[profile]?.label || profile)
    .join(' + ');
}

function formatBranchAccessSummary(user: AccessUser, branches: TenantBranchSummary[]) {
  if (user.role === 'ADMIN') return 'Todas as filiais.';

  const codes = Array.isArray(user.branchAccessCodes) ? user.branchAccessCodes : [];
  if (!codes.length) return 'Filial padrão.';

  return codes
    .map((code) => {
      const branch = branches.find((item) => item.branchCode === code);
      return branch ? `${branch.branchCode} - ${branch.name}` : `FILIAL ${code}`;
    })
    .join(', ');
}

function getComplementaryProfileBadgeLabel(profile: ComplementaryAccessProfileCode) {
  return COMPLEMENTARY_ACCESS_PROFILE_DEFINITIONS[profile]?.label || profile;
}

function getOrderedPermissionOptions(selectedPermissions: string[]) {
  const active = PERMISSION_OPTIONS.filter((permission) => selectedPermissions.includes(permission.value));
  const inactive = PERMISSION_OPTIONS.filter((permission) => !selectedPermissions.includes(permission.value));
  return [...active, ...inactive];
}

function formatBrazilPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function sanitizeCpf(value: string) {
  return value.replace(/\D/g, '').slice(0, 11);
}

function formatCpf(value: string) {
  const digits = sanitizeCpf(value);
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
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
  if (['USUARIO_ESCOLA', 'USER'].includes(key)) return 'ADMINISTRATIVO';
  return key.replaceAll('_', ' ');
}

function buildSystemRoleBadges(roles?: string[]) {
  const normalizedRoles = (roles || [])
    .map((role) => normalizeSystemRoleLabel(role))
    .filter((role): role is string => Boolean(role));

  return Array.from(new Set(normalizedRoles));
}

function toSqlLiteral(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

type AccessManagerAuditParams = {
  tenantId: string;
  tenantName: string;
  searchTerm: string;
  usersLoaded: number;
  usersDisplayed: number;
  activeBranches: number;
  formMode: string;
  activeTab: string;
  formStep: string;
  selectedRole: string;
};

function buildAccessManagerAuditSql(params: AccessManagerAuditParams) {
  const searchLiteral = toSqlLiteral(params.searchTerm);

  return `SELECT
  U.id,
  U.name,
  U.email,
  U.role,
  U.accessProfile,
  U.permissions,
  U.complementaryProfiles,
  P.cpf,
  P.phone,
  P.whatsapp,
  GROUP_CONCAT(UBA.branchCode, ',') AS branchAccessCodes
FROM users U
LEFT JOIN user_branch_accesses UBA
  ON UBA.tenantId = U.tenantId
 AND UBA.userId = U.id
 AND UBA.canceledAt IS NULL
LEFT JOIN tenant_branches TB
  ON TB.tenantId = UBA.tenantId
 AND TB.branchCode = UBA.branchCode
 AND TB.canceledAt IS NULL
LEFT JOIN people P
  ON P.tenantId = U.tenantId
 AND UPPER(COALESCE(P.email, '')) = UPPER(COALESCE(U.email, ''))
 AND P.canceledAt IS NULL
WHERE U.tenantId = ${toSqlLiteral(params.tenantId)}
  AND U.canceledAt IS NULL
  AND (
    ${searchLiteral} IS NULL
    OR ${searchLiteral} = ''
    OR UPPER(COALESCE(U.name, '')) LIKE '%' || UPPER(${searchLiteral}) || '%'
    OR UPPER(COALESCE(U.email, '')) LIKE '%' || UPPER(${searchLiteral}) || '%'
    OR UPPER(COALESCE(U.role, '')) LIKE '%' || UPPER(${searchLiteral}) || '%'
  )
GROUP BY
  U.id,
  U.name,
  U.email,
  U.role,
  U.accessProfile,
  U.permissions,
  U.complementaryProfiles,
  P.cpf,
  P.phone,
  P.whatsapp
ORDER BY U.role ASC, U.name ASC;`;
}

function buildAccessManagerAuditText(params: AccessManagerAuditParams) {
  const sqlText = buildAccessManagerAuditSql(params);

  return `--- LOGICA DA TELA ---
Tela master para manutencao dos acessos administrativos de uma escola/empresa.

TABELAS PRINCIPAIS:
- users (U) - usuarios administrativos da escola
- user_branch_accesses (UBA) - filiais liberadas para cada usuario administrativo
- tenant_branches (TB) - filiais ativas da escola
- people (P) - cadastro-base compartilhado usado para complementar dados pessoais por e-mail

RELACIONAMENTOS:
- users.tenantId = tenant_branches.tenantId
- users.id = user_branch_accesses.userId
- user_branch_accesses.branchCode = tenant_branches.branchCode
- people.email = users.email dentro do mesmo tenant

FILTROS APLICADOS AGORA:
- escola/tenant atual (:schoolId): ${params.tenantId} (${params.tenantName})
- busca digitada (:searchTerm): ${params.searchTerm || 'VAZIO'}
- somente usuarios sem cancelamento logico: users.canceledAt IS NULL
- somente vinculos de filial sem cancelamento logico: user_branch_accesses.canceledAt IS NULL
- filiais ativas carregadas para permissao: ${params.activeBranches}
- registros carregados antes da busca: ${params.usersLoaded}
- registros exibidos apos a busca: ${params.usersDisplayed}
- modo do formulario: ${params.formMode}
- aba ativa do formulario: ${params.activeTab}
- etapa ativa do formulario: ${params.formStep}
- papel selecionado no formulario: ${params.selectedRole}
- ordenacao atual: role ASC, name ASC

OBSERVACAO SOBRE O FILTRO DA EMPRESA / ESCOLA:
- U.tenantId e a coluna usada para isolar os dados da escola.
- O endpoint usa senha master e executa a consulta no contexto da escola selecionada.
- Nao existe delete fisico nesta gestao; a desativacao usa cancelamento logico.

SQL EQUIVALENTE DOS FILTROS DA TELA:
${sqlText}`;
}

export default function TenantAccessManager({
  tenant,
  getMasterPass,
  onClose,
  onChanged,
}: TenantAccessManagerProps) {
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [tenantBranches, setTenantBranches] = useState<TenantBranchSummary[]>([]);
  const [formData, setFormData] = useState<AccessFormState>(EMPTY_FORM);
  const [activeTab, setActiveTab] = useState<'DADOS' | 'FOTO' | 'ENDERECO' | 'PERFIL'>('DADOS');
  const [formStep, setFormStep] = useState<'BASICO' | 'PERMISSOES'>('BASICO');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [helperMessage, setHelperMessage] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isScreenAuditOpen, setIsScreenAuditOpen] = useState(false);
  const [cpfConflictAlert, setCpfConflictAlert] = useState<{ name: string; cpf: string } | null>(null);
  const [cpfConflictRoles, setCpfConflictRoles] = useState<string[]>([]);
  const [originalCpf, setOriginalCpf] = useState('');

  const loadUsers = async () => {
    if (!tenant) return;

    try {
      setIsLoading(true);
      setErrorMessage(null);

      const response = await fetch(`${API_BASE_URL}/tenants/${tenant.id}/access-users`, {
        headers: { 'x-msinfor-master-pass': getMasterPass() },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Nao foi possivel carregar os acessos.');
      }

      setUsers(Array.isArray(data.users) ? data.users : []);
      setTenantBranches(Array.isArray(data.branches) ? data.branches.filter((branch: TenantBranchSummary) => branch.isActive) : []);
    } catch (error: any) {
      setErrorMessage(error.message || 'Nao foi possivel carregar os acessos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!tenant) return;

    setIsCreatingNew(false);
    setEditingUserId(null);
    setFormData(EMPTY_FORM);
    setActiveTab('DADOS');
    void loadUsers();
  }, [tenant?.id]);

  useEffect(() => {
    if (!successMessage) return;

    const timer = window.setTimeout(() => setSuccessMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    if (!helperMessage) return;

    const timer = window.setTimeout(() => setHelperMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [helperMessage]);

  useEffect(() => {
    if (!copyFeedback) return;

    const timer = window.setTimeout(() => setCopyFeedback(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copyFeedback]);

  useEffect(() => {
    if (!tenant) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, tenant]);

  if (!tenant) return null;

  const getDefaultBranchAccessCodes = () =>
    tenantBranches.length > 0 ? [tenantBranches[0].branchCode] : [];

  const resetForm = (options?: { announce?: boolean }) => {
    setIsCreatingNew(false);
    setEditingUserId(null);
    setFormStep('BASICO');
    setFormData(EMPTY_FORM);
    setActiveTab('DADOS');
    setErrorMessage(null);
    setSuccessMessage(null);
    setPhotoError(null);
    setCpfConflictAlert(null);
    setCpfConflictRoles([]);
    setOriginalCpf('');

    if (options?.announce) {
      setHelperMessage('Preencha o formulario ao lado para criar um novo acesso.');
    } else {
      setHelperMessage(null);
    }

    window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 0);
  };

  const startCreatingUser = () => {
    setIsCreatingNew(true);
    setEditingUserId(null);
    setFormStep('BASICO');
    setFormData({ ...EMPTY_FORM, branchAccessCodes: getDefaultBranchAccessCodes() });
    setActiveTab('DADOS');
    setErrorMessage(null);
    setSuccessMessage(null);
    setHelperMessage('Preencha o formulario para criar um novo acesso.');
    setPhotoError(null);
    setCpfConflictAlert(null);
    setCpfConflictRoles([]);
    setOriginalCpf('');

    window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 0);
  };

  const editUser = (user: AccessUser) => {
    setIsCreatingNew(false);
    setEditingUserId(user.id);
    setFormStep(user.role === 'ADMIN' ? 'BASICO' : 'PERMISSOES');
    setActiveTab('DADOS');
    setFormData({
      name: user.name || '',
      email: user.email || '',
      birthDate: user.birthDate || '',
      rg: user.rg || '',
      cpf: user.cpf ? sanitizeCpf(user.cpf) : '',
      cnpj: user.cnpj || '',
      nickname: user.nickname || '',
      corporateName: user.corporateName || '',
      phone: user.phone || '',
      whatsapp: user.whatsapp || '',
      cellphone1: user.cellphone1 || '',
      cellphone2: user.cellphone2 || '',
      zipCode: user.zipCode || '',
      street: user.street || '',
      number: user.number || '',
      city: user.city || '',
      state: user.state || '',
      neighborhood: user.neighborhood || '',
      complement: user.complement || '',
      photoUrl: user.photoUrl || '',
      complementaryProfiles: normalizeComplementaryProfiles(user.complementaryProfiles),
      role: user.role === 'ADMIN' ? 'ADMIN' : user.role === 'COORDENACAO' ? 'COORDENACAO' : 'SECRETARIA',
      accessProfile: (user.accessProfile as AccessProfileCode) || getDefaultAccessProfileForRole(user.role === 'ADMIN' ? 'ADMIN' : user.role === 'COORDENACAO' ? 'COORDENACAO' : 'SECRETARIA'),
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      branchAccessCodes: user.role === 'ADMIN'
        ? []
        : Array.isArray(user.branchAccessCodes) && user.branchAccessCodes.length > 0
          ? user.branchAccessCodes
          : getDefaultBranchAccessCodes(),
      cashierOnly: user.role !== 'ADMIN' && user.cashierOnly === true,
    });
    setErrorMessage(null);
    setSuccessMessage(null);
    setHelperMessage('Modo edicao ativo. Altere os dados e clique em salvar.');
    setPhotoError(null);
    setCpfConflictAlert(null);
    setCpfConflictRoles([]);
    setOriginalCpf(user.cpf ? sanitizeCpf(user.cpf) : '');
  };

  const applyRolePreset = (role: AccessFormState['role']) => {
    const accessProfile = getDefaultAccessProfileForRole(role);
    const complementaryProfiles: ComplementaryAccessProfileCode[] = role === 'ADMIN' ? [] : [];
    setFormData((current) => ({
      ...current,
      role,
      accessProfile,
      complementaryProfiles,
      permissions: mergeAccessPermissions(accessProfile, complementaryProfiles),
      branchAccessCodes: role === 'ADMIN' ? [] : (current.branchAccessCodes.length ? current.branchAccessCodes : getDefaultBranchAccessCodes()),
      cashierOnly: false,
    }));
    setFormStep('BASICO');
  };

  const toggleComplementaryProfile = (profile: ComplementaryAccessProfileCode) => {
    setFormData((current) => {
      if (current.role === 'ADMIN') return current;

      const complementaryProfiles = current.complementaryProfiles.includes(profile)
        ? current.complementaryProfiles.filter((item) => item !== profile)
        : [...current.complementaryProfiles, profile];

      return {
        ...current,
        complementaryProfiles,
        cashierOnly: profile === 'CAIXA' && current.cashierOnly && !complementaryProfiles.includes('CAIXA')
          ? false
          : current.cashierOnly,
        permissions: mergeAccessPermissions(current.accessProfile, complementaryProfiles),
      };
    });
  };

  const toggleCashierOnly = () => {
    setFormData((current) => {
      if (current.role === 'ADMIN') return current;

      const cashierOnly = !current.cashierOnly;
      const complementaryProfiles = cashierOnly && !current.complementaryProfiles.includes('CAIXA')
        ? [...current.complementaryProfiles, 'CAIXA' as const]
        : current.complementaryProfiles;

      return {
        ...current,
        cashierOnly,
        complementaryProfiles,
        permissions: mergeAccessPermissions(current.accessProfile, complementaryProfiles),
      };
    });
  };

  const togglePermission = (permission: string) => {
    setFormData((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  };

  const toggleBranchAccess = (branchCode: number) => {
    setFormData((current) => {
      if (current.role === 'ADMIN') return current;

      const branchAccessCodes = current.branchAccessCodes.includes(branchCode)
        ? current.branchAccessCodes.filter((code) => code !== branchCode)
        : [...current.branchAccessCodes, branchCode].sort((left, right) => left - right);

      return {
        ...current,
        branchAccessCodes,
      };
    });
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload: Record<string, unknown> = {
      name: formData.name.trim().toUpperCase(),
      email: formData.email.trim().toUpperCase(),
      birthDate: formData.birthDate || null,
      rg: formData.rg.trim().toUpperCase() || null,
      cpf: formData.cpf.trim().toUpperCase() || null,
      cnpj: formData.cnpj.trim().toUpperCase() || null,
      nickname: formData.nickname.trim().toUpperCase() || null,
      corporateName: formData.corporateName.trim().toUpperCase() || null,
      phone: formData.phone.trim().toUpperCase() || null,
      whatsapp: formData.whatsapp.trim().toUpperCase() || null,
      cellphone1: formData.cellphone1.trim().toUpperCase() || null,
      cellphone2: formData.cellphone2.trim().toUpperCase() || null,
      zipCode: formData.zipCode.trim().toUpperCase() || null,
      street: formData.street.trim().toUpperCase() || null,
      number: formData.number.trim().toUpperCase() || null,
      city: formData.city.trim().toUpperCase() || null,
      state: formData.state.trim().toUpperCase() || null,
      neighborhood: formData.neighborhood.trim().toUpperCase() || null,
      complement: formData.complement.trim().toUpperCase() || null,
      photoUrl: formData.photoUrl.trim() || null,
      complementaryProfiles: formData.role === 'ADMIN' ? [] : formData.complementaryProfiles,
      role: formData.role,
      accessProfile: formData.accessProfile,
      permissions: formData.role === 'ADMIN' ? [] : formData.permissions,
      branchAccessCodes: formData.role === 'ADMIN' ? [] : formData.branchAccessCodes,
      cashierOnly: formData.role !== 'ADMIN' && formData.cashierOnly,
    };

    if (!payload.name) {
      setErrorMessage('Informe o nome do usuario de acesso.');
      return;
    }

    if (!payload.email) {
      setErrorMessage('Informe o e-mail do usuario de acesso.');
      return;
    }

    if (payload.role !== 'ADMIN' && formData.permissions.length === 0) {
      setErrorMessage('Selecione pelo menos uma permissão para este perfil.');
      return;
    }

    if (payload.role !== 'ADMIN' && tenantBranches.length > 1 && formData.branchAccessCodes.length === 0) {
      setErrorMessage('Selecione pelo menos uma filial para este usuário.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);

      const response = await fetch(
        editingUserId
          ? `${API_BASE_URL}/tenants/${tenant.id}/access-users/${editingUserId}`
          : `${API_BASE_URL}/tenants/${tenant.id}/access-users`,
        {
          method: editingUserId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-msinfor-master-pass': getMasterPass(),
          },
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Nao foi possivel salvar o usuario.');
      }

      setSuccessMessage(data.message || 'Acesso salvo com sucesso.');
      resetForm({ announce: false });
      await loadUsers();
      await onChanged?.();
    } catch (error: any) {
      setErrorMessage(error.message || 'Nao foi possivel salvar o usuario.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setPhotoError(null);
      const photoUrl = await readImageFileAsDataUrl(file);
      setFormData((current) => ({ ...current, photoUrl }));
    } catch (error: any) {
      setPhotoError(error?.message || 'Não foi possível carregar a foto selecionada.');
    } finally {
      event.target.value = '';
    }
  };

  const handleCepLookup = async () => {
    try {
      const address = await fetchAddressByCep(formData.zipCode);
      if (!address) return;
      setFormData((current) => ({
        ...current,
        street: address.street,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
      }));
    } catch (error: any) {
      alert(error?.message || 'Falha ao consultar o CEP.');
    }
  };

  const requestSharedPersonProfile = async (cpf: string) => {
    if (!getMasterPass || !tenant?.id) return null;
    const normalizedCpf = sanitizeCpf(cpf);
    if (normalizedCpf.length !== 11) return null;

    const response = await fetch(
      `${API_BASE_URL}/tenants/${tenant.id}/shared-profiles/cpf/${normalizedCpf}`,
      {
        headers: { "x-msinfor-master-pass": getMasterPass() },
      },
    );

    if (response.status === 404) return null;
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      throw new Error(
        errorPayload?.message ||
          "Não foi possível consultar os dados compartilhados deste CPF.",
      );
    }

    return response.json();
  };

  const handleCpfBlur = async () => {
    const sanitizedCpf = sanitizeCpf(formData.cpf);
    if (!sanitizedCpf) {
      setCpfConflictAlert(null);
      setCpfConflictRoles([]);
      return;
    }

    if (editingUserId && originalCpf && sanitizedCpf === originalCpf) {
      setCpfConflictAlert(null);
      setCpfConflictRoles([]);
      return;
    }

    try {
      const profile = await requestSharedPersonProfile(sanitizedCpf);
      if (!profile) {
        setCpfConflictAlert(null);
        setCpfConflictRoles([]);
        return;
      }

      const profileName = String(profile.name || 'PESSOA JÁ CADASTRADA').trim().toUpperCase();
      setCpfConflictAlert({
        name: profileName,
        cpf: formatCpf(sanitizedCpf),
      });
      setCpfConflictRoles(buildSystemRoleBadges(profile.roles));
      setErrorMessage(null);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Não foi possível validar o CPF informado.');
    }
  };

  const clearPhoto = () => {
    setFormData((current) => ({ ...current, photoUrl: '' }));
    setPhotoError(null);
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
  };

  const handleCopyScreenName = async () => {
    const currentScreenName = editingUserId !== null || isCreatingNew ? EDIT_SCREEN_NAME : SCREEN_NAME;
    try {
      const copied = await copyTextToClipboard(currentScreenName);
      setCopyFeedback(copied ? 'Nome copiado para a área de transferência.' : 'Não foi possível copiar o nome.');
    } catch {
      setCopyFeedback('Não foi possível copiar o nome.');
    } finally {
      setIsScreenAuditOpen(true);
    }
  };

  const canAdvanceToPermissions =
    formData.role !== 'ADMIN' &&
    formData.name.trim() &&
    formData.email.trim();
  const showPermissionScreen = formData.role !== 'ADMIN' && formStep === 'PERMISSOES';
  const showFocusedEditor = editingUserId !== null;
  const showFocusedCreate = isCreatingNew && editingUserId === null;
  const renderAddressTab = () => (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
      <div>
        <label className={labelClass}>CEP</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={formatCepInput(formData.zipCode)}
            onChange={(event) =>
              setFormData((current) => ({ ...current, zipCode: limitNumericDigits(event.target.value, 8) }))
            }
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleCepLookup}
            className="rounded-lg border border-blue-200 bg-blue-100 px-3 font-bold text-blue-700"
          >
            OK
          </button>
        </div>
      </div>
      <div className="md:col-span-2">
        <label className={labelClass}>Logradouro</label>
        <input
          type="text"
          value={formData.street || ''}
          onChange={(event) => setFormData((current) => ({ ...current, street: event.target.value.toUpperCase() }))}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Numero</label>
        <input
          type="text"
          value={formData.number || ''}
          onChange={(event) => setFormData((current) => ({ ...current, number: event.target.value.toUpperCase() }))}
          className={inputClass}
        />
      </div>
      <div className="md:col-span-2">
        <label className={labelClass}>Bairro</label>
        <input
          type="text"
          value={formData.neighborhood || ''}
          onChange={(event) => setFormData((current) => ({ ...current, neighborhood: event.target.value.toUpperCase() }))}
          className={inputClass}
        />
      </div>
      <div className="md:col-span-2">
        <label className={labelClass}>Complemento</label>
        <input
          type="text"
          value={formData.complement || ''}
          onChange={(event) => setFormData((current) => ({ ...current, complement: event.target.value.toUpperCase() }))}
          className={inputClass}
        />
      </div>
      <div className="md:col-span-3">
        <label className={labelClass}>Cidade</label>
        <input
          type="text"
          value={formData.city || ''}
          onChange={(event) => setFormData((current) => ({ ...current, city: event.target.value.toUpperCase() }))}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>UF</label>
        <input
          type="text"
          value={formData.state || ''}
          onChange={(event) => setFormData((current) => ({ ...current, state: event.target.value.toUpperCase() }))}
          className={inputClass}
        />
      </div>
    </div>
  );

  const renderPhotoTab = () => (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-white">
          {formData.photoUrl ? (
            <img
              src={formData.photoUrl}
              alt={`Foto de ${formData.name || 'usuário de acesso'}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Sem foto
            </span>
          )}
        </div>

        <div className="flex-1">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Foto do usuário</div>
          <p className="mt-1 text-sm text-slate-500">
            Grave uma foto para identificar melhor este acesso administrativo da escola.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
            >
              Escolher foto
            </button>
            {formData.photoUrl ? (
              <button
                type="button"
                onClick={clearPhoto}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-100"
              >
                Remover foto
              </button>
            ) : null}
          </div>
          {photoError ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {photoError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
  const renderProfileTab = () => (
    <>
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() => applyRolePreset('ADMIN')}
          className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
            formData.role === 'ADMIN'
              ? 'border-fuchsia-300 bg-fuchsia-50'
              : 'border-slate-200 bg-white hover:border-fuchsia-200'
          }`}
        >
          <div className="font-bold text-slate-800">ADMIN</div>
          <div className="mt-1 text-sm text-slate-500">{getRoleDescription('ADMIN')}</div>
        </button>
        <button
          type="button"
          onClick={() => applyRolePreset('SECRETARIA')}
          className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
            formData.role === 'SECRETARIA'
              ? 'border-indigo-300 bg-indigo-50'
              : 'border-slate-200 bg-white hover:border-indigo-200'
          }`}
        >
          <div className="font-bold text-slate-800">SECRETARIA</div>
          <div className="mt-1 text-sm text-slate-500">{getRoleDescription('SECRETARIA')}</div>
        </button>
        <button
          type="button"
          onClick={() => applyRolePreset('COORDENACAO')}
          className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
            formData.role === 'COORDENACAO'
              ? 'border-violet-300 bg-violet-50'
              : 'border-slate-200 bg-white hover:border-violet-200'
          }`}
        >
          <div className="font-bold text-slate-800">COORDENAÇÃO</div>
          <div className="mt-1 text-sm text-slate-500">{getRoleDescription('COORDENACAO')}</div>
        </button>
      </div>

      {formData.role !== 'ADMIN' ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Perfis complementares</div>
          <p className="mt-2 text-sm text-emerald-800">
            Somente <span className="font-bold">FINANCEIRO</span> e <span className="font-bold">CAIXA</span> podem ser acumulados com o perfil principal desta tela.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {(Object.entries(COMPLEMENTARY_ACCESS_PROFILE_DEFINITIONS) as Array<[ComplementaryAccessProfileCode, { label: string; permissions: string[] }]>).map(([profileCode, profile]) => {
              const isSelected = formData.complementaryProfiles.includes(profileCode);
              return (
                <button
                  key={profileCode}
                  type="button"
                  onClick={() => toggleComplementaryProfile(profileCode)}
                  className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
                    isSelected
                      ? 'border-emerald-300 bg-white shadow-sm'
                      : 'border-emerald-100 bg-white/70 hover:border-emerald-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-bold text-slate-800">{profile.label}</div>
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-black ${
                      isSelected ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                    }`}>
                      {isSelected ? '✓' : 'X'}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-slate-500">
                    {profileCode === 'FINANCEIRO'
                      ? 'Emite boletos, lança mensalidades e opera o financeiro sem receber valores.'
                      : 'Recebe valores, baixa mensalidades e controla as rotinas de caixa.'}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 text-xs font-medium text-emerald-700">
            Complementares ativos: {formatComplementaryProfiles(formData.complementaryProfiles)}
          </div>
          <button
            type="button"
            onClick={toggleCashierOnly}
            className={`mt-4 flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-colors ${
              formData.cashierOnly
                ? 'border-blue-300 bg-blue-600 text-white shadow-sm'
                : 'border-emerald-100 bg-white/70 text-slate-700 hover:border-emerald-200'
            }`}
          >
            <span>
              <span className={`block text-sm font-black uppercase tracking-[0.16em] ${formData.cashierOnly ? 'text-white' : 'text-slate-800'}`}>
                Somente caixa
              </span>
              <span className={`mt-1 block text-sm ${formData.cashierOnly ? 'text-blue-50' : 'text-slate-500'}`}>
                Ao entrar, este usuário abre direto a tela de vendas e não navega pelo restante do sistema.
              </span>
            </span>
            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${
              formData.cashierOnly ? 'bg-white text-blue-700' : 'bg-rose-500 text-white'
            }`}>
              {formData.cashierOnly ? '✓' : 'X'}
            </span>
          </button>
        </div>
      ) : null}

      {formData.role !== 'ADMIN' && tenantBranches.length > 1 ? (
        <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Filiais permitidas</div>
          <p className="mt-2 text-sm text-blue-800">
            Marque em quais filiais este usuário poderá entrar. Registros comuns continuam visíveis dentro da filial selecionada.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {tenantBranches.map((branch) => {
              const isSelected = formData.branchAccessCodes.includes(branch.branchCode);
              return (
                <button
                  key={branch.id}
                  type="button"
                  onClick={() => toggleBranchAccess(branch.branchCode)}
                  className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
                    isSelected
                      ? 'border-blue-300 bg-white shadow-sm'
                      : 'border-blue-100 bg-white/70 hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-800">{branch.branchCode} - {branch.name}</div>
                      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Filial operacional</div>
                    </div>
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-black ${
                      isSelected ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                    }`}>
                      {isSelected ? '✓' : 'X'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {formData.role === 'ADMIN' ? (
        <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-4 text-sm text-indigo-700">
          Este perfil tera autorizacao completa na escola e acesso a todas as filiais.
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setFormStep('BASICO')}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                formStep === 'BASICO'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              1. Dados do acesso
            </button>
            <button
              type="button"
              onClick={() => {
                if (canAdvanceToPermissions) {
                  setErrorMessage(null);
                  setFormStep('PERMISSOES');
                } else {
                  setErrorMessage('Preencha nome e e-mail antes de configurar as permissões.');
                }
              }}
              className="rounded-xl bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100"
            >
              2. Permissões do perfil
            </button>
          </div>
          <div className="mt-3 text-xs font-medium text-slate-500">
            Entre na tela de permissões para ajustar visualização e manutenção deste usuário.
          </div>
        </div>
      )}
    </>
  );

  const handleDelete = async (user: AccessUser) => {
    if (!window.confirm(`Desativar o acesso de ${user.name}?`)) return;

    try {
      setDeletingUserId(user.id);
      setErrorMessage(null);

      const response = await fetch(`${API_BASE_URL}/tenants/${tenant.id}/access-users/${user.id}`, {
        method: 'DELETE',
        headers: { 'x-msinfor-master-pass': getMasterPass() },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Nao foi possivel desativar o usuario.');
      }

      if (editingUserId === user.id) {
        resetForm();
      }

      setSuccessMessage(data.message || 'Acesso desativado com sucesso.');
      await loadUsers();
      await onChanged?.();
    } catch (error: any) {
      setErrorMessage(error.message || 'Nao foi possivel desativar o usuario.');
    } finally {
      setDeletingUserId(null);
    }
  };

  const normalizedUserSearch = userSearch.trim().toUpperCase();
  const filteredUsers = users.filter((user) => {
    if (!normalizedUserSearch) return true;

    return (
      user.name.toUpperCase().includes(normalizedUserSearch) ||
      user.email.toUpperCase().includes(normalizedUserSearch)
    );
  });
  const accessAuditParams: AccessManagerAuditParams = {
    tenantId: tenant.id,
    tenantName: tenant.name,
    searchTerm: userSearch.trim(),
    usersLoaded: users.length,
    usersDisplayed: filteredUsers.length,
    activeBranches: tenantBranches.length,
    formMode: editingUserId ? 'EDICAO' : isCreatingNew ? 'NOVO_ACESSO' : 'LISTAGEM',
    activeTab,
    formStep,
    selectedRole: formData.role,
  };
  const accessAuditContext = {
    auditText: buildAccessManagerAuditText(accessAuditParams),
    sqlText: buildAccessManagerAuditSql(accessAuditParams),
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden bg-white shadow-2xl ${showFocusedEditor || showFocusedCreate ? 'max-w-7xl rounded-none' : 'max-w-6xl rounded-3xl'}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <MaintenanceModalHeader
          title={showFocusedEditor ? 'Editar acesso da escola' : showFocusedCreate ? 'Novo acesso da escola' : tenant.name}
          eyebrow={showFocusedEditor || showFocusedCreate ? 'Edição de acesso' : 'Acessos especiais'}
          description={showFocusedEditor || showFocusedCreate
            ? `Altere os dados do acesso de ${formData.name || 'USUÁRIO'}.`
            : 'Crie logins e defina o que cada usuário pode cadastrar na escola.'}
          tenantId={tenant.id}
          schoolName={tenant.name}
          logoUrl={tenant.logoUrl}
          onClose={onClose}
        />

        {showPermissionScreen ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-6">
            <form onSubmit={handleSave} className="mx-auto flex max-w-5xl flex-col gap-5">
              <div className="sticky top-0 z-10 -mx-2 flex flex-col gap-4 bg-slate-50/95 px-2 pb-2 backdrop-blur-sm">
                {errorMessage ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                    {errorMessage}
                  </div>
                ) : null}

                {successMessage ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                    {successMessage}
                  </div>
                ) : null}

                <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50/50 px-1 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('DADOS')}
                    className={`rounded-t-lg px-4 py-2.5 text-sm font-bold ${
                      activeTab === 'DADOS'
                        ? 'border border-slate-200 border-b-white bg-white text-blue-700'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    1. DADOS BÁSICOS
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('FOTO')}
                    className={`rounded-t-lg px-4 py-2.5 text-sm font-bold ${
                      activeTab === 'FOTO'
                        ? 'border border-slate-200 border-b-white bg-white text-blue-700'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    2. FOTO
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('ENDERECO')}
                    className={`rounded-t-lg px-4 py-2.5 text-sm font-bold ${
                      activeTab === 'ENDERECO'
                        ? 'border border-slate-200 border-b-white bg-white text-blue-700'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    3. ENDEREÇO
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('PERFIL')}
                    className={`rounded-t-lg px-4 py-2.5 text-sm font-bold ${
                      activeTab === 'PERFIL'
                        ? 'border border-slate-200 border-b-white bg-white text-blue-700'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    4. PERFIL
                  </button>
                </div>
                {activeTab === 'FOTO' ? (
                  <div className="pt-4">{renderPhotoTab()}</div>
                ) : activeTab === 'ENDERECO' ? (
                  <div className="pt-4">{renderAddressTab()}</div>
                ) : activeTab === 'PERFIL' ? (
                  <div className="pt-4">{renderProfileTab()}</div>
                ) : (
                  <>
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-500">Tela de permissões</div>
                    <h3 className="mt-1 text-xl font-bold text-slate-800">Permissões do perfil</h3>
                    <p className="mt-1 text-sm font-medium text-slate-500">
                      Ajuste o perfil e marque exatamente o que este usuário poderá visualizar e gerenciar na escola.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-right">
                    <div className="text-sm font-extrabold text-slate-800">{formData.name || 'USUÁRIO EM CONFIGURAÇÃO'}</div>
                    <div className="mt-1 text-xs font-bold uppercase tracking-[0.15em] text-indigo-600">{formData.role}</div>
                    <div className="mt-1 text-sm font-medium text-slate-500">{formData.email || 'E-MAIL NÃO INFORMADO'}</div>
                    {formData.role !== 'ADMIN' ? (
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-600">
                        {formatComplementaryProfiles(formData.complementaryProfiles)}
                      </div>
                    ) : null}
                    {formData.cashierOnly ? (
                      <div className="mt-1 text-[11px] font-black uppercase tracking-[0.12em] text-blue-600">
                        SOMENTE CAIXA
                      </div>
                    ) : null}
                  </div>
                </div>
                  </>
                )}

                <div className="mt-4">
                  <label className="mb-1 block text-xs font-bold text-slate-600">Perfil pré-definido</label>
                  <select
                    value={formData.accessProfile}
                    onChange={(event) => {
                      const nextProfile = event.target.value as AccessProfileCode;
                      setFormData((current) => ({
                        ...current,
                        accessProfile: nextProfile,
                        permissions: mergeAccessPermissions(nextProfile, current.complementaryProfiles),
                      }));
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                  >
                    {getProfilesForRole(formData.role).map((profile) => (
                      <option key={profile.code} value={profile.code}>{profile.label}</option>
                    ))}
                  </select>
                  <div className="mt-2 text-xs text-slate-500">
                    Se você marcar exceções abaixo, a permissão específica da tela passa a valer acima do perfil padrão.
                  </div>
                </div>
                  <div className="mt-4 flex items-center justify-start gap-4 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => setFormStep('BASICO')}
                      className="rounded-xl border border-emerald-300 bg-emerald-500 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-600"
                    >
                      Voltar aos dados
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="text-base font-bold text-slate-800">Permissões por tela</div>
                  <div className="text-sm font-medium text-slate-400">{formData.permissions.length} selecionada(s)</div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {getOrderedPermissionOptions(formData.permissions).map((permission) => {
                    const isSelected = formData.permissions.includes(permission.value);
                    return (
                    <button
                      key={permission.value}
                      type="button"
                      onClick={() => togglePermission(permission.value)}
                      className={`flex min-h-[88px] items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-left transition-colors ${
                        isSelected
                          ? 'border-emerald-300 bg-emerald-200/90 ring-2 ring-emerald-300'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 shadow-sm ${
                            isSelected
                              ? 'border-emerald-200 bg-emerald-500 text-white shadow-emerald-200/80'
                              : 'border-red-200 bg-red-500 text-white shadow-red-200/80'
                          }`}
                        >
                          {isSelected ? (
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.8} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M6 6l12 12M18 6L6 18" />
                            </svg>
                          )}
                        </span>
                        <span className="text-sm font-medium leading-6 text-slate-700">{permission.label}</span>
                      </div>
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
                        </svg>
                      </span>
                    </button>
                  )})}
                </div>
              </div>
              <MaintenanceModalFooter
                screenId={EDIT_SCREEN_NAME}
                saveLabel={editingUserId ? 'Salvar alterações' : 'Salvar'}
                isSaving={isSaving}
                auditText={accessAuditContext.auditText}
                sqlText={accessAuditContext.sqlText}
                className="sticky bottom-0 z-20 rounded-[24px] border border-slate-200 shadow-lg"
              />
            </form>
          </div>
        ) : showFocusedEditor || showFocusedCreate ? (
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-6">
              <form onSubmit={handleSave} className="mx-auto flex max-w-4xl flex-col gap-5">
            {errorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                {successMessage}
              </div>
            ) : null}

            {helperMessage ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-700">
                {helperMessage}
              </div>
            ) : null}

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-500">Modo de edição</div>
                  <h3 className="mt-2 text-2xl font-bold text-slate-800">
                    {showFocusedEditor ? 'Editar usuário de acesso' : 'Novo usuário de acesso'}
                  </h3>
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    {showFocusedEditor
                      ? 'Você está alterando apenas este usuário. A lista dos demais acessos fica oculta para deixar a manutenção mais limpa.'
                      : 'Você está criando um novo acesso. A lista dos demais usuários fica oculta para a tela ficar mais limpa e funcional.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <div className="text-sm font-extrabold text-slate-800">
                    {formData.name || (showFocusedEditor ? 'USUÁRIO EM EDIÇÃO' : 'NOVO USUÁRIO')}
                  </div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-[0.15em] text-indigo-600">{formData.role}</div>
                  <div className="mt-2 text-sm font-medium text-slate-500">{formData.email || 'E-MAIL NÃO INFORMADO'}</div>
                  {formData.role !== 'ADMIN' ? (
                    <div className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-600">
                      {formatComplementaryProfiles(formData.complementaryProfiles)}
                    </div>
                  ) : null}
                  {formData.cashierOnly ? (
                    <div className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-blue-600">
                      SOMENTE CAIXA
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50/50 px-1 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('DADOS')}
                  className={`rounded-t-lg px-4 py-2.5 text-sm font-bold ${
                    activeTab === 'DADOS'
                      ? 'border border-slate-200 border-b-white bg-white text-blue-700'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  1. DADOS BÁSICOS
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('FOTO')}
                  className={`rounded-t-lg px-4 py-2.5 text-sm font-bold ${
                    activeTab === 'FOTO'
                      ? 'border border-slate-200 border-b-white bg-white text-blue-700'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  2. FOTO
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ENDERECO')}
                  className={`rounded-t-lg px-4 py-2.5 text-sm font-bold ${
                    activeTab === 'ENDERECO'
                      ? 'border border-slate-200 border-b-white bg-white text-blue-700'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  3. ENDEREÇO
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('PERFIL')}
                  className={`rounded-t-lg px-4 py-2.5 text-sm font-bold ${
                    activeTab === 'PERFIL'
                      ? 'border border-slate-200 border-b-white bg-white text-blue-700'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  4. PERFIL
                </button>
              </div>

              {activeTab === 'DADOS' ? (
                <>
              <div className="mt-6">
                <label className="mb-1 block text-xs font-bold text-slate-600">Nome do usuario *</label>
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  value={formData.name}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, name: event.target.value.toUpperCase() }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                  placeholder="NOME COMPLETO"
                />
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">E-mail de login *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(event) =>
                      setFormData((current) => ({ ...current, email: event.target.value.toUpperCase() }))
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                    placeholder="USUARIO@ESCOLA.COM"
                  />
                </div>
              </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-slate-600">CPF</label>
                    <input
                      type="text"
                      value={formatCpf(formData.cpf)}
                      onChange={(event) =>
                        setFormData((current) => ({ ...current, cpf: sanitizeCpf(event.target.value) }))
                      }
                      onBlur={handleCpfBlur}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                      placeholder="000.000.000-00"
                    />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Data de nascimento</label>
                  <input
                    type="date"
                    value={formData.birthDate || ''}
                    onChange={(event) => setFormData((current) => ({ ...current, birthDate: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">RG</label>
                  <input
                    type="text"
                    value={formData.rg || ''}
                    onChange={(event) => setFormData((current) => ({ ...current, rg: event.target.value.toUpperCase() }))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                    placeholder="RG"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-slate-600">WhatsApp</label>
                <input
                  type="text"
                  value={formData.whatsapp || ''}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      whatsapp: formatBrazilPhone(event.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-600">Telefone</label>
                <input
                  type="text"
                  value={formData.phone || ''}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      phone: formatBrazilPhone(event.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                />
              </div>
            </div>

                </>
              ) : null}

              {activeTab === 'FOTO' ? (
                <div className="mt-5">{renderPhotoTab()}</div>
              ) : activeTab === 'ENDERECO' ? (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Endereco</div>
                  {renderAddressTab()}
                </div>
              ) : activeTab === 'PERFIL' ? (
                <div className="mt-5">{renderProfileTab()}</div>
              ) : null}
            </div>

            <MaintenanceModalFooter
              screenId={EDIT_SCREEN_NAME}
              saveLabel={showFocusedEditor ? 'Salvar alterações' : 'Salvar'}
              isSaving={isSaving}
              auditText={accessAuditContext.auditText}
              sqlText={accessAuditContext.sqlText}
              className="sticky bottom-0 z-20 rounded-[24px] border border-slate-200 shadow-lg"
              secondaryActions={formData.role !== 'ADMIN' ? (
                <button
                  type="button"
                  onClick={() => {
                    if (canAdvanceToPermissions) {
                      setErrorMessage(null);
                      setFormStep('PERMISSOES');
                    } else {
                      setErrorMessage('Preencha nome e e-mail antes de abrir a tela de permissões.');
                    }
                  }}
                  className="min-h-12 rounded-[18px] bg-slate-900 px-5 py-2.5 text-sm font-black text-white hover:bg-slate-800"
                >
                  Abrir permissões
                </button>
              ) : null}
            />
          </form>
        </div>
        ) : (
          <div className="min-h-0 flex-1 bg-white">
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-800">Usuarios da escola</h3>
                  <p className="text-sm text-slate-500">Perfis administrativos e matriz de permissões da escola.</p>
                </div>
                <div className="min-w-[260px] max-w-[340px] flex-1">
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-400"
                    placeholder="Consultar por nome do usuário"
                  />
                </div>
                <button
                  type="button"
                  onClick={startCreatingUser}
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
                >
                  Novo acesso
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {isLoading ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-slate-400">
                  Carregando usuarios...
                </div>
              ) : null}

              {!isLoading && users.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-slate-400">
                  Nenhum usuario administrativo cadastrado.
                </div>
              ) : null}

              {!isLoading && users.length > 0 && filteredUsers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-slate-400">
                  Nenhum usuário encontrado para a busca informada.
                </div>
              ) : null}

              {!isLoading &&
                filteredUsers.map((user) => (
                  <div key={user.id} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                          {user.photoUrl ? (
                            <img src={user.photoUrl} alt={`Foto de ${user.name}`} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-center text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                              Sem foto
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-bold text-slate-800">{user.name}</h4>
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${getRoleBadgeClass(user.role)}`}
                            >
                              {user.role}
                            </span>
                            {normalizeComplementaryProfiles(user.complementaryProfiles).map((profile) => (
                              <span
                                key={profile}
                                className="rounded-full border border-emerald-200 bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white"
                              >
                                {getComplementaryProfileBadgeLabel(profile)}
                              </span>
                            ))}
                            {user.cashierOnly ? (
                              <span className="rounded-full border border-blue-200 bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white">
                                SOMENTE CAIXA
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-sm font-medium text-slate-600">{user.email}</div>
                          <div className="mt-2 text-sm text-slate-500">
                            {user.role === 'ADMIN' ? 'Acesso total da escola.' : 'Perfil administrativo configurado para esta escola.'}
                          </div>
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">
                            Filiais: {formatBranchAccessSummary(user, tenantBranches)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => editUser(user)}
                          className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(user)}
                          disabled={deletingUserId === user.id}
                          className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-60"
                        >
                          {deletingUserId === user.id ? 'Desativando...' : 'Desativar'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {!(showFocusedEditor || showFocusedCreate || showPermissionScreen) ? (
        <div className="mt-2 border-t border-slate-200 bg-white px-6 py-3">
          <div className="flex w-full items-center justify-end gap-3 text-[11px] font-semibold uppercase tracking-[0.4em] text-slate-500">
            <span className="text-slate-800">{showFocusedEditor || showFocusedCreate ? EDIT_SCREEN_NAME : SCREEN_NAME}</span>
            <button
              type="button"
              onClick={handleCopyScreenName}
              title="Copiar identificação da tela"
              aria-label="Copiar identificação da tela"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-slate-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9h3V6h7v11h-3M5 18V5a2 2 0 012-2h8l4 4v11a2 2 0 01-2 2h-8a2 2 0 01-2-2z" />
              </svg>
            </button>
            <span role="status" aria-live="polite" className="sr-only">
              {copyFeedback || '\u00A0'}
            </span>
          </div>
        </div>
        ) : null}
      </div>
      {cpfConflictAlert ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
            <div className="flex items-start gap-4 border-b border-amber-100 bg-amber-50 px-6 py-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-white shadow-sm">
                {tenant?.logoUrl ? (
                  <img src={tenant.logoUrl} alt={tenant.name || 'Escola'} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-[#153a6a]">
                    {String(tenant?.name || 'ESCOLA').slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">ATENÇÃO</div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  CPF JÁ USADO POR:
                </div>
                <div className="mt-1 text-base font-bold text-slate-900">
                  {cpfConflictAlert.name}
                </div>
                <div className="mt-1 text-sm font-medium text-slate-600">
                  CPF INFORMADO: {cpfConflictAlert.cpf}
                </div>
              </div>
            </div>
            <div className="space-y-3 px-6 py-4">
              {cpfConflictRoles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
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
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-900">
                RECOMENDAMOS DEIXAR O CPF EM BRANCO QUANDO FOREM PESSOAS DIFERENTES, PARA EVITAR CONFLITO NO SISTEMA.
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setCpfConflictAlert(null);
                    setCpfConflictRoles([]);
                  }}
                  className="rounded-lg bg-rose-600 px-6 py-2 text-sm font-bold text-white hover:bg-rose-700"
                >
                  FECHAR
                </button>
              </div>
            </div>
            <div className="border-t border-slate-100 bg-white px-6 py-3">
              <div className="flex justify-end">
                <ScreenNameCopy
                  screenId={CPF_CONFLICT_SCREEN_ID}
                  label="Tela"
                  disableMargin
                  className="w-auto"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isScreenAuditOpen ? (
        <ScreenAuditModal
          screenId={showFocusedEditor || showFocusedCreate ? EDIT_SCREEN_NAME : SCREEN_NAME}
          systemName="Sistema Escola"
          originText="Origem: Sistema Escola - caminho fisico: C:/Sistemas/IA/Escola/frontend/src/app/msinfor-admin/components/tenant-access-manager.tsx"
          auditText={accessAuditContext.auditText}
          sqlText={accessAuditContext.sqlText}
          onClose={() => setIsScreenAuditOpen(false)}
        />
      ) : null}
    </div>
  );
}
