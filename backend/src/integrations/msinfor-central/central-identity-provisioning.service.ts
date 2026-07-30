import { Injectable } from "@nestjs/common";
import { CentralTenantConfigurationService } from "./central-tenant-configuration.service";
import { MsInforCentralSettingsClient } from "./msinfor-central-settings.client";

@Injectable()
export class CentralIdentityProvisioningService {
  constructor(
    private readonly configurations: CentralTenantConfigurationService,
    private readonly client: MsInforCentralSettingsClient,
  ) {}

  async synchronize(input: {
    tenantId: string;
    login: string;
    email: string;
    displayName: string;
    credential: string;
    branchCodes: number[];
    roleCode: string;
  }) {
    const configuration = await this.configurations.findConfiguration(input.tenantId);
    return this.client.synchronizeTechnicalIdentity({
      login: input.login,
      email: input.email,
      displayName: input.displayName,
      credential: input.credential,
      tenantId: configuration.tenant.id,
      branchCodes: input.branchCodes,
      roleCode: input.roleCode,
      enabled: true,
    });
  }
}
