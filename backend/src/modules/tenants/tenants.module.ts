import { Module } from "@nestjs/common";
import { TenantsController } from "./infrastructure/controllers/tenants.controller";
import { TenantsService } from "./application/services/tenants.service";
import { SharedProfilesModule } from "../shared-profiles/shared-profiles.module";
import { FinanceiroIntegrationController } from "./infrastructure/controllers/financeiro-integration.controller";
import { GlobalSettingsModule } from "../global-settings/global-settings.module";

@Module({
  imports: [SharedProfilesModule, GlobalSettingsModule],
  controllers: [TenantsController, FinanceiroIntegrationController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
