import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { NotificationSettingsService } from "../../application/services/notification-settings.service";
import { SendUserEmailConfirmationDto } from "../../application/dto/send-user-email-confirmation.dto";
import { UpdatePersonNotificationSettingsDto } from "../../application/dto/update-person-notification-settings.dto";

@ApiBearerAuth()
@ApiTags("Configurações de notificações por usuário")
@Controller("notification-settings")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
export class NotificationSettingsController {
  constructor(
    private readonly notificationSettingsService: NotificationSettingsService,
  ) {}

  @Get("users")
  @ApiOperation({
    summary: "Lista usuários/pessoas com status de e-mail e Telegram",
  })
  listUsers() {
    return this.notificationSettingsService.listUsers();
  }

  @Post("users/send-email-confirmation")
  @ApiOperation({
    summary: "Envia link de confirmação para validar o e-mail informado",
  })
  sendEmailConfirmation(@Body() dto: SendUserEmailConfirmationDto) {
    return this.notificationSettingsService.sendEmailConfirmation(dto.email);
  }

  @Patch("users/:personId")
  @ApiOperation({
    summary: "Atualiza e-mail e Telegram da pessoa central",
  })
  updatePersonNotificationSettings(
    @Param("personId") personId: string,
    @Body() dto: UpdatePersonNotificationSettingsDto,
  ) {
    return this.notificationSettingsService.updatePersonNotificationSettings(
      personId,
      dto,
    );
  }
}
