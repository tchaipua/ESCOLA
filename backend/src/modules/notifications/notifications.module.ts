import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { NotificationsService } from "./application/services/notifications.service";
import { NotificationsController } from "./infrastructure/controllers/notifications.controller";
import { NotificationChatService } from "./application/services/notification-chat.service";

@Module({
  imports: [PrismaModule],
  providers: [NotificationsService, NotificationChatService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
