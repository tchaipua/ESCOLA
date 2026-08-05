import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  MaxLength,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CreateUserDto {
  @ApiProperty({ description: "Nome completo do funcionário/usuário" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: "E-mail usado no login do sistema" })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ description: "Usuário livre usado no login do sistema" })
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  @Matches(/^\S+$/u, { message: "O usuário de acesso não pode conter espaços." })
  @IsOptional()
  accessUsername?: string | null;

  @ApiPropertyOptional({ description: "Senha inicial da conta" })
  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional() birthDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() rg?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() cpf?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() cnpj?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() nickname?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() corporateName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() whatsapp?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() cellphone1?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() cellphone2?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() zipCode?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() street?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() number?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() city?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() state?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() neighborhood?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() complement?: string;

  @ApiPropertyOptional({ enum: ["ADMIN", "SECRETARIA", "COORDENACAO"] })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  accessProfile?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  permissions?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  complementaryProfiles?: string[];

  @ApiPropertyOptional({ type: [Number] })
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  branchAccessCodes?: number[];

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  cashierOnly?: boolean;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ description: "Login do sistema não pode ser trocado durante a edição" })
  @IsEmail()
  @IsOptional()
  email?: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({ description: "Define se o usuário permanece ativo" })
  @IsBoolean()
  active!: boolean;
}
