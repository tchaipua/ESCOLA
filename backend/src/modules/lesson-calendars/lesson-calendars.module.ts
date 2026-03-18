import { Module } from "@nestjs/common";
import { LessonCalendarsService } from "./application/services/lesson-calendars.service";
import { LessonCalendarsController } from "./infrastructure/controllers/lesson-calendars.controller";

@Module({
  controllers: [LessonCalendarsController],
  providers: [LessonCalendarsService],
})
export class LessonCalendarsModule {}
