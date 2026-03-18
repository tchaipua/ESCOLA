import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class UpdateLessonEventDto {
  @IsOptional()
  @IsString()
  @IsIn(["PROVA", "TRABALHO", "RECADO", "FALTA_PROFESSOR"])
  eventType?: string;

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
