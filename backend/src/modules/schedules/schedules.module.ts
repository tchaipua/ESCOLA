import { Module } from "@nestjs/common";
import { SchedulesService } from "./application/services/schedules.service";
import { SchedulesController } from "./infrastructure/controllers/schedules.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [SchedulesController],
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
