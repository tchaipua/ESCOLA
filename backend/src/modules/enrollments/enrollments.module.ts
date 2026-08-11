import { Module } from "@nestjs/common";
import { EnrollmentsService } from "./application/services/enrollments.service";
import { EnrollmentsController } from "./infrastructure/controllers/enrollments.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
