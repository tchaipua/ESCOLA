import { Module } from "@nestjs/common";
import { StudentsService } from "./application/services/students.service";
import { StudentsController } from "./infrastructure/controllers/students.controller";
import { SharedProfilesModule } from "../shared-profiles/shared-profiles.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [SharedProfilesModule, NotificationsModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
