import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface ICurrentUser {
  userId: string;
  tenantId: string;
  branchCode: number;
  role: string;
  permissions: string[];
  name?: string | null;
  email?: string | null;
  cashierOnly?: boolean;
  canOperateCashier?: boolean;
  isMaster?: boolean;
  modelType?: "user" | "teacher" | "student" | "guardian" | "master";
  branchAccessCodes?: number[];
  canAccessAllBranches?: boolean;
  sessionJti?: string;
  identityProvider?: "MSINFOR_CENTRAL" | "LOCAL";
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ICurrentUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
