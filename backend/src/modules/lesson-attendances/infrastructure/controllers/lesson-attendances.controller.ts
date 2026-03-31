import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { UpsertLessonAttendanceDto } from "../../application/dto/upsert-lesson-attendance.dto";
import { LessonAttendancesService } from "../../application/services/lesson-attendances.service";

@ApiBearerAuth()
@ApiTags("Chamada da Aula")
@Roles("PROFESSOR")
@Controller("lesson-attendances")
export class LessonAttendancesController {
  constructor(
    private readonly lessonAttendancesService: LessonAttendancesService,
  ) {}

  @Get("by-lesson-item/:lessonCalendarItemId")
  @Permissions("MANAGE_TEACHER_DAILY_AGENDA")
  @ApiOperation({ summary: "Consulta a chamada da aula e os alunos da turma" })
  findByLessonItem(
    @Param("lessonCalendarItemId") lessonCalendarItemId: string,
  ) {
    return this.lessonAttendancesService.findByLessonItem(lessonCalendarItemId);
  }

  @Put("by-lesson-item/:lessonCalendarItemId")
  @Permissions("MANAGE_TEACHER_DAILY_AGENDA")
  @ApiOperation({ summary: "Cria ou atualiza a chamada da aula" })
  upsertByLessonItem(
    @Param("lessonCalendarItemId") lessonCalendarItemId: string,
    @Body() dto: UpsertLessonAttendanceDto,
  ) {
    return this.lessonAttendancesService.upsertByLessonItem(
      lessonCalendarItemId,
      dto,
    );
  }
}
