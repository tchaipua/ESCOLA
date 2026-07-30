import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import type { ICurrentUser } from "../../common/decorators/current-user.decorator";
import {
  getCorsAllowedOrigins,
} from "../../common/security/security-config";
import {
  isValidFinanceiroCsrf,
  readSessionToken,
} from "../../common/security/financeiro-session";
import { hasFinanceiroAccess } from "./financeiro-gateway.policy";

@Injectable()
export class FinanceiroBrowserGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<
      Request & { user?: ICurrentUser }
    >();
    if (!request.user || !hasFinanceiroAccess(request.user)) {
      throw new ForbiddenException(
        "Acesso ao Financeiro não autorizado para esta sessão.",
      );
    }

    const method = request.method.toUpperCase();
    if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;

    const origin = String(request.headers.origin || "").trim();
    const fetchSite = String(
      request.headers["sec-fetch-site"] || "",
    )
      .trim()
      .toLowerCase();
    if (
      !origin ||
      !getCorsAllowedOrigins().includes(origin) ||
      fetchSite !== "same-origin"
    ) {
      throw new ForbiddenException(
        "Origem da operação financeira não autorizada.",
      );
    }
    if (!readSessionToken(request) || !isValidFinanceiroCsrf(request)) {
      throw new ForbiddenException(
        "Proteção CSRF financeira inválida ou ausente.",
      );
    }
    return true;
  }
}
