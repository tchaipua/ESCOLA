import { AsyncLocalStorage } from "async_hooks";

export interface ITenantContext {
  userId: string;
  tenantId: string;
  branchCode: number;
  role: string;
  isMaster?: boolean;
}

// O AsyncLocalStorage nos permite compartilhar dados por toda a "árvore"
// da requisição HTTP (Controladores, Serviços e Prisma) sem precisarmos
// passar a variável "user" método por método (Prop-drilling).
export const tenantContext = new AsyncLocalStorage<ITenantContext>();

export function getTenantContext(): ITenantContext | undefined {
  return tenantContext.getStore();
}

export function runWithTenantBranchScope<T>(
  branchCode: number,
  operation: () => Promise<T>,
): Promise<T> {
  const currentContext = getTenantContext();
  if (!currentContext) {
    return operation();
  }

  return tenantContext.run(
    {
      ...currentContext,
      branchCode,
    },
    () => operation(),
  );
}
