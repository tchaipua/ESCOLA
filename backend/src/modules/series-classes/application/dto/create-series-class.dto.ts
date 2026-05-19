import { IsInt, IsNotEmpty, IsOptional, IsUUID, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CreateSeriesClassDto {
  @ApiPropertyOptional({
    description:
      "Filial do cadastro. Use 0 para comum a todas as filiais quando houver mais de uma.",
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  branchCode?: number;

  @ApiProperty({ description: "ID da série" })
  @IsUUID()
  @IsNotEmpty()
  seriesId!: string;

  @ApiProperty({ description: "ID da turma" })
  @IsUUID()
  @IsNotEmpty()
  classId!: string;
}
