import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { LessonAttendancesService } from "./application/services/lesson-attendances.service";
import { LessonAttendancesController } from "./infrastructure/controllers/lesson-attendances.controller";

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [LessonAttendancesService],
  controllers: [LessonAttendancesController],
})
export class LessonAttendancesModule {}
