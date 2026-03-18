import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { PrismaService } from "../../../../prisma/prisma.service";
import { getTenantContext } from "../../../../common/tenant/tenant.context";
import type { ICurrentUser } from "../../../../common/decorators/current-user.decorator";
import { ListMyNotificationsDto } from "../dto/list-my-notifications.dto";

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
  action: "CREATE" | "UPDATE";
};

type NotificationRecipient = {
  recipientType: RecipientType;
  recipientId: string;
  name: string;
  email?: string | null;
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

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantId() {
    return getTenantContext()!.tenantId;
  }

  private userId() {
    return getTenantContext()!.userId;
  }

  private normalizeText(value: string) {
    return String(value || "").trim().toUpperCase();
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

  private getRecipientForCurrentUser(
    currentUser: ICurrentUser,
  ): { recipientType: RecipientType; recipientId: string } {
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
    switch (String(value || "").trim().toUpperCase()) {
      case "PROVA":
        return "PROVA";
      case "TRABALHO":
        return "TRABALHO";
      case "RECADO":
        return "RECADO";
      case "FALTA_PROFESSOR":
        return "FALTA DO PROFESSOR";
      default:
        return String(value || "EVENTO").trim().toUpperCase();
    }
  }

  private async getTenantSmtpConfiguration() {
    return this.prisma.tenant.findFirst({
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
        email: true,
      },
    });
  }

  private buildNotificationTitle(payload: LessonEventNotificationPayload) {
    return this.normalizeText(
      `${payload.action === "UPDATE" ? "ATUALIZAÇÃO" : "NOVO AVISO"}: ${this.getEventTypeLabel(payload.lessonEvent.eventType)}`,
    );
  }

  private buildNotificationMessage(payload: LessonEventNotificationPayload) {
    const seriesName =
      payload.lessonItem.seriesClass?.series?.name || "SEM SÉRIE";
    const className = payload.lessonItem.seriesClass?.class?.name || "SEM TURMA";
    const subjectName =
      payload.lessonItem.teacherSubject?.subject?.name || "DISCIPLINA";
    const teacherName =
      payload.lessonItem.teacherSubject?.teacher?.name || "PROFESSOR";
    const base = `${this.getEventTypeLabel(payload.lessonEvent.eventType)} EM ${subjectName} NO DIA ${this.formatDate(payload.lessonItem.lessonDate)} DAS ${payload.lessonItem.startTime} ÀS ${payload.lessonItem.endTime} PARA ${seriesName} - ${className}.`;
    const detail = payload.lessonEvent.description
      ? ` ${payload.lessonEvent.description}`
      : "";
    return this.normalizeText(
      `${base}${detail} PROFESSOR RESPONSÁVEL: ${teacherName}.`,
    );
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
          });
        }
      }
    }

    return Array.from(recipients.values());
  }

  private async buildAssessmentRecipients(
    payload: AssessmentGradeNotificationPayload,
  ): Promise<NotificationRecipient[]> {
    const validStudentIds = payload.gradedStudents.map((student) => student.studentId);
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
      if (payload.assessment.notifyStudents) {
        recipients.set(`STUDENT:${enrollment.student.id}`, {
          recipientType: "STUDENT",
          recipientId: enrollment.student.id,
          name: enrollment.student.name,
          email: enrollment.student.email,
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
          });
        }
      }
    }

    return Array.from(recipients.values());
  }

  private async sendEmailNotifications(
    recipients: NotificationRecipient[],
    payload: LessonEventNotificationPayload,
  ) {
    if (!payload.lessonEvent.notifyByEmail) {
      return false;
    }

    const tenant = await this.getTenantSmtpConfiguration();
    if (!tenant?.smtpHost || !tenant.smtpPort || !tenant.smtpEmail) {
      return false;
    }

    if (tenant.smtpAuthenticate && !tenant.smtpPassword) {
      return false;
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

    const subject = `${this.getEventTypeLabel(payload.lessonEvent.eventType)} - ${payload.lessonItem.teacherSubject?.subject?.name || "AULA"}`;
    const textBody = [
      `${payload.action === "UPDATE" ? "Houve uma atualização" : "Foi lançado um novo aviso"} na agenda escolar.`,
      `Tipo: ${this.getEventTypeLabel(payload.lessonEvent.eventType)}`,
      `Data: ${this.formatDate(payload.lessonItem.lessonDate)}`,
      `Horário: ${payload.lessonItem.startTime} às ${payload.lessonItem.endTime}`,
      `Turma: ${(payload.lessonItem.seriesClass?.series?.name || "SEM SÉRIE")} - ${(payload.lessonItem.seriesClass?.class?.name || "SEM TURMA")}`,
      `Disciplina: ${payload.lessonItem.teacherSubject?.subject?.name || "DISCIPLINA NÃO INFORMADA"}`,
      payload.lessonEvent.description
        ? `Detalhes: ${payload.lessonEvent.description}`
        : null,
      "Acesse o sistema para acompanhar mais detalhes.",
    ]
      .filter(Boolean)
      .join("\n");

    await Promise.allSettled(
      recipients
        .filter((recipient) => recipient.email && recipient.email.trim())
        .map((recipient) =>
          transporter.sendMail({
            from: `"${tenant.name}" <${tenant.smtpEmail}>`,
            to: recipient.email!,
            replyTo: tenant.email || tenant.smtpEmail || undefined,
            subject,
            text: textBody,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1e293b;">
                <h2 style="margin: 0 0 12px;">${payload.action === "UPDATE" ? "Atualização de agenda" : "Novo aviso na agenda escolar"}</h2>
                <p><strong>Tipo:</strong> ${this.getEventTypeLabel(payload.lessonEvent.eventType)}</p>
                <p><strong>Data:</strong> ${this.formatDate(payload.lessonItem.lessonDate)}</p>
                <p><strong>Horário:</strong> ${payload.lessonItem.startTime} às ${payload.lessonItem.endTime}</p>
                <p><strong>Turma:</strong> ${(payload.lessonItem.seriesClass?.series?.name || "SEM SÉRIE")} - ${(payload.lessonItem.seriesClass?.class?.name || "SEM TURMA")}</p>
                <p><strong>Disciplina:</strong> ${payload.lessonItem.teacherSubject?.subject?.name || "DISCIPLINA NÃO INFORMADA"}</p>
                ${
                  payload.lessonEvent.description
                    ? `<p><strong>Detalhes:</strong> ${payload.lessonEvent.description}</p>`
                    : ""
                }
                <p>Entre no sistema para acompanhar mais detalhes.</p>
              </div>
            `,
          }),
        ),
    );

    return true;
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
    const className = payload.lessonItem.seriesClass?.class?.name || "SEM TURMA";
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
          let studentGrade: { score: number; remarks?: string | null } | undefined;
          if (recipient.recipientType === "STUDENT") {
            studentGrade = scoreByStudent.get(recipient.recipientId);
          }

          const textBody = [
            `Uma nota foi lançada no sistema escolar.`,
            `Avaliação: ${payload.assessment.title}`,
            `Tipo: ${payload.assessment.assessmentType}`,
            `Data da aula: ${this.formatDate(payload.lessonItem.lessonDate)}`,
            `Horário: ${payload.lessonItem.startTime} às ${payload.lessonItem.endTime}`,
            `Turma: ${(payload.lessonItem.seriesClass?.series?.name || "SEM SÉRIE")} - ${(payload.lessonItem.seriesClass?.class?.name || "SEM TURMA")}`,
            `Disciplina: ${payload.lessonItem.teacherSubject?.subject?.name || "DISCIPLINA NÃO INFORMADA"}`,
            studentGrade
              ? `Nota lançada: ${this.formatScore(studentGrade.score)}${payload.assessment.maxScore ? ` / ${this.formatScore(payload.assessment.maxScore)}` : ""}`
              : "Entre no sistema para visualizar a nota do aluno.",
            studentGrade?.remarks ? `Observação: ${studentGrade.remarks}` : null,
            "Acesse o sistema para mais detalhes.",
          ]
            .filter(Boolean)
            .join("\n");

          return transporter.sendMail({
            from: `"${tenant.name}" <${tenant.smtpEmail}>`,
            to: recipient.email!,
            replyTo: tenant.email || tenant.smtpEmail || undefined,
            subject,
            text: textBody,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1e293b;">
                <h2 style="margin: 0 0 12px;">Nota disponibilizada</h2>
                <p><strong>Avaliação:</strong> ${payload.assessment.title}</p>
                <p><strong>Tipo:</strong> ${payload.assessment.assessmentType}</p>
                <p><strong>Data da aula:</strong> ${this.formatDate(payload.lessonItem.lessonDate)}</p>
                <p><strong>Horário:</strong> ${payload.lessonItem.startTime} às ${payload.lessonItem.endTime}</p>
                <p><strong>Turma:</strong> ${(payload.lessonItem.seriesClass?.series?.name || "SEM SÉRIE")} - ${(payload.lessonItem.seriesClass?.class?.name || "SEM TURMA")}</p>
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

  async dispatchLessonEventNotifications(payload: LessonEventNotificationPayload) {
    const recipients = await this.buildRecipients(payload);
    if (recipients.length === 0) {
      return { notificationsCreated: 0, emailSent: false };
    }

    await this.prisma.notification.createMany({
      data: recipients.map((recipient) => ({
        tenantId: this.tenantId(),
        recipientType: recipient.recipientType,
        recipientId: recipient.recipientId,
        category: "AGENDA_ESCOLAR",
        title: this.buildNotificationTitle(payload),
        message: this.buildNotificationMessage(payload),
        actionUrl: "/dashboard/notificacoes",
        sourceType: "LESSON_EVENT",
        sourceId: payload.lessonEvent.id,
        metadata: JSON.stringify({
          lessonCalendarItemId: payload.lessonItem.id,
          eventType: payload.lessonEvent.eventType,
          lessonDate: payload.lessonItem.lessonDate,
        }),
        createdBy: this.userId(),
        updatedBy: this.userId(),
      })),
    });

    const emailSent = await this.sendEmailNotifications(recipients, payload);

    return {
      notificationsCreated: recipients.length,
      emailSent,
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

  async findMyNotifications(
    currentUser: ICurrentUser,
    query: ListMyNotificationsDto,
  ) {
    const { recipientId, recipientType } = this.getRecipientForCurrentUser(currentUser);
    const normalizedStatus = String(query.status || "ALL").trim().toUpperCase();

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
    const { recipientId, recipientType } = this.getRecipientForCurrentUser(currentUser);

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
    const { recipientId, recipientType } = this.getRecipientForCurrentUser(currentUser);

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

  async markAllAsRead(currentUser: ICurrentUser) {
    const { recipientId, recipientType } = this.getRecipientForCurrentUser(currentUser);

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
}
