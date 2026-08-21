import {
  Body,
  Controller,
  GoneException,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../../../../common/decorators/public.decorator";
import { tenantContext } from "../../../../common/tenant/tenant.context";
import {
  FinanceiroCallbackAuthGuard,
  type FinanceiroCallbackContext,
} from "../../../../integrations/financeiro/financeiro-callback-auth.guard";
import { ApplyFinanceSourceParametersDto } from "../../application/dto/finance-source-parameters.dto";
import { TenantsService } from "../../application/services/tenants.service";
import { UsersService } from "../../../users/application/services/users.service";
import { PrismaService } from "../../../../prisma/prisma.service";
import { NotificationsService } from "../../../notifications/application/services/notifications.service";
import { AuthService } from "../../../auth/application/services/auth.service";

@ApiTags("Integração Financeiro")
@Controller("integrations/financeiro")
export class FinanceiroIntegrationController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly authService: AuthService,
  ) {}

  @Public()
  @UseGuards(FinanceiroCallbackAuthGuard)
  @Post("financial-notifications")
  @ApiOperation({ summary: "Recebe uma notificação financeira assinada" })
  receiveFinancialNotification(
    @Req() request: Request & { financeiroCallback?: FinanceiroCallbackContext },
    @Body() payload: Record<string, unknown>,
  ) {
    const callback = request.financeiroCallback!;
    return this.runInCallbackTenant(callback, (canonicalTenantId) =>
      this.notificationsService.processFinanceiroNotification(payload, {
        ...callback,
        tenantId: canonicalTenantId,
      }),
    );
  }

  private async runInCallbackTenant<T>(
    callback: FinanceiroCallbackContext,
    operation: (canonicalTenantId: string) => Promise<T>,
  ) {
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true },
    });
    const canonicalTenantId = tenants.find(
      (tenant) => tenant.id.toUpperCase() === callback.tenantId.toUpperCase(),
    )?.id;
    if (!canonicalTenantId) {
      throw new UnauthorizedException("Integração financeira não autorizada.");
    }
    return tenantContext.run(
      {
        userId: callback.userId,
        tenantId: canonicalTenantId,
        branchCode: callback.branchCode,
        role: "SOFTHOUSE_ADMIN",
        isMaster: false,
      },
      () => operation(canonicalTenantId),
    );
  }

  @Public()
  @UseGuards(FinanceiroCallbackAuthGuard)
  @Post("system-users/resolve")
  resolveSystemUserPerson(
    @Req() request: Request & { financeiroCallback?: FinanceiroCallbackContext },
    @Body() payload: Record<string, unknown>,
  ) {
    const callback = request.financeiroCallback!;
    return this.runInCallbackTenant(callback, (canonicalTenantId) =>
      this.usersService.resolvePersonByCpfFromFinanceiro(
        canonicalTenantId,
        String(payload.document || ""),
      ),
    );
  }

  @Public()
  @UseGuards(FinanceiroCallbackAuthGuard)
  @Post("system-users/upsert")
  upsertSystemUser(
    @Req() request: Request & { financeiroCallback?: FinanceiroCallbackContext },
    @Body() payload: Record<string, unknown>,
  ) {
    const callback = request.financeiroCallback!;
    return this.runInCallbackTenant(callback, (canonicalTenantId) =>
      this.usersService.upsertFromFinanceiro(payload, {
        ...callback,
        tenantId: canonicalTenantId,
      }),
    );
  }

  @Public()
  @UseGuards(FinanceiroCallbackAuthGuard)
  @Post("system-users/confirmation-pin")
  updateSystemUserConfirmationPin(
    @Req() request: Request & { financeiroCallback?: FinanceiroCallbackContext },
    @Body() payload: Record<string, unknown>,
  ) {
    const callback = request.financeiroCallback!;
    return this.runInCallbackTenant(callback, (canonicalTenantId) =>
      this.usersService.updateConfirmationPinFromFinanceiro(
        String(payload.sourceUserId || ""),
        String(payload.confirmationPin || ""),
        { tenantId: canonicalTenantId, userId: callback.userId },
      ),
    );
  }

  @Public()
  @UseGuards(FinanceiroCallbackAuthGuard)
  @Post("system-users/password")
  updateSystemUserPassword(
    @Req() request: Request & { financeiroCallback?: FinanceiroCallbackContext },
    @Body() payload: Record<string, unknown>,
  ) {
    const callback = request.financeiroCallback!;
    return this.runInCallbackTenant(callback, (canonicalTenantId) =>
      this.usersService.updatePasswordFromFinanceiro(
        String(payload.sourceUserId || ""),
        String(payload.password || ""),
        { tenantId: canonicalTenantId, userId: callback.userId },
      ),
    );
  }

  @Public()
  @UseGuards(FinanceiroCallbackAuthGuard)
  @Post("system-users/confirm-operation-credential")
  confirmOperationCredential(
    @Req() request: Request & { financeiroCallback?: FinanceiroCallbackContext },
    @Body() payload: Record<string, unknown>,
  ) {
    const callback = request.financeiroCallback!;
    return this.runInCallbackTenant(callback, async (canonicalTenantId) => {
      const confirmation = await this.authService.confirmPassword(
        callback.userId,
        canonicalTenantId,
        "user",
        String(payload.credential || ""),
      );
      return {
        authenticated: confirmation.status === "SUCCESS",
        authorizedBy: callback.userId,
      };
    });
  }

  @Public()
  @UseGuards(FinanceiroCallbackAuthGuard)
  @Patch("company-branch-parameters")
  @ApiOperation({
    summary:
      "Rota legada desativada; parâmetros pertencem ao MSINFOR Central",
  })
  applyCompanyBranchParameters(
    @Req()
    request: Request & {
      financeiroCallback?: FinanceiroCallbackContext;
    },
    @Body() payload: ApplyFinanceSourceParametersDto,
  ) {
    throw new GoneException(
      "Parâmetros de empresa e filial são mantidos exclusivamente no MSINFOR Central.",
    );
  }
}
