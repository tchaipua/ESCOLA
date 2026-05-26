import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { deserializePermissions } from "../../../../common/auth/user-permissions";
import { resolveAccountPermissions } from "../../../../common/auth/access-profiles";
import {
  MASTER_PERMISSIONS,
  MASTER_ROLE,
  MASTER_TENANT_ID,
  MASTER_USER_ID,
} from "../../../../common/auth/master-auth";
import {
  DEFAULT_BRANCH_CODE,
  getVisibleBranchCodes,
  normalizeBranchCode,
  SHARED_BRANCH_CODE,
} from "../../../../common/tenant/branch.constants";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || "super-secret-escolar-key-2026",
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
      payload?.isMaster &&
      payload.userId === MASTER_USER_ID &&
      payload.role === MASTER_ROLE
    ) {
      return {
        userId: MASTER_USER_ID,
        tenantId:
          typeof payload.tenantId === "string" && payload.tenantId.trim()
            ? payload.tenantId
            : MASTER_TENANT_ID,
        branchCode: normalizeBranchCode(
          payload.branchCode,
          DEFAULT_BRANCH_CODE,
        ),
        role: MASTER_ROLE,
        permissions: Array.isArray(payload.permissions)
          ? payload.permissions
          : MASTER_PERMISSIONS,
        branchAccessCodes: Array.isArray(payload.branchAccessCodes)
          ? payload.branchAccessCodes
          : [],
        canAccessAllBranches: true,
        email:
          typeof payload.email === "string" && payload.email.trim()
            ? payload.email
            : "MSINFOR",
        modelType: "master",
        isMaster: true,
      };
    }

    if (!payload.userId || !payload.tenantId || !payload.role) {
      throw new UnauthorizedException(
        "Formato do Token JWT inválido ou adulterado",
      );
    }

    const requestedBranchCode = normalizeBranchCode(
      payload.branchCode,
      DEFAULT_BRANCH_CODE,
    );

    const [user, teacher, student, guardian] = await Promise.all([
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
          role: true,
          accessProfile: true,
          complementaryProfiles: true,
          permissions: true,
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
          email: true,
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
          email: true,
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
          email: true,
          branchAccesses: {
            where: { canceledAt: null },
            orderBy: [{ isDefault: "desc" }, { branchCode: "asc" }],
            select: { branchCode: true, isDefault: true },
          },
        },
      }),
    ]);

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

    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      branchCode: requestedBranchCode,
      role: payload.role,
      email:
        typeof account.email === "string" && account.email.trim()
          ? account.email
          : null,
      modelType,
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
    };
  }
}
