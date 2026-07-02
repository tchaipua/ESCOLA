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
import { DEFAULT_BRANCH_CODE } from "../../../../common/tenant/branch.constants";

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
  telegramChatId?: string | null;
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

type TelegramConfiguration = {
  id: string;
  name: string;
  telegramEnabled?: boolean | null;
  telegramBotToken?: string | null;
  telegramBotUsername?: string | null;
};

@Injectable()
export class CommunicationsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeText(value: string) {
    return String(value || "")
      .trim()
      .toUpperCase();
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
        description: "Pode enviar somente para os responsáveis da escola.",
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
            person: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        });

        teachers.forEach((teacher) =>
          addRecipient({
            recipientType: "TEACHER",
            recipientId: teacher.id,
            name: teacher.person?.name || "PROFESSOR",
            email: teacher.person?.email ?? null,
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
            person: {
              select: {
                name: true,
                email: true,
                telegramChatId: true,
                telegramOptInAt: true,
                telegramOptOutAt: true,
              },
            },
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
                    person: {
                      select: {
                        name: true,
                        email: true,
                        telegramChatId: true,
                        telegramOptInAt: true,
                        telegramOptOutAt: true,
                      },
                    },
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
              name: student.person?.name || "ALUNO",
              email: student.person?.email ?? null,
              telegramChatId: this.getOptedInTelegramChatId(student.person),
            });
          }

          if (effectiveGroups.includes("RESPONSAVEIS")) {
            student.guardians.forEach((link) => {
              if (!link.guardian) return;
              addRecipient({
                recipientType: "GUARDIAN",
                recipientId: link.guardian.id,
                name: link.guardian.person?.name || "RESPONSAVEL",
                email: link.guardian.person?.email ?? null,
                telegramChatId: this.getOptedInTelegramChatId(
                  link.guardian.person,
                ),
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
          person: {
            select: {
              name: true,
              email: true,
              telegramChatId: true,
              telegramOptInAt: true,
              telegramOptOutAt: true,
            },
          },
        },
      });

      guardians.forEach((guardian) =>
        addRecipient({
          recipientType: "GUARDIAN",
          recipientId: guardian.id,
          name: guardian.person?.name || "RESPONSAVEL",
          email: guardian.person?.email ?? null,
          telegramChatId: this.getOptedInTelegramChatId(guardian.person),
        }),
      );

      return Array.from(recipients.values());
    }

    const seriesClassIds =
      await this.getTeacherAudienceSeriesClassIds(currentUser);
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
            person: {
              select: {
                name: true,
                email: true,
                telegramChatId: true,
                telegramOptInAt: true,
                telegramOptOutAt: true,
              },
            },
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
                    person: {
                      select: {
                        name: true,
                        email: true,
                        telegramChatId: true,
                        telegramOptInAt: true,
                        telegramOptOutAt: true,
                      },
                    },
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
          name: enrollment.student.person?.name || "ALUNO",
          email: enrollment.student.person?.email ?? null,
          telegramChatId: this.getOptedInTelegramChatId(
            enrollment.student.person,
          ),
        });
      }

      if (normalizedGroups.includes("RESPONSAVEIS")) {
        enrollment.student.guardians.forEach((link) => {
          if (!link.guardian) return;
          addRecipient({
            recipientType: "GUARDIAN",
            recipientId: link.guardian.id,
            name: link.guardian.person?.name || "RESPONSAVEL",
            email: link.guardian.person?.email ?? null,
            telegramChatId: this.getOptedInTelegramChatId(link.guardian.person),
          });
        });
      }
    });

    return Array.from(recipients.values());
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

  private async getTenantSmtpConfiguration(
    tenantId: string,
    branchCode?: number | null,
  ): Promise<SmtpConfiguration> {
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
        branches:
          branchCode && branchCode >= DEFAULT_BRANCH_CODE
            ? {
                where: { branchCode, canceledAt: null },
                select: {
                  name: true,
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

    if (!tenant) {
      throw new BadRequestException("Escola não encontrada para envio.");
    }

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

  private async getTenantTelegramConfiguration(
    tenantId: string,
    branchCode?: number | null,
  ): Promise<TelegramConfiguration | null> {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
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

    if (!tenant) {
      throw new BadRequestException("Escola não encontrada para envio.");
    }

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

  private async sendTenantEmails(params: {
    tenantId: string;
    branchCode?: number | null;
    title: string;
    message: string;
    recipients: RecipientRecord[];
  }) {
    const tenant = await this.getTenantSmtpConfiguration(
      params.tenantId,
      params.branchCode,
    );

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
          .map((recipient) =>
            String(recipient.email || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    );

    if (uniqueRecipients.length === 0) {
      return 0;
    }

    const results = await Promise.all(
      uniqueRecipients.map(async (email) => {
        try {
          await transport.sendMail({
          from: `"${tenant.name}" <${tenant.smtpEmail}>`,
          to: email,
          replyTo: tenant.smtpEmail || undefined,
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
          });
          return true;
        } catch {
          return false;
        }
      }),
    );

    return results.filter(Boolean).length;
  }

  private async sendTenantTelegrams(params: {
    tenantId: string;
    branchCode?: number | null;
    title: string;
    message: string;
    recipients: RecipientRecord[];
  }) {
    const tenant = await this.getTenantTelegramConfiguration(
      params.tenantId,
      params.branchCode,
    );

    if (!tenant?.telegramBotToken || tenant.telegramEnabled === false) {
      throw new BadRequestException(
        "Esta escola ainda não possui o Telegram configurado para envio.",
      );
    }

    const uniqueRecipients = Array.from(
      new Map(
        params.recipients
          .filter((recipient) => recipient.telegramChatId?.trim())
          .map((recipient) => [recipient.telegramChatId!.trim(), recipient]),
      ).values(),
    );

    if (uniqueRecipients.length === 0) {
      return 0;
    }

    const text = [
      params.title,
      "",
      params.message,
      "",
      `ENVIADO PELA ESCOLA ${tenant.name}.`,
    ].join("\n");

    const results = await Promise.all(
      uniqueRecipients.map(async (recipient) => {
        try {
          const response = await fetch(
            `https://api.telegram.org/bot${tenant.telegramBotToken}/sendMessage`,
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
          return response.ok && responseBody?.ok === true;
        } catch {
          return false;
        }
      }),
    );

    return results.filter(Boolean).length;
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
        branches: {
          where: { branchCode: DEFAULT_BRANCH_CODE, canceledAt: null },
          select: { logoUrl: true },
          take: 1,
        },
        smtpHost: true,
        smtpPort: true,
        smtpEmail: true,
      },
    });
    const smtpConfiguration = await this.getTenantSmtpConfiguration(
      currentUser.tenantId,
      currentUser.branchCode,
    ).catch(() => null);
    const telegramConfiguration = await this.getTenantTelegramConfiguration(
      currentUser.tenantId,
      currentUser.branchCode,
    ).catch(() => null);

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
      emailConfigured:
        !!smtpConfiguration?.smtpHost &&
        !!smtpConfiguration?.smtpPort &&
        !!smtpConfiguration?.smtpEmail,
      telegramConfigured:
        !!telegramConfiguration?.telegramBotToken &&
        telegramConfiguration.telegramEnabled !== false,
      tenant: tenant
        ? {
            ...tenant,
            logoUrl: tenant.branches[0]?.logoUrl ?? null,
            branches: undefined,
          }
        : null,
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

    if (
      !createDto.sendInternal &&
      !createDto.sendEmail &&
      !createDto.sendTelegram
    ) {
      throw new BadRequestException(
        "Selecione pelo menos um canal: notificação interna, e-mail ou Telegram.",
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
              select: { person: { select: { name: true } } },
            })
          )?.person?.name || "PROFESSOR"
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
        sendTelegram: createDto.sendTelegram === true,
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
        branchCode: currentUser.branchCode,
        title,
        message,
        recipients,
      });
    }

    let telegramCount = 0;
    if (createDto.sendTelegram) {
      telegramCount = await this.sendTenantTelegrams({
        tenantId: currentUser.tenantId,
        branchCode: currentUser.branchCode,
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
        telegramCount,
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
        telegramCount,
        totalRecipients: recipients.length,
      },
    };
  }
}
