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
import { ClassesService } from "../../application/services/classes.service";
import { CreateClassDto } from "../../application/dto/create-class.dto";
import { UpdateClassDto } from "../../application/dto/update-class.dto";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import { SetRecordActiveDto } from "../../../../common/dto/set-record-active.dto";

@ApiBearerAuth()
@ApiTags("Turmas (Salas de Aula)")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("classes")
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  @Permissions("MANAGE_CLASSES")
  @ApiOperation({
    summary: "Abre uma nova Sala de Aula vinculada a um Ano Letivo",
  })
  create(@Body() createClassDto: CreateClassDto) {
    return this.classesService.create(createClassDto);
  }

  @Get()
  @Permissions("VIEW_CLASSES")
  @ApiOperation({ summary: "Lista as Turmas cadastradas na escola" })
  findAll() {
    return this.classesService.findAll();
  }

  @Get(":id")
  @Permissions("VIEW_CLASSES")
  @ApiOperation({ summary: "Resgata dados rápidos de uma Turma Específica" })
  findOne(@Param("id") id: string) {
    return this.classesService.findOne(id);
  }

  @Patch(":id")
  @Permissions("MANAGE_CLASSES")
  @ApiOperation({ summary: "Atualiza o Nome, Turno ou Nível de uma Sala" })
  update(@Param("id") id: string, @Body() updateClassDto: UpdateClassDto) {
    return this.classesService.update(id, updateClassDto);
  }

  @Patch(":id/status")
  @Permissions("MANAGE_CLASSES")
  @ApiOperation({ summary: "Ativa ou inativa logicamente a turma base" })
  setActiveStatus(
    @Param("id") id: string,
    @Body() setRecordActiveDto: SetRecordActiveDto,
  ) {
    return this.classesService.setActiveStatus(id, setRecordActiveDto.active);
  }

  @Delete(":id")
  @Permissions("MANAGE_CLASSES")
  @ApiOperation({
    summary:
      "Deleta uma Turma inteira (Apenas se não houver Alunos atrelados!)",
  })
  remove(@Param("id") id: string) {
    return this.classesService.remove(id);
  }
}
