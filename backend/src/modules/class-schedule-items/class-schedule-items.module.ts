import { Module } from "@nestjs/common";
import { ClassScheduleItemsService } from "./application/services/class-schedule-items.service";
import { ClassScheduleItemsController } from "./infrastructure/controllers/class-schedule-items.controller";

@Module({
  controllers: [ClassScheduleItemsController],
  providers: [ClassScheduleItemsService],
  exports: [ClassScheduleItemsService],
})
export class ClassScheduleItemsModule {}
