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
import { GuardiansService } from "../../application/services/guardians.service";
import { CreateGuardianDto } from "../../application/dto/create-guardian.dto";
import { UpdateGuardianDto } from "../../application/dto/update-guardian.dto";
import { LinkStudentGuardianDto } from "../../application/dto/link-student.dto";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { Permissions } from "../../../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  type ICurrentUser,
} from "../../../../common/decorators/current-user.decorator";
import { SetRecordActiveDto } from "../../../../common/dto/set-record-active.dto";

@ApiBearerAuth()
@ApiTags("Responsáveis (Pais / Mães / Etc)")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
@Controller("guardians")
export class GuardiansController {
  constructor(private readonly guardiansService: GuardiansService) {}

  @Post()
  @Permissions("MANAGE_GUARDIANS")
  @ApiOperation({
    summary: "Cadastra a Ficha Cadastral e Acesso PWA de um Adulto",
  })
  create(
    @Body() createGuardianDto: CreateGuardianDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.guardiansService.create(createGuardianDto, currentUser);
  }

  @Get()
  @Permissions("VIEW_GUARDIANS")
  @ApiOperation({ summary: "Lista os Responsáveis da Instituição" })
  findAll(@CurrentUser() currentUser: ICurrentUser) {
    return this.guardiansService.findAll(currentUser);
  }

  @Get("me")
  @Roles("RESPONSAVEL")
  @Permissions("VIEW_OWN_PROFILE")
  @ApiOperation({ summary: "Consulta o próprio cadastro do responsável logado" })
  findMe(@CurrentUser() currentUser: ICurrentUser) {
    return this.guardiansService.findMe(
      currentUser.userId,
      currentUser.tenantId,
      currentUser,
    );
  }

  @Get(":id")
  @Permissions("VIEW_GUARDIANS")
  @ApiOperation({ summary: "Resgata Ficha Cadastral de um Responsável" })
  findOne(@Param("id") id: string, @CurrentUser() currentUser: ICurrentUser) {
    return this.guardiansService.findOne(id, currentUser);
  }

  @Patch(":id")
  @Permissions("MANAGE_GUARDIANS")
  @ApiOperation({ summary: "Edita Telefones/Endereços/Senha do Responsável" })
  update(
    @Param("id") id: string,
    @Body() updateGuardianDto: UpdateGuardianDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.guardiansService.update(id, updateGuardianDto, currentUser);
  }

  @Patch(":id/status")
  @Permissions("MANAGE_GUARDIANS")
  @ApiOperation({ summary: "Ativa ou inativa logicamente o responsável" })
  setActiveStatus(
    @Param("id") id: string,
    @Body() setRecordActiveDto: SetRecordActiveDto,
  ) {
    return this.guardiansService.setActiveStatus(id, setRecordActiveDto.active);
  }

  @Delete(":id")
  @Permissions("MANAGE_GUARDIANS")
  @ApiOperation({ summary: "Soft Delete Permanente de um Responsável" })
  remove(@Param("id") id: string) {
    return this.guardiansService.remove(id);
  }

  @Post(":id/students")
  @Permissions("MANAGE_GUARDIANS", "MANAGE_STUDENTS")
  @ApiOperation({
    summary: "Amarra Formalmente um Aluno a este Responsável (Tabela Pivô)",
  })
  linkStudent(
    @Param("id") id: string,
    @Body() linkDto: LinkStudentGuardianDto,
  ) {
    return this.guardiansService.linkStudent(id, linkDto);
  }

  @Delete(":id/students/:studentId")
  @Permissions("MANAGE_GUARDIANS", "MANAGE_STUDENTS")
  @ApiOperation({ summary: "Desfaz a amarra entre o Responsável e o Aluno" })
  unlinkStudent(
    @Param("id") id: string,
    @Param("studentId") studentId: string,
  ) {
    return this.guardiansService.unlinkStudent(id, studentId);
  }
}
