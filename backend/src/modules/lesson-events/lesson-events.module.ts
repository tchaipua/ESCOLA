import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { LessonEventsService } from "./application/services/lesson-events.service";
import { LessonEventsController } from "./infrastructure/controllers/lesson-events.controller";

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [LessonEventsService],
  controllers: [LessonEventsController],
})
export class LessonEventsModule {}
