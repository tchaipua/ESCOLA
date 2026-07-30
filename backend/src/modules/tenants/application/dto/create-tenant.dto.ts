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
  IsNumber,
  Matches,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

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

  @ApiPropertyOptional({ description: "Dados da primeira filial operacional" })
  @IsOptional()
  defaultBranch?: Partial<CreateTenantDto>;

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

  // (TELEGRAM) BOT DE MENSAGERIA
  @IsOptional() @IsBoolean() telegramEnabled?: boolean;
  @IsOptional() @IsString() telegramBotToken?: string;
  @IsOptional() @IsString() telegramBotUsername?: string;

  // (STORAGE) ARQUIVOS / S3 COMPATIVEL
  @IsOptional() @IsString() storageProviderAccessKeyId?: string;
  @IsOptional() @IsString() storageProviderSecretAccessKey?: string;
  @IsOptional() @IsString() storageBucketName?: string;
  @IsOptional() @IsString() storageFolderName?: string;
  @IsOptional() @IsString() storageDefaultAcl?: string;
  @IsOptional() @IsInt() @Min(1) storageDefaultExpiration?: number;
  @IsOptional() @IsString() storageRegion?: string;
  @IsOptional() @IsString() storageEndpoint?: string;
  @IsOptional() @IsString() storageCustomEndpoint?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) storageCapacityGb?: number;
  @IsOptional() @IsString() storageImagesFolderName?: string;
  @IsOptional() @IsString() storageDescription?: string;

  @ApiProperty({ description: "Nome do primeiro Administrador" })
  @IsString()
  @IsNotEmpty({ message: "Nome do administrador é obrigatório" })
  adminName!: string;

  @ApiProperty({ description: "Email corporativo do Administrador" })
  @IsEmail({}, { message: "Email administrador inválido" })
  @IsNotEmpty()
  adminEmail!: string;

  @ApiProperty({ description: "Senha forte do Administrador" })
  @IsString()
  @IsNotEmpty({ message: "Senha do administrador é obrigatória" })
  @MinLength(12, { message: "A senha do admin deve ter no mínimo 12 caracteres" })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message:
      "A senha do admin deve conter maiúscula, minúscula, número e símbolo",
  })
  adminPassword!: string;
}
