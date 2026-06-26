import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEmail, IsOptional, IsString } from "class-validator";

export class UpdatePersonNotificationSettingsDto {
  @ApiPropertyOptional({ description: "E-mail oficial da pessoa" })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: "ID do chat da pessoa no Telegram" })
  @IsString()
  @IsOptional()
  telegramChatId?: string;

  @ApiPropertyOptional({ description: "Usuário da pessoa no Telegram" })
  @IsString()
  @IsOptional()
  telegramUsername?: string;

  @ApiPropertyOptional({
    description: "Indica se a pessoa autorizou receber Telegram",
  })
  @IsBoolean()
  @IsOptional()
  telegramOptInEnabled?: boolean;
}
