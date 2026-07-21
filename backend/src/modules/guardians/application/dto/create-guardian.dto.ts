import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  MinLength,
  ArrayUnique,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";

export class CreateGuardianDto {
  /* ===============================
       DADOS BÁSICOS (DB)
    =============================== */
  @ApiProperty({ description: "Nome completo do Responsável" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: "Data de nascimento (ISO 8601)" })
  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() rg?: string;
  @ApiPropertyOptional({ description: "CPF Unico" })
  @IsString()
  @IsOptional()
  cpf?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() cnpj?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() nickname?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() corporateName?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() whatsapp?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() cellphone1?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() cellphone2?: string;

  @ApiPropertyOptional({ description: "E-mail para acesso futuro ao APP" })
  @Transform(({ value }) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  )
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: "ID do chat do responsável no Telegram" })
  @IsString()
  @IsOptional()
  telegramChatId?: string;

  @ApiPropertyOptional({ description: "Usuário do responsável no Telegram" })
  @IsString()
  @IsOptional()
  telegramUsername?: string;

  @ApiPropertyOptional({
    description: "Indica se o responsável autorizou receber Telegram",
  })
  @IsBoolean()
  @IsOptional()
  telegramOptInEnabled?: boolean;

  @ApiPropertyOptional({
    description: "Senha de Acesso ao PWA (Min: 4 caracteres)",
  })
  @IsString()
  @MinLength(4)
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({
    description: "Perfil de acesso pré-definido do responsável",
  })
  @IsString()
  @IsOptional()
  accessProfile?: string;

  @ApiPropertyOptional({
    description: "Permissões específicas que sobrescrevem o perfil",
    type: [String],
  })
  @IsArray()
  @ArrayUnique()
  @IsOptional()
  permissions?: string[];

  /* ===============================
       ENDEREÇO COMPLETO (EC)
    =============================== */
  @ApiPropertyOptional({
    description: "CEP (Com ou sem máscara, busca automática)",
  })
  @IsString()
  @IsOptional()
  zipCode?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() street?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() number?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() city?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() state?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() neighborhood?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() complement?: string;

  @ApiPropertyOptional({
    description:
      "Filial do cadastro. Use 0 para comum a todas as filiais quando houver mais de uma.",
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  branchCode?: number;

  @ApiPropertyOptional({
    description:
      "Filiais liberadas para uso deste responsável. Envie vazio para todas as filiais.",
    type: [Number],
  })
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  branchAccessCodes?: number[];
}
