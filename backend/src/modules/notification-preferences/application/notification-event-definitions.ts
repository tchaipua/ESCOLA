export const NOTIFICATION_EVENT_DEFINITIONS = [
  { eventType: "USER_INACTIVATED", label: "USUÁRIO DE ACESSO INATIVADO", group: "CADASTROS" },
  { eventType: "TEACHER_INACTIVATED", label: "PROFESSOR INATIVADO", group: "CADASTROS" },
  { eventType: "STUDENT_INACTIVATED", label: "ALUNO INATIVADO", group: "CADASTROS" },
  { eventType: "GUARDIAN_INACTIVATED", label: "RESPONSÁVEL INATIVADO", group: "CADASTROS" },
  { eventType: "SUBJECT_INACTIVATED", label: "DISCIPLINA INATIVADA", group: "ESTRUTURA" },
  { eventType: "SERIES_INACTIVATED", label: "SÉRIE INATIVADA", group: "ESTRUTURA" },
  { eventType: "CLASS_INACTIVATED", label: "TURMA INATIVADA", group: "ESTRUTURA" },
  { eventType: "SERIES_CLASS_INACTIVATED", label: "VÍNCULO SÉRIE X TURMA INATIVADO", group: "ESTRUTURA" },
  { eventType: "SCHEDULE_ITEM_INACTIVATED", label: "ITEM DA GRADE INATIVADO", group: "ESTRUTURA" },
  { eventType: "SCHEDULE_INACTIVATED", label: "HORÁRIO BASE INATIVADO", group: "ESTRUTURA" },
  { eventType: "LESSON_CALENDAR_INACTIVATED", label: "GRADE ANUAL INATIVADA", group: "ESTRUTURA" },
  { eventType: "SCHOOL_YEAR_DEACTIVATED", label: "ANO LETIVO DESATIVADO", group: "ANO LETIVO" },
  { eventType: "SCHOOL_YEAR_CANCELED", label: "ANO LETIVO CANCELADO", group: "ANO LETIVO" },
  { eventType: "ENROLLMENT_CANCELED", label: "MATRÍCULA CANCELADA", group: "VÍNCULOS" },
  { eventType: "ENROLLMENT_TRANSFERRED", label: "MATRÍCULA TRANSFERIDA", group: "VÍNCULOS" },
  { eventType: "TEACHER_SUBJECT_UNASSIGNED", label: "DISCIPLINA REMOVIDA DO PROFESSOR", group: "VÍNCULOS" },
  { eventType: "GUARDIAN_STUDENT_UNLINKED", label: "RESPONSÁVEL DESVINCULADO DO ALUNO", group: "VÍNCULOS" },
  { eventType: "LESSON_EVENT_CANCELED", label: "AVISO DA AGENDA CANCELADO", group: "AGENDA" },
  { eventType: "SCHOOL_HOLIDAY_CANCELED", label: "FERIADO ESCOLAR CANCELADO", group: "ANO LETIVO" },
] as const;

export const NOTIFICATION_EVENT_TYPES = NOTIFICATION_EVENT_DEFINITIONS.map(
  (item) => item.eventType,
);

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export function isNotificationEventType(value: string): value is NotificationEventType {
  return (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value);
}
