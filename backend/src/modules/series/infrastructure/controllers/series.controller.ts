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
import { Roles } from "../../../../common/decorators/roles.decorator";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import { SeriesService } from "../../application/services/series.service";
import { CreateSeriesDto } from "../../application/dto/create-series.dto";
import { UpdateSeriesDto } from "../../application/dto/update-series.dto";
import { SetRecordActiveDto } from "../../../../common/dto/set-record-active.dto";

@ApiBearerAuth()
@ApiTags("Séries")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("series")
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Post()
  @Permissions("MANAGE_SERIES")
  @ApiOperation({ summary: "Cadastra uma nova série na escola" })
  create(@Body() createSeriesDto: CreateSeriesDto) {
    return this.seriesService.create(createSeriesDto);
  }

  @Get()
  @Permissions("VIEW_SERIES")
  @ApiOperation({ summary: "Lista as séries da escola" })
  findAll() {
    return this.seriesService.findAll();
  }

  @Get(":id")
  @Permissions("VIEW_SERIES")
  @ApiOperation({ summary: "Consulta uma série específica" })
  findOne(@Param("id") id: string) {
    return this.seriesService.findOne(id);
  }

  @Patch(":id")
  @Permissions("MANAGE_SERIES")
  @ApiOperation({ summary: "Atualiza uma série" })
  update(@Param("id") id: string, @Body() updateSeriesDto: UpdateSeriesDto) {
    return this.seriesService.update(id, updateSeriesDto);
  }

  @Patch(":id/status")
  @Permissions("MANAGE_SERIES")
  @ApiOperation({ summary: "Ativa ou inativa logicamente uma série" })
  setActiveStatus(
    @Param("id") id: string,
    @Body() setRecordActiveDto: SetRecordActiveDto,
  ) {
    return this.seriesService.setActiveStatus(id, setRecordActiveDto.active);
  }

  @Delete(":id")
  @Permissions("MANAGE_SERIES")
  @ApiOperation({ summary: "Desativa uma série" })
  remove(@Param("id") id: string) {
    return this.seriesService.remove(id);
  }
}
