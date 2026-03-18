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
import { Roles } from "../../../../common/decorators/roles.decorator";
import { LessonEventsService } from "../../application/services/lesson-events.service";
import { CreateLessonEventDto } from "../../application/dto/create-lesson-event.dto";
import { UpdateLessonEventDto } from "../../application/dto/update-lesson-event.dto";
import { FindMyTeacherAgendaDto } from "../../application/dto/find-my-teacher-agenda.dto";
import { FindMyTeacherCalendarDto } from "../../application/dto/find-my-teacher-calendar.dto";

@ApiBearerAuth()
@ApiTags("Agenda Diária do Professor")
@Roles("PROFESSOR")
@Controller("lesson-events")
export class LessonEventsController {
  constructor(private readonly lessonEventsService: LessonEventsService) {}

  @Get("my-calendar")
  @ApiOperation({ summary: "Consulta a agenda expandida do professor logado por período" })
  findMyCalendar(@Query() query: FindMyTeacherCalendarDto) {
    return this.lessonEventsService.findMyCalendar(query);
  }

  @Get("my-agenda")
  @ApiOperation({ summary: "Consulta a agenda diária do professor logado" })
  findMyAgenda(@Query() query: FindMyTeacherAgendaDto) {
    return this.lessonEventsService.findMyAgenda(query);
  }

  @Post()
  @ApiOperation({ summary: "Lança prova, trabalho, recado ou falta sobre uma aula do professor" })
  create(@Body() createDto: CreateLessonEventDto) {
    return this.lessonEventsService.create(createDto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Atualiza um evento da agenda diária do professor" })
  update(@Param("id") id: string, @Body() updateDto: UpdateLessonEventDto) {
    return this.lessonEventsService.update(id, updateDto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Desativa um evento da agenda diária do professor" })
  remove(@Param("id") id: string) {
    return this.lessonEventsService.remove(id);
  }
}
