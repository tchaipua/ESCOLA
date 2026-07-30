import { Module } from "@nestjs/common";
import { TenantsController } from "./infrastructure/controllers/tenants.controller";
import { TenantsService } from "./application/services/tenants.service";
import { SharedProfilesModule } from "../shared-profiles/shared-profiles.module";
import { FinanceiroIntegrationController } from "./infrastructure/controllers/financeiro-integration.controller";
import { GlobalSettingsModule } from "../global-settings/global-settings.module";
import { FinanceiroModule } from "../../integrations/financeiro/financeiro.module";
import { CentralOperationalSummaryGuard } from "../../common/guards/central-operational-summary.guard";

@Module({
  imports: [SharedProfilesModule, GlobalSettingsModule, FinanceiroModule],
  controllers: [TenantsController, FinanceiroIntegrationController],
  providers: [TenantsService, CentralOperationalSummaryGuard],
  exports: [TenantsService],
})
export class TenantsModule {}
