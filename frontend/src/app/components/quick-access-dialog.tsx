'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { fetchUserPreference, saveUserPreference } from '@/app/lib/user-preferences';

const QUICK_ACCESS_PREFERENCE_KEY = 'PRINCIPAL_ESCOLA_QUICK_ACCESS_ITEMS_V1';
const QUICK_ACCESS_ROUTES_PREFERENCE_KEY = 'PRINCIPAL_ESCOLA_QUICK_ACCESS_SCREEN_ROUTES_V1';
const QUICK_ACCESS_SCREEN_ID = 'POPUP_PRINCIPAL_ESCOLA_ACESSO_RAPIDO';
const MAX_QUICK_ACCESS_ITEMS = 40;
const EMPTY_SCREEN_ROUTES: Record<string, string> = {};

export type QuickAccessItem = {
    id: string;
    name: string;
    href: string;
    description: string;
};

type QuickAccessDialogProps = {
    open: boolean;
    onClose: () => void;
    pathname: string;
    currentScreenId: string;
    knownScreenRoutes?: Record<string, string>;
    currentTenant?: {
        name: string;
        logoUrl?: string | null;
    } | null;
};

function normalizeScreenId(value: unknown) {
    return String(value || '')
        .trim()
        .replace(/[^A-Z0-9]+/gi, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 120)
        .toUpperCase();
}

function normalizePath(value: unknown) {
    const path = String(value || '').trim();
    if (!path || (path !== '/principal' && !path.startsWith('/principal/'))) return null;
    if (path.startsWith('//') || path.includes('?') || path.includes('#') || path.length > 240) return null;
    return path;
}

function normalizeDescription(value: unknown) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 180);
}

function normalizeRouteMap(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((routes, [screenId, href]) => {
        const normalizedScreenId = normalizeScreenId(screenId);
        const normalizedPath = normalizePath(href);
        if (normalizedScreenId && normalizedPath) routes[normalizedScreenId] = normalizedPath;
        return routes;
    }, {});
}

function normalizeQuickAccessItems(value: unknown): QuickAccessItem[] {
    if (!Array.isArray(value)) return [];

    const seenScreens = new Set<string>();
    const normalized: QuickAccessItem[] = [];

    for (const candidate of value) {
        if (!candidate || typeof candidate !== 'object') continue;
        const item = candidate as Record<string, unknown>;
        const name = normalizeScreenId(item.name || item.screenId);
        const href = normalizePath(item.href || item.path);
        const description = normalizeDescription(item.description || item.label);
        if (!name || !href || !description || seenScreens.has(name)) continue;

        seenScreens.add(name);
        normalized.push({
            id: String(item.id || `${name}:${normalized.length}`).slice(0, 100),
            name,
            href,
            description,
        });

        if (normalized.length >= MAX_QUICK_ACCESS_ITEMS) break;
    }

    return normalized;
}

function createQuickAccessId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `quick-access-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function PlusIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function CloseIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}

function ZapIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>;
}

function ExternalLinkIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-9 9M19 13v6H5V5h6" /></svg>;
}

function TrashIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>;
}

export default function QuickAccessDialog({
    open,
    onClose,
    pathname,
    currentScreenId,
    knownScreenRoutes = EMPTY_SCREEN_ROUTES,
    currentTenant,
}: QuickAccessDialogProps) {
    const router = useRouter();
    const [items, setItems] = useState<QuickAccessItem[]>([]);
    const [screenRoutes, setScreenRoutes] = useState<Record<string, string>>({});
    const [isAdding, setIsAdding] = useState(false);
    const [draftName, setDraftName] = useState('');
    const [draftDescription, setDraftDescription] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [pendingDelete, setPendingDelete] = useState<QuickAccessItem | null>(null);

    const knownScreenRoutesSignature = JSON.stringify(knownScreenRoutes);
    const normalizedKnownRoutes = useMemo(
        () => normalizeRouteMap(JSON.parse(knownScreenRoutesSignature) as unknown),
        [knownScreenRoutesSignature],
    );

    useEffect(() => {
        if (!open) return;

        let active = true;
        setIsLoading(true);
        setIsAdding(false);
        setDraftName('');
        setDraftDescription('');
        setFormError('');
        setPendingDelete(null);

        void Promise.allSettled([
            fetchUserPreference<unknown>(QUICK_ACCESS_PREFERENCE_KEY),
            fetchUserPreference<unknown>(QUICK_ACCESS_ROUTES_PREFERENCE_KEY),
        ]).then(async ([itemsResult, routesResult]) => {
            if (!active) return;

            if (itemsResult.status === 'fulfilled') {
                setItems(normalizeQuickAccessItems(itemsResult.value));
            } else {
                setFormError('NÃO FOI POSSÍVEL CARREGAR OS ACESSOS RÁPIDOS.');
            }

            const storedRoutes = routesResult.status === 'fulfilled'
                ? normalizeRouteMap(routesResult.value)
                : {};
            const currentPath = normalizePath(pathname);
            const normalizedCurrentScreenId = normalizeScreenId(currentScreenId);
            const nextRoutes = {
                ...storedRoutes,
                ...normalizedKnownRoutes,
                ...(currentPath && normalizedCurrentScreenId
                    ? { [normalizedCurrentScreenId]: currentPath }
                    : {}),
            };
            setScreenRoutes(nextRoutes);

            try {
                await saveUserPreference(QUICK_ACCESS_ROUTES_PREFERENCE_KEY, nextRoutes);
            } catch {
                // As rotas conhecidas desta sessão continuam disponíveis para cadastro.
            }
        }).finally(() => {
            if (active) setIsLoading(false);
        });

        return () => {
            active = false;
        };
    }, [currentScreenId, normalizedKnownRoutes, open, pathname]);

    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (pendingDelete) {
                setPendingDelete(null);
                return;
            }
            onClose();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, open, pendingDelete]);

    const persistItems = async (nextItems: QuickAccessItem[], previousItems: QuickAccessItem[]) => {
        setItems(nextItems);
        setIsSaving(true);
        setFormError('');

        try {
            await saveUserPreference(QUICK_ACCESS_PREFERENCE_KEY, nextItems);
            return true;
        } catch {
            setItems(previousItems);
            setFormError('NÃO FOI POSSÍVEL SALVAR ESTA ALTERAÇÃO.');
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const name = normalizeScreenId(draftName);
        const description = normalizeDescription(draftDescription);
        const href = screenRoutes[name];

        if (!name) {
            setFormError('INFORME O NOME EXCLUSIVO DA TELA.');
            return;
        }
        if (!description) {
            setFormError('INFORME A DESCRIÇÃO QUE APARECERÁ NO CARD.');
            return;
        }
        if (!href) {
            setFormError('TELA NÃO LOCALIZADA. ABRA ESSA TELA E USE O NOME EXIBIDO NO RODAPÉ.');
            return;
        }
        if (items.some((item) => item.name === name)) {
            setFormError('ESSA TELA JÁ ESTÁ CADASTRADA NO ACESSO RÁPIDO.');
            return;
        }
        if (items.length >= MAX_QUICK_ACCESS_ITEMS) {
            setFormError(`LIMITE DE ${MAX_QUICK_ACCESS_ITEMS} ACESSOS RÁPIDOS ATINGIDO.`);
            return;
        }

        const nextItems = [...items, { id: createQuickAccessId(), name, href, description }];
        const saved = await persistItems(nextItems, items);
        if (!saved) return;

        setDraftName('');
        setDraftDescription('');
        setIsAdding(false);
    };

    const confirmRemoveItem = async () => {
        if (!pendingDelete) return;
        const previousItems = items;
        const nextItems = items.filter((item) => item.id !== pendingDelete.id);
        const saved = await persistItems(nextItems, previousItems);
        if (saved) setPendingDelete(null);
    };

    const handleOpenItem = (item: QuickAccessItem) => {
        onClose();
        if (item.href !== pathname) router.push(item.href);
    };

    if (!open) return null;

    const logoUrl = currentTenant?.logoUrl || null;
    const logoAlt = `Logotipo de ${currentTenant?.name || 'ESCOLA'}`;
    const logoText = String(currentTenant?.name || 'ESCOLA').slice(0, 3).toUpperCase();

    return (
        <div className="quick-access-modal-backdrop" onClick={onClose} role="presentation">
            <section className="quick-access-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="quick-access-modal-title">
                <header className="quick-access-modal-header">
                    <div className="quick-access-modal-heading">
                        <div className="quick-access-modal-icon">
                            {logoUrl ? <img src={logoUrl} alt={logoAlt} /> : <span>{logoText}</span>}
                        </div>
                        <div>
                            <small>PREFERÊNCIAS DO USUÁRIO</small>
                            <h2 id="quick-access-modal-title">Acesso rápido</h2>
                            <p>Atalhos pessoais para as telas usadas com mais frequência.</p>
                        </div>
                    </div>
                    <div className="quick-access-modal-header-actions">
                        <button type="button" className="quick-access-modal-add" onClick={() => { setIsAdding((current) => !current); setFormError(''); }}>
                            <PlusIcon /> {isAdding ? 'Fechar cadastro' : 'Adicionar tela'}
                        </button>
                        <button type="button" className="quick-access-modal-close" onClick={onClose} aria-label="Fechar acesso rápido"><CloseIcon /></button>
                    </div>
                </header>

                <div className="quick-access-modal-body">
                    {isAdding ? (
                        <form className="quick-access-modal-form" onSubmit={(event) => void handleAdd(event)}>
                            <div className="quick-access-modal-form-heading"><div><strong>Incluir tela no acesso rápido</strong><span>Informe somente o nome exclusivo exibido no rodapé da tela.</span></div></div>
                            <div className="quick-access-modal-form-grid">
                                <label className="quick-access-modal-field">
                                    <span>Nome exclusivo da tela</span>
                                    <input autoFocus value={draftName} onChange={(event) => { setDraftName(event.target.value.toUpperCase()); setFormError(''); }} placeholder="Ex.: PRINCIPAL_ALUNOS" maxLength={120} disabled={isLoading || isSaving} />
                                </label>
                                <label className="quick-access-modal-field">
                                    <span>Descrição do card</span>
                                    <textarea value={draftDescription} onChange={(event) => { setDraftDescription(event.target.value); setFormError(''); }} placeholder="Ex.: Consultar alunos da escola" maxLength={180} rows={2} disabled={isLoading || isSaving} />
                                </label>
                            </div>
                            {formError ? <p className="quick-access-modal-error" role="alert">{formError}</p> : null}
                            <div className="quick-access-modal-form-actions">
                                <button type="button" className="quick-access-form-cancel" onClick={() => { setIsAdding(false); setFormError(''); }} disabled={isSaving}>Cancelar</button>
                                <button type="submit" className="quick-access-form-submit" disabled={isLoading || isSaving}><PlusIcon /> {isSaving ? 'Salvando...' : 'Incluir card'}</button>
                            </div>
                        </form>
                    ) : formError ? <p className="quick-access-modal-error quick-access-modal-load-error" role="alert">{formError}</p> : null}

                    {isLoading ? (
                        <div className="quick-access-modal-empty"><strong>Carregando acessos rápidos...</strong></div>
                    ) : items.length > 0 ? (
                        <div className="quick-access-modal-grid">
                            {items.map((item) => (
                                <article className="quick-access-card" key={item.id}>
                                    <button type="button" className="quick-access-card-link" onClick={() => handleOpenItem(item)} title={`Abrir ${item.description}`}>
                                        <span className="quick-access-card-icon"><ZapIcon /></span>
                                        <span className="quick-access-card-copy"><strong>{item.description}</strong></span>
                                        <ExternalLinkIcon />
                                    </button>
                                    <button type="button" className="quick-access-card-remove" onClick={() => setPendingDelete(item)} title={`Excluir o card ${item.description}`} aria-label={`Excluir o card ${item.description}`} disabled={isSaving}><TrashIcon /></button>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div className="quick-access-modal-empty"><ZapIcon /><strong>Nenhuma tela cadastrada</strong><p>Use “Adicionar tela” no cabeçalho para criar seu primeiro atalho.</p></div>
                    )}
                </div>

                <footer className="quick-access-modal-footer">
                    <ScreenNameCopy className="quick-access-modal-screen-copy" screenId={QUICK_ACCESS_SCREEN_ID} disableMargin originText="Origem: Sistema Escola - caminho físico: C:/Sistemas/IA/Escola/frontend/src/app/components/quick-access-dialog.tsx" auditText="Popup de preferências individuais para incluir, abrir e excluir atalhos pessoais das telas da Escola. A exclusão remove somente o card deste acesso rápido." sqlText="A preferência é persistida em user_preferences, isolada por tenantId, branchCode e userId, com auditoria de criação e atualização." />
                </footer>

                {pendingDelete ? (
                    <div className="quick-access-confirm-backdrop" data-system-message-root onClick={() => setPendingDelete(null)} role="presentation">
                        <section className="quick-access-confirm" onClick={(event) => event.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="quick-access-confirm-title">
                            <header className="quick-access-confirm-header">
                                <div className="quick-access-confirm-logo">{logoUrl ? <img src={logoUrl} alt={logoAlt} /> : <span>{logoText}</span>}</div>
                                <div><small>CONFIRMAÇÃO</small><h3 id="quick-access-confirm-title">Excluir acesso rápido?</h3></div>
                                <button type="button" onClick={() => setPendingDelete(null)} aria-label="Fechar confirmação"><CloseIcon /></button>
                            </header>
                            <div className="quick-access-confirm-body"><span><TrashIcon /></span><div><strong>{pendingDelete.description}</strong><p>Somente este card será removido. A tela original do sistema não será alterada.</p></div></div>
                            <footer className="quick-access-confirm-actions">
                                <button type="button" className="quick-access-form-cancel" onClick={() => setPendingDelete(null)} disabled={isSaving}>Cancelar</button>
                                <button type="button" className="quick-access-delete-confirm" onClick={() => void confirmRemoveItem()} disabled={isSaving}><TrashIcon /> {isSaving ? 'Excluindo...' : 'Excluir card'}</button>
                            </footer>
                        </section>
                    </div>
                ) : null}
            </section>
        </div>
    );
}
