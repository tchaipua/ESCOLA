import { Prisma } from "@prisma/client";
import { getTenantContext } from "../common/tenant/tenant.context";
import { ForbiddenException } from "@nestjs/common";

const IGNORED_MODELS = ["Tenant", "GlobalSetting", "EmailCredential"];
const PUBLIC_MODELS = ["User", "Teacher", "Student", "Guardian"];

export function tenantMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    const context = getTenantContext();
    const model = params.model;

    if (!model) return next(params);
    if (IGNORED_MODELS.includes(model)) return next(params);

    if (!context) {
      if (PUBLIC_MODELS.includes(model)) {
        return next(params);
      }
      throw new ForbiddenException(
        `Cross-Tenant Error: Contexto ausente para manipulação restrita de ${model}.`,
      );
    }

    if (context.isMaster) {
      if (params.action === "create") {
        const tenantId = params.args?.data?.tenantId;
        if (!tenantId && !PUBLIC_MODELS.includes(model)) {
          throw new ForbiddenException(
            `Operação master em ${model} exige tenantId explícito.`,
          );
        }
      }

      if (params.action === "createMany" && params.args?.data) {
        const dataArray = Array.isArray(params.args.data)
          ? params.args.data
          : [params.args.data];
        const hasMissingTenant = dataArray.some(
          (item: any) => !item?.tenantId && !PUBLIC_MODELS.includes(model),
        );

        if (hasMissingTenant) {
          throw new ForbiddenException(
            `Operação master em lote para ${model} exige tenantId explícito.`,
          );
        }
      }

      return next(params);
    }

    const tenantId_from_context = context.tenantId;
    const action = params.action;

    const readOrUpdateActions = [
      "findUnique",
      "findUniqueOrThrow",
      "findFirst",
      "findFirstOrThrow",
      "findMany",
      "update",
      "updateMany",
      "delete",
      "deleteMany",
      "count",
      "aggregate",
      "groupBy",
    ];

    if (readOrUpdateActions.includes(action)) {
      if (!params.args) params.args = {};
      if (!params.args.where) params.args.where = {};

      if (
        params.args.where.tenantId &&
        params.args.where.tenantId !== tenantId_from_context
      ) {
        throw new ForbiddenException(
          "Intrusion Warning: Tentativa de cross-tenancy/bypass detectada e bloqueada!",
        );
      }

      if (action === "findUnique" || action === "findUniqueOrThrow") {
        params.action = action.replace("Unique", "First") as any;
      }
      if (action === "delete") {
        params.action = "deleteMany";
      }
      if (action === "update") {
        params.action = "updateMany";
      }

      params.args.where.tenantId = tenantId_from_context;
    }

    if (action === "create") {
      if (!params.args) params.args = {};
      if (!params.args.data) params.args.data = {};

      if (
        params.args.data.tenantId &&
        params.args.data.tenantId !== tenantId_from_context
      ) {
        throw new ForbiddenException(
          "Intrusion Warning: Você não pode criar entidades em outro inquilino.",
        );
      }
      params.args.data.tenantId = tenantId_from_context;
    }

    if (action === "createMany") {
      if (params.args && params.args.data) {
        const dataArray = Array.isArray(params.args.data)
          ? params.args.data
          : [params.args.data];
        dataArray.forEach((item: any) => {
          if (item.tenantId && item.tenantId !== tenantId_from_context) {
            throw new ForbiddenException(
              "Intrusion Warning: Operação em lote interceptada contendo Tenant divergente.",
            );
          }
          item.tenantId = tenantId_from_context;
        });
      }
    }

    return next(params);
  };
}
