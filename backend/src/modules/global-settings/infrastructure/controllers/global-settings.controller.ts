import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  GoneException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { Public } from "../../../../common/decorators/public.decorator";
import { UpdateGlobalSettingsDto } from "../../application/dto/update-global-settings.dto";
import { GlobalSettingsService } from "../../application/services/global-settings.service";
import { Throttle } from "@nestjs/throttler";

@ApiTags("Configurações Globais")
@Throttle({ default: { limit: 6, ttl: 60_000 } })
@Controller("global-settings")
export class GlobalSettingsController {
  constructor(private readonly globalSettingsService: GlobalSettingsService) {}

  private assertMasterPass(_req: Request): never {
    throw new GoneException(
      "Rota administrativa legada desativada. Use o MSINFOR Central.",
    );
  }

  @Public()
  @Get()
  @ApiOperation({ summary: "Retorna as configurações globais da softhouse" })
  async findSettings(@Req() req: Request) {
    const masterPass = this.assertMasterPass(req);
    return this.globalSettingsService.findSettingsForAdmin(masterPass);
  }

  @Public()
  @Put()
  @ApiOperation({ summary: "Salva as configurações globais da softhouse" })
  async saveSettings(
    @Req() req: Request,
    @Body() payload: UpdateGlobalSettingsDto,
  ) {
    const masterPass = this.assertMasterPass(req);
    return this.globalSettingsService.saveSettings(payload, masterPass);
  }

  @Public()
  @Post("test-s3")
  @ApiOperation({ summary: "Testa a comunicação com o S3 global da softhouse" })
  async testS3Connection(
    @Req() req: Request,
    @Body() payload: UpdateGlobalSettingsDto,
  ) {
    const masterPass = this.assertMasterPass(req);
    return this.globalSettingsService.testS3Connection(payload, masterPass);
  }

  @Public()
  @Post("test-email")
  @ApiOperation({
    summary: "Testa as credenciais SMTP globais da softhouse",
  })
  async testEmailConnection(
    @Req() req: Request,
    @Body() payload: UpdateGlobalSettingsDto,
  ) {
    const masterPass = this.assertMasterPass(req);
    return this.globalSettingsService.testEmailConnection(payload, masterPass);
  }
}
