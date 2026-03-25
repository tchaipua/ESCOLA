import { IsDateString, IsOptional } from "class-validator";

export class FindSchoolCalendarEventsDto {
  @IsOptional()
  @IsDateString()
  referenceDate?: string;
}
