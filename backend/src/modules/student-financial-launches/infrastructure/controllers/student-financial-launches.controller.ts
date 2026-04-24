import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { AssignStudentFinancialLaunchBankDto } from "../../application/dto/assign-student-financial-launch-bank.dto";
import { CreateStudentFinancialLaunchDto } from "../../application/dto/create-student-financial-launch.dto";
import { StudentFinancialLaunchesService } from "../../application/services/student-financial-launches.service";

@ApiBearerAuth()
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
  bootstrap() {
    return this.studentFinancialLaunchesService.bootstrap();
  }

  @Get(":id/details")
  @Permissions("VIEW_FINANCIAL")
  @ApiOperation({
    summary:
      "Carrega o detalhamento tabulado dos lançamentos criados e das pendências do lote",
  })
  details(@Param("id") id: string) {
    return this.studentFinancialLaunchesService.details(id);
  }

  @Get(":id/bank-dispatch")
  @Permissions("VIEW_FINANCIAL")
  @ApiOperation({
    summary:
      "Carrega as parcelas do lote para vinculação do banco de envio de boletos",
  })
  bankDispatch(@Param("id") id: string) {
    return this.studentFinancialLaunchesService.bankDispatch(id);
  }

  @Post(":id/bank-dispatch")
  @Permissions("MANAGE_MONTHLY_FEES")
  @ApiOperation({
    summary:
      "Vincula um banco às parcelas selecionadas do lote de mensalidades",
  })
  assignBank(
    @Param("id") id: string,
    @Body() payload: AssignStudentFinancialLaunchBankDto,
  ) {
    return this.studentFinancialLaunchesService.assignBank(id, payload);
  }

  @Post()
  @Permissions("MANAGE_MONTHLY_FEES")
  @ApiOperation({
    summary:
      "Gera lançamentos escolares de mensalidade por todos, série ou turma",
  })
  create(@Body() payload: CreateStudentFinancialLaunchDto) {
    return this.studentFinancialLaunchesService.create(payload);
  }
}
