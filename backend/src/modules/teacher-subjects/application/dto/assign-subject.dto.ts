import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AssignSubjectDto {
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
