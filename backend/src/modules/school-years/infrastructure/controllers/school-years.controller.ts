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
import { SchoolYearsService } from "../../application/services/school-years.service";
import { CreateSchoolYearDto } from "../../application/dto/create-school-year.dto";
import { UpdateSchoolYearDto } from "../../application/dto/update-school-year.dto";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { Permissions } from "../../../../common/decorators/permissions.decorator";

@ApiBearerAuth() // Impõe cadeado de token na documentação SWAGGER automaticamente
@ApiTags("Anos Letivos (Temporadas / Semestres)")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("school-years")
export class SchoolYearsController {
  constructor(private readonly schoolYearsService: SchoolYearsService) {}

  @Post()
  @Permissions("MANAGE_SCHOOL_YEARS")
  @ApiOperation({ summary: "Abre um novo Calendário Acadêmico na Escola" })
  create(@Body() createSchoolYearDto: CreateSchoolYearDto) {
    return this.schoolYearsService.create(createSchoolYearDto);
  }

  @Get()
  @Permissions("VIEW_SCHOOL_YEARS")
  @ApiOperation({
    summary: "Lista todos os Anos Letivos registrados em sua Escola",
  })
  findAll() {
    return this.schoolYearsService.findAll();
  }

  @Get(":id")
  @Permissions("VIEW_SCHOOL_YEARS")
  @ApiOperation({
    summary: "Resgata dados detalhados de uma Temporada Específica",
  })
  findOne(@Param("id") id: string) {
    return this.schoolYearsService.findOne(id);
  }

  @Patch(":id")
  @Permissions("MANAGE_SCHOOL_YEARS")
  @ApiOperation({
    summary: "Atualiza o Ano ou Ativa retroativamente a temporada",
  })
  update(
    @Param("id") id: string,
    @Body() updateSchoolYearDto: UpdateSchoolYearDto,
  ) {
    return this.schoolYearsService.update(id, updateSchoolYearDto);
  }

  @Delete(":id")
  @Permissions("MANAGE_SCHOOL_YEARS")
  @ApiOperation({ summary: "Deleta o Ano Letivo e remove do menu (Perigoso)" })
  remove(@Param("id") id: string) {
    return this.schoolYearsService.remove(id);
  }
}
