import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { buildMasterPass } from "../../../../common/auth/master-auth";
import { Public } from "../../../../common/decorators/public.decorator";
import { UpdateGlobalSettingsDto } from "../../application/dto/update-global-settings.dto";
import { GlobalSettingsService } from "../../application/services/global-settings.service";

@ApiTags("Configurações Globais")
@Controller("global-settings")
export class GlobalSettingsController {
  constructor(private readonly globalSettingsService: GlobalSettingsService) {}

  private assertMasterPass(req: Request) {
    const incoming = String(req.headers["x-msinfor-master-pass"] || "").trim();
    if (!incoming) {
      throw new UnauthorizedException(
        "Acesso negado: cabeçalho master ausente.",
      );
    }

    const now = new Date();
    const prevMinute = new Date(now.getTime() - 60_000);
    const nextMinute = new Date(now.getTime() + 60_000);
    const validNow = buildMasterPass(now);
    const validPrev = buildMasterPass(prevMinute);
    const validNext = buildMasterPass(nextMinute);

    if (
      incoming !== validNow &&
      incoming !== validPrev &&
      incoming !== validNext
    ) {
      throw new UnauthorizedException(
        "Acesso negado: chave master inválida ou expirada.",
      );
    }
  }

  @Public()
  @Get()
  @ApiOperation({ summary: "Retorna as configurações globais da softhouse" })
  async findSettings(@Req() req: Request) {
    this.assertMasterPass(req);
    return this.globalSettingsService.findSettings();
  }

  @Public()
  @Put()
  @ApiOperation({ summary: "Salva as configurações globais da softhouse" })
  async saveSettings(
    @Req() req: Request,
    @Body() payload: UpdateGlobalSettingsDto,
  ) {
    this.assertMasterPass(req);
    return this.globalSettingsService.saveSettings(payload);
  }

  @Public()
  @Post("test-s3")
  @ApiOperation({ summary: "Testa a comunicação com o S3 global da softhouse" })
  async testS3Connection(
    @Req() req: Request,
    @Body() payload: UpdateGlobalSettingsDto,
  ) {
    this.assertMasterPass(req);
    return this.globalSettingsService.testS3Connection(payload);
  }
}
