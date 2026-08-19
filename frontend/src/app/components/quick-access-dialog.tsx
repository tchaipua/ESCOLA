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
    icon: string;
};

export type QuickAccessIconName =
    | 'bolt'
    | 'house'
    | 'gauge-high'
    | 'users'
    | 'user'
    | 'graduation-cap'
    | 'book'
    | 'calendar-days'
    | 'clipboard'
    | 'chart-line'
    | 'money-bill'
    | 'file-lines'
    | 'bell'
    | 'gear'
    | 'folder'
    | 'magnifying-glass'
    | 'comments'
    | 'clock'
    | 'star';

type QuickAccessIconDefinition = {
    name: QuickAccessIconName;
    label: string;
    paths: string[];
};

const DEFAULT_QUICK_ACCESS_ICON: QuickAccessIconName = 'bolt';
const QUICK_ACCESS_ICONS: QuickAccessIconDefinition[] = [
    { name: 'bolt', label: 'RAIO', paths: ['M13 2 4 14h7l-1 8 9-12h-7l1-8Z'] },
    { name: 'house', label: 'INÍCIO', paths: ['m3 10 9-7 9 7', 'M5 9v11h14V9', 'M9 20v-6h6v6'] },
    { name: 'gauge-high', label: 'PAINEL', paths: ['M4 16a8 8 0 1 1 16 0', 'M12 12l4-4', 'M6 19h12'] },
    { name: 'users', label: 'PESSOAS', paths: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'] },
    { name: 'user', label: 'USUÁRIO', paths: ['M20 21a8 8 0 0 0-16 0', 'M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'] },
    { name: 'graduation-cap', label: 'ACADÊMICO', paths: ['m2 10 10-5 10 5-10 5L2 10Z', 'M6 12v5c3 2 9 2 12 0v-5', 'M22 10v6'] },
    { name: 'book', label: 'LIVRO', paths: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v19H6.5A2.5 2.5 0 0 1 4 18.5v-14A2.5 2.5 0 0 1 6.5 2Z'] },
    { name: 'calendar-days', label: 'CALENDÁRIO', paths: ['M4 5h16v15H4z', 'M8 3v4', 'M16 3v4', 'M4 10h16', 'M8 14h.01', 'M12 14h.01', 'M16 14h.01', 'M8 17h.01', 'M12 17h.01'] },
    { name: 'clipboard', label: 'TAREFAS', paths: ['M9 5h6', 'M9 4a3 3 0 0 1 6 0v1', 'M6 5H4v16h16V5h-2', 'M8 12h8', 'M8 16h5'] },
    { name: 'chart-line', label: 'GRÁFICOS', paths: ['M4 19V5', 'M4 19h16', 'm7 15 3-4 3 2 4-6'] },
    { name: 'money-bill', label: 'FINANCEIRO', paths: ['M3 6h18v12H3z', 'M7 12a5 5 0 0 0 10 0 5 5 0 0 0-10 0Z', 'M6 9h.01', 'M18 15h.01'] },
    { name: 'file-lines', label: 'DOCUMENTOS', paths: ['M6 3h8l4 4v14H6z', 'M14 3v5h5', 'M9 13h6', 'M9 17h6'] },
    { name: 'bell', label: 'AVISOS', paths: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'] },
    { name: 'gear', label: 'CONFIGURAÇÕES', paths: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 1.7-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V20h-2.4v-.2a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.7-1.7.06-.06A1.7 1.7 0 0 0 8.4 15a1.7 1.7 0 0 0-1.56-1.04H6.6v-2.4h.24A1.7 1.7 0 0 0 8.4 10a1.7 1.7 0 0 0-.34-1.88L8 8.06l1.7-1.7.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 12.68 5.2V5h2.4v.2a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.7 1.7-.06.06A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.56 1.04h.24v2.4h-.24A1.7 1.7 0 0 0 19.4 15Z'] },
    { name: 'folder', label: 'PASTAS', paths: ['M3 6h7l2 2h9v10H3z'] },
    { name: 'magnifying-glass', label: 'PESQUISA', paths: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.35-4.35'] },
    { name: 'comments', label: 'COMUNICAÇÃO', paths: ['M4 5h16v11H8l-4 4V5Z', 'M8 9h8', 'M8 13h5'] },
    { name: 'clock', label: 'HORÁRIOS', paths: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 2'] },
    { name: 'star', label: 'FAVORITOS', paths: ['m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z'] },
];

const QUICK_ACCESS_ICON_NAMES = new Set<QuickAccessIconName>(QUICK_ACCESS_ICONS.map((icon) => icon.name));

function normalizeCustomIconClass(value: unknown) {
    const rawValue = String(value || '').trim();
    if (!rawValue) return '';

    const classAttribute = rawValue.match(/class\s*=\s*(["'])(.*?)\1/i)?.[2] || rawValue;
    return classAttribute
        .split(/\s+/)
        .filter((token) => /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(token))
        .slice(0, 8)
        .join(' ');
}

function normalizeIcon(value: unknown) {
    const candidate = String(value || '').trim().toLowerCase() as QuickAccessIconName;
    if (QUICK_ACCESS_ICON_NAMES.has(candidate)) return candidate;
    return normalizeCustomIconClass(value) || DEFAULT_QUICK_ACCESS_ICON;
}

function isBuiltInIcon(value: unknown): value is QuickAccessIconName {
    return QUICK_ACCESS_ICON_NAMES.has(String(value || '').trim() as QuickAccessIconName);
}

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

type IconPickerTarget = { type: 'draft' } | { type: 'item'; id: string };

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
            icon: normalizeIcon(item.icon),
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

function FontAwesomeIcon({ name, className = '' }: { name: QuickAccessIconName; className?: string }) {
    const icon = QUICK_ACCESS_ICONS.find((candidate) => candidate.name === name) || QUICK_ACCESS_ICONS[0];
    return (
        <svg className={`fa-solid fa-${icon.name} ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true">
            {icon.paths.map((path, index) => <path key={`${icon.name}-${index}`} d={path} />)}
        </svg>
    );
}

function QuickAccessIcon({ value, className = '' }: { value: string; className?: string }) {
    if (isBuiltInIcon(value)) {
        return <FontAwesomeIcon name={value} className={className} />;
    }

    return <i className={`${normalizeCustomIconClass(value)} ${className}`.trim()} aria-hidden="true" />;
}

function ExternalLinkIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-9 9M19 13v6H5V5h6" /></svg>;
}

function TrashIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>;
}

function PencilIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-.8 4.8L8 20l11.2-11.2a2.8 2.8 0 0 0-4-4L4 16Z" /><path d="m13.8 6.2 4 4" /></svg>;
}

function GripIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h.01M8 12h.01M8 19h.01M16 5h.01M16 12h.01M16 19h.01" /></svg>;
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
    const [draftIcon, setDraftIcon] = useState<string>(DEFAULT_QUICK_ACCESS_ICON);
    const [customIconInput, setCustomIconInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [pendingDelete, setPendingDelete] = useState<QuickAccessItem | null>(null);
    const [iconPickerTarget, setIconPickerTarget] = useState<IconPickerTarget | null>(null);
    const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
    const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);

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
        setDraftIcon(DEFAULT_QUICK_ACCESS_ICON);
        setCustomIconInput('');
        setFormError('');
        setPendingDelete(null);
        setIconPickerTarget(null);
        setDraggedItemId(null);
        setDragOverItemId(null);

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

        const nextItems = [...items, { id: createQuickAccessId(), name, href, description, icon: draftIcon }];
        const saved = await persistItems(nextItems, items);
        if (!saved) return;

        setDraftName('');
        setDraftDescription('');
        setDraftIcon(DEFAULT_QUICK_ACCESS_ICON);
        setCustomIconInput('');
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

    const openIconPicker = (target: IconPickerTarget) => {
        const currentIcon = target.type === 'draft'
            ? draftIcon
            : items.find((item) => item.id === target.id)?.icon || DEFAULT_QUICK_ACCESS_ICON;
        setCustomIconInput(isBuiltInIcon(currentIcon) ? '' : currentIcon);
        setFormError('');
        setIconPickerTarget(target);
    };

    const handlePickIcon = async (icon: QuickAccessIconName) => {
        if (!iconPickerTarget) return;

        if (iconPickerTarget.type === 'draft') {
            setDraftIcon(icon);
            setCustomIconInput('');
            setFormError('');
            setIconPickerTarget(null);
            return;
        }

        const previousItems = items;
        const nextItems = items.map((item) => item.id === iconPickerTarget.id ? { ...item, icon } : item);
        const saved = await persistItems(nextItems, previousItems);
        if (saved) {
            setCustomIconInput('');
            setFormError('');
            setIconPickerTarget(null);
        }
    };

    const handleApplyCustomIcon = async () => {
        if (!iconPickerTarget) return;

        const iconClass = normalizeCustomIconClass(customIconInput);
        if (!iconClass) {
            setFormError('INFORME UMA CLASSE VÁLIDA DO ÍCONE.');
            return;
        }

        if (iconPickerTarget.type === 'draft') {
            setDraftIcon(iconClass);
            setCustomIconInput('');
            setFormError('');
            setIconPickerTarget(null);
            return;
        }

        const previousItems = items;
        const nextItems = items.map((item) => item.id === iconPickerTarget.id ? { ...item, icon: iconClass } : item);
        const saved = await persistItems(nextItems, previousItems);
        if (saved) {
            setCustomIconInput('');
            setFormError('');
            setIconPickerTarget(null);
        }
    };

    const handleDropItem = async (targetItemId: string) => {
        if (!draggedItemId || draggedItemId === targetItemId) {
            setDraggedItemId(null);
            setDragOverItemId(null);
            return;
        }

        const sourceIndex = items.findIndex((item) => item.id === draggedItemId);
        const targetIndex = items.findIndex((item) => item.id === targetItemId);
        if (sourceIndex < 0 || targetIndex < 0) return;

        const nextItems = [...items];
        const [movedItem] = nextItems.splice(sourceIndex, 1);
        nextItems.splice(targetIndex, 0, movedItem);
        setDraggedItemId(null);
        setDragOverItemId(null);
        await persistItems(nextItems, items);
    };

    if (!open) return null;

    const logoUrl = currentTenant?.logoUrl || null;
    const logoAlt = `Logotipo de ${currentTenant?.name || 'ESCOLA'}`;
    const logoText = String(currentTenant?.name || 'ESCOLA').slice(0, 3).toUpperCase();

    return (
        <>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />
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
                    {iconPickerTarget ? (
                        <div className="quick-access-icon-picker" role="region" aria-label="Escolha o ícone do acesso rápido">
                            <div className="quick-access-icon-picker-heading">
                                <div>
                                    <strong>Escolha o ícone do card</strong>
                                    <span>Ícones prontos ou uma classe do Bootstrap Icons.</span>
                                </div>
                                <button type="button" className="quick-access-icon-picker-close" onClick={() => setIconPickerTarget(null)} disabled={isSaving}>Fechar</button>
                            </div>
                            <div className="quick-access-icon-picker-content">
                                <div className="quick-access-icon-picker-grid">
                                    {QUICK_ACCESS_ICONS.map((icon) => {
                                        const selectedIcon = iconPickerTarget.type === 'draft'
                                            ? draftIcon
                                            : items.find((item) => item.id === iconPickerTarget.id)?.icon;
                                        return (
                                            <button
                                                key={icon.name}
                                                type="button"
                                                className={`quick-access-icon-option${selectedIcon === icon.name ? ' is-selected' : ''}`}
                                                onClick={() => void handlePickIcon(icon.name)}
                                                title={`Usar ícone ${icon.label}`}
                                                aria-label={`Usar ícone ${icon.label}`}
                                                disabled={isSaving}
                                            >
                                                <FontAwesomeIcon name={icon.name} />
                                                <span>{icon.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="quick-access-custom-icon" role="group" aria-label="Ícone personalizado">
                                    <strong>Ícone personalizado</strong>
                                    <span>Informe a classe do Bootstrap Icons para usar no card.</span>
                                    <input
                                        value={customIconInput}
                                        onChange={(event) => { setCustomIconInput(event.target.value); setFormError(''); }}
                                        placeholder="bi bi-0-square"
                                        aria-label="Classe do ícone"
                                        disabled={isSaving}
                                    />
                                    <button type="button" onClick={() => void handleApplyCustomIcon()} disabled={isSaving}>
                                        <PlusIcon /> Adicionar ícone
                                    </button>
                                    <a href="https://icons.getbootstrap.com/" target="_blank" rel="noreferrer">
                                        Catálogo Bootstrap Icons <ExternalLinkIcon />
                                    </a>
                                    <small>Ex.: bi bi-0-square ou &lt;i class=&quot;bi bi-0-square&quot;&gt;&lt;/i&gt;</small>
                                </div>
                            </div>
                            {formError && !isAdding ? <p className="quick-access-modal-error" role="alert">{formError}</p> : null}
                        </div>
                    ) : null}
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
                                <div className="quick-access-modal-field">
                                    <span>Ícone do card</span>
                                    <div className="quick-access-selected-icon">
                                        <span className="quick-access-selected-icon-preview"><QuickAccessIcon value={draftIcon} /></span>
                                        <button type="button" className="quick-access-icon-edit" onClick={() => openIconPicker({ type: 'draft' })} disabled={isLoading || isSaving}>
                                            <PencilIcon /> Escolher ícone
                                        </button>
                                    </div>
                                </div>
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
                                <article
                                    className={`quick-access-card${dragOverItemId === item.id ? ' is-drag-over' : ''}${draggedItemId === item.id ? ' is-dragging' : ''}`}
                                    key={item.id}
                                    onDragOver={(event) => { event.preventDefault(); setDragOverItemId(item.id); }}
                                    onDragLeave={() => { if (dragOverItemId === item.id) setDragOverItemId(null); }}
                                    onDrop={(event) => { event.preventDefault(); void handleDropItem(item.id); }}
                                >
                                    <button
                                        type="button"
                                        className="quick-access-card-drag-handle"
                                        draggable
                                        onDragStart={(event) => {
                                            event.stopPropagation();
                                            event.dataTransfer.effectAllowed = 'move';
                                            event.dataTransfer.setData('text/plain', item.id);
                                            setDraggedItemId(item.id);
                                        }}
                                        onDragEnd={() => { setDraggedItemId(null); setDragOverItemId(null); }}
                                        title="Arrastar para mudar a ordem"
                                        aria-label={`Arrastar ${item.description} para mudar a ordem`}
                                        disabled={isSaving}
                                    >
                                        <GripIcon />
                                    </button>
                                    <button type="button" className="quick-access-card-link" onClick={() => handleOpenItem(item)} title={`Abrir ${item.description}`}>
                                        <span className="quick-access-card-icon"><QuickAccessIcon value={item.icon} /></span>
                                        <span className="quick-access-card-copy"><strong>{item.description}</strong></span>
                                        <ExternalLinkIcon />
                                    </button>
                                    <div className="quick-access-card-actions">
                                        <button type="button" className="quick-access-card-edit" onClick={() => openIconPicker({ type: 'item', id: item.id })} title={`Trocar o ícone de ${item.description}`} aria-label={`Trocar o ícone de ${item.description}`} disabled={isSaving}><PencilIcon /></button>
                                        <button type="button" className="quick-access-card-remove" onClick={() => setPendingDelete(item)} title={`Excluir o card ${item.description}`} aria-label={`Excluir o card ${item.description}`} disabled={isSaving}><TrashIcon /></button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div className="quick-access-modal-empty"><FontAwesomeIcon name="bolt" /><strong>Nenhuma tela cadastrada</strong><p>Use “Adicionar tela” no cabeçalho para criar seu primeiro atalho.</p></div>
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
        </>
    );
}
