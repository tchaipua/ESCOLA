import { Module } from "@nestjs/common";
import { SchoolYearsService } from "./application/services/school-years.service";
import { SchoolYearsController } from "./infrastructure/controllers/school-years.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [SchoolYearsController],
  providers: [SchoolYearsService],
  exports: [SchoolYearsService],
})
export class SchoolYearsModule {}
