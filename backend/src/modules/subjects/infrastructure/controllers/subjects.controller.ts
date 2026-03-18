import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { SubjectsService } from "../../application/services/subjects.service";
import { CreateSubjectDto } from "../../application/dto/create-subject.dto";
import { UpdateSubjectDto } from "../../application/dto/update-subject.dto";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import { SetRecordActiveDto } from "../../../../common/dto/set-record-active.dto";

@ApiBearerAuth()
@ApiTags("Matérias Curriculares")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("subjects")
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  @Permissions("MANAGE_SUBJECTS")
  @ApiOperation({ summary: "Cadastra nova Matéria/Disciplina na Escola" })
  create(@Body() createSubjectDto: CreateSubjectDto) {
    return this.subjectsService.create(createSubjectDto);
  }

  @Get()
  @Permissions("VIEW_SUBJECTS")
  @ApiOperation({ summary: "Lista as matérias" })
  findAll(@Query("activeOnly") activeOnly?: string) {
    return this.subjectsService.findAll({
      activeOnly:
        activeOnly === "1" ||
        activeOnly === "true" ||
        activeOnly === "TRUE",
    });
  }

  @Get(":id")
  @Permissions("VIEW_SUBJECTS")
  @ApiOperation({ summary: "Consulta 1 matéria" })
  findOne(@Param("id") id: string) {
    return this.subjectsService.findOne(id);
  }

  @Patch(":id")
  @Permissions("MANAGE_SUBJECTS")
  @ApiOperation({ summary: "Edita nome" })
  update(@Param("id") id: string, @Body() updateSubjectDto: UpdateSubjectDto) {
    return this.subjectsService.update(id, updateSubjectDto);
  }

  @Patch(":id/status")
  @Permissions("MANAGE_SUBJECTS")
  @ApiOperation({ summary: "Ativa ou inativa logicamente a matéria" })
  setActiveStatus(
    @Param("id") id: string,
    @Body() setRecordActiveDto: SetRecordActiveDto,
  ) {
    return this.subjectsService.setActiveStatus(id, setRecordActiveDto.active);
  }

  @Delete(":id")
  @Permissions("MANAGE_SUBJECTS")
  @ApiOperation({ summary: "Soft Delete da matéria" })
  remove(@Param("id") id: string) {
    return this.subjectsService.remove(id);
  }
}
