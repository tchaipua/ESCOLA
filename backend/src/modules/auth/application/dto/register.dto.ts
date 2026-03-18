import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  MinLength,
  IsArray,
  ArrayUnique,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RegisterDto {
  @ApiProperty({ description: "Nome completo" })
  @IsString()
  @IsNotEmpty({ message: "Nome é obrigatório" })
  name!: string;

  @ApiProperty({ description: "Email corporativo" })
  @IsEmail({}, { message: "Email inválido" })
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ description: "Senha de acesso" })
  @IsString()
  @MinLength(6, { message: "A senha deve ter no mínimo 6 caracteres" })
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({
    description: "Nível de Permissão",
    default: "SECRETARIA",
  })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiPropertyOptional({
    description: "Perfil de acesso pré-definido",
  })
  @IsString()
  @IsOptional()
  accessProfile?: string;

  @ApiPropertyOptional({
    description: "Permissões granulares do usuário",
    type: [String],
  })
  @IsArray()
  @ArrayUnique()
  @IsOptional()
  permissions?: string[];

  @ApiPropertyOptional({
    description: "Perfis complementares acumuláveis (FINANCEIRO e CAIXA)",
    type: [String],
  })
  @IsArray()
  @ArrayUnique()
  @IsOptional()
  complementaryProfiles?: string[];
}
