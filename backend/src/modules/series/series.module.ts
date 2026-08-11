import { Module } from "@nestjs/common";
import { SeriesService } from "./application/services/series.service";
import { SeriesController } from "./infrastructure/controllers/series.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [SeriesController],
  providers: [SeriesService],
  exports: [SeriesService],
})
export class SeriesModule {}
