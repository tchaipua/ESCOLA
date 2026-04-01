import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface ICurrentUser {
  userId: string;
  tenantId: string;
  role: string;
  permissions: string[];
  email?: string | null;
  isMaster?: boolean;
  modelType?: "user" | "teacher" | "student" | "guardian" | "master";
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ICurrentUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
