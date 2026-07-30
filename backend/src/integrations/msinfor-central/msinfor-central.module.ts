import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { CentralTenantConfigurationService } from "./central-tenant-configuration.service";
import { MsInforCentralSettingsClient } from "./msinfor-central-settings.client";
import { CentralIdentityProvisioningService } from "./central-identity-provisioning.service";

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    MsInforCentralSettingsClient,
    CentralTenantConfigurationService,
    CentralIdentityProvisioningService,
  ],
  exports: [
    MsInforCentralSettingsClient,
    CentralTenantConfigurationService,
    CentralIdentityProvisioningService,
  ],
})
export class MsInforCentralModule {}
