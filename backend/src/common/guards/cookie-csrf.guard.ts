import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { getCorsAllowedOrigins } from "../security/security-config";
import { isValidEscolaCsrf } from "../security/financeiro-session";

@Injectable()
export class CookieCsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const method = String(request.method || "GET").toUpperCase();
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
      fetchSite !== "same-origin" ||
      !isValidEscolaCsrf(request)
    ) {
      throw new ForbiddenException(
        "Proteção CSRF da Escola inválida ou ausente.",
      );
    }
    return true;
  }
}
