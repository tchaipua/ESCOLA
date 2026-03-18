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

export class CreateTeacherDto {
  @ApiProperty({ description: "Nome do Professor" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() birthDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() rg?: string;
  @ApiPropertyOptional({ description: "CPF do Professor" })
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

  @ApiPropertyOptional({ description: "Login do Gestor/App do Professor" })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: "Senha de Acesso ao PWA" })
  @IsString()
  @MinLength(4)
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({ description: "Perfil de acesso pré-definido do professor" })
  @IsString()
  @IsOptional()
  accessProfile?: string;

  @ApiPropertyOptional({ description: "Permissões específicas que sobrescrevem o perfil", type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsOptional()
  permissions?: string[];

  @ApiPropertyOptional() @IsString() @IsOptional() zipCode?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() street?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() number?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() city?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() state?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() neighborhood?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() complement?: string;
}
