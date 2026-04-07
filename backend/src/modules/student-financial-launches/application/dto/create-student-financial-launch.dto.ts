import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

export class CreateStudentFinancialLaunchDto {
  @ApiProperty({
    description: "Escopo do lançamento",
    enum: ["ALL", "SERIES", "SERIES_CLASS"],
  })
  @IsString()
  @IsIn(["ALL", "SERIES", "SERIES_CLASS"])
  scope!: "ALL" | "SERIES" | "SERIES_CLASS";

  @ApiProperty({
    description: "Tipo do lançamento",
    enum: ["MENSALIDADE", "MATERIAL_ESCOLAR", "FORMATURA", "EXTRA"],
  })
  @IsString()
  @IsIn(["MENSALIDADE", "MATERIAL_ESCOLAR", "FORMATURA", "EXTRA"])
  launchType!: "MENSALIDADE" | "MATERIAL_ESCOLAR" | "FORMATURA" | "EXTRA";

  @ApiProperty({
    description: "Competência de referência no formato YYYY-MM",
    example: "2026-04",
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  referenceMonth!: string;

  @ApiProperty({
    description: "Quantidade de parcelas por aluno/pagador",
    minimum: 1,
    maximum: 24,
  })
  @IsInt()
  @Min(1)
  @Max(24)
  installmentCount!: number;

  @ApiProperty({
    description: "Primeiro vencimento do lançamento",
    example: "2026-04-10",
  })
  @IsDateString()
  firstDueDate!: string;

  @ApiPropertyOptional({ description: "Série selecionada para o filtro" })
  @IsString()
  @IsOptional()
  seriesId?: string;

  @ApiPropertyOptional({
    description: "Vínculo série x turma selecionado para o filtro",
  })
  @IsString()
  @IsOptional()
  seriesClassId?: string;
}
