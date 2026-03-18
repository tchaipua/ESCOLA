import { Module } from "@nestjs/common";
import { SeriesClassesService } from "./application/services/series-classes.service";
import { SeriesClassesController } from "./infrastructure/controllers/series-classes.controller";

@Module({
  controllers: [SeriesClassesController],
  providers: [SeriesClassesService],
  exports: [SeriesClassesService],
})
export class SeriesClassesModule {}
