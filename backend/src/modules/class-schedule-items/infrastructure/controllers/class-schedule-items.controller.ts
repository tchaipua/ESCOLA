import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import { Roles } from "../../../../common/decorators/roles.decorator";
import {
  CurrentUser,
  type ICurrentUser,
} from "../../../../common/decorators/current-user.decorator";
import { SetRecordActiveDto } from "../../../../common/dto/set-record-active.dto";
import { CreateClassScheduleItemDto } from "../../application/dto/create-class-schedule-item.dto";
import { UpdateClassScheduleItemDto } from "../../application/dto/update-class-schedule-item.dto";
import { ClassScheduleItemsService } from "../../application/services/class-schedule-items.service";

@ApiBearerAuth()
@ApiTags("Grade Horária Planejada")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("class-schedule-items")
export class ClassScheduleItemsController {
  constructor(
    private readonly classScheduleItemsService: ClassScheduleItemsService,
  ) {}

  @Post()
  @Permissions("MANAGE_CLASS_SCHEDULES")
  @ApiOperation({ summary: "Lança uma aula planejada na grade horária" })
  create(@Body() createDto: CreateClassScheduleItemDto) {
    return this.classScheduleItemsService.create(createDto);
  }

  @Get()
  @Permissions("VIEW_CLASS_SCHEDULES")
  @ApiOperation({ summary: "Lista a grade horária planejada da escola" })
  findAll() {
    return this.classScheduleItemsService.findAll();
  }

  @Get("me")
  @Roles("PROFESSOR", "ALUNO", "RESPONSAVEL")
  @Permissions("VIEW_OWN_SCHEDULE")
  @ApiOperation({ summary: "Consulta a grade própria do usuário logado" })
  findMine(@CurrentUser() currentUser: ICurrentUser) {
    return this.classScheduleItemsService.findMySchedule(
      currentUser.userId,
      currentUser.role,
    );
  }

  @Get(":id")
  @Permissions("VIEW_CLASS_SCHEDULES")
  @ApiOperation({ summary: "Consulta um lançamento específico da grade" })
  findOne(@Param("id") id: string) {
    return this.classScheduleItemsService.findOne(id);
  }

  @Patch(":id")
  @Permissions("MANAGE_CLASS_SCHEDULES")
  @ApiOperation({ summary: "Atualiza um lançamento da grade horária" })
  update(
    @Param("id") id: string,
    @Body() updateDto: UpdateClassScheduleItemDto,
  ) {
    return this.classScheduleItemsService.update(id, updateDto);
  }

  @Patch(":id/status")
  @Permissions("MANAGE_CLASS_SCHEDULES")
  @ApiOperation({ summary: "Ativa ou inativa logicamente um lançamento da grade horária" })
  setActiveStatus(
    @Param("id") id: string,
    @Body() setRecordActiveDto: SetRecordActiveDto,
  ) {
    return this.classScheduleItemsService.setActiveStatus(id, setRecordActiveDto.active);
  }

  @Delete(":id")
  @Permissions("MANAGE_CLASS_SCHEDULES")
  @ApiOperation({ summary: "Exclui fisicamente um lançamento da grade horária" })
  remove(@Param("id") id: string) {
    return this.classScheduleItemsService.remove(id);
  }
}
