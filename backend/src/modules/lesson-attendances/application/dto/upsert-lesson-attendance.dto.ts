import {
  ArrayMinSize,
  IsBoolean,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class UpsertLessonAttendanceItemDto {
  @IsUUID()
  studentId!: string;

  @IsIn(["PRESENTE", "FALTOU"])
  status!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpsertLessonAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpsertLessonAttendanceItemDto)
  attendances!: UpsertLessonAttendanceItemDto[];

  @IsOptional()
  @IsBoolean()
  notifyStudents?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyGuardians?: boolean;
}
