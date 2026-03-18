import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsNumber, IsOptional } from "class-validator";

export class UpdateTeacherSubjectDto {
  @ApiPropertyOptional({
    description: "Novo valor da hora-aula acordado com este professor",
  })
  @IsNumber()
  @IsOptional()
  hourlyRate?: number;

  @ApiPropertyOptional({
    description:
      "Data a partir da qual o novo valor passa a valer, no formato AAAA-MM-DD",
  })
  @IsDateString()
  @IsOptional()
  effectiveFrom?: string;
}
