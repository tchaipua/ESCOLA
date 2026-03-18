import { AsyncLocalStorage } from "async_hooks";

export interface ITenantContext {
  userId: string;
  tenantId: string;
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
