import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CreateSubjectDto {
  @ApiPropertyOptional({
    description:
      "Filial do cadastro. Use 0 para comum a todas as filiais quando houver mais de uma.",
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  branchCode?: number;

  @ApiProperty({ description: "Nome da Matéria (Matemática, Inglês, Dança)" })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
