import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { SharedProfilesService } from "../../application/services/shared-profiles.service";
import { getTenantContext } from "../../../../common/tenant/tenant.context";

@ApiBearerAuth()
@ApiTags("Dados Compartilhados por CPF")
@Controller("shared-profiles")
export class SharedProfilesController {
  constructor(
    private readonly sharedProfilesService: SharedProfilesService,
  ) {}

  @Get("cpf/:cpf")
  @Roles("ADMIN", "SECRETARIA", "COORDENACAO", "USER", "USUARIO_ESCOLA")
  @ApiOperation({
    summary:
      "Busca os dados compartilháveis por CPF, incluindo papéis acadêmicos e administrativos vinculados",
  })
  async findByCpf(@Param("cpf") cpf: string) {
    const profile = await this.sharedProfilesService.findSharedProfileByCpf(
      getTenantContext()!.tenantId,
      cpf,
    );

    if (!profile) {
      throw new NotFoundException("Nenhum cadastro compartilhável encontrado.");
    }

    return profile;
  }

  @Get("email/:email")
  @Roles("ADMIN", "SECRETARIA", "COORDENACAO", "USER", "USUARIO_ESCOLA")
  @ApiOperation({
    summary:
      "Busca os dados compartilháveis por e-mail, incluindo papéis acadêmicos e administrativos vinculados",
  })
  async findByEmail(@Param("email") email: string) {
    const profile = await this.sharedProfilesService.findSharedProfileByEmail(
      getTenantContext()!.tenantId,
      email,
    );

    if (!profile) {
      throw new NotFoundException("Nenhum cadastro compartilhável encontrado.");
    }

    return profile;
  }

  @Get("name-suggestions/:name")
  @ApiOperation({
    summary:
      "Sugere nomes já cadastrados com busca tolerante a acentos e abreviações",
  })
  async findNameSuggestionsByParam(
    @Param("name") name: string,
    @Query("limit") limit?: string,
  ) {
    return this.sharedProfilesService.findNameSuggestions(
      getTenantContext()!.tenantId,
      name,
      limit ? Number(limit) : undefined,
    );
  }

  @Get("name-suggestions")
  @ApiOperation({
    summary:
      "Sugere nomes já cadastrados com busca tolerante a acentos e abreviações",
  })
  async findNameSuggestionsByQuery(
    @Query("name") name?: string,
    @Query("limit") limit?: string,
  ) {
    return this.sharedProfilesService.findNameSuggestions(
      getTenantContext()!.tenantId,
      name,
      limit ? Number(limit) : undefined,
    );
  }
}
