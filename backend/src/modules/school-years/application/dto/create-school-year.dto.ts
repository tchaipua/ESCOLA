import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

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
}
