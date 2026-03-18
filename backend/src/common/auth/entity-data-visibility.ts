import { ICurrentUser } from "../decorators/current-user.decorator";

function canSee(user: ICurrentUser, permission: string) {
  return (
    user.isMaster === true ||
    user.role === "ADMIN" ||
    user.permissions.includes(permission)
  );
}

function compactObject<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

export function canViewStudentBasicData(user: ICurrentUser) {
  return canSee(user, "VIEW_STUDENT_BASIC_DATA");
}

export function canViewStudentContactData(user: ICurrentUser) {
  return canSee(user, "VIEW_STUDENT_CONTACT_DATA");
}

export function canViewStudentAcademicData(user: ICurrentUser) {
  return canSee(user, "VIEW_STUDENT_ACADEMIC_DATA");
}

export function canViewStudentFinancialData(user: ICurrentUser) {
  return (
    canSee(user, "VIEW_STUDENT_FINANCIAL_DATA") ||
    canSee(user, "VIEW_FINANCIAL")
  );
}

export function canViewStudentSensitiveData(user: ICurrentUser) {
  return canSee(user, "VIEW_STUDENT_SENSITIVE_DATA");
}

export function canViewStudentAccessData(user: ICurrentUser) {
  return canSee(user, "VIEW_STUDENT_ACCESS_DATA");
}

export function canViewTeacherBasicData(user: ICurrentUser) {
  return canSee(user, "VIEW_TEACHER_BASIC_DATA");
}

export function canViewTeacherContactData(user: ICurrentUser) {
  return canSee(user, "VIEW_TEACHER_CONTACT_DATA");
}

export function canViewTeacherAcademicData(user: ICurrentUser) {
  return canSee(user, "VIEW_TEACHER_ACADEMIC_DATA");
}

export function canViewTeacherFinancialData(user: ICurrentUser) {
  return (
    canSee(user, "VIEW_TEACHER_FINANCIAL_DATA") ||
    canSee(user, "VIEW_FINANCIAL")
  );
}

export function canViewTeacherSensitiveData(user: ICurrentUser) {
  return canSee(user, "VIEW_TEACHER_SENSITIVE_DATA");
}

export function canViewTeacherAccessData(user: ICurrentUser) {
  return canSee(user, "VIEW_TEACHER_ACCESS_DATA");
}

export function canViewGuardianBasicData(user: ICurrentUser) {
  return canSee(user, "VIEW_GUARDIAN_BASIC_DATA");
}

export function canViewGuardianContactData(user: ICurrentUser) {
  return canSee(user, "VIEW_GUARDIAN_CONTACT_DATA");
}

export function canViewGuardianFinancialData(user: ICurrentUser) {
  return (
    canSee(user, "VIEW_GUARDIAN_FINANCIAL_DATA") ||
    canSee(user, "VIEW_FINANCIAL")
  );
}

export function canViewGuardianSensitiveData(user: ICurrentUser) {
  return canSee(user, "VIEW_GUARDIAN_SENSITIVE_DATA");
}

export function canViewGuardianAccessData(user: ICurrentUser) {
  return canSee(user, "VIEW_GUARDIAN_ACCESS_DATA");
}

export function sanitizeStudentForViewer<T extends Record<string, any>>(
  student: T,
  viewer: ICurrentUser,
) {
  const sanitized = { ...student } as Record<string, any>;

  if (!canViewStudentContactData(viewer)) {
    sanitized.phone = null;
    sanitized.whatsapp = null;
    sanitized.cellphone1 = null;
    sanitized.cellphone2 = null;
    sanitized.zipCode = null;
    sanitized.street = null;
    sanitized.number = null;
    sanitized.city = null;
    sanitized.state = null;
    sanitized.neighborhood = null;
    sanitized.complement = null;
  }

  if (!canViewStudentAcademicData(viewer)) {
    sanitized.notes = null;
    sanitized.enrollments = [];
    sanitized.guardians = [];
  }

  if (!canViewStudentFinancialData(viewer)) {
    sanitized.monthlyFee = null;
  }

  if (!canViewStudentSensitiveData(viewer)) {
    sanitized.cpf = null;
    sanitized.rg = null;
    sanitized.cnpj = null;
  }

  if (!canViewStudentAccessData(viewer)) {
    sanitized.email = null;
    sanitized.accessProfile = null;
    sanitized.permissions = [];
  }

  return compactObject(sanitized) as T;
}

export function sanitizeTeacherForViewer<T extends Record<string, any>>(
  teacher: T,
  viewer: ICurrentUser,
) {
  const sanitized = { ...teacher } as Record<string, any>;

  if (!canViewTeacherContactData(viewer)) {
    sanitized.phone = null;
    sanitized.whatsapp = null;
    sanitized.cellphone1 = null;
    sanitized.cellphone2 = null;
    sanitized.zipCode = null;
    sanitized.street = null;
    sanitized.number = null;
    sanitized.city = null;
    sanitized.state = null;
    sanitized.neighborhood = null;
    sanitized.complement = null;
  }

  if (!canViewTeacherAcademicData(viewer)) {
    sanitized.teacherSubjects = [];
  } else if (
    Array.isArray(sanitized.teacherSubjects) &&
    !canViewTeacherFinancialData(viewer)
  ) {
    sanitized.teacherSubjects = sanitized.teacherSubjects.map(
      (assignment: Record<string, any>) => ({
        ...assignment,
        hourlyRate: null,
      }),
    );
  }

  if (!canViewTeacherSensitiveData(viewer)) {
    sanitized.cpf = null;
    sanitized.rg = null;
    sanitized.cnpj = null;
  }

  if (!canViewTeacherAccessData(viewer)) {
    sanitized.email = null;
    sanitized.accessProfile = null;
    sanitized.permissions = [];
  }

  return compactObject(sanitized) as T;
}

export function sanitizeGuardianForViewer<T extends Record<string, any>>(
  guardian: T,
  viewer: ICurrentUser,
) {
  const sanitized = { ...guardian } as Record<string, any>;

  if (!canViewGuardianContactData(viewer)) {
    sanitized.phone = null;
    sanitized.whatsapp = null;
    sanitized.cellphone1 = null;
    sanitized.cellphone2 = null;
    sanitized.zipCode = null;
    sanitized.street = null;
    sanitized.number = null;
    sanitized.city = null;
    sanitized.state = null;
    sanitized.neighborhood = null;
    sanitized.complement = null;
  }

  if (!canViewGuardianSensitiveData(viewer)) {
    sanitized.cpf = null;
    sanitized.rg = null;
    sanitized.cnpj = null;
  }

  if (!canViewGuardianAccessData(viewer)) {
    sanitized.email = null;
    sanitized.accessProfile = null;
    sanitized.permissions = [];
  }

  return compactObject(sanitized) as T;
}
