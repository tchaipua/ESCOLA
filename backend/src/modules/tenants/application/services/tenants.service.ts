import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CreateTenantDto } from "../dto/create-tenant.dto";
import { PurgeTenantDto } from "../dto/purge-tenant.dto";
import { PurgeTenantDeletionSummary } from "../dto/purge-tenant-response.dto";
import { UpdateTenantDto } from "../dto/update-tenant.dto";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import * as nodemailer from "nodemailer";
import {
  getDefaultPermissionsForRole,
  normalizePermissions,
  serializePermissions,
} from "../../../../common/auth/user-permissions";
import {
  getDefaultAccessProfileForRole,
  getComplementaryProfilePermissions,
  normalizeComplementaryAccessProfiles,
  normalizeAccessProfileCode,
  resolveAccountPermissions,
  serializeComplementaryAccessProfiles,
} from "../../../../common/auth/access-profiles";
import { tenantContext } from "../../../../common/tenant/tenant.context";
import type { ICurrentUser } from "../../../../common/decorators/current-user.decorator";
import { SharedProfilesService } from "../../../shared-profiles/application/services/shared-profiles.service";
import {
  DEFAULT_BRANCH_CODE,
  normalizeBranchCode,
} from "../../../../common/tenant/branch.constants";
import {
  ensureDefaultTenantBranch,
  listTenantBranches,
  mapTenantBranchSummary,
} from "../../../../common/tenant/tenant-branches";
import {
  isValidCnpj,
  normalizeCnpj,
} from "../../../../common/validation/cnpj";

type EmailUsageEntityType =
  | "ADMIN_USER"
  | "USER"
  | "TEACHER"
  | "STUDENT"
  | "GUARDIAN";

export interface EmailUsageItem {
  entityType: EmailUsageEntityType;
  entityLabel: string;
  recordId: string;
  tenantId: string;
  tenantName: string;
  recordName: string;
  currentEmail: string;
  role?: string;
  document?: string | null;
  updatedAt: Date;
  updatedBy?: string | null;
}

type TenantBranchPayload = {
  branchCode?: number;
  name?: string;
  logoUrl?: string | null;
  document?: string | null;
  rg?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  nickname?: string | null;
  corporateName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  cellphone1?: string | null;
  cellphone2?: string | null;
  email?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
  stockControlMode?: string | null;
  stockIntegerQuantityMode?: string | null;
  stockLotControlMode?: string | null;
  stockExpirationControlMode?: string | null;
  stockGridControlMode?: string | null;
  stockNegativeControlMode?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | string | null;
  smtpTimeout?: number | string | null;
  smtpAuthenticate?: boolean | string | number | null;
  smtpSecure?: boolean | string | number | null;
  smtpAuthType?: string | null;
  smtpEmail?: string | null;
  smtpPassword?: string | null;
  telegramEnabled?: boolean | string | number | null;
  telegramBotToken?: string | null;
  telegramBotUsername?: string | null;
  telegramHeaderImageUrl?: string | null;
  storageProviderAccessKeyId?: string | null;
  storageProviderSecretAccessKey?: string | null;
  storageBucketName?: string | null;
  storageFolderName?: string | null;
  storageDefaultAcl?: string | null;
  storageDefaultExpiration?: number | string | null;
  storageRegion?: string | null;
  storageEndpoint?: string | null;
  storageCustomEndpoint?: string | null;
};

type SmtpConfiguration = {
  name: string;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpTimeout?: number | null;
  smtpAuthenticate?: boolean | null;
  smtpSecure?: boolean | null;
  smtpEmail?: string | null;
  smtpPassword?: string | null;
};

type AccessUserPayload = {
  name?: string;
  email?: string;
  password?: string;
  birthDate?: string;
  rg?: string;
  cpf?: string;
  cnpj?: string;
  nickname?: string;
  corporateName?: string;
  phone?: string;
  whatsapp?: string;
  cellphone1?: string;
  cellphone2?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  city?: string;
  state?: string;
  neighborhood?: string;
  complement?: string;
  photoUrl?: string | null;
  complementaryProfiles?: string[];
  role?: string;
  accessProfile?: string;
  permissions?: string[];
  branchAccessCodes?: number[];
  cashierOnly?: boolean;
};

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sharedProfilesService: SharedProfilesService,
  ) {}

  private readonly masterAuditUser = "MSINFOR_MASTER";

  private runAsMasterTenantContext<T>(
    tenantId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const context = {
      userId: this.masterAuditUser,
      tenantId,
      branchCode: DEFAULT_BRANCH_CODE,
      role: "SOFTHOUSE_ADMIN",
      isMaster: true,
    };

    return tenantContext.run(context, async () => await operation());
  }

  private parseBoolean(value: unknown, defaultValue: boolean): boolean {
    if (value === undefined || value === null || value === "")
      return defaultValue;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      return (
        normalized === "true" ||
        normalized === "1" ||
        normalized === "yes" ||
        normalized === "sim"
      );
    }
    return defaultValue;
  }

  private parseOptionalInt(value: unknown): number | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const num = Number(value);
    if (!Number.isInteger(num))
      throw new ConflictException(
        "Valor numérico inválido na configuração SMTP.",
      );
    return num;
  }

  private normalizeEmail(email?: string | null): string {
    return String(email || "")
      .trim()
      .toUpperCase();
  }

  private normalizeOptionalText(value?: string | null) {
    const normalized = String(value || "")
      .trim()
      .toUpperCase();
    return normalized || null;
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

  private buildEnvSmtpConfiguration(tenantName: string): SmtpConfiguration | null {
    const smtpHost = String(process.env.SMTP_HOST || "").trim();
    const smtpPort = Number(process.env.SMTP_PORT || 0);
    const smtpEmail = String(process.env.SMTP_EMAIL || "").trim();

    if (!smtpHost || !Number.isInteger(smtpPort) || smtpPort <= 0 || !smtpEmail) {
      return null;
    }

    return {
      name: tenantName,
      smtpHost,
      smtpPort,
      smtpTimeout: Number(process.env.SMTP_TIMEOUT || 0) || 60,
      smtpAuthenticate: this.parseBoolean(
        process.env.SMTP_AUTHENTICATE,
        !!String(process.env.SMTP_PASSWORD || "").trim(),
      ),
      smtpSecure: this.parseBoolean(process.env.SMTP_SECURE, smtpPort === 465),
      smtpEmail,
      smtpPassword: String(process.env.SMTP_PASSWORD || "").trim() || null,
    };
  }

  private async sendBranchVerificationEmail(params: {
    tenantId: string;
    branchId: string;
    email: string;
    token: string;
  }) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: params.tenantId, canceledAt: null },
      select: {
        name: true,
        smtpHost: true,
        smtpPort: true,
        smtpTimeout: true,
        smtpAuthenticate: true,
        smtpSecure: true,
        smtpEmail: true,
        smtpPassword: true,
        branches: {
          where: { id: params.branchId, canceledAt: null },
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
        },
      },
    });

    const branchSmtp = tenant?.branches[0];
    const tenantSmtp = tenant
      ? {
          name: tenant.name,
          smtpHost: tenant.smtpHost,
          smtpPort: tenant.smtpPort,
          smtpTimeout: tenant.smtpTimeout,
          smtpAuthenticate: tenant.smtpAuthenticate,
          smtpSecure: tenant.smtpSecure,
          smtpEmail: tenant.smtpEmail,
          smtpPassword: tenant.smtpPassword,
        }
      : null;
    const smtp = this.hasSmtpInformation(branchSmtp)
      ? branchSmtp
      : tenantSmtp?.smtpHost && tenantSmtp.smtpPort && tenantSmtp.smtpEmail
        ? tenantSmtp
        : this.buildEnvSmtpConfiguration(tenant?.name || "ESCOLA");

    if (!smtp?.smtpHost || !smtp.smtpPort || !smtp.smtpEmail) {
      throw new BadRequestException(
        "Esta escola ainda não possui o SMTP configurado para envio de e-mail.",
      );
    }

    if (smtp.smtpAuthenticate && !smtp.smtpPassword) {
      throw new BadRequestException(
        "Esta escola possui SMTP incompleto. Revise usuário e senha de envio.",
      );
    }

    const frontendBaseUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const confirmationLink = `${frontendBaseUrl}/confirm-email?target=branch&token=${params.token}`;
    const transporter = nodemailer.createTransport({
      host: smtp.smtpHost,
      port: smtp.smtpPort,
      secure: smtp.smtpSecure || false,
      connectionTimeout: (smtp.smtpTimeout || 60) * 1000,
      auth: smtp.smtpAuthenticate
        ? { user: smtp.smtpEmail, pass: smtp.smtpPassword || "" }
        : undefined,
    });

    await transporter.sendMail({
      from: `"${smtp.name}" <${smtp.smtpEmail}>`,
      to: params.email,
      subject: "CONFIRMAÇÃO DE E-MAIL DA FILIAL",
      text: `Confirme o e-mail da filial acessando: ${confirmationLink}`,
      html: `<p>Confirme o e-mail da filial acessando o link abaixo:</p><p><a href="${confirmationLink}">CONFIRMAR E-MAIL DA FILIAL</a></p>`,
    });
  }

  private normalizeBranchStockParameterMode(value?: string | null) {
    const normalized = String(value || "")
      .trim()
      .toUpperCase();

    if (!normalized) return "BY_PRODUCT";

    if (["NO", "YES", "BY_PRODUCT"].includes(normalized)) {
      return normalized;
    }

    throw new BadRequestException(
      "Parâmetro de estoque da filial inválido.",
    );
  }

  private buildTenantBranchData(payload: TenantBranchPayload) {
    const normalizedCnpj = this.normalizeOptionalText(payload.cnpj)
      ? normalizeCnpj(String(payload.cnpj))
      : null;

    if (normalizedCnpj && !isValidCnpj(normalizedCnpj)) {
      throw new BadRequestException("CNPJ inválido.");
    }

    return {
      logoUrl: String(payload.logoUrl || "").trim() || null,
      document: this.normalizeOptionalText(payload.document),
      rg: this.normalizeOptionalText(payload.rg),
      cpf: this.normalizeOptionalText(payload.cpf),
      cnpj: normalizedCnpj,
      nickname: this.normalizeOptionalText(payload.nickname),
      corporateName: this.normalizeOptionalText(payload.corporateName),
      phone: this.normalizeOptionalText(payload.phone),
      whatsapp: this.normalizeOptionalText(payload.whatsapp),
      cellphone1: this.normalizeOptionalText(payload.cellphone1),
      cellphone2: this.normalizeOptionalText(payload.cellphone2),
      email: this.normalizeOptionalText(payload.email),
      zipCode: this.normalizeOptionalText(payload.zipCode),
      street: this.normalizeOptionalText(payload.street),
      number: this.normalizeOptionalText(payload.number),
      city: this.normalizeOptionalText(payload.city),
      state: this.normalizeOptionalText(payload.state),
      neighborhood: this.normalizeOptionalText(payload.neighborhood),
      complement: this.normalizeOptionalText(payload.complement),
      stockControlMode: this.normalizeBranchStockParameterMode(
        payload.stockControlMode,
      ),
      stockIntegerQuantityMode: this.normalizeBranchStockParameterMode(
        payload.stockIntegerQuantityMode,
      ),
      stockLotControlMode: this.normalizeBranchStockParameterMode(
        payload.stockLotControlMode,
      ),
      stockExpirationControlMode: this.normalizeBranchStockParameterMode(
        payload.stockExpirationControlMode,
      ),
      stockGridControlMode: this.normalizeBranchStockParameterMode(
        payload.stockGridControlMode,
      ),
      stockNegativeControlMode: this.normalizeBranchStockParameterMode(
        payload.stockNegativeControlMode,
      ),
      ...this.buildTenantBranchSmtpData(payload),
      ...this.buildTenantBranchTelegramData(payload),
      ...this.buildTenantBranchStorageData(payload),
    };
  }

  private normalizeEntityType(
    entityType?: string | null,
  ): EmailUsageEntityType {
    const normalized = String(entityType || "")
      .trim()
      .toUpperCase();
    const validTypes: EmailUsageEntityType[] = [
      "ADMIN_USER",
      "USER",
      "TEACHER",
      "STUDENT",
      "GUARDIAN",
    ];

    if (!validTypes.includes(normalized as EmailUsageEntityType)) {
      throw new BadRequestException(
        "Tipo de registro inválido para atualização de email.",
      );
    }

    return normalized as EmailUsageEntityType;
  }

  private assertEmailForLookup(email?: string | null): string {
    const normalized = this.normalizeEmail(email);
    if (!normalized) {
      throw new BadRequestException("Informe um email para consulta.");
    }
    if (!normalized.includes("@")) {
      throw new BadRequestException("Informe um email válido para consulta.");
    }
    return normalized;
  }

  private validateAndNormalizeSmtp(payload: {
    smtpHost?: string;
    smtpPort?: number | string;
    smtpTimeout?: number | string;
    smtpAuthenticate?: boolean | string | number;
    smtpSecure?: boolean | string | number;
    smtpAuthType?: string;
    smtpEmail?: string;
    smtpPassword?: string;
  }) {
    const smtpEmail = payload.smtpEmail?.trim() || "";
    const smtpPassword = payload.smtpPassword?.trim() || "";
    const smtpHostInput = payload.smtpHost?.trim() || "";
    const smtpPortInput = this.parseOptionalInt(payload.smtpPort);
    const smtpTimeoutInput = this.parseOptionalInt(payload.smtpTimeout);
    const smtpAuthTypeInput = payload.smtpAuthType?.trim().toUpperCase() || "";

    if ((smtpEmail && !smtpPassword) || (!smtpEmail && smtpPassword)) {
      throw new ConflictException(
        "Para configurar SMTP, informe usuário e senha juntos.",
      );
    }

    const hasCredentials = !!smtpEmail && !!smtpPassword;

    const smtpSecure = this.parseBoolean(
      payload.smtpSecure,
      smtpAuthTypeInput === "SSL" || smtpPortInput === 465,
    );

    const smtpAuthenticate = this.parseBoolean(
      payload.smtpAuthenticate,
      hasCredentials,
    );

    if (smtpAuthenticate && !hasCredentials) {
      throw new ConflictException(
        "Autenticação SMTP ativa exige usuário e senha.",
      );
    }

    const smtpHost = smtpHostInput || (hasCredentials ? "smtp.gmail.com" : "");
    const smtpPort =
      smtpPortInput ?? (smtpHost ? (smtpSecure ? 465 : 587) : undefined);
    const smtpTimeout = smtpTimeoutInput ?? (smtpHost ? 60 : undefined);
    const smtpAuthType =
      smtpAuthTypeInput || (smtpHost ? (smtpSecure ? "SSL" : "STARTTLS") : "");

    if (smtpPort !== undefined && (smtpPort < 1 || smtpPort > 65535)) {
      throw new ConflictException(
        "Porta SMTP inválida. Use valor entre 1 e 65535.",
      );
    }

    if (smtpTimeout !== undefined && (smtpTimeout < 5 || smtpTimeout > 600)) {
      throw new ConflictException(
        "Tempo limite SMTP inválido. Use valor entre 5 e 600 segundos.",
      );
    }

    payload.smtpHost = smtpHost ? smtpHost.toLowerCase() : undefined;
    payload.smtpPort = smtpPort;
    payload.smtpTimeout = smtpTimeout;
    payload.smtpAuthenticate = smtpHost ? smtpAuthenticate : undefined;
    payload.smtpSecure = smtpHost ? smtpSecure : undefined;
    payload.smtpAuthType = smtpAuthType || undefined;
    payload.smtpEmail = smtpEmail ? smtpEmail.toLowerCase() : undefined;
    payload.smtpPassword = smtpPassword || undefined;
  }

  private buildStorageConfigurationData(payload: {
    storageProviderAccessKeyId?: string | null;
    storageProviderSecretAccessKey?: string | null;
    storageBucketName?: string | null;
    storageFolderName?: string | null;
    storageDefaultAcl?: string | null;
    storageDefaultExpiration?: number | string | null;
    storageRegion?: string | null;
    storageEndpoint?: string | null;
    storageCustomEndpoint?: string | null;
  }) {
    const storageDefaultExpiration = this.parseOptionalInt(
      payload.storageDefaultExpiration,
    );

    if (
      storageDefaultExpiration !== undefined &&
      storageDefaultExpiration < 1
    ) {
      throw new ConflictException(
        "Expiração padrão do storage deve ser maior que zero.",
      );
    }

    return {
      storageProviderAccessKeyId:
        String(payload.storageProviderAccessKeyId || "").trim() || null,
      storageProviderSecretAccessKey:
        String(payload.storageProviderSecretAccessKey || "").trim() || null,
      storageBucketName:
        String(payload.storageBucketName || "").trim() || null,
      storageFolderName:
        String(payload.storageFolderName || "").trim() || null,
      storageDefaultAcl:
        String(payload.storageDefaultAcl || "").trim() || null,
      storageDefaultExpiration: storageDefaultExpiration ?? null,
      storageRegion:
        String(payload.storageRegion || "").trim() || null,
      storageEndpoint:
        String(payload.storageEndpoint || "").trim() || null,
      storageCustomEndpoint:
        String(payload.storageCustomEndpoint || "").trim() || null,
    };
  }

  private buildTelegramConfigurationData(payload: {
    telegramEnabled?: boolean | string | number | null;
    telegramBotToken?: string | null;
    telegramBotUsername?: string | null;
    telegramHeaderImageUrl?: string | null;
  }) {
    const hasTelegramConfiguration =
      payload.telegramEnabled !== undefined ||
      payload.telegramBotToken !== undefined ||
      payload.telegramBotUsername !== undefined ||
      payload.telegramHeaderImageUrl !== undefined;

    if (!hasTelegramConfiguration) {
      return {};
    }

    const telegramBotToken =
      String(payload.telegramBotToken || "").trim() || null;
    const telegramBotUsername =
      String(payload.telegramBotUsername || "").trim() || null;

    return {
      telegramEnabled: this.parseBoolean(
        payload.telegramEnabled,
        !!telegramBotToken,
      ),
      telegramBotToken,
      telegramBotUsername,
      telegramHeaderImageUrl:
        String(payload.telegramHeaderImageUrl || "").trim() || null,
    };
  }

  private buildTenantBranchSmtpData(payload: TenantBranchPayload) {
    const smtpHostInput = String(payload.smtpHost || "").trim();
    const smtpEmail = String(payload.smtpEmail || "").trim();
    const smtpPassword = String(payload.smtpPassword || "").trim();
    const smtpPortInput = this.parseOptionalInt(payload.smtpPort);
    const smtpTimeoutInput = this.parseOptionalInt(payload.smtpTimeout);
    const smtpAuthTypeInput = String(payload.smtpAuthType || "")
      .trim()
      .toUpperCase();
    const hasSmtpAccountConfiguration =
      !!smtpHostInput ||
      !!smtpEmail ||
      !!smtpPassword;

    if (!hasSmtpAccountConfiguration) {
      return {
        smtpHost: null,
        smtpPort: null,
        smtpTimeout: null,
        smtpAuthenticate: null,
        smtpSecure: null,
        smtpAuthType: null,
        smtpEmail: null,
        smtpPassword: null,
      };
    }

    if ((smtpEmail && !smtpPassword) || (!smtpEmail && smtpPassword)) {
      throw new ConflictException(
        "Para configurar SMTP da filial, informe usuário e senha juntos.",
      );
    }

    const hasCredentials = !!smtpEmail && !!smtpPassword;
    const smtpSecure = this.parseBoolean(
      payload.smtpSecure,
      smtpAuthTypeInput === "SSL" || smtpPortInput === 465,
    );
    const smtpAuthenticate = this.parseBoolean(
      payload.smtpAuthenticate,
      hasCredentials,
    );

    if (smtpAuthenticate && !hasCredentials) {
      throw new ConflictException(
        "Autenticação SMTP da filial exige usuário e senha.",
      );
    }

    const smtpHost = smtpHostInput || (hasCredentials ? "smtp.gmail.com" : "");
    const smtpPort =
      smtpPortInput ?? (smtpHost ? (smtpSecure ? 465 : 587) : undefined);
    const smtpTimeout = smtpTimeoutInput ?? (smtpHost ? 60 : undefined);
    const smtpAuthType =
      smtpAuthTypeInput || (smtpHost ? (smtpSecure ? "SSL" : "STARTTLS") : "");

    if (!smtpHost || !smtpPort || !smtpEmail) {
      throw new ConflictException(
        "SMTP da filial incompleto. Informe host, porta e usuário de envio.",
      );
    }

    if (smtpPort < 1 || smtpPort > 65535) {
      throw new ConflictException(
        "Porta SMTP da filial inválida. Use valor entre 1 e 65535.",
      );
    }

    if (smtpTimeout !== undefined && (smtpTimeout < 5 || smtpTimeout > 600)) {
      throw new ConflictException(
        "Tempo limite SMTP da filial inválido. Use valor entre 5 e 600 segundos.",
      );
    }

    return {
      smtpHost: smtpHost.toLowerCase(),
      smtpPort,
      smtpTimeout,
      smtpAuthenticate,
      smtpSecure,
      smtpAuthType: smtpAuthType || null,
      smtpEmail: smtpEmail.toLowerCase(),
      smtpPassword,
    };
  }

  private buildTenantBranchStorageData(payload: TenantBranchPayload) {
    return this.buildStorageConfigurationData(payload);
  }

  private buildTenantBranchTelegramData(payload: TenantBranchPayload) {
    const hasTelegramConfiguration =
      payload.telegramEnabled !== undefined ||
      payload.telegramBotToken !== undefined ||
      payload.telegramBotUsername !== undefined ||
      payload.telegramHeaderImageUrl !== undefined;

    if (!hasTelegramConfiguration) {
      return {
        telegramEnabled: null,
        telegramBotToken: null,
        telegramBotUsername: null,
        telegramHeaderImageUrl: null,
      };
    }

    return this.buildTelegramConfigurationData(payload);
  }

  private mapUserEmailUsage(record: {
    id: string;
    name: string;
    email: string | null;
    role: string;
    updatedAt: Date;
    updatedBy?: string | null;
    tenant: { id: string; name: string };
  }): EmailUsageItem {
    const isAdmin = record.role === "ADMIN";
    return {
      entityType: isAdmin ? "ADMIN_USER" : "USER",
      entityLabel: isAdmin ? "ADMINISTRADOR" : "USUARIO DO SISTEMA",
      recordId: record.id,
      tenantId: record.tenant.id,
      tenantName: record.tenant.name,
      recordName: record.name,
      currentEmail: record.email || "",
      role: record.role,
      document: null,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
    };
  }

  private mapTeacherEmailUsage(record: {
    id: string;
    email: string | null;
    person?: { name?: string | null } | null;
    updatedAt: Date;
    updatedBy?: string | null;
    tenant: { id: string; name: string };
  }): EmailUsageItem {
    return {
      entityType: "TEACHER",
      entityLabel: "PROFESSOR",
      recordId: record.id,
      tenantId: record.tenant.id,
      tenantName: record.tenant.name,
      recordName: record.person?.name || "PROFESSOR",
      currentEmail: record.email || "",
      document: null,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
    };
  }

  private mapStudentEmailUsage(record: {
    id: string;
    email: string | null;
    person?: { name?: string | null } | null;
    updatedAt: Date;
    updatedBy?: string | null;
    tenant: { id: string; name: string };
  }): EmailUsageItem {
    return {
      entityType: "STUDENT",
      entityLabel: "ALUNO",
      recordId: record.id,
      tenantId: record.tenant.id,
      tenantName: record.tenant.name,
      recordName: record.person?.name || "ALUNO",
      currentEmail: record.email || "",
      document: null,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
    };
  }

  private mapGuardianEmailUsage(record: {
    id: string;
    email: string | null;
    person?: { name?: string | null } | null;
    updatedAt: Date;
    updatedBy?: string | null;
    tenant: { id: string; name: string };
  }): EmailUsageItem {
    return {
      entityType: "GUARDIAN",
      entityLabel: "RESPONSAVEL",
      recordId: record.id,
      tenantId: record.tenant.id,
      tenantName: record.tenant.name,
      recordName: record.person?.name || "RESPONSAVEL",
      currentEmail: record.email || "",
      document: null,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
    };
  }

  async findSharedProfileByCpf(tenantId: string, cpf: string) {
    return this.runAsMasterTenantContext(tenantId, async () => {
      const profile = await this.sharedProfilesService.findSharedProfileByCpf(
        tenantId,
        cpf,
      );
      if (!profile) {
        throw new NotFoundException(
          "Nenhum cadastro compartilhável encontrado.",
        );
      }
      return profile;
    });
  }

  async create(createTenantDto: CreateTenantDto) {
    if (createTenantDto.email)
      createTenantDto.email = createTenantDto.email.toUpperCase();
    if (createTenantDto.adminEmail)
      createTenantDto.adminEmail = createTenantDto.adminEmail.toUpperCase();

    this.validateAndNormalizeSmtp(createTenantDto);

    const defaultBranchPayload =
      (createTenantDto.defaultBranch as TenantBranchPayload | undefined) ||
      (createTenantDto as TenantBranchPayload);

    const normalizedAdminPassword = String(
      createTenantDto.adminPassword || "",
    ).trim();
    let hashedPassword: string | null = null;
    if (normalizedAdminPassword) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(normalizedAdminPassword, salt);
    }
    const adminPasswordHash =
      hashedPassword ||
      (await bcrypt.hash("Admin001", await bcrypt.genSalt(10)));

    const result = await this.prisma.$transaction(async (tx) => {
      const newTenant = await tx.tenant.create({
        data: {
          name: createTenantDto.name,
          interestRate: createTenantDto.interestRate,
          penaltyRate: createTenantDto.penaltyRate,
          penaltyValue: createTenantDto.penaltyValue,
          penaltyGracePeriod: createTenantDto.penaltyGracePeriod,
          interestGracePeriod: createTenantDto.interestGracePeriod,
          smtpHost: createTenantDto.smtpHost,
          smtpPort: createTenantDto.smtpPort as number | undefined,
          smtpTimeout: createTenantDto.smtpTimeout as number | undefined,
          smtpAuthenticate: createTenantDto.smtpAuthenticate as
            | boolean
            | undefined,
          smtpSecure: createTenantDto.smtpSecure as boolean | undefined,
          smtpAuthType: createTenantDto.smtpAuthType,
          smtpEmail: createTenantDto.smtpEmail,
          smtpPassword: createTenantDto.smtpPassword,
          ...this.buildTelegramConfigurationData(createTenantDto),
          ...this.buildStorageConfigurationData(createTenantDto),
          createdBy: this.masterAuditUser,
          updatedBy: this.masterAuditUser,
        },
      });

      const defaultBranch = await ensureDefaultTenantBranch(
        tx,
        newTenant.id,
        this.masterAuditUser,
      );

      await tx.tenantBranch.update({
        where: { id: defaultBranch.id },
        data: {
          name: "FILIAL 1",
          ...this.buildTenantBranchData(defaultBranchPayload),
          updatedBy: this.masterAuditUser,
        },
      });

      const newAdmin = await tx.user.create({
        data: {
          tenantId: newTenant.id,
          name: createTenantDto.adminName,
          email: createTenantDto.adminEmail,
          password: adminPasswordHash,
          role: "ADMIN",
          createdBy: this.masterAuditUser,
          updatedBy: this.masterAuditUser,
        },
      });

      return { tenant: newTenant, admin: newAdmin };
    });

    await this.runAsMasterTenantContext(result.admin.tenantId, async () => {
      if (hashedPassword) {
        await this.sharedProfilesService.updateEmailCredentialPassword(
          result.admin.email,
          hashedPassword,
          this.masterAuditUser,
        );
      } else {
        await this.sharedProfilesService.ensureEmailCredential(
          result.admin.email,
          { userId: this.masterAuditUser },
        );
      }

      await this.sharedProfilesService.syncSharedProfileFromAdministrativeUser(
        result.admin.tenantId,
        {
          name: result.admin.name,
          email: result.admin.email,
        },
        this.masterAuditUser,
      );
    });

    return result;
  }

  async findAll() {
    const tenants = await this.prisma.tenant.findMany({
      where: { canceledAt: null },
      include: {
        branches: {
          where: { branchCode: DEFAULT_BRANCH_CODE, canceledAt: null },
          take: 1,
        },
        users: {
          where: { role: "ADMIN" },
          select: { name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return tenants.map(({ smtpPassword: _smtpPassword, branches, ...tenant }) => {
      const defaultBranch = branches[0]
        ? mapTenantBranchSummary(branches[0])
        : null;

      return {
        ...tenant,
        logoUrl: defaultBranch?.logoUrl ?? null,
        document: defaultBranch?.document ?? null,
        defaultBranch,
      };
    });
  }

  async findCurrent(tenantId: string) {
    await ensureDefaultTenantBranch(this.prisma, tenantId);

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        canceledAt: null,
      },
      select: {
        id: true,
        name: true,
        branches: {
          where: { branchCode: DEFAULT_BRANCH_CODE, canceledAt: null },
          take: 1,
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        "Escola não encontrada para o usuário logado.",
      );
    }

    const defaultBranch = tenant.branches[0]
      ? mapTenantBranchSummary(tenant.branches[0])
      : null;

    return {
      id: tenant.id,
      name: tenant.name,
      logoUrl: defaultBranch?.logoUrl ?? null,
      document: defaultBranch?.document ?? null,
      email: defaultBranch?.email ?? null,
      phone: defaultBranch?.phone ?? null,
      whatsapp: defaultBranch?.whatsapp ?? null,
      city: defaultBranch?.city ?? null,
      state: defaultBranch?.state ?? null,
      defaultBranch,
    };
  }

  async listCurrentBranches(tenantId: string) {
    const branches = await listTenantBranches(this.prisma, tenantId);
    return branches.map(mapTenantBranchSummary);
  }

  private async assertActiveTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, canceledAt: null },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException("Escola não encontrada.");
    }
  }

  async createCurrentBranch(
    tenantId: string,
    payload: TenantBranchPayload,
    currentUser: ICurrentUser,
  ) {
    await this.assertActiveTenant(tenantId);
    const branches = await listTenantBranches(this.prisma, tenantId);
    const requestedBranchCode =
      payload.branchCode === undefined || payload.branchCode === null
        ? Math.max(...branches.map((branch) => branch.branchCode), 0) + 1
        : normalizeBranchCode(payload.branchCode, -1);

    if (requestedBranchCode < DEFAULT_BRANCH_CODE) {
      throw new BadRequestException("A filial deve usar código maior ou igual a 1.");
    }

    const alreadyExists = branches.some(
      (branch) => branch.branchCode === requestedBranchCode,
    );
    if (alreadyExists) {
      throw new ConflictException("Já existe uma filial com este código.");
    }

    const createdBranch = await this.prisma.tenantBranch.create({
      data: {
        tenantId,
        branchCode: requestedBranchCode,
        name: String(payload.name || `FILIAL ${requestedBranchCode}`)
          .trim()
          .toUpperCase(),
        ...this.buildTenantBranchData(payload),
        isActive: true,
        createdBy: currentUser.userId,
        updatedBy: currentUser.userId,
      },
    });

    return mapTenantBranchSummary(createdBranch);
  }

  async listBranchesByTenant(tenantId: string) {
    await this.assertActiveTenant(tenantId);
    const branches = await listTenantBranches(this.prisma, tenantId);
    return branches.map(mapTenantBranchSummary);
  }

  async createBranchByTenant(tenantId: string, payload: TenantBranchPayload) {
    return this.createCurrentBranch(tenantId, payload, {
      userId: this.masterAuditUser,
      tenantId,
      branchCode: DEFAULT_BRANCH_CODE,
      role: "SOFTHOUSE_ADMIN",
      permissions: [],
      isMaster: true,
    });
  }

  async updateBranchByTenant(
    tenantId: string,
    branchId: string,
    payload: TenantBranchPayload,
  ) {
    await this.assertActiveTenant(tenantId);
    const branch = await this.prisma.tenantBranch.findFirst({
      where: { id: branchId, tenantId, canceledAt: null },
    });

    if (!branch) {
      throw new NotFoundException("Filial não encontrada.");
    }

    const requestedBranchCode =
      payload.branchCode === undefined || payload.branchCode === null
        ? branch.branchCode
        : normalizeBranchCode(payload.branchCode, -1);

    if (requestedBranchCode < DEFAULT_BRANCH_CODE) {
      throw new BadRequestException(
        "A filial deve usar código maior ou igual a 1.",
      );
    }

    if (requestedBranchCode !== branch.branchCode) {
      const alreadyExists = await this.prisma.tenantBranch.findFirst({
        where: {
          tenantId,
          branchCode: requestedBranchCode,
          canceledAt: null,
          id: { not: branchId },
        },
        select: { id: true },
      });

      if (alreadyExists) {
        throw new ConflictException("Já existe uma filial com este código.");
      }
    }

    const incomingSmtpEmail = payload.smtpEmail?.trim().toLowerCase();
    const incomingSmtpPassword = payload.smtpPassword?.trim();
    if (
      incomingSmtpEmail &&
      !incomingSmtpPassword &&
      branch.smtpEmail &&
      incomingSmtpEmail === branch.smtpEmail.toLowerCase() &&
      branch.smtpPassword
    ) {
      payload.smtpPassword = branch.smtpPassword;
    }

    const incomingStorageAccessKey =
      payload.storageProviderAccessKeyId?.trim();
    const incomingStorageSecret =
      payload.storageProviderSecretAccessKey?.trim();
    if (
      incomingStorageAccessKey &&
      !incomingStorageSecret &&
      branch.storageProviderAccessKeyId &&
      incomingStorageAccessKey === branch.storageProviderAccessKeyId &&
      branch.storageProviderSecretAccessKey
    ) {
      payload.storageProviderSecretAccessKey =
        branch.storageProviderSecretAccessKey;
    }

    const updatedBranch = await this.prisma.tenantBranch.update({
      where: { id: branchId },
      data: {
        branchCode: requestedBranchCode,
        name: String(payload.name || branch.name)
          .trim()
          .toUpperCase(),
        ...this.buildTenantBranchData(payload),
        ...(this.normalizeEmail(payload.email) !== this.normalizeEmail(branch.email)
          ? {
              emailVerified: false,
              emailVerifiedAt: null,
              emailVerificationToken: null,
              emailVerificationExpires: null,
            }
          : {}),
        updatedBy: this.masterAuditUser,
      },
    });

    return mapTenantBranchSummary(updatedBranch);
  }

  async sendBranchEmailConfirmationByTenant(tenantId: string, branchId: string) {
    await this.assertActiveTenant(tenantId);
    const branch = await this.prisma.tenantBranch.findFirst({
      where: { id: branchId, tenantId, canceledAt: null },
      select: { id: true, email: true, emailVerified: true },
    });

    if (!branch) throw new NotFoundException("Filial não encontrada.");
    if (!branch.email) {
      throw new BadRequestException("Informe o e-mail da filial antes de enviar a validação.");
    }
    if (branch.emailVerified) {
      return { message: "O e-mail desta filial já está validado." };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.tenantBranch.update({
      where: { id: branch.id },
      data: {
        emailVerificationToken: tokenHash,
        emailVerificationExpires: expiresAt,
        emailVerified: false,
        emailVerifiedAt: null,
        updatedBy: this.masterAuditUser,
      },
    });

    await this.sendBranchVerificationEmail({ tenantId, branchId, email: branch.email, token });

    return { message: "E-mail de validação enviado para a filial.", expiresAt };
  }

  async verifyBranchEmail(token: string) {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken) throw new BadRequestException("Token de confirmação não informado.");

    const tokenHash = crypto.createHash("sha256").update(normalizedToken).digest("hex");
    const branch = await this.prisma.tenantBranch.findFirst({
      where: {
        emailVerificationToken: tokenHash,
        emailVerificationExpires: { gt: new Date() },
        canceledAt: null,
      },
      select: { id: true },
    });

    if (!branch) {
      throw new BadRequestException("Link de confirmação inválido ou expirado.");
    }

    await this.prisma.tenantBranch.update({
      where: { id: branch.id },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpires: null,
        updatedBy: "EMAIL_VERIFICATION",
      },
    });

    return { message: "E-mail da filial confirmado com sucesso." };
  }

  async findEmailUsage(email: string) {
    const normalizedEmail = this.assertEmailForLookup(email);
    const prismaClient =
      (
        this.prisma as PrismaService & {
          getUnscopedClient?: () => PrismaService;
        }
      ).getUnscopedClient?.() || this.prisma;

    const [users, teachers, students, guardians] = await Promise.all([
      prismaClient.user.findMany({
        where: { canceledAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          updatedAt: true,
          updatedBy: true,
          tenant: { select: { id: true, name: true } },
        },
      }) as Promise<
        Array<{
          id: string;
          name: string;
          email: string | null;
          role: string;
          updatedAt: Date;
          updatedBy?: string | null;
          tenant: { id: string; name: string };
        }>
      >,
      prismaClient.teacher.findMany({
        where: { canceledAt: null },
        select: {
          id: true,
          person: { select: { name: true, email: true } },
          updatedAt: true,
          updatedBy: true,
          tenant: { select: { id: true, name: true } },
        },
      }),
      prismaClient.student.findMany({
        where: { canceledAt: null },
        select: {
          id: true,
          person: { select: { name: true, email: true } },
          updatedAt: true,
          updatedBy: true,
          tenant: { select: { id: true, name: true } },
        },
      }),
      prismaClient.guardian.findMany({
        where: { canceledAt: null },
        select: {
          id: true,
          person: { select: { name: true, email: true } },
          updatedAt: true,
          updatedBy: true,
          tenant: { select: { id: true, name: true } },
        },
      }),
    ]);

    return [
      ...users.map(
        (record: {
          id: string;
          name: string;
          email: string | null;
          role: string;
          updatedAt: Date;
          updatedBy?: string | null;
          tenant: { id: string; name: string };
        }) => this.mapUserEmailUsage(record),
      ),
      ...teachers.map(
        (record) =>
          this.mapTeacherEmailUsage({
            ...record,
            email: record.person?.email ?? null,
          }),
      ),
      ...students.map(
        (record) =>
          this.mapStudentEmailUsage({
            ...record,
            email: record.person?.email ?? null,
          }),
      ),
      ...guardians.map(
        (record) =>
          this.mapGuardianEmailUsage({
            ...record,
            email: record.person?.email ?? null,
          }),
      ),
    ]
      .filter(
        (item) => this.normalizeEmail(item.currentEmail) === normalizedEmail,
      )
      .sort((left, right) => {
        return (
          left.tenantName.localeCompare(right.tenantName) ||
          left.entityLabel.localeCompare(right.entityLabel) ||
          left.recordName.localeCompare(right.recordName)
        );
      });
  }

  async updateEmailUsage(payload: {
    entityType?: string;
    recordId?: string;
    newEmail?: string;
  }) {
    const entityType = this.normalizeEntityType(payload.entityType);
    const recordId = String(payload.recordId || "").trim();
    const newEmail = this.assertEmailForLookup(payload.newEmail);

    if (!recordId) {
      throw new BadRequestException(
        "Informe o registro que deve ter o email alterado.",
      );
    }

    switch (entityType) {
      case "ADMIN_USER":
      case "USER": {
        const user = await this.prisma.user.findFirst({
          where: { id: recordId, canceledAt: null },
          select: {
            id: true,
            tenantId: true,
            role: true,
            tenant: { select: { name: true } },
          },
        });

        if (!user) {
          throw new NotFoundException(
            "Usuário não encontrado para atualização de email.",
          );
        }

        await this.sharedProfilesService.ensureEmailCredential(newEmail, {
          userId: this.masterAuditUser,
        });

        await this.prisma.user.update({
          where: { id: recordId },
          data: {
            email: newEmail,
            password: null,
            updatedBy: this.masterAuditUser,
          },
        });

        return {
          message: "Email do usuário atualizado com sucesso.",
          usage: await this.findEmailUsageRecord(
            user.role === "ADMIN" ? "ADMIN_USER" : "USER",
            recordId,
          ),
        };
      }
      case "TEACHER": {
        const teacher = await this.prisma.teacher.findFirst({
          where: { id: recordId, canceledAt: null },
          select: {
            id: true,
            tenantId: true,
            personId: true,
            tenant: { select: { name: true } },
          },
        });

        if (!teacher) {
          throw new NotFoundException(
            "Professor não encontrado para atualização de email.",
          );
        }

        await this.sharedProfilesService.ensureEmailCredential(newEmail, {
          userId: this.masterAuditUser,
        });

        await this.prisma.person.update({
          where: { id: teacher.personId! },
          data: {
            email: newEmail,
            password: null,
            updatedBy: this.masterAuditUser,
          },
        });

        return {
          message: "Email do professor atualizado com sucesso.",
          usage: await this.findEmailUsageRecord("TEACHER", recordId),
        };
      }
      case "STUDENT": {
        const student = await this.prisma.student.findFirst({
          where: { id: recordId, canceledAt: null },
          select: { id: true, personId: true },
        });

        if (!student) {
          throw new NotFoundException(
            "Aluno não encontrado para atualização de email.",
          );
        }

        await this.sharedProfilesService.ensureEmailCredential(newEmail, {
          userId: this.masterAuditUser,
        });

        await this.prisma.person.update({
          where: { id: student.personId! },
          data: {
            email: newEmail,
            password: null,
            updatedBy: this.masterAuditUser,
          },
        });

        return {
          message: "Email do aluno atualizado com sucesso.",
          usage: await this.findEmailUsageRecord("STUDENT", recordId),
        };
      }
      case "GUARDIAN": {
        const guardian = await this.prisma.guardian.findFirst({
          where: { id: recordId, canceledAt: null },
          select: { id: true, personId: true },
        });

        if (!guardian) {
          throw new NotFoundException(
            "Responsável não encontrado para atualização de email.",
          );
        }

        await this.sharedProfilesService.ensureEmailCredential(newEmail, {
          userId: this.masterAuditUser,
        });

        await this.prisma.person.update({
          where: { id: guardian.personId! },
          data: {
            email: newEmail,
            password: null,
            updatedBy: this.masterAuditUser,
          },
        });

        return {
          message: "Email do responsável atualizado com sucesso.",
          usage: await this.findEmailUsageRecord("GUARDIAN", recordId),
        };
      }
    }
  }

  private normalizeAccessRole(
    role?: string | null,
  ): "ADMIN" | "SECRETARIA" | "COORDENACAO" {
    const normalizedRole = String(role || "SECRETARIA")
      .trim()
      .toUpperCase();
    if (normalizedRole === "ADMIN") return "ADMIN";
    if (normalizedRole === "COORDENACAO") return "COORDENACAO";
    return "SECRETARIA";
  }

  private normalizeOptionalUpperText(value?: string | null) {
    const normalized = String(value || "")
      .trim()
      .toUpperCase();
    return normalized || null;
  }

  private normalizeOptionalDate(value?: string | null) {
    const normalized = String(value || "").trim();
    if (!normalized) return null;
    const parsedDate = new Date(normalized);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  private async normalizeBranchAccessCodes(
    tenantId: string,
    role: string,
    branchAccessCodes?: number[] | null,
    fallbackCodes: number[] = [],
  ) {
    if (role === "ADMIN") return [];

    const branches = (await listTenantBranches(this.prisma, tenantId)).filter(
      (branch) => branch.isActive,
    );

    if (branches.length <= 1) {
      return [branches[0]?.branchCode || DEFAULT_BRANCH_CODE];
    }

    const incomingCodes = Array.isArray(branchAccessCodes)
      ? branchAccessCodes
      : fallbackCodes.length > 0
        ? fallbackCodes
        : [];

    const activeBranchCodes = new Set(
      branches.map((branch) => branch.branchCode),
    );
    const normalizedCodes = Array.from(
      new Set(
        incomingCodes
          .map((branchCode) => normalizeBranchCode(branchCode, -1))
          .filter((branchCode) => branchCode >= DEFAULT_BRANCH_CODE),
      ),
    );

    if (normalizedCodes.length === 0) {
      throw new BadRequestException(
        "Selecione pelo menos uma filial para este usuário.",
      );
    }

    const invalidBranchCode = normalizedCodes.find(
      (branchCode) => !activeBranchCodes.has(branchCode),
    );
    if (invalidBranchCode !== undefined) {
      throw new BadRequestException("A filial informada não está ativa.");
    }

    return normalizedCodes;
  }

  private async syncUserBranchAccesses(
    tenantId: string,
    userId: string,
    role: string,
    branchAccessCodes: number[],
  ) {
    return this.runAsMasterTenantContext(tenantId, async () => {
      if (role === "ADMIN") {
        await this.prisma.userBranchAccess.updateMany({
          where: { tenantId, userId, canceledAt: null },
          data: {
            canceledAt: new Date(),
            canceledBy: this.masterAuditUser,
            updatedBy: this.masterAuditUser,
          },
        });
        return [];
      }

      const normalizedCodes = Array.from(new Set(branchAccessCodes));

      await Promise.all(
        normalizedCodes.map((branchCode, index) =>
          this.prisma.userBranchAccess.upsert({
            where: {
              tenantId_userId_branchCode: {
                tenantId,
                userId,
                branchCode,
              },
            },
            update: {
              isDefault: index === 0,
              canceledAt: null,
              canceledBy: null,
              updatedBy: this.masterAuditUser,
            },
            create: {
              tenantId,
              userId,
              branchCode,
              isDefault: index === 0,
              createdBy: this.masterAuditUser,
              updatedBy: this.masterAuditUser,
            },
          }),
        ),
      );

      await this.prisma.userBranchAccess.updateMany({
        where: {
          tenantId,
          userId,
          canceledAt: null,
          branchCode: { notIn: normalizedCodes },
        },
        data: {
          canceledAt: new Date(),
          canceledBy: this.masterAuditUser,
          updatedBy: this.masterAuditUser,
        },
      });

      return this.prisma.userBranchAccess.findMany({
        where: { tenantId, userId, canceledAt: null },
        orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
        select: { branchCode: true, isDefault: true },
      });
    });
  }

  private mapAccessUser(
    record: {
      id: string;
      tenantId: string;
      name: string;
      email: string;
      photoUrl?: string | null;
      complementaryProfiles?: string | null;
      role: string;
      accessProfile?: string | null;
      permissions?: string | null;
      cashierOnly?: boolean | null;
      branchAccesses?: Array<{ branchCode: number; isDefault?: boolean }>;
      createdAt: Date;
      updatedAt: Date;
      canceledAt?: Date | null;
    },
    sharedPerson?: {
      birthDate?: Date | null;
      rg?: string | null;
      cpf?: string | null;
      cnpj?: string | null;
      nickname?: string | null;
      corporateName?: string | null;
      phone?: string | null;
      whatsapp?: string | null;
      cellphone1?: string | null;
      cellphone2?: string | null;
      zipCode?: string | null;
      street?: string | null;
      number?: string | null;
      city?: string | null;
      state?: string | null;
      neighborhood?: string | null;
      complement?: string | null;
    } | null,
  ) {
    const branchAccesses =
      record.role === "ADMIN"
        ? []
        : Array.isArray(record.branchAccesses)
          ? record.branchAccesses
          : [];

    return {
      id: record.id,
      tenantId: record.tenantId,
      name: record.name,
      email: record.email,
      photoUrl: record.photoUrl || null,
      complementaryProfiles: normalizeComplementaryAccessProfiles(
        record.complementaryProfiles,
      ),
      role: record.role,
      accessProfile:
        normalizeAccessProfileCode(record.accessProfile, record.role) ||
        getDefaultAccessProfileForRole(record.role),
      permissions: resolveAccountPermissions({
        role: record.role,
        accessProfile: record.accessProfile,
        complementaryProfiles: record.complementaryProfiles,
        permissions: record.permissions,
      }),
      cashierOnly: Boolean(record.cashierOnly),
      branchAccessCodes: branchAccesses.map((access) => access.branchCode),
      branchAccesses,
      birthDate: sharedPerson?.birthDate
        ? sharedPerson.birthDate.toISOString().split("T")[0]
        : null,
      rg: sharedPerson?.rg || null,
      cpf: sharedPerson?.cpf || null,
      cnpj: sharedPerson?.cnpj || null,
      nickname: sharedPerson?.nickname || null,
      corporateName: sharedPerson?.corporateName || null,
      phone: sharedPerson?.phone || null,
      whatsapp: sharedPerson?.whatsapp || null,
      cellphone1: sharedPerson?.cellphone1 || null,
      cellphone2: sharedPerson?.cellphone2 || null,
      zipCode: sharedPerson?.zipCode || null,
      street: sharedPerson?.street || null,
      number: sharedPerson?.number || null,
      city: sharedPerson?.city || null,
      state: sharedPerson?.state || null,
      neighborhood: sharedPerson?.neighborhood || null,
      complement: sharedPerson?.complement || null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      canceledAt: record.canceledAt || null,
    };
  }

  async findAccessUsersByTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      throw new NotFoundException(
        "Escola não encontrada para gestão de acessos.",
      );
    }

    const [branches, users] = await this.runAsMasterTenantContext(
      tenantId,
      async () =>
        Promise.all([
          listTenantBranches(this.prisma, tenantId),
          this.prisma.user.findMany({
            where: { tenantId, canceledAt: null },
            orderBy: [{ role: "asc" }, { name: "asc" }],
            select: {
              id: true,
              tenantId: true,
              name: true,
              email: true,
              photoUrl: true,
              complementaryProfiles: true,
              role: true,
              accessProfile: true,
              permissions: true,
              cashierOnly: true,
              branchAccesses: {
                where: { canceledAt: null },
                orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
                select: { branchCode: true, isDefault: true },
              },
              createdAt: true,
              updatedAt: true,
              canceledAt: true,
            },
          }),
        ]),
    );

    const normalizedUserEmails = new Set(
      users.map((user) => this.normalizeEmail(user.email)).filter(Boolean),
    );
    const sharedPeople =
      normalizedUserEmails.size > 0
        ? await this.runAsMasterTenantContext(tenantId, () =>
            this.prisma.person.findMany({
              where: {
                tenantId,
                canceledAt: null,
                email: { not: null },
              },
              select: {
                email: true,
                birthDate: true,
                rg: true,
                cpf: true,
                cnpj: true,
                nickname: true,
                corporateName: true,
                phone: true,
                whatsapp: true,
                cellphone1: true,
                cellphone2: true,
                zipCode: true,
                street: true,
                number: true,
                city: true,
                state: true,
                neighborhood: true,
                complement: true,
                updatedAt: true,
              },
            }),
          )
        : [];

    const sharedPersonByEmail = new Map(
      sharedPeople
        .filter((person) =>
          normalizedUserEmails.has(this.normalizeEmail(person.email)),
        )
        .sort(
          (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
        )
        .map((person) => [this.normalizeEmail(person.email), person] as const),
    );

    return {
      tenant,
      branches: branches.map(mapTenantBranchSummary),
      users: users.map((user) =>
        this.mapAccessUser(
          user,
          sharedPersonByEmail.get(this.normalizeEmail(user.email)) || null,
        ),
      ),
    };
  }

  async createAccessUser(
    tenantId: string,
    payload: AccessUserPayload,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      throw new NotFoundException(
        "Escola não encontrada para criação de acesso.",
      );
    }

    const name = String(payload.name || "")
      .trim()
      .toUpperCase();
    const email = this.assertEmailForLookup(payload.email);
    const password = String(payload.password || "").trim();
    const photoUrl = String(payload.photoUrl || "").trim() || null;
    const role = this.normalizeAccessRole(payload.role);
    const birthDate = this.normalizeOptionalDate(payload.birthDate);
    const rg = this.normalizeOptionalUpperText(payload.rg);
    const cpf = this.normalizeOptionalUpperText(payload.cpf);
    const cnpj = this.normalizeOptionalUpperText(payload.cnpj);
    const nickname = this.normalizeOptionalUpperText(payload.nickname);
    const corporateName = this.normalizeOptionalUpperText(
      payload.corporateName,
    );
    const phone = this.normalizeOptionalUpperText(payload.phone);
    const whatsapp = this.normalizeOptionalUpperText(payload.whatsapp);
    const cellphone1 = this.normalizeOptionalUpperText(payload.cellphone1);
    const cellphone2 = this.normalizeOptionalUpperText(payload.cellphone2);
    const zipCode = this.normalizeOptionalUpperText(payload.zipCode);
    const street = this.normalizeOptionalUpperText(payload.street);
    const number = this.normalizeOptionalUpperText(payload.number);
    const city = this.normalizeOptionalUpperText(payload.city);
    const state = this.normalizeOptionalUpperText(payload.state);
    const neighborhood = this.normalizeOptionalUpperText(payload.neighborhood);
    const complement = this.normalizeOptionalUpperText(payload.complement);
    const cashierOnly = role !== "ADMIN" && Boolean(payload.cashierOnly);
    const complementaryProfiles =
      role === "ADMIN"
        ? []
        : Array.from(
            new Set([
              ...normalizeComplementaryAccessProfiles(payload.complementaryProfiles),
              ...(cashierOnly ? (["CAIXA"] as const) : []),
            ]),
          );
    const accessProfile = normalizeAccessProfileCode(
      payload.accessProfile,
      role,
    );
    const permissions = normalizePermissions(payload.permissions);
    let effectivePermissions =
      role === "ADMIN"
        ? []
        : permissions.length > 0
          ? permissions
          : accessProfile
            ? getDefaultPermissionsForRole(role).length === 0
              ? []
              : resolveAccountPermissions({
                  role,
                  accessProfile,
                  complementaryProfiles,
                  permissions: null,
                })
            : getDefaultPermissionsForRole(role);
    if (cashierOnly) {
      effectivePermissions = Array.from(
        new Set([
          ...effectivePermissions,
          ...getComplementaryProfilePermissions(["CAIXA"]),
        ]),
      );
    }

    if (!name) {
      throw new BadRequestException("Informe o nome do usuário de acesso.");
    }

    const branchAccessCodes = await this.normalizeBranchAccessCodes(
      tenantId,
      role,
      payload.branchAccessCodes,
    );

    let hashedPassword: string | null = null;
    if (password) {
      if (password.length < 6) {
        throw new ConflictException("A senha deve ter no mínimo 6 caracteres.");
      }

      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        name,
        email,
        password: null,
        photoUrl,
        complementaryProfiles:
          role === "ADMIN"
            ? null
            : serializeComplementaryAccessProfiles(complementaryProfiles),
        role,
        accessProfile:
          role === "ADMIN"
            ? getDefaultAccessProfileForRole(role)
            : accessProfile,
        permissions:
          role === "ADMIN" ? null : serializePermissions(effectivePermissions),
        cashierOnly,
        createdBy: this.masterAuditUser,
        updatedBy: this.masterAuditUser,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        password: true,
        photoUrl: true,
        complementaryProfiles: true,
        role: true,
        accessProfile: true,
        permissions: true,
        cashierOnly: true,
        createdAt: true,
        updatedAt: true,
        canceledAt: true,
      },
    });

    const branchAccesses = await this.syncUserBranchAccesses(
      tenantId,
      user.id,
      role,
      branchAccessCodes,
    );

    await this.runAsMasterTenantContext(tenantId, async () => {
      if (hashedPassword) {
        await this.sharedProfilesService.updateEmailCredentialPassword(
          email,
          hashedPassword,
          this.masterAuditUser,
        );
      } else {
        await this.sharedProfilesService.ensureEmailCredential(email, {
          userId: this.masterAuditUser,
        });
      }
      await this.sharedProfilesService.syncSharedProfileFromAdministrativeUser(
        tenantId,
        {
          name,
          email,
          birthDate,
          rg,
          cpf,
          cnpj,
          nickname,
          corporateName,
          phone,
          whatsapp,
          cellphone1,
          cellphone2,
          zipCode,
          street,
          number,
          city,
          state,
          neighborhood,
          complement,
        },
        this.masterAuditUser,
        cpf || null,
      );
    });

    return {
      message: "Usuário de acesso criado com sucesso.",
      user: this.mapAccessUser({ ...user, branchAccesses }),
    };
  }

  async updateAccessUser(
    tenantId: string,
    userId: string,
    payload: AccessUserPayload,
  ) {
    const user = await this.runAsMasterTenantContext(tenantId, () =>
      this.prisma.user.findFirst({
        where: { id: userId, tenantId, canceledAt: null },
        select: {
          id: true,
          tenantId: true,
          name: true,
          email: true,
          photoUrl: true,
          complementaryProfiles: true,
          role: true,
          accessProfile: true,
          cashierOnly: true,
          branchAccesses: {
            where: { canceledAt: null },
            orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
            select: { branchCode: true, isDefault: true },
          },
        },
      }),
    );

    if (!user) {
      throw new NotFoundException("Usuário de acesso não encontrado.");
    }

    const name =
      payload.name !== undefined
        ? String(payload.name || "")
            .trim()
            .toUpperCase()
        : undefined;
    const email =
      payload.email !== undefined
        ? this.assertEmailForLookup(payload.email)
        : undefined;
    const photoUrl =
      payload.photoUrl !== undefined
        ? String(payload.photoUrl || "").trim() || null
        : undefined;
    const role =
      payload.role !== undefined
        ? this.normalizeAccessRole(payload.role)
        : user.role;
    const cashierOnly =
      role !== "ADMIN"
        ? payload.cashierOnly !== undefined
          ? Boolean(payload.cashierOnly)
          : Boolean(user.cashierOnly)
        : false;
    const complementaryProfiles =
      role === "ADMIN"
        ? []
        : Array.from(
            new Set([
              ...(payload.complementaryProfiles !== undefined ||
              payload.role !== undefined
                ? normalizeComplementaryAccessProfiles(payload.complementaryProfiles)
                : normalizeComplementaryAccessProfiles(user.complementaryProfiles)),
              ...(cashierOnly ? (["CAIXA"] as const) : []),
            ]),
          );
    const accessProfile =
      payload.accessProfile !== undefined || payload.role !== undefined
        ? normalizeAccessProfileCode(payload.accessProfile, role)
        : normalizeAccessProfileCode(
            (user as { accessProfile?: string | null }).accessProfile,
            role,
          );
    const permissions = normalizePermissions(payload.permissions);
    let effectivePermissions =
      role === "ADMIN"
        ? []
        : permissions.length > 0
          ? permissions
          : accessProfile
            ? resolveAccountPermissions({
                role,
                accessProfile,
                complementaryProfiles,
                permissions: null,
              })
            : getDefaultPermissionsForRole(role);
    if (cashierOnly) {
      effectivePermissions = Array.from(
        new Set([
          ...effectivePermissions,
          ...getComplementaryProfilePermissions(["CAIXA"]),
        ]),
      );
    }
    const birthDate =
      payload.birthDate !== undefined
        ? this.normalizeOptionalDate(payload.birthDate)
        : undefined;
    const rg =
      payload.rg !== undefined
        ? this.normalizeOptionalUpperText(payload.rg)
        : undefined;
    const cpf =
      payload.cpf !== undefined
        ? this.normalizeOptionalUpperText(payload.cpf)
        : undefined;
    const cnpj =
      payload.cnpj !== undefined
        ? this.normalizeOptionalUpperText(payload.cnpj)
        : undefined;
    const nickname =
      payload.nickname !== undefined
        ? this.normalizeOptionalUpperText(payload.nickname)
        : undefined;
    const corporateName =
      payload.corporateName !== undefined
        ? this.normalizeOptionalUpperText(payload.corporateName)
        : undefined;
    const phone =
      payload.phone !== undefined
        ? this.normalizeOptionalUpperText(payload.phone)
        : undefined;
    const whatsapp =
      payload.whatsapp !== undefined
        ? this.normalizeOptionalUpperText(payload.whatsapp)
        : undefined;
    const cellphone1 =
      payload.cellphone1 !== undefined
        ? this.normalizeOptionalUpperText(payload.cellphone1)
        : undefined;
    const cellphone2 =
      payload.cellphone2 !== undefined
        ? this.normalizeOptionalUpperText(payload.cellphone2)
        : undefined;
    const zipCode =
      payload.zipCode !== undefined
        ? this.normalizeOptionalUpperText(payload.zipCode)
        : undefined;
    const street =
      payload.street !== undefined
        ? this.normalizeOptionalUpperText(payload.street)
        : undefined;
    const number =
      payload.number !== undefined
        ? this.normalizeOptionalUpperText(payload.number)
        : undefined;
    const city =
      payload.city !== undefined
        ? this.normalizeOptionalUpperText(payload.city)
        : undefined;
    const state =
      payload.state !== undefined
        ? this.normalizeOptionalUpperText(payload.state)
        : undefined;
    const neighborhood =
      payload.neighborhood !== undefined
        ? this.normalizeOptionalUpperText(payload.neighborhood)
        : undefined;
    const complement =
      payload.complement !== undefined
        ? this.normalizeOptionalUpperText(payload.complement)
        : undefined;

    if (name !== undefined && !name) {
      throw new BadRequestException("Informe o nome do usuário de acesso.");
    }

    const branchAccessCodes = await this.normalizeBranchAccessCodes(
      tenantId,
      role,
      payload.branchAccessCodes,
      user.branchAccesses.map((access) => access.branchCode),
    );

    let hashedPassword: string | undefined;
    const normalizedCurrentEmail = this.normalizeEmail(user.email);
    const normalizedIncomingEmail = email ?? normalizedCurrentEmail;
    const shouldResolvePasswordForEmailChange =
      Boolean(normalizedIncomingEmail) &&
      normalizedIncomingEmail !== normalizedCurrentEmail;
    if (payload.password !== undefined && payload.password !== "") {
      if (String(payload.password).length < 6) {
        throw new ConflictException("A senha deve ter no mínimo 6 caracteres.");
      }
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(String(payload.password), salt);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        password:
          hashedPassword || shouldResolvePasswordForEmailChange
            ? null
            : undefined,
        photoUrl,
        complementaryProfiles:
          role === "ADMIN"
            ? null
            : serializeComplementaryAccessProfiles(complementaryProfiles),
        role,
        accessProfile: accessProfile,
        permissions:
          role === "ADMIN" ? null : serializePermissions(effectivePermissions),
        cashierOnly,
        updatedBy: this.masterAuditUser,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        photoUrl: true,
        complementaryProfiles: true,
        role: true,
        accessProfile: true,
        permissions: true,
        cashierOnly: true,
        createdAt: true,
        updatedAt: true,
        canceledAt: true,
      },
    });

    const branchAccesses = await this.syncUserBranchAccesses(
      tenantId,
      userId,
      role,
      branchAccessCodes,
    );

    const emailForPasswordSync = email || user.email;
    await this.runAsMasterTenantContext(tenantId, async () => {
      if (emailForPasswordSync) {
        if (hashedPassword) {
          await this.sharedProfilesService.updateEmailCredentialPassword(
            emailForPasswordSync,
            hashedPassword,
            this.masterAuditUser,
          );
        } else if (shouldResolvePasswordForEmailChange) {
          await this.sharedProfilesService.ensureEmailCredential(
            emailForPasswordSync,
            { userId: this.masterAuditUser },
          );
        }
      }

      await this.sharedProfilesService.syncSharedProfileFromAdministrativeUser(
        tenantId,
        {
          name: name !== undefined ? name : user.name,
          email: email !== undefined ? email : user.email,
          birthDate,
          rg,
          cpf,
          cnpj,
          nickname,
          corporateName,
          phone,
          whatsapp,
          cellphone1,
          cellphone2,
          zipCode,
          street,
          number,
          city,
          state,
          neighborhood,
          complement,
        },
        this.masterAuditUser,
        cpf || null,
      );
    });

    return {
      message: "Usuário de acesso atualizado com sucesso.",
      user: this.mapAccessUser({ ...updated, branchAccesses }),
    };
  }

  async removeAccessUser(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, canceledAt: null },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException("Usuário de acesso não encontrado.");
    }

    if (user.role === "ADMIN") {
      const activeAdmins = await this.prisma.user.count({
        where: { tenantId, role: "ADMIN", canceledAt: null },
      });

      if (activeAdmins <= 1) {
        throw new ConflictException(
          "Não é permitido remover o último ADMIN da escola.",
        );
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        canceledAt: new Date(),
        canceledBy: this.masterAuditUser,
        updatedBy: this.masterAuditUser,
      },
    });

    await this.runAsMasterTenantContext(tenantId, () =>
      this.prisma.userBranchAccess.updateMany({
        where: { tenantId, userId, canceledAt: null },
        data: {
          canceledAt: new Date(),
          canceledBy: this.masterAuditUser,
          updatedBy: this.masterAuditUser,
        },
      }),
    );

    return { message: "Usuário de acesso desativado com sucesso." };
  }

  async removeTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException("Escola não encontrada.");
    }

    if (tenant.canceledAt) {
      throw new ConflictException("Escola já está cancelada.");
    }

    return this.runAsMasterTenantContext(tenantId, async () => {
      const now = new Date();
      const auditPayload = {
        canceledAt: now,
        canceledBy: this.masterAuditUser,
        updatedBy: this.masterAuditUser,
      };

      await this.prisma.$transaction(async (tx) => {
        await tx.userPreference.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.guardianStudent.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.guardian.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.student.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.person.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.teacher.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.user.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.tenantBranch.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.schoolYear.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx["class"].updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.series.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.seriesClass.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.enrollment.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.subject.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.teacherSubject.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.teacherSubjectRateHistory.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.schedule.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.classScheduleItem.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.lessonCalendarPeriod.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.lessonCalendar.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.lessonCalendarItem.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.lessonEvent.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.lessonAssessment.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.lessonAssessmentGrade.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.lessonAttendance.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.notification.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });
        await tx.communicationCampaign.updateMany({
          where: { tenantId, canceledAt: null },
          data: auditPayload,
        });

        await tx.tenant.update({
          where: { id: tenantId },
          data: auditPayload,
        });
      });

      return {
        message: `Escola '${tenant.name}' e dependências canceladas.`,
        tenantId,
      };
    });
  }

  async purgeTenantPermanently(
    tenantId: string,
    purgeTenantDto: PurgeTenantDto,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      throw new NotFoundException("Escola não encontrada.");
    }

    const confirmationTenantId = String(
      purgeTenantDto.confirmationTenantId || "",
    ).trim();
    const confirmationPhrase = String(
      purgeTenantDto.confirmationPhrase || "",
    ).trim();

    if (confirmationTenantId !== tenant.id) {
      throw new BadRequestException(
        "Confirmação inválida. Digite exatamente o ID da escola para autorizar a exclusão definitiva.",
      );
    }

    if (confirmationPhrase !== "EXCLUIR DEFINITIVAMENTE") {
      throw new BadRequestException(
        "Confirmação inválida. Digite exatamente EXCLUIR DEFINITIVAMENTE para autorizar a exclusão definitiva.",
      );
    }

    return this.runAsMasterTenantContext(tenantId, async () => {
      const deleted = await this.prisma.$transaction(async (tx) => {
        const deletionSummary: PurgeTenantDeletionSummary = {
          userPreferences: (
            await tx.userPreference.deleteMany({ where: { tenantId } })
          ).count,
          notifications: (
            await tx.notification.deleteMany({ where: { tenantId } })
          ).count,
          communicationCampaigns: (
            await tx.communicationCampaign.deleteMany({ where: { tenantId } })
          ).count,
          lessonAssessmentGrades: (
            await tx.lessonAssessmentGrade.deleteMany({ where: { tenantId } })
          ).count,
          lessonAttendances: (
            await tx.lessonAttendance.deleteMany({ where: { tenantId } })
          ).count,
          lessonAssessments: (
            await tx.lessonAssessment.deleteMany({ where: { tenantId } })
          ).count,
          lessonEvents: (
            await tx.lessonEvent.deleteMany({ where: { tenantId } })
          ).count,
          lessonCalendarItems: (
            await tx.lessonCalendarItem.deleteMany({ where: { tenantId } })
          ).count,
          lessonCalendarPeriods: (
            await tx.lessonCalendarPeriod.deleteMany({ where: { tenantId } })
          ).count,
          classScheduleItems: (
            await tx.classScheduleItem.deleteMany({ where: { tenantId } })
          ).count,
          lessonCalendars: (
            await tx.lessonCalendar.deleteMany({ where: { tenantId } })
          ).count,
          teacherSubjectRateHistories: (
            await tx.teacherSubjectRateHistory.deleteMany({
              where: { tenantId },
            })
          ).count,
          teacherSubjects: (
            await tx.teacherSubject.deleteMany({ where: { tenantId } })
          ).count,
          enrollments: (await tx.enrollment.deleteMany({ where: { tenantId } }))
            .count,
          guardianStudents: (
            await tx.guardianStudent.deleteMany({ where: { tenantId } })
          ).count,
          guardians: (await tx.guardian.deleteMany({ where: { tenantId } }))
            .count,
          students: (await tx.student.deleteMany({ where: { tenantId } }))
            .count,
          teachers: (await tx.teacher.deleteMany({ where: { tenantId } }))
            .count,
          people: (await tx.person.deleteMany({ where: { tenantId } })).count,
          userBranchAccesses: (
            await tx.userBranchAccess.deleteMany({ where: { tenantId } })
          ).count,
          users: (await tx.user.deleteMany({ where: { tenantId } })).count,
          tenantBranches: (
            await tx.tenantBranch.deleteMany({ where: { tenantId } })
          ).count,
          subjects: (await tx.subject.deleteMany({ where: { tenantId } }))
            .count,
          schedules: (await tx.schedule.deleteMany({ where: { tenantId } }))
            .count,
          seriesClasses: (
            await tx.seriesClass.deleteMany({ where: { tenantId } })
          ).count,
          classes: (await tx["class"].deleteMany({ where: { tenantId } }))
            .count,
          series: (await tx.series.deleteMany({ where: { tenantId } })).count,
          schoolYears: (await tx.schoolYear.deleteMany({ where: { tenantId } }))
            .count,
          tenants: 0,
        };

        await tx.tenant.delete({
          where: { id: tenantId },
        });

        deletionSummary.tenants = 1;

        return deletionSummary;
      });

      const deletedTotal = Object.values(deleted).reduce(
        (total, current) => total + current,
        0,
      );

      return {
        message: `Escola '${tenant.name}' excluída definitivamente com ${deletedTotal} registro(s) removido(s).`,
        tenantId,
        deleted,
        deletedTotal,
      };
    });
  }

  async update(id: string, updateTenantDto: UpdateTenantDto) {
    if (updateTenantDto.email)
      updateTenantDto.email = updateTenantDto.email.toUpperCase();
    if (updateTenantDto.adminEmail)
      updateTenantDto.adminEmail = updateTenantDto.adminEmail.toUpperCase();
    const defaultBranchPayload =
      (updateTenantDto.defaultBranch as TenantBranchPayload | undefined) ||
      (updateTenantDto as TenantBranchPayload);

    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new ConflictException("Escola não encontrada.");

    const incomingSmtpEmail = updateTenantDto.smtpEmail?.trim().toLowerCase();
    const incomingSmtpPassword = updateTenantDto.smtpPassword?.trim();
    if (
      incomingSmtpEmail &&
      !incomingSmtpPassword &&
      tenant.smtpEmail &&
      incomingSmtpEmail === tenant.smtpEmail.toLowerCase() &&
      tenant.smtpPassword
    ) {
      updateTenantDto.smtpPassword = tenant.smtpPassword;
    }

    const incomingStorageAccessKey =
      updateTenantDto.storageProviderAccessKeyId?.trim();
    const incomingStorageSecret =
      updateTenantDto.storageProviderSecretAccessKey?.trim();
    if (
      incomingStorageAccessKey &&
      !incomingStorageSecret &&
      tenant.storageProviderAccessKeyId &&
      incomingStorageAccessKey === tenant.storageProviderAccessKeyId &&
      tenant.storageProviderSecretAccessKey
    ) {
      updateTenantDto.storageProviderSecretAccessKey =
        tenant.storageProviderSecretAccessKey;
    }

    this.validateAndNormalizeSmtp(updateTenantDto);

    let hashedPassword: string | undefined;
    if (updateTenantDto.adminPassword) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(updateTenantDto.adminPassword, salt);
    }

    const adminsToSync: Array<{
      userId: string;
      tenantId: string;
      email: string;
    }> = [];
    let finalAdminEmailForPassword: string | undefined;
    let adminProfileSyncPayload: {
      name?: string | null;
      email?: string | null;
    } | null = null;

    const updatedTenant = await this.prisma.$transaction(async (tx) => {
      let adminUser:
        | {
            id: string;
            name: string;
            email: string;
          }
        | null
        | undefined;

      const updatedTenant = await tx.tenant.update({
        where: { id },
        data: {
          name: updateTenantDto.name,
          interestRate: updateTenantDto.interestRate,
          penaltyRate: updateTenantDto.penaltyRate,
          penaltyValue: updateTenantDto.penaltyValue,
          penaltyGracePeriod: updateTenantDto.penaltyGracePeriod,
          interestGracePeriod: updateTenantDto.interestGracePeriod,
          smtpHost: updateTenantDto.smtpHost,
          smtpPort: updateTenantDto.smtpPort as number | undefined,
          smtpTimeout: updateTenantDto.smtpTimeout as number | undefined,
          smtpAuthenticate: updateTenantDto.smtpAuthenticate as
            | boolean
            | undefined,
          smtpSecure: updateTenantDto.smtpSecure as boolean | undefined,
          smtpAuthType: updateTenantDto.smtpAuthType,
          smtpEmail: updateTenantDto.smtpEmail,
          smtpPassword: updateTenantDto.smtpPassword,
          ...this.buildTelegramConfigurationData(updateTenantDto),
          ...this.buildStorageConfigurationData(updateTenantDto),
          updatedBy: this.masterAuditUser,
        },
      });

      const defaultBranch = await ensureDefaultTenantBranch(
        tx,
        id,
        this.masterAuditUser,
      );
      await tx.tenantBranch.update({
        where: { id: defaultBranch.id },
        data: {
          name:
            this.normalizeOptionalText(defaultBranchPayload.name) ||
            "FILIAL 1",
          ...this.buildTenantBranchData(defaultBranchPayload),
          updatedBy: this.masterAuditUser,
        },
      });

      if (
        updateTenantDto.adminName ||
        updateTenantDto.adminEmail ||
        hashedPassword
      ) {
        adminUser = await tx.user.findFirst({
          where: { tenantId: id, role: "ADMIN" },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            email: true,
          },
        });

        if (adminUser) {
          const normalizedCurrentAdminEmail = this.normalizeEmail(
            adminUser.email,
          );
          const normalizedIncomingAdminEmail = updateTenantDto.adminEmail
            ? this.normalizeEmail(updateTenantDto.adminEmail)
            : normalizedCurrentAdminEmail;
          const shouldResolvePasswordForAdminEmailChange =
            Boolean(normalizedIncomingAdminEmail) &&
            normalizedIncomingAdminEmail !== normalizedCurrentAdminEmail;

          await tx.user.update({
            where: { id: adminUser.id },
            data: {
              name: updateTenantDto.adminName || undefined,
              email: updateTenantDto.adminEmail || undefined,
              password:
                hashedPassword || shouldResolvePasswordForAdminEmailChange
                  ? null
                  : undefined,
              updatedBy: this.masterAuditUser,
            },
          });

          finalAdminEmailForPassword =
            updateTenantDto.adminEmail || adminUser.email;
          adminProfileSyncPayload = {
            name: updateTenantDto.adminName || adminUser.name,
            email: updateTenantDto.adminEmail || adminUser.email,
          };

          if (
            shouldResolvePasswordForAdminEmailChange &&
            finalAdminEmailForPassword
          ) {
            adminsToSync.push({
              userId: adminUser.id,
              tenantId: id,
              email: finalAdminEmailForPassword,
            });
          }
        }
      }

      return updatedTenant;
    });

    if (finalAdminEmailForPassword) {
      if (hashedPassword) {
        await this.sharedProfilesService.updateEmailCredentialPassword(
          finalAdminEmailForPassword,
          hashedPassword,
          this.masterAuditUser,
        );
      } else if (adminsToSync.length > 0) {
        await this.sharedProfilesService.ensureEmailCredential(
          finalAdminEmailForPassword,
          { userId: this.masterAuditUser },
        );
      }
    }

    if (adminProfileSyncPayload) {
      await this.runAsMasterTenantContext(id, async () => {
        await this.sharedProfilesService.syncSharedProfileFromAdministrativeUser(
          id,
          adminProfileSyncPayload!,
          this.masterAuditUser,
        );
      });
    }

    return updatedTenant;
  }

  private async findEmailUsageRecord(
    entityType: EmailUsageEntityType,
    recordId: string,
  ) {
    switch (entityType) {
      case "ADMIN_USER":
      case "USER": {
        const record = await this.prisma.user.findFirst({
          where: { id: recordId, canceledAt: null },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            updatedAt: true,
            updatedBy: true,
            tenant: { select: { id: true, name: true } },
          },
        });
        if (!record)
          throw new NotFoundException(
            "Registro de usuário não encontrado após atualização.",
          );
        return this.mapUserEmailUsage(record);
      }
      case "TEACHER": {
        const record = await this.prisma.teacher.findFirst({
          where: { id: recordId, canceledAt: null },
          select: {
            id: true,
            person: { select: { name: true, email: true } },
            updatedAt: true,
            updatedBy: true,
            tenant: { select: { id: true, name: true } },
          },
        });
        if (!record)
          throw new NotFoundException(
            "Registro de professor não encontrado após atualização.",
          );
        return this.mapTeacherEmailUsage({
          ...record,
          email: record.person?.email ?? null,
        });
      }
      case "STUDENT": {
        const record = await this.prisma.student.findFirst({
          where: { id: recordId, canceledAt: null },
          select: {
            id: true,
            person: { select: { name: true, email: true } },
            updatedAt: true,
            updatedBy: true,
            tenant: { select: { id: true, name: true } },
          },
        });
        if (!record)
          throw new NotFoundException(
            "Registro de aluno não encontrado após atualização.",
          );
        return this.mapStudentEmailUsage({
          ...record,
          email: record.person?.email ?? null,
        });
      }
      case "GUARDIAN": {
        const record = await this.prisma.guardian.findFirst({
          where: { id: recordId, canceledAt: null },
          select: {
            id: true,
            person: { select: { name: true, email: true } },
            updatedAt: true,
            updatedBy: true,
            tenant: { select: { id: true, name: true } },
          },
        });
        if (!record)
          throw new NotFoundException(
            "Registro de responsável não encontrado após atualização.",
          );
        return this.mapGuardianEmailUsage({
          ...record,
          email: record.person?.email ?? null,
        });
      }
    }
  }
}
