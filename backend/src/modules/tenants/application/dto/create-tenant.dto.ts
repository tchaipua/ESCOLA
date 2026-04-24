import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateTenantDto {
  @ApiProperty({ description: "Nome da Escola / Inquilino" })
  @IsString()
  @IsNotEmpty({ message: "O nome da escola é obrigatório" })
  name!: string;

  @ApiPropertyOptional({ description: "CNPJ da Escola" })
  @IsString()
  @IsOptional()
  document?: string;

  @ApiPropertyOptional({ description: "Logotipo da escola em data URL" })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  // (DB) DADOS BÁSICOS
  @IsOptional() @IsString() rg?: string;
  @IsOptional() @IsString() cpf?: string;
  @IsOptional() @IsString() cnpj?: string;
  @IsOptional() @IsString() nickname?: string;
  @IsOptional() @IsString() corporateName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() whatsapp?: string;
  @IsOptional() @IsString() cellphone1?: string;
  @IsOptional() @IsString() cellphone2?: string;
  @IsOptional() @IsString() email?: string;

  // (EC) ENDEREÇO COMPLETO
  @IsOptional() @IsString() zipCode?: string;
  @IsOptional() @IsString() street?: string;
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() neighborhood?: string;
  @IsOptional() @IsString() complement?: string;

  // (DF) DADOS FINANCEIROS
  @IsOptional() interestRate?: number;
  @IsOptional() penaltyRate?: number;
  @IsOptional() penaltyValue?: number;
  @IsOptional() penaltyGracePeriod?: number;
  @IsOptional() interestGracePeriod?: number;

  // (SMTP) GATEWAY DE MENSAGERIA E EMAILS
  @IsOptional() @IsString() smtpHost?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) smtpPort?: number;
  @IsOptional() @IsInt() @Min(5) @Max(600) smtpTimeout?: number;
  @IsOptional() @IsBoolean() smtpAuthenticate?: boolean;
  @IsOptional() @IsBoolean() smtpSecure?: boolean;
  @IsOptional() @IsString() smtpAuthType?: string;
  @IsOptional() @IsString() smtpEmail?: string;
  @IsOptional() @IsString() smtpPassword?: string;

  @ApiProperty({ description: "Nome do primeiro Administrador" })
  @IsString()
  @IsNotEmpty({ message: "Nome do administrador é obrigatório" })
  adminName!: string;

  @ApiProperty({ description: "Email corporativo do Administrador" })
  @IsEmail({}, { message: "Email administrador inválido" })
  @IsNotEmpty()
  adminEmail!: string;

  @ApiPropertyOptional({ description: "Senha do Administrador" })
  @IsString()
  @MinLength(6, { message: "A senha do admin deve ter no mínimo 6 caracteres" })
  @IsOptional()
  adminPassword?: string;
}
