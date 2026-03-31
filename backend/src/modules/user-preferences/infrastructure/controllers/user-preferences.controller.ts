import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentUser,
  type ICurrentUser,
} from "../../../../common/decorators/current-user.decorator";
import { UpsertUserPreferenceDto } from "../../application/dto/upsert-user-preference.dto";
import { UserPreferencesService } from "../../application/services/user-preferences.service";

@ApiBearerAuth()
@ApiTags("Preferências do Usuário")
@Controller("user-preferences")
export class UserPreferencesController {
  constructor(
    private readonly userPreferencesService: UserPreferencesService,
  ) {}

  @Get(":key")
  @ApiOperation({
    summary: "Busca uma preferência da tela para o usuário logado",
  })
  findOne(@Param("key") key: string, @CurrentUser() currentUser: ICurrentUser) {
    return this.userPreferencesService.findOne(currentUser, key);
  }

  @Put(":key")
  @ApiOperation({
    summary: "Salva ou atualiza uma preferência da tela para o usuário logado",
  })
  upsert(
    @Param("key") key: string,
    @Body() upsertUserPreferenceDto: UpsertUserPreferenceDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.userPreferencesService.upsert(
      currentUser,
      key,
      upsertUserPreferenceDto.value,
    );
  }
}
