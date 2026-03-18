import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsUUID } from "class-validator";

export class LessonCalendarWeeklySourceQueryDto {
  @ApiProperty()
  @IsUUID("4", { message: "Selecione um ano letivo válido." })
  @IsNotEmpty({ message: "Selecione o ano letivo." })
  schoolYearId!: string;

  @ApiProperty()
  @IsUUID("4", { message: "Selecione uma turma válida." })
  @IsNotEmpty({ message: "Selecione a turma." })
  seriesClassId!: string;
}
