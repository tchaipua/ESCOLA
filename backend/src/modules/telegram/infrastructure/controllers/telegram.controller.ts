import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../../../common/decorators/public.decorator";
import { Roles } from "../../../../common/decorators/roles.decorator";
import { TelegramService } from "../../application/services/telegram.service";

@ApiTags("Telegram")
@Controller("telegram")
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Public()
  @Post("webhook/:tenantId")
  @ApiOperation({ summary: "Recebe updates do webhook do Telegram" })
  handleWebhook(
    @Param("tenantId") tenantId: string,
    @Headers("x-telegram-bot-api-secret-token") secretToken: string | undefined,
    @Body() body: unknown,
  ) {
    return this.telegramService.handleWebhook(
      tenantId,
      secretToken,
      body as never,
    );
  }

  @ApiBearerAuth()
  @Roles("ADMIN", "SECRETARIA", "COORDENACAO")
  @Post("configure-webhook")
  @ApiOperation({ summary: "Configura o webhook do bot no Telegram" })
  configureWebhook() {
    return this.telegramService.configureWebhook();
  }

  @ApiBearerAuth()
  @Roles("ADMIN", "SECRETARIA", "COORDENACAO")
  @Get("webhook-status")
  @ApiOperation({ summary: "Consulta o webhook configurado no Telegram" })
  getWebhookStatus() {
    return this.telegramService.getWebhookStatus();
  }

  @ApiBearerAuth()
  @Roles("ADMIN", "SECRETARIA", "COORDENACAO")
  @Post("poll-updates")
  @ApiOperation({ summary: "Busca mensagens pendentes do Telegram por polling" })
  pollUpdates() {
    return this.telegramService.pollCurrentTenantUpdates();
  }
}
