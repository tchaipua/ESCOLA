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
import { SeriesClassesService } from "../../application/services/series-classes.service";
import { CreateSeriesClassDto } from "../../application/dto/create-series-class.dto";
import { UpdateSeriesClassDto } from "../../application/dto/update-series-class.dto";

@ApiBearerAuth()
@ApiTags("Série x Turma")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("series-classes")
export class SeriesClassesController {
  constructor(private readonly seriesClassesService: SeriesClassesService) {}

  @Post()
  @Permissions("MANAGE_SERIES_CLASSES")
  @ApiOperation({ summary: "Cria um vínculo entre série e turma" })
  create(@Body() createSeriesClassDto: CreateSeriesClassDto) {
    return this.seriesClassesService.create(createSeriesClassDto);
  }

  @Get()
  @Permissions("VIEW_SERIES_CLASSES")
  @ApiOperation({ summary: "Lista os vínculos de série x turma" })
  findAll(@CurrentUser() currentUser: ICurrentUser) {
    return this.seriesClassesService.findAll(currentUser);
  }

  @Get(":id")
  @Permissions("VIEW_SERIES_CLASSES")
  @ApiOperation({ summary: "Consulta um vínculo específico de série x turma" })
  findOne(@Param("id") id: string, @CurrentUser() currentUser: ICurrentUser) {
    return this.seriesClassesService.findOne(id, currentUser);
  }

  @Get("series/:seriesId/students")
  @Permissions("VIEW_SERIES_CLASSES")
  @ApiOperation({ summary: "Lista os alunos que pertencem a uma série" })
  findSeriesStudents(@Param("seriesId") seriesId: string, @CurrentUser() currentUser: ICurrentUser) {
    return this.seriesClassesService.findSeriesStudents(seriesId, currentUser);
  }

  @Patch(":id")
  @Permissions("MANAGE_SERIES_CLASSES")
  @ApiOperation({ summary: "Atualiza um vínculo de série x turma" })
  update(
    @Param("id") id: string,
    @Body() updateSeriesClassDto: UpdateSeriesClassDto,
  ) {
    return this.seriesClassesService.update(id, updateSeriesClassDto);
  }

  @Patch(":id/status")
  @Permissions("MANAGE_SERIES_CLASSES")
  @ApiOperation({ summary: "Ativa ou inativa logicamente um vínculo de série x turma" })
  setActiveStatus(
    @Param("id") id: string,
    @Body() setRecordActiveDto: SetRecordActiveDto,
  ) {
    return this.seriesClassesService.setActiveStatus(id, setRecordActiveDto.active);
  }

  @Delete(":id")
  @Permissions("MANAGE_SERIES_CLASSES")
  @ApiOperation({ summary: "Desativa um vínculo de série x turma" })
  remove(@Param("id") id: string) {
    return this.seriesClassesService.remove(id);
  }
}
