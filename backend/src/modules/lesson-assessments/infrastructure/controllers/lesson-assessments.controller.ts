import { Body, Controller, Get, Param, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { LessonAssessmentsService } from "../../application/services/lesson-assessments.service";
import { UpsertLessonAssessmentDto } from "../../application/dto/upsert-lesson-assessment.dto";
import { ListMyTeacherAssessmentsDto } from "../../application/dto/list-my-teacher-assessments.dto";
import { ListTeacherGradeHistoryDto } from "../../application/dto/list-teacher-grade-history.dto";

@ApiBearerAuth()
@ApiTags("Avaliações da Aula")
@Roles("PROFESSOR")
@Controller("lesson-assessments")
export class LessonAssessmentsController {
  constructor(
    private readonly lessonAssessmentsService: LessonAssessmentsService,
  ) {}

  @Get("my-events")
  @Permissions("MANAGE_TEACHER_DAILY_AGENDA")
  @ApiOperation({
    summary: "Lista provas e trabalhos do professor para lançamento de notas",
  })
  findMyTeacherAssessments(@Query() query: ListMyTeacherAssessmentsDto) {
    return this.lessonAssessmentsService.findMyTeacherAssessments(query);
  }

  @Get("history")
  @Permissions("MANAGE_TEACHER_DAILY_AGENDA")
  @ApiOperation({
    summary:
      "Consulta o histórico de notas por matéria, turma e ano letivo do professor",
  })
  findTeacherGradeHistory(@Query() query: ListTeacherGradeHistoryDto) {
    return this.lessonAssessmentsService.findTeacherGradeHistory(query);
  }

  @Get("by-event/:lessonEventId")
  @Permissions("MANAGE_TEACHER_DAILY_AGENDA")
  @ApiOperation({
    summary: "Consulta a avaliação da aula e os alunos da turma",
  })
  findByLessonEvent(@Param("lessonEventId") lessonEventId: string) {
    return this.lessonAssessmentsService.findByLessonEvent(lessonEventId);
  }

  @Put("by-event/:lessonEventId")
  @Permissions("MANAGE_TEACHER_DAILY_AGENDA")
  @ApiOperation({ summary: "Cria ou atualiza notas da avaliação da aula" })
  upsertByLessonEvent(
    @Param("lessonEventId") lessonEventId: string,
    @Body() dto: UpsertLessonAssessmentDto,
  ) {
    return this.lessonAssessmentsService.upsertByLessonEvent(
      lessonEventId,
      dto,
    );
  }
}
