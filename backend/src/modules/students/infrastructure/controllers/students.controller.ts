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
import { StudentsService } from "../../application/services/students.service";
import { CreateStudentDto } from "../../application/dto/create-student.dto";
import { UpdateStudentDto } from "../../application/dto/update-student.dto";
import { AssignStudentSeriesClassDto } from "../../application/dto/assign-student-series-class.dto";
import { SetRecordActiveDto } from "../../../../common/dto/set-record-active.dto";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  type ICurrentUser,
} from "../../../../common/decorators/current-user.decorator";

@ApiBearerAuth()
@ApiTags("Alunos (Estudantes)")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("students")
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @Permissions("MANAGE_STUDENTS")
  @ApiOperation({ summary: "Cadastra uma nova Criança/Aluno na Escola" })
  create(
    @Body() createStudentDto: CreateStudentDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.studentsService.create(createStudentDto, currentUser);
  }

  @Get()
  @Permissions("VIEW_STUDENTS")
  @ApiOperation({
    summary: "Busca o diretório inteiro de Alunos da sua Escola",
  })
  findAll(@CurrentUser() currentUser: ICurrentUser) {
    return this.studentsService.findAll(currentUser);
  }

  @Get("me")
  @Roles("ALUNO")
  @Permissions("VIEW_OWN_PROFILE")
  @ApiOperation({ summary: "Consulta o próprio cadastro do aluno logado" })
  findMe(@CurrentUser() currentUser: ICurrentUser) {
    return this.studentsService.findMe(
      currentUser.userId,
      currentUser.tenantId,
      currentUser,
    );
  }

  @Get(":id")
  @Permissions("VIEW_STUDENTS")
  @ApiOperation({ summary: "Puxa o Prontuário Específico de um Aluno" })
  findOne(@Param("id") id: string, @CurrentUser() currentUser: ICurrentUser) {
    return this.studentsService.findOne(id, currentUser);
  }

  @Patch(":id")
  @Permissions("MANAGE_STUDENTS")
  @ApiOperation({ summary: "Atualiza Telefones de Responsáveis e etc." })
  update(
    @Param("id") id: string,
    @Body() updateStudentDto: UpdateStudentDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.studentsService.update(id, updateStudentDto, currentUser);
  }

  @Patch(":id/series-class-assignment")
  @Permissions("MANAGE_STUDENTS")
  @ApiOperation({
    summary:
      "Lança ou limpa a Turma + Série atual do aluno usando o ano letivo ativo",
  })
  assignSeriesClass(
    @Param("id") id: string,
    @Body() assignStudentSeriesClassDto: AssignStudentSeriesClassDto,
  ) {
    return this.studentsService.assignSeriesClass(
      id,
      assignStudentSeriesClassDto,
    );
  }

  @Patch(":id/status")
  @Permissions("MANAGE_STUDENTS")
  @ApiOperation({ summary: "Ativa ou inativa logicamente o aluno" })
  setActiveStatus(
    @Param("id") id: string,
    @Body() setRecordActiveDto: SetRecordActiveDto,
  ) {
    return this.studentsService.setActiveStatus(id, setRecordActiveDto.active);
  }

  @Delete(":id")
  @Permissions("MANAGE_STUDENTS")
  @ApiOperation({ summary: "Apaga permanentemente um Aluno do Sistema" })
  remove(@Param("id") id: string) {
    return this.studentsService.remove(id);
  }
}
