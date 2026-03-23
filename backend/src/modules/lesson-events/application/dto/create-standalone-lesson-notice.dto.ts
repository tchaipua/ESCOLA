import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateStandaloneLessonNoticeDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  eventDate!: string;

  @IsUUID()
  schoolYearId!: string;

  @IsUUID()
  seriesClassId!: string;

  @IsUUID()
  teacherSubjectId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  notifyStudents?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyGuardians?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyByEmail?: boolean;
}
