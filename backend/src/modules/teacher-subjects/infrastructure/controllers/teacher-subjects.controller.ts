import { Controller, Post, Body, Param, Delete, Patch } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { TeacherSubjectsService } from "../../application/services/teacher-subjects.service";
import { AssignSubjectDto } from "../../application/dto/assign-subject.dto";
import { UpdateTeacherSubjectDto } from "../../application/dto/update-teacher-subject.dto";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { Permissions } from "../../../../common/decorators/permissions.decorator";

@ApiBearerAuth()
@ApiTags("Professores (Equip Docente)")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("teachers")
export class TeacherSubjectsController {
  constructor(
    private readonly teacherSubjectsService: TeacherSubjectsService,
  ) {}

  @Post(":id/subjects")
  @Permissions("MANAGE_SUBJECTS")
  @ApiOperation({
    summary: "Delega uma Disciplina / Matéria a um Professor Específico",
  })
  assign(@Param("id") id: string, @Body() assignDto: AssignSubjectDto) {
    return this.teacherSubjectsService.assign(id, assignDto);
  }

  @Delete(":id/subjects/:subjectId")
  @Permissions("MANAGE_SUBJECTS")
  @ApiOperation({
    summary: "Remove a permissão de dar certa aula (Soft Delete Vínculo)",
  })
  unassign(@Param("id") id: string, @Param("subjectId") subjectId: string) {
    return this.teacherSubjectsService.unassign(id, subjectId);
  }

  @Patch(":id/subjects/:subjectId")
  @Permissions("MANAGE_SUBJECTS")
  @ApiOperation({
    summary: "Atualiza os dados financeiros do vínculo disciplina x professor",
  })
  update(
    @Param("id") id: string,
    @Param("subjectId") subjectId: string,
    @Body() updateDto: UpdateTeacherSubjectDto,
  ) {
    return this.teacherSubjectsService.update(id, subjectId, updateDto);
  }
}
