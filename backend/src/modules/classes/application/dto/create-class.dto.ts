import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class CreateClassDto {
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
