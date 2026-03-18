import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { TeacherSubjectsService } from "../../application/services/teacher-subjects.service";

@ApiBearerAuth()
@ApiTags("Professor x Matéria")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("teacher-subjects")
export class TeacherSubjectsReadController {
  constructor(
    private readonly teacherSubjectsService: TeacherSubjectsService,
  ) {}

  @Get()
  @Permissions("VIEW_SUBJECTS")
  @ApiOperation({
    summary: "Lista os vínculos ativos entre professores e matérias da escola",
  })
  findAll() {
    return this.teacherSubjectsService.findAll();
  }
}
