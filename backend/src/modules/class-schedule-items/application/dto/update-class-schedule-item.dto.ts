import { PartialType } from "@nestjs/swagger";
import { CreateClassScheduleItemDto } from "./create-class-schedule-item.dto";

export class UpdateClassScheduleItemDto extends PartialType(
  CreateClassScheduleItemDto,
) {}
