import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { CreateLessonCalendarDto } from "../../application/dto/create-lesson-calendar.dto";
import { FindSchoolCalendarEventsDto } from "../../application/dto/find-school-calendar-events.dto";
import { LessonCalendarWeeklySourceQueryDto } from "../../application/dto/lesson-calendar-weekly-source-query.dto";
import { UpdateLessonCalendarItemDto } from "../../application/dto/update-lesson-calendar-item.dto";
import { UpdateLessonCalendarDto } from "../../application/dto/update-lesson-calendar.dto";
import { LessonCalendarsService } from "../../application/services/lesson-calendars.service";
import { SetRecordActiveDto } from "../../../../common/dto/set-record-active.dto";

@ApiBearerAuth()
@ApiTags("Grade Anual")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("lesson-calendars")
export class LessonCalendarsController {
  constructor(
    private readonly lessonCalendarsService: LessonCalendarsService,
  ) {}

  @Post()
  @Permissions("MANAGE_LESSON_CALENDARS")
  @ApiOperation({ summary: "Cria a grade anual com períodos de aula e férias" })
  create(@Body() createDto: CreateLessonCalendarDto) {
    return this.lessonCalendarsService.create(createDto);
  }

  @Get()
  @Permissions("VIEW_LESSON_CALENDARS")
  @ApiOperation({ summary: "Lista as grades anuais cadastradas na escola" })
  findAll() {
    return this.lessonCalendarsService.findAll();
  }

  @Get("weekly-source")
  @Permissions("VIEW_LESSON_CALENDARS")
  @ApiOperation({ summary: "Busca novamente a grade semanal para montar a grade anual" })
  getWeeklySource(@Query() query: LessonCalendarWeeklySourceQueryDto) {
    return this.lessonCalendarsService.getWeeklySource(
      query.schoolYearId,
      query.seriesClassId,
    );
  }

  @Get("school-calendar-events")
  @Permissions("VIEW_LESSON_CALENDARS")
  @ApiOperation({ summary: "Lista provas e eventos da escola para o calendário anual" })
  findSchoolCalendarEvents(@Query() query: FindSchoolCalendarEventsDto) {
    return this.lessonCalendarsService.findSchoolCalendarEvents(query.referenceDate);
  }

  @Patch("items/:lessonCalendarItemId")
  @Permissions("MANAGE_LESSON_CALENDARS")
  @ApiOperation({ summary: "Atualiza somente uma aula já gerada no calendário anual" })
  updateLessonCalendarItem(
    @Param("lessonCalendarItemId") lessonCalendarItemId: string,
    @Body() updateDto: UpdateLessonCalendarItemDto,
  ) {
    return this.lessonCalendarsService.updateLessonCalendarItem(
      lessonCalendarItemId,
      updateDto,
    );
  }

  @Get(":id")
  @Permissions("VIEW_LESSON_CALENDARS")
  @ApiOperation({ summary: "Consulta uma grade anual específica" })
  findOne(@Param("id") id: string) {
    return this.lessonCalendarsService.findOne(id);
  }

  @Patch(":id")
  @Permissions("MANAGE_LESSON_CALENDARS")
  @ApiOperation({ summary: "Atualiza a grade anual e regenera o calendário" })
  update(@Param("id") id: string, @Body() updateDto: UpdateLessonCalendarDto) {
    return this.lessonCalendarsService.update(id, updateDto);
  }

  @Post(":id/refresh-weekly-source")
  @Permissions("MANAGE_LESSON_CALENDARS")
  @ApiOperation({ summary: "Busca novamente a grade semanal e regenera a grade anual" })
  refreshWeeklySource(@Param("id") id: string) {
    return this.lessonCalendarsService.refreshWeeklySource(id);
  }

  @Patch(":id/status")
  @Permissions("MANAGE_LESSON_CALENDARS")
  @ApiOperation({ summary: "Ativa ou inativa logicamente uma grade anual" })
  setActiveStatus(
    @Param("id") id: string,
    @Body() setRecordActiveDto: SetRecordActiveDto,
  ) {
    return this.lessonCalendarsService.setActiveStatus(id, setRecordActiveDto.active);
  }

  @Delete(":id")
  @Permissions("MANAGE_LESSON_CALENDARS")
  @ApiOperation({ summary: "Desativa uma grade anual" })
  remove(@Param("id") id: string) {
    return this.lessonCalendarsService.remove(id);
  }
}
