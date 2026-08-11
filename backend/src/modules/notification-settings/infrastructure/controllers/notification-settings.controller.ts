import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { NotificationSettingsService } from "../../application/services/notification-settings.service";
import { SendUserEmailConfirmationDto } from "../../application/dto/send-user-email-confirmation.dto";
import { UpdatePersonNotificationSettingsDto } from "../../application/dto/update-person-notification-settings.dto";
import { UpdateNotificationPreferencesDto } from "../../../notification-preferences/application/dto/update-notification-preferences.dto";

@ApiTags("Configurações de notificações por usuário")
@Controller("notification-settings")
@Roles("ADMIN", "SECRETARIA", "COORDENACAO")
export class NotificationSettingsController {
  constructor(
    private readonly notificationSettingsService: NotificationSettingsService,
  ) {}

  @Get("events")
  @ApiOperation({ summary: "Lista os eventos configuráveis por pessoa" })
  listNotificationEvents() {
    return this.notificationSettingsService.listNotificationEvents();
  }

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

  @Get("users/:personId/preferences")
  @ApiOperation({ summary: "Lista as preferências de eventos da pessoa" })
  getPersonNotificationPreferences(@Param("personId") personId: string) {
    return this.notificationSettingsService.getPersonNotificationPreferences(personId);
  }

  @Patch("users/:personId/preferences")
  @ApiOperation({ summary: "Atualiza as preferências de eventos da pessoa" })
  updatePersonNotificationPreferences(
    @Param("personId") personId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationSettingsService.updatePersonNotificationPreferences(
      personId,
      dto,
    );
  }
}
