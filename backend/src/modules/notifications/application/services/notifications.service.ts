import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { PrismaService } from "../../../../prisma/prisma.service";
import { getTenantContext } from "../../../../common/tenant/tenant.context";
import type { ICurrentUser } from "../../../../common/decorators/current-user.decorator";
import { ListMyNotificationsDto } from "../dto/list-my-notifications.dto";
import { DEFAULT_BRANCH_CODE } from "../../../../common/tenant/branch.constants";
import { CentralTenantConfigurationService } from "../../../../integrations/msinfor-central/central-tenant-configuration.service";
import type { NotificationEventType } from "../../../notification-preferences/application/notification-event-definitions";

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
      teacher?: {
        name?: string | null;
        person?: { name?: string | null } | null;
      } | null;
    };
    seriesClass: {
      series?: { name?: string | null } | null;
      class?: { name?: string | null } | null;
    };
  };
  action: "CREATE" | "UPDATE" | "DELETE";
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
      teacher?: {
        name?: string | null;
        person?: { name?: string | null } | null;
      } | null;
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
      teacher?: {
        name?: string | null;
        person?: { name?: string | null } | null;
      } | null;
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
  smtpAuthType?: string | null;
  smtpEmail?: string | null;
  smtpPassword?: string | null;
  smtpSenderName?: string | null;
  smtpReplyTo?: string | null;
};

type EmailSendResult = {
  sent: boolean;
  count: number;
};

const TEMPORARY_EMAIL_RECIPIENT_ALLOWLIST = ["TCHAIPUA@GMAIL.COM"];
const EMAIL_SEND_INTERVAL_MS = 15000;

type TelegramConfiguration = {
  id: string;
  name: string;
  telegramEnabled?: boolean | null;
  telegramBotToken?: string | null;
  telegramBotUsername?: string | null;
};

type ConfiguredEventNotificationPayload = {
  eventType: NotificationEventType;
  title: string;
  message: string;
  sourceType?: string;
  sourceId?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
};

type ConfiguredEventRecipient = NotificationRecipient & {
  personId: string;
  sendInternal: boolean;
  sendEmail: boolean;
  sendTelegram: boolean;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly centralConfiguration: CentralTenantConfigurationService,
  ) {}

  private tenantId() {
    return getTenantContext()!.tenantId;
  }

  private userId() {
    return getTenantContext()!.userId;
  }

  private branchCode() {
    return getTenantContext()?.branchCode;
  }

  private normalizeText(value: string) {
    return String(value || "")
      .trim()
      .toUpperCase();
  }

  private isTemporarilyAllowedEmail(email?: string | null) {
    const normalizedEmail = String(email || "").trim().toUpperCase();
    return TEMPORARY_EMAIL_RECIPIENT_ALLOWLIST.includes(normalizedEmail);
  }

  private waitForEmailSendInterval() {
    return new Promise((resolve) => setTimeout(resolve, EMAIL_SEND_INTERVAL_MS));
  }

  private runEmailJobInBackground(job: () => Promise<unknown>) {
    setTimeout(() => {
      void job().catch(() => undefined);
    }, 0);
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
    const central = await this.centralConfiguration.findConfiguration(
      this.tenantId(),
      branchCode && branchCode >= DEFAULT_BRANCH_CODE
        ? branchCode
        : undefined,
    );
    const smtp = central.effective.smtp;
    if (!smtp) return null;
    const company = this.centralConfiguration.mergeCompany(
      central.tenant.company,
      central.branch?.company,
    );
    return {
      id: central.branch?.id || central.tenant.id,
      name:
        smtp.fromName ||
        company.tradeName ||
        company.legalName ||
        central.tenant.displayName,
      smtpHost: smtp.host,
      smtpPort: smtp.port,
      smtpTimeout: smtp.timeout,
      smtpAuthenticate: smtp.authenticate,
      smtpSecure: smtp.secure,
      smtpAuthType: smtp.authType,
      smtpEmail: smtp.username || smtp.fromEmail,
      smtpPassword: smtp.password,
      smtpSenderName: smtp.fromName,
      smtpReplyTo: smtp.replyTo,
    };
  }

  private async getTenantTelegramConfiguration(): Promise<TelegramConfiguration | null> {
    const branchCode = this.branchCode();
    const central = await this.centralConfiguration.findConfiguration(
      this.tenantId(),
      branchCode && branchCode >= DEFAULT_BRANCH_CODE
        ? branchCode
        : undefined,
    );
    const telegram = central.effective.telegram;
    if (!telegram?.enabled || !telegram.botToken) return null;
    const company = this.centralConfiguration.mergeCompany(
      central.tenant.company,
      central.branch?.company,
    );
    return {
      id: central.branch?.id || central.tenant.id,
      name:
        company.tradeName ||
        company.legalName ||
        central.tenant.displayName,
      telegramEnabled: telegram.enabled,
      telegramBotToken: telegram.botToken,
      telegramBotUsername: telegram.botUsername || null,
    };
  }

  async processFinanceiroNotification(
    payload: Record<string, unknown>,
    callback: { tenantId: string; branchCode: number; userId: string },
  ) {
    const allowedEvents = new Set([
      "RECEIVABLE_INSTALLMENT_CANCELED",
      "RECEIVABLE_MOVEMENT_CANCELED",
      "RECEIVABLE_INSTALLMENT_AMOUNT_CHANGED",
      "RECEIVABLE_INSTALLMENT_DUE_DATE_CHANGED",
      "RECEIVABLE_SETTLEMENT_REVERSED",
      "PAYABLE_INSTALLMENT_CANCELED",
      "PAYABLE_MOVEMENT_CANCELED",
      "PAYABLE_INSTALLMENT_AMOUNT_CHANGED",
      "PAYABLE_INSTALLMENT_DUE_DATE_CHANGED",
      "PAYABLE_SETTLEMENT_REVERSED",
      "CASH_MOVEMENT_CANCELED",
    ]);
    const deliveryId = String(payload.deliveryId || "").trim();
    const eventType = String(payload.eventType || "").trim().toUpperCase();
    const recipientUserId = String(payload.recipientUserId || "").trim();
    const title = this.normalizeText(String(payload.title || ""));
    const message = this.normalizeText(String(payload.message || ""));
    if (!deliveryId || deliveryId.length > 128 || !allowedEvents.has(eventType) ||
        !recipientUserId || !title || !message || title.length > 200 || message.length > 2000) {
      throw new BadRequestException("NOTIFICAÇÃO FINANCEIRA INVÁLIDA.");
    }
    const user = await this.prisma.user.findFirst({
      where: { id: recipientUserId, tenantId: callback.tenantId, canceledAt: null },
      include: {
        person: true,
        branchAccesses: { where: { branchCode: callback.branchCode, canceledAt: null } },
      },
    });
    if (!user || (user.branchCode !== callback.branchCode && !user.branchAccesses.length)) {
      throw new ForbiddenException("DESTINATÁRIO NÃO PERTENCE À FILIAL INFORMADA.");
    }
    const existing = await this.prisma.financeiroNotificationReceipt.findUnique({
      where: { tenantId_deliveryId: { tenantId: callback.tenantId, deliveryId } },
    });
    if (existing?.processedAt) {
      return {
        deliveryId, internalStatus: existing.internalStatus,
        emailStatus: existing.emailStatus, telegramStatus: existing.telegramStatus,
        processedAt: existing.processedAt.toISOString(),
      };
    }
    const sendInternal = payload.sendInternal === true;
    const sendEmail = payload.sendEmail === true;
    const sendTelegram = payload.sendTelegram === true;
    const receipt = await this.prisma.financeiroNotificationReceipt.upsert({
      where: { tenantId_deliveryId: { tenantId: callback.tenantId, deliveryId } },
      create: {
        tenantId: callback.tenantId, branchCode: callback.branchCode,
        deliveryId, eventType, recipientUserId,
        internalStatus: sendInternal ? "PENDING" : "SKIPPED",
        emailStatus: sendEmail ? "PENDING" : "SKIPPED",
        telegramStatus: sendTelegram ? "PENDING" : "SKIPPED",
        createdBy: callback.userId, updatedBy: callback.userId,
      },
      update: { updatedBy: callback.userId },
    });
    let notificationId = receipt.notificationId;
    let internalStatus = receipt.internalStatus;
    let emailStatus = receipt.emailStatus;
    let telegramStatus = receipt.telegramStatus;
    const errors: string[] = [];
    if (sendInternal && !notificationId) {
      try {
        const notification = await this.prisma.notification.create({ data: {
          tenantId: callback.tenantId, branchCode: callback.branchCode,
          recipientType: "USER", recipientId: user.id, category: "FINANCEIRO",
          title, message,
          actionUrl: String(payload.actionUrl || "/principal/notificacoes").slice(0, 500),
          sourceType: "FINANCIAL_EVENT", sourceId: deliveryId,
          metadata: JSON.stringify({ eventType, deliveryId, ...(typeof payload.metadata === "object" && payload.metadata ? payload.metadata : {}) }),
          createdBy: callback.userId, updatedBy: callback.userId,
        } });
        notificationId = notification.id;
        internalStatus = "SENT";
      } catch (error) {
        internalStatus = "ERROR";
        errors.push(error instanceof Error ? error.message : "FALHA NA NOTIFICAÇÃO INTERNA");
      }
    }
    if (sendEmail && emailStatus !== "SENT") {
      const simulationOverride = String(payload.simulationEmailOverride || "").trim();
      const targetEmail = simulationOverride || user.person?.email || String(payload.recipientEmail || "").trim();
      if (simulationOverride &&
          (process.env.NODE_ENV === "production" || simulationOverride.toUpperCase() !== "TCHAIPUA@GMAIL.COM")) {
        throw new ForbiddenException("E-MAIL DE SIMULAÇÃO NÃO AUTORIZADO.");
      }
      try {
        const smtp = await this.getTenantSmtpConfiguration();
        if (!this.isTemporarilyAllowedEmail(targetEmail) || !smtp?.smtpHost || !smtp.smtpPort || !smtp.smtpEmail ||
            (smtp.smtpAuthenticate && !smtp.smtpPassword)) {
          emailStatus = "SKIPPED";
        } else {
          const transporter = nodemailer.createTransport({
            host: smtp.smtpHost, port: smtp.smtpPort, secure: smtp.smtpSecure || false,
            connectionTimeout: (smtp.smtpTimeout || 60) * 1000,
            auth: smtp.smtpAuthenticate ? { user: smtp.smtpEmail, pass: smtp.smtpPassword || "" } : undefined,
          });
          await transporter.sendMail({
            from: `"${smtp.smtpSenderName || smtp.name}" <${smtp.smtpEmail}>`,
            to: targetEmail, replyTo: smtp.smtpReplyTo || smtp.smtpEmail || undefined,
            subject: title, text: `${message}\n\nACESSE O SISTEMA PARA ACOMPANHAR MAIS DETALHES.`,
            html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1e293b"><h2>${this.escapeEmailHtml(title)}</h2><p>${this.escapeEmailHtml(message)}</p><p>Acesse o sistema para acompanhar mais detalhes.</p></div>`,
          });
          emailStatus = "SENT";
          if (notificationId) await this.prisma.notification.update({
            where: { id: notificationId }, data: { emailedAt: new Date(), updatedBy: callback.userId },
          });
        }
      } catch (error) {
        emailStatus = "ERROR";
        errors.push(error instanceof Error ? error.message : "FALHA NO E-MAIL");
      }
    }
    if (sendTelegram && telegramStatus !== "SENT") {
      const chatId = this.getOptedInTelegramChatId(user.person || undefined);
      const telegram = await this.getTenantTelegramConfiguration();
      if (!chatId || !telegram?.telegramBotToken || telegram.telegramEnabled === false) {
        telegramStatus = "SKIPPED";
      } else {
        try {
          const response = await fetch(`https://api.telegram.org/bot${telegram.telegramBotToken}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: `${title}\n\n${message}\n\nACESSE O SISTEMA PARA ACOMPANHAR MAIS DETALHES.` }),
          });
          const body = await response.json().catch(() => null);
          if (!response.ok || body?.ok !== true) throw new Error("FALHA NO TELEGRAM.");
          telegramStatus = "SENT";
          if (notificationId) await this.prisma.notification.update({
            where: { id: notificationId }, data: { telegramSentAt: new Date(), telegramStatus: "SENT", telegramError: null, updatedBy: callback.userId },
          });
        } catch (error) {
          telegramStatus = "ERROR";
          errors.push(error instanceof Error ? error.message : "FALHA NO TELEGRAM");
        }
      }
    }
    const processedAt = new Date();
    await this.prisma.financeiroNotificationReceipt.update({
      where: { id: receipt.id }, data: {
        notificationId, internalStatus, emailStatus, telegramStatus,
        lastError: errors.length ? errors.join(" | ").slice(0, 2000) : null,
        processedAt, updatedBy: callback.userId,
      },
    });
    return { deliveryId, internalStatus, emailStatus, telegramStatus, processedAt: processedAt.toISOString() };
  }

  private buildNotificationTitle(payload: LessonEventNotificationPayload) {
    const actionLabel =
      payload.action === "DELETE"
        ? "CANCELAMENTO"
        : payload.action === "UPDATE"
          ? "ATUALIZAÇÃO"
          : "NOVO AVISO";
    return this.normalizeText(
      `${actionLabel}: ${this.getEventTypeLabel(payload.lessonEvent.eventType)}`,
    );
  }

  private getLessonEventActionText(action: LessonEventNotificationPayload["action"]) {
    if (action === "DELETE") return "Foi cancelado um aviso";
    if (action === "UPDATE") return "Houve uma atualização";
    return "Foi lançado um novo aviso";
  }

  private getLessonEventEmailHeading(payload: LessonEventNotificationPayload) {
    if (payload.action === "DELETE") {
      return `Cancelamento de ${this.getEventTypeLabel(payload.lessonEvent.eventType).toLowerCase()}`;
    }
    if (payload.action === "UPDATE") return "Atualização de agenda";
    const eventTypeLabel = this.getEventTypeLabel(
      payload.lessonEvent.eventType,
    ).toLowerCase();
    if (payload.lessonEvent.eventType === "PROVA") {
      return `Nova ${eventTypeLabel} agendada`;
    }
    if (payload.lessonEvent.eventType === "TRABALHO") {
      return `Novo ${eventTypeLabel} agendado`;
    }
    return "Novo aviso na agenda escolar";
  }

  private getLessonEventEmailHeadingStyle(payload: LessonEventNotificationPayload) {
    const color = payload.action === "DELETE" ? "#dc2626" : "#0f172a";
    return `margin: 0 0 12px; color: ${color};`;
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
      payload.lessonItem.teacherSubject?.teacher?.person?.name ||
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
            person: true,
            guardians: {
              where: {
                canceledAt: null,
                guardian: {
                  canceledAt: null,
                },
              },
              include: {
                guardian: { include: { person: true } },
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
          name: enrollment.student.person?.name || "ALUNO",
          email: enrollment.student.person?.email ?? null,
          telegramChatId: this.getOptedInTelegramChatId(
            enrollment.student.person,
          ),
        });
      }

      if (payload.lessonEvent.notifyGuardians) {
        for (const link of enrollment.student.guardians) {
          if (!link.guardian) continue;
          recipients.set(`GUARDIAN:${link.guardian.id}`, {
            recipientType: "GUARDIAN",
            recipientId: link.guardian.id,
            name: link.guardian.person?.name || "RESPONSAVEL",
            email: link.guardian.person?.email ?? null,
            telegramChatId: this.getOptedInTelegramChatId(
              link.guardian.person,
            ),
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
            person: true,
            guardians: {
              where: {
                canceledAt: null,
                guardian: {
                  canceledAt: null,
                },
              },
              include: {
                guardian: { include: { person: true } },
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
          name: enrollment.student.person?.name || "ALUNO",
          email: enrollment.student.person?.email ?? null,
          studentId: enrollment.student.id,
          studentName: enrollment.student.person?.name || "ALUNO",
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
            name: link.guardian.person?.name || "RESPONSAVEL",
            email: link.guardian.person?.email ?? null,
            studentId: enrollment.student.id,
            studentName: enrollment.student.person?.name || "ALUNO",
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
    const teacherName =
      payload.lessonItem.teacherSubject?.teacher?.person?.name ||
      payload.lessonItem.teacherSubject?.teacher?.name ||
      payload.lessonItem.teacherName ||
      "PROFESSOR NÃO INFORMADO";
    const subject = `${this.getEventTypeLabel(payload.lessonEvent.eventType)} - ${subjectName}`;
    const timeLabel =
      payload.lessonItem.startTime && payload.lessonItem.endTime
        ? `${payload.lessonItem.startTime} às ${payload.lessonItem.endTime}`
        : "Sem horário vinculado";
    const textBody = [
      `${this.getLessonEventActionText(payload.action)} na agenda escolar.`,
      `Tipo: ${this.getEventTypeLabel(payload.lessonEvent.eventType)}`,
      `Data: ${this.formatDate(payload.lessonItem.lessonDate)}`,
      `Horário: ${timeLabel}`,
      `Turma: ${payload.lessonItem.seriesClass?.series?.name || "SEM SÉRIE"} - ${payload.lessonItem.seriesClass?.class?.name || "SEM TURMA"}`,
      `Disciplina: ${subjectName}`,
      `Professor: ${teacherName}`,
      payload.lessonEvent.description
        ? `Detalhes: ${payload.lessonEvent.description}`
        : null,
      "Acesse o sistema para acompanhar mais detalhes.",
    ]
      .filter(Boolean)
      .join("\n");

    const sendableRecipients = recipients.filter(
      (recipient) =>
        recipient.email?.trim() && this.isTemporarilyAllowedEmail(recipient.email),
    );

    if (sendableRecipients.length === 0) {
      return { sent: false, count: 0 };
    }

    const results: boolean[] = [];
    for (const [index, recipient] of sendableRecipients.entries()) {
      if (index > 0) {
        await this.waitForEmailSendInterval();
      }

      const result = await (async () => {
        try {
          await transporter.sendMail({
            from: `"${tenant.smtpSenderName || tenant.name}" <${tenant.smtpEmail}>`,
            to: recipient.email!,
            replyTo: tenant.smtpReplyTo || tenant.smtpEmail || undefined,
            subject,
            text: textBody,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1e293b;">
                <h2 style="${this.getLessonEventEmailHeadingStyle(payload)}">${this.getLessonEventEmailHeading(payload)}</h2>
                <p><strong>Tipo:</strong> ${this.getEventTypeLabel(payload.lessonEvent.eventType)}</p>
                <p><strong>Data:</strong> ${this.formatDate(payload.lessonItem.lessonDate)}</p>
                <p><strong>Horário:</strong> ${timeLabel}</p>
                <p><strong>Turma:</strong> ${payload.lessonItem.seriesClass?.series?.name || "SEM SÉRIE"} - ${payload.lessonItem.seriesClass?.class?.name || "SEM TURMA"}</p>
                <p><strong>Disciplina:</strong> ${subjectName}</p>
                <p><strong>Professor:</strong> ${teacherName}</p>
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
      })();
      results.push(result);
    }

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

  private escapeEmailHtml(value: string) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private async buildConfiguredEventRecipients(
    eventType: NotificationEventType,
  ): Promise<ConfiguredEventRecipient[]> {
    const preferences = await this.prisma.notificationPreference.findMany({
      where: {
        tenantId: this.tenantId(),
        eventType,
        enabled: true,
        canceledAt: null,
        person: { canceledAt: null },
      },
      include: {
        person: {
          include: {
            users: {
              where: { tenantId: this.tenantId(), canceledAt: null },
              select: { id: true },
            },
            teachers: {
              where: { tenantId: this.tenantId(), canceledAt: null },
              select: { id: true },
            },
            students: {
              where: { tenantId: this.tenantId(), canceledAt: null },
              select: { id: true },
            },
            guardians: {
              where: { tenantId: this.tenantId(), canceledAt: null },
              select: { id: true },
            },
          },
        },
      },
    });

    const recipients: ConfiguredEventRecipient[] = [];
    for (const preference of preferences) {
      const person = preference.person;
      const common = {
        personId: person.id,
        name: person.name || "PESSOA",
        email: person.email,
        telegramChatId: this.getOptedInTelegramChatId(person),
        sendInternal: preference.sendInternal,
        sendEmail: preference.sendEmail,
        sendTelegram: preference.sendTelegram,
      };

      if (preference.sendInternal) {
        for (const role of [
          ["USER", person.users],
          ["TEACHER", person.teachers],
          ["STUDENT", person.students],
          ["GUARDIAN", person.guardians],
        ] as const) {
          const recipientType = role[0] as RecipientType;
          for (const record of role[1]) {
            recipients.push({
              ...common,
              recipientType,
              recipientId: record.id,
            });
          }
        }
      }

      if (preference.sendEmail || preference.sendTelegram) {
        recipients.push({
          ...common,
          recipientType: "USER",
          recipientId: `PERSON:${person.id}`,
        });
      }
    }

    return recipients;
  }

  private async sendConfiguredEventEmails(
    recipients: ConfiguredEventRecipient[],
    payload: ConfiguredEventNotificationPayload,
  ) {
    const tenant = await this.getTenantSmtpConfiguration();
    if (!tenant?.smtpHost || !tenant.smtpPort || !tenant.smtpEmail) return 0;
    if (tenant.smtpAuthenticate && !tenant.smtpPassword) return 0;

    const uniqueRecipients = Array.from(
      new Map(
        recipients
          .filter(
            (recipient) =>
              recipient.sendEmail &&
              recipient.email?.trim() &&
              this.isTemporarilyAllowedEmail(recipient.email),
          )
          .map((recipient) => [recipient.personId, recipient]),
      ).values(),
    );
    if (!uniqueRecipients.length) return 0;

    const transporter = nodemailer.createTransport({
      host: tenant.smtpHost,
      port: tenant.smtpPort,
      secure: tenant.smtpSecure || false,
      connectionTimeout: (tenant.smtpTimeout || 60) * 1000,
      auth: tenant.smtpAuthenticate
        ? { user: tenant.smtpEmail, pass: tenant.smtpPassword || "" }
        : undefined,
    });

    let count = 0;
    for (const [index, recipient] of uniqueRecipients.entries()) {
      if (index > 0) await this.waitForEmailSendInterval();
      try {
        await transporter.sendMail({
          from: `"${tenant.smtpSenderName || tenant.name}" <${tenant.smtpEmail}>`,
          to: recipient.email!,
          replyTo: tenant.smtpReplyTo || tenant.smtpEmail || undefined,
          subject: payload.title,
          text: `${payload.message}\n\nACESSE O SISTEMA PARA ACOMPANHAR MAIS DETALHES.`,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1e293b"><h2>${this.escapeEmailHtml(payload.title)}</h2><p>${this.escapeEmailHtml(payload.message)}</p><p>Acesse o sistema para acompanhar mais detalhes.</p></div>`,
        });
        count += 1;
        if (payload.sourceId) {
          await this.prisma.notification.updateMany({
            where: {
              tenantId: this.tenantId(),
              sourceType: payload.sourceType || "STATUS_EVENT",
              sourceId: payload.sourceId,
              canceledAt: null,
              recipientId: {
                in: recipients
                  .filter((item) => item.personId === recipient.personId)
                  .map((item) => item.recipientId),
              },
            },
            data: { emailedAt: new Date(), updatedBy: this.userId() },
          });
        }
      } catch {
        continue;
      }
    }
    return count;
  }

  private async sendConfiguredEventTelegram(
    recipients: ConfiguredEventRecipient[],
    payload: ConfiguredEventNotificationPayload,
  ) {
    const uniqueRecipients = Array.from(
      new Map(
        recipients
          .filter(
            (recipient) =>
              recipient.sendTelegram && recipient.telegramChatId?.trim(),
          )
          .map((recipient) => [recipient.personId, recipient]),
      ).values(),
    );
    if (!uniqueRecipients.length) return 0;

    const config = await this.getTenantTelegramConfiguration();
    if (!config?.telegramBotToken || config.telegramEnabled === false) return 0;

    const results = await Promise.all(
      uniqueRecipients.map(async (recipient) => {
        try {
          const response = await fetch(
            `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: recipient.telegramChatId,
                text: `${payload.title}\n\n${payload.message}\n\nACESSE O SISTEMA PARA ACOMPANHAR MAIS DETALHES.`,
              }),
            },
          );
          const body = await response.json().catch(() => null);
          if (!response.ok || body?.ok !== true) throw new Error("Falha no Telegram.");
          if (payload.sourceId) {
            await this.prisma.notification.updateMany({
              where: {
                tenantId: this.tenantId(),
                sourceType: payload.sourceType || "STATUS_EVENT",
                sourceId: payload.sourceId,
                canceledAt: null,
                recipientId: {
                  in: recipients
                    .filter((item) => item.personId === recipient.personId)
                    .map((item) => item.recipientId),
                },
              },
              data: {
                telegramSentAt: new Date(),
                telegramStatus: "SENT",
                telegramError: null,
                updatedBy: this.userId(),
              },
            });
          }
          return true;
        } catch {
          return false;
        }
      }),
    );
    return results.filter(Boolean).length;
  }

  async dispatchConfiguredEventNotification(
    payload: ConfiguredEventNotificationPayload,
  ) {
    const recipients = await this.buildConfiguredEventRecipients(payload.eventType);
    const internalRecipients = recipients.filter(
      (recipient) => recipient.sendInternal && !recipient.recipientId.startsWith("PERSON:"),
    );
    if (internalRecipients.length) {
      await this.prisma.notification.createMany({
        data: internalRecipients.map((recipient) => ({
          tenantId: this.tenantId(),
          recipientType: recipient.recipientType,
          recipientId: recipient.recipientId,
          category: "CADASTRO_STATUS",
          title: this.normalizeText(payload.title),
          message: this.normalizeText(payload.message),
          actionUrl: payload.actionUrl || "/dashboard/notificacoes",
          sourceType: payload.sourceType || "STATUS_EVENT",
          sourceId: payload.sourceId || null,
          metadata: JSON.stringify({
            eventType: payload.eventType,
            ...(payload.metadata || {}),
          }),
          createdBy: this.userId(),
          updatedBy: this.userId(),
        })),
      });
    }

    const hasEmail = recipients.some(
      (recipient) => recipient.sendEmail && recipient.email?.trim(),
    );
    if (hasEmail) {
      this.runEmailJobInBackground(() => this.sendConfiguredEventEmails(recipients, payload));
    }
    const telegramCount = await this.sendConfiguredEventTelegram(recipients, payload);
    return {
      notificationsCreated: internalRecipients.length,
      emailQueued: hasEmail,
      telegramSent: telegramCount > 0,
      telegramCount,
    };
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
      payload.lessonItem.teacherSubject?.teacher?.person?.name ||
      payload.lessonItem.teacherSubject?.teacher?.name ||
      "PROFESSOR";
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
      payload.lessonItem.teacherSubject?.teacher?.person?.name ||
      payload.lessonItem.teacherSubject?.teacher?.name ||
      "PROFESSOR";
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

    const sendableRecipients = recipients.filter(
      (recipient) =>
        recipient.email &&
        recipient.email.trim() &&
        this.isTemporarilyAllowedEmail(recipient.email),
    );

    for (const [index, recipient] of sendableRecipients.entries()) {
      if (index > 0) {
        await this.waitForEmailSendInterval();
      }

      try {
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

          await transporter.sendMail({
            from: `"${tenant.smtpSenderName || tenant.name}" <${tenant.smtpEmail}>`,
            to: recipient.email!,
            replyTo: tenant.smtpReplyTo || tenant.smtpEmail || undefined,
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
      } catch {
        continue;
      }
    }

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

    const hasEmailRecipients = recipients.some(
      (recipient) =>
        recipient.email?.trim() && this.isTemporarilyAllowedEmail(recipient.email),
    );
    if (payload.lessonEvent.notifyByEmail && hasEmailRecipients) {
      this.runEmailJobInBackground(() =>
        this.sendEmailNotifications(recipients, payload),
      );
    }

    const telegramResult = await this.sendTelegramNotifications(
      recipients,
      payload,
      title,
      message,
    );

    return {
      notificationsCreated: recipients.length,
      emailSent: false,
      emailCount: 0,
      emailQueued: payload.lessonEvent.notifyByEmail && hasEmailRecipients,
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
          teacherName:
            payload.lessonItem.teacherSubject?.teacher?.person?.name ||
            payload.lessonItem.teacherSubject?.teacher?.name ||
            null,
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

    const hasEmailRecipients = recipients.some(
      (recipient) =>
        recipient.email?.trim() && this.isTemporarilyAllowedEmail(recipient.email),
    );
    if (payload.assessment.notifyByEmail && hasEmailRecipients) {
      this.runEmailJobInBackground(() =>
        this.sendAssessmentGradeEmails(recipients, payload),
      );
    }

    return {
      notificationsCreated: recipients.length,
      emailSent: false,
      emailQueued: payload.assessment.notifyByEmail && hasEmailRecipients,
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
            person: true,
            guardians: {
              where: {
                canceledAt: null,
                guardian: {
                  canceledAt: null,
                },
              },
              include: {
                guardian: { include: { person: true } },
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
            studentName: enrollment.student.person?.name || "ALUNO",
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
              studentName: enrollment.student.person?.name || "ALUNO",
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

    const notifications = await this.prisma.notification.findMany({
      where: {
        tenantId: currentUser.tenantId,
        canceledAt: null,
        OR: [
          { recipientType, recipientId },
          {
            conversations: {
              some: {
                canceledAt: null,
                participants: {
                  some: {
                    participantType: recipientType,
                    participantId: recipientId,
                    canceledAt: null,
                  },
                },
              },
            },
          },
        ],
      },
      include: {
        conversations: {
          where: {
            canceledAt: null,
            participants: {
              some: {
                participantType: recipientType,
                participantId: recipientId,
                canceledAt: null,
              },
            },
          },
          include: {
            participants: {
              where: {
                participantType: recipientType,
                participantId: recipientId,
                canceledAt: null,
              },
            },
            messages: {
              where: { canceledAt: null },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { createdAt: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return notifications
      .map(({ conversations, ...notification }) => {
        const chatUnread = conversations.some((conversation) => {
          const participant = conversation.participants[0];
          const latestMessage = conversation.messages[0];
          return Boolean(
            participant &&
              latestMessage &&
              (!participant.lastReadAt ||
                participant.lastReadAt < latestMessage.createdAt),
          );
        });
        const direct =
          notification.recipientType === recipientType &&
          notification.recipientId === recipientId;
        const unread = (direct && !notification.readAt) || chatUnread;
        return { ...notification, chatUnread, unread };
      })
      .filter((notification) =>
        normalizedStatus === "UNREAD"
          ? notification.unread
          : normalizedStatus === "READ"
            ? !notification.unread
            : true,
      )
      .sort(
        (left, right) =>
          Number(right.unread) - Number(left.unread) ||
          right.createdAt.getTime() - left.createdAt.getTime(),
      );
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
