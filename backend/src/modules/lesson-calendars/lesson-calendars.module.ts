import { Module } from "@nestjs/common";
import { LessonCalendarsService } from "./application/services/lesson-calendars.service";
import { LessonCalendarsController } from "./infrastructure/controllers/lesson-calendars.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [LessonCalendarsController],
  providers: [LessonCalendarsService],
  exports: [LessonCalendarsService],
})
export class LessonCalendarsModule {}
