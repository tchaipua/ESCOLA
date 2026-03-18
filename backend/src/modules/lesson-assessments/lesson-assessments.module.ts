import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { LessonAssessmentsService } from "./application/services/lesson-assessments.service";
import { LessonAssessmentsController } from "./infrastructure/controllers/lesson-assessments.controller";

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [LessonAssessmentsService],
  controllers: [LessonAssessmentsController],
})
export class LessonAssessmentsModule {}
