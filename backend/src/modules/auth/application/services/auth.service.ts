import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../../../prisma/prisma.service";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { assertStrongPassword } from "../../../../common/security/password-policy";
import { LoginDto } from "../dto/login.dto";
import { RegisterDto } from "../dto/register.dto";
import { ForgotPasswordDto } from "../dto/forgot-password.dto";
import { ResetPasswordDto } from "../dto/reset-password.dto";
import * as crypto from "crypto";
import * as nodemailer from "nodemailer";
import { ICurrentUser } from "../../../../common/decorators/current-user.decorator";
import {
  deserializePermissions,
  serializePermissions,
} from "../../../../common/auth/user-permissions";
import {
  ACCESS_PROFILE_DEFINITIONS,
  getDefaultAccessProfileForRole,
  normalizeComplementaryAccessProfiles,
  normalizeAccessProfileCode,
  resolveAccountPermissions,
  serializeComplementaryAccessProfiles,
} from "../../../../common/auth/access-profiles";
import {
  isMasterLoginIdentifier,
} from "../../../../common/auth/master-auth";
import { SharedProfilesService } from "../../../shared-profiles/application/services/shared-profiles.service";
import { GlobalSettingsService } from "../../../global-settings/application/services/global-settings.service";
import {
  DEFAULT_BRANCH_CODE,
  getVisibleBranchCodes,
  normalizeBranchCode,
  SHARED_BRANCH_CODE,
} from "../../../../common/tenant/branch.constants";
import {
  mapTenantBranchSummary,
} from "../../../../common/tenant/tenant-branches";
import {
  isCentralIdentityEnabled,
} from "../../../../common/security/security-config";
import {
  type CentralIdentityResolution,
  MsInforCentralSettingsClient,
} from "../../../../integrations/msinfor-central/msinfor-central-settings.client";
import { CentralTenantConfigurationService } from "../../../../integrations/msinfor-central/central-tenant-configuration.service";
import { FinanceiroService } from "../../../../integrations/financeiro/financeiro.service";

type AccountModelType = "user" | "teacher" | "student" | "guardian";

export const AUTH_SESSION_TOKEN = Symbol("AUTH_SESSION_TOKEN");

export function readAuthSessionToken(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const value = (result as { [AUTH_SESSION_TOKEN]?: unknown })[
    AUTH_SESSION_TOKEN
  ];
  return typeof value === "string" ? value : "";
}

type AccountLookup = {
  id: string;
  tenantId: string;
  branchCode: number;
  name: string;
  email: string | null;
  accessUsername?: string | null;
  password: string | null;
  role: string;
  accessProfile?: string | null;
  complementaryProfiles?: string | null;
  cashierOnly?: boolean | null;
  permissions: string[];
  branchAccessCodes?: number[];
  modelType: AccountModelType;
  tenant: {
    id: string;
    name: string;
    logoUrl?: string | null;
    branches?: Array<{ logoUrl?: string | null }>;
  };
};

type LoginCashSessionPreflight = {
  opened: boolean;
  openingAmount: number;
  cashClosingMode: string;
  openedAt: string;
  cashierDisplayName: string;
  branchLogoUrl: string | null;
  branchName: string | null;
  companyName: string | null;
};

type LoginAccountSelection = {
  accountId: string;
  accountType: AccountModelType;
  role: string;
  roleLabel: string;
  name: string;
  email: string | null;
  tenant: {
    id: string;
    name: string;
    logoUrl?: string | null;
  };
};

const AUTH_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const LOGIN_CASHIER_BLOCK_MESSAGE =
  "NÃO É POSSÍVEL ACESSAR O SISTEMA NA DATA DE HOJE. O CAIXA DO DIA ANTERIOR PRECISA SER FECHADO ANTES DE CONTINUAR.";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly sharedProfilesService: SharedProfilesService,
    private readonly globalSettingsService: GlobalSettingsService,
    private readonly centralIdentity: MsInforCentralSettingsClient,
    private readonly centralConfiguration: CentralTenantConfigurationService,
    private readonly financeiroService: FinanceiroService,
  ) {}

  private resolveCentralLocalRole(roleCode?: string | null) {
    const normalizedRoleCode = String(roleCode || "").trim().toUpperCase();
    const profileCode = normalizeAccessProfileCode(normalizedRoleCode);
    return profileCode
      ? ACCESS_PROFILE_DEFINITIONS[profileCode].role
      : normalizedRoleCode;
  }

  private centralRoleMatchesAccount(
    roleCode: string,
    account: Pick<AccountLookup, "role" | "accessProfile">,
  ) {
    const normalizedAccountRole = account.role.trim().toUpperCase();
    if (normalizedAccountRole !== this.resolveCentralLocalRole(roleCode)) {
      return false;
    }
    const profileCode = normalizeAccessProfileCode(roleCode);
    return (
      !profileCode ||
      normalizeAccessProfileCode(account.accessProfile, account.role) ===
        profileCode
    );
  }

  private normalizeEmailVariants(email: string): string[] {
    const clean = email.trim();
    return Array.from(
      new Set([clean, clean.toUpperCase(), clean.toLowerCase()]),
    );
  }

  private normalizeComparableEmail(email?: string | null) {
    return String(email || "")
      .trim()
      .toUpperCase();
  }

  private getCrossTenantPrisma(): PrismaClient {
    const prismaWithUnscoped = this.prisma as PrismaService & {
      getUnscopedClient?: () => PrismaClient;
    };

    return typeof prismaWithUnscoped.getUnscopedClient === "function"
      ? prismaWithUnscoped.getUnscopedClient()
      : this.prisma;
  }

  private isMicrosoftConsumerDomain(email?: string | null): boolean {
    if (!email) return false;
    const domain = email.trim().toLowerCase().split("@")[1] || "";
    return (
      domain.startsWith("hotmail.") ||
      domain.startsWith("outlook.") ||
      domain.startsWith("live.")
    );
  }

  private async findAccountByEmail(email: string): Promise<AccountLookup[]> {
    return this.findAccountByLogin(email, false);
  }

  private async findAccountByLogin(
    login: string,
    allowAccessUsername = true,
  ): Promise<AccountLookup[]> {
    const loginVariants = this.normalizeEmailVariants(login);
    const prismaClient = this.getCrossTenantPrisma();
    const tenantSelect = {
      id: true,
      name: true,
      branches: {
        where: { branchCode: DEFAULT_BRANCH_CODE, canceledAt: null },
        select: { logoUrl: true },
        take: 1,
      },
    } as const;
    const baseSelect = {
      id: true,
      tenantId: true,
      branchCode: true,
      accessProfile: true,
      permissions: true,
      tenant: { select: tenantSelect },
    } as const;

    const [users, teachers, students, guardians] = await Promise.all([
      prismaClient.user.findMany({
        where: allowAccessUsername
          ? {
              OR: [
                { person: { accessUsername: { in: loginVariants } } },
                { accessUsername: { in: loginVariants } },
              ],
              canceledAt: null,
            }
          : {
              person: { email: { in: loginVariants } },
              canceledAt: null,
            },
        select: {
          ...baseSelect,
          name: true,
          accessUsername: true,
          person: { select: { name: true, email: true, password: true, accessUsername: true } },
          password: true,
          role: true,
          complementaryProfiles: true,
          cashierOnly: true,
          branchAccesses: {
            where: { canceledAt: null },
            orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
            select: { branchCode: true, isDefault: true },
          },
        },
      }),
      prismaClient.teacher.findMany({
        where: allowAccessUsername
          ? {
              OR: [
                { person: { accessUsername: { in: loginVariants } } },
                { accessUsername: { in: loginVariants } },
              ],
              canceledAt: null,
            }
          : {
              person: { email: { in: loginVariants } },
              canceledAt: null,
            },
        select: {
          ...baseSelect,
          accessUsername: true,
          person: { select: { name: true, email: true, password: true, accessUsername: true } },
          branchAccesses: {
            where: { canceledAt: null },
            orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
            select: { branchCode: true, isDefault: true },
          },
        },
      }),
      prismaClient.student.findMany({
        where: allowAccessUsername
          ? {
              OR: [
                { person: { accessUsername: { in: loginVariants } } },
                { accessUsername: { in: loginVariants } },
              ],
              canceledAt: null,
            }
          : {
              person: { email: { in: loginVariants } },
              canceledAt: null,
            },
        select: {
          ...baseSelect,
          accessUsername: true,
          person: { select: { name: true, email: true, password: true, accessUsername: true } },
          branchAccesses: {
            where: { canceledAt: null },
            orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
            select: { branchCode: true, isDefault: true },
          },
        },
      }),
      prismaClient.guardian.findMany({
        where: allowAccessUsername
          ? {
              OR: [
                { person: { accessUsername: { in: loginVariants } } },
                { accessUsername: { in: loginVariants } },
              ],
              canceledAt: null,
            }
          : {
              person: { email: { in: loginVariants } },
              canceledAt: null,
            },
        select: {
          ...baseSelect,
          accessUsername: true,
          person: { select: { name: true, email: true, password: true, accessUsername: true } },
          branchAccesses: {
            where: { canceledAt: null },
            orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
            select: { branchCode: true, isDefault: true },
          },
        },
      }),
    ]);

    return [
      ...users.map((u) => ({
        ...u,
        name: u.person?.name ?? u.name,
        email: u.person?.email ?? null,
        accessUsername: u.person?.accessUsername ?? u.accessUsername ?? null,
        modelType: "user" as const,
        branchAccessCodes: Array.from(
          new Set(
            (u.branchAccesses || [])
              .map((access) =>
                normalizeBranchCode(access.branchCode, DEFAULT_BRANCH_CODE),
              )
              .filter((branchCode) => branchCode >= DEFAULT_BRANCH_CODE),
          ),
        ),
        permissions: resolveAccountPermissions({
          role: u.role,
          accessProfile: u.accessProfile,
          complementaryProfiles: u.complementaryProfiles,
          permissions: u.permissions,
        }),
      })),
      ...teachers.map((t) => ({
        ...t,
        name: t.person?.name ?? "PROFESSOR",
        email: t.person?.email ?? null,
        accessUsername: t.person?.accessUsername ?? t.accessUsername ?? null,
        password: t.person?.password ?? null,
        modelType: "teacher" as const,
        role: "PROFESSOR",
        branchAccessCodes: Array.from(
          new Set(
            (t.branchAccesses || [])
              .map((access) =>
                normalizeBranchCode(access.branchCode, DEFAULT_BRANCH_CODE),
              )
              .filter((branchCode) => branchCode >= DEFAULT_BRANCH_CODE),
          ),
        ),
        permissions: resolveAccountPermissions({
          role: "PROFESSOR",
          accessProfile: t.accessProfile,
          permissions: t.permissions,
        }),
      })),
      ...students.map((s) => ({
        ...s,
        name: s.person?.name ?? "ALUNO",
        email: s.person?.email ?? null,
        accessUsername: s.person?.accessUsername ?? s.accessUsername ?? null,
        password: s.person?.password ?? null,
        modelType: "student" as const,
        role: "ALUNO",
        branchAccessCodes: Array.from(
          new Set(
            (s.branchAccesses || [])
              .map((access) =>
                normalizeBranchCode(access.branchCode, DEFAULT_BRANCH_CODE),
              )
              .filter((branchCode) => branchCode >= DEFAULT_BRANCH_CODE),
          ),
        ),
        permissions: resolveAccountPermissions({
          role: "ALUNO",
          accessProfile: s.accessProfile,
          permissions: s.permissions,
        }),
      })),
      ...guardians.map((g) => ({
        ...g,
        name: g.person?.name ?? "RESPONSAVEL",
        email: g.person?.email ?? null,
        accessUsername: g.person?.accessUsername ?? g.accessUsername ?? null,
        password: g.person?.password ?? null,
        modelType: "guardian" as const,
        role: "RESPONSAVEL",
        branchAccessCodes: Array.from(
          new Set(
            (g.branchAccesses || [])
              .map((access) =>
                normalizeBranchCode(access.branchCode, DEFAULT_BRANCH_CODE),
              )
              .filter((branchCode) => branchCode >= DEFAULT_BRANCH_CODE),
          ),
        ),
        permissions: resolveAccountPermissions({
          role: "RESPONSAVEL",
          accessProfile: g.accessProfile,
          permissions: g.permissions,
        }),
      })),
    ];
  }

  private toSafeLoginUser(
    account: AccountLookup,
    sessionBranchCode = DEFAULT_BRANCH_CODE,
  ) {
    return {
      id: account.id,
      tenantId: account.tenantId,
      branchCode: normalizeBranchCode(sessionBranchCode, DEFAULT_BRANCH_CODE),
      role: account.role,
      permissions: account.permissions,
      branchAccessCodes: account.branchAccessCodes || [],
      canAccessAllBranches: this.canAccountAccessAllBranches(account),
      complementaryProfiles:
        account.modelType === "user"
          ? normalizeComplementaryAccessProfiles(account.complementaryProfiles)
          : [],
      cashierOnly:
        account.modelType === "user" ? Boolean(account.cashierOnly) : false,
      name: account.name,
      email: account.email,
      modelType: account.modelType,
      tenant: account.tenant
        ? {
            id: account.tenant.id,
            name: account.tenant.name,
            logoUrl: this.getTenantLogoUrl(account.tenant),
          }
        : undefined,
    };
  }

  private async loadAccountPassword(
    modelType: AccountModelType,
    userId: string,
    tenantId: string,
  ): Promise<{ password: string | null } | null> {
    const where = { id: userId, tenantId };
    switch (modelType) {
      case "user":
        return this.prisma.user.findFirst({
          where,
          select: { password: true },
        });
      case "teacher":
        return this.prisma.teacher
          .findFirst({
            where,
            select: { person: { select: { password: true } } },
          })
          .then((record) => ({ password: record?.person?.password ?? null }));
      case "student":
        return this.prisma.student
          .findFirst({
            where,
            select: { person: { select: { password: true } } },
          })
          .then((record) => ({ password: record?.person?.password ?? null }));
      case "guardian":
        return this.prisma.guardian
          .findFirst({
            where,
            select: { person: { select: { password: true } } },
          })
          .then((record) => ({ password: record?.person?.password ?? null }));
      default:
        return null;
    }
  }

  private async loadAccountById(
    modelType: AccountModelType,
    userId: string,
    tenantId: string,
  ): Promise<{ email: string | null; role: string } | null> {
    const where = { id: userId, tenantId };
    switch (modelType) {
      case "user":
        return this.prisma.user
          .findFirst({
            where,
            select: { role: true, person: { select: { email: true } } },
          })
          .then((record) =>
            record
              ? { email: record.person?.email ?? null, role: record.role }
              : null,
          );
      case "teacher":
        return this.prisma.teacher
          .findFirst({
            where,
            select: { person: { select: { email: true } } },
          })
          .then((record) =>
            record
              ? {
                  email: record.person?.email ?? null,
                  role: "PROFESSOR",
                }
              : null,
          );
      case "student":
        return this.prisma.student
          .findFirst({
            where,
            select: { person: { select: { email: true } } },
          })
          .then((record) =>
            record
              ? {
                  email: record.person?.email ?? null,
                  role: "ALUNO",
                }
              : null,
          );
      case "guardian":
        return this.prisma.guardian
          .findFirst({
            where,
            select: { person: { select: { email: true } } },
          })
          .then((record) =>
            record
              ? {
                  email: record.person?.email ?? null,
                  role: "RESPONSAVEL",
                }
              : null,
          );
      default:
        return null;
    }
  }

  private async loadPasswordCandidatesByEmailAcrossAllProfiles(
    email: string,
  ): Promise<Array<{ password: string | null }>> {
    const normalizedEmail = this.normalizeComparableEmail(email);
    const crossTenantPrisma = this.getCrossTenantPrisma();
    const [teachers, students, guardians, people] = await Promise.all([
      crossTenantPrisma.teacher.findMany({
        where: {
          person: { email: { not: null } },
        },
        select: { person: { select: { email: true, password: true } } },
      }),
      crossTenantPrisma.student.findMany({
        where: {
          person: { email: { not: null } },
        },
        select: { person: { select: { email: true, password: true } } },
      }),
      crossTenantPrisma.guardian.findMany({
        where: {
          person: { email: { not: null } },
        },
        select: { person: { select: { email: true, password: true } } },
      }),
      crossTenantPrisma.person.findMany({
        where: {
          email: { not: null },
        },
        select: { email: true, password: true },
      }),
    ]);

    const roleCandidates = [...teachers, ...students, ...guardians].map(
      (account) => ({
        email: account.person?.email ?? null,
        password: account.person?.password ?? null,
      }),
    );

    return [...people, ...roleCandidates]
      .filter(
        (account) =>
          this.normalizeComparableEmail(account.email) === normalizedEmail,
      )
      .map((account) => ({ password: account.password }));
  }

  private getUniqueTenants(accounts: AccountLookup[]) {
    return Array.from(
      new Map(
        accounts.map((account) => [
          account.tenant.id,
          {
            id: account.tenant.id,
            name: account.tenant.name,
            logoUrl: this.getTenantLogoUrl(account.tenant),
          },
        ]),
      ).values(),
    );
  }

  private getTenantLogoUrl(tenant?: {
    logoUrl?: string | null;
    branches?: Array<{ logoUrl?: string | null }>;
  }) {
    return tenant?.logoUrl ?? tenant?.branches?.[0]?.logoUrl ?? null;
  }

  private canAccountAccessAllBranches(account: {
    role?: string | null;
    modelType?: AccountModelType | "master";
  }) {
    return (
      String(account.role || "")
        .trim()
        .toUpperCase() === "ADMIN"
    );
  }

  private async listSelectableBranchesForTenant(tenantId: string) {
    const branches = await this.centralConfiguration.listBranches(tenantId);
    return branches.map((branch) => ({
      id: branch.id,
      branchCode: branch.branchCode,
      name: branch.displayName,
      logoUrl: this.centralIdentity.resolvePublicLogoUrl(
        branch.company.logoReference,
        "branch",
      ),
      isActive: true,
    }));
  }

  private async listAllowedBranchesForAccount(account: AccountLookup) {
    const branches = await this.listSelectableBranchesForTenant(
      account.tenantId,
    );

    if (this.canAccountAccessAllBranches(account)) {
      return branches;
    }

    if (account.modelType === "user") {
      const explicitCodes =
        account.branchAccessCodes && account.branchAccessCodes.length > 0
          ? account.branchAccessCodes
          : [normalizeBranchCode(account.branchCode, DEFAULT_BRANCH_CODE)];
      const allowedCodes = new Set(explicitCodes);
      return branches.filter((branch) => allowedCodes.has(branch.branchCode));
    }

    const explicitCodes =
      account.branchAccessCodes && account.branchAccessCodes.length > 0
        ? account.branchAccessCodes
        : [];

    if (explicitCodes.length > 0) {
      const allowedCodes = new Set(explicitCodes);
      return branches.filter((branch) => allowedCodes.has(branch.branchCode));
    }

    const accountBranchCode = normalizeBranchCode(
      account.branchCode,
      DEFAULT_BRANCH_CODE,
    );

    if (accountBranchCode === SHARED_BRANCH_CODE) {
      return branches;
    }

    return branches.filter((branch) => branch.branchCode === accountBranchCode);
  }

  private async resolveSessionBranchForAccount(
    account: AccountLookup,
    requestedBranchCode?: unknown,
  ): Promise<
    | { status: "READY"; branchCode: number; allowedBranches: any[] }
    | { status: "NEEDS_SELECTION"; allowedBranches: any[] }
  > {
    const allowedBranches = await this.listAllowedBranchesForAccount(account);

    if (allowedBranches.length === 0) {
      throw new UnauthorizedException(
        "Acesso negado: nenhuma filial liberada para este usuário.",
      );
    }

    const hasRequestedBranch =
      requestedBranchCode !== undefined &&
      requestedBranchCode !== null &&
      String(requestedBranchCode).trim() !== "";

    if (!hasRequestedBranch) {
      if (allowedBranches.length > 1) {
        return { status: "NEEDS_SELECTION", allowedBranches };
      }

      return {
        status: "READY",
        branchCode: allowedBranches[0].branchCode,
        allowedBranches,
      };
    }

    const normalizedBranchCode = normalizeBranchCode(
      requestedBranchCode,
      DEFAULT_BRANCH_CODE,
    );
    const isAllowed = allowedBranches.some(
      (branch) => branch.branchCode === normalizedBranchCode,
    );

    if (!isAllowed) {
      throw new UnauthorizedException(
        "Acesso negado para a filial selecionada.",
      );
    }

    return {
      status: "READY",
      branchCode: normalizedBranchCode,
      allowedBranches,
    };
  }

  private getRoleLabel(role: string) {
    switch (
      String(role || "")
        .trim()
        .toUpperCase()
    ) {
      case "ADMIN":
        return "ADMINISTRADOR";
      case "SECRETARIA":
        return "SECRETARIA";
      case "COORDENACAO":
        return "COORDENAÇÃO";
      case "PROFESSOR":
        return "PROFESSOR";
      case "ALUNO":
        return "ALUNO";
      case "RESPONSAVEL":
        return "RESPONSÁVEL";
      default:
        return role || "ACESSO";
    }
  }

  private toLoginSelection(account: AccountLookup): LoginAccountSelection {
    return {
      accountId: account.id,
      accountType: account.modelType,
      role: account.role,
      roleLabel: this.getRoleLabel(account.role),
      name: account.name,
      email: account.email,
      tenant: {
        id: account.tenant.id,
        name: account.tenant.name,
        logoUrl: this.getTenantLogoUrl(account.tenant),
      },
    };
  }

  private sortLoginSelections(accounts: AccountLookup[]) {
    return [...accounts].sort((left, right) => {
      const tenantDiff = left.tenant.name.localeCompare(right.tenant.name);
      if (tenantDiff !== 0) return tenantDiff;

      const roleDiff = this.getRoleLabel(left.role).localeCompare(
        this.getRoleLabel(right.role),
      );
      if (roleDiff !== 0) return roleDiff;

      return left.name.localeCompare(right.name);
    });
  }

  private pickPreferredAccount(
    accounts: AccountLookup[],
  ): AccountLookup | null {
    if (accounts.length === 0) return null;

    const priority: Record<AccountModelType, number> = {
      user: 1,
      teacher: 2,
      student: 3,
      guardian: 4,
    };

    return [...accounts].sort((left, right) => {
      const priorityDiff = priority[left.modelType] - priority[right.modelType];
      if (priorityDiff !== 0) return priorityDiff;
      return left.id.localeCompare(right.id);
    })[0];
  }

  private async loadEmailCredential(email?: string | null) {
    return this.sharedProfilesService.getOrCreateEmailCredentialFromLegacy(
      email,
    );
  }

  private buildFrontendLink(pathname: string, token: string) {
    const frontendBaseUrl = (
      process.env.FRONTEND_URL || "http://localhost:3000"
    ).replace(/\/$/, "");

    return `${frontendBaseUrl}${pathname}?token=${token}`;
  }

  private async sendEmailUsingGlobalSettings(payload: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) {
    const settings = await this.globalSettingsService.findSettings();

    if (!settings.emailEnabled) {
      return { warning: "GLOBAL_EMAIL_DISABLED" as const };
    }

    const smtpHost = String(settings.emailSmtpHost || "").trim();
    const smtpPort = Number(settings.emailSmtpPort || 0) || 465;
    const smtpUser = String(settings.emailSmtpUser || "").trim();
    const smtpPassword = String(settings.emailSmtpPassword || "").trim();
    const smtpSecure = settings.emailUseSsl !== false;
    const smtpAuthenticate = settings.emailUseAuth !== false;

    if (!smtpHost) {
      return { warning: "GLOBAL_SMTP_MISSING" as const };
    }

    if (smtpAuthenticate && (!smtpUser || !smtpPassword)) {
      return { warning: "GLOBAL_SMTP_CREDENTIALS_MISSING" as const };
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

    return { warning: null };
  }

  private async triggerEmailVerification(email: string, name?: string | null) {
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationHash = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.sharedProfilesService.storeEmailCredentialVerificationToken(
      email,
      verificationHash,
      expiresAt,
    );

    const verificationLink = this.buildFrontendLink(
      "/confirm-email",
      verificationToken,
    );
    const displayName = String(name || email || "USUARIO").trim();
    const response: {
      status: "EMAIL_CONFIRMATION_REQUIRED";
      message: string;
      devVerificationLink?: string;
      warning?: string;
    } = {
      status: "EMAIL_CONFIRMATION_REQUIRED",
      message:
        "Este e-mail ainda não foi confirmado. Vamos enviar um e-mail de confirmação para continuar.",
    };

    if (process.env.NODE_ENV !== "production") {
      response.devVerificationLink = verificationLink;
    }

    try {
      const mailResult = await this.sendEmailUsingGlobalSettings({
        to: email,
        subject: "Confirmação de E-mail - MSINFOR",
        text: `${displayName}, confirme seu e-mail acessando: ${verificationLink}`,
        html: `<h3>Confirmação de e-mail</h3><p>${displayName}, confirme seu acesso clicando no botão abaixo.</p><a href="${verificationLink}" style="padding:10px 20px; background:#2563eb; color:#fff; text-decoration:none; border-radius:6px;">Confirmar e-mail</a>`,
      });

      if (mailResult.warning) {
        response.warning = mailResult.warning;
      }
    } catch (error) {
      console.error(
        "[SMTP Error] Falha ao enviar confirmação de e-mail:",
        error,
      );
      response.warning = "GLOBAL_SMTP_SEND_FAILED";
    }

    return response;
  }

  private async completeAuthenticatedLogin(
    validUsers: AccountLookup[],
    loginDto: LoginDto,
    options: {
      forcedLocalTenantId?: string;
      exposedTenantId?: string;
      centralIdentityAccountId?: string;
      canOperateCashier?: boolean;
    } = {},
  ) {
    const requestedBranchCode =
      loginDto.branchCode !== undefined &&
      loginDto.branchCode !== null &&
      String(loginDto.branchCode).trim() !== ""
        ? normalizeBranchCode(loginDto.branchCode, DEFAULT_BRANCH_CODE)
        : null;

    let userToLogin: AccountLookup | null = null;
    const validTenantIds = Array.from(
      new Set(validUsers.map((account) => account.tenantId)),
    );

    if (
      !options.forcedLocalTenantId &&
      !loginDto.accountId &&
      !loginDto.accountType &&
      !loginDto.tenantId &&
      validTenantIds.length > 1
    ) {
      return {
        status: "MULTIPLE_TENANTS",
        tenants: this.getUniqueTenants(validUsers),
      };
    }

    const selectedTenantId =
      options.forcedLocalTenantId ||
      loginDto.tenantId ||
      (validTenantIds.length === 1 ? validTenantIds[0] : null);

    if (!selectedTenantId) {
      throw new UnauthorizedException("Selecione a escola para continuar.");
    }

    const validUsersForTenant = validUsers.filter(
      (account) =>
        account.tenantId === selectedTenantId &&
        (requestedBranchCode === null ||
          account.modelType === "user" ||
          getVisibleBranchCodes(requestedBranchCode).includes(
            normalizeBranchCode(account.branchCode, DEFAULT_BRANCH_CODE),
          )),
    );

    if (validUsersForTenant.length === 0) {
      throw new UnauthorizedException("Acesso negado para esta escola.");
    }

    const selectableAccounts = validUsersForTenant;
    const exposeSelection = (account: AccountLookup) => {
      const selection = this.toLoginSelection(account);
      if (!options.exposedTenantId) return selection;
      return {
        ...selection,
        tenant: {
          ...selection.tenant,
          id: options.exposedTenantId,
        },
      };
    };

    if (!loginDto.accountId && !loginDto.accountType) {
      if (selectableAccounts.length > 1) {
        return {
          status: "MULTIPLE_ACCOUNTS",
          accounts: this.sortLoginSelections(selectableAccounts).map(
            exposeSelection,
          ),
        };
      }

      userToLogin = validUsersForTenant[0] || null;
    } else {
      const filteredAccounts = selectableAccounts.filter((account) => {
        if (
          loginDto.accountType &&
          account.modelType !== loginDto.accountType.trim().toLowerCase()
        ) {
          return false;
        }

        if (loginDto.accountId && account.id !== loginDto.accountId) {
          return false;
        }

        return true;
      });

      userToLogin = this.pickPreferredAccount(filteredAccounts);

      if (!userToLogin) {
        throw new UnauthorizedException(
          "Não foi possível localizar o tipo de acesso selecionado.",
        );
      }
    }

    if (!userToLogin) {
      return {
        status: "MULTIPLE_ACCOUNTS",
        accounts: this.sortLoginSelections(selectableAccounts).map((account) =>
          exposeSelection(account),
        ),
      };
    }

    if (!userToLogin) {
      throw new UnauthorizedException(
        "Não foi possível resolver o cadastro de acesso para esta escola.",
      );
    }

    const branchResolution = await this.resolveSessionBranchForAccount(
      userToLogin,
      loginDto.branchCode,
    );

    if (branchResolution.status === "NEEDS_SELECTION") {
      return {
        status: "MULTIPLE_BRANCHES",
        tenant: {
          id: options.exposedTenantId || userToLogin.tenant.id,
          name: userToLogin.tenant.name,
          logoUrl: this.getTenantLogoUrl(userToLogin.tenant),
        },
        account: exposeSelection(userToLogin),
        branches: branchResolution.allowedBranches.map(mapTenantBranchSummary),
      };
    }

    const cashSessionPreflight = await this.ensureCashSessionBeforeLogin(
      userToLogin,
      branchResolution.branchCode,
      options,
      branchResolution.allowedBranches.map((branch) => branch.branchCode),
      {
        branchLogoUrl:
          branchResolution.allowedBranches.find(
            (branch) => branch.branchCode === branchResolution.branchCode,
          )?.logoUrl
          || this.getTenantLogoUrl(userToLogin.tenant)
          || null,
        branchName:
          branchResolution.allowedBranches.find(
            (branch) => branch.branchCode === branchResolution.branchCode,
          )?.name
          || null,
        companyName: userToLogin.tenant.name || null,
      },
    );

    const payload = {
      userId: userToLogin.id,
      tenantId: userToLogin.tenantId,
      branchCode: branchResolution.branchCode,
      role: userToLogin.role,
      permissions: userToLogin.permissions,
      cashierOnly:
        userToLogin.modelType === "user" ? Boolean(userToLogin.cashierOnly) : false,
      canOperateCashier:
        options.centralIdentityAccountId
          ? options.canOperateCashier === true
          : false,
      branchAccessCodes: branchResolution.allowedBranches.map(
        (branch) => branch.branchCode,
      ),
      canAccessAllBranches: this.canAccountAccessAllBranches(userToLogin),
      name: userToLogin.name,
      modelType: userToLogin.modelType,
      identityProvider: options.centralIdentityAccountId
        ? "MSINFOR_CENTRAL"
        : "LOCAL",
    };

    const accessToken = await this.issueAuthSessionToken(payload);
    return {
      status: "SUCCESS",
      [AUTH_SESSION_TOKEN]: accessToken,
      user: {
        ...this.toSafeLoginUser(userToLogin, branchResolution.branchCode),
        branchAccessCodes: branchResolution.allowedBranches.map(
          (branch) => branch.branchCode,
        ),
        identityProvider: options.centralIdentityAccountId
          ? "MSINFOR_CENTRAL"
          : "LOCAL",
        canOperateCashier:
          options.centralIdentityAccountId
            ? options.canOperateCashier === true
            : false,
      },
      ...(cashSessionPreflight?.opened
        ? {
            cashSessionOpened: true,
            cashSessionOpeningAmount: cashSessionPreflight.openingAmount,
          }
        : {}),
      ...(cashSessionPreflight
        ? {
            cashSessionNotice: {
              openingAmount: cashSessionPreflight.openingAmount,
              openedAutomatically: cashSessionPreflight.opened,
              openedAt: cashSessionPreflight.openedAt,
              cashierDisplayName: cashSessionPreflight.cashierDisplayName,
              branchLogoUrl: cashSessionPreflight.branchLogoUrl,
              branchName: cashSessionPreflight.branchName,
              companyName: cashSessionPreflight.companyName,
            },
          }
        : {}),
    };
  }

  private isDailyRequiredCashError(error: unknown) {
    const candidate = error as {
      message?: unknown;
      response?: { code?: unknown; message?: unknown } | unknown;
    } | null;
    const response = candidate?.response;
    const responseMessage =
      response && typeof response === "object"
        ? (response as { message?: unknown }).message
        : response;
    const messages = [candidate?.message, responseMessage]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().toUpperCase());
    const code =
      response && typeof response === "object"
        ? String((response as { code?: unknown }).code || "")
            .trim()
            .toUpperCase()
        : "";

    return (
      code === "CASH_SESSION_CLOSE_REQUIRED" ||
      code === "CASH_SESSION_ALREADY_CLOSED" ||
      messages.some((message) =>
        message.includes("CAIXA DO DIA ANTERIOR PRECISA SER FECHADO") ||
        message.includes("CAIXA DESTE OPERADOR JÁ FOI FECHADO"),
      )
    );
  }

  private async ensureCashSessionBeforeLogin(
    account: AccountLookup,
    branchCode: number,
    options: {
      centralIdentityAccountId?: string;
      canOperateCashier?: boolean;
    },
    branchAccessCodes: number[],
    branchContext: {
      branchLogoUrl?: string | null;
      branchName?: string | null;
      companyName?: string | null;
    } = {},
  ): Promise<LoginCashSessionPreflight | null> {
    // O pré-check pertence ao acesso da Escola. Uma identidade da Central só
    // pode executá-lo quando a própria Central autorizou operação de caixa.
    if (
      options.centralIdentityAccountId &&
      options.canOperateCashier !== true
    ) {
      return null;
    }

    const normalizedPermissions = new Set(
      (account.permissions || []).map((permission) =>
        String(permission).trim().toUpperCase(),
      ),
    );
    const canOperateCashier =
      account.modelType === "user" &&
      (account.role.trim().toUpperCase() === "ADMIN" ||
        normalizedPermissions.has("VIEW_CASHIER"));

    if (!canOperateCashier) return null;

    const currentUser: ICurrentUser = {
      userId: account.id,
      tenantId: account.tenantId,
      branchCode,
      role: account.role,
      permissions: account.permissions,
      name: account.name,
      email: account.email,
      cashierOnly: Boolean(account.cashierOnly),
      canOperateCashier: options.centralIdentityAccountId
        ? options.canOperateCashier === true
        : true,
      modelType: account.modelType,
      branchAccessCodes,
      canAccessAllBranches: this.canAccountAccessAllBranches(account),
      identityProvider: options.centralIdentityAccountId
        ? "MSINFOR_CENTRAL"
        : "LOCAL",
    };

    try {
      const openedSession = await this.financeiroService.ensureLoginCashSession(
        currentUser,
        {
          requestedBy: account.id,
          sourceSystem: "ESCOLA",
          sourceTenantId: account.tenantId,
          cashierUserId: account.id,
          cashierDisplayName: String(
            account.name || account.email || account.id,
          )
            .trim()
            .toUpperCase(),
          openingAmount: 0,
        },
      );
      if (String(openedSession?.status || "").trim().toUpperCase() !== "OPEN") {
        return null;
      }
      const openedAt = String(openedSession?.openedAt || "").trim();
      if (!openedAt || Number.isNaN(Date.parse(openedAt))) {
        throw new ServiceUnavailableException(
          "O FINANCEIRO NÃO RETORNOU A DATA E HORA DE ABERTURA DO CAIXA.",
        );
      }
      return {
        opened: openedSession?.openedAutomatically === true,
        openingAmount: Number(openedSession?.openingAmount || 0),
        cashClosingMode: String(openedSession?.cashClosingMode || "MANUAL")
          .trim()
          .toUpperCase(),
        openedAt,
        cashierDisplayName:
          String(
            openedSession?.cashierDisplayName
              || account.name
              || account.email
              || account.id,
          ).trim(),
        branchLogoUrl: branchContext.branchLogoUrl || null,
        branchName: branchContext.branchName || null,
        companyName: branchContext.companyName || null,
      };
    } catch (error) {
      if (this.isDailyRequiredCashError(error)) {
        throw new ForbiddenException(LOGIN_CASHIER_BLOCK_MESSAGE);
      }
      throw error;
    }
  }

  private getMaximumActiveSessions() {
    const configured = Number(
      process.env.AUTH_SESSION_MAX_PER_ACCOUNT || 10,
    );
    if (
      !Number.isSafeInteger(configured) ||
      configured < 1 ||
      configured > 50
    ) {
      throw new ServiceUnavailableException(
        "Limite de sessões autenticadas inválido.",
      );
    }
    return configured;
  }

  private async issueAuthSessionToken(payload: {
    userId: string;
    tenantId: string;
    branchCode: number;
    modelType: AccountModelType;
    identityProvider: string;
    [key: string]: unknown;
  }) {
    const jti = crypto.randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + AUTH_SESSION_LIFETIME_MS);
    const maximumSessions = this.getMaximumActiveSessions();
    const prismaClient = this.getCrossTenantPrisma() as any;
    const persist = async (database: any) => {
      await database.authSession.create({
        data: {
          jti,
          tenantId: payload.tenantId,
          userId: payload.userId,
          modelType: payload.modelType,
          branchCode: payload.branchCode,
          identityProvider: payload.identityProvider,
          expiresAt,
        },
      });
      const overflow = await database.authSession.findMany({
        where: {
          tenantId: payload.tenantId,
          userId: payload.userId,
          modelType: payload.modelType,
          canceledAt: null,
          expiresAt: { gt: now },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: maximumSessions,
        select: { id: true },
      });
      if (overflow.length) {
        await database.authSession.updateMany({
          where: { id: { in: overflow.map((session: any) => session.id) } },
          data: {
            canceledAt: now,
            canceledBy: "SESSION_LIMIT",
          },
        });
      }
    };
    if (typeof prismaClient.$transaction === "function") {
      await prismaClient.$transaction(async (transaction: any) =>
        persist(transaction),
      );
    } else {
      await persist(prismaClient);
    }
    return this.jwtService.sign({ ...payload, jti });
  }

  async logout(currentUser: ICurrentUser) {
    if (!currentUser.sessionJti) {
      throw new UnauthorizedException("Sessão revogável inválida.");
    }
    const prismaClient = this.getCrossTenantPrisma();
    await prismaClient.authSession.updateMany({
      where: {
        jti: currentUser.sessionJti,
        tenantId: currentUser.tenantId,
        userId: currentUser.userId,
        canceledAt: null,
      },
      data: {
        canceledAt: new Date(),
        canceledBy: currentUser.userId,
      },
    });
    return { status: "SUCCESS" };
  }

  private assertCentralRouteBelongsToThisDatabase(
    resolution: CentralIdentityResolution,
  ) {
    const configuredAlias = String(
      process.env.MSINFOR_DATABASE_ALIAS || "",
    )
      .trim()
      .toUpperCase();
    if (
      !configuredAlias ||
      configuredAlias !== resolution.databaseAlias.toUpperCase()
    ) {
      throw new ServiceUnavailableException(
        "A empresa selecionada não está disponível neste banco de dados.",
      );
    }
  }

  private async ensureMasterProjection(
    tenantId: string,
    roleCode: string,
  ) {
    if (roleCode.trim().toUpperCase() !== "ADMIN") {
      throw new ForbiddenException(
        "O usuário Master não possui o perfil administrativo exigido.",
      );
    }
    const prismaClient = this.getCrossTenantPrisma();
    const existing = await prismaClient.user.findFirst({
      where: {
        tenantId,
        OR: [
          { accessUsername: { in: this.normalizeEmailVariants("MSINFOR") } },
          {
            person: {
              accessUsername: { in: this.normalizeEmailVariants("MSINFOR") },
            },
          },
        ],
        canceledAt: null,
      },
      select: { id: true, role: true },
    });
    if (existing && existing.role.trim().toUpperCase() !== "ADMIN") {
      throw new ForbiddenException(
        "A projeção local do usuário Master possui um perfil incompatível.",
      );
    }
    if (!existing) {
      const person = await prismaClient.person.create({
        data: {
          tenantId,
          branchCode: DEFAULT_BRANCH_CODE,
          name: "MSINFOR",
          accessUsername: "MSINFOR",
          createdBy: "CENTRAL_MASTER_PROJECTION",
          updatedBy: "CENTRAL_MASTER_PROJECTION",
        },
        select: { id: true },
      });
      await prismaClient.user.create({
        data: {
          tenantId,
          branchCode: DEFAULT_BRANCH_CODE,
          personId: person.id,
          name: "MSINFOR",
          accessUsername: "MSINFOR",
          password: null,
          role: "ADMIN",
          accessProfile: getDefaultAccessProfileForRole("ADMIN"),
          permissions: null,
          createdBy: "CENTRAL_MASTER_PROJECTION",
          updatedBy: "CENTRAL_MASTER_PROJECTION",
        },
      });
    }
  }

  private async loginWithCentralIdentity(loginDto: LoginDto) {
    if (!this.centralIdentity) {
      throw new ServiceUnavailableException(
        "A identidade do MSINFOR Central não está configurada.",
      );
    }
    let identity = await this.centralIdentity.authenticateAndResolve(
      loginDto.email,
      loginDto.password,
      loginDto.tenantId,
      loginDto.branchCode,
    );
    let discoveredRole: string | undefined;

    if ("memberships" in identity) {
      if (identity.status === "MULTIPLE_TENANTS") {
        return {
          status: "MULTIPLE_TENANTS",
          tenants: identity.memberships.map((membership) => ({
            id: membership.tenantId,
            name: membership.tenantDisplayName,
            logoUrl: membership.tenantLogoUrl || null,
            documentNumber: membership.tenantDocumentNumber,
            city: membership.tenantCity,
          })),
        };
      }
      const membership = identity.memberships[0];
      discoveredRole = membership.roleCode;
      identity = await this.centralIdentity.authenticateAndResolve(
        loginDto.email,
        loginDto.password,
        membership.tenantId,
        loginDto.branchCode,
      );
    }
    if ("memberships" in identity) {
      throw new ServiceUnavailableException(
        "A Central não resolveu a empresa selecionada.",
      );
    }
    if (
      discoveredRole &&
      discoveredRole.toUpperCase() !== identity.roleCode.toUpperCase()
    ) {
      throw new ForbiddenException(
        "O papel da identidade central mudou durante a autenticação.",
      );
    }

    this.assertCentralRouteBelongsToThisDatabase(identity);
    const crossTenantPrisma = this.getCrossTenantPrisma();
    const localTenant = await crossTenantPrisma.tenant.findFirst({
      where: {
        centralTenantId: identity.tenantId,
        canceledAt: null,
      },
      select: {
        id: true,
        centralTenantId: true,
      },
    });
    if (!localTenant?.centralTenantId) {
      throw new ServiceUnavailableException(
        "A empresa autenticada ainda não foi provisionada neste banco de dados.",
      );
    }

    const normalizedCentralRole = this.resolveCentralLocalRole(identity.roleCode);
    if (isMasterLoginIdentifier(loginDto.email.trim().toUpperCase())) {
      await this.ensureMasterProjection(localTenant.id, normalizedCentralRole);
    }
    const centralTenantConfiguration =
      await this.centralConfiguration.findConfiguration(localTenant.id);
    const centralCompany = centralTenantConfiguration.tenant.company;
    const centralTenantName =
      centralCompany.tradeName ||
      centralCompany.legalName ||
      centralTenantConfiguration.tenant.displayName;
    const localAccounts = (
      await (isMasterLoginIdentifier(loginDto.email.trim().toUpperCase())
        ? this.findAccountByEmail(loginDto.email)
        : this.findAccountByLogin(loginDto.email))
    )
      .filter(
        (account) =>
          account.tenantId === localTenant.id &&
          this.centralRoleMatchesAccount(identity.roleCode, account),
      )
      .map((account) => ({
        ...account,
        branchAccessCodes: identity.branchCodes,
        tenant: {
          ...account.tenant,
          name: centralTenantName,
          logoUrl: this.centralIdentity.resolvePublicLogoUrl(
            centralCompany.logoReference,
            "company",
          ),
          branches: [],
        },
      }));
    if (!localAccounts.length) {
      throw new ForbiddenException(
        "O vínculo central não corresponde a um acesso local ativo.",
      );
    }

    const localAccountEmail = localAccounts.find((account) => account.email)?.email;
    if (!localAccountEmail) {
      throw new ForbiddenException(
        "O acesso local não possui e-mail cadastrado para recuperação.",
      );
    }
    const existingCredential =
      await this.sharedProfilesService.findEmailCredential(localAccountEmail);
    if (
      existingCredential?.centralIdentityAccountId &&
      existingCredential.centralIdentityAccountId.toLowerCase() !==
        identity.account.id.toLowerCase()
    ) {
      throw new UnauthorizedException(
        "Não foi possível autenticar a conta.",
      );
    }
    await this.sharedProfilesService.bindCentralIdentity(
      localAccountEmail,
      identity.account.id,
      identity.account.id,
    );

    return this.completeAuthenticatedLogin(
      localAccounts,
      {
        ...loginDto,
        tenantId: localTenant.id,
      },
      {
        forcedLocalTenantId: localTenant.id,
        exposedTenantId: identity.tenantId,
        centralIdentityAccountId: identity.account.id,
        canOperateCashier: identity.account.canOperateCashier,
      },
    );
  }

  private async loginWithLocalIdentity(loginDto: LoginDto) {
    const accounts = await this.findAccountByLogin(loginDto.email);
    if (accounts.length === 0) {
      throw new UnauthorizedException(
        `USUÁRIO NÃO LOCALIZADO.|${loginDto.email}`,
      );
    }

    const authenticatedAccounts = (
      await Promise.all(
        accounts.map(async (account) => {
          if (!account.email) return null;
          const credential = await this.loadEmailCredential(account.email);
          if (!credential?.passwordHash) return null;
          const isPasswordValid = await bcrypt.compare(
            loginDto.password,
            credential.passwordHash,
          );
          return isPasswordValid ? { account, credential } : null;
        }),
      )
    ).filter(
      (entry): entry is { account: AccountLookup; credential: NonNullable<Awaited<ReturnType<AuthService["loadEmailCredential"]>>> } => Boolean(entry),
    );

    if (authenticatedAccounts.length === 0) {
      throw new UnauthorizedException(
        `SENHA INVÁLIDA PARA O USUÁRIO|${accounts[0].name.toUpperCase()}`,
      );
    }

    const accountWithUnverifiedEmail = authenticatedAccounts.find(
      (entry) => !entry.credential.emailVerified,
    );
    if (accountWithUnverifiedEmail?.account.email) {
      return this.triggerEmailVerification(
        accountWithUnverifiedEmail.account.email,
        accountWithUnverifiedEmail.account.name,
      );
    }

    return this.completeAuthenticatedLogin(
      authenticatedAccounts.map((entry) => entry.account),
      loginDto,
    );
  }

  async login(loginDto: LoginDto) {
    const isMasterLogin = isMasterLoginIdentifier(
      String(loginDto.email || "").trim().toUpperCase(),
    );
    return isMasterLogin || isCentralIdentityEnabled()
      ? this.loginWithCentralIdentity(loginDto)
      : this.loginWithLocalIdentity(loginDto);
  }

  private async confirmCentralCredential(
    userId: string,
    tenantId: string,
    modelType: AccountModelType,
    credential: string,
  ) {
    if (!this.centralIdentity) {
      throw new ServiceUnavailableException(
        "A identidade do MSINFOR Central não está configurada.",
      );
    }
    const currentAccount = await this.loadAccountById(
      modelType,
      userId,
      tenantId,
    );
    if (!currentAccount?.email) {
      throw new UnauthorizedException("Credencial inválida.");
    }
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, canceledAt: null },
      select: { centralTenantId: true },
    });
    if (!tenant?.centralTenantId) {
      throw new ServiceUnavailableException(
        "Empresa sem identidade central provisionada.",
      );
    }
    const localCredential =
      await this.sharedProfilesService.findEmailCredential(
        currentAccount.email,
      );
    if (!localCredential?.centralIdentityAccountId) {
      throw new UnauthorizedException("Credencial inválida.");
    }
    const confirmation = await this.centralIdentity.confirmOperationCredential(
      localCredential.centralIdentityAccountId,
      credential,
      tenant.centralTenantId,
    );
    if (
      confirmation.account.id.toLowerCase() !==
        localCredential.centralIdentityAccountId.toLowerCase()
    ) {
      throw new UnauthorizedException("Credencial inválida.");
    }
    return { status: "SUCCESS" as const };
  }

  async confirmPassword(
    userId: string | null,
    tenantId: string | null,
    modelType: AccountModelType | "master" | undefined,
    password: string,
  ) {
    if (!userId || !tenantId) {
      throw new UnauthorizedException("Usuário inválido.");
    }

    if (!password) {
      throw new UnauthorizedException("Informe a senha para continuar.");
    }

    if (modelType === "master") {
      throw new UnauthorizedException(
        "Sessão administrativa legada não é aceita.",
      );
    }

    const effectiveModel: AccountModelType = modelType || "user";
    if (isCentralIdentityEnabled()) {
      return this.confirmCentralCredential(
        userId,
        tenantId,
        effectiveModel,
        password,
      );
    }
    const currentAccount = await this.loadAccountById(
      effectiveModel,
      userId,
      tenantId,
    );
    if (!currentAccount?.email) {
      throw new UnauthorizedException("Senha inválida.");
    }

    const credential = await this.loadEmailCredential(currentAccount.email);
    if (!credential?.passwordHash) {
      throw new UnauthorizedException("Senha inválida.");
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      credential.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException("Senha inválida.");
    }

    return { status: "SUCCESS" };
  }

  async confirmSharedPassword(
    userId: string | null,
    tenantId: string | null,
    modelType: AccountModelType | "master" | undefined,
    password: string,
  ) {
    if (!userId || !tenantId) {
      throw new UnauthorizedException("Usuário inválido.");
    }

    const normalizedPassword = String(password || "");
    if (!normalizedPassword) {
      throw new UnauthorizedException("Informe a senha para continuar.");
    }

    if (modelType === "master") {
      throw new UnauthorizedException(
        "Sessão administrativa legada não é aceita.",
      );
    }

    const effectiveModel: AccountModelType = modelType || "user";
    if (isCentralIdentityEnabled()) {
      return this.confirmCentralCredential(
        userId,
        tenantId,
        effectiveModel,
        normalizedPassword,
      );
    }
    const currentAccount = await this.loadAccountById(
      effectiveModel,
      userId,
      tenantId,
    );
    if (!currentAccount?.email) {
      throw new BadRequestException(
        "Não foi possível localizar o e-mail do usuário.",
      );
    }

    const credential = await this.loadEmailCredential(currentAccount.email);
    if (!credential?.passwordHash) {
      throw new UnauthorizedException("Senha inválida.");
    }

    const validPassword = await bcrypt.compare(
      normalizedPassword,
      credential.passwordHash,
    );

    if (!validPassword) {
      throw new UnauthorizedException("Senha inválida.");
    }

    return { status: "SUCCESS" };
  }

  async confirmAdministratorPassword(
    currentUser: ICurrentUser,
    password: string,
  ) {
    const normalizedPassword = String(password || "");
    const tenantId = currentUser.tenantId;
    if (!tenantId) throw new UnauthorizedException("Empresa inválida.");
    if (!normalizedPassword) throw new UnauthorizedException("Informe a senha para continuar.");

    if (isCentralIdentityEnabled()) {
      if (
        !["ADMIN", "SOFTHOUSE_ADMIN"].includes(
          String(currentUser.role || "").trim().toUpperCase(),
        )
      ) {
        throw new ForbiddenException(
          "Somente o administrador autenticado pode confirmar esta operação.",
        );
      }
      return this.confirmCentralCredential(
        currentUser.userId,
        tenantId,
        (currentUser.modelType as AccountModelType | undefined) || "user",
        normalizedPassword,
      );
    }

    const administrators = await this.prisma.user.findMany({
      where: {
        tenantId,
        canceledAt: null,
        OR: [
          { role: "ADMIN" },
          { accessProfile: "ADMIN_TOTAL" },
          { accessProfile: "ADMINISTRADOR" },
        ],
      },
      select: { person: { select: { email: true } } },
    });

    for (const administrator of administrators) {
      const credential = await this.loadEmailCredential(
        administrator.person?.email,
      );
      if (credential?.passwordHash && await bcrypt.compare(normalizedPassword, credential.passwordHash)) {
        return { status: "SUCCESS" };
      }
    }

    throw new UnauthorizedException("Senha de administrador inválida.");
  }

  async confirmCashCancellationPassword(
    userId: string | null,
    tenantId: string | null,
    modelType: AccountModelType | "master" | undefined,
    password: string,
  ) {
    if (!userId || !tenantId) {
      throw new UnauthorizedException("Usuário inválido.");
    }

    const normalizedPassword = String(password || "");
    if (!normalizedPassword) {
      throw new UnauthorizedException("Informe a senha para continuar.");
    }

    if (modelType === "master") {
      throw new UnauthorizedException(
        "Sessão administrativa legada não é aceita.",
      );
    }

    if (isCentralIdentityEnabled()) {
      await this.confirmCentralCredential(
        userId,
        tenantId,
        (modelType as AccountModelType | undefined) || "user",
        normalizedPassword,
      );
      return {
        status: "SUCCESS",
        authorizedBy: "OPERADOR",
        operatorUserId: userId,
      };
    }

    try {
      await this.confirmSharedPassword(
        userId,
        tenantId,
        modelType,
        normalizedPassword,
      );
      return {
        status: "SUCCESS",
        authorizedBy: "OPERADOR",
        operatorUserId: userId,
      };
    } catch {
      // Se não for a senha do operador logado, tenta validar como supervisor da mesma escola.
    }

    const supervisorUsers = await this.prisma.user.findMany({
      where: {
        tenantId,
        canceledAt: null,
      },
      select: {
        id: true,
        name: true,
        role: true,
        permissions: true,
        person: { select: { email: true } },
      },
    });

    for (const supervisor of supervisorUsers) {
      const permissions = deserializePermissions(
        supervisor.permissions,
        supervisor.role,
      );
      const isSupervisor =
        String(supervisor.role || "").trim().toUpperCase() === "ADMIN" ||
        permissions.includes("MANAGE_FINANCIAL") ||
        permissions.includes("CLOSE_CASHIER");

      if (!isSupervisor || !supervisor.person?.email) {
        continue;
      }

      const credential = await this.loadEmailCredential(
        supervisor.person.email,
      );
      if (!credential?.passwordHash) {
        continue;
      }

      const isPasswordValid = await bcrypt.compare(
        normalizedPassword,
        credential.passwordHash,
      );

      if (isPasswordValid) {
        return {
          status: "SUCCESS",
          authorizedBy: "SUPERVISOR",
          supervisorUserId: supervisor.id,
          supervisorName: supervisor.name,
        };
      }
    }

    throw new UnauthorizedException("Senha inválida.");
  }

  async changeSharedPassword(
    userId: string | null,
    tenantId: string | null,
    modelType: AccountModelType | "master" | undefined,
    currentPassword: string,
    newPassword: string,
  ) {
    if (!userId || !tenantId) {
      throw new UnauthorizedException("Usuário inválido.");
    }
    const normalizedCurrentPassword = currentPassword.trim();
    const normalizedNewPassword = newPassword.trim();

    if (!normalizedCurrentPassword || !normalizedNewPassword) {
      throw new UnauthorizedException("Informe a senha atual e a nova senha.");
    }
    if (modelType === "master") {
      throw new UnauthorizedException(
        "Sessão administrativa legada não é aceita.",
      );
    }

    if (isCentralIdentityEnabled()) {
      throw new BadRequestException(
        "A senha desta conta é administrada pelo MSINFOR Central.",
      );
    }

    const effectiveModel: AccountModelType = modelType || "user";
    const currentAccount = await this.loadAccountById(
      effectiveModel,
      userId,
      tenantId,
    );
    if (!currentAccount?.email) {
      throw new BadRequestException(
        "Não foi possível localizar o e-mail do usuário.",
      );
    }
    await this.confirmSharedPassword(
      userId,
      tenantId,
      modelType,
      normalizedCurrentPassword,
    );
    assertStrongPassword(normalizedNewPassword);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(normalizedNewPassword, salt);

    await this.sharedProfilesService.updateEmailCredentialPassword(
      currentAccount.email,
      hashedPassword,
      userId,
    );

    return { status: "SUCCESS" };
  }

  async register(registerDto: RegisterDto, currentUser: ICurrentUser) {
    const tenantId_forced = currentUser.tenantId;
    const normalizedEmail = registerDto.email.trim().toUpperCase();
    const normalizedRole = String(registerDto.role || "SECRETARIA")
      .trim()
      .toUpperCase();
    const accessProfile = normalizeAccessProfileCode(
      registerDto.accessProfile,
      normalizedRole,
    );
    const complementaryProfiles =
      normalizedRole === "ADMIN"
        ? []
        : normalizeComplementaryAccessProfiles(
            registerDto.complementaryProfiles,
          );
    const effectivePermissions =
      normalizedRole === "ADMIN"
        ? []
        : registerDto.permissions && registerDto.permissions.length > 0
          ? registerDto.permissions
          : resolveAccountPermissions({
              role: normalizedRole,
              accessProfile,
              complementaryProfiles,
              permissions: null,
            });

    const normalizedPassword = String(registerDto.password || "").trim();
    if (normalizedPassword && isCentralIdentityEnabled()) {
      throw new BadRequestException(
        "Cadastre a credencial da conta no MSINFOR Central.",
      );
    }
    let hashedPassword: string | null = null;
    if (normalizedPassword) {
      assertStrongPassword(normalizedPassword);
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(normalizedPassword, salt);
    }

    const newUser = await this.prisma.$transaction(async (tx) => {
      const person = await tx.person.create({
        data: {
          tenantId: tenantId_forced,
          branchCode: currentUser.branchCode || DEFAULT_BRANCH_CODE,
          name: registerDto.name.trim().toUpperCase(),
          email: normalizedEmail,
          createdBy: currentUser.userId,
          updatedBy: currentUser.userId,
        },
        select: { id: true },
      });

      return tx.user.create({
        data: {
          name: registerDto.name.trim().toUpperCase(),
          personId: person.id,
          password: null,
          tenantId: tenantId_forced,
          role: normalizedRole || "SECRETARIA",
          complementaryProfiles:
            normalizedRole === "ADMIN"
              ? null
              : serializeComplementaryAccessProfiles(complementaryProfiles),
          accessProfile:
            accessProfile || getDefaultAccessProfileForRole(normalizedRole),
          permissions:
            normalizedRole === "ADMIN"
              ? null
              : serializePermissions(effectivePermissions),
          createdBy: currentUser.userId,
          updatedBy: currentUser.userId,
        },
      });
    });

    if (hashedPassword) {
      await this.sharedProfilesService.updateEmailCredentialPassword(
        normalizedEmail,
        hashedPassword,
        currentUser.userId,
      );
    } else {
      await this.sharedProfilesService.ensureEmailCredential(normalizedEmail, {
        userId: currentUser.userId,
      });
    }

    return {
      ...newUser,
      permissions: resolveAccountPermissions({
        role: newUser.role,
        accessProfile: newUser.accessProfile,
        complementaryProfiles: newUser.complementaryProfiles,
        permissions: newUser.permissions,
      }),
    };
  }

  async forgotPassword(forgotDto: ForgotPasswordDto) {
    if (isCentralIdentityEnabled()) {
      return {
        status: "CENTRAL_IDENTITY_REQUIRED",
        message:
          "A recuperação de senha desta conta é feita no MSINFOR Central.",
      };
    }
    const accounts = await this.findAccountByEmail(forgotDto.email);

    const scopedAccounts = forgotDto.tenantId
      ? accounts.filter((account) => account.tenantId === forgotDto.tenantId)
      : accounts;

    if (scopedAccounts.length === 0) {
      throw new NotFoundException("E-mail não encontrado na base de dados.");
    }

    const userToRecover = this.pickPreferredAccount(scopedAccounts);
    if (!userToRecover) {
      return {
        message: "Se o e-mail existir, você receberá um link de recuperação.",
      };
    }
    if (!userToRecover.email) {
      throw new ServiceUnavailableException(
        "Cadastro sem e-mail válido para recuperação de senha.",
      );
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const expiresAt = new Date(Date.now() + 3600000);
    await this.sharedProfilesService.storeEmailCredentialResetToken(
      userToRecover.email,
      hash,
      expiresAt,
    );

    const resetLink = this.buildFrontendLink("/reset-password", resetToken);

    const successResponse: any = {
      status: "SUCCESS",
      message: "Se o e-mail existir, você receberá um link de recuperação.",
    };
    const isNonProduction = process.env.NODE_ENV !== "production";
    if (isNonProduction) {
      successResponse.devResetLink = resetLink;
    }

    try {
      const mailResult = await this.sendEmailUsingGlobalSettings({
        to: userToRecover.email,
        subject: "Recuperação de Senha - MSINFOR",
        text: `Você solicitou a recuperação de senha. Acesse o link para redefinir: ${resetLink}\n\nSe não foi você, ignore.`,
        html: `<h3>Recuperação de senha</h3><p>Para criar uma nova senha, clique no botão abaixo:</p><a href="${resetLink}" style="padding:10px 20px; background:#2563eb; color:#fff; text-decoration:none; border-radius:6px;">Redefinir senha</a><br><br><p>Se você não solicitou isso, ignore este e-mail.</p>`,
      });

      if (mailResult.warning) {
        successResponse.warning = mailResult.warning;
      }

      if (this.isMicrosoftConsumerDomain(userToRecover.email)) {
        successResponse.warning = "OUTLOOK_DELIVERY_DELAY_POSSIBLE";
      }

      return successResponse;
    } catch (err) {
      console.error(
        "[SMTP Error] Falha ao enviar o e-mail de recuperação:",
        err,
      );

      successResponse.warning = "GLOBAL_SMTP_SEND_FAILED";
      if (isNonProduction) {
        return successResponse;
      }

      throw new ServiceUnavailableException(
        "Não foi possível enviar o e-mail de recuperação. Tente novamente.",
      );
    }
  }

  async requestPasswordResetForConfirmedEmail(
    email: string,
    currentUser: ICurrentUser,
  ) {
    if (isCentralIdentityEnabled()) {
      return {
        status: "CENTRAL_IDENTITY_REQUIRED",
        message:
          "A redefinição de senha desta conta é feita no MSINFOR Central.",
      };
    }

    const normalizedEmail = String(email || "").trim().toUpperCase();
    const accounts = await this.findAccountByEmail(normalizedEmail);
    if (!accounts.some((account) => account.tenantId === currentUser.tenantId)) {
      throw new ForbiddenException(
        "O e-mail informado não pertence a um acesso desta escola.",
      );
    }

    const credential =
      await this.sharedProfilesService.findEmailCredential(normalizedEmail);
    if (!credential?.emailVerified) {
      throw new BadRequestException(
        "A redefinição só pode ser solicitada para e-mail confirmado.",
      );
    }

    return this.forgotPassword({
      email: normalizedEmail,
      tenantId: currentUser.tenantId,
    });
  }

  async resetPassword(resetDto: ResetPasswordDto) {
    if (isCentralIdentityEnabled()) {
      throw new BadRequestException(
        "A redefinição de senha é feita no MSINFOR Central.",
      );
    }
    const hash = crypto
      .createHash("sha256")
      .update(resetDto.token)
      .digest("hex");

    const credential =
      await this.sharedProfilesService.findEmailCredentialByResetToken(hash);

    if (!credential?.email) {
      throw new UnauthorizedException("Token inválido ou expirado.");
    }

    assertStrongPassword(resetDto.newPassword);

    const salt = await bcrypt.genSalt(10);
    const newHashedPassword = await bcrypt.hash(resetDto.newPassword, salt);
    await this.sharedProfilesService.updateEmailCredentialPassword(
      credential.email,
      newHashedPassword,
    );
    await this.sharedProfilesService.clearEmailCredentialResetToken(
      credential.id,
    );

    return { message: "Senha redefinida com sucesso!" };
  }

  async verifyEmail(token: string) {
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const credential =
      await this.sharedProfilesService.findEmailCredentialByVerificationToken(
        hash,
      );

    if (!credential) {
      throw new UnauthorizedException("Token inválido ou expirado.");
    }

    await this.sharedProfilesService.markEmailCredentialVerified(credential.id);

    return {
      status: "SUCCESS",
      message: "E-mail confirmado com sucesso.",
    };
  }
}
