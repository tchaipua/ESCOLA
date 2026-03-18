import {
  AVAILABLE_USER_PERMISSIONS,
  type UserPermission,
  getDefaultPermissionsForRole,
  normalizePermissions,
} from "./user-permissions";

export const ACCESS_PROFILE_DEFINITIONS = {
  ADMIN_TOTAL: {
    code: "ADMIN_TOTAL",
    role: "ADMIN",
    label: "ADMIN TOTAL",
    permissions: [...AVAILABLE_USER_PERMISSIONS],
  },
  SECRETARIA_PADRAO: {
    code: "SECRETARIA_PADRAO",
    role: "SECRETARIA",
    label: "SECRETARIA PADRAO",
    permissions: getDefaultPermissionsForRole("SECRETARIA"),
  },
  COORDENACAO_PEDAGOGICA: {
    code: "COORDENACAO_PEDAGOGICA",
    role: "COORDENACAO",
    label: "COORDENACAO PEDAGOGICA",
    permissions: getDefaultPermissionsForRole("COORDENACAO"),
  },
  PROFESSOR_PADRAO: {
    code: "PROFESSOR_PADRAO",
    role: "PROFESSOR",
    label: "PROFESSOR PADRAO",
    permissions: getDefaultPermissionsForRole("PROFESSOR"),
  },
  ALUNO_CONSULTA: {
    code: "ALUNO_CONSULTA",
    role: "ALUNO",
    label: "ALUNO CONSULTA",
    permissions: getDefaultPermissionsForRole("ALUNO"),
  },
  RESPONSAVEL_CONSULTA: {
    code: "RESPONSAVEL_CONSULTA",
    role: "RESPONSAVEL",
    label: "RESPONSAVEL CONSULTA",
    permissions: getDefaultPermissionsForRole("RESPONSAVEL"),
  },
} as const;

export type AccessProfileCode = keyof typeof ACCESS_PROFILE_DEFINITIONS;
export const COMPLEMENTARY_ACCESS_PROFILE_DEFINITIONS = {
  FINANCEIRO: {
    code: "FINANCEIRO",
    label: "FINANCEIRO",
    permissions: [
      "VIEW_STUDENTS",
      "VIEW_STUDENT_BASIC_DATA",
      "VIEW_STUDENT_CONTACT_DATA",
      "VIEW_STUDENT_FINANCIAL_DATA",
      "VIEW_STUDENT_SENSITIVE_DATA",
      "VIEW_GUARDIANS",
      "VIEW_GUARDIAN_BASIC_DATA",
      "VIEW_GUARDIAN_CONTACT_DATA",
      "VIEW_GUARDIAN_FINANCIAL_DATA",
      "VIEW_GUARDIAN_SENSITIVE_DATA",
      "VIEW_COMMUNICATION_CENTER",
      "MANAGE_COMMUNICATION_CENTER",
      "VIEW_TEACHERS",
      "VIEW_TEACHER_BASIC_DATA",
      "VIEW_TEACHER_FINANCIAL_DATA",
      "VIEW_TEACHER_SENSITIVE_DATA",
      "VIEW_FINANCIAL",
      "MANAGE_FINANCIAL",
      "ISSUE_BOLETOS",
      "MANAGE_MONTHLY_FEES",
    ],
  },
  CAIXA: {
    code: "CAIXA",
    label: "CAIXA",
    permissions: [
      "VIEW_STUDENTS",
      "VIEW_STUDENT_BASIC_DATA",
      "VIEW_STUDENT_CONTACT_DATA",
      "VIEW_STUDENT_FINANCIAL_DATA",
      "VIEW_GUARDIANS",
      "VIEW_GUARDIAN_BASIC_DATA",
      "VIEW_GUARDIAN_CONTACT_DATA",
      "VIEW_GUARDIAN_FINANCIAL_DATA",
      "VIEW_COMMUNICATION_CENTER",
      "VIEW_FINANCIAL",
      "VIEW_CASHIER",
      "RECEIVE_PAYMENTS",
      "SETTLE_RECEIVABLES",
      "CLOSE_CASHIER",
    ],
  },
} as const;

export type ComplementaryAccessProfileCode =
  keyof typeof COMPLEMENTARY_ACCESS_PROFILE_DEFINITIONS;

export function getDefaultAccessProfileForRole(
  role?: string | null,
): AccessProfileCode | null {
  const normalizedRole = String(role || "").trim().toUpperCase();

  switch (normalizedRole) {
    case "ADMIN":
      return "ADMIN_TOTAL";
    case "SECRETARIA":
      return "SECRETARIA_PADRAO";
    case "COORDENACAO":
      return "COORDENACAO_PEDAGOGICA";
    case "PROFESSOR":
      return "PROFESSOR_PADRAO";
    case "ALUNO":
      return "ALUNO_CONSULTA";
    case "RESPONSAVEL":
      return "RESPONSAVEL_CONSULTA";
    default:
      return null;
  }
}

export function normalizeAccessProfileCode(
  value?: string | null,
  role?: string | null,
): AccessProfileCode | null {
  const normalized = String(value || "").trim().toUpperCase() as
    | AccessProfileCode
    | "";

  if (normalized && normalized in ACCESS_PROFILE_DEFINITIONS) {
    const profile = ACCESS_PROFILE_DEFINITIONS[normalized];
    if (!role || profile.role === String(role).trim().toUpperCase()) {
      return normalized;
    }
  }

  return getDefaultAccessProfileForRole(role);
}

export function getAccessProfilePermissions(
  profileCode?: string | null,
): UserPermission[] {
  const normalized = normalizeAccessProfileCode(profileCode);
  if (!normalized) return [];
  return [...ACCESS_PROFILE_DEFINITIONS[normalized].permissions];
}

export function normalizeComplementaryAccessProfiles(
  input?: string | null | string[],
): ComplementaryAccessProfileCode[] {
  const raw: string[] = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.startsWith("[")
        ? (() => {
            try {
              return JSON.parse(input) as string[];
            } catch {
              return input.split(",");
            }
          })()
        : input.split(",")
      : [];

  const normalized = raw
    .map((item: string) =>
      String(item || "")
        .trim()
        .toUpperCase(),
    )
    .filter((item: string): item is ComplementaryAccessProfileCode =>
      item in COMPLEMENTARY_ACCESS_PROFILE_DEFINITIONS,
    );

  return Array.from(new Set(normalized));
}

export function serializeComplementaryAccessProfiles(
  input?: string | null | string[],
): string | null {
  const normalized = normalizeComplementaryAccessProfiles(input);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

export function getComplementaryProfilePermissions(
  profiles?: string | null | string[],
): UserPermission[] {
  const normalized = normalizeComplementaryAccessProfiles(profiles);
  const merged = normalized.flatMap(
    (profile) => COMPLEMENTARY_ACCESS_PROFILE_DEFINITIONS[profile].permissions,
  );

  return Array.from(new Set(merged));
}

export function resolveAccountPermissions(input: {
  role?: string | null;
  accessProfile?: string | null;
  complementaryProfiles?: string | null | string[];
  permissions?: string | null | string[];
}): UserPermission[] {
  const explicitPermissions = normalizePermissions(input.permissions);
  if (explicitPermissions.length > 0) {
    return explicitPermissions;
  }

  const normalizedProfile = normalizeAccessProfileCode(
    input.accessProfile,
    input.role,
  );
  if (normalizedProfile) {
    return Array.from(
      new Set([
        ...getAccessProfilePermissions(normalizedProfile),
        ...getComplementaryProfilePermissions(input.complementaryProfiles),
      ]),
    );
  }

  return Array.from(
    new Set([
      ...getDefaultPermissionsForRole(input.role),
      ...getComplementaryProfilePermissions(input.complementaryProfiles),
    ]),
  );
}
