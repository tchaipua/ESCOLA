'use client';

import { useEffect, useState, type FormEvent } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';

export type GeneralSettingsTab = 's3' | 'email';

export type GeneralSettingsForm = {
    s3Enabled: boolean;
    s3EndpointType: string;
    s3Endpoint: string;
    s3Region: string;
    s3Bucket: string;
    s3AccessKey: string;
    s3SecretKey: string;
    s3BaseFolder: string;
    s3PublicBaseUrl: string;
    s3UseSsl: boolean;
    s3ForcePathStyle: boolean;
    s3DefaultAcl: string;
    s3DefaultExpirationMinutes: string;
    emailEnabled: boolean;
    emailSenderName: string;
    emailSenderEmail: string;
    emailReplyTo: string;
    emailSmtpHost: string;
    emailSmtpPort: string;
    emailSmtpUser: string;
    emailSmtpPassword: string;
    emailUseSsl: boolean;
    emailUseAuth: boolean;
};

export const DEFAULT_GENERAL_SETTINGS: GeneralSettingsForm = {
    s3Enabled: true,
    s3EndpointType: 'CUSTOM',
    s3Endpoint: '',
    s3Region: '',
    s3Bucket: '',
    s3AccessKey: '',
    s3SecretKey: '',
    s3BaseFolder: 'content',
    s3PublicBaseUrl: '',
    s3UseSsl: true,
    s3ForcePathStyle: true,
    s3DefaultAcl: 'Default',
    s3DefaultExpirationMinutes: '1440',
    emailEnabled: true,
    emailSenderName: 'MSINFOR SISTEMAS',
    emailSenderEmail: '',
    emailReplyTo: '',
    emailSmtpHost: 'smtp.gmail.com',
    emailSmtpPort: '465',
    emailSmtpUser: '',
    emailSmtpPassword: '',
    emailUseSsl: true,
    emailUseAuth: true,
};

const GLOBAL_SETTINGS_MODAL_SCREEN_ID = 'MSINFOR_ADMIN_CONFIGURACOES_GERAIS_MODAL';

type GlobalSettingsModalProps = {
    isOpen: boolean;
    activeTab: GeneralSettingsTab;
    values: GeneralSettingsForm;
    status: string | null;
    isSaving: boolean;
    isTesting: boolean;
    testResult: {
        tone: 'success' | 'error';
        title: string;
        message: string;
        details?: string[];
    } | null;
    onClose: () => void;
    onTabChange: (tab: GeneralSettingsTab) => void;
    onChange: <K extends keyof GeneralSettingsForm>(field: K, value: GeneralSettingsForm[K]) => void;
    onSave: (event: FormEvent) => void;
    onTestS3: () => void;
    onDismissTestResult: () => void;
};

function panelButtonClass(isActive: boolean) {
    return `flex w-full items-start justify-between rounded-2xl border px-4 py-4 text-left transition-all ${
        isActive
            ? 'border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm'
            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
    }`;
}

function fieldCardClass() {
    return 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
}

function labelClass() {
    return 'mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500';
}

function inputClass() {
    return 'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:bg-white';
}

export default function GlobalSettingsModal({
    isOpen,
    activeTab,
    values,
    status,
    isSaving,
    isTesting,
    testResult,
    onClose,
    onTabChange,
    onChange,
    onSave,
    onTestS3,
    onDismissTestResult,
}: GlobalSettingsModalProps) {
    const [isS3SecretVisible, setIsS3SecretVisible] = useState(false);
    const [isEmailSmtpPasswordVisible, setIsEmailSmtpPasswordVisible] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setIsEmailSmtpPasswordVisible(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[58] overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm">
            <div className="flex min-h-full items-center justify-center py-2">
                <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
                <div className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-slate-950 via-[#153a6a] to-indigo-700 px-6 py-5 text-white">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-4">
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/95 shadow-lg">
                                <img src="/logo-msinfor.jpg" alt="Logo MSINFOR" className="h-full w-full object-cover" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200">Configurações gerais</div>
                                <h3 className="mt-1 text-2xl font-black tracking-tight">Parâmetros globais da softhouse</h3>
                                <p className="mt-1 max-w-3xl text-sm font-medium text-indigo-100/90">
                                    Este módulo é global da MSINFOR e não pertence a nenhuma escola. Campos sensíveis preservam exatamente maiúsculas e minúsculas digitadas.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-white/20"
                        >
                            Fechar
                        </button>
                    </div>
                </div>

                <form onSubmit={onSave} className="min-h-0 flex flex-1 flex-col overflow-hidden bg-slate-50">
                    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[260px_1fr]">
                        <aside className="border-b border-slate-200 bg-white p-5 lg:border-b-0 lg:border-r">
                            <div className="space-y-2">
                                <button type="button" onClick={() => onTabChange('s3')} className={panelButtonClass(activeTab === 's3')}>
                                    <div>
                                        <div className="text-sm font-black uppercase tracking-[0.12em]">S3</div>
                                        <div className="mt-1 text-xs font-medium text-slate-500">Armazenamento central de imagens, anexos e arquivos globais.</div>
                                    </div>
                                </button>
                                <button type="button" onClick={() => onTabChange('email')} className={panelButtonClass(activeTab === 'email')}>
                                    <div>
                                        <div className="text-sm font-black uppercase tracking-[0.12em]">E-mail</div>
                                        <div className="mt-1 text-xs font-medium text-slate-500">Canal oficial da softhouse para comunicação com as escolas.</div>
                                    </div>
                                </button>
                            </div>

                            <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs font-medium text-emerald-700">
                                Tela global pronta para virar backend central mais à frente, com auditoria e persistência definitiva.
                            </div>
                        </aside>

                        <div className="min-h-0 overflow-y-auto p-6">
                            {status ? (
                                <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                                    {status}
                                </div>
                            ) : null}

                            {activeTab === 's3' ? (
                                <div className="space-y-6">
                                    <div className="grid gap-4 xl:grid-cols-3">
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Módulo S3 ativo</span>
                                            <select value={values.s3Enabled ? 'SIM' : 'NAO'} onChange={(event) => onChange('s3Enabled', event.target.value === 'SIM')} className={inputClass()}>
                                                <option value="SIM">SIM</option>
                                                <option value="NAO">NÃO</option>
                                            </select>
                                        </label>
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Modo do endpoint</span>
                                            <select value={values.s3EndpointType} onChange={(event) => onChange('s3EndpointType', event.target.value)} className={inputClass()}>
                                                <option value="CUSTOM">CUSTOM</option>
                                                <option value="AWS">AWS PADRÃO</option>
                                            </select>
                                        </label>
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Region</span>
                                            <input type="text" value={values.s3Region} onChange={(event) => onChange('s3Region', event.target.value)} autoCapitalize="none" spellCheck={false} className={inputClass()} placeholder="sa-east-1" />
                                        </label>
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Bucket</span>
                                            <input type="text" value={values.s3Bucket} onChange={(event) => onChange('s3Bucket', event.target.value)} autoCapitalize="none" spellCheck={false} className={inputClass()} placeholder="msinfor-escolas" />
                                        </label>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Endpoint</span>
                                            <input type="text" value={values.s3Endpoint} onChange={(event) => onChange('s3Endpoint', event.target.value)} autoCapitalize="none" spellCheck={false} className={inputClass()} placeholder="https://usc1.contabostorage.com/" />
                                        </label>
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>URL pública base</span>
                                            <input type="text" value={values.s3PublicBaseUrl} onChange={(event) => onChange('s3PublicBaseUrl', event.target.value)} autoCapitalize="none" spellCheck={false} className={inputClass()} placeholder="https://cdn.msinfor.com.br" />
                                        </label>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Access key</span>
                                            <input type="text" value={values.s3AccessKey} onChange={(event) => onChange('s3AccessKey', event.target.value)} autoCapitalize="none" spellCheck={false} className={inputClass()} placeholder="AKIA..." />
                                        </label>
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Secret key</span>
                                            <div className="relative">
                                                <input
                                                    type={isS3SecretVisible ? 'text' : 'password'}
                                                    value={values.s3SecretKey}
                                                    onChange={(event) => onChange('s3SecretKey', event.target.value)}
                                                    autoCapitalize="none"
                                                    spellCheck={false}
                                                    className={`${inputClass()} pr-14`}
                                                    placeholder="Senha secreta do bucket"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setIsS3SecretVisible((current) => !current)}
                                                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                                    aria-label={isS3SecretVisible ? 'Ocultar secret key' : 'Mostrar secret key'}
                                                    title={isS3SecretVisible ? 'Ocultar secret key' : 'Mostrar secret key'}
                                                >
                                                    {isS3SecretVisible ? (
                                                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3L21 21" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.88 5.09A9.77 9.77 0 0112 4c5 0 9.27 3.11 11 8-0.55 1.55-1.46 2.94-2.62 4.06M6.1 6.1C3.97 7.57 2.33 9.61 1 12c1.73 4.89 6 8 11 8 2.04 0 3.95-.52 5.61-1.43" />
                                                        </svg>
                                                    ) : (
                                                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M1 12C2.73 7.11 7 4 12 4s9.27 3.11 11 8c-1.73 4.89-6 8-11 8S2.73 16.89 1 12z" />
                                                            <circle cx="12" cy="12" r="3" />
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
                                        </label>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-4">
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Pasta base</span>
                                            <input type="text" value={values.s3BaseFolder} onChange={(event) => onChange('s3BaseFolder', event.target.value)} autoCapitalize="none" spellCheck={false} className={inputClass()} placeholder="content" />
                                        </label>
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>ACL padrão</span>
                                            <input type="text" value={values.s3DefaultAcl} onChange={(event) => onChange('s3DefaultAcl', event.target.value)} autoCapitalize="none" spellCheck={false} className={inputClass()} placeholder="Default" />
                                        </label>
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Expiração padrão (min)</span>
                                            <input type="text" value={values.s3DefaultExpirationMinutes} onChange={(event) => onChange('s3DefaultExpirationMinutes', event.target.value)} autoCapitalize="none" spellCheck={false} className={inputClass()} placeholder="1440" />
                                        </label>
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Usar SSL</span>
                                            <select value={values.s3UseSsl ? 'SIM' : 'NAO'} onChange={(event) => onChange('s3UseSsl', event.target.value === 'SIM')} className={inputClass()}>
                                                <option value="SIM">SIM</option>
                                                <option value="NAO">NÃO</option>
                                            </select>
                                        </label>
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Force path style</span>
                                            <select value={values.s3ForcePathStyle ? 'SIM' : 'NAO'} onChange={(event) => onChange('s3ForcePathStyle', event.target.value === 'SIM')} className={inputClass()}>
                                                <option value="SIM">SIM</option>
                                                <option value="NAO">NÃO</option>
                                            </select>
                                        </label>
                                    </div>

                                    <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-sm font-semibold text-cyan-800">
                                        Caminho sugerido para as imagens por escola: <span className="font-black">{values.s3BaseFolder || 'content'}/escola/&lt;ID_ESCOLA&gt;</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="grid gap-4 xl:grid-cols-3">
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>E-mail ativo</span>
                                            <select value={values.emailEnabled ? 'SIM' : 'NAO'} onChange={(event) => onChange('emailEnabled', event.target.value === 'SIM')} className={inputClass()}>
                                                <option value="SIM">SIM</option>
                                                <option value="NAO">NÃO</option>
                                            </select>
                                        </label>
                                        <label className={`${fieldCardClass()} xl:col-span-2`}>
                                            <span className={labelClass()}>Nome do remetente</span>
                                            <input type="text" value={values.emailSenderName} onChange={(event) => onChange('emailSenderName', event.target.value)} className={inputClass()} placeholder="MSINFOR SISTEMAS" />
                                        </label>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-3">
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>E-mail remetente</span>
                                            <input type="email" value={values.emailSenderEmail} onChange={(event) => onChange('emailSenderEmail', event.target.value)} autoCapitalize="none" spellCheck={false} className={inputClass()} placeholder="suporte@msinfor.com.br" />
                                        </label>
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Reply-to</span>
                                            <input type="email" value={values.emailReplyTo} onChange={(event) => onChange('emailReplyTo', event.target.value)} autoCapitalize="none" spellCheck={false} className={inputClass()} placeholder="comercial@msinfor.com.br" />
                                        </label>
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Porta SMTP</span>
                                            <input type="text" value={values.emailSmtpPort} onChange={(event) => onChange('emailSmtpPort', event.target.value)} autoCapitalize="none" spellCheck={false} className={inputClass()} placeholder="465" />
                                        </label>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Host SMTP</span>
                                            <input type="text" value={values.emailSmtpHost} onChange={(event) => onChange('emailSmtpHost', event.target.value)} autoCapitalize="none" spellCheck={false} className={inputClass()} placeholder="smtp.gmail.com" />
                                        </label>
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Usuário SMTP</span>
                                            <input type="text" value={values.emailSmtpUser} onChange={(event) => onChange('emailSmtpUser', event.target.value)} autoCapitalize="none" spellCheck={false} className={inputClass()} placeholder="usuario.smtp" />
                                        </label>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-3">
                                        <label className={`${fieldCardClass()} xl:col-span-2`}>
                                            <span className={labelClass()}>Senha SMTP</span>
                                            <div className="relative">
                                                <input
                                                    type={isEmailSmtpPasswordVisible ? 'text' : 'password'}
                                                    value={values.emailSmtpPassword}
                                                    onChange={(event) => onChange('emailSmtpPassword', event.target.value)}
                                                    autoCapitalize="none"
                                                    spellCheck={false}
                                                    className={`${inputClass()} pr-14`}
                                                    placeholder="Senha sensível do e-mail"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEmailSmtpPasswordVisible((current) => !current)}
                                                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                                    aria-label={isEmailSmtpPasswordVisible ? 'Ocultar senha SMTP' : 'Mostrar senha SMTP'}
                                                    title={isEmailSmtpPasswordVisible ? 'Ocultar senha SMTP' : 'Mostrar senha SMTP'}
                                                >
                                                    {isEmailSmtpPasswordVisible ? (
                                                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3L21 21" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.88 5.09A9.77 9.77 0 0112 4c5 0 9.27 3.11 11 8-0.55 1.55-1.46 2.94-2.62 4.06M6.1 6.1C3.97 7.57 2.33 9.61 1 12c1.73 4.89 6 8 11 8 2.04 0 3.95-.52 5.61-1.43" />
                                                        </svg>
                                                    ) : (
                                                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M1 12C2.73 7.11 7 4 12 4s9.27 3.11 11 8c-1.73 4.89-6 8-11 8S2.73 16.89 1 12z" />
                                                            <circle cx="12" cy="12" r="3" />
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
                                        </label>
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Usar autenticação</span>
                                            <select value={values.emailUseAuth ? 'SIM' : 'NAO'} onChange={(event) => onChange('emailUseAuth', event.target.value === 'SIM')} className={inputClass()}>
                                                <option value="SIM">SIM</option>
                                                <option value="NAO">NÃO</option>
                                            </select>
                                        </label>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-3">
                                        <label className={fieldCardClass()}>
                                            <span className={labelClass()}>Usar SSL/TLS</span>
                                            <select value={values.emailUseSsl ? 'SIM' : 'NAO'} onChange={(event) => onChange('emailUseSsl', event.target.value === 'SIM')} className={inputClass()}>
                                                <option value="SIM">SIM</option>
                                                <option value="NAO">NÃO</option>
                                            </select>
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold text-slate-500">
                                Campos sensíveis não sofrem uppercase automático neste módulo global.
                            </div>
                            <div className="flex flex-col items-end gap-3">
                                <div className="flex items-center gap-3">
                                    {activeTab === 's3' ? (
                                        <button type="button" onClick={onTestS3} disabled={isTesting} className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70">
                                            {isTesting ? 'Testando S3...' : 'Testar comunicação S3'}
                                        </button>
                                    ) : null}
                                    <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50">
                                        Cancelar
                                    </button>
                                    <button type="submit" disabled={isSaving} className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70">
                                        {isSaving ? 'Salvando...' : 'Salvar configurações gerais'}
                                    </button>
                                </div>
                                <ScreenNameCopy screenId={GLOBAL_SETTINGS_MODAL_SCREEN_ID} label="Tela" className="mt-0 justify-end" disableMargin />
                            </div>
                        </div>
                    </div>
                </form>
                </div>
            </div>

            {testResult ? (
                <div className="fixed inset-0 z-[59] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className={`text-[11px] font-black uppercase tracking-[0.24em] ${testResult.tone === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {testResult.tone === 'success' ? 'Conexão validada' : 'Falha na comunicação'}
                                </div>
                                <h4 className="mt-2 text-2xl font-black text-slate-900">{testResult.title}</h4>
                                <p className="mt-2 text-sm font-medium text-slate-600">{testResult.message}</p>
                            </div>
                        </div>

                        {testResult.details?.length ? (
                            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="space-y-2">
                                    {testResult.details.map((detail) => (
                                        <div key={detail} className="text-sm font-semibold text-slate-700">
                                            {detail}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        <div className="mt-6 flex justify-end">
                            <button type="button" onClick={onDismissTestResult} className={`rounded-xl px-6 py-3 text-sm font-black text-white shadow-lg transition-colors ${testResult.tone === 'success' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20'}`}>
                                Fechar mensagem
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
