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
import { SchedulesService } from "../../application/services/schedules.service";
import { CreateScheduleDto } from "../../application/dto/create-schedule.dto";
import { UpdateScheduleDto } from "../../application/dto/update-schedule.dto";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import { SetRecordActiveDto } from "../../../../common/dto/set-record-active.dto";

@ApiBearerAuth()
@ApiTags("Horários Base")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("schedules")
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Post()
  @Permissions("MANAGE_SCHEDULES")
  @ApiOperation({
    summary: "Cadastra um horário base por período e número da aula",
  })
  create(@Body() createScheduleDto: CreateScheduleDto) {
    return this.schedulesService.create(createScheduleDto);
  }

  @Get()
  @Permissions("VIEW_SCHEDULES")
  @ApiOperation({
    summary: "Lista todos os horários base da instituição",
  })
  findAll() {
    return this.schedulesService.findAll();
  }

  @Get(":id")
  @Permissions("VIEW_SCHEDULES")
  @ApiOperation({ summary: "Consulta um horário base específico" })
  findOne(@Param("id") id: string) {
    return this.schedulesService.findOne(id);
  }

  @Patch(":id")
  @Permissions("MANAGE_SCHEDULES")
  @ApiOperation({ summary: "Edita o período, número ou faixa de horário" })
  update(
    @Param("id") id: string,
    @Body() updateScheduleDto: UpdateScheduleDto,
  ) {
    return this.schedulesService.update(id, updateScheduleDto);
  }

  @Patch(":id/status")
  @Permissions("MANAGE_SCHEDULES")
  @ApiOperation({ summary: "Ativa ou inativa logicamente um horário base" })
  setActiveStatus(
    @Param("id") id: string,
    @Body() setRecordActiveDto: SetRecordActiveDto,
  ) {
    return this.schedulesService.setActiveStatus(id, setRecordActiveDto.active);
  }

  @Delete(":id")
  @Permissions("MANAGE_SCHEDULES")
  @ApiOperation({ summary: "Desativa um horário base" })
  remove(@Param("id") id: string) {
    return this.schedulesService.remove(id);
  }
}
