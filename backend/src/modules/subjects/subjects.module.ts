import { Module } from "@nestjs/common";
import { SubjectsService } from "./application/services/subjects.service";
import { SubjectsController } from "./infrastructure/controllers/subjects.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [SubjectsController],
  providers: [SubjectsService],
  exports: [SubjectsService],
})
export class SubjectsModule {}
