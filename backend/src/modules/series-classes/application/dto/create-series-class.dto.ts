import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CreateSeriesClassDto {
  @ApiPropertyOptional({
    description:
      "Filial do cadastro. Use 0 para comum a todas as filiais quando houver mais de uma.",
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  branchCode?: number;

  @ApiProperty({ description: "ID da série" })
  @IsUUID()
  @IsNotEmpty()
  seriesId!: string;

  @ApiProperty({ description: "ID da turma" })
  @IsUUID()
  @IsNotEmpty()
  classId!: string;

  @ApiPropertyOptional({ description: "Usa SMTP específico desta turma" })
  @IsBoolean()
  @IsOptional()
  smtpEnabled?: boolean;

  @ApiPropertyOptional({ description: "Servidor SMTP da turma" })
  @IsString()
  @IsOptional()
  smtpHost?: string;

  @ApiPropertyOptional({ description: "Porta SMTP da turma" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  smtpPort?: number;

  @ApiPropertyOptional({ description: "Timeout SMTP em segundos" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  smtpTimeout?: number;

  @ApiPropertyOptional({ description: "Exige autenticação SMTP" })
  @IsBoolean()
  @IsOptional()
  smtpAuthenticate?: boolean;

  @ApiPropertyOptional({ description: "Usa conexão segura SSL/TLS" })
  @IsBoolean()
  @IsOptional()
  smtpSecure?: boolean;

  @ApiPropertyOptional({ description: "Tipo de autenticação SMTP" })
  @IsString()
  @IsOptional()
  smtpAuthType?: string;

  @ApiPropertyOptional({ description: "E-mail remetente SMTP da turma" })
  @IsEmail()
  @IsOptional()
  smtpEmail?: string;

  @ApiPropertyOptional({ description: "Senha SMTP/App password da turma" })
  @IsString()
  @IsOptional()
  smtpPassword?: string;

  @ApiPropertyOptional({ description: "Nome do remetente dos e-mails da turma" })
  @IsString()
  @IsOptional()
  smtpSenderName?: string;

  @ApiPropertyOptional({ description: "E-mail de resposta da turma" })
  @IsEmail()
  @IsOptional()
  smtpReplyTo?: string;
}
