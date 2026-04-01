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
import {
  getDefaultPermissionsForRole,
  normalizePermissions,
  serializePermissions,
} from "../../../../common/auth/user-permissions";
import {
  getDefaultAccessProfileForRole,
  normalizeComplementaryAccessProfiles,
  normalizeAccessProfileCode,
  resolveAccountPermissions,
  serializeComplementaryAccessProfiles,
} from "../../../../common/auth/access-profiles";
import { tenantContext } from "../../../../common/tenant/tenant.context";
import { SharedProfilesService } from "../../../shared-profiles/application/services/shared-profiles.service";

type EmailUsageEntityType =
  | "TENANT"
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
      role: "SOFTHOUSE_ADMIN",
      isMaster: true,
    };

    return tenantContext.run(context, () => operation());
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

  private normalizeEntityType(
    entityType?: string | null,
  ): EmailUsageEntityType {
    const normalized = String(entityType || "")
      .trim()
      .toUpperCase();
    const validTypes: EmailUsageEntityType[] = [
      "TENANT",
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

  private mapTenantEmailUsage(record: {
    id: string;
    name: string;
    email: string | null;
    document?: string | null;
    updatedAt: Date;
    updatedBy?: string | null;
  }): EmailUsageItem {
    return {
      entityType: "TENANT",
      entityLabel: "ESCOLA",
      recordId: record.id,
      tenantId: record.id,
      tenantName: record.name,
      recordName: record.name,
      currentEmail: record.email || "",
      document: record.document,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
    };
  }

  private mapUserEmailUsage(record: {
    id: string;
    name: string;
    email: string | null;
    role: string;
    updatedAt: Date;
    updatedBy?: string | null;
    tenant: { id: string; name: string; document?: string | null };
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
      document: record.tenant.document,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
    };
  }

  private mapTeacherEmailUsage(record: {
    id: string;
    name: string;
    email: string | null;
    updatedAt: Date;
    updatedBy?: string | null;
    tenant: { id: string; name: string; document?: string | null };
  }): EmailUsageItem {
    return {
      entityType: "TEACHER",
      entityLabel: "PROFESSOR",
      recordId: record.id,
      tenantId: record.tenant.id,
      tenantName: record.tenant.name,
      recordName: record.name,
      currentEmail: record.email || "",
      document: record.tenant.document,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
    };
  }

  private mapStudentEmailUsage(record: {
    id: string;
    name: string;
    email: string | null;
    updatedAt: Date;
    updatedBy?: string | null;
    tenant: { id: string; name: string; document?: string | null };
  }): EmailUsageItem {
    return {
      entityType: "STUDENT",
      entityLabel: "ALUNO",
      recordId: record.id,
      tenantId: record.tenant.id,
      tenantName: record.tenant.name,
      recordName: record.name,
      currentEmail: record.email || "",
      document: record.tenant.document,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
    };
  }

  private mapGuardianEmailUsage(record: {
    id: string;
    name: string;
    email: string | null;
    updatedAt: Date;
    updatedBy?: string | null;
    tenant: { id: string; name: string; document?: string | null };
  }): EmailUsageItem {
    return {
      entityType: "GUARDIAN",
      entityLabel: "RESPONSAVEL",
      recordId: record.id,
      tenantId: record.tenant.id,
      tenantName: record.tenant.name,
      recordName: record.name,
      currentEmail: record.email || "",
      document: record.tenant.document,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
    };
  }

  async create(createTenantDto: CreateTenantDto) {
    if (createTenantDto.email)
      createTenantDto.email = createTenantDto.email.toUpperCase();
    if (createTenantDto.adminEmail)
      createTenantDto.adminEmail = createTenantDto.adminEmail.toUpperCase();

    this.validateAndNormalizeSmtp(createTenantDto);

    if (createTenantDto.document) {
      const existingTenant = await this.prisma.tenant.findUnique({
        where: { document: createTenantDto.document },
      });
      if (existingTenant) {
        throw new ConflictException(
          "Uma escola com este documento já está registrada.",
        );
      }
    }

    const normalizedAdminPassword = String(
      createTenantDto.adminPassword || "",
    ).trim();
    let hashedPassword: string | null = null;
    if (normalizedAdminPassword) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(normalizedAdminPassword, salt);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const newTenant = await tx.tenant.create({
        data: {
          name: createTenantDto.name,
          document: createTenantDto.document,
          logoUrl: createTenantDto.logoUrl?.trim() || null,
          rg: createTenantDto.rg,
          cpf: createTenantDto.cpf,
          cnpj: createTenantDto.cnpj,
          nickname: createTenantDto.nickname,
          corporateName: createTenantDto.corporateName,
          phone: createTenantDto.phone,
          whatsapp: createTenantDto.whatsapp,
          cellphone1: createTenantDto.cellphone1,
          cellphone2: createTenantDto.cellphone2,
          email: createTenantDto.email,
          zipCode: createTenantDto.zipCode,
          street: createTenantDto.street,
          number: createTenantDto.number,
          city: createTenantDto.city,
          state: createTenantDto.state,
          neighborhood: createTenantDto.neighborhood,
          complement: createTenantDto.complement,
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
          createdBy: this.masterAuditUser,
          updatedBy: this.masterAuditUser,
        },
      });

      const newAdmin = await tx.user.create({
        data: {
          tenantId: newTenant.id,
          name: createTenantDto.adminName,
          email: createTenantDto.adminEmail,
          password: null,
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
        users: {
          where: { role: "ADMIN" },
          select: { name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return tenants.map(({ smtpPassword: _smtpPassword, ...tenant }) => tenant);
  }

  async findCurrent(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        canceledAt: null,
      },
      select: {
        id: true,
        name: true,
        document: true,
        logoUrl: true,
        email: true,
        whatsapp: true,
        phone: true,
        city: true,
        state: true,
        neighborhood: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        "Escola não encontrada para o usuário logado.",
      );
    }

    return tenant;
  }

  async findEmailUsage(email: string) {
    const normalizedEmail = this.assertEmailForLookup(email);
    const prismaClient = (this.prisma as PrismaService & {
      getUnscopedClient?: () => PrismaService;
    }).getUnscopedClient?.() || this.prisma;

    const [tenants, users, teachers, students, guardians] = await Promise.all([
      prismaClient.tenant.findMany({
        where: { canceledAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          document: true,
          updatedAt: true,
          updatedBy: true,
        },
      }),
      prismaClient.user.findMany({
        where: { canceledAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          updatedAt: true,
          updatedBy: true,
          tenant: { select: { id: true, name: true, document: true } },
        },
      }) as Promise<
        Array<{
          id: string;
          name: string;
          email: string | null;
          role: string;
          updatedAt: Date;
          updatedBy?: string | null;
          tenant: { id: string; name: string; document?: string | null };
        }>
      >,
      prismaClient.teacher.findMany({
        where: { canceledAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          updatedAt: true,
          updatedBy: true,
          tenant: { select: { id: true, name: true, document: true } },
        },
      }) as Promise<
        Array<{
          id: string;
          name: string;
          email: string | null;
          updatedAt: Date;
          updatedBy?: string | null;
          tenant: { id: string; name: string; document?: string | null };
        }>
      >,
      prismaClient.student.findMany({
        where: { canceledAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          updatedAt: true,
          updatedBy: true,
          tenant: { select: { id: true, name: true, document: true } },
        },
      }) as Promise<
        Array<{
          id: string;
          name: string;
          email: string | null;
          updatedAt: Date;
          updatedBy?: string | null;
          tenant: { id: string; name: string; document?: string | null };
        }>
      >,
      prismaClient.guardian.findMany({
        where: { canceledAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          updatedAt: true,
          updatedBy: true,
          tenant: { select: { id: true, name: true, document: true } },
        },
      }) as Promise<
        Array<{
          id: string;
          name: string;
          email: string | null;
          updatedAt: Date;
          updatedBy?: string | null;
          tenant: { id: string; name: string; document?: string | null };
        }>
      >,
    ]);

    return [
      ...tenants.map((record: {
        id: string;
        name: string;
        email: string | null;
        document?: string | null;
        updatedAt: Date;
        updatedBy?: string | null;
      }) => this.mapTenantEmailUsage(record)),
      ...users.map((record: {
        id: string;
        name: string;
        email: string | null;
        role: string;
        updatedAt: Date;
        updatedBy?: string | null;
        tenant: { id: string; name: string; document?: string | null };
      }) => this.mapUserEmailUsage(record)),
      ...teachers.map((record: {
        id: string;
        name: string;
        email: string | null;
        updatedAt: Date;
        updatedBy?: string | null;
        tenant: { id: string; name: string; document?: string | null };
      }) => this.mapTeacherEmailUsage(record)),
      ...students.map((record: {
        id: string;
        name: string;
        email: string | null;
        updatedAt: Date;
        updatedBy?: string | null;
        tenant: { id: string; name: string; document?: string | null };
      }) => this.mapStudentEmailUsage(record)),
      ...guardians.map((record: {
        id: string;
        name: string;
        email: string | null;
        updatedAt: Date;
        updatedBy?: string | null;
        tenant: { id: string; name: string; document?: string | null };
      }) => this.mapGuardianEmailUsage(record)),
    ]
      .filter((item) => this.normalizeEmail(item.currentEmail) === normalizedEmail)
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
      case "TENANT": {
        const tenant = await this.prisma.tenant.findFirst({
          where: { id: recordId, canceledAt: null },
          select: { id: true },
        });

        if (!tenant) {
          throw new NotFoundException(
            "Escola não encontrada para atualização de email.",
          );
        }

        await this.prisma.tenant.update({
          where: { id: recordId },
          data: {
            email: newEmail,
            updatedBy: this.masterAuditUser,
          },
        });

        return {
          message: "Email da escola atualizado com sucesso.",
          usage: await this.findEmailUsageRecord("TENANT", recordId),
        };
      }
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

        await this.prisma.teacher.update({
          where: { id: recordId },
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
          select: { id: true },
        });

        if (!student) {
          throw new NotFoundException(
            "Aluno não encontrado para atualização de email.",
          );
        }

        await this.sharedProfilesService.ensureEmailCredential(newEmail, {
          userId: this.masterAuditUser,
        });

        await this.prisma.student.update({
          where: { id: recordId },
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
          select: { id: true },
        });

        if (!guardian) {
          throw new NotFoundException(
            "Responsável não encontrado para atualização de email.",
          );
        }

        await this.sharedProfilesService.ensureEmailCredential(newEmail, {
          userId: this.masterAuditUser,
        });

        await this.prisma.guardian.update({
          where: { id: recordId },
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

    const users = await this.prisma.user.findMany({
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
        createdAt: true,
        updatedAt: true,
        canceledAt: true,
      },
    });

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
    payload: {
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
    },
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
    const complementaryProfiles =
      role === "ADMIN"
        ? []
        : normalizeComplementaryAccessProfiles(payload.complementaryProfiles);
    const accessProfile = normalizeAccessProfileCode(
      payload.accessProfile,
      role,
    );
    const permissions = normalizePermissions(payload.permissions);
    const effectivePermissions =
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

    if (!name) {
      throw new BadRequestException("Informe o nome do usuário de acesso.");
    }

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
        createdAt: true,
        updatedAt: true,
        canceledAt: true,
      },
    });

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
      user: this.mapAccessUser(user),
    };
  }

  async updateAccessUser(
    tenantId: string,
    userId: string,
    payload: {
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
    },
  ) {
    const user = await this.prisma.user.findFirst({
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
      },
    });

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
    const complementaryProfiles =
      role === "ADMIN"
        ? []
        : payload.complementaryProfiles !== undefined ||
            payload.role !== undefined
          ? normalizeComplementaryAccessProfiles(payload.complementaryProfiles)
          : normalizeComplementaryAccessProfiles(user.complementaryProfiles);
    const accessProfile =
      payload.accessProfile !== undefined || payload.role !== undefined
        ? normalizeAccessProfileCode(payload.accessProfile, role)
        : normalizeAccessProfileCode(
            (user as { accessProfile?: string | null }).accessProfile,
            role,
          );
    const permissions = normalizePermissions(payload.permissions);
    const effectivePermissions =
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
          hashedPassword || shouldResolvePasswordForEmailChange ? null : undefined,
        photoUrl,
        complementaryProfiles:
          role === "ADMIN"
            ? null
            : serializeComplementaryAccessProfiles(complementaryProfiles),
        role,
        accessProfile: accessProfile,
        permissions:
          role === "ADMIN" ? null : serializePermissions(effectivePermissions),
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
        createdAt: true,
        updatedAt: true,
        canceledAt: true,
      },
    });

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
      user: this.mapAccessUser(updated),
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
          users: (await tx.user.deleteMany({ where: { tenantId } })).count,
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

    this.validateAndNormalizeSmtp(updateTenantDto);

    if (
      updateTenantDto.document &&
      updateTenantDto.document !== tenant.document
    ) {
      const existing = await this.prisma.tenant.findUnique({
        where: { document: updateTenantDto.document },
      });
      if (existing)
        throw new ConflictException(
          "Uma escola com este documento já está registrada.",
        );
    }

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
          document: updateTenantDto.document,
          logoUrl: Object.prototype.hasOwnProperty.call(
            updateTenantDto,
            "logoUrl",
          )
            ? updateTenantDto.logoUrl?.trim() || null
            : undefined,
          rg: updateTenantDto.rg,
          cpf: updateTenantDto.cpf,
          cnpj: updateTenantDto.cnpj,
          nickname: updateTenantDto.nickname,
          corporateName: updateTenantDto.corporateName,
          phone: updateTenantDto.phone,
          whatsapp: updateTenantDto.whatsapp,
          cellphone1: updateTenantDto.cellphone1,
          cellphone2: updateTenantDto.cellphone2,
          email: updateTenantDto.email,
          zipCode: updateTenantDto.zipCode,
          street: updateTenantDto.street,
          number: updateTenantDto.number,
          city: updateTenantDto.city,
          state: updateTenantDto.state,
          neighborhood: updateTenantDto.neighborhood,
          complement: updateTenantDto.complement,
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

          if (shouldResolvePasswordForAdminEmailChange && finalAdminEmailForPassword) {
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
      case "TENANT": {
        const record = await this.prisma.tenant.findFirst({
          where: { id: recordId, canceledAt: null },
          select: {
            id: true,
            name: true,
            email: true,
            document: true,
            updatedAt: true,
            updatedBy: true,
          },
        });
        if (!record || !record.email)
          throw new NotFoundException(
            "Registro de escola não encontrado após atualização.",
          );
        return this.mapTenantEmailUsage(record);
      }
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
            tenant: { select: { id: true, name: true, document: true } },
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
            name: true,
            email: true,
            updatedAt: true,
            updatedBy: true,
            tenant: { select: { id: true, name: true, document: true } },
          },
        });
        if (!record)
          throw new NotFoundException(
            "Registro de professor não encontrado após atualização.",
          );
        return this.mapTeacherEmailUsage(record);
      }
      case "STUDENT": {
        const record = await this.prisma.student.findFirst({
          where: { id: recordId, canceledAt: null },
          select: {
            id: true,
            name: true,
            email: true,
            updatedAt: true,
            updatedBy: true,
            tenant: { select: { id: true, name: true, document: true } },
          },
        });
        if (!record)
          throw new NotFoundException(
            "Registro de aluno não encontrado após atualização.",
          );
        return this.mapStudentEmailUsage(record);
      }
      case "GUARDIAN": {
        const record = await this.prisma.guardian.findFirst({
          where: { id: recordId, canceledAt: null },
          select: {
            id: true,
            name: true,
            email: true,
            updatedAt: true,
            updatedBy: true,
            tenant: { select: { id: true, name: true, document: true } },
          },
        });
        if (!record)
          throw new NotFoundException(
            "Registro de responsável não encontrado após atualização.",
          );
        return this.mapGuardianEmailUsage(record);
      }
    }
  }
}
