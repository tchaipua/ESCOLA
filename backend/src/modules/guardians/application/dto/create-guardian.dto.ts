import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsString,
  MinLength,
  ArrayUnique,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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
  @IsEmail()
  @IsOptional()
  email?: string;

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
}
