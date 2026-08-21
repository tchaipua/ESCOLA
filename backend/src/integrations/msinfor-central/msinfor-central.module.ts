import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { CentralTenantConfigurationService } from "./central-tenant-configuration.service";
import { MsInforCentralSettingsClient } from "./msinfor-central-settings.client";
import { CentralIdentityProvisioningService } from "./central-identity-provisioning.service";
import { CentralRecoveryController } from "./central-recovery.controller";
import { ServiceSupervisorClient } from "../financeiro/service-supervisor.client";

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [CentralRecoveryController],
  providers: [
    MsInforCentralSettingsClient,
    CentralTenantConfigurationService,
    CentralIdentityProvisioningService,
    ServiceSupervisorClient,
  ],
  exports: [
    MsInforCentralSettingsClient,
    CentralTenantConfigurationService,
    CentralIdentityProvisioningService,
  ],
})
export class MsInforCentralModule {}
