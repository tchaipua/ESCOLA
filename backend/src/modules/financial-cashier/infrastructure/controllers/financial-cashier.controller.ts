import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type ICurrentUser } from "../../../../common/decorators/current-user.decorator";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import { Roles } from "../../../../common/decorators/roles.decorator";
import {
  CloseCashSessionDto,
  ListCashierInstallmentsDto,
  ListOpenCashierInstallmentsDto,
  OpenCashSessionDto,
  SettleCashInstallmentDto,
} from "../../application/dto/cashier.dto";
import { FinancialCashierService } from "../../application/services/financial-cashier.service";

@ApiBearerAuth()
@ApiTags("Caixa Financeiro Integrado")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("financial-cashier")
export class FinancialCashierController {
  constructor(
    private readonly financialCashierService: FinancialCashierService,
  ) {}

  @Get("current-session")
  @Permissions("VIEW_CASHIER")
  @ApiOperation({
    summary: "Consulta o caixa aberto do usuário logado no Financeiro",
  })
  getCurrentSession(@CurrentUser() currentUser: ICurrentUser) {
    return this.financialCashierService.getCurrentSession(currentUser);
  }

  @Post("open-session")
  @Permissions("VIEW_CASHIER")
  @ApiOperation({
    summary: "Abre um caixa no Financeiro para o usuário logado",
  })
  openSession(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() payload: OpenCashSessionDto,
  ) {
    return this.financialCashierService.openSession(currentUser, payload);
  }

  @Post("close-session")
  @Permissions("CLOSE_CASHIER")
  @ApiOperation({
    summary: "Fecha o caixa aberto do usuário logado no Financeiro",
  })
  closeSession(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() payload: CloseCashSessionDto,
  ) {
    return this.financialCashierService.closeSession(currentUser, payload);
  }

  @Get("installments")
  @Permissions("VIEW_CASHIER")
  @ApiOperation({
    summary:
      "Lista parcelas do Financeiro para a escola atual com filtros de status, aluno e pagador",
  })
  listInstallments(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() query: ListCashierInstallmentsDto,
  ) {
    return this.financialCashierService.listInstallments(currentUser, query);
  }

  @Get("open-installments")
  @Permissions("VIEW_CASHIER")
  @ApiOperation({
    summary: "Lista parcelas em aberto no Financeiro para a escola atual",
  })
  listOpenInstallments(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() query: ListOpenCashierInstallmentsDto,
  ) {
    return this.financialCashierService.listOpenInstallments(
      currentUser,
      query,
    );
  }

  @Post("installments/:installmentId/settle-cash")
  @Permissions("SETTLE_RECEIVABLES")
  @ApiOperation({
    summary:
      "Registra baixa em dinheiro no Financeiro usando o caixa aberto do usuário logado",
  })
  settleCashInstallment(
    @CurrentUser() currentUser: ICurrentUser,
    @Param("installmentId") installmentId: string,
    @Body() payload: SettleCashInstallmentDto,
  ) {
    return this.financialCashierService.settleCashInstallment(
      currentUser,
      installmentId,
      payload,
    );
  }
}
