import { Module } from "@nestjs/common";
import { TeachersService } from "./application/services/teachers.service";
import { TeachersController } from "./infrastructure/controllers/teachers.controller";
import { SharedProfilesModule } from "../shared-profiles/shared-profiles.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [SharedProfilesModule, NotificationsModule],
  controllers: [TeachersController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
