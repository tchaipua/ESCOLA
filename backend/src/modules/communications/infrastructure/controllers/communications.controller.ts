import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentUser,
  type ICurrentUser,
} from "../../../../common/decorators/current-user.decorator";
import { CreateCommunicationCampaignDto } from "../../application/dto/create-communication-campaign.dto";
import { CommunicationsService } from "../../application/services/communications.service";

@ApiBearerAuth()
@ApiTags("Central de Comunicações")
@Controller("communications")
export class CommunicationsController {
  constructor(private readonly communicationsService: CommunicationsService) {}

  @Get("my-scope")
  @ApiOperation({ summary: "Retorna o escopo de públicos permitido para o usuário logado" })
  myScope(@CurrentUser() currentUser: ICurrentUser) {
    return this.communicationsService.getMyScope(currentUser);
  }

  @Get()
  @ApiOperation({ summary: "Lista os comunicados enviados no escopo do usuário logado" })
  list(@CurrentUser() currentUser: ICurrentUser) {
    return this.communicationsService.list(currentUser);
  }

  @Post()
  @ApiOperation({ summary: "Envia um comunicado por notificação interna e/ou e-mail" })
  create(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() createDto: CreateCommunicationCampaignDto,
  ) {
    return this.communicationsService.create(currentUser, createDto);
  }
}
