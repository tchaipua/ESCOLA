import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CreateClassDto {
  @ApiPropertyOptional({
    description:
      "Filial do cadastro. Use 0 para comum a todas as filiais quando houver mais de uma.",
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  branchCode?: number;

  @ApiProperty({ description: "Nome da Turma (Ex: Turma A, 101, Especial)" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: "Turnos de aula separados por vírgula (Ex: MANHA,TARDE)",
  })
  @IsString()
  @IsNotEmpty()
  shift!: string;

  @ApiPropertyOptional({
    description: "Valor padrão da mensalidade para alunos desta turma",
  })
  @IsNumber()
  @IsOptional()
  defaultMonthlyFee?: number | null;
}
