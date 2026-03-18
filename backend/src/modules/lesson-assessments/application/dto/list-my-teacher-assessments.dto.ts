import { IsIn, IsOptional, IsString } from "class-validator";

const ASSESSMENT_LIST_STATUSES = ["ALL", "PENDING", "GRADED"] as const;

export class ListMyTeacherAssessmentsDto {
  @IsOptional()
  @IsString()
  @IsIn(ASSESSMENT_LIST_STATUSES)
  status?: "ALL" | "PENDING" | "GRADED";
}
