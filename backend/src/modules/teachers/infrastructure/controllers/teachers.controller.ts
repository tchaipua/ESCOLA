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
import { TeachersService } from "../../application/services/teachers.service";
import { CreateTeacherDto } from "../../application/dto/create-teacher.dto";
import { UpdateTeacherDto } from "../../application/dto/update-teacher.dto";
import { SetTeacherActiveDto } from "../../application/dto/set-teacher-active.dto";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  type ICurrentUser,
} from "../../../../common/decorators/current-user.decorator";

@ApiBearerAuth()
@ApiTags("Professores (Equip Docente)")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("teachers")
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Post()
  @Permissions("MANAGE_TEACHERS")
  @ApiOperation({ summary: "Cadastra Professor com Endereço e Acesso PWA" })
  create(
    @Body() createTeacherDto: CreateTeacherDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.teachersService.create(createTeacherDto, currentUser);
  }

  @Get()
  @Permissions("VIEW_TEACHERS")
  @ApiOperation({
    summary: "Lista os Professores e as disciplinas pagas a ele",
  })
  findAll(@CurrentUser() currentUser: ICurrentUser) {
    return this.teachersService.findAll(currentUser);
  }

  @Get("me")
  @Roles("PROFESSOR")
  @Permissions("VIEW_OWN_PROFILE")
  @ApiOperation({ summary: "Consulta o próprio cadastro do professor logado" })
  findMe(@CurrentUser() currentUser: ICurrentUser) {
    return this.teachersService.findMe(
      currentUser.userId,
      currentUser.tenantId,
      currentUser,
    );
  }

  @Get(":id")
  @Permissions("VIEW_TEACHERS")
  @ApiOperation({ summary: "Consulta a ficha do funcionário" })
  findOne(@Param("id") id: string, @CurrentUser() currentUser: ICurrentUser) {
    return this.teachersService.findOne(id, currentUser);
  }

  @Patch(":id")
  @Permissions("MANAGE_TEACHERS")
  @ApiOperation({ summary: "Edita Telefones/Endereços/Senha do Prof" })
  update(
    @Param("id") id: string,
    @Body() updateTeacherDto: UpdateTeacherDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.teachersService.update(id, updateTeacherDto, currentUser);
  }

  @Patch(":id/status")
  @Permissions("MANAGE_TEACHERS")
  @ApiOperation({ summary: "Ativa ou inativa logicamente o professor" })
  setActiveStatus(
    @Param("id") id: string,
    @Body() setTeacherActiveDto: SetTeacherActiveDto,
  ) {
    return this.teachersService.setActiveStatus(id, setTeacherActiveDto.active);
  }

  @Delete(":id")
  @Permissions("MANAGE_TEACHERS")
  @ApiOperation({ summary: "Soft Delete" })
  remove(@Param("id") id: string) {
    return this.teachersService.remove(id);
  }
}
