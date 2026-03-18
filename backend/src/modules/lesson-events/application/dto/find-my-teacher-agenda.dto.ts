import { IsDateString, IsOptional } from "class-validator";

export class FindMyTeacherAgendaDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}
