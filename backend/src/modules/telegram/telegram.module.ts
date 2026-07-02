import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { TelegramService } from "./application/services/telegram.service";
import { TelegramController } from "./infrastructure/controllers/telegram.controller";

@Module({
  imports: [PrismaModule],
  providers: [TelegramService],
  controllers: [TelegramController],
})
export class TelegramModule {}
