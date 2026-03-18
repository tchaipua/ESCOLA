import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { EnrollmentsService } from "../../application/services/enrollments.service";
import { CreateEnrollmentDto } from "../../application/dto/create-enrollment.dto";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { Permissions } from "../../../../common/decorators/permissions.decorator";

@ApiBearerAuth()
@ApiTags("Matrículas Mestre (Vínculo Pleno)")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("enrollments")
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post()
  @Permissions("MANAGE_ENROLLMENTS")
  @ApiOperation({ summary: "Matricula um Aluno Oficialmente na Sala e no Ano" })
  create(@Body() createEnrollmentDto: CreateEnrollmentDto) {
    return this.enrollmentsService.create(createEnrollmentDto);
  }

  @Get()
  @Permissions("VIEW_ENROLLMENTS")
  @ApiOperation({ summary: "Lista todas as matrículas vigentes" })
  findAll() {
    return this.enrollmentsService.findAll();
  }

  @Get(":id")
  @Permissions("VIEW_ENROLLMENTS")
  @ApiOperation({ summary: "Pega dados de uma matrícula ESPECÍFICA" })
  findOne(@Param("id") id: string) {
    return this.enrollmentsService.findOne(id);
  }

  @Patch(":id/status")
  @Permissions("MANAGE_ENROLLMENTS")
  @ApiOperation({ summary: "Faz Transferência ou Tranca (Status)" })
  updateStatus(@Param("id") id: string, @Body("status") status: string) {
    return this.enrollmentsService.updateStatus(id, status);
  }

  @Delete(":id")
  @Permissions("MANAGE_ENROLLMENTS")
  @ApiOperation({ summary: "Cancela a Matrícula (Soft Delete Histórico)" })
  remove(@Param("id") id: string) {
    return this.enrollmentsService.remove(id);
  }
}
