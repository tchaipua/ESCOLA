import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import * as crypto from "crypto";
import * as nodemailer from "nodemailer";
import { PrismaService } from "../../../../prisma/prisma.service";
import { getTenantContext } from "../../../../common/tenant/tenant.context";
import { SharedProfilesService } from "../../../shared-profiles/application/services/shared-profiles.service";
import { GlobalSettingsService } from "../../../global-settings/application/services/global-settings.service";
import { UpdatePersonNotificationSettingsDto } from "../dto/update-person-notification-settings.dto";

type NotificationUserRow = {
  id: string;
  sourceTypes: Array<"TEACHER" | "STUDENT" | "GUARDIAN" | "PERSON">;
  sourceLabel: string;
  name: string;
  cpf: string | null;
  email: string | null;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  telegramChatId: string | null;
  telegramUsername: string | null;
  telegramEnabled: boolean;
  telegramOptInAt: Date | null;
  telegramOptOutAt: Date | null;
  active: boolean;
};

@Injectable()
export class NotificationSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sharedProfilesService: SharedProfilesService,
    private readonly globalSettingsService: GlobalSettingsService,
  ) {}

  private tenantId() {
    return getTenantContext()!.tenantId;
  }

  private userId() {
    return getTenantContext()?.userId || undefined;
  }

  private normalizeEmail(email?: string | null) {
    return String(email || "")
      .trim()
      .toUpperCase();
  }

  private normalizeText(value?: string | null) {
    return String(value || "")
      .trim()
      .toUpperCase();
  }

  private buildFrontendLink(pathname: string, token: string) {
    const frontendBaseUrl = (
      process.env.FRONTEND_URL || "http://localhost:3000"
    ).replace(/\/$/, "");

    return `${frontendBaseUrl}${pathname}?token=${token}`;
  }

  private escapeHtml(value?: string | null) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private buildEmailConfirmationHtml(params: {
    personName: string;
    schoolName: string;
    verificationLink: string;
    expiresAt: Date;
  }) {
    const personName = this.escapeHtml(params.personName);
    const schoolName = this.escapeHtml(params.schoolName);
    const verificationLink = this.escapeHtml(params.verificationLink);
    const expiresAt = this.escapeHtml(
      params.expiresAt.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );

    return `<!doctype html>
<html>
  <body style="margin:0;background:#eef4ff;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef4ff;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;overflow:hidden;border-radius:24px;background:#ffffff;box-shadow:0 18px 45px rgba(15,23,42,0.16);">
            <tr>
              <td style="background:linear-gradient(135deg,#153a6a,#2563eb);padding:30px 34px;color:#ffffff;">
                <div style="font-size:11px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#b9ecff;">Confirmação de contato</div>
                <h1 style="margin:12px 0 0;font-size:28px;line-height:1.15;font-weight:900;">${schoolName}</h1>
                <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#dbeafe;">Valide seu e-mail para receber comunicados e notificações da escola com segurança.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:34px;">
                <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#334155;">Olá, <strong style="color:#0f172a;">${personName}</strong>.</p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#475569;">Recebemos uma solicitação para confirmar este endereço de e-mail no sistema da escola. Clique no botão abaixo para concluir a validação.</p>
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="border-radius:14px;background:#2563eb;">
                      <a href="${verificationLink}" style="display:inline-block;padding:15px 24px;border-radius:14px;background:#2563eb;color:#ffffff;font-size:14px;font-weight:800;letter-spacing:0.08em;text-decoration:none;text-transform:uppercase;">Confirmar e-mail</a>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:26px;padding:16px 18px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;">
                  <div style="font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">Validade do link</div>
                  <div style="margin-top:6px;font-size:14px;font-weight:700;color:#1e293b;">${expiresAt}</div>
                </div>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.7;color:#64748b;">Se você não solicitou essa confirmação, ignore este e-mail. Nenhuma alteração será feita sem o clique no botão de confirmação.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b;">
                Enviado automaticamente por ${schoolName}. Por segurança, não responda este e-mail com senhas ou códigos.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private async loadCredentialMap(emails: Array<string | null | undefined>) {
    const normalizedEmails = Array.from(
      new Set(
        emails
          .map((email) => this.normalizeEmail(email))
          .filter((email) => email.length > 0),
      ),
    );

    if (!normalizedEmails.length) {
      return new Map<string, { emailVerified: boolean; verifiedAt: Date | null }>();
    }

    const credentials = await this.prisma.emailCredential.findMany({
      where: {
        email: { in: normalizedEmails },
        canceledAt: null,
      },
      select: {
        email: true,
        emailVerified: true,
        verifiedAt: true,
      },
    });

    return new Map(
      credentials.map((credential) => [
        credential.email,
        {
          emailVerified: credential.emailVerified,
          verifiedAt: credential.verifiedAt,
        },
      ]),
    );
  }

  private applyCredentialStatus<T extends { email: string | null }>(
    row: T,
    credentialMap: Map<string, { emailVerified: boolean; verifiedAt: Date | null }>,
  ) {
    const credential = credentialMap.get(this.normalizeEmail(row.email));
    return {
      ...row,
      emailVerified: credential?.emailVerified === true,
      emailVerifiedAt: credential?.verifiedAt || null,
    };
  }

  private mergeSourceLabels(sourceTypes: NotificationUserRow["sourceTypes"]) {
    const labels = sourceTypes.map((sourceType) => {
      if (sourceType === "TEACHER") return "PROFESSOR";
      if (sourceType === "STUDENT") return "ALUNO";
      if (sourceType === "GUARDIAN") return "RESPONSAVEL";
      return "PESSOA";
    });

    return Array.from(new Set(labels)).join(" / ");
  }

  async listUsers() {
    const tenantId = this.tenantId();
    const people = await this.prisma.person.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        cpf: true,
        telegramChatId: true,
        telegramUsername: true,
        telegramOptInAt: true,
        telegramOptOutAt: true,
        canceledAt: true,
        teachers: {
          where: { tenantId },
          select: { id: true, canceledAt: true },
        },
        students: {
          where: { tenantId },
          select: { id: true, canceledAt: true },
        },
        guardians: {
          where: { tenantId },
          select: { id: true, canceledAt: true },
        },
      },
    });

    const rows: Array<Omit<NotificationUserRow, "emailVerified" | "emailVerifiedAt">> =
      people.map((person) => {
        const sourceTypes: NotificationUserRow["sourceTypes"] = ["PERSON"];
        if (person.teachers.length > 0) sourceTypes.push("TEACHER");
        if (person.students.length > 0) sourceTypes.push("STUDENT");
        if (person.guardians.length > 0) sourceTypes.push("GUARDIAN");

        return {
          id: person.id,
          sourceTypes,
          sourceLabel: this.mergeSourceLabels(sourceTypes),
          name: this.normalizeText(person.name),
          cpf: person.cpf,
          email: this.normalizeEmail(person.email) || null,
          telegramChatId: person.telegramChatId,
          telegramUsername: person.telegramUsername,
          telegramEnabled: Boolean(
            person.telegramChatId &&
              person.telegramOptInAt &&
              !person.telegramOptOutAt,
          ),
          telegramOptInAt: person.telegramOptInAt,
          telegramOptOutAt: person.telegramOptOutAt,
          active: !person.canceledAt,
        };
      });

    const credentialMap = await this.loadCredentialMap(
      rows.map((row) => row.email),
    );

    return rows
      .map((row) => this.applyCredentialStatus(row, credentialMap))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  private async sendEmailUsingGlobalSettings(payload: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) {
    const settings = await this.globalSettingsService.findSettings();

    if (!settings.emailEnabled) {
      throw new BadRequestException(
        "O envio de e-mail global esta desativado nas configuracoes.",
      );
    }

    const smtpHost = String(settings.emailSmtpHost || "").trim();
    const smtpPort = Number(settings.emailSmtpPort || 0) || 465;
    const smtpUser = String(settings.emailSmtpUser || "").trim();
    const smtpPassword = String(settings.emailSmtpPassword || "").trim();
    const smtpSecure = settings.emailUseSsl !== false;
    const smtpAuthenticate = settings.emailUseAuth !== false;

    if (!smtpHost) {
      throw new BadRequestException("SMTP global nao configurado.");
    }

    if (smtpAuthenticate && (!smtpUser || !smtpPassword)) {
      throw new BadRequestException("SMTP global incompleto.");
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: smtpAuthenticate
        ? {
            user: smtpUser,
            pass: smtpPassword,
          }
        : undefined,
    });

    const fromAddress =
      String(settings.emailSenderEmail || "").trim() ||
      smtpUser ||
      `no-reply@${smtpHost}`;
    const fromName =
      String(settings.emailSenderName || "").trim() || "MSINFOR SISTEMAS";
    const replyTo = String(settings.emailReplyTo || "").trim() || undefined;

    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: payload.to,
      replyTo,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
  }

  async sendEmailConfirmation(email: string) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      throw new BadRequestException("Informe um e-mail valido.");
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationHash = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [person, tenant] = await Promise.all([
      this.prisma.person.findFirst({
        where: {
          tenantId: this.tenantId(),
          email: normalizedEmail,
        },
        select: {
          name: true,
        },
      }),
      this.prisma.tenant.findFirst({
        where: {
          id: this.tenantId(),
        },
        select: {
          name: true,
        },
      }),
    ]);

    await this.sharedProfilesService.storeEmailCredentialVerificationToken(
      normalizedEmail,
      verificationHash,
      expiresAt,
      this.userId(),
    );

    const verificationLink = this.buildFrontendLink(
      "/confirm-email",
      verificationToken,
    );
    const schoolName = this.normalizeText(tenant?.name || "ESCOLA");
    const personName = this.normalizeText(person?.name || normalizedEmail);

    await this.sendEmailUsingGlobalSettings({
      to: normalizedEmail,
      subject: `Confirmação de e-mail - ${schoolName}`,
      text: `${personName}, confirme seu e-mail da escola ${schoolName} acessando: ${verificationLink}`,
      html: this.buildEmailConfirmationHtml({
        personName,
        schoolName,
        verificationLink,
        expiresAt,
      }),
    });

    return {
      message: "E-mail de confirmacao enviado com sucesso.",
      email: normalizedEmail,
      expiresAt,
      devVerificationLink:
        process.env.NODE_ENV !== "production" ? verificationLink : undefined,
    };
  }

  async updatePersonNotificationSettings(
    personId: string,
    dto: UpdatePersonNotificationSettingsDto,
  ) {
    const tenantId = this.tenantId();
    const currentUserId = this.userId();
    const currentPerson = await this.prisma.person.findFirst({
      where: { id: personId, tenantId },
      select: {
        id: true,
        email: true,
        telegramOptInAt: true,
      },
    });

    if (!currentPerson) {
      throw new NotFoundException("Pessoa não encontrada.");
    }

    const data: Record<string, unknown> = {
      updatedBy: currentUserId,
    };

    const roleData: Record<string, unknown> = {
      updatedBy: currentUserId,
    };

    if (Object.prototype.hasOwnProperty.call(dto, "email")) {
      const normalizedEmail = this.normalizeEmail(dto.email);
      data.email = normalizedEmail || null;
      roleData.email = normalizedEmail || null;

      if (normalizedEmail) {
        await this.sharedProfilesService.ensureEmailCredential(
          normalizedEmail,
          { userId: currentUserId },
        );
      }
    }

    if (Object.prototype.hasOwnProperty.call(dto, "telegramChatId")) {
      const telegramChatId = String(dto.telegramChatId || "").trim();
      data.telegramChatId = telegramChatId || null;
      roleData.telegramChatId = telegramChatId || null;
    }

    if (Object.prototype.hasOwnProperty.call(dto, "telegramUsername")) {
      const telegramUsername = this.normalizeText(dto.telegramUsername);
      data.telegramUsername = telegramUsername || null;
      roleData.telegramUsername = telegramUsername || null;
    }

    if (
      Object.prototype.hasOwnProperty.call(dto, "telegramOptInEnabled")
    ) {
      data.telegramOptInAt = dto.telegramOptInEnabled
        ? currentPerson.telegramOptInAt || new Date()
        : null;
      data.telegramOptOutAt = dto.telegramOptInEnabled ? null : new Date();
      roleData.telegramOptInAt = data.telegramOptInAt;
      roleData.telegramOptOutAt = data.telegramOptOutAt;
    }

    const updatedPerson = await this.prisma.$transaction(async (tx) => {
      const person = await tx.person.update({
        where: { id: currentPerson.id },
        data,
      });

      await Promise.all([
        tx.teacher.updateMany({
          where: { tenantId, personId: currentPerson.id },
          data: roleData,
        }),
        tx.student.updateMany({
          where: { tenantId, personId: currentPerson.id },
          data: roleData,
        }),
        tx.guardian.updateMany({
          where: { tenantId, personId: currentPerson.id },
          data: roleData,
        }),
      ]);

      return person;
    });

    return {
      message: "Dados de notificação atualizados com sucesso.",
      personId: updatedPerson.id,
    };
  }
}
