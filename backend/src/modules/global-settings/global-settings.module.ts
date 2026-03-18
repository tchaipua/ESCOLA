import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { GlobalSettingsService } from "./application/services/global-settings.service";
import { GlobalSettingsController } from "./infrastructure/controllers/global-settings.controller";

@Module({
  imports: [PrismaModule],
  controllers: [GlobalSettingsController],
  providers: [GlobalSettingsService],
  exports: [GlobalSettingsService],
})
export class GlobalSettingsModule {}
