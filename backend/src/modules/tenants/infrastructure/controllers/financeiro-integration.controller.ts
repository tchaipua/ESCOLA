import {
  Body,
  Controller,
  GoneException,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../../../../common/decorators/public.decorator";
import {
  FinanceiroCallbackAuthGuard,
  type FinanceiroCallbackContext,
} from "../../../../integrations/financeiro/financeiro-callback-auth.guard";
import { ApplyFinanceSourceParametersDto } from "../../application/dto/finance-source-parameters.dto";
import { TenantsService } from "../../application/services/tenants.service";

@ApiTags("Integração Financeiro")
@Controller("integrations/financeiro")
export class FinanceiroIntegrationController {
  constructor(private readonly tenantsService: TenantsService) {}

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
