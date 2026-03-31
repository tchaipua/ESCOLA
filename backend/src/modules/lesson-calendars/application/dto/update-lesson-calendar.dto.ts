import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

const LESSON_CALENDAR_PERIOD_TYPES = ["AULA", "INTERVALO"] as const;

export class UpdateLessonCalendarPeriodDto {
  @ApiPropertyOptional({ enum: LESSON_CALENDAR_PERIOD_TYPES })
  @IsOptional()
  @IsString()
  @IsIn(LESSON_CALENDAR_PERIOD_TYPES, {
    message: "Selecione um tipo de período válido: aula ou intervalo.",
  })
  periodType?: string;

  @ApiPropertyOptional({ example: "2026-02-02" })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Informe a data inicial no formato AAAA-MM-DD.",
  })
  startDate?: string;

  @ApiPropertyOptional({ example: "2026-06-30" })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Informe a data final no formato AAAA-MM-DD.",
  })
  endDate?: string;
}

export class UpdateLessonCalendarDto {
  @ApiPropertyOptional({ description: "Ano letivo do calendário anual" })
  @IsOptional()
  @IsUUID("4", { message: "Selecione um ano letivo válido." })
  schoolYearId?: string;

  @ApiPropertyOptional({ description: "Turma da grade anual" })
  @IsOptional()
  @IsUUID("4", { message: "Selecione uma turma válida." })
  seriesClassId?: string;

  @ApiPropertyOptional({ type: [UpdateLessonCalendarPeriodDto] })
  @IsOptional()
  @IsArray({ message: "Informe os períodos da grade anual." })
  @ArrayMinSize(1, {
    message: "Adicione pelo menos um período na grade anual.",
  })
  @ValidateNested({ each: true })
  @Type(() => UpdateLessonCalendarPeriodDto)
  periods?: UpdateLessonCalendarPeriodDto[];
}
