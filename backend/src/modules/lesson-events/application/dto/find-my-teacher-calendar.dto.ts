import { IsDateString, IsIn, IsOptional } from "class-validator";

export class FindMyTeacherCalendarDto {
  @IsOptional()
  @IsDateString()
  referenceDate?: string;

  @IsOptional()
  @IsIn(["MONTH", "WEEK", "DAY"])
  view?: "MONTH" | "WEEK" | "DAY";
}
