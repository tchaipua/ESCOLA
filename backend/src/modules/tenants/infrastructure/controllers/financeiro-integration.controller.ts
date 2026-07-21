import {
  Body,
  Controller,
  Patch,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../../../../common/decorators/public.decorator";
import { ApplyFinanceSourceParametersDto } from "../../application/dto/finance-source-parameters.dto";
import { TenantsService } from "../../application/services/tenants.service";

@ApiTags("Integração Financeiro")
@Controller("integrations/financeiro")
export class FinanceiroIntegrationController {
  constructor(private readonly tenantsService: TenantsService) {}

  private assertIntegrationApiKey(request: Request) {
    const expected = String(
      process.env.FINANCEIRO_INTEGRATION_API_KEY || "",
    ).trim();
    const incoming = String(request.headers["x-api-key"] || "").trim();

    if (!expected || !incoming || incoming !== expected) {
      throw new UnauthorizedException(
        "Integração financeira não autorizada.",
      );
    }
  }

  @Public()
  @Patch("company-branch-parameters")
  @ApiOperation({
    summary:
      "Grava na origem oficial parâmetros alterados pelo sistema Financeiro",
  })
  applyCompanyBranchParameters(
    @Req() request: Request,
    @Body() payload: ApplyFinanceSourceParametersDto,
  ) {
    this.assertIntegrationApiKey(request);
    return this.tenantsService.applyFinanceSourceParameters(payload);
  }
}
