import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { tenantContext } from "./tenant.context";
import { MASTER_TENANT_ID } from "../auth/master-auth";

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];

      try {
        // Extrai o Payload puro (Sem validação criptográfica, pois o
        // JWT AuthGuard validará rigorosamente a textura depois antes
        // do endpoint executar, isto aqui lida apenas com isolamento contextual)
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split("")
            .map(function (c) {
              return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
            })
            .join(""),
        );

        const decoded = JSON.parse(jsonPayload);

        if (decoded?.isMaster) {
          const contextData = {
            userId: decoded.userId || decoded.sub,
            tenantId:
              typeof decoded.tenantId === "string" && decoded.tenantId.trim()
                ? decoded.tenantId
                : MASTER_TENANT_ID,
            role: decoded.role,
            isMaster: true,
          };

          return tenantContext.run(contextData, () => next());
        }

        if (decoded && decoded.tenantId) {
          const contextData = {
            userId: decoded.userId || decoded.sub,
            tenantId: decoded.tenantId,
            role: decoded.role,
            isMaster: false,
          };

          // Tudo que for executado dentro deste closure carregará o Contexto Global do Tenant
          return tenantContext.run(contextData, () => next());
        }
      } catch (err) {
        // Falhas sintáticas de parsing caem aqui e continuam nuas (Guard vai barrar).
      }
    }

    // Sem contexto (requisições desprotegidas ou mal formatadas/sem token)
    next();
  }
}
