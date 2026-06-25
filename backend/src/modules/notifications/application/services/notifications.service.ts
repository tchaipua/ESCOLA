import { Injectable, NotFoundException } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { PrismaService } from "../../../../prisma/prisma.service";
import { getTenantContext } from "../../../../common/tenant/tenant.context";
import type { ICurrentUser } from "../../../../common/decorators/current-user.decorator";
import { ListMyNotificationsDto } from "../dto/list-my-notifications.dto";
import { DEFAULT_BRANCH_CODE } from "../../../../common/tenant/branch.constants";

type RecipientType = "USER" | "TEACHER" | "STUDENT" | "GUARDIAN";

type LessonEventNotificationPayload = {
  lessonEvent: {
    id: string;
    eventType: string;
    title: string;
    description?: string | null;
    notifyStudents: boolean;
    notifyGuardians: boolean;
    notifyByEmail: boolean;
    notifyByTelegram: boolean;
  };
  lessonItem: {
    id?: string | null;
    lessonDate: Date;
    startTime?: string | null;
    endTime?: string | null;
    schoolYearId: string;
    seriesClassId: string;
    subjectName?: string | null;
    teacherName?: string | null;
    shift?: string | null;
    teacherSubject: {
      subject?: { name?: string | null } | null;
      teacher?: { name?: string | null } | null;
    };
    seriesClass: {
      series?: { name?: string | null } | null;
      class?: { name?: string | null } | null;
    };
  };
  action: "CREATE" | "UPDATE";
};

type NotificationRecipient = {
  recipientType: RecipientType;
  recipientId: string;
  name: string;
  email?: string | null;
  telegramChatId?: string | null;
  studentId?: string;
  studentName?: string;
  score?: number;
  remarks?: string | null;
};

type AssessmentGradeNotificationPayload = {
  assessment: {
    id: string;
    assessmentType: string;
    title: string;
    description?: string | null;
    maxScore?: number | null;
    notifyStudents: boolean;
    notifyGuardians: boolean;
    notifyByEmail: boolean;
  };
  lessonItem: {
    id: string;
    lessonDate: Date;
    startTime: string;
    endTime: string;
    schoolYearId: string;
    seriesClassId: string;
    teacherSubject: {
      subject?: { name?: string | null } | null;
      teacher?: { name?: string | null } | null;
    };
    seriesClass: {
      series?: { name?: string | null } | null;
      class?: { name?: string | null } | null;
    };
  };
  gradedStudents: Array<{
    studentId: string;
    score: number;
    remarks?: string | null;
  }>;
};

type AttendanceNotificationPayload = {
  attendance: {
    lessonCalendarItemId: string;
    notifyStudents: boolean;
    notifyGuardians: boolean;
  };
  lessonItem: {
    id: string;
    lessonDate: Date;
    startTime: string;
    endTime: string;
    schoolYearId: string;
    seriesClassId: string;
    teacherSubject: {
      subject?: { name?: string | null } | null;
      teacher?: { name?: string | null } | null;
    };
    seriesClass: {
      series?: { name?: string | null } | null;
      class?: { name?: string | null } | null;
    };
  };
  attendanceStudents: Array<{
    studentId: string;
    status: string;
    notes?: string | null;
  }>;
};

type SmtpConfiguration = {
  id: string;
  name: string;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpTimeout?: number | null;
  smtpAuthenticate?: boolean | null;
  smtpSecure?: boolean | null;
  smtpEmail?: string | null;
  smtpPassword?: string | null;
};

type EmailSendResult = {
  sent: boolean;
  count: number;
};

type TelegramConfiguration = {
  id: string;
  name: string;
  telegramEnabled?: boolean | null;
  telegramBotToken?: string | null;
  telegramBotUsername?: string | null;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantId() {
    return getTenantContext()!.tenantId;
  }

  private userId() {
    return getTenantContext()!.userId;
  }

  private branchCode() {
    return getTenantContext()?.branchCode;
  }

  private hasSmtpInformation(config?: Partial<SmtpConfiguration> | null) {
    return !!(
      config?.smtpHost ||
      config?.smtpPort ||
      config?.smtpTimeout ||
      config?.smtpEmail ||
      config?.smtpPassword
    );
  }

  private parseEnvBoolean(value: string | undefined, defaultValue: boolean) {
    if (value === undefined || value === null || value.trim() === "") {
      return defaultValue;
    }
    const normalized = value.trim().toLowerCase();
    return (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "yes" ||
      normalized === "sim"
    );
  }

  private parseEnvInteger(value: string | undefined) {
    if (value === undefined || value === null || value.trim() === "") {
      return null;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }

  private buildEnvSmtpConfiguration(
    tenant: { id: string; name: string } | null,
  ): SmtpConfiguration | null {
    const smtpHost = process.env.SMTP_HOST?.trim() || "";
    const smtpPort = this.parseEnvInteger(process.env.SMTP_PORT);
    const smtpEmail = process.env.SMTP_EMAIL?.trim() || "";

    if (!tenant || !smtpHost || !smtpPort || !smtpEmail) {
      return null;
    }

    const smtpPassword = process.env.SMTP_PASSWORD?.trim() || null;
    return {
      id: tenant.id,
      name: tenant.name,
      smtpHost,
      smtpPort,
      smtpTimeout: this.parseEnvInteger(process.env.SMTP_TIMEOUT) || 60,
      smtpAuthenticate: this.parseEnvBoolean(
        process.env.SMTP_AUTHENTICATE,
        !!smtpPassword,
      ),
      smtpSecure: this.parseEnvBoolean(
        process.env.SMTP_SECURE,
        smtpPort === 465,
      ),
      smtpEmail,
      smtpPassword,
    };
  }

  private hasTelegramInformation(
    config?: Partial<TelegramConfiguration> | null,
  ) {
    return !!(
      config?.telegramBotToken ||
      config?.telegramBotUsername ||
      config?.telegramEnabled !== undefined
    );
  }

  private normalizeText(value: string) {
    return String(value || "")
      .trim()
      .toUpperCase();
  }

  private formatDate(value: Date) {
    const date = new Date(value);
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  private formatScore(value: number) {
    return new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }

  private getRecipientForCurrentUser(currentUser: ICurrentUser): {
    recipientType: RecipientType;
    recipientId: string;
  } {
    switch (currentUser.role) {
      case "PROFESSOR":
        return { recipientType: "TEACHER", recipientId: currentUser.userId };
      case "ALUNO":
        return { recipientType: "STUDENT", recipientId: currentUser.userId };
      case "RESPONSAVEL":
        return { recipientType: "GUARDIAN", recipientId: currentUser.userId };
      default:
        return { recipientType: "USER", recipientId: currentUser.userId };
    }
  }

  private getEventTypeLabel(value: string) {
    switch (
      String(value || "")
        .trim()
        .toUpperCase()
    ) {
      case "PROVA":
        return "PROVA";
      case "TRABALHO":
        return "TRABALHO";
      case "RECADO":
        return "RECADO";
      case "FALTA_PROFESSOR":
        return "FALTA DO PROFESSOR";
      default:
        return String(value || "EVENTO")
          .trim()
          .toUpperCase();
    }
  }

  private async getTenantSmtpConfiguration(): Promise<SmtpConfiguration | null> {
    const branchCode = this.branchCode();
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: this.tenantId(),
        canceledAt: null,
      },
      select: {
        id: true,
        name: true,
        smtpHost: true,
        smtpPort: true,
        smtpTimeout: true,
        smtpAuthenticate: true,
        smtpSecure: true,
        smtpEmail: true,
        smtpPassword: true,
        branches:
          branchCode && branchCode >= DEFAULT_BRANCH_CODE
            ? {
                where: { branchCode, canceledAt: null },
                select: {
                  smtpHost: true,
                  smtpPort: true,
                  smtpTimeout: true,
                  smtpAuthenticate: true,
                  smtpSecure: true,
                  smtpEmail: true,
                  smtpPassword: true,
                },
                take: 1,
              }
            : false,
      },
    });

    if (!tenant) return null;

    const branch = tenant.branches?.[0];
    if (this.hasSmtpInformation(branch)) {
      return {
        id: tenant.id,
        name: tenant.name,
        smtpHost: branch.smtpHost,
        smtpPort: branch.smtpPort,
        smtpTimeout: branch.smtpTimeout,
        smtpAuthenticate: branch.smtpAuthenticate,
        smtpSecure: branch.smtpSecure,
        smtpEmail: branch.smtpEmail,
        smtpPassword: branch.smtpPassword,
      };
    }

    const { branches: _branches, ...tenantSmtp } = tenant;
    if (tenantSmtp.smtpHost && tenantSmtp.smtpPort && tenantSmtp.smtpEmail) {
      return tenantSmtp;
    }

    return this.buildEnvSmtpConfiguration(tenant) || tenantSmtp;
  }

  private async getTenantTelegramConfiguration(): Promise<TelegramConfiguration | null> {
    const branchCode = this.branchCode();
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: this.tenantId(),
        canceledAt: null,
      },
      select: {
        id: true,
        name: true,
        telegramEnabled: true,
        telegramBotToken: true,
        telegramBotUsername: true,
        branches:
          branchCode && branchCode >= DEFAULT_BRANCH_CODE
            ? {
                where: { branchCode, canceledAt: null, isActive: true },
                select: {
                  telegramEnabled: true,
                  telegramBotToken: true,
                  telegramBotUsername: true,
                },
                take: 1,
              }
            : false,
      },
    });

    if (!tenant) return null;

    const branch = tenant.branches?.[0];
    if (this.hasTelegramInformation(branch)) {
      return {
        id: tenant.id,
        name: tenant.name,
        telegramEnabled: branch.telegramEnabled,
        telegramBotToken: branch.telegramBotToken,
        telegramBotUsername: branch.telegramBotUsername,
      };
    }

    if (tenant.telegramEnabled && tenant.telegramBotToken) {
      const { branches: _branches, ...tenantTelegram } = tenant;
      return tenantTelegram;
    }

    if (process.env.TELEGRAM_BOT_TOKEN) {
      return {
        id: tenant.id,
        name: tenant.name,
        telegramEnabled: true,
        telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
        telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || null,
      };
    }

    return null;
  }

  private buildNotificationTitle(payload: LessonEventNotificationPayload) {
    return this.normalizeText(
      `${payload.action === "UPDATE" ? "ATUALIZAÇÃO" : "NOVO AVISO"}: ${this.getEventTypeLabel(payload.lessonEvent.eventType)}`,
    );
  }

  private buildNotificationMessage(payload: LessonEventNotificationPayload) {
    const seriesName =
      payload.lessonItem.seriesClass?.series?.name || "SEM SÉRIE";
    const className =
      payload.lessonItem.seriesClass?.class?.name || "SEM TURMA";
    const subjectName =
      payload.lessonItem.teacherSubject?.subject?.name ||
      payload.lessonItem.subjectName ||
      "DISCIPLINA";
    const teacherName =
      payload.lessonItem.teacherSubject?.teacher?.name ||
      payload.lessonItem.teacherName ||
      "PROFESSOR";
    const timeRange =
      payload.lessonItem.startTime && payload.lessonItem.endTime
        ? ` DAS ${payload.lessonItem.startTime} ÀS ${payload.lessonItem.endTime}`
        : "";
    const base = `${this.getEventTypeLabel(payload.lessonEvent.eventType)} EM ${subjectName} NO DIA ${this.formatDate(payload.lessonItem.lessonDate)}${timeRange} PARA ${seriesName} - ${className}.`;
    const detail = payload.lessonEvent.description
      ? ` ${payload.lessonEvent.description}`
      : "";
    return this.normalizeText(
      `${base}${detail} PROFESSOR RESPONSÁVEL: ${teacherName}.`,
    );
  }

  private getOptedInTelegramChatId(contact?: {
    telegramChatId?: string | null;
    telegramOptInAt?: Date | null;
    telegramOptOutAt?: Date | null;
  } | null) {
    if (!contact?.telegramChatId) return null;
    if (!contact.telegramOptInAt || contact.telegramOptOutAt) return null;
    return contact.telegramChatId;
  }

  private async buildRecipients(
    payload: LessonEventNotificationPayload,
  ): Promise<NotificationRecipient[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        tenantId: this.tenantId(),
        schoolYearId: payload.lessonItem.schoolYearId,
        seriesClassId: payload.lessonItem.seriesClassId,
        status: "ATIVO",
        canceledAt: null,
        student: {
          canceledAt: null,
        },
      },
      include: {
        student: {
          include: {
            guardians: {
              where: {
                canceledAt: null,
                guardian: {
                  canceledAt: null,
                },
              },
              include: {
                guardian: true,
              },
            },
          },
        },
      },
    });

    const recipients = new Map<string, NotificationRecipient>();

    for (const enrollment of enrollments) {
      if (payload.lessonEvent.notifyStudents) {
        recipients.set(`STUDENT:${enrollment.student.id}`, {
          recipientType: "STUDENT",
          recipientId: enrollment.student.id,
          name: enrollment.student.name,
          email: enrollment.student.email,
          telegramChatId: this.getOptedInTelegramChatId(enrollment.student),
        });
      }

      if (payload.lessonEvent.notifyGuardians) {
        for (const link of enrollment.student.guardians) {
          if (!link.guardian) continue;
          recipients.set(`GUARDIAN:${link.guardian.id}`, {
            recipientType: "GUARDIAN",
            recipientId: link.guardian.id,
            name: link.guardian.name,
            email: link.guardian.email,
            telegramChatId: this.getOptedInTelegramChatId(link.guardian),
          });
        }
      }
    }

    return Array.from(recipients.values());
  }

  private async buildAssessmentRecipients(
    payload: AssessmentGradeNotificationPayload,
  ): Promise<NotificationRecipient[]> {
    const validStudentIds = payload.gradedStudents.map(
      (student) => student.studentId,
    );
    if (validStudentIds.length === 0) {
      return [];
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        tenantId: this.tenantId(),
        schoolYearId: payload.lessonItem.schoolYearId,
        seriesClassId: payload.lessonItem.seriesClassId,
        studentId: { in: validStudentIds },
        status: "ATIVO",
        canceledAt: null,
        student: {
          canceledAt: null,
        },
      },
      include: {
        student: {
          include: {
            guardians: {
              where: {
                canceledAt: null,
                guardian: {
                  canceledAt: null,
                },
              },
              include: {
                guardian: true,
              },
            },
          },
        },
      },
    });

    const recipients = new Map<string, NotificationRecipient>();
    for (const enrollment of enrollments) {
      const grade = payload.gradedStudents.find(
        (student) => student.studentId === enrollment.student.id,
      );

      if (payload.assessment.notifyStudents) {
        recipients.set(`STUDENT:${enrollment.student.id}`, {
          recipientType: "STUDENT",
          recipientId: enrollment.student.id,
          name: enrollment.student.name,
          email: enrollment.student.email,
          studentId: enrollment.student.id,
          studentName: enrollment.student.name,
          score: grade?.score,
          remarks: grade?.remarks,
        });
      }

      if (payload.assessment.notifyGuardians) {
        for (const link of enrollment.student.guardians) {
          if (!link.guardian) continue;
          recipients.set(`GUARDIAN:${link.guardian.id}`, {
            recipientType: "GUARDIAN",
            recipientId: link.guardian.id,
            name: link.guardian.name,
            email: link.guardian.email,
            studentId: enrollment.student.id,
            studentName: enrollment.student.name,
            score: grade?.score,
            remarks: grade?.remarks,
          });
        }
      }
    }

    return Array.from(recipients.values());
  }

  private async sendEmailNotifications(
    recipients: NotificationRecipient[],
    payload: LessonEventNotificationPayload,
  ): Promise<EmailSendResult> {
    if (!payload.lessonEvent.notifyByEmail) {
      return { sent: false, count: 0 };
    }

    const tenant = await this.getTenantSmtpConfiguration();
    if (!tenant?.smtpHost || !tenant.smtpPort || !tenant.smtpEmail) {
      return { sent: false, count: 0 };
    }

    if (tenant.smtpAuthenticate && !tenant.smtpPassword) {
      return { sent: false, count: 0 };
    }

    const transporter = nodemailer.createTransport({
      host: tenant.smtpHost,
      port: tenant.smtpPort,
      secure: tenant.smtpSecure || false,
      connectionTimeout: (tenant.smtpTimeout || 60) * 1000,
      auth: tenant.smtpAuthenticate
        ? {
            user: tenant.smtpEmail,
            pass: tenant.smtpPassword || "",
          }
        : undefined,
    });

    const subjectName =
      payload.lessonItem.teacherSubject?.subject?.name ||
      payload.lessonItem.subjectName ||
      "DISCIPLINA NÃO INFORMADA";
    const subject = `${this.getEventTypeLabel(payload.lessonEvent.eventType)} - ${subjectName}`;
    const timeLabel =
      payload.lessonItem.startTime && payload.lessonItem.endTime
        ? `${payload.lessonItem.startTime} às ${payload.lessonItem.endTime}`
        : "Sem horário vinculado";
    const textBody = [
      `${payload.action === "UPDATE" ? "Houve uma atualização" : "Foi lançado um novo aviso"} na agenda escolar.`,
      `Tipo: ${this.getEventTypeLabel(payload.lessonEvent.eventType)}`,
      `Data: ${this.formatDate(payload.lessonItem.lessonDate)}`,
      `Horário: ${timeLabel}`,
      `Turma: ${payload.lessonItem.seriesClass?.series?.name || "SEM SÉRIE"} - ${payload.lessonItem.seriesClass?.class?.name || "SEM TURMA"}`,
      `Disciplina: ${subjectName}`,
      payload.lessonEvent.description
        ? `Detalhes: ${payload.lessonEvent.description}`
        : null,
      "Acesse o sistema para acompanhar mais detalhes.",
    ]
      .filter(Boolean)
      .join("\n");

    const sendableRecipients = recipients.filter((recipient) =>
      recipient.email?.trim(),
    );

    if (sendableRecipients.length === 0) {
      return { sent: false, count: 0 };
    }

    const results = await Promise.all(
      sendableRecipients.map(async (recipient) => {
        try {
          await transporter.sendMail({
            from: `"${tenant.name}" <${tenant.smtpEmail}>`,
            to: recipient.email!,
            replyTo: tenant.smtpEmail || undefined,
            subject,
            text: textBody,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1e293b;">
                <h2 style="margin: 0 0 12px;">${payload.action === "UPDATE" ? "Atualização de agenda" : "Novo aviso na agenda escolar"}</h2>
                <p><strong>Tipo:</strong> ${this.getEventTypeLabel(payload.lessonEvent.eventType)}</p>
                <p><strong>Data:</strong> ${this.formatDate(payload.lessonItem.lessonDate)}</p>
                <p><strong>Horário:</strong> ${timeLabel}</p>
                <p><strong>Turma:</strong> ${payload.lessonItem.seriesClass?.series?.name || "SEM SÉRIE"} - ${payload.lessonItem.seriesClass?.class?.name || "SEM TURMA"}</p>
                <p><strong>Disciplina:</strong> ${subjectName}</p>
                ${
                  payload.lessonEvent.description
                    ? `<p><strong>Detalhes:</strong> ${payload.lessonEvent.description}</p>`
                    : ""
                }
                <p>Entre no sistema para acompanhar mais detalhes.</p>
              </div>
            `,
          });

          await this.prisma.notification.updateMany({
            where: {
              tenantId: this.tenantId(),
              recipientType: recipient.recipientType,
              recipientId: recipient.recipientId,
              sourceType: "LESSON_EVENT",
              sourceId: payload.lessonEvent.id,
              canceledAt: null,
            },
            data: {
              emailedAt: new Date(),
              updatedBy: this.userId(),
            },
          });

          return true;
        } catch {
          return false;
        }
      }),
    );

    const count = results.filter(Boolean).length;
    return { sent: count > 0, count };
  }

  private async sendTelegramNotifications(
    recipients: NotificationRecipient[],
    payload: LessonEventNotificationPayload,
    title: string,
    message: string,
  ) {
    if (!payload.lessonEvent.notifyByTelegram) {
      return { sent: false, count: 0 };
    }

    const config = await this.getTenantTelegramConfiguration();
    if (
      !config?.telegramBotToken ||
      config.telegramEnabled === false
    ) {
      return { sent: false, count: 0 };
    }

    const sendableRecipients = recipients.filter((recipient) =>
      recipient.telegramChatId?.trim(),
    );
    if (sendableRecipients.length === 0) {
      return { sent: false, count: 0 };
    }

    const text = [
      title,
      "",
      message,
      "",
      "ACESSE O SISTEMA PARA ACOMPANHAR MAIS DETALHES.",
    ].join("\n");

    const results = await Promise.all(
      sendableRecipients.map(async (recipient) => {
        try {
          const response = await fetch(
            `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: recipient.telegramChatId,
                text,
              }),
            },
          );
          const responseBody = await response.json().catch(() => null);
          if (!response.ok || responseBody?.ok !== true) {
            throw new Error(
              responseBody?.description || "Falha no envio pelo Telegram.",
            );
          }

          await this.prisma.notification.updateMany({
            where: {
              tenantId: this.tenantId(),
              recipientType: recipient.recipientType,
              recipientId: recipient.recipientId,
              sourceType: "LESSON_EVENT",
              sourceId: payload.lessonEvent.id,
              canceledAt: null,
            },
            data: {
              telegramSentAt: new Date(),
              telegramStatus: "SENT",
              telegramError: null,
              updatedBy: this.userId(),
            },
          });

          return true;
        } catch (error) {
          await this.prisma.notification.updateMany({
            where: {
              tenantId: this.tenantId(),
              recipientType: recipient.recipientType,
              recipientId: recipient.recipientId,
              sourceType: "LESSON_EVENT",
              sourceId: payload.lessonEvent.id,
              canceledAt: null,
            },
            data: {
              telegramStatus: "FAILED",
              telegramError:
                error instanceof Error
                  ? error.message.slice(0, 500)
                  : "Falha no envio pelo Telegram.",
              updatedBy: this.userId(),
            },
          });

          return false;
        }
      }),
    );

    const count = results.filter(Boolean).length;
    return { sent: count > 0, count };
  }

  private buildAssessmentNotificationTitle(
    payload: AssessmentGradeNotificationPayload,
  ) {
    return this.normalizeText(
      `NOTA LANÇADA: ${payload.assessment.assessmentType}`,
    );
  }

  private buildAssessmentNotificationMessage(
    payload: AssessmentGradeNotificationPayload,
  ) {
    const seriesName =
      payload.lessonItem.seriesClass?.series?.name || "SEM SÉRIE";
    const className =
      payload.lessonItem.seriesClass?.class?.name || "SEM TURMA";
    const subjectName =
      payload.lessonItem.teacherSubject?.subject?.name || "DISCIPLINA";
    const teacherName =
      payload.lessonItem.teacherSubject?.teacher?.name || "PROFESSOR";
    const base = `NOTAS DISPONIBILIZADAS EM ${subjectName} NO DIA ${this.formatDate(payload.lessonItem.lessonDate)} DAS ${payload.lessonItem.startTime} ÀS ${payload.lessonItem.endTime} PARA ${seriesName} - ${className}.`;
    const detail = payload.assessment.description
      ? ` ${payload.assessment.description}`
      : "";
    return this.normalizeText(
      `${base}${detail} PROFESSOR RESPONSÁVEL: ${teacherName}.`,
    );
  }

  private buildAttendanceNotificationTitle(status: string) {
    return this.normalizeText(`CHAMADA REGISTRADA: ${status}`);
  }

  private buildAttendanceNotificationMessage(args: {
    payload: AttendanceNotificationPayload;
    recipientType: RecipientType;
    studentName: string;
    status: string;
    notes?: string | null;
  }) {
    const { payload, recipientType, studentName, status, notes } = args;
    const seriesName =
      payload.lessonItem.seriesClass?.series?.name || "SEM SÉRIE";
    const className =
      payload.lessonItem.seriesClass?.class?.name || "SEM TURMA";
    const subjectName =
      payload.lessonItem.teacherSubject?.subject?.name || "DISCIPLINA";
    const teacherName =
      payload.lessonItem.teacherSubject?.teacher?.name || "PROFESSOR";
    const studentLabel =
      recipientType === "STUDENT"
        ? "SUA PRESENÇA FOI REGISTRADA"
        : `A PRESENÇA DE ${studentName} FOI REGISTRADA`;
    const notesLabel = notes ? ` OBSERVAÇÃO: ${notes}.` : "";

    return this.normalizeText(
      `${studentLabel} COMO ${status} EM ${subjectName} NO DIA ${this.formatDate(payload.lessonItem.lessonDate)} DAS ${payload.lessonItem.startTime} ÀS ${payload.lessonItem.endTime} PARA ${seriesName} - ${className}. PROFESSOR RESPONSÁVEL: ${teacherName}.${notesLabel}`,
    );
  }

  private async sendAssessmentGradeEmails(
    recipients: NotificationRecipient[],
    payload: AssessmentGradeNotificationPayload,
  ) {
    if (!payload.assessment.notifyByEmail) {
      return false;
    }

    const tenant = await this.getTenantSmtpConfiguration();
    if (!tenant?.smtpHost || !tenant.smtpPort || !tenant.smtpEmail) {
      return false;
    }

    if (tenant.smtpAuthenticate && !tenant.smtpPassword) {
      return false;
    }

    const scoreByStudent = new Map(
      payload.gradedStudents.map((student) => [student.studentId, student]),
    );

    const transporter = nodemailer.createTransport({
      host: tenant.smtpHost,
      port: tenant.smtpPort,
      secure: tenant.smtpSecure || false,
      connectionTimeout: (tenant.smtpTimeout || 60) * 1000,
      auth: tenant.smtpAuthenticate
        ? {
            user: tenant.smtpEmail,
            pass: tenant.smtpPassword || "",
          }
        : undefined,
    });

    const subject = `NOTA DISPONÍVEL - ${payload.lessonItem.teacherSubject?.subject?.name || "DISCIPLINA"}`;

    await Promise.allSettled(
      recipients
        .filter((recipient) => recipient.email && recipient.email.trim())
        .map((recipient) => {
          let studentGrade:
            | { score: number; remarks?: string | null }
            | undefined;
          if (recipient.recipientType === "STUDENT") {
            studentGrade = scoreByStudent.get(recipient.recipientId);
          }

          const textBody = [
            `Uma nota foi lançada no sistema escolar.`,
            `Avaliação: ${payload.assessment.title}`,
            `Tipo: ${payload.assessment.assessmentType}`,
            `Data da aula: ${this.formatDate(payload.lessonItem.lessonDate)}`,
            `Horário: ${payload.lessonItem.startTime} às ${payload.lessonItem.endTime}`,
            `Turma: ${payload.lessonItem.seriesClass?.series?.name || "SEM SÉRIE"} - ${payload.lessonItem.seriesClass?.class?.name || "SEM TURMA"}`,
            `Disciplina: ${payload.lessonItem.teacherSubject?.subject?.name || "DISCIPLINA NÃO INFORMADA"}`,
            studentGrade
              ? `Nota lançada: ${this.formatScore(studentGrade.score)}${payload.assessment.maxScore ? ` / ${this.formatScore(payload.assessment.maxScore)}` : ""}`
              : "Entre no sistema para visualizar a nota do aluno.",
            studentGrade?.remarks
              ? `Observação: ${studentGrade.remarks}`
              : null,
            "Acesse o sistema para mais detalhes.",
          ]
            .filter(Boolean)
            .join("\n");

          return transporter.sendMail({
            from: `"${tenant.name}" <${tenant.smtpEmail}>`,
            to: recipient.email!,
            replyTo: tenant.smtpEmail || undefined,
            subject,
            text: textBody,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1e293b;">
                <h2 style="margin: 0 0 12px;">Nota disponibilizada</h2>
                <p><strong>Avaliação:</strong> ${payload.assessment.title}</p>
                <p><strong>Tipo:</strong> ${payload.assessment.assessmentType}</p>
                <p><strong>Data da aula:</strong> ${this.formatDate(payload.lessonItem.lessonDate)}</p>
                <p><strong>Horário:</strong> ${payload.lessonItem.startTime} às ${payload.lessonItem.endTime}</p>
                <p><strong>Turma:</strong> ${payload.lessonItem.seriesClass?.series?.name || "SEM SÉRIE"} - ${payload.lessonItem.seriesClass?.class?.name || "SEM TURMA"}</p>
                <p><strong>Disciplina:</strong> ${payload.lessonItem.teacherSubject?.subject?.name || "DISCIPLINA NÃO INFORMADA"}</p>
                ${
                  studentGrade
                    ? `<p><strong>Nota lançada:</strong> ${this.formatScore(studentGrade.score)}${payload.assessment.maxScore ? ` / ${this.formatScore(payload.assessment.maxScore)}` : ""}</p>`
                    : `<p>Entre no sistema para visualizar a nota do aluno.</p>`
                }
                ${
                  studentGrade?.remarks
                    ? `<p><strong>Observação:</strong> ${studentGrade.remarks}</p>`
                    : ""
                }
                <p>Acesse o sistema para mais detalhes.</p>
              </div>
            `,
          });
        }),
    );

    return true;
  }

  async dispatchLessonEventNotifications(
    payload: LessonEventNotificationPayload,
  ) {
    const recipients = await this.buildRecipients(payload);
    if (recipients.length === 0) {
      return {
        notificationsCreated: 0,
        emailSent: false,
        emailCount: 0,
        telegramSent: false,
        telegramCount: 0,
      };
    }

    const title = this.buildNotificationTitle(payload);
    const message = this.buildNotificationMessage(payload);

    await this.prisma.notification.createMany({
      data: recipients.map((recipient) => ({
        tenantId: this.tenantId(),
        recipientType: recipient.recipientType,
        recipientId: recipient.recipientId,
        category: "AGENDA_ESCOLAR",
        title,
        message,
        actionUrl: "/dashboard/notificacoes",
        sourceType: "LESSON_EVENT",
        sourceId: payload.lessonEvent.id,
        metadata: JSON.stringify({
          lessonCalendarItemId: payload.lessonItem.id,
          schoolYearId: payload.lessonItem.schoolYearId,
          seriesClassId: payload.lessonItem.seriesClassId,
          eventType: payload.lessonEvent.eventType,
          lessonDate: payload.lessonItem.lessonDate,
        }),
        createdBy: this.userId(),
        updatedBy: this.userId(),
      })),
    });

    const emailResult = await this.sendEmailNotifications(recipients, payload);
    const telegramResult = await this.sendTelegramNotifications(
      recipients,
      payload,
      title,
      message,
    );

    return {
      notificationsCreated: recipients.length,
      emailSent: emailResult.sent,
      emailCount: emailResult.count,
      telegramSent: telegramResult.sent,
      telegramCount: telegramResult.count,
    };
  }

  async dispatchAssessmentGradeNotifications(
    payload: AssessmentGradeNotificationPayload,
  ) {
    const recipients = await this.buildAssessmentRecipients(payload);
    if (recipients.length === 0) {
      return { notificationsCreated: 0, emailSent: false };
    }

    await this.prisma.notification.createMany({
      data: recipients.map((recipient) => ({
        tenantId: this.tenantId(),
        recipientType: recipient.recipientType,
        recipientId: recipient.recipientId,
        category: "AVALIACAO",
        title: this.buildAssessmentNotificationTitle(payload),
        message: this.buildAssessmentNotificationMessage(payload),
        actionUrl: "/dashboard/notificacoes",
        sourceType: "LESSON_ASSESSMENT",
        sourceId: payload.assessment.id,
        metadata: JSON.stringify({
          lessonCalendarItemId: payload.lessonItem.id,
          assessmentType: payload.assessment.assessmentType,
          lessonDate: payload.lessonItem.lessonDate,
          assessmentTitle: payload.assessment.title,
          subjectName: payload.lessonItem.teacherSubject?.subject?.name || null,
          teacherName: payload.lessonItem.teacherSubject?.teacher?.name || null,
          studentId: recipient.studentId || null,
          studentName: recipient.studentName || null,
          score: recipient.score ?? null,
          remarks: recipient.remarks || null,
          maxScore: payload.assessment.maxScore ?? null,
        }),
        createdBy: this.userId(),
        updatedBy: this.userId(),
      })),
    });

    const emailSent = await this.sendAssessmentGradeEmails(recipients, payload);

    return {
      notificationsCreated: recipients.length,
      emailSent,
    };
  }

  async dispatchAttendanceNotifications(
    payload: AttendanceNotificationPayload,
  ) {
    const validStudentIds = payload.attendanceStudents.map(
      (student) => student.studentId,
    );
    if (validStudentIds.length === 0) {
      return { notificationsCreated: 0 };
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        tenantId: this.tenantId(),
        schoolYearId: payload.lessonItem.schoolYearId,
        seriesClassId: payload.lessonItem.seriesClassId,
        studentId: { in: validStudentIds },
        status: "ATIVO",
        canceledAt: null,
        student: {
          canceledAt: null,
        },
      },
      include: {
        student: {
          include: {
            guardians: {
              where: {
                canceledAt: null,
                guardian: {
                  canceledAt: null,
                },
              },
              include: {
                guardian: true,
              },
            },
          },
        },
      },
    });

    const attendanceByStudent = new Map(
      payload.attendanceStudents.map((student) => [student.studentId, student]),
    );

    const notificationsToCreate: Array<{
      tenantId: string;
      recipientType: RecipientType;
      recipientId: string;
      category: string;
      title: string;
      message: string;
      actionUrl: string;
      sourceType: string;
      sourceId: string;
      metadata: string;
      createdBy: string;
      updatedBy: string;
    }> = [];

    for (const enrollment of enrollments) {
      const attendance = attendanceByStudent.get(enrollment.student.id);
      if (!attendance) continue;

      if (payload.attendance.notifyStudents) {
        notificationsToCreate.push({
          tenantId: this.tenantId(),
          recipientType: "STUDENT",
          recipientId: enrollment.student.id,
          category: "CHAMADA",
          title: this.buildAttendanceNotificationTitle(attendance.status),
          message: this.buildAttendanceNotificationMessage({
            payload,
            recipientType: "STUDENT",
            studentName: enrollment.student.name,
            status: attendance.status,
            notes: attendance.notes,
          }),
          actionUrl: "/dashboard/notificacoes",
          sourceType: "LESSON_ATTENDANCE",
          sourceId: payload.attendance.lessonCalendarItemId,
          metadata: JSON.stringify({
            lessonCalendarItemId: payload.lessonItem.id,
            schoolYearId: payload.lessonItem.schoolYearId,
            seriesClassId: payload.lessonItem.seriesClassId,
            studentId: enrollment.student.id,
            status: attendance.status,
            lessonDate: payload.lessonItem.lessonDate,
          }),
          createdBy: this.userId(),
          updatedBy: this.userId(),
        });
      }

      if (payload.attendance.notifyGuardians) {
        for (const link of enrollment.student.guardians) {
          if (!link.guardian) continue;

          notificationsToCreate.push({
            tenantId: this.tenantId(),
            recipientType: "GUARDIAN",
            recipientId: link.guardian.id,
            category: "CHAMADA",
            title: this.buildAttendanceNotificationTitle(attendance.status),
            message: this.buildAttendanceNotificationMessage({
              payload,
              recipientType: "GUARDIAN",
              studentName: enrollment.student.name,
              status: attendance.status,
              notes: attendance.notes,
            }),
            actionUrl: "/dashboard/notificacoes",
            sourceType: "LESSON_ATTENDANCE",
            sourceId: payload.attendance.lessonCalendarItemId,
            metadata: JSON.stringify({
              lessonCalendarItemId: payload.lessonItem.id,
              schoolYearId: payload.lessonItem.schoolYearId,
              seriesClassId: payload.lessonItem.seriesClassId,
              studentId: enrollment.student.id,
              guardianId: link.guardian.id,
              status: attendance.status,
              lessonDate: payload.lessonItem.lessonDate,
            }),
            createdBy: this.userId(),
            updatedBy: this.userId(),
          });
        }
      }
    }

    if (notificationsToCreate.length === 0) {
      return { notificationsCreated: 0 };
    }

    await this.prisma.notification.createMany({
      data: notificationsToCreate,
    });

    return {
      notificationsCreated: notificationsToCreate.length,
    };
  }

  async findMyNotifications(
    currentUser: ICurrentUser,
    query: ListMyNotificationsDto,
  ) {
    const { recipientId, recipientType } =
      this.getRecipientForCurrentUser(currentUser);
    const normalizedStatus = String(query.status || "ALL")
      .trim()
      .toUpperCase();

    return this.prisma.notification.findMany({
      where: {
        tenantId: currentUser.tenantId,
        recipientType,
        recipientId,
        canceledAt: null,
        ...(normalizedStatus === "UNREAD" ? { readAt: null } : {}),
        ...(normalizedStatus === "READ" ? { readAt: { not: null } } : {}),
      },
      orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    });
  }

  async getUnreadSummary(currentUser: ICurrentUser) {
    const { recipientId, recipientType } =
      this.getRecipientForCurrentUser(currentUser);

    const [count, preview] = await Promise.all([
      this.prisma.notification.count({
        where: {
          tenantId: currentUser.tenantId,
          recipientType,
          recipientId,
          canceledAt: null,
          readAt: null,
        },
      }),
      this.prisma.notification.findMany({
        where: {
          tenantId: currentUser.tenantId,
          recipientType,
          recipientId,
          canceledAt: null,
          readAt: null,
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
    ]);

    return { count, preview };
  }

  async markAsRead(id: string, currentUser: ICurrentUser) {
    const { recipientId, recipientType } =
      this.getRecipientForCurrentUser(currentUser);

    const notification = await this.prisma.notification.findFirst({
      where: {
        id,
        tenantId: currentUser.tenantId,
        recipientType,
        recipientId,
        canceledAt: null,
      },
    });

    if (!notification) {
      throw new NotFoundException("Notificação não encontrada.");
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        readAt: notification.readAt || new Date(),
        readBy: currentUser.userId,
        updatedBy: currentUser.userId,
      },
    });
  }

  async markAsUnread(id: string, currentUser: ICurrentUser) {
    const { recipientId, recipientType } =
      this.getRecipientForCurrentUser(currentUser);

    const notification = await this.prisma.notification.findFirst({
      where: {
        id,
        tenantId: currentUser.tenantId,
        recipientType,
        recipientId,
        canceledAt: null,
      },
    });

    if (!notification) {
      throw new NotFoundException("Notificação não encontrada.");
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        readAt: null,
        readBy: null,
        updatedBy: currentUser.userId,
      },
    });
  }

  async removeAttendanceNotification(id: string, currentUser: ICurrentUser) {
    const { recipientId, recipientType } =
      this.getRecipientForCurrentUser(currentUser);

    const notification = await this.prisma.notification.findFirst({
      where: {
        id,
        tenantId: currentUser.tenantId,
        recipientType,
        recipientId,
        canceledAt: null,
        category: "CHAMADA",
        readAt: { not: null },
      },
    });

    if (!notification) {
      throw new NotFoundException(
        "Somente notificações de presença visualizadas podem ser excluídas.",
      );
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        canceledAt: new Date(),
        canceledBy: currentUser.userId,
        updatedBy: currentUser.userId,
      },
    });
  }

  async markAllAsRead(currentUser: ICurrentUser) {
    const { recipientId, recipientType } =
      this.getRecipientForCurrentUser(currentUser);

    return this.prisma.notification.updateMany({
      where: {
        tenantId: currentUser.tenantId,
        recipientType,
        recipientId,
        canceledAt: null,
        readAt: null,
      },
      data: {
        readAt: new Date(),
        readBy: currentUser.userId,
        updatedBy: currentUser.userId,
      },
    });
  }

  async markBatchAsRead(ids: string[], currentUser: ICurrentUser) {
    const { recipientId, recipientType } =
      this.getRecipientForCurrentUser(currentUser);
    const uniqueIds = Array.from(
      new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)),
    );

    if (uniqueIds.length === 0) {
      return { updatedCount: 0 };
    }

    const result = await this.prisma.notification.updateMany({
      where: {
        id: { in: uniqueIds },
        tenantId: currentUser.tenantId,
        recipientType,
        recipientId,
        canceledAt: null,
        readAt: null,
      },
      data: {
        readAt: new Date(),
        readBy: currentUser.userId,
        updatedBy: currentUser.userId,
      },
    });

    return {
      updatedCount: result.count,
    };
  }
}
