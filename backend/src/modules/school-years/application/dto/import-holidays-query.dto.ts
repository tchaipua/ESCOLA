import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

const CURRENT_YEAR = new Date().getFullYear();

export class ImportHolidaysQueryDto {
  @ApiProperty({ description: "Ano de referencia dos feriados.", example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(CURRENT_YEAR + 1)
  year!: number;
}
