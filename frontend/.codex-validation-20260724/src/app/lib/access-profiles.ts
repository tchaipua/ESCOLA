export const PERMISSION_OPTIONS = [
    { value: 'VIEW_DASHBOARD', label: 'Visualizar painel' },
    { value: 'VIEW_OWN_PROFILE', label: 'Visualizar meus dados' },
    { value: 'VIEW_OWN_SCHEDULE', label: 'Visualizar meu horário' },
    { value: 'VIEW_NOTIFICATIONS', label: 'Visualizar notificações' },
    { value: 'MANAGE_NOTIFICATIONS', label: 'Gerenciar notificações' },
    { value: 'VIEW_COMMUNICATION_CENTER', label: 'Visualizar central de comunicações' },
    { value: 'MANAGE_COMMUNICATION_CENTER', label: 'Gerenciar central de comunicações' },
    { value: 'VIEW_TEACHER_DAILY_AGENDA', label: 'Visualizar agenda diária do professor' },
    { value: 'MANAGE_TEACHER_DAILY_AGENDA', label: 'Gerenciar agenda diária do professor' },
    { value: 'VIEW_STUDENT_BASIC_DATA', label: 'Visualizar dados básicos de alunos' },
    { value: 'VIEW_STUDENT_CONTACT_DATA', label: 'Visualizar contato de alunos' },
    { value: 'VIEW_STUDENT_ACADEMIC_DATA', label: 'Visualizar dados acadêmicos de alunos' },
    { value: 'VIEW_STUDENT_FINANCIAL_DATA', label: 'Visualizar financeiro de alunos' },
    { value: 'VIEW_STUDENT_SENSITIVE_DATA', label: 'Visualizar dados sensíveis de alunos' },
    { value: 'VIEW_STUDENT_ACCESS_DATA', label: 'Visualizar acesso de alunos' },
    { value: 'VIEW_TEACHER_BASIC_DATA', label: 'Visualizar dados básicos de professores' },
    { value: 'VIEW_TEACHER_CONTACT_DATA', label: 'Visualizar contato de professores' },
    { value: 'VIEW_TEACHER_ACADEMIC_DATA', label: 'Visualizar dados acadêmicos de professores' },
    { value: 'VIEW_TEACHER_FINANCIAL_DATA', label: 'Visualizar financeiro de professores' },
    { value: 'VIEW_TEACHER_SENSITIVE_DATA', label: 'Visualizar dados sensíveis de professores' },
    { value: 'VIEW_TEACHER_ACCESS_DATA', label: 'Visualizar acesso de professores' },
    { value: 'VIEW_GUARDIAN_BASIC_DATA', label: 'Visualizar dados básicos de responsáveis' },
    { value: 'VIEW_GUARDIAN_CONTACT_DATA', label: 'Visualizar contato de responsáveis' },
    { value: 'VIEW_GUARDIAN_FINANCIAL_DATA', label: 'Visualizar financeiro de responsáveis' },
    { value: 'VIEW_GUARDIAN_SENSITIVE_DATA', label: 'Visualizar dados sensíveis de responsáveis' },
    { value: 'VIEW_GUARDIAN_ACCESS_DATA', label: 'Visualizar acesso de responsáveis' },
    { value: 'VIEW_FINANCIAL', label: 'Visualizar financeiro' },
    { value: 'MANAGE_FINANCIAL', label: 'Gerenciar financeiro' },
    { value: 'ISSUE_BOLETOS', label: 'Emitir boletos' },
    { value: 'MANAGE_MONTHLY_FEES', label: 'Lançar mensalidades' },
    { value: 'VIEW_CASHIER', label: 'Visualizar caixa' },
    { value: 'RECEIVE_PAYMENTS', label: 'Receber valores' },
    { value: 'SETTLE_RECEIVABLES', label: 'Baixar mensalidades' },
    { value: 'CLOSE_CASHIER', label: 'Fechar caixa' },
    { value: 'VIEW_USERS', label: 'Visualizar usuários de acesso' },
    { value: 'MANAGE_USERS', label: 'Gerenciar usuários de acesso' },
    { value: 'VIEW_TEACHERS', label: 'Visualizar professores' },
    { value: 'MANAGE_TEACHERS', label: 'Gerenciar professores' },
    { value: 'VIEW_STUDENTS', label: 'Visualizar alunos' },
    { value: 'MANAGE_STUDENTS', label: 'Gerenciar alunos' },
    { value: 'VIEW_GUARDIANS', label: 'Visualizar responsáveis' },
    { value: 'MANAGE_GUARDIANS', label: 'Gerenciar responsáveis' },
    { value: 'VIEW_SUBJECTS', label: 'Visualizar disciplinas' },
    { value: 'MANAGE_SUBJECTS', label: 'Gerenciar disciplinas' },
    { value: 'VIEW_CLASSES', label: 'Visualizar turmas-base' },
    { value: 'MANAGE_CLASSES', label: 'Gerenciar turmas-base' },
    { value: 'VIEW_SERIES', label: 'Visualizar séries' },
    { value: 'MANAGE_SERIES', label: 'Gerenciar séries' },
    { value: 'VIEW_SERIES_CLASSES', label: 'Visualizar vínculo série x turma' },
    { value: 'MANAGE_SERIES_CLASSES', label: 'Gerenciar vínculo série x turma' },
    { value: 'VIEW_ENROLLMENTS', label: 'Visualizar matrículas' },
    { value: 'MANAGE_ENROLLMENTS', label: 'Gerenciar matrículas' },
    { value: 'VIEW_SCHEDULES', label: 'Visualizar horários das aulas' },
    { value: 'MANAGE_SCHEDULES', label: 'Gerenciar horários das aulas' },
    { value: 'VIEW_CLASS_SCHEDULES', label: 'Visualizar grade horária' },
    { value: 'MANAGE_CLASS_SCHEDULES', label: 'Gerenciar grade horária' },
    { value: 'VIEW_LESSON_CALENDARS', label: 'Visualizar grade anual' },
    { value: 'MANAGE_LESSON_CALENDARS', label: 'Gerenciar grade anual' },
    { value: 'VIEW_SCHOOL_YEARS', label: 'Visualizar anos letivos' },
    { value: 'MANAGE_SCHOOL_YEARS', label: 'Gerenciar anos letivos' },
] as const;

export type PermissionValue = (typeof PERMISSION_OPTIONS)[number]['value'];
export type AccessRole = 'ADMIN' | 'SECRETARIA' | 'COORDENACAO' | 'PROFESSOR' | 'ALUNO' | 'RESPONSAVEL';
export type AccessProfileCode =
    | 'ADMIN_TOTAL'
    | 'SECRETARIA_PADRAO'
    | 'COORDENACAO_PEDAGOGICA'
    | 'PROFESSOR_PADRAO'
    | 'ALUNO_CONSULTA'
    | 'RESPONSAVEL_CONSULTA';
export type ComplementaryAccessProfileCode = 'FINANCEIRO' | 'CAIXA';

export const ACCESS_PROFILE_DEFINITIONS: Record<AccessProfileCode, { role: AccessRole; label: string; permissions: PermissionValue[] }> = {
    ADMIN_TOTAL: {
        role: 'ADMIN',
        label: 'ADMIN TOTAL',
        permissions: PERMISSION_OPTIONS.map((item) => item.value),
    },
    SECRETARIA_PADRAO: {
        role: 'SECRETARIA',
        label: 'SECRETARIA PADRÃO',
        permissions: [
            'VIEW_DASHBOARD',
            'VIEW_NOTIFICATIONS',
            'MANAGE_NOTIFICATIONS',
            'VIEW_TEACHERS',
            'VIEW_STUDENTS',
            'VIEW_GUARDIANS',
            'VIEW_STUDENT_BASIC_DATA',
            'VIEW_STUDENT_CONTACT_DATA',
            'VIEW_STUDENT_ACADEMIC_DATA',
            'VIEW_STUDENT_SENSITIVE_DATA',
            'VIEW_STUDENT_ACCESS_DATA',
            'VIEW_TEACHER_BASIC_DATA',
            'VIEW_TEACHER_CONTACT_DATA',
            'VIEW_TEACHER_ACADEMIC_DATA',
            'VIEW_TEACHER_SENSITIVE_DATA',
            'VIEW_TEACHER_ACCESS_DATA',
            'VIEW_GUARDIAN_BASIC_DATA',
            'VIEW_GUARDIAN_CONTACT_DATA',
            'VIEW_GUARDIAN_SENSITIVE_DATA',
            'VIEW_GUARDIAN_ACCESS_DATA',
            'VIEW_SUBJECTS',
            'VIEW_CLASSES',
            'VIEW_SERIES',
            'VIEW_SERIES_CLASSES',
            'VIEW_ENROLLMENTS',
            'VIEW_SCHEDULES',
            'VIEW_CLASS_SCHEDULES',
            'VIEW_LESSON_CALENDARS',
            'VIEW_SCHOOL_YEARS',
            'MANAGE_STUDENTS',
            'MANAGE_GUARDIANS',
            'MANAGE_CLASSES',
            'MANAGE_SERIES',
            'MANAGE_SERIES_CLASSES',
            'MANAGE_ENROLLMENTS',
        ],
    },
    COORDENACAO_PEDAGOGICA: {
        role: 'COORDENACAO',
        label: 'COORDENAÇÃO PEDAGÓGICA',
        permissions: [
            'VIEW_DASHBOARD',
            'VIEW_NOTIFICATIONS',
            'MANAGE_NOTIFICATIONS',
            'VIEW_TEACHERS',
            'VIEW_STUDENTS',
            'VIEW_GUARDIANS',
            'VIEW_STUDENT_BASIC_DATA',
            'VIEW_STUDENT_CONTACT_DATA',
            'VIEW_STUDENT_ACADEMIC_DATA',
            'VIEW_TEACHER_BASIC_DATA',
            'VIEW_TEACHER_CONTACT_DATA',
            'VIEW_TEACHER_ACADEMIC_DATA',
            'VIEW_TEACHER_SENSITIVE_DATA',
            'VIEW_GUARDIAN_BASIC_DATA',
            'VIEW_GUARDIAN_CONTACT_DATA',
            'VIEW_SUBJECTS',
            'VIEW_CLASSES',
            'VIEW_SERIES',
            'VIEW_SERIES_CLASSES',
            'VIEW_ENROLLMENTS',
            'VIEW_SCHEDULES',
            'VIEW_CLASS_SCHEDULES',
            'VIEW_LESSON_CALENDARS',
            'VIEW_SCHOOL_YEARS',
            'MANAGE_TEACHERS',
            'MANAGE_SUBJECTS',
            'MANAGE_SCHEDULES',
            'MANAGE_CLASS_SCHEDULES',
            'MANAGE_LESSON_CALENDARS',
            'MANAGE_SCHOOL_YEARS',
        ],
    },
    PROFESSOR_PADRAO: {
        role: 'PROFESSOR',
        label: 'PROFESSOR PADRÃO',
        permissions: [
            'VIEW_DASHBOARD',
            'VIEW_OWN_PROFILE',
            'VIEW_OWN_SCHEDULE',
            'VIEW_NOTIFICATIONS',
            'MANAGE_NOTIFICATIONS',
            'VIEW_TEACHER_DAILY_AGENDA',
            'MANAGE_TEACHER_DAILY_AGENDA',
            'VIEW_TEACHER_BASIC_DATA',
            'VIEW_TEACHER_CONTACT_DATA',
            'VIEW_TEACHER_ACADEMIC_DATA',
            'VIEW_TEACHER_SENSITIVE_DATA',
            'VIEW_TEACHER_ACCESS_DATA',
            'VIEW_STUDENT_BASIC_DATA',
            'VIEW_STUDENT_ACADEMIC_DATA',
            'VIEW_GUARDIAN_BASIC_DATA',
            'VIEW_GUARDIAN_CONTACT_DATA',
        ],
    },
    ALUNO_CONSULTA: {
        role: 'ALUNO',
        label: 'ALUNO CONSULTA',
        permissions: [
            'VIEW_DASHBOARD',
            'VIEW_OWN_PROFILE',
            'VIEW_OWN_SCHEDULE',
            'VIEW_NOTIFICATIONS',
            'MANAGE_NOTIFICATIONS',
            'VIEW_STUDENT_BASIC_DATA',
            'VIEW_STUDENT_CONTACT_DATA',
            'VIEW_STUDENT_ACADEMIC_DATA',
            'VIEW_STUDENT_SENSITIVE_DATA',
            'VIEW_STUDENT_ACCESS_DATA',
        ],
    },
    RESPONSAVEL_CONSULTA: {
        role: 'RESPONSAVEL',
        label: 'RESPONSÁVEL CONSULTA',
        permissions: [
            'VIEW_DASHBOARD',
            'VIEW_OWN_PROFILE',
            'VIEW_OWN_SCHEDULE',
            'VIEW_NOTIFICATIONS',
            'MANAGE_NOTIFICATIONS',
            'VIEW_GUARDIAN_BASIC_DATA',
            'VIEW_GUARDIAN_CONTACT_DATA',
            'VIEW_GUARDIAN_FINANCIAL_DATA',
            'VIEW_GUARDIAN_SENSITIVE_DATA',
            'VIEW_GUARDIAN_ACCESS_DATA',
            'VIEW_STUDENT_BASIC_DATA',
            'VIEW_STUDENT_CONTACT_DATA',
            'VIEW_STUDENT_ACADEMIC_DATA',
            'VIEW_STUDENT_FINANCIAL_DATA',
            'VIEW_STUDENT_SENSITIVE_DATA',
        ],
    },
};

export const COMPLEMENTARY_ACCESS_PROFILE_DEFINITIONS: Record<ComplementaryAccessProfileCode, { label: string; permissions: PermissionValue[] }> = {
    FINANCEIRO: {
        label: 'FINANCEIRO',
        permissions: [
            'VIEW_STUDENTS',
            'VIEW_STUDENT_BASIC_DATA',
            'VIEW_STUDENT_CONTACT_DATA',
            'VIEW_STUDENT_FINANCIAL_DATA',
            'VIEW_STUDENT_SENSITIVE_DATA',
            'VIEW_GUARDIANS',
            'VIEW_GUARDIAN_BASIC_DATA',
            'VIEW_GUARDIAN_CONTACT_DATA',
            'VIEW_GUARDIAN_FINANCIAL_DATA',
            'VIEW_GUARDIAN_SENSITIVE_DATA',
            'VIEW_COMMUNICATION_CENTER',
            'MANAGE_COMMUNICATION_CENTER',
            'VIEW_TEACHERS',
            'VIEW_TEACHER_BASIC_DATA',
            'VIEW_TEACHER_FINANCIAL_DATA',
            'VIEW_TEACHER_SENSITIVE_DATA',
            'VIEW_FINANCIAL',
            'MANAGE_FINANCIAL',
            'ISSUE_BOLETOS',
            'MANAGE_MONTHLY_FEES',
        ],
    },
    CAIXA: {
        label: 'CAIXA',
        permissions: [
            'VIEW_STUDENTS',
            'VIEW_STUDENT_BASIC_DATA',
            'VIEW_STUDENT_CONTACT_DATA',
            'VIEW_STUDENT_FINANCIAL_DATA',
            'VIEW_GUARDIANS',
            'VIEW_GUARDIAN_BASIC_DATA',
            'VIEW_GUARDIAN_CONTACT_DATA',
            'VIEW_GUARDIAN_FINANCIAL_DATA',
            'VIEW_COMMUNICATION_CENTER',
            'VIEW_FINANCIAL',
            'VIEW_CASHIER',
            'RECEIVE_PAYMENTS',
            'SETTLE_RECEIVABLES',
            'CLOSE_CASHIER',
        ],
    },
};

export function getDefaultAccessProfileForRole(role: AccessRole): AccessProfileCode {
    switch (role) {
        case 'ADMIN':
            return 'ADMIN_TOTAL';
        case 'SECRETARIA':
            return 'SECRETARIA_PADRAO';
        case 'COORDENACAO':
            return 'COORDENACAO_PEDAGOGICA';
        case 'PROFESSOR':
            return 'PROFESSOR_PADRAO';
        case 'ALUNO':
            return 'ALUNO_CONSULTA';
        case 'RESPONSAVEL':
            return 'RESPONSAVEL_CONSULTA';
    }
}

export function getProfilesForRole(role: AccessRole) {
    return (Object.entries(ACCESS_PROFILE_DEFINITIONS) as Array<[AccessProfileCode, { role: AccessRole; label: string; permissions: PermissionValue[] }]>)
        .filter(([, profile]) => profile.role === role)
        .map(([code, profile]) => ({
            code,
            label: profile.label,
            permissions: [...profile.permissions],
        }));
}

export function getProfilePermissions(profileCode: string | null | undefined) {
    if (!profileCode || !(profileCode in ACCESS_PROFILE_DEFINITIONS)) {
        return [];
    }

    return [...ACCESS_PROFILE_DEFINITIONS[profileCode as AccessProfileCode].permissions];
}

export function normalizeComplementaryProfiles(input: string[] | string | null | undefined): ComplementaryAccessProfileCode[] {
    const raw: string[] = Array.isArray(input)
        ? input
        : typeof input === 'string'
            ? input.startsWith('[')
                ? (() => {
                    try {
                        return JSON.parse(input) as string[];
                    } catch {
                        return input.split(',');
                    }
                })()
                : input.split(',')
            : [];

    const normalized = raw
        .map((item: string) => String(item || '').trim().toUpperCase())
        .filter((item: string): item is ComplementaryAccessProfileCode => item in COMPLEMENTARY_ACCESS_PROFILE_DEFINITIONS);

    return Array.from(new Set(normalized));
}

export function getComplementaryProfilePermissions(profiles: string[] | string | null | undefined) {
    const normalized = normalizeComplementaryProfiles(profiles);
    return Array.from(new Set(normalized.flatMap((profile) => COMPLEMENTARY_ACCESS_PROFILE_DEFINITIONS[profile].permissions)));
}

export function mergeAccessPermissions(profileCode: AccessProfileCode, complementaryProfiles: string[] | string | null | undefined) {
    return Array.from(new Set([
        ...getProfilePermissions(profileCode),
        ...getComplementaryProfilePermissions(complementaryProfiles),
    ]));
}
