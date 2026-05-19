import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class AssignSubjectDto {
  @ApiPropertyOptional({
    description:
      "Filial do vínculo. Use 0 para comum a todas as filiais quando houver mais de uma.",
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  branchCode?: number;

  @ApiProperty({ description: "ID do (MA) Matéria" })
  @IsUUID()
  @IsNotEmpty()
  subjectId!: string;

  @ApiPropertyOptional({
    description: "Valor hora-aula acordado com este professor",
  })
  @IsNumber()
  @IsOptional()
  hourlyRate?: number;

  @ApiPropertyOptional({
    description:
      "Data de vigência inicial do valor hora-aula no formato AAAA-MM-DD",
  })
  @IsDateString()
  @IsOptional()
  effectiveFrom?: string;
}
