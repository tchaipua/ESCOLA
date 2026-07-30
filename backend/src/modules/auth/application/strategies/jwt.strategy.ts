import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { deserializePermissions } from "../../../../common/auth/user-permissions";
import { resolveAccountPermissions } from "../../../../common/auth/access-profiles";
import {
  DEFAULT_BRANCH_CODE,
  getVisibleBranchCodes,
  normalizeBranchCode,
  SHARED_BRANCH_CODE,
} from "../../../../common/tenant/branch.constants";
import { getJwtSecret } from "../../../../common/security/security-config";
import {
  getSessionCookieName,
  readCookieValue,
} from "../../../../common/security/financeiro-session";

export function extractSessionCookieJwt(request: any) {
  const sessionCookie = readCookieValue(
    request?.headers?.cookie,
    getSessionCookieName(),
  );
  if (!sessionCookie) return null;
  request.msinforAuthTransport = "cookie";
  return sessionCookie;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractSessionCookieJwt]),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: any) {
    const prismaClient =
      (
        this.prisma as PrismaService & {
          getUnscopedClient?: () => PrismaService;
        }
      ).getUnscopedClient?.() || this.prisma;

    if (
      payload?.isMaster ||
      payload?.modelType === "master" ||
      payload?.userId === "MSINFOR-MASTER"
    ) {
      throw new UnauthorizedException(
        "Sessão administrativa legada não é aceita.",
      );
    }

    if (
      !payload.userId ||
      !payload.tenantId ||
      !payload.role ||
      !["user", "teacher", "student", "guardian"].includes(
        payload.modelType,
      ) ||
      !/^[A-Za-z0-9_-]{43}$/.test(String(payload.jti || ""))
    ) {
      throw new UnauthorizedException(
        "Formato do Token JWT inválido ou adulterado",
      );
    }

    const requestedBranchCode = normalizeBranchCode(
      payload.branchCode,
      DEFAULT_BRANCH_CODE,
    );

    const [authSession, user, teacher, student, guardian] = await Promise.all([
      prismaClient.authSession.findFirst({
        where: {
          jti: payload.jti,
          tenantId: payload.tenantId,
          userId: payload.userId,
          modelType: payload.modelType,
          branchCode: requestedBranchCode,
          canceledAt: null,
          expiresAt: { gt: new Date() },
        },
        select: {
          jti: true,
          identityProvider: true,
        },
      }),
      prismaClient.user.findFirst({
        where: {
          id: payload.userId,
          tenantId: payload.tenantId,
          canceledAt: null,
        },
        select: {
          id: true,
          tenantId: true,
          branchCode: true,
          name: true,
          role: true,
          accessProfile: true,
          complementaryProfiles: true,
          permissions: true,
          cashierOnly: true,
          email: true,
          branchAccesses: {
            where: { canceledAt: null },
            orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
            select: { branchCode: true, isDefault: true },
          },
        },
      }),
      prismaClient.teacher.findFirst({
        where: {
          id: payload.userId,
          tenantId: payload.tenantId,
          canceledAt: null,
        },
        select: {
          id: true,
          tenantId: true,
          branchCode: true,
          accessProfile: true,
          permissions: true,
          person: { select: { name: true, email: true } },
          branchAccesses: {
            where: { canceledAt: null },
            orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
            select: { branchCode: true, isDefault: true },
          },
        },
      }),
      prismaClient.student.findFirst({
        where: {
          id: payload.userId,
          tenantId: payload.tenantId,
          canceledAt: null,
        },
        select: {
          id: true,
          tenantId: true,
          branchCode: true,
          accessProfile: true,
          permissions: true,
          person: { select: { name: true, email: true } },
          branchAccesses: {
            where: { canceledAt: null },
            orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
            select: { branchCode: true, isDefault: true },
          },
        },
      }),
      prismaClient.guardian.findFirst({
        where: {
          id: payload.userId,
          tenantId: payload.tenantId,
          canceledAt: null,
        },
        select: {
          id: true,
          tenantId: true,
          branchCode: true,
          accessProfile: true,
          permissions: true,
          person: { select: { name: true, email: true } },
          branchAccesses: {
            where: { canceledAt: null },
            orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
            select: { branchCode: true, isDefault: true },
          },
        },
      }),
    ]);

    if (!authSession) {
      throw new UnauthorizedException(
        "Sessão expirada, revogada ou inexistente.",
      );
    }

    const account = user || teacher || student || guardian;
    const modelType = user
      ? "user"
      : teacher
        ? "teacher"
        : student
          ? "student"
          : guardian
            ? "guardian"
            : undefined;

    if (!account) {
      throw new UnauthorizedException("Acesso negado: Perfil inexistente");
    }
    if (modelType !== payload.modelType) {
      throw new UnauthorizedException(
        "Tipo de conta da sessão não corresponde ao cadastro.",
      );
    }

    const canAccessAllBranches = Boolean(
      user && String(user.role || "").toUpperCase() === "ADMIN",
    );
    const branchAccesses = user
      ? user.branchAccesses || []
      : "branchAccesses" in account
        ? (account.branchAccesses || [])
        : [];
    const branchAccessCodes = Array.from(
      new Set(
        branchAccesses
          .map((access) =>
            normalizeBranchCode(access.branchCode, DEFAULT_BRANCH_CODE),
          )
          .filter((branchCode) => branchCode >= DEFAULT_BRANCH_CODE),
      ),
    );

    if (user && !canAccessAllBranches) {
      const fallbackCodes =
        branchAccessCodes.length > 0
          ? branchAccessCodes
          : [normalizeBranchCode(user.branchCode, DEFAULT_BRANCH_CODE)];

      if (!fallbackCodes.includes(requestedBranchCode)) {
        throw new UnauthorizedException(
          "Acesso negado para a filial selecionada.",
        );
      }
    }

    if (!user) {
      if (branchAccessCodes.length > 0) {
        if (!branchAccessCodes.includes(requestedBranchCode)) {
          throw new UnauthorizedException(
            "Acesso negado para a filial selecionada.",
          );
        }
      } else {
        const accountBranchCode = normalizeBranchCode(
        (account as { branchCode?: number | null }).branchCode,
        DEFAULT_BRANCH_CODE,
        );
        const isSharedAccount = accountBranchCode === SHARED_BRANCH_CODE;
        if (
          !isSharedAccount &&
          !getVisibleBranchCodes(requestedBranchCode).includes(accountBranchCode)
        ) {
          throw new UnauthorizedException(
            "Acesso negado para a filial selecionada.",
          );
        }
      }
    }

    const validatedRole = user
      ? user.role
      : teacher
        ? "PROFESSOR"
        : student
          ? "ALUNO"
          : "RESPONSAVEL";
    const validatedName = user
      ? user.name
      : "person" in account
        ? account.person?.name
        : null;

    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      branchCode: requestedBranchCode,
      role: validatedRole,
      name: validatedName || null,
      email:
        user && typeof user.email === "string" && user.email.trim()
          ? user.email
          : "person" in account &&
              typeof account.person?.email === "string" &&
              account.person.email.trim()
            ? account.person.email
          : null,
      modelType,
      cashierOnly: user ? Boolean(user.cashierOnly) : false,
      permissions: user
        ? resolveAccountPermissions({
            role: user.role,
            accessProfile: user.accessProfile,
            complementaryProfiles: user.complementaryProfiles,
            permissions: user.permissions,
          })
        : resolveAccountPermissions({
            role: payload.role,
            accessProfile:
              "accessProfile" in account
                ? (account as { accessProfile?: string | null }).accessProfile
                : null,
            permissions:
              "permissions" in account
                ? (account as { permissions?: string | null }).permissions
              : payload.permissions,
          }),
      branchAccessCodes,
      canAccessAllBranches,
      isMaster: false,
      sessionJti: authSession.jti,
      identityProvider:
        authSession.identityProvider === "MSINFOR_CENTRAL"
          ? "MSINFOR_CENTRAL"
          : "LOCAL",
    };
  }
}
