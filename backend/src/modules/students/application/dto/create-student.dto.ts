import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  IsString,
  ArrayUnique,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateStudentDto {
  /* ===============================
       DADOS BÁSICOS (DB)
    =============================== */
  @ApiProperty({ description: "Nome completo da criança / estudante" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: "Foto do aluno em data URL" })
  @IsString()
  @IsOptional()
  photoUrl?: string;

  @ApiPropertyOptional({
    description: "Data de nascimento do aluno (ISO 8601)",
  })
  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() rg?: string;
  @ApiPropertyOptional({ description: "Identificador Único" })
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

  @ApiPropertyOptional() @IsEmail() @IsOptional() email?: string;
  @ApiPropertyOptional({ description: "Valor da mensalidade do aluno" })
  @IsNumber()
  @IsOptional()
  monthlyFee?: number | null;
  @ApiPropertyOptional({ description: "Observações gerais do aluno" })
  @IsString()
  @IsOptional()
  notes?: string;
  @ApiPropertyOptional({ description: "Senha para acesso ao PWA Futuro" })
  @IsString()
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({ description: "Perfil de acesso pré-definido do aluno" })
  @IsString()
  @IsOptional()
  accessProfile?: string;

  @ApiPropertyOptional({ description: "Permissões específicas que sobrescrevem o perfil", type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsOptional()
  permissions?: string[];

  /* ===============================
       ENDEREÇO COMPLETO (EC)
    =============================== */
  @ApiPropertyOptional() @IsString() @IsOptional() zipCode?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() street?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() number?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() city?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() state?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() neighborhood?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() complement?: string;
}
