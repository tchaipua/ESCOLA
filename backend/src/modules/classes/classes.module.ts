import { Module } from "@nestjs/common";
import { ClassesService } from "./application/services/classes.service";
import { ClassesController } from "./infrastructure/controllers/classes.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [ClassesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
