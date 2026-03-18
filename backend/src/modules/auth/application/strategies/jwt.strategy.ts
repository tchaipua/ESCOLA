import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import {
  deserializePermissions,
} from "../../../../common/auth/user-permissions";
import { resolveAccountPermissions } from "../../../../common/auth/access-profiles";
import {
  MASTER_PERMISSIONS,
  MASTER_ROLE,
  MASTER_TENANT_ID,
  MASTER_USER_ID,
} from "../../../../common/auth/master-auth";

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
    if (payload?.isMaster && payload.userId === MASTER_USER_ID && payload.role === MASTER_ROLE) {
      return {
        userId: MASTER_USER_ID,
        tenantId:
          typeof payload.tenantId === "string" && payload.tenantId.trim()
            ? payload.tenantId
            : MASTER_TENANT_ID,
        role: MASTER_ROLE,
        permissions: Array.isArray(payload.permissions)
          ? payload.permissions
          : MASTER_PERMISSIONS,
        isMaster: true,
      };
    }

    if (!payload.userId || !payload.tenantId || !payload.role) {
      throw new UnauthorizedException(
        "Formato do Token JWT inválido ou adulterado",
      );
    }

    const [user, teacher, student, guardian] = await Promise.all([
      this.prisma.user.findFirst({
        where: {
          id: payload.userId,
          tenantId: payload.tenantId,
          canceledAt: null,
        },
        select: {
          id: true,
          tenantId: true,
          role: true,
          accessProfile: true,
          complementaryProfiles: true,
          permissions: true,
        },
      }),
      this.prisma.teacher.findFirst({
        where: {
          id: payload.userId,
          tenantId: payload.tenantId,
          canceledAt: null,
        },
        select: { id: true, tenantId: true, accessProfile: true, permissions: true },
      }),
      this.prisma.student.findFirst({
        where: {
          id: payload.userId,
          tenantId: payload.tenantId,
          canceledAt: null,
        },
        select: { id: true, tenantId: true, accessProfile: true, permissions: true },
      }),
      this.prisma.guardian.findFirst({
        where: {
          id: payload.userId,
          tenantId: payload.tenantId,
          canceledAt: null,
        },
        select: { id: true, tenantId: true, accessProfile: true, permissions: true },
      }),
    ]);

    const account = user || teacher || student || guardian;

    if (!account) {
      throw new UnauthorizedException("Acesso negado: Perfil inexistente");
    }

    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
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
              "accessProfile" in account ? (account as { accessProfile?: string | null }).accessProfile : null,
            permissions:
              "permissions" in account ? (account as { permissions?: string | null }).permissions : payload.permissions,
          }),
      isMaster: false,
    };
  }
}
