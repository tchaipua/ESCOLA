import { Module } from "@nestjs/common";
import { TeacherSubjectsService } from "./application/services/teacher-subjects.service";
import { TeacherSubjectsController } from "./infrastructure/controllers/teacher-subjects.controller";
import { TeacherSubjectsReadController } from "./infrastructure/controllers/teacher-subjects-read.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [TeacherSubjectsController, TeacherSubjectsReadController],
  providers: [TeacherSubjectsService],
  exports: [TeacherSubjectsService],
})
export class TeacherSubjectsModule {}
