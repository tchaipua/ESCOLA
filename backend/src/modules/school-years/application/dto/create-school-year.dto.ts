import {
  IsBoolean,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class SchoolYearPeriodDto {
  @ApiProperty({ description: "Tipo do periodo sem aula", example: "FERIAS" })
  @IsString()
  @IsNotEmpty()
  type!: string;

  @ApiProperty({ description: "Data inicial do periodo", example: "2026-07-01" })
  @IsDateString()
  @IsNotEmpty()
  startDate!: string;

  @ApiProperty({ description: "Data final do periodo", example: "2026-07-15" })
  @IsDateString()
  @IsNotEmpty()
  endDate!: string;

  @ApiPropertyOptional({ description: "Aplicacao do periodo", default: "TODAS AS TURMAS" })
  @IsString()
  @IsOptional()
  appliesTo?: string;
}

export class CreateSchoolYearDto {
  @ApiPropertyOptional({
    description:
      "Filial do cadastro. Use 0 para comum a todas as filiais quando houver mais de uma.",
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  branchCode?: number;

  @ApiProperty({ description: "O Ano Letivo vigente (Ex: 2026)" })
  @IsInt()
  @Min(2000)
  @IsNotEmpty()
  year!: number;

  @ApiProperty({ description: "Data oficial de Início (ISO 8601)" })
  @IsDateString()
  @IsNotEmpty()
  startDate!: string;

  @ApiProperty({ description: "Data oficial de Encerramento (ISO 8601)" })
  @IsDateString()
  @IsNotEmpty()
  endDate!: string;

  @ApiPropertyOptional({
    description: "Define qual é o Ano Letivo default ativo na base",
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: "Indica se ha aula na segunda-feira", default: true })
  @IsBoolean()
  @IsOptional()
  monday?: boolean;

  @ApiPropertyOptional({ description: "Indica se ha aula na terca-feira", default: true })
  @IsBoolean()
  @IsOptional()
  tuesday?: boolean;

  @ApiPropertyOptional({ description: "Indica se ha aula na quarta-feira", default: true })
  @IsBoolean()
  @IsOptional()
  wednesday?: boolean;

  @ApiPropertyOptional({ description: "Indica se ha aula na quinta-feira", default: true })
  @IsBoolean()
  @IsOptional()
  thursday?: boolean;

  @ApiPropertyOptional({ description: "Indica se ha aula na sexta-feira", default: true })
  @IsBoolean()
  @IsOptional()
  friday?: boolean;

  @ApiPropertyOptional({ description: "Indica se ha aula no sabado", default: false })
  @IsBoolean()
  @IsOptional()
  saturday?: boolean;

  @ApiPropertyOptional({ description: "Indica se ha aula no domingo", default: false })
  @IsBoolean()
  @IsOptional()
  sunday?: boolean;

  @ApiPropertyOptional({ description: "Periodos sem aula do ano letivo", type: [SchoolYearPeriodDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchoolYearPeriodDto)
  @IsOptional()
  periods?: SchoolYearPeriodDto[];
}
