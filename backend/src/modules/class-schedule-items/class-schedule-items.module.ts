import { Module } from "@nestjs/common";
import { ClassScheduleItemsService } from "./application/services/class-schedule-items.service";
import { ClassScheduleItemsController } from "./infrastructure/controllers/class-schedule-items.controller";
import { LessonCalendarsModule } from "../lesson-calendars/lesson-calendars.module";

@Module({
  imports: [LessonCalendarsModule],
  controllers: [ClassScheduleItemsController],
  providers: [ClassScheduleItemsService],
  exports: [ClassScheduleItemsService],
})
export class ClassScheduleItemsModule {}
