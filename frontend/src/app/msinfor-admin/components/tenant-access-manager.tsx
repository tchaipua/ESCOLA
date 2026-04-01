'use client';

import { useEffect, useRef, useState } from 'react';
import { readImageFileAsDataUrl } from '@/app/lib/dashboard-crud-utils';
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

const API_BASE_URL = 'http://localhost:3001/api/v1';

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
  canceledAt?: string | null;
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

function getComplementaryProfileBadgeLabel(profile: ComplementaryAccessProfileCode) {
  return COMPLEMENTARY_ACCESS_PROFILE_DEFINITIONS[profile]?.label || profile;
}

function getOrderedPermissionOptions(selectedPermissions: string[]) {
  const active = PERMISSION_OPTIONS.filter((permission) => selectedPermissions.includes(permission.value));
  const inactive = PERMISSION_OPTIONS.filter((permission) => !selectedPermissions.includes(permission.value));
  return [...active, ...inactive];
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
  const [formData, setFormData] = useState<AccessFormState>(EMPTY_FORM);
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

  if (!tenant) return null;

  const resetForm = (options?: { announce?: boolean }) => {
    setIsCreatingNew(false);
    setEditingUserId(null);
    setFormStep('BASICO');
    setFormData(EMPTY_FORM);
    setErrorMessage(null);
    setSuccessMessage(null);
    setPhotoError(null);

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
    setFormData(EMPTY_FORM);
    setErrorMessage(null);
    setSuccessMessage(null);
    setHelperMessage('Preencha o formulario para criar um novo acesso.');
    setPhotoError(null);

    window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 0);
  };

  const editUser = (user: AccessUser) => {
    setIsCreatingNew(false);
    setEditingUserId(user.id);
    setFormStep(user.role === 'ADMIN' ? 'BASICO' : 'PERMISSOES');
    setFormData({
      name: user.name || '',
      email: user.email || '',
      birthDate: user.birthDate || '',
      rg: user.rg || '',
      cpf: user.cpf || '',
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
    });
    setErrorMessage(null);
    setSuccessMessage(null);
    setHelperMessage('Modo edicao ativo. Altere os dados e clique em salvar.');
    setPhotoError(null);
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

  const clearPhoto = () => {
    setFormData((current) => ({ ...current, photoUrl: '' }));
    setPhotoError(null);
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
  };

  const canAdvanceToPermissions =
    formData.role !== 'ADMIN' &&
    formData.name.trim() &&
    formData.email.trim();
  const showPermissionScreen = formData.role !== 'ADMIN' && formStep === 'PERMISSOES';
  const showFocusedEditor = editingUserId !== null;
  const showFocusedCreate = isCreatingNew && editingUserId === null;

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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {tenant.logoUrl ? (
                <img src={tenant.logoUrl} alt={`Logotipo de ${tenant.name}`} className="h-full w-full object-cover" />
              ) : (
                <span className="text-center text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Sem logo</span>
              )}
            </div>
            <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-indigo-500">Acessos especiais</div>
            <h2 className="mt-1 text-xl font-bold text-slate-800">{tenant.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Crie logins e marque o que cada usuario pode cadastrar na escola.
            </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-rose-500">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

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
                  </div>
                </div>

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
                  <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => setFormStep('BASICO')}
                      className="rounded-xl border border-emerald-300 bg-emerald-500 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-600"
                    >
                      Voltar aos dados
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-70"
                    >
                      {isSaving ? 'Salvando...' : editingUserId ? 'Salvar alteracoes' : 'Criar acesso'}
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
                </div>
              </div>

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
                    value={formData.cpf || ''}
                    onChange={(event) => setFormData((current) => ({ ...current, cpf: event.target.value.toUpperCase() }))}
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
                    onChange={(event) => setFormData((current) => ({ ...current, whatsapp: event.target.value.toUpperCase() }))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-slate-600">Telefone</label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(event) => setFormData((current) => ({ ...current, phone: event.target.value.toUpperCase() }))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Endereco</div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-600">CEP</label>
                    <input
                      type="text"
                      value={formData.zipCode || ''}
                      onChange={(event) => setFormData((current) => ({ ...current, zipCode: event.target.value.toUpperCase() }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-slate-600">Logradouro</label>
                    <input
                      type="text"
                      value={formData.street || ''}
                      onChange={(event) => setFormData((current) => ({ ...current, street: event.target.value.toUpperCase() }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-600">Numero</label>
                    <input
                      type="text"
                      value={formData.number || ''}
                      onChange={(event) => setFormData((current) => ({ ...current, number: event.target.value.toUpperCase() }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-slate-600">Bairro</label>
                    <input
                      type="text"
                      value={formData.neighborhood || ''}
                      onChange={(event) => setFormData((current) => ({ ...current, neighborhood: event.target.value.toUpperCase() }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-slate-600">Complemento</label>
                    <input
                      type="text"
                      value={formData.complement || ''}
                      onChange={(event) => setFormData((current) => ({ ...current, complement: event.target.value.toUpperCase() }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="mb-1 block text-xs font-bold text-slate-600">Cidade</label>
                    <input
                      type="text"
                      value={formData.city || ''}
                      onChange={(event) => setFormData((current) => ({ ...current, city: event.target.value.toUpperCase() }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-600">UF</label>
                    <input
                      type="text"
                      value={formData.state || ''}
                      onChange={(event) => setFormData((current) => ({ ...current, state: event.target.value.toUpperCase() }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
                </div>
              ) : null}

              {formData.role === 'ADMIN' ? (
                <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-4 text-sm text-indigo-700">
                  Este perfil tera autorizacao completa na escola.
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
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => resetForm({ announce: true })}
                className="rounded-xl border border-slate-200 px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Voltar para a lista
              </button>
              {formData.role !== 'ADMIN' ? (
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
                  className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800"
                >
                  Abrir permissões
                </button>
              ) : null}
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-70"
              >
                {isSaving ? 'Salvando...' : showFocusedEditor ? 'Salvar alteracoes' : 'Criar acesso'}
              </button>
            </div>
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-400"
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
                          </div>
                          <div className="mt-1 text-sm font-medium text-slate-600">{user.email}</div>
                          <div className="mt-2 text-sm text-slate-500">
                            {user.role === 'ADMIN' ? 'Acesso total da escola.' : 'Perfil administrativo configurado para esta escola.'}
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
      </div>
    </div>
  );
}
