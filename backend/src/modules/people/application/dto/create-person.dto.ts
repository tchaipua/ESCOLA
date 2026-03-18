import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { PersonRoleDto } from "./person-role.dto";

export class CreatePersonDto {
  @ApiProperty({ description: "Nome principal da pessoa" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  rg?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  cpf?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  cnpj?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  nickname?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  corporateName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  whatsapp?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  cellphone1?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  cellphone2?: string;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(4)
  @IsOptional()
  password?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  zipCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  street?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  number?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  neighborhood?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  complement?: string;

  @ApiPropertyOptional({
    description: "Papéis que esta pessoa já deve receber no momento do cadastro",
    type: [PersonRoleDto],
  })
  @IsArray()
  @ArrayUnique((item: PersonRoleDto) => item.role)
  @ValidateNested({ each: true })
  @Type(() => PersonRoleDto)
  @IsOptional()
  roles?: PersonRoleDto[];
}
