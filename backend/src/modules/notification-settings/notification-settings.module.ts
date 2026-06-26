import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { SharedProfilesModule } from "../shared-profiles/shared-profiles.module";
import { GlobalSettingsModule } from "../global-settings/global-settings.module";
import { NotificationSettingsService } from "./application/services/notification-settings.service";
import { NotificationSettingsController } from "./infrastructure/controllers/notification-settings.controller";

@Module({
  imports: [PrismaModule, SharedProfilesModule, GlobalSettingsModule],
  providers: [NotificationSettingsService],
  controllers: [NotificationSettingsController],
})
export class NotificationSettingsModule {}
