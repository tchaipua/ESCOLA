import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { PrismaService } from "../../../../prisma/prisma.service";
import type { ICurrentUser } from "../../../../common/decorators/current-user.decorator";
import {
  CreateCommunicationCampaignDto,
  type CommunicationTargetGroup,
} from "../dto/create-communication-campaign.dto";

type AllowedAudienceScope = {
  mode: "ADMIN" | "FINANCEIRO" | "PROFESSOR";
  allowedGroups: CommunicationTargetGroup[];
  label: string;
  description: string;
};

type RecipientRecord = {
  recipientType: "USER" | "TEACHER" | "STUDENT" | "GUARDIAN";
  recipientId: string;
  name: string;
  email?: string | null;
};

@Injectable()
export class CommunicationsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeText(value: string) {
    return String(value || "").trim().toUpperCase();
  }

  private getAllowedScope(currentUser: ICurrentUser): AllowedAudienceScope {
    if (currentUser.role === "ADMIN") {
      return {
        mode: "ADMIN",
        allowedGroups: [
          "ESCOLA_GERAL",
          "FUNCIONARIOS",
          "PROFESSORES",
          "ALUNOS",
          "RESPONSAVEIS",
        ],
        label: "ADMIN",
        description:
          "Pode enviar para a escola inteira ou para públicos específicos.",
      };
    }

    if (currentUser.role === "PROFESSOR") {
      return {
        mode: "PROFESSOR",
        allowedGroups: ["ALUNOS", "RESPONSAVEIS"],
        label: "PROFESSOR",
        description:
          "Pode enviar somente para seus alunos ativos e respectivos responsáveis.",
      };
    }

    if (
      Array.isArray(currentUser.permissions) &&
      currentUser.permissions.includes("MANAGE_FINANCIAL")
    ) {
      return {
        mode: "FINANCEIRO",
        allowedGroups: ["RESPONSAVEIS"],
        label: "FINANCEIRO",
        description:
          "Pode enviar somente para os responsáveis da escola.",
      };
    }

    throw new ForbiddenException(
      "Seu perfil não possui acesso à central de comunicações.",
    );
  }

  private assertRequestedGroups(
    currentUser: ICurrentUser,
    groups: CommunicationTargetGroup[],
  ) {
    const scope = this.getAllowedScope(currentUser);
    const invalidGroup = groups.find(
      (group) => !scope.allowedGroups.includes(group),
    );

    if (invalidGroup) {
      throw new ForbiddenException(
        "Seu perfil não pode enviar comunicados para o público selecionado.",
      );
    }

    return scope;
  }

  private async getTeacherAudienceSeriesClassIds(currentUser: ICurrentUser) {
    const items = await this.prisma.classScheduleItem.findMany({
      where: {
        tenantId: currentUser.tenantId,
        canceledAt: null,
        teacherSubject: {
          is: {
            tenantId: currentUser.tenantId,
            canceledAt: null,
            teacherId: currentUser.userId,
            teacher: {
              is: {
                tenantId: currentUser.tenantId,
                canceledAt: null,
              },
            },
          },
        },
      },
      select: {
        seriesClassId: true,
      },
      distinct: ["seriesClassId"],
    });

    return items.map((item) => item.seriesClassId).filter(Boolean);
  }

  private async buildRecipientsForGroups(
    currentUser: ICurrentUser,
    groups: CommunicationTargetGroup[],
  ): Promise<RecipientRecord[]> {
    const normalizedGroups = Array.from(new Set(groups));
    const scope = this.getAllowedScope(currentUser);
    const recipients = new Map<string, RecipientRecord>();

    const addRecipient = (recipient: RecipientRecord) => {
      recipients.set(
        `${recipient.recipientType}:${recipient.recipientId}`,
        recipient,
      );
    };

    if (scope.mode === "ADMIN") {
      const effectiveGroups = normalizedGroups.includes("ESCOLA_GERAL")
        ? ["FUNCIONARIOS", "PROFESSORES", "ALUNOS", "RESPONSAVEIS"]
        : normalizedGroups;

      if (effectiveGroups.includes("FUNCIONARIOS")) {
        const users = await this.prisma.user.findMany({
          where: {
            tenantId: currentUser.tenantId,
            canceledAt: null,
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
        });

        users.forEach((user) =>
          addRecipient({
            recipientType: "USER",
            recipientId: user.id,
            name: user.name,
            email: user.email,
          }),
        );
      }

      if (effectiveGroups.includes("PROFESSORES")) {
        const teachers = await this.prisma.teacher.findMany({
          where: {
            tenantId: currentUser.tenantId,
            canceledAt: null,
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
        });

        teachers.forEach((teacher) =>
          addRecipient({
            recipientType: "TEACHER",
            recipientId: teacher.id,
            name: teacher.name,
            email: teacher.email,
          }),
        );
      }

      if (
        effectiveGroups.includes("ALUNOS") ||
        effectiveGroups.includes("RESPONSAVEIS")
      ) {
        const students = await this.prisma.student.findMany({
          where: {
            tenantId: currentUser.tenantId,
            canceledAt: null,
          },
          select: {
            id: true,
            name: true,
            email: true,
            guardians: {
              where: {
                canceledAt: null,
                guardian: {
                  canceledAt: null,
                },
              },
              select: {
                guardian: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        });

        students.forEach((student) => {
          if (effectiveGroups.includes("ALUNOS")) {
            addRecipient({
              recipientType: "STUDENT",
              recipientId: student.id,
              name: student.name,
              email: student.email,
            });
          }

          if (effectiveGroups.includes("RESPONSAVEIS")) {
            student.guardians.forEach((link) => {
              if (!link.guardian) return;
              addRecipient({
                recipientType: "GUARDIAN",
                recipientId: link.guardian.id,
                name: link.guardian.name,
                email: link.guardian.email,
              });
            });
          }
        });
      }

      return Array.from(recipients.values());
    }

    if (scope.mode === "FINANCEIRO") {
      const guardians = await this.prisma.guardian.findMany({
        where: {
          tenantId: currentUser.tenantId,
          canceledAt: null,
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });

      guardians.forEach((guardian) =>
        addRecipient({
          recipientType: "GUARDIAN",
          recipientId: guardian.id,
          name: guardian.name,
          email: guardian.email,
        }),
      );

      return Array.from(recipients.values());
    }

    const seriesClassIds = await this.getTeacherAudienceSeriesClassIds(
      currentUser,
    );
    if (seriesClassIds.length === 0) {
      return [];
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        tenantId: currentUser.tenantId,
        canceledAt: null,
        status: "ATIVO",
        seriesClassId: {
          in: seriesClassIds,
        },
        student: {
          canceledAt: null,
        },
      },
      select: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            guardians: {
              where: {
                canceledAt: null,
                guardian: {
                  canceledAt: null,
                },
              },
              select: {
                guardian: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    enrollments.forEach((enrollment) => {
      if (normalizedGroups.includes("ALUNOS")) {
        addRecipient({
          recipientType: "STUDENT",
          recipientId: enrollment.student.id,
          name: enrollment.student.name,
          email: enrollment.student.email,
        });
      }

      if (normalizedGroups.includes("RESPONSAVEIS")) {
        enrollment.student.guardians.forEach((link) => {
          if (!link.guardian) return;
          addRecipient({
            recipientType: "GUARDIAN",
            recipientId: link.guardian.id,
            name: link.guardian.name,
            email: link.guardian.email,
          });
        });
      }
    });

    return Array.from(recipients.values());
  }

  private async getTenantSmtpConfiguration(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
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

    if (!tenant) {
      throw new BadRequestException("Escola não encontrada para envio.");
    }

    return tenant;
  }

  private async sendTenantEmails(params: {
    tenantId: string;
    title: string;
    message: string;
    recipients: RecipientRecord[];
  }) {
    const tenant = await this.getTenantSmtpConfiguration(params.tenantId);

    if (!tenant.smtpHost || !tenant.smtpPort || !tenant.smtpEmail) {
      throw new BadRequestException(
        "Esta escola ainda não possui o SMTP configurado para envio de e-mail.",
      );
    }

    if (tenant.smtpAuthenticate && !tenant.smtpPassword) {
      throw new BadRequestException(
        "Esta escola possui SMTP incompleto. Revise usuário e senha de envio.",
      );
    }

    const transport = nodemailer.createTransport({
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

    const uniqueRecipients = Array.from(
      new Set(
        params.recipients
          .map((recipient) => String(recipient.email || "").trim().toLowerCase())
          .filter(Boolean),
      ),
    );

    if (uniqueRecipients.length === 0) {
      return 0;
    }

    await Promise.allSettled(
      uniqueRecipients.map((email) =>
        transport.sendMail({
          from: `"${tenant.name}" <${tenant.smtpEmail}>`,
          to: email,
          replyTo: tenant.email || tenant.smtpEmail || undefined,
          subject: params.title,
          text: `${params.message}\n\nENVIADO PELA ESCOLA ${tenant.name}.`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.55; color: #1e293b;">
              <h2 style="margin: 0 0 16px;">${params.title}</h2>
              <div style="white-space: pre-wrap; font-size: 14px;">${params.message}</div>
              <p style="margin-top: 24px; font-size: 12px; color: #64748b;">
                Enviado pela escola ${tenant.name}.
              </p>
            </div>
          `,
        }),
      ),
    );

    return uniqueRecipients.length;
  }

  async getMyScope(currentUser: ICurrentUser) {
    const scope = this.getAllowedScope(currentUser);
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: currentUser.tenantId,
        canceledAt: null,
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        smtpHost: true,
        smtpPort: true,
        smtpEmail: true,
      },
    });

    return {
      scope: scope.mode,
      label: scope.label,
      description: scope.description,
      availableGroups: scope.allowedGroups.map((group) => ({
        code: group,
        label:
          group === "ESCOLA_GERAL"
            ? "ESCOLA EM GERAL"
            : group === "FUNCIONARIOS"
              ? "FUNCIONÁRIOS"
              : group === "PROFESSORES"
                ? "PROFESSORES"
                : group === "ALUNOS"
                  ? "ALUNOS"
                  : "RESPONSÁVEIS",
        description:
          group === "ESCOLA_GERAL"
            ? "ENVIA PARA TODOS OS PERFIS DA ESCOLA."
            : group === "FUNCIONARIOS"
              ? "USUÁRIOS ADMINISTRATIVOS DA ESCOLA."
              : group === "PROFESSORES"
                ? "DOCENTES CADASTRADOS NA ESCOLA."
                : group === "ALUNOS"
                  ? scope.mode === "PROFESSOR"
                    ? "SEUS ALUNOS ATIVOS NAS TURMAS VINCULADAS."
                    : "ALUNOS CADASTRADOS NA ESCOLA."
                  : scope.mode === "PROFESSOR"
                    ? "RESPONSÁVEIS DOS SEUS ALUNOS."
                    : "RESPONSÁVEIS CADASTRADOS NA ESCOLA.",
      })),
      emailConfigured: !!tenant?.smtpHost && !!tenant?.smtpPort && !!tenant?.smtpEmail,
      tenant,
    };
  }

  async list(currentUser: ICurrentUser) {
    const scope = this.getAllowedScope(currentUser);

    const campaigns = await this.prisma.communicationCampaign.findMany({
      where: {
        tenantId: currentUser.tenantId,
        canceledAt: null,
        ...(scope.mode === "ADMIN"
          ? {}
          : {
              senderId: currentUser.userId,
            }),
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return campaigns.map((campaign) => ({
      ...campaign,
      recipientGroups: JSON.parse(campaign.recipientGroups || "[]"),
    }));
  }

  async create(
    currentUser: ICurrentUser,
    createDto: CreateCommunicationCampaignDto,
  ) {
    const normalizedGroups = Array.from(
      new Set(
        (createDto.recipientGroups || []).map((group) =>
          this.normalizeText(group),
        ),
      ),
    ) as CommunicationTargetGroup[];

    const scope = this.assertRequestedGroups(currentUser, normalizedGroups);

    if (!createDto.sendInternal && !createDto.sendEmail) {
      throw new BadRequestException(
        "Selecione pelo menos um canal: notificação interna ou e-mail.",
      );
    }

    const recipients = await this.buildRecipientsForGroups(
      currentUser,
      normalizedGroups,
    );
    if (recipients.length === 0) {
      throw new BadRequestException(
        "Nenhum destinatário foi encontrado para o público selecionado.",
      );
    }

    const senderName =
      scope.mode === "PROFESSOR"
        ? (
            await this.prisma.teacher.findFirst({
              where: {
                id: currentUser.userId,
                tenantId: currentUser.tenantId,
                canceledAt: null,
              },
              select: { name: true },
            })
          )?.name || "PROFESSOR"
        : (
            await this.prisma.user.findFirst({
              where: {
                id: currentUser.userId,
                tenantId: currentUser.tenantId,
                canceledAt: null,
              },
              select: { name: true },
            })
          )?.name || "USUÁRIO";

    const title = this.normalizeText(createDto.title);
    const message = this.normalizeText(createDto.message);

    const campaign = await this.prisma.communicationCampaign.create({
      data: {
        tenantId: currentUser.tenantId,
        senderType: scope.mode === "PROFESSOR" ? "TEACHER" : "USER",
        senderId: currentUser.userId,
        senderRole: currentUser.role,
        senderName: this.normalizeText(senderName),
        title,
        message,
        sendInternal: createDto.sendInternal,
        sendEmail: createDto.sendEmail,
        recipientGroups: JSON.stringify(normalizedGroups),
        createdBy: currentUser.userId,
        updatedBy: currentUser.userId,
      },
    });

    let internalCount = 0;
    if (createDto.sendInternal) {
      await this.prisma.notification.createMany({
        data: recipients.map((recipient) => ({
          tenantId: currentUser.tenantId,
          recipientType: recipient.recipientType,
          recipientId: recipient.recipientId,
          category: "COMUNICADO_ESCOLAR",
          title,
          message,
          actionUrl: createDto.actionUrl?.trim() || "/dashboard/notificacoes",
          sourceType: "COMMUNICATION_CAMPAIGN",
          sourceId: campaign.id,
          metadata: JSON.stringify({
            senderRole: currentUser.role,
            recipientGroups: normalizedGroups,
          }),
          createdBy: currentUser.userId,
          updatedBy: currentUser.userId,
        })),
      });
      internalCount = recipients.length;
    }

    let emailCount = 0;
    if (createDto.sendEmail) {
      emailCount = await this.sendTenantEmails({
        tenantId: currentUser.tenantId,
        title,
        message,
        recipients,
      });
    }

    const updatedCampaign = await this.prisma.communicationCampaign.update({
      where: {
        id: campaign.id,
      },
      data: {
        totalRecipients: recipients.length,
        internalCount,
        emailCount,
        lastSentAt: new Date(),
        updatedBy: currentUser.userId,
      },
    });

    return {
      message: "Comunicado enviado com sucesso.",
      campaign: {
        ...updatedCampaign,
        recipientGroups: normalizedGroups,
      },
      delivery: {
        internalCount,
        emailCount,
        totalRecipients: recipients.length,
      },
    };
  }
}
