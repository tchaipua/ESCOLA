import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsUUID } from "class-validator";

export class UpdateLessonCalendarItemDto {
  @ApiProperty({
    description: "Novo vínculo de professor x matéria para a aula selecionada",
  })
  @IsUUID("4", {
    message: "Selecione um vínculo válido de professor e matéria.",
  })
  @IsNotEmpty({ message: "Selecione o professor e a matéria da aula." })
  teacherSubjectId!: string;
}
