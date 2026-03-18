import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class UpsertLessonAssessmentGradeDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsString()
  score?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class UpsertLessonAssessmentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  maxScore?: string;

  @IsOptional()
  @IsBoolean()
  notifyStudents?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyGuardians?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyByEmail?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpsertLessonAssessmentGradeDto)
  grades!: UpsertLessonAssessmentGradeDto[];
}
