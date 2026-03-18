import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

export class AssignStudentSeriesClassDto {
  @ApiPropertyOptional({
    description:
      "ID do vínculo Série x Turma que será atribuído ao aluno. Envie null/vazio para limpar.",
  })
  @IsUUID()
  @IsOptional()
  seriesClassId?: string | null;
}
