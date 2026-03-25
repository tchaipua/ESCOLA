import { PartialType, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, Matches } from "class-validator";
import { CreateClassScheduleItemDto } from "./create-class-schedule-item.dto";

export class UpdateClassScheduleItemDto extends PartialType(
  CreateClassScheduleItemDto,
) {
  @ApiPropertyOptional({
    description:
      "Data base para refletir a alteração na grade anual gerada (AAAA-MM-DD)",
    example: "2026-03-25",
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Informe a data base no formato AAAA-MM-DD.",
  })
  effectiveFromDate?: string;
}
