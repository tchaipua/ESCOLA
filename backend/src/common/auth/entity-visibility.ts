import type { ICurrentUser } from "../decorators/current-user.decorator";

type Viewer = ICurrentUser | null | undefined;

function hasPermission(viewer: Viewer, permission: string) {
  return Boolean(
    viewer?.isMaster ||
    viewer?.role === "ADMIN" ||
    viewer?.permissions?.includes(permission),
  );
}

export function canViewStudentContactData(viewer: Viewer) {
  return hasPermission(viewer, "VIEW_STUDENT_CONTACT_DATA");
}

export function canViewStudentAcademicData(viewer: Viewer) {
  return hasPermission(viewer, "VIEW_STUDENT_ACADEMIC_DATA");
}

export function canViewStudentFinancialData(viewer: Viewer) {
  return hasPermission(viewer, "VIEW_STUDENT_FINANCIAL_DATA");
}

export function canViewStudentSensitiveData(viewer: Viewer) {
  return hasPermission(viewer, "VIEW_STUDENT_SENSITIVE_DATA");
}

export function canViewStudentAccessData(viewer: Viewer) {
  return hasPermission(viewer, "VIEW_STUDENT_ACCESS_DATA");
}

export function canViewTeacherContactData(viewer: Viewer) {
  return hasPermission(viewer, "VIEW_TEACHER_CONTACT_DATA");
}

export function canViewTeacherAcademicData(viewer: Viewer) {
  return hasPermission(viewer, "VIEW_TEACHER_ACADEMIC_DATA");
}

export function canViewTeacherFinancialData(viewer: Viewer) {
  return hasPermission(viewer, "VIEW_TEACHER_FINANCIAL_DATA");
}

export function canViewTeacherSensitiveData(viewer: Viewer) {
  return hasPermission(viewer, "VIEW_TEACHER_SENSITIVE_DATA");
}

export function canViewTeacherAccessData(viewer: Viewer) {
  return hasPermission(viewer, "VIEW_TEACHER_ACCESS_DATA");
}

export function canViewGuardianContactData(viewer: Viewer) {
  return hasPermission(viewer, "VIEW_GUARDIAN_CONTACT_DATA");
}

export function canViewGuardianSensitiveData(viewer: Viewer) {
  return hasPermission(viewer, "VIEW_GUARDIAN_SENSITIVE_DATA");
}

export function canViewGuardianAccessData(viewer: Viewer) {
  return hasPermission(viewer, "VIEW_GUARDIAN_ACCESS_DATA");
}

export function sanitizeGuardianSummaryForViewer<T extends Record<string, any>>(
  guardian: T,
  viewer: Viewer,
) {
  const result: Record<string, any> = { ...guardian };

  if (!canViewGuardianSensitiveData(viewer)) {
    result.cpf = null;
    result.rg = null;
    result.cnpj = null;
  }

  if (!canViewGuardianContactData(viewer)) {
    result.phone = null;
    result.whatsapp = null;
    result.cellphone1 = null;
    result.cellphone2 = null;
    result.zipCode = null;
    result.street = null;
    result.number = null;
    result.city = null;
    result.state = null;
    result.neighborhood = null;
    result.complement = null;
  }

  if (!canViewGuardianAccessData(viewer)) {
    result.email = null;
    result.accessProfile = null;
    result.permissions = [];
  }

  return result as T;
}

export function sanitizeStudentForViewer<T extends Record<string, any>>(
  student: T,
  viewer: Viewer,
) {
  const result: Record<string, any> = { ...student };

  if (!canViewStudentSensitiveData(viewer)) {
    result.cpf = null;
    result.rg = null;
    result.cnpj = null;
  }

  if (!canViewStudentContactData(viewer)) {
    result.phone = null;
    result.whatsapp = null;
    result.cellphone1 = null;
    result.cellphone2 = null;
    result.zipCode = null;
    result.street = null;
    result.number = null;
    result.city = null;
    result.state = null;
    result.neighborhood = null;
    result.complement = null;
  }

  if (!canViewStudentFinancialData(viewer)) {
    result.monthlyFee = null;
    result.billingPayerType = null;
    result.billingGuardianId = null;
    result.billingGuardian = null;
  } else if (result.billingGuardian) {
    result.billingGuardian = sanitizeGuardianSummaryForViewer(
      result.billingGuardian,
      viewer,
    );
  }

  if (!canViewStudentAccessData(viewer)) {
    result.email = null;
    result.accessProfile = null;
    result.permissions = [];
  }

  if (!canViewStudentAcademicData(viewer)) {
    result.enrollments = [];
    result.notes = null;
  }

  if (Array.isArray(result.guardians)) {
    result.guardians = result.guardians.map((link: any) => ({
      ...link,
      guardian: link?.guardian
        ? sanitizeGuardianSummaryForViewer(link.guardian, viewer)
        : link?.guardian,
    }));
  }

  return result as T;
}

export function sanitizeTeacherForViewer<T extends Record<string, any>>(
  teacher: T,
  viewer: Viewer,
) {
  const result: Record<string, any> = { ...teacher };

  if (!canViewTeacherSensitiveData(viewer)) {
    result.cpf = null;
    result.rg = null;
    result.cnpj = null;
  }

  if (!canViewTeacherContactData(viewer)) {
    result.phone = null;
    result.whatsapp = null;
    result.cellphone1 = null;
    result.cellphone2 = null;
    result.zipCode = null;
    result.street = null;
    result.number = null;
    result.city = null;
    result.state = null;
    result.neighborhood = null;
    result.complement = null;
  }

  if (!canViewTeacherAccessData(viewer)) {
    result.email = null;
    result.accessProfile = null;
    result.permissions = [];
  }

  if (!canViewTeacherAcademicData(viewer)) {
    result.teacherSubjects = [];
  } else if (!canViewTeacherFinancialData(viewer)) {
    result.teacherSubjects = Array.isArray(result.teacherSubjects)
      ? result.teacherSubjects.map((assignment: any) => ({
          ...assignment,
          hourlyRate: null,
          rateHistories: [],
        }))
      : [];
  }

  return result as T;
}
