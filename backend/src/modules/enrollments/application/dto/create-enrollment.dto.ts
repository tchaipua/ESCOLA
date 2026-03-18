import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateEnrollmentDto {
  @ApiProperty({ description: "ID do (F-AL) Aluno" })
  @IsUUID()
  @IsNotEmpty()
  studentId!: string;

  @ApiProperty({ description: "ID do vínculo Série x Turma (ST)" })
  @IsUUID()
  @IsNotEmpty()
  seriesClassId!: string;

  @ApiPropertyOptional({
    description: "Status da Matrícula",
    enum: ["ATIVO", "TRANSFERIDO", "CANCELADO"],
  })
  @IsEnum(["ATIVO", "TRANSFERIDO", "CANCELADO"])
  @IsOptional()
  status?: "ATIVO" | "TRANSFERIDO" | "CANCELADO";
}
