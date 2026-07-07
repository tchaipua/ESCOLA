import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

const CURRENT_YEAR = new Date().getFullYear();
const HOLIDAY_TYPES = [
  "NACIONAL",
  "ESTADUAL",
  "MUNICIPAL",
  "FACULTATIVO",
  "ESCOLA",
] as const;

export class SyncSchoolHolidayItemDto {
  @ApiProperty({ example: "2026-01-01" })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty({ example: "CONFRATERNIZACAO MUNDIAL" })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: HOLIDAY_TYPES, example: "NACIONAL" })
  @IsIn(HOLIDAY_TYPES)
  type!: (typeof HOLIDAY_TYPES)[number];

  @ApiPropertyOptional({ example: "TODAS AS TURMAS" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  appliesTo?: string;

  @ApiPropertyOptional({ example: "BRASIL_API" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;
}

export class SyncSchoolHolidaysDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(CURRENT_YEAR + 1)
  year!: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  branchCode?: number;

  @ApiProperty({ type: [SyncSchoolHolidayItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncSchoolHolidayItemDto)
  holidays!: SyncSchoolHolidayItemDto[];
}
