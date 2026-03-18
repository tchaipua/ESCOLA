import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles && !requiredPermissions) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || Object.keys(user).length === 0) return false;
    if (user.isMaster) return true;

    if (requiredRoles && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException("Acesso negado para o seu perfil no SaaS.");
    }

    if (
      requiredPermissions &&
      requiredPermissions.length > 0 &&
      user.role !== "ADMIN"
    ) {
      const grantedPermissions = Array.isArray(user.permissions)
        ? user.permissions
        : [];
      const hasAllPermissions = requiredPermissions.every((permission) =>
        grantedPermissions.includes(permission),
      );

      if (!hasAllPermissions) {
        throw new ForbiddenException(
          "Acesso negado: permissões insuficientes para esta operação.",
        );
      }
    }

    return true;
  }
}
