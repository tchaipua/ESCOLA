import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

const LESSON_CALENDAR_PERIOD_TYPES = ["AULA", "INTERVALO"] as const;

export class CreateLessonCalendarPeriodDto {
  @ApiProperty({ enum: LESSON_CALENDAR_PERIOD_TYPES })
  @IsString()
  @IsIn(LESSON_CALENDAR_PERIOD_TYPES, {
    message: "Selecione um tipo de período válido: aula ou intervalo.",
  })
  @IsNotEmpty({ message: "Selecione o tipo do período." })
  periodType!: string;

  @ApiProperty({ example: "2026-02-02" })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Informe a data inicial no formato AAAA-MM-DD.",
  })
  startDate!: string;

  @ApiProperty({ example: "2026-06-30" })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Informe a data final no formato AAAA-MM-DD.",
  })
  endDate!: string;
}

export class CreateLessonCalendarDto {
  @ApiProperty({ description: "Ano letivo do calendário anual" })
  @IsUUID("4", { message: "Selecione um ano letivo válido." })
  @IsNotEmpty({ message: "Selecione o ano letivo." })
  schoolYearId!: string;

  @ApiProperty({ description: "Turma da grade anual" })
  @IsUUID("4", { message: "Selecione uma turma válida." })
  @IsNotEmpty({ message: "Selecione a turma." })
  seriesClassId!: string;

  @ApiProperty({ type: [CreateLessonCalendarPeriodDto] })
  @IsArray({ message: "Informe os períodos da grade anual." })
  @ArrayMinSize(1, {
    message: "Adicione pelo menos um período na grade anual.",
  })
  @ValidateNested({ each: true })
  @Type(() => CreateLessonCalendarPeriodDto)
  periods!: CreateLessonCalendarPeriodDto[];
}

export { LESSON_CALENDAR_PERIOD_TYPES };
