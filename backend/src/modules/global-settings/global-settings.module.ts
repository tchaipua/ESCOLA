import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { GlobalSettingsService } from "./application/services/global-settings.service";
import { GlobalSettingsController } from "./infrastructure/controllers/global-settings.controller";
import { MsInforCentralModule } from "../../integrations/msinfor-central/msinfor-central.module";

@Module({
  imports: [PrismaModule, MsInforCentralModule],
  controllers: [GlobalSettingsController],
  providers: [GlobalSettingsService],
  exports: [GlobalSettingsService, MsInforCentralModule],
})
export class GlobalSettingsModule {}
