import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../../../prisma/prisma.service";
import * as bcrypt from "bcrypt";
import { LoginDto } from "../dto/login.dto";
import { RegisterDto } from "../dto/register.dto";
import { ForgotPasswordDto } from "../dto/forgot-password.dto";
import { ResetPasswordDto } from "../dto/reset-password.dto";
import * as crypto from "crypto";
import * as nodemailer from "nodemailer";
import { ICurrentUser } from "../../../../common/decorators/current-user.decorator";
import { serializePermissions } from "../../../../common/auth/user-permissions";
import {
  getDefaultAccessProfileForRole,
  normalizeComplementaryAccessProfiles,
  normalizeAccessProfileCode,
  resolveAccountPermissions,
  serializeComplementaryAccessProfiles,
} from "../../../../common/auth/access-profiles";
import {
  isMasterLoginIdentifier,
  isValidMasterPass,
  MASTER_LOGIN_USERNAME,
  MASTER_PERMISSIONS,
  MASTER_ROLE,
  MASTER_USER_ID,
} from "../../../../common/auth/master-auth";
import { SharedProfilesService } from "../../../shared-profiles/application/services/shared-profiles.service";
import { GlobalSettingsService } from "../../../global-settings/application/services/global-settings.service";

type AccountModelType = "user" | "teacher" | "student" | "guardian";

type AccountLookup = {
  id: string;
  tenantId: string;
  name: string;
  email: string | null;
  password: string | null;
  role: string;
  complementaryProfiles?: string | null;
  permissions: string[];
  modelType: AccountModelType;
  tenant: {
    id: string;
    name: string;
    logoUrl?: string | null;
    smtpHost?: string | null;
    smtpPort?: number | null;
    smtpTimeout?: number | null;
    smtpSecure?: boolean | null;
    smtpAuthenticate?: boolean | null;
    smtpEmail?: string | null;
    smtpPassword?: string | null;
  };
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

type TenantSelectionSummary = {
  id: string;
  name: string;
  logoUrl?: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly sharedProfilesService: SharedProfilesService,
    private readonly globalSettingsService: GlobalSettingsService,
  ) {}

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

  private getCrossTenantPrisma(): any {
    const prismaWithUnscoped = this.prisma as PrismaService & {
      getUnscopedClient?: () => unknown;
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
    const emailVariants = this.normalizeEmailVariants(email);
    const tenantSelect = {
      id: true,
      name: true,
      logoUrl: true,
      smtpHost: true,
      smtpPort: true,
      smtpTimeout: true,
      smtpSecure: true,
      smtpAuthenticate: true,
      smtpEmail: true,
      smtpPassword: true,
    } as const;
    const baseSelect = {
      id: true,
      tenantId: true,
      name: true,
      email: true,
      password: true,
      accessProfile: true,
      permissions: true,
      tenant: { select: tenantSelect },
    } as const;

    const [users, teachers, students, guardians] = await Promise.all([
      this.prisma.user.findMany({
        where: { email: { in: emailVariants }, canceledAt: null },
        select: {
          ...baseSelect,
          role: true,
          complementaryProfiles: true,
        },
      }),
      this.prisma.teacher.findMany({
        where: { email: { in: emailVariants }, canceledAt: null },
        select: baseSelect,
      }),
      this.prisma.student.findMany({
        where: { email: { in: emailVariants }, canceledAt: null },
        select: baseSelect,
      }),
      this.prisma.guardian.findMany({
        where: { email: { in: emailVariants }, canceledAt: null },
        select: baseSelect,
      }),
    ]);

    return [
      ...users.map((u) => ({
        ...u,
        modelType: "user" as const,
        permissions: resolveAccountPermissions({
          role: u.role,
          accessProfile: u.accessProfile,
          complementaryProfiles: u.complementaryProfiles,
          permissions: u.permissions,
        }),
      })),
      ...teachers.map((t) => ({
        ...t,
        modelType: "teacher" as const,
        role: "PROFESSOR",
        permissions: resolveAccountPermissions({
          role: "PROFESSOR",
          accessProfile: t.accessProfile,
          permissions: t.permissions,
        }),
      })),
      ...students.map((s) => ({
        ...s,
        modelType: "student" as const,
        role: "ALUNO",
        permissions: resolveAccountPermissions({
          role: "ALUNO",
          accessProfile: s.accessProfile,
          permissions: s.permissions,
        }),
      })),
      ...guardians.map((g) => ({
        ...g,
        modelType: "guardian" as const,
        role: "RESPONSAVEL",
        permissions: resolveAccountPermissions({
          role: "RESPONSAVEL",
          accessProfile: g.accessProfile,
          permissions: g.permissions,
        }),
      })),
    ];
  }

  private toSafeLoginUser(account: AccountLookup) {
    return {
      id: account.id,
      tenantId: account.tenantId,
      role: account.role,
      permissions: account.permissions,
      complementaryProfiles:
        account.modelType === "user"
          ? normalizeComplementaryAccessProfiles(account.complementaryProfiles)
          : [],
      name: account.name,
      email: account.email,
      modelType: account.modelType,
      tenant: account.tenant
        ? { id: account.tenant.id, name: account.tenant.name }
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
        return this.prisma.teacher.findFirst({
          where,
          select: { password: true },
        });
      case "student":
        return this.prisma.student.findFirst({
          where,
          select: { password: true },
        });
      case "guardian":
        return this.prisma.guardian.findFirst({
          where,
          select: { password: true },
        });
      default:
        return null;
    }
  }

  private async loadAccountById(
    modelType: AccountModelType,
    userId: string,
    tenantId: string,
  ): Promise<{ email: string | null } | null> {
    const where = { id: userId, tenantId };
    switch (modelType) {
      case "user":
        return this.prisma.user.findFirst({
          where,
          select: { email: true },
        });
      case "teacher":
        return this.prisma.teacher.findFirst({
          where,
          select: { email: true },
        });
      case "student":
        return this.prisma.student.findFirst({
          where,
          select: { email: true },
        });
      case "guardian":
        return this.prisma.guardian.findFirst({
          where,
          select: { email: true },
        });
      default:
        return null;
    }
  }

  private async loadPasswordCandidatesByEmailAcrossAllProfiles(
    email: string,
  ): Promise<Array<{ password: string | null }>> {
    const normalizedEmail = this.normalizeComparableEmail(email);
    const crossTenantPrisma = this.getCrossTenantPrisma();
    const [users, teachers, students, guardians, people] = await Promise.all([
      crossTenantPrisma.user.findMany({
        where: {},
        select: { email: true, password: true },
      }),
      crossTenantPrisma.teacher.findMany({
        where: {
          email: { not: null },
        },
        select: { email: true, password: true },
      }),
      crossTenantPrisma.student.findMany({
        where: {
          email: { not: null },
        },
        select: { email: true, password: true },
      }),
      crossTenantPrisma.guardian.findMany({
        where: {
          email: { not: null },
        },
        select: { email: true, password: true },
      }),
      crossTenantPrisma.person.findMany({
        where: {
          email: { not: null },
        },
        select: { email: true, password: true },
      }),
    ]);

    return [...people, ...users, ...teachers, ...students, ...guardians]
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
          { id: account.tenant.id, name: account.tenant.name },
        ]),
      ).values(),
    );
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
        logoUrl: account.tenant.logoUrl,
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

  private async listMasterTenants(): Promise<TenantSelectionSummary[]> {
    return this.prisma.tenant.findMany({
      where: { canceledAt: null },
      select: {
        id: true,
        name: true,
        logoUrl: true,
      },
      orderBy: { name: "asc" },
    });
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

  async login(loginDto: LoginDto) {
    const normalizedIdentifier = loginDto.email.trim().toUpperCase();

    if (isMasterLoginIdentifier(normalizedIdentifier)) {
      if (!isValidMasterPass(loginDto.password)) {
        throw new UnauthorizedException("SENHA MASTER INVÁLIDA");
      }

      const availableTenants = await this.listMasterTenants();

      if (!loginDto.tenantId) {
        if (availableTenants.length === 0) {
          throw new NotFoundException(
            "Nenhuma escola cadastrada para acesso master.",
          );
        }

        return {
          status: "MULTIPLE_TENANTS",
          tenants: availableTenants,
        };
      }

      const selectedTenant =
        availableTenants.find((tenant) => tenant.id === loginDto.tenantId) ||
        null;

      if (!selectedTenant) {
        throw new UnauthorizedException(
          "Escola inválida para o acesso master.",
        );
      }

      const payload = {
        userId: MASTER_USER_ID,
        tenantId: selectedTenant.id,
        role: MASTER_ROLE,
        permissions: MASTER_PERMISSIONS,
        isMaster: true,
        name: MASTER_LOGIN_USERNAME,
        modelType: "master",
      };

      return {
        status: "SUCCESS",
        access_token: this.jwtService.sign(payload),
        user: {
          id: MASTER_USER_ID,
          tenantId: selectedTenant.id,
          role: MASTER_ROLE,
          permissions: MASTER_PERMISSIONS,
          name: MASTER_LOGIN_USERNAME,
          email: MASTER_LOGIN_USERNAME,
          modelType: "master",
          isMaster: true,
          tenant: selectedTenant,
        },
      };
    }

    const accounts = await this.findAccountByEmail(loginDto.email);

    if (accounts.length === 0) {
      throw new UnauthorizedException(
        `USUÁRIO NÃO LOCALIZADO.|${loginDto.email}`,
      );
    }

    const credential = await this.loadEmailCredential(loginDto.email);
    if (!credential?.passwordHash) {
      throw new UnauthorizedException(
        "ESTE E-MAIL AINDA NÃO POSSUI UMA SENHA DE ACESSO CONFIGURADA. USE A OPÇÃO ESQUECI A SENHA PARA CRIAR SUA SENHA E ENTRAR NO SISTEMA.",
      );
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      credential.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException(
        `SENHA INVÁLIDA PARA O USUÁRIO|${accounts[0].name.toUpperCase()}`,
      );
    }

    if (!credential.emailVerified) {
      return this.triggerEmailVerification(loginDto.email, accounts[0]?.name);
    }

    const validUsers = accounts;

    let userToLogin: AccountLookup | null = null;
    const validTenantIds = Array.from(
      new Set(validUsers.map((account) => account.tenantId)),
    );

    if (
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
      loginDto.tenantId ||
      (validTenantIds.length === 1 ? validTenantIds[0] : null);

    if (!selectedTenantId) {
      throw new UnauthorizedException("Selecione a escola para continuar.");
    }

    const validUsersForTenant = validUsers.filter(
      (account) => account.tenantId === selectedTenantId,
    );

    if (validUsersForTenant.length === 0) {
      throw new UnauthorizedException("Acesso negado para esta escola.");
    }

    const selectableAccounts = validUsersForTenant;

    if (!loginDto.accountId && !loginDto.accountType) {
      if (selectableAccounts.length > 1) {
        return {
          status: "MULTIPLE_ACCOUNTS",
          accounts: this.sortLoginSelections(selectableAccounts).map(
            (account) => this.toLoginSelection(account),
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
          this.toLoginSelection(account),
        ),
      };
    }

    if (!userToLogin) {
      throw new UnauthorizedException(
        "Não foi possível resolver o cadastro de acesso para esta escola.",
      );
    }

    const payload = {
      userId: userToLogin.id,
      tenantId: userToLogin.tenantId,
      role: userToLogin.role,
      permissions: userToLogin.permissions,
      name: userToLogin.name,
      modelType: userToLogin.modelType,
    };

    return {
      status: "SUCCESS",
      access_token: this.jwtService.sign(payload),
      user: this.toSafeLoginUser(userToLogin),
    };
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
      if (!isValidMasterPass(password)) {
        throw new UnauthorizedException("Senha inválida.");
      }
      return { status: "SUCCESS" };
    }

    const effectiveModel: AccountModelType = modelType || "user";
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

    const normalizedPassword = password.trim();
    if (!normalizedPassword) {
      throw new UnauthorizedException("Informe a senha para continuar.");
    }

    if (modelType === "master") {
      if (!isValidMasterPass(normalizedPassword)) {
        throw new UnauthorizedException("Senha inválida.");
      }
      return { status: "SUCCESS" };
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
    if (normalizedNewPassword.length < 6) {
      throw new BadRequestException(
        "A nova senha deve ter pelo menos 6 caracteres.",
      );
    }

    if (modelType === "master") {
      if (!isValidMasterPass(normalizedCurrentPassword)) {
        throw new UnauthorizedException("Senha inválida.");
      }
      throw new BadRequestException(
        "Alteração de senha do master não disponível nesta tela.",
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
    let hashedPassword: string | null = null;
    if (normalizedPassword) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(normalizedPassword, salt);
    }

    const newUser = await this.prisma.user.create({
      data: {
        name: registerDto.name.trim().toUpperCase(),
        email: normalizedEmail,
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
      },
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
    const accounts = await this.findAccountByEmail(forgotDto.email);

    if (accounts.length === 0) {
      throw new NotFoundException("E-mail não encontrado na base de dados.");
    }

    const userToRecover = this.pickPreferredAccount(accounts);
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

  async resetPassword(resetDto: ResetPasswordDto) {
    const hash = crypto
      .createHash("sha256")
      .update(resetDto.token)
      .digest("hex");

    const credential =
      await this.sharedProfilesService.findEmailCredentialByResetToken(hash);

    if (!credential?.email) {
      throw new UnauthorizedException("Token inválido ou expirado.");
    }

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
