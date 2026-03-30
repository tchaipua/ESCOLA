import { IsOptional, IsUUID } from "class-validator";

export class ListTeacherGradeHistoryDto {
  @IsOptional()
  @IsUUID()
  schoolYearId?: string;

  @IsOptional()
  @IsUUID()
  teacherSubjectId?: string;

  @IsOptional()
  @IsUUID()
  seriesClassId?: string;
}
