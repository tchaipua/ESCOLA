import {
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
  createdAt: Date;
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
  ) {}

  private normalizeEmailVariants(email: string): string[] {
    const clean = email.trim();
    return Array.from(
      new Set([clean, clean.toUpperCase(), clean.toLowerCase()]),
    );
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

    const [users, teachers, students, guardians] = await Promise.all([
      this.prisma.user.findMany({
        where: { email: { in: emailVariants }, canceledAt: null },
        include: { tenant: true },
      }),
      this.prisma.teacher.findMany({
        where: { email: { in: emailVariants }, canceledAt: null },
        include: { tenant: true },
      }),
      this.prisma.student.findMany({
        where: { email: { in: emailVariants }, canceledAt: null },
        include: { tenant: true },
      }),
      this.prisma.guardian.findMany({
        where: { email: { in: emailVariants }, canceledAt: null },
        include: { tenant: true },
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
      return (
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
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

    const validUsers: AccountLookup[] = [];
    for (const account of accounts) {
      if (!account.password) continue;
      const isPasswordValid = await bcrypt.compare(
        loginDto.password,
        account.password,
      );
      if (isPasswordValid) validUsers.push(account);
    }

    if (validUsers.length === 0) {
      throw new UnauthorizedException(
        `SENHA INVÁLIDA PARA O USUÁRIO|${accounts[0].name.toUpperCase()}`,
      );
    }

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
    const account = await this.loadAccountPassword(
      effectiveModel,
      userId,
      tenantId,
    );
    if (!account?.password) {
      throw new UnauthorizedException("Senha inválida.");
    }

    const isPasswordValid = await bcrypt.compare(password, account.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Senha inválida.");
    }

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

    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        tenantId: tenantId_forced,
      },
    });

    if (existingUser) {
      throw new ConflictException(
        "Houve um conflito: Email já em uso nesta escola.",
      );
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(registerDto.password, salt);

    const newUser = await this.prisma.user.create({
      data: {
        name: registerDto.name.trim().toUpperCase(),
        email: normalizedEmail,
        password: hashedPassword,
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

    await this.sharedProfilesService.syncSharedPasswordByEmail(
      tenantId_forced,
      normalizedEmail,
      hashedPassword,
      { kind: "USER", id: newUser.id },
      currentUser.userId,
    );

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

    let accountsToRecover = accounts;
    const distinctTenants = this.getUniqueTenants(accounts);

    if (forgotDto.tenantId) {
      accountsToRecover = accounts.filter(
        (account) => account.tenantId === forgotDto.tenantId,
      );
      if (accountsToRecover.length === 0) {
        return {
          message: "Se o e-mail existir, você receberá um link de recuperação.",
        };
      }
    } else if (distinctTenants.length > 1) {
      return {
        status: "MULTIPLE_TENANTS",
        tenants: distinctTenants,
      };
    }

    const userToRecover = this.pickPreferredAccount(accountsToRecover);
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
    const updateData = {
      resetPasswordToken: hash,
      resetPasswordExpires: expiresAt,
    };

    await Promise.all(
      accountsToRecover.map((account) => {
        switch (account.modelType) {
          case "user":
            return this.prisma.user.update({
              where: { id: account.id },
              data: updateData,
            });
          case "teacher":
            return this.prisma.teacher.update({
              where: { id: account.id },
              data: updateData,
            });
          case "student":
            return this.prisma.student.update({
              where: { id: account.id },
              data: updateData,
            });
          case "guardian":
            return this.prisma.guardian.update({
              where: { id: account.id },
              data: updateData,
            });
        }
      }),
    );

    const frontendBaseUrl = (
      process.env.FRONTEND_URL || "http://localhost:3000"
    ).replace(/\/$/, "");
    const resetLink = `${frontendBaseUrl}/reset-password?token=${resetToken}`;

    const successResponse: any = {
      status: "SUCCESS",
      message: "Se o e-mail existir, você receberá um link de recuperação.",
    };
    const isNonProduction = process.env.NODE_ENV !== "production";
    if (isNonProduction) {
      successResponse.devResetLink = resetLink;
    }

    const tenant = userToRecover.tenant;
    const smtpHost = tenant.smtpHost?.trim() || "";
    const smtpPort =
      typeof tenant.smtpPort === "number"
        ? tenant.smtpPort
        : tenant.smtpSecure
          ? 465
          : 587;
    const smtpTimeout =
      typeof tenant.smtpTimeout === "number" ? tenant.smtpTimeout : 60;
    const smtpSecure = tenant.smtpSecure === true;
    const smtpAuthenticate = tenant.smtpAuthenticate !== false;
    const smtpEmail = tenant.smtpEmail?.trim();
    const smtpPassword = tenant.smtpPassword?.trim();

    if (!smtpHost) {
      console.warn(`[SMTP] Configuração ausente para ${tenant.name}.`);
      return successResponse;
    }

    if (smtpAuthenticate && (!smtpEmail || !smtpPassword)) {
      console.warn(`[SMTP] Credenciais ausentes para ${tenant.name}.`);

      if (isNonProduction) {
        successResponse.warning = "SMTP_CREDENTIALS_MISSING";
        return successResponse;
      }

      throw new ServiceUnavailableException(
        "Configuração de e-mail incompleta para esta escola.",
      );
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        connectionTimeout: smtpTimeout * 1000,
        auth: smtpAuthenticate
          ? {
              user: smtpEmail,
              pass: smtpPassword,
            }
          : undefined,
      });

      const fromAddress = smtpEmail || `no-reply@${smtpHost}`;

      await transporter.sendMail({
        from: `"${tenant.name}" <${fromAddress}>`,
        to: userToRecover.email,
        subject: "Recuperação de Senha - MSINFOR",
        text: `Você solicitou a recuperação de senha. Acesse o link para redefinir: ${resetLink}\n\nSe não foi você, ignore.`,
        html: `<h3>Recuperação de Senha (${tenant.name})</h3>
                       <p>Para criar uma nova senha, clique no botão abaixo:</p>
                       <a href="${resetLink}" style="padding:10px 20px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:5px;">Redefinir Senha</a>
                       <br><br><p>Se você não solicitou isso, ignore este e-mail.</p>`,
      });

      console.log(
        `[SMTP] E-mail de Recuperação enviado com sucesso para ${userToRecover.email} por ${tenant.name}`,
      );

      if (this.isMicrosoftConsumerDomain(userToRecover.email)) {
        successResponse.warning = "OUTLOOK_DELIVERY_DELAY_POSSIBLE";
      }

      return successResponse;
    } catch (err) {
      console.error(
        "[SMTP Error] Falha ao enviar o e-mail de recuperação:",
        err,
      );

      if (isNonProduction) {
        successResponse.warning = "SMTP_SEND_FAILED";
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

    const [users, teachers, students, guardians] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          resetPasswordToken: hash,
          resetPasswordExpires: { gt: new Date() },
        },
      }),
      this.prisma.teacher.findMany({
        where: {
          resetPasswordToken: hash,
          resetPasswordExpires: { gt: new Date() },
        },
      }),
      this.prisma.student.findMany({
        where: {
          resetPasswordToken: hash,
          resetPasswordExpires: { gt: new Date() },
        },
      }),
      this.prisma.guardian.findMany({
        where: {
          resetPasswordToken: hash,
          resetPasswordExpires: { gt: new Date() },
        },
      }),
    ]);

    const targets = [
      ...users.map((item) => ({ type: "user" as const, item })),
      ...teachers.map((item) => ({ type: "teacher" as const, item })),
      ...students.map((item) => ({ type: "student" as const, item })),
      ...guardians.map((item) => ({ type: "guardian" as const, item })),
    ];

    if (targets.length === 0) {
      throw new UnauthorizedException("Token inválido ou expirado.");
    }

    const salt = await bcrypt.genSalt(10);
    const newHashedPassword = await bcrypt.hash(resetDto.newPassword, salt);
    const applyData = {
      password: newHashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    };

    await Promise.all(
      targets.map((target) => {
        switch (target.type) {
          case "user":
            return this.prisma.user.update({
              where: { id: target.item.id },
              data: applyData,
            });
          case "teacher":
            return this.prisma.teacher.update({
              where: { id: target.item.id },
              data: applyData,
            });
          case "student":
            return this.prisma.student.update({
              where: { id: target.item.id },
              data: applyData,
            });
          case "guardian":
            return this.prisma.guardian.update({
              where: { id: target.item.id },
              data: applyData,
            });
        }
      }),
    );

    return { message: "Senha redefinida com sucesso!" };
  }
}
