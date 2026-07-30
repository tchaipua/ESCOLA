import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { CreateStudentFinancialLaunchDto } from "../../application/dto/create-student-financial-launch.dto";
import { StudentFinancialLaunchesService } from "../../application/services/student-financial-launches.service";
import {
  CurrentUser,
  type ICurrentUser,
} from "../../../../common/decorators/current-user.decorator";

@ApiTags("Lançamentos Financeiros Escolares")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("student-financial-launches")
export class StudentFinancialLaunchesController {
  constructor(
    private readonly studentFinancialLaunchesService: StudentFinancialLaunchesService,
  ) {}

  @Get()
  @Permissions("VIEW_FINANCIAL")
  @ApiOperation({
    summary:
      "Carrega filtros e histórico da tela de lançamentos financeiros de alunos",
  })
  bootstrap(@CurrentUser() currentUser: ICurrentUser) {
    return this.studentFinancialLaunchesService.bootstrap(currentUser);
  }

  @Post("sync-payers")
  @Permissions("VIEW_FINANCIAL")
  @ApiOperation({
    summary:
      "Sincroniza os pagadores atuais da Escola com o cadastro de clientes do Financeiro",
  })
  syncPayers(@CurrentUser() currentUser: ICurrentUser) {
    return this.studentFinancialLaunchesService.syncPayers(currentUser);
  }

  @Get(":id/details")
  @Permissions("VIEW_FINANCIAL")
  @ApiOperation({
    summary:
      "Carrega o detalhamento tabulado dos lançamentos criados e das pendências do lote",
  })
  details(
    @CurrentUser() currentUser: ICurrentUser,
    @Param("id") id: string,
  ) {
    return this.studentFinancialLaunchesService.details(currentUser, id);
  }

  @Post()
  @Permissions("MANAGE_MONTHLY_FEES")
  @ApiOperation({
    summary:
      "Gera lançamentos escolares de mensalidade por todos, série ou turma",
  })
  create(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() payload: CreateStudentFinancialLaunchDto,
  ) {
    return this.studentFinancialLaunchesService.create(currentUser, payload);
  }
}
