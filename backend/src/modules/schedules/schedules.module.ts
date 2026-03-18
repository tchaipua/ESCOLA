import { Module } from "@nestjs/common";
import { SchedulesService } from "./application/services/schedules.service";
import { SchedulesController } from "./infrastructure/controllers/schedules.controller";

@Module({
  controllers: [SchedulesController],
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
