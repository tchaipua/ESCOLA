import { getStoredToken } from '@/app/lib/auth-storage';

export const MASTER_ROLE = 'SOFTHOUSE_ADMIN';
const API_BASE_URL = 'http://localhost:3001/api/v1';

export type DashboardTokenPayload = {
    userId?: string;
    role?: string;
    permissions?: string[];
    tenantId?: string;
    isMaster?: boolean;
    name?: string;
    modelType?: string;
};

export type DashboardAuthContext = {
    token: string | null;
    userId: string | null;
    role: string | null;
    permissions: string[];
    tenantId: string | null;
    name: string | null;
    modelType: string | null;
};

export type ViaCepAddress = {
    street: string;
    neighborhood: string;
    city: string;
    state: string;
};

export type SharedPersonProfile = {
    sourceType?: string;
    personId?: string | null;
    roles?: string[];
    name?: string | null;
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
    email?: string | null;
    zipCode?: string | null;
    street?: string | null;
    number?: string | null;
    city?: string | null;
    state?: string | null;
    neighborhood?: string | null;
    complement?: string | null;
};

export type SharedNameSuggestion = {
    name: string;
    roles: string[];
    cpf?: string | null;
    email?: string | null;
    active?: boolean;
};

type NameSuggestionCandidate = {
    name?: string | null;
    cpf?: string | null;
    email?: string | null;
    canceledAt?: string | null;
    roleLabel: string;
};

const SHARED_PERSON_FORM_FIELDS = [
    'name',
    'birthDate',
    'rg',
    'cpf',
    'cnpj',
    'nickname',
    'corporateName',
    'phone',
    'whatsapp',
    'cellphone1',
    'cellphone2',
    'email',
    'zipCode',
    'street',
    'number',
    'city',
    'state',
    'neighborhood',
    'complement',
] as const;

export function decodeDashboardToken(token: string): DashboardTokenPayload | null {
    try {
        const base64 = token.split('.')[1];
        if (!base64) return null;

        const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        return JSON.parse(atob(padded)) as DashboardTokenPayload;
    } catch {
        return null;
    }
}

export function getDashboardAuthContext(): DashboardAuthContext {
    const token = getStoredToken();
    if (!token) {
        return { token: null, userId: null, role: null, permissions: [], tenantId: null, name: null, modelType: null };
    }

    const payload = decodeDashboardToken(token);
        return {
            token,
            userId: typeof payload?.userId === 'string' ? payload.userId : null,
            role: typeof payload?.role === 'string' ? payload.role : null,
            permissions: Array.isArray(payload?.permissions)
                ? payload!.permissions.filter((permission): permission is string => typeof permission === 'string')
                : [],
            tenantId: typeof payload?.tenantId === 'string' ? payload.tenantId : null,
            name: typeof payload?.name === 'string' ? payload.name : null,
            modelType: typeof payload?.modelType === 'string' ? payload.modelType : null,
        };
}

export function isDashboardMasterRole(role: string | null) {
    return role === MASTER_ROLE;
}

export function hasDashboardPermission(role: string | null, permissions: string[], permission: string) {
    return isDashboardMasterRole(role) || role === 'ADMIN' || permissions.includes(permission);
}

export function hasAllDashboardPermissions(role: string | null, permissions: string[], requiredPermissions: string[]) {
    return requiredPermissions.every((permission) => hasDashboardPermission(role, permissions, permission));
}

export function hasAnyDashboardPermission(role: string | null, permissions: string[], requiredPermissions: string[]) {
    return requiredPermissions.some((permission) => hasDashboardPermission(role, permissions, permission));
}

export function getAllowedDashboardFields<T extends string>(
    role: string | null,
    permissions: string[],
    fieldPermissions: Record<T, string | null>,
) {
    return Object.fromEntries(
        (Object.entries(fieldPermissions) as Array<[T, string | null]>).map(([field, permission]) => [
            field,
            !permission || hasDashboardPermission(role, permissions, permission),
        ]),
    ) as Record<T, boolean>;
}

export function isValidCpf(value: string) {
    const cpf = value.replace(/[^\d]+/g, '');
    if (cpf === '' || cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

    let sum = 0;
    for (let index = 0; index < 9; index += 1) {
        sum += Number.parseInt(cpf.charAt(index), 10) * (10 - index);
    }

    let remainder = 11 - (sum % 11);
    if (remainder >= 10) remainder = 0;
    if (remainder !== Number.parseInt(cpf.charAt(9), 10)) return false;

    sum = 0;
    for (let index = 0; index < 10; index += 1) {
        sum += Number.parseInt(cpf.charAt(index), 10) * (11 - index);
    }

    remainder = 11 - (sum % 11);
    if (remainder >= 10) remainder = 0;
    return remainder === Number.parseInt(cpf.charAt(10), 10);
}

export function isValidCnpj(value: string) {
    const cnpj = value.replace(/[^\d]+/g, '');
    if (cnpj === '' || cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

    let length = cnpj.length - 2;
    let numbers = cnpj.substring(0, length);
    const digits = cnpj.substring(length);

    let sum = 0;
    let position = length - 7;
    for (let index = length; index >= 1; index -= 1) {
        sum += Number.parseInt(numbers.charAt(length - index), 10) * position;
        position -= 1;
        if (position < 2) position = 9;
    }

    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== Number.parseInt(digits.charAt(0), 10)) return false;

    length += 1;
    numbers = cnpj.substring(0, length);
    sum = 0;
    position = length - 7;

    for (let index = length; index >= 1; index -= 1) {
        sum += Number.parseInt(numbers.charAt(length - index), 10) * position;
        position -= 1;
        if (position < 2) position = 9;
    }

    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return result === Number.parseInt(digits.charAt(1), 10);
}

export function formatCpf(value: string) {
    const digits = value.replace(/[^\d]+/g, '');
    if (digits.length !== 11) return value;
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function formatCnpj(value: string) {
    const digits = value.replace(/[^\d]+/g, '');
    if (digits.length !== 14) return value;
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export function formatPhone(value: string) {
    if (!value) return value;

    let digits = value.replace(/[^\d]+/g, '');
    if (digits.startsWith('0') && digits.length >= 11) {
        digits = digits.substring(1);
    }

    if (digits.length === 11) {
        return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }

    if (digits.length === 10) {
        return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }

    return value;
}

export function normalizeDocumentDigits(value: string) {
    return value.replace(/[^\d]+/g, '');
}

function normalizeSearchText(value: string) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

function isSubsequence(query: string, candidate: string) {
    if (!query || !candidate) return false;
    let queryIndex = 0;
    for (let candidateIndex = 0; candidateIndex < candidate.length; candidateIndex += 1) {
        if (candidate[candidateIndex] === query[queryIndex]) {
            queryIndex += 1;
        }
        if (queryIndex === query.length) {
            return true;
        }
    }
    return false;
}

function scoreNameSimilarity(query: string, candidateName: string) {
    const normalizedQuery = normalizeSearchText(query);
    const normalizedName = normalizeSearchText(candidateName);
    if (!normalizedQuery || !normalizedName) return 0;
    if (normalizedName === normalizedQuery) return 120;
    if (normalizedName.startsWith(normalizedQuery)) return 110;
    if (normalizedName.includes(normalizedQuery)) return 100;

    const queryTokens = normalizedQuery.split(' ').filter(Boolean);
    const nameTokens = normalizedName.split(' ').filter(Boolean);
    if (
        queryTokens.length > 0
        && queryTokens.every((token) => nameTokens.some((nameToken) => nameToken.includes(token)))
    ) {
        return 90;
    }

    const compactQuery = normalizedQuery.replace(/\s+/g, '');
    const compactName = normalizedName.replace(/\s+/g, '');
    if (compactQuery.length >= 3 && isSubsequence(compactQuery, compactName)) {
        return 80;
    }

    return 0;
}

async function fetchNameSuggestionCandidates(token: string, endpoint: string, roleLabel: string): Promise<NameSuggestionCandidate[]> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (response.status === 403 || response.status === 404) {
        return [];
    }

    if (!response.ok) {
        throw new Error('Não foi possível consultar cadastros para montar sugestões.');
    }

    const data = await response.json().catch(() => []);
    if (!Array.isArray(data)) {
        return [];
    }

    return data.map((item) => ({
        name: typeof item?.name === 'string' ? item.name : null,
        cpf: typeof item?.cpf === 'string' ? item.cpf : null,
        email: typeof item?.email === 'string' ? item.email : null,
        canceledAt: typeof item?.canceledAt === 'string' ? item.canceledAt : null,
        roleLabel,
    }));
}

async function fetchFallbackNameSuggestions(name: string, token: string, limit: number): Promise<SharedNameSuggestion[]> {
    const normalizedQuery = normalizeSearchText(name);
    if (normalizedQuery.length < 2) return [];

    const [teachers, students, guardians, users] = await Promise.all([
        fetchNameSuggestionCandidates(token, '/teachers', 'PROFESSOR'),
        fetchNameSuggestionCandidates(token, '/students', 'ALUNO'),
        fetchNameSuggestionCandidates(token, '/guardians', 'RESPONSAVEL'),
        fetchNameSuggestionCandidates(token, '/users', 'USUARIO'),
    ]);

    const allCandidates = [...teachers, ...students, ...guardians, ...users];
    const scored = allCandidates
        .map((candidate) => ({
            candidate,
            score: scoreNameSimilarity(normalizedQuery, candidate.name || ''),
        }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score);

    const merged = new Map<string, SharedNameSuggestion>();
    scored.forEach(({ candidate }) => {
        const key = candidate.cpf
            ? `CPF:${candidate.cpf}`
            : candidate.email
                ? `EMAIL:${candidate.email}`
                : `NAME:${normalizeSearchText(candidate.name || '')}`;

        const existing = merged.get(key);
        if (!existing) {
            merged.set(key, {
                name: candidate.name || 'PESSOA',
                roles: [candidate.roleLabel],
                cpf: candidate.cpf || null,
                email: candidate.email || null,
                active: !candidate.canceledAt,
            });
            return;
        }

        merged.set(key, {
            ...existing,
            roles: Array.from(new Set([...(existing.roles || []), candidate.roleLabel])),
        });
    });

    return Array.from(merged.values()).slice(0, limit);
}

export async function fetchSharedPersonProfileByCpf(cpf: string): Promise<SharedPersonProfile | null> {
    const normalizedCpf = normalizeDocumentDigits(cpf);
    if (normalizedCpf.length !== 11) return null;

    const { token } = getDashboardAuthContext();
    if (!token) {
        throw new Error('Token não encontrado, por favor faça login novamente.');
    }

    const response = await fetch(`${API_BASE_URL}/shared-profiles/cpf/${normalizedCpf}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.message || 'Não foi possível consultar os dados compartilhados deste CPF.');
    }

    return response.json();
}

export async function fetchSharedPersonProfileByEmail(email: string): Promise<SharedPersonProfile | null> {
    const normalizedEmail = String(email || '').trim().toUpperCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) return null;

    const { token } = getDashboardAuthContext();
    if (!token) {
        throw new Error('Token não encontrado, por favor faça login novamente.');
    }

    const response = await fetch(`${API_BASE_URL}/shared-profiles/email/${encodeURIComponent(normalizedEmail)}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.message || 'Não foi possível consultar os dados compartilhados deste e-mail.');
    }

    return response.json();
}

export async function fetchSharedPersonNameSuggestions(name: string, limit = 8): Promise<SharedNameSuggestion[]> {
    const normalizedName = String(name || '').trim();
    if (normalizedName.length < 2) return [];

    const { token } = getDashboardAuthContext();
    if (!token) {
        throw new Error('Token não encontrado, por favor faça login novamente.');
    }

    let response = await fetch(`${API_BASE_URL}/shared-profiles/name-suggestions?name=${encodeURIComponent(normalizedName)}&limit=${limit}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (response.status === 404) {
        response = await fetch(`${API_BASE_URL}/shared-profiles/name-suggestions/${encodeURIComponent(normalizedName)}?limit=${limit}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
    }

    if (!response.ok) {
        const err = await response.json().catch(() => null);
        const backendMessage = err?.message || '';
        const shouldUseFallback =
            response.status === 404
            || backendMessage.includes('Cannot GET')
            || backendMessage.includes('Cannot')
            || backendMessage.includes('Not Found');

        if (shouldUseFallback) {
            return fetchFallbackNameSuggestions(normalizedName, token, limit);
        }

        throw new Error(backendMessage || 'Não foi possível consultar sugestões de nomes.');
    }

    const data = await response.json().catch(() => []);
    if (!Array.isArray(data)) return [];
    return data as SharedNameSuggestion[];
}

export function mergeSharedPersonIntoForm<T extends Record<string, string>>(formData: T, profile: SharedPersonProfile | null): T {
    if (!profile) return formData;

    const nextFormData = { ...formData };
    const mutableFormData = nextFormData as Record<string, string>;

    SHARED_PERSON_FORM_FIELDS.forEach((field) => {
        const currentValue = String(nextFormData[field] || '').trim();
        const incomingValue = typeof profile[field] === 'string' ? profile[field] : '';

        if (currentValue || !incomingValue?.trim()) return;

        mutableFormData[field] = field === 'birthDate'
            ? incomingValue.split('T')[0] || incomingValue
            : incomingValue;
    });

    return nextFormData;
}

export async function fetchAddressByCep(cep: string): Promise<ViaCepAddress | null> {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
        throw new Error('CEP inválido! Digite os 8 números.');
    }

    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    if (!response.ok) {
        throw new Error('Falha ao consultar CEP.');
    }

    const data = await response.json();
    if (data.erro) {
        throw new Error('O CEP informado não foi encontrado.');
    }

    return {
        street: data.logradouro ? data.logradouro.toUpperCase() : '',
        neighborhood: data.bairro ? data.bairro.toUpperCase() : '',
        city: data.localidade ? data.localidade.toUpperCase() : '',
        state: data.uf || '',
    };
}

export async function readImageFileAsDataUrl(file: File): Promise<string> {
    if (!file.type.startsWith('image/')) {
        throw new Error('Selecione um arquivo de imagem válido.');
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            if (!result) {
                reject(new Error('Não foi possível ler a imagem selecionada.'));
                return;
            }

            resolve(result);
        };
        reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
        reader.readAsDataURL(file);
    });
}
