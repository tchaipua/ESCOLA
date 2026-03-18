import { Module } from "@nestjs/common";
import { SeriesService } from "./application/services/series.service";
import { SeriesController } from "./infrastructure/controllers/series.controller";

@Module({
  controllers: [SeriesController],
  providers: [SeriesService],
  exports: [SeriesService],
})
export class SeriesModule {}
