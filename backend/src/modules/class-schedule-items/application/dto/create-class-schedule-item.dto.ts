import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

const DAY_OF_WEEK_VALUES = [
  "SEGUNDA",
  "TERCA",
  "QUARTA",
  "QUINTA",
  "SEXTA",
  "SABADO",
  "DOMINGO",
] as const;

export class CreateClassScheduleItemDto {
  @ApiProperty({ description: "Ano letivo da grade planejada" })
  @IsUUID("4", { message: "Selecione um ano letivo válido." })
  @IsNotEmpty({ message: "Selecione o ano letivo." })
  schoolYearId!: string;

  @ApiProperty({ description: "Turma + série da aula planejada" })
  @IsUUID("4", { message: "Selecione uma turma válida." })
  @IsNotEmpty({ message: "Selecione a turma." })
  seriesClassId!: string;

  @ApiProperty({
    description: "Dia da semana da aula planejada",
    enum: DAY_OF_WEEK_VALUES,
  })
  @IsString()
  @IsIn(DAY_OF_WEEK_VALUES, {
    message: "Selecione um dia da semana válido entre segunda e domingo.",
  })
  @IsNotEmpty({ message: "Selecione o dia da semana." })
  dayOfWeek!: string;

  @ApiProperty({ description: "Vínculo professor x matéria da aula" })
  @IsOptional()
  @IsUUID("4", {
    message: "Selecione um vínculo válido de professor e matéria.",
  })
  teacherSubjectId?: string | null;

  @ApiProperty({ description: "Horário inicial da aula", example: "07:00" })
  @IsString()
  @IsNotEmpty({ message: "Informe o horário inicial." })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: "Informe o horário inicial no formato HH:mm.",
  })
  startTime!: string;

  @ApiProperty({ description: "Horário final da aula", example: "07:50" })
  @IsString()
  @IsNotEmpty({ message: "Informe o horário final." })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: "Informe o horário final no formato HH:mm.",
  })
  endTime!: string;
}

export const CLASS_SCHEDULE_DAY_OF_WEEK_VALUES = DAY_OF_WEEK_VALUES;
